import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('password reset routes are wired to one-time token lifecycle', () => {
  assert.match(source, /issuePasswordResetToken/);
  assert.match(source, /consumePasswordResetToken/);
  assert.match(source, /hashResetToken/);
  assert.doesNotMatch(source, /function recoveryCode/);
  assert.doesNotMatch(source, /resetWindowMs/);
});

test('request endpoint masks account and mail-service state', () => {
  const start = source.indexOf("app.post('/auth/request-password-reset'");
  const end = source.indexOf("app.post('/auth/reset-password'", start);
  const route = source.slice(start, end);
  assert.match(route, /return res\.status\(202\)\.json\(\{ ok: true \}\)/);
  assert.doesNotMatch(route, /email_service_unavailable/);
});

test('reset endpoint consumes the token before changing the password and revoking sessions', () => {
  const start = source.indexOf("app.post('/auth/reset-password'");
  const end = source.indexOf("app.get('/me'", start);
  const route = source.slice(start, end);
  assert.ok(route.indexOf('consumePasswordResetToken') < route.indexOf("update users set password_hash"));
  assert.ok(route.indexOf('consumePasswordResetToken') < route.indexOf('update sessions set revoked_at=now()'));
});
