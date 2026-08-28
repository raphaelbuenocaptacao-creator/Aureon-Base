import test from 'node:test';
import assert from 'node:assert/strict';
import { hashResetToken, issuePasswordResetToken } from '../src/passwordRecovery.js';

test('issuing a new password reset token revokes every prior unused token before persisting the replacement', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  };

  const first = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.1', ttlMinutes: 10 });
  const firstIssueCalls = calls.splice(0);
  const second = await issuePasswordResetToken({ query, userId: 'user-1', requestedIp: '127.0.0.2', ttlMinutes: 10 });

  assert.notEqual(first.token, second.token);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /update password_reset_tokens/i);
  assert.match(calls[0].sql, /used_at=coalesce\(used_at, now\(\)\)/i);
  assert.match(calls[0].sql, /where user_id=\$1 and used_at is null/i);
  assert.deepEqual(calls[0].params, ['user-1']);
  assert.match(calls[1].sql, /insert into password_reset_tokens/i);
  assert.equal(calls[1].params[0], 'user-1');
  assert.equal(calls[1].params[1], hashResetToken(second.token));
  assert.notEqual(calls[1].params[1], second.token);
  assert.equal(calls[1].params[3], '127.0.0.2');

  assert.match(firstIssueCalls[0].sql, /update password_reset_tokens/i);
  assert.match(firstIssueCalls[1].sql, /insert into password_reset_tokens/i);
});
