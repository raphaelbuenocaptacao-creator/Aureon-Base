import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';

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

async function api(baseUrl, path, token, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

test('Storage HTTP black-box isolates private objects across users and projects', { skip: !databaseUrl || !jwtSecret }, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  const sharedProject = randomUUID();
  const foreignProject = randomUUID();
  const slug = `http-storage-${sharedProject}`;
  const foreignSlug = `http-storage-${foreignProject}`;
  const emailA = `http-storage-a-${userA}@example.test`;
  const emailB = `http-storage-b-${userB}@example.test`;
  const tokenA = accessToken(userA, emailA);
  const tokenB = accessToken(userB, emailB);
  const port = 3417;
  const baseUrl = `http://127.0.0.1:${port}`;

  await admin.query("insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')", [userA, emailA, userB, emailB]);
  await admin.query('insert into projects(id,slug,name) values ($1,$2,$3),($4,$5,$6)', [
    sharedProject, slug, 'HTTP Storage Shared', foreignProject, foreignSlug, 'HTTP Storage Foreign',
  ]);
  await admin.query("insert into project_users(project_id,user_id,role) values ($1,$2,'member'),($1,$3,'member'),($4,$3,'owner')", [
    sharedProject, userA, userB, foreignProject,
  ]);

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

    const payload = Buffer.from('tenant-a-private-v1').toString('base64');
    let response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ content_base64: payload, content_type: 'text/plain', visibility: 'private' }),
    });
    assert.equal(response.status, 201, await response.text());

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA);
    assert.equal(response.status, 200);
    let body = await response.json();
    assert.equal(body.content_base64, payload);
    assert.equal(body.owner_user_id, userA);

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenB);
    assert.equal(response.status, 404, 'another user in the same project must not read a private object');

    response = await api(baseUrl, `/v1/projects/${slug}/storage?bucket=private`, tokenB);
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.some(row => row.object_key === 'a.txt'), false, 'private object must not leak through list');

    response = await api(baseUrl, `/v1/projects/${slug}/storage?bucket=private`, tokenA);
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.some(row => row.object_key === 'a.txt' && row.owner_user_id === userA), true);

    response = await api(baseUrl, `/v1/projects/${foreignSlug}/storage?bucket=private`, tokenA);
    assert.equal(response.status, 403, 'user must not enter a project without membership');

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ content_base64: payload, content_type: 'text/plain', visibility: 'private' }),
    });
    assert.equal(response.status, 409, 'active key must not be overwritten implicitly');

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA, { method: 'DELETE' });
    assert.equal(response.status, 204);

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA);
    assert.equal(response.status, 404, 'soft-deleted object must immediately disappear');

    const payloadV2 = Buffer.from('tenant-a-private-v2').toString('base64');
    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ content_base64: payloadV2, content_type: 'text/plain', visibility: 'private' }),
    });
    assert.equal(response.status, 201, 'owner can safely reuse its own soft-deleted key');

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA);
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.content_base64, payloadV2);

    // Membership is authoritative on every request. A still-valid JWT must not
    // keep Storage access after membership has been revoked in PostgreSQL.
    await admin.query('delete from project_users where project_id=$1 and user_id=$2', [sharedProject, userA]);

    response = await api(baseUrl, `/v1/projects/${slug}/storage?bucket=private`, tokenA);
    assert.equal(response.status, 403, 'revoked member must immediately lose storage listing access');

    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/a.txt`, tokenA);
    assert.equal(response.status, 403, 'revoked member must immediately lose storage object read access');

    const blockedKey = `revoked-${randomUUID()}.txt`;
    response = await api(baseUrl, `/v1/projects/${slug}/storage/private/${blockedKey}`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ content_base64: payloadV2, content_type: 'text/plain', visibility: 'private' }),
    });
    assert.equal(response.status, 403, 'revoked member must immediately lose storage write access');

    const persisted = await admin.query(
      'select count(*)::int as count from storage_objects where project_id=$1 and bucket=$2 and object_key=$3 and deleted_at is null',
      [sharedProject, 'private', blockedKey],
    );
    assert.equal(persisted.rows[0].count, 0, 'revoked member write must not persist an object');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await admin.end();
  }
});
