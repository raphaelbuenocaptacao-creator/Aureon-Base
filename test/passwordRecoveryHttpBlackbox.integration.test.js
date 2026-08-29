import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const { Client } = pg;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

function accessToken(userId, email) {
  return jwt.sign(
    { sub: userId, email, type: 'access' },
    jwtSecret,
    {
      expiresIn: '5m',
      issuer: 'aureon-base',
      audience: 'aureon-apps',
      algorithm: 'HS256',
      jwtid: randomUUID(),
    },
  );
}

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

async function postJson(baseUrl, path, body, token = null) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('Password recovery HTTP black-box enforces expiration, revocation, one-time use and session invalidation', { skip: !databaseUrl || !jwtSecret }, async () => {
  const adminDb = new Client({ connectionString: databaseUrl });
  await adminDb.connect();

  const adminId = randomUUID();
  const userId = randomUUID();
  const adminEmail = `reset-admin-${adminId}@example.test`;
  const userEmail = `reset-user-${userId}@example.test`;
  const oldPassword = 'OldPassword!123';
  const newPassword = 'NewPassword!456';
  const oldHash = await bcrypt.hash(oldPassword, 12);
  const sessionId = randomUUID();
  const expiredToken = randomBytes(32).toString('base64url');
  const port = 3418;
  const baseUrl = `http://127.0.0.1:${port}`;

  await adminDb.query(
    "insert into users(id,email,password_hash,is_superadmin) values ($1,$2,'x',true),($3,$4,$5,false)",
    [adminId, adminEmail, userId, userEmail, oldHash],
  );
  await adminDb.query(
    "insert into password_reset_tokens(user_id,token_hash,created_at,expires_at) values($1,$2,now()-interval '20 minutes',now()-interval '10 minutes')",
    [userId, sha256(expiredToken)],
  );
  await adminDb.query(
    "insert into sessions(id,user_id,refresh_token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
    [sessionId, userId, sha256('discardable-refresh-token')],
  );

  const adminToken = accessToken(adminId, adminEmail);
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: jwtSecret,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || jwtSecret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(baseUrl, child);

    let response = await postJson(baseUrl, '/auth/reset-password', {
      email: userEmail,
      token: expiredToken,
      new_password: newPassword,
    });
    assert.equal(response.status, 401, 'expired token must be rejected');

    response = await postJson(baseUrl, `/admin/users/${userId}/reset-code`, {}, adminToken);
    assert.equal(response.status, 200, await response.text());
    const first = await response.json();
    assert.match(first.token, /^[A-Za-z0-9_-]{32,128}$/);

    response = await postJson(baseUrl, `/admin/users/${userId}/reset-code`, {}, adminToken);
    assert.equal(response.status, 200, await response.text());
    const second = await response.json();
    assert.notEqual(second.token, first.token);

    response = await postJson(baseUrl, '/auth/reset-password', {
      email: userEmail,
      token: first.token,
      new_password: newPassword,
    });
    assert.equal(response.status, 401, 'issuing a replacement token must revoke the previous token');

    response = await postJson(baseUrl, '/auth/reset-password', {
      email: userEmail,
      token: second.token,
      new_password: newPassword,
    });
    assert.equal(response.status, 204, await response.text());

    const userRow = (await adminDb.query('select password_hash from users where id=$1', [userId])).rows[0];
    assert.equal(await bcrypt.compare(newPassword, userRow.password_hash), true, 'new password must be persisted');
    assert.equal(await bcrypt.compare(oldPassword, userRow.password_hash), false, 'old password must no longer authenticate');

    const session = (await adminDb.query('select revoked_at from sessions where id=$1', [sessionId])).rows[0];
    assert.ok(session.revoked_at, 'all active sessions must be revoked after password reset');

    response = await postJson(baseUrl, '/auth/reset-password', {
      email: userEmail,
      token: second.token,
      new_password: 'AnotherPassword!789',
    });
    assert.equal(response.status, 401, 'a consumed reset token must never be reusable');

    const activeTokens = await adminDb.query('select count(*)::int as count from password_reset_tokens where user_id=$1 and used_at is null', [userId]);
    assert.equal(activeTokens.rows[0].count, 0, 'successful reset must revoke every remaining unused token');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await adminDb.end();
  }
});
