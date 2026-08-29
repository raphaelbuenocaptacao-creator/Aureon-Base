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

async function assertStatus(response, expected, message) {
  if (response.status === expected) return;
  const detail = await response.text().catch(() => '');
  assert.equal(response.status, expected, message ? `${message}: ${detail}` : detail);
}

test('Realtime HTTP black-box isolates publish and polling across projects', { skip: !databaseUrl || !jwtSecret }, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const slugA = `http-realtime-a-${projectA}`;
  const slugB = `http-realtime-b-${projectB}`;
  const emailA = `http-realtime-a-${userA}@example.test`;
  const emailB = `http-realtime-b-${userB}@example.test`;
  const tokenA = accessToken(userA, emailA);
  const tokenB = accessToken(userB, emailB);
  const port = 3421;
  const baseUrl = `http://127.0.0.1:${port}`;

  await admin.query("insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')", [userA, emailA, userB, emailB]);
  await admin.query('insert into projects(id,slug,name) values ($1,$2,$3),($4,$5,$6)', [projectA, slugA, 'HTTP Realtime A', projectB, slugB, 'HTTP Realtime B']);
  await admin.query("insert into project_users(project_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')", [projectA, userA, projectB, userB]);
  await admin.query("insert into subscriptions(project_id,user_id,status) values ($1,$2,'lifetime'),($3,$4,'lifetime')", [projectA, userA, projectB, userB]);

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

    let response = await api(baseUrl, `/api/projects/${slugA}/realtime/publish`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ topic: 'orders', event_type: 'order.created', payload: { tenant: 'a' } }),
    });
    await assertStatus(response, 201);
    const eventA = (await response.json()).event;
    assert.equal(eventA.project_id, projectA);
    assert.equal(eventA.actor_user_id, userA);
    assert.deepEqual(eventA.payload, { tenant: 'a' });

    response = await api(baseUrl, `/api/projects/${slugA}/realtime/events?after=0&topic=orders`, tokenA);
    await assertStatus(response, 200);
    let body = await response.json();
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].project_id, projectA);
    assert.equal(body.events[0].payload.tenant, 'a');

    response = await api(baseUrl, `/api/projects/${slugA}/realtime/events?after=0`, tokenB);
    await assertStatus(response, 403, 'tenant B must not poll tenant A project');

    response = await api(baseUrl, `/api/projects/${slugA}/realtime/publish`, tokenB, {
      method: 'POST',
      body: JSON.stringify({ topic: 'orders', event_type: 'order.created', payload: { tenant: 'forged-b-to-a' } }),
    });
    await assertStatus(response, 403, 'tenant B must not publish into tenant A project');

    response = await api(baseUrl, `/api/projects/${slugB}/realtime/publish`, tokenB, {
      method: 'POST',
      body: JSON.stringify({ topic: 'orders', event_type: 'order.created', payload: { tenant: 'b' } }),
    });
    await assertStatus(response, 201);
    const eventB = (await response.json()).event;
    assert.equal(eventB.project_id, projectB);
    assert.equal(eventB.actor_user_id, userB);

    response = await api(baseUrl, `/api/projects/${slugB}/realtime/events?after=0`, tokenB);
    await assertStatus(response, 200);
    body = await response.json();
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].project_id, projectB);
    assert.equal(body.events[0].payload.tenant, 'b');
    assert.equal(body.events.some(event => event.project_id === projectA || event.payload?.tenant === 'a'), false, 'tenant A events must never leak into tenant B polling');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await admin.end();
  }
});
