import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Client } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not become healthy');
}

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('failed password-recovery delivery returns generic response and revokes the fresh token', { skip: !databaseUrl || !jwtSecret }, async () => {
  const adminDb = new Client({ connectionString: databaseUrl });
  await adminDb.connect();

  const userId = randomUUID();
  const userEmail = `delivery-failure-${userId}@example.test`;
  const passwordHash = await bcrypt.hash('OldPassword!123', 12);
  const port = 3419;
  const baseUrl = `http://127.0.0.1:${port}`;

  await adminDb.query(
    'insert into users(id,email,password_hash,is_superadmin) values ($1,$2,$3,false)',
    [userId, userEmail, passwordHash],
  );

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: jwtSecret,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || jwtSecret,
      RESEND_API_KEY: '',
      MAIL_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(baseUrl, child);

    const response = await postJson(baseUrl, '/auth/request-password-reset', { email: userEmail });
    assert.equal(response.status, 202, 'provider failure must not reveal account or delivery state');
    assert.deepEqual(await response.json(), { ok: true }, 'response must remain generic');

    const tokenRows = await adminDb.query(
      'select token_hash, used_at, expires_at from password_reset_tokens where user_id=$1 order by created_at desc',
      [userId],
    );
    assert.equal(tokenRows.rows.length, 1, 'exactly one reset token should be issued for the request');
    assert.ok(tokenRows.rows[0].token_hash, 'only the reset-token hash must be persisted');
    assert.ok(tokenRows.rows[0].used_at, 'failed delivery must revoke the freshly issued token');
    assert.ok(tokenRows.rows[0].expires_at, 'issued token must retain an expiry timestamp for auditability');

    const activeTokens = await adminDb.query(
      'select count(*)::int as count from password_reset_tokens where user_id=$1 and used_at is null',
      [userId],
    );
    assert.equal(activeTokens.rows[0].count, 0, 'no usable reset token may survive failed delivery');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await adminDb.query('delete from users where id=$1', [userId]).catch(() => {});
    await adminDb.end();
  }
});
