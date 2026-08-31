import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { withTransaction } from '../src/db.js';
import { issuePasswordResetToken, consumePasswordResetToken, hashResetToken } from '../src/passwordRecovery.js';

const { Client } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;

async function connectClient() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

test('password reset transaction rollback preserves password and token usability when a downstream write fails', { skip: !databaseUrl }, async () => {
  const admin = await connectClient();
  const userId = randomUUID();
  const email = `reset-atomicity-${userId}@example.test`;
  const originalPasswordHash = await bcrypt.hash('OriginalPassword!123', 12);
  const nextPasswordHash = await bcrypt.hash('NextPassword!456', 12);

  try {
    await admin.query(
      'insert into users(id,email,password_hash,is_superadmin) values ($1,$2,$3,false)',
      [userId, email, originalPasswordHash],
    );

    const issued = await issuePasswordResetToken({
      query: admin.query.bind(admin),
      userId,
      cooldownSeconds: 30,
    });

    await assert.rejects(
      withTransaction(async transactionQuery => {
        const consumed = await consumePasswordResetToken({
          query: transactionQuery,
          userId,
          token: issued.token,
        });
        assert.equal(consumed, true, 'token must be consumed inside the transaction before the forced failure');

        await transactionQuery(
          'update users set password_hash=$1,updated_at=now() where id=$2',
          [nextPasswordHash, userId],
        );

        await transactionQuery('select 1/0');
      }),
      /division by zero/i,
    );

    const user = await admin.query('select password_hash from users where id=$1', [userId]);
    assert.equal(user.rows[0].password_hash, originalPasswordHash, 'password update must roll back');

    const token = await admin.query(
      `select used_at, expires_at > now() as active
         from password_reset_tokens
        where user_id=$1 and token_hash=$2`,
      [userId, hashResetToken(issued.token)],
    );
    assert.equal(token.rows.length, 1);
    assert.equal(token.rows[0].used_at, null, 'token consumption must roll back');
    assert.equal(token.rows[0].active, true, 'token must remain usable after rollback');
  } finally {
    await admin.query('delete from users where id=$1', [userId]).catch(() => {});
    await admin.end();
  }
});
