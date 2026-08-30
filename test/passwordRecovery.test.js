import test from 'node:test';
import assert from 'node:assert/strict';
import { generateResetToken, hashResetToken, issuePasswordResetToken, consumePasswordResetToken } from '../src/passwordRecovery.js';

const issuedRow = { rows: [{ id: 'token-row' }] };

test('reset tokens are random, URL-safe and only hashes are persisted', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push({ sql, params }); return issuedRow; };
  const first = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.1', ttlMinutes: 10 });
  const second = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.1', ttlMinutes: 10 });

  assert.notEqual(first.token, second.token);
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(calls[0].params[1], hashResetToken(first.token));
  assert.notEqual(calls[0].params[1], first.token);
  assert.match(calls[0].sql, /used_at=coalesce\(used_at, now\(\)\)/);
});

test('issuance is serialized per user in one PostgreSQL statement', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push({ sql, params }); return issuedRow; };
  await issuePasswordResetToken({ query, userId: 'user-lock', ttlMinutes: 10 });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /pg_advisory_xact_lock\(hashtextextended\(\$1::text, 0\)\)/);
  assert.match(calls[0].sql, /with lock_user as materialized/i);
  assert.match(calls[0].sql, /recent as materialized/i);
  assert.match(calls[0].sql, /update password_reset_tokens/i);
  assert.match(calls[0].sql, /insert into password_reset_tokens/i);
});

test('database-backed cooldown blocks repeated issuance without revealing a token', async () => {
  const calls = [];
  let first = true;
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (first) {
      first = false;
      return issuedRow;
    }
    return { rows: [] };
  };

  const issued = await issuePasswordResetToken({ query, userId: 'user-cooldown', cooldownSeconds: 60 });
  assert.match(issued.token, /^[A-Za-z0-9_-]{40,}$/);
  await assert.rejects(
    () => issuePasswordResetToken({ query, userId: 'user-cooldown', cooldownSeconds: 60 }),
    error => error?.code === 'PASSWORD_RESET_COOLDOWN' && error?.retryAfterSeconds === 60,
  );
  assert.match(calls[1].sql, /created_at > now\(\)-\(\$5 \|\| ' seconds'\)::interval/);
  assert.equal(calls[1].params[4], '60');
});

test('consume is atomic, one-time and expiration-aware', async () => {
  const calls = [];
  let available = true;
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (available) { available = false; return { rows: [{ id: 'token-row' }] }; }
    return { rows: [] };
  };
  const token = generateResetToken();
  assert.equal(await consumePasswordResetToken({ query, userId: 'user-1', token }), true);
  assert.equal(await consumePasswordResetToken({ query, userId: 'user-1', token }), false);
  assert.match(calls[0].sql, /used_at is null/);
  assert.match(calls[0].sql, /expires_at > now\(\)/);
  assert.match(calls[0].sql, /returning id/);
  assert.equal(calls[0].params[1], hashResetToken(token));
});

test('TTL and cooldown are bounded to safe ranges', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push({ sql, params }); return issuedRow; };
  const low = await issuePasswordResetToken({ query, userId: 'user-1', ttlMinutes: 1, cooldownSeconds: 1 });
  const high = await issuePasswordResetToken({ query, userId: 'user-2', ttlMinutes: 999, cooldownSeconds: 9999 });
  assert.equal(low.expiresInMinutes, 5);
  assert.equal(high.expiresInMinutes, 60);
  assert.equal(calls[0].params[4], '30');
  assert.equal(calls[1].params[4], '900');
});
