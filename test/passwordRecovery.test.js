import test from 'node:test';
import assert from 'node:assert/strict';
import { generateResetToken, hashResetToken, issuePasswordResetToken, consumePasswordResetToken } from '../src/passwordRecovery.js';

test('reset tokens are random, URL-safe and only hashes are persisted', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; };
  const first = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.1', ttlMinutes: 10 });
  const second = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.1', ttlMinutes: 10 });

  assert.notEqual(first.token, second.token);
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(calls[1].params[1], hashResetToken(first.token));
  assert.notEqual(calls[1].params[1], first.token);
  assert.match(calls[0].sql, /used_at=coalesce\(used_at, now\(\)\)/);
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

test('TTL is bounded to a safe range', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; };
  const low = await issuePasswordResetToken({ query, userId: 'user-1', ttlMinutes: 1 });
  const high = await issuePasswordResetToken({ query, userId: 'user-2', ttlMinutes: 999 });
  assert.equal(low.expiresInMinutes, 5);
  assert.equal(high.expiresInMinutes, 60);
});
