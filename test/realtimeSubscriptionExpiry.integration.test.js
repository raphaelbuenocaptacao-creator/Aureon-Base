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

async function assertStatus(response, expected, message) {
  if (response.status === expected) return;
  const detail = await response.text().catch(() => '');
  assert.equal(response.status, expected, message ? `${message}: ${detail}` : detail);
}

test('Realtime rejects expired active periods and expired trials with valid JWT and membership', { skip: !databaseUrl || !jwtSecret }, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const userId = randomUUID();
  const projectId = randomUUID();
  const slug = `http-realtime-expiry-${projectId}`;
  const email = `http-realtime-expiry-${userId}@example.test`;
  const token = accessToken(userId, email);
  const port = 3422;
  const baseUrl = `http://127.0.0.1:${port}`;

  await admin.query("insert into users(id,email,password_hash) values ($1,$2,'x')", [userId, email]);
  await admin.query('insert into projects(id,slug,name) values ($1,$2,$3)', [projectId, slug, 'HTTP Realtime Expiry']);
  await admin.query("insert into project_users(project_id,user_id,role) values ($1,$2,'owner')", [projectId, userId]);
  await admin.query("insert into subscriptions(project_id,user_id,status,current_period_start,current_period_end) values ($1,$2,'active',now()-interval '2 days',now()-interval '1 day')", [projectId, userId]);

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

    let response = await api(baseUrl, `/api/projects/${slug}/realtime/events?after=0`, token);
    await assertStatus(response, 402, 'expired active period must block realtime polling');

    response = await api(baseUrl, `/api/projects/${slug}/realtime/publish`, token, {
      method: 'POST',
      body: JSON.stringify({ topic: 'orders', event_type: 'order.after-active-expiry', payload: { blocked: true } }),
    });
    await assertStatus(response, 402, 'expired active period must block realtime publishing');

    let persisted = await admin.query(
      "select count(*)::int as count from realtime_events where project_id=$1 and event_type='order.after-active-expiry'",
      [projectId],
    );
    assert.equal(persisted.rows[0].count, 0, 'expired active period publish must not persist');

    await admin.query(
      "update subscriptions set status='trialing',trial_started_at=now()-interval '10 days',trial_ends_at=now()-interval '1 minute',current_period_start=null,current_period_end=null,updated_at=now() where project_id=$1 and user_id=$2",
      [projectId, userId],
    );

    response = await api(baseUrl, `/api/projects/${slug}/realtime/events?after=0`, token);
    await assertStatus(response, 402, 'expired trial must block realtime polling');

    response = await api(baseUrl, `/api/projects/${slug}/realtime/publish`, token, {
      method: 'POST',
      body: JSON.stringify({ topic: 'orders', event_type: 'order.after-trial-expiry', payload: { blocked: true } }),
    });
    await assertStatus(response, 402, 'expired trial must block realtime publishing');

    persisted = await admin.query(
      "select count(*)::int as count from realtime_events where project_id=$1 and event_type in ('order.after-active-expiry','order.after-trial-expiry')",
      [projectId],
    );
    assert.equal(persisted.rows[0].count, 0, 'expired subscription states must not persist realtime events');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await admin.end();
  }
});
