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

async function requestReset(baseUrl, email) {
  const response = await fetch(`${baseUrl}/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

test('Password reset request does not enumerate unknown or inactive accounts and creates no usable token', { skip: !databaseUrl || !jwtSecret }, async () => {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  const inactiveUserId = randomUUID();
  const inactiveEmail = `inactive-reset-${inactiveUserId}@example.test`;
  const unknownEmail = `unknown-reset-${randomUUID()}@example.test`;
  const passwordHash = await bcrypt.hash('InactivePassword!123', 12);
  const port = 3421;
  const baseUrl = `http://127.0.0.1:${port}`;

  await db.query(
    'insert into users(id,email,password_hash,is_active,is_superadmin) values ($1,$2,$3,false,false)',
    [inactiveUserId, inactiveEmail, passwordHash],
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(baseUrl, child);

    const malformed = await requestReset(baseUrl, 'not-an-email');
    const unknown = await requestReset(baseUrl, unknownEmail);
    const inactive = await requestReset(baseUrl, inactiveEmail);

    for (const result of [malformed, unknown, inactive]) {
      assert.equal(result.status, 202, 'reset request must always return accepted for non-eligible identities');
      assert.deepEqual(result.body, { ok: true }, 'response body must not reveal account existence or state');
    }

    const inactiveTokens = await db.query(
      'select count(*)::int as count from password_reset_tokens where user_id=$1',
      [inactiveUserId],
    );
    assert.equal(inactiveTokens.rows[0].count, 0, 'inactive account must not receive a reset token');

    const unknownUsers = await db.query('select count(*)::int as count from users where email=$1', [unknownEmail]);
    assert.equal(unknownUsers.rows[0].count, 0, 'test identity must remain unknown');

    const inactiveAudit = await db.query(
      "select count(*)::int as count from audit_logs where user_id=$1 and event='user.password_reset_requested'",
      [inactiveUserId],
    );
    assert.equal(inactiveAudit.rows[0].count, 0, 'ineligible request must not create a misleading delivery audit event');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await db.query('delete from users where id=$1', [inactiveUserId]).catch(() => {});
    await db.end();
  }
});
