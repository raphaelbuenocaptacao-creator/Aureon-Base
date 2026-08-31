import test from 'node:test';
import assert from 'node:assert/strict';
import { hashResetToken, issuePasswordResetToken } from '../src/passwordRecovery.js';

test('issuing a replacement after cooldown revokes every prior unused token before persisting the replacement', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 'token-row' }] };
  };

  const first = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.1', ttlMinutes: 10 });
  const firstIssueCalls = calls.splice(0);
  const second = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.2', ttlMinutes: 10 });

  assert.notEqual(first.token, second.token);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /pg_try_advisory_xact_lock/i);
  assert.match(calls[0].sql, /not lock_user\.acquired/i);
  assert.match(calls[0].sql, /recent as materialized/i);
  assert.match(calls[0].sql, /update password_reset_tokens/i);
  assert.match(calls[0].sql, /used_at=coalesce\(used_at, now\(\)\)/i);
  assert.match(calls[0].sql, /user_id=\$1::uuid/i);
  assert.match(calls[0].sql, /used_at is null/i);
  assert.match(calls[0].sql, /recent\.blocked=false/i);
  assert.match(calls[0].sql, /insert into password_reset_tokens/i);
  assert.equal(calls[0].params[0], 'user-1');
  assert.equal(calls[0].params[1], hashResetToken(second.token));
  assert.notEqual(calls[0].params[1], second.token);
  assert.equal(calls[0].params[3], '127.0.0.2');

  assert.equal(firstIssueCalls.length, 1);
  assert.match(firstIssueCalls[0].sql, /update password_reset_tokens/i);
  assert.match(firstIssueCalls[0].sql, /insert into password_reset_tokens/i);
});
