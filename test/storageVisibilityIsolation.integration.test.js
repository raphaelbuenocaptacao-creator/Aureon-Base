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
  return jwt.sign({ sub: userId, email, type: 'access' }, jwtSecret, {
    expiresIn: '5m',
    issuer: 'aureon-base',
    audience: 'aureon-apps',
    algorithm: 'HS256',
    jwtid: randomUUID(),
  });
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

test('Storage project visibility stays tenant-scoped and only owner can delete', { skip: !databaseUrl || !jwtSecret }, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const slugA = `storage-vis-${projectA}`;
  const slugB = `storage-vis-${projectB}`;
  const emailA = `storage-vis-a-${userA}@example.test`;
  const emailB = `storage-vis-b-${userB}@example.test`;
  const tokenA = accessToken(userA, emailA);
  const tokenB = accessToken(userB, emailB);
  const port = 3421;
  const baseUrl = `http://127.0.0.1:${port}`;

  await admin.query("insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')", [userA, emailA, userB, emailB]);
  await admin.query('insert into projects(id,slug,name) values ($1,$2,$3),($4,$5,$6)', [projectA, slugA, 'Storage Visibility A', projectB, slugB, 'Storage Visibility B']);
  await admin.query("insert into project_users(project_id,user_id,role) values ($1,$2,'member'),($1,$3,'member'),($4,$3,'owner')", [projectA, userA, userB, projectB]);

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

    const payload = Buffer.from('project-visible-content').toString('base64');
    let response = await api(baseUrl, `/v1/projects/${slugA}/storage/shared/project.txt`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ content_base64: payload, content_type: 'text/plain', visibility: 'project' }),
    });
    assert.equal(response.status, 201, await response.text());

    response = await api(baseUrl, `/v1/projects/${slugA}/storage/shared/project.txt`, tokenB);
    assert.equal(response.status, 200, 'another member in the same project may read project-visible objects');
    let body = await response.json();
    assert.equal(body.content_base64, payload);
    assert.equal(body.visibility, 'project');

    response = await api(baseUrl, `/v1/projects/${slugA}/storage?bucket=shared`, tokenB);
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.some(row => row.object_key === 'project.txt'), true, 'project-visible object appears only to project members');

    response = await api(baseUrl, `/v1/projects/${slugA}/storage/shared/project.txt`, tokenB, { method: 'DELETE' });
    assert.equal(response.status, 404, 'non-owner cannot delete another member storage object');

    response = await api(baseUrl, `/v1/projects/${slugA}/storage/shared/project.txt`, tokenA);
    assert.equal(response.status, 200, 'failed foreign delete must not mutate owner data');

    response = await api(baseUrl, `/v1/projects/${slugB}/storage/shared/project.txt`, tokenA);
    assert.equal(response.status, 403, 'visibility never bypasses project membership');

    const publicPayload = Buffer.from('public-within-project-route').toString('base64');
    response = await api(baseUrl, `/v1/projects/${slugA}/storage/shared/public.txt`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ content_base64: publicPayload, content_type: 'text/plain', visibility: 'public' }),
    });
    assert.equal(response.status, 201, await response.text());

    response = await api(baseUrl, `/v1/projects/${slugA}/storage/shared/public.txt`, tokenB);
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.content_base64, publicPayload);
    assert.equal(body.visibility, 'public');

    response = await fetch(`${baseUrl}/v1/projects/${slugA}/storage/shared/public.txt`);
    assert.equal(response.status, 401, 'public visibility does not create an unauthenticated cross-tenant endpoint');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await admin.end();
  }
});
