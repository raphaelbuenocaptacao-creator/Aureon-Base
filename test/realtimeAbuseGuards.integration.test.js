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

async function expectStatus(response, expected, label) {
  if (response.status === expected) return;
  const detail = await response.text().catch(() => '');
  assert.equal(response.status, expected, `${label}: ${detail}`);
}

test('Realtime HTTP rejects abusive inputs before persistence', { skip: !databaseUrl || !jwtSecret }, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const userId = randomUUID();
  const projectId = randomUUID();
  const slug = `realtime-guard-${projectId}`;
  const email = `realtime-guard-${userId}@example.test`;
  const token = accessToken(userId, email);
  const port = 3430;
  const baseUrl = `http://127.0.0.1:${port}`;

  await admin.query("insert into users(id,email,password_hash) values ($1,$2,'x')", [userId, email]);
  await admin.query('insert into projects(id,slug,name) values ($1,$2,$3)', [projectId, slug, 'Realtime Abuse Guard']);
  await admin.query("insert into project_users(project_id,user_id,role) values ($1,$2,'owner')", [projectId, userId]);
  await admin.query("insert into subscriptions(project_id,user_id,status) values ($1,$2,'lifetime')", [projectId, userId]);

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

    const publishCases = [
      {
        label: 'invalid topic',
        expected: 400,
        body: { topic: 'orders;drop table', event_type: 'guard.invalid-topic', payload: { marker: 'invalid-topic' } },
      },
      {
        label: 'invalid event type',
        expected: 400,
        body: { topic: 'guard', event_type: 'bad event!', payload: { marker: 'invalid-event' } },
      },
      {
        label: 'array payload',
        expected: 400,
        body: { topic: 'guard', event_type: 'guard.array', payload: ['not', 'an', 'object'] },
      },
      {
        label: 'oversized payload',
        expected: 413,
        body: { topic: 'guard', event_type: 'guard.oversized', payload: { marker: 'oversized', data: 'x'.repeat(70 * 1024) } },
      },
    ];

    for (const item of publishCases) {
      const response = await api(baseUrl, `/api/projects/${slug}/realtime/publish`, token, {
        method: 'POST',
        body: JSON.stringify(item.body),
      });
      await expectStatus(response, item.expected, item.label);
    }

    const queryCases = [
      ['negative cursor', `after=-1`, 400],
      ['unsafe cursor', `after=${Number.MAX_SAFE_INTEGER + 1}`, 400],
      ['zero limit', 'after=0&limit=0', 400],
      ['excessive limit', 'after=0&limit=501', 400],
      ['invalid topic filter', 'after=0&topic=bad%20topic!', 400],
    ];

    for (const [label, query, expected] of queryCases) {
      const response = await api(baseUrl, `/api/projects/${slug}/realtime/events?${query}`, token);
      await expectStatus(response, expected, label);
    }

    const persisted = await admin.query('select count(*)::int as count from realtime_events where project_id=$1', [projectId]);
    assert.equal(persisted.rows[0].count, 0, 'rejected realtime requests must not persist any event');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await admin.end();
  }
});
