import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { issuePasswordResetToken } from '../src/passwordRecovery.js';

const { Client } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;

async function connectClient() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

test('concurrent password reset requests leave exactly one active token', { skip: !databaseUrl }, async () => {
  const admin = await connectClient();
  const a = await connectClient();
  const b = await connectClient();

  const userId = randomUUID();
  const email = `reset-race-${userId}@example.test`;
  const passwordHash = await bcrypt.hash('RacePassword!123', 12);

  try {
    await admin.query(
      'insert into users(id,email,password_hash,is_superadmin) values ($1,$2,$3,false)',
      [userId, email, passwordHash],
    );

    const attempts = await Promise.allSettled([
      issuePasswordResetToken({ query: a.query.bind(a), userId, cooldownSeconds: 30 }),
      issuePasswordResetToken({ query: b.query.bind(b), userId, cooldownSeconds: 30 }),
    ]);

    const fulfilled = attempts.filter(result => result.status === 'fulfilled');
    const rejected = attempts.filter(result => result.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'exactly one concurrent request must issue a token');
    assert.equal(rejected.length, 1, 'the competing request must be blocked by cooldown');
    assert.equal(rejected[0].reason?.code, 'PASSWORD_RESET_COOLDOWN');

    const rows = await admin.query(
      `select count(*)::int as total,
              count(*) filter (where used_at is null and expires_at > now())::int as active
         from password_reset_tokens
        where user_id=$1`,
      [userId],
    );

    assert.equal(rows.rows[0].total, 1, 'the race must persist only one token row');
    assert.equal(rows.rows[0].active, 1, 'the race must leave exactly one usable token');
  } finally {
    await Promise.allSettled([a.end(), b.end(), admin.end()]);
  }
});
