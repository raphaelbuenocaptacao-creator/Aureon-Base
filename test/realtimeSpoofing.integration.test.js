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

test('Realtime publish ignores forged actor/project fields and persists authenticated tenant identity only', { skip: !databaseUrl || !jwtSecret }, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const slugA = `http-realtime-spoof-a-${projectA}`;
  const slugB = `http-realtime-spoof-b-${projectB}`;
  const emailA = `http-realtime-spoof-a-${userA}@example.test`;
  const emailB = `http-realtime-spoof-b-${userB}@example.test`;
  const tokenA = accessToken(userA, emailA);
  const port = 3423;
  const baseUrl = `http://127.0.0.1:${port}`;

  await admin.query("insert into users(id,email,password_hash) values ($1,$2,'x'),($3,$4,'x')", [userA, emailA, userB, emailB]);
  await admin.query('insert into projects(id,slug,name) values ($1,$2,$3),($4,$5,$6)', [projectA, slugA, 'HTTP Realtime Spoof A', projectB, slugB, 'HTTP Realtime Spoof B']);
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

    const response = await api(baseUrl, `/api/projects/${slugA}/realtime/publish`, tokenA, {
      method: 'POST',
      body: JSON.stringify({
        topic: 'security',
        event_type: 'spoof.attempt',
        actor_user_id: userB,
        project_id: projectB,
        payload: { actor_user_id: userB, project_id: projectB, marker: 'client-controlled-payload' },
      }),
    });

    assert.equal(response.status, 201, await response.text().catch(() => ''));
    const body = await response.json();
    assert.equal(body.event.actor_user_id, userA, 'server must derive actor from authenticated JWT');
    assert.equal(body.event.project_id, projectA, 'server must derive project from authorized URL tenant context');
    assert.equal(body.event.payload.actor_user_id, userB, 'payload remains opaque client data and must not affect authorization identity');
    assert.equal(body.event.payload.project_id, projectB, 'payload remains opaque client data and must not affect tenant routing');

    const persisted = await admin.query(
      "select project_id,actor_user_id,payload from realtime_events where project_id=$1 and event_type='spoof.attempt' order by id desc limit 1",
      [projectA],
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].project_id, projectA);
    assert.equal(persisted.rows[0].actor_user_id, userA);

    const leaked = await admin.query(
      "select count(*)::int as count from realtime_events where project_id=$1 and event_type='spoof.attempt'",
      [projectB],
    );
    assert.equal(leaked.rows[0].count, 0, 'forged project_id must never route an event into another tenant');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await admin.end();
  }
});
