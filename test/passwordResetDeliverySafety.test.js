import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test('recovery email transport fails closed when provider credentials are absent', () => {
  const block = sliceBetween('async function sendRecoveryEmail', 'async function requireSuperAdmin');
  assert.match(block, /RESEND_API_KEY/);
  assert.match(block, /if \(!apiKey\) return false/);
  assert.match(block, /if \(!response\.ok\) console\.error\('recovery_email_error', response\.status\)/);
  assert.match(block, /return response\.ok/);
  assert.doesNotMatch(block, /console\.(?:log|error)\([^\n]*(?:apiKey|token)/);
});

test('failed reset-email delivery revokes the freshly issued token before returning', () => {
  const route = sliceBetween("app.post('/auth/request-password-reset'", "app.post('/auth/reset-password'");
  const issueIndex = route.indexOf('issuePasswordResetToken');
  const sendIndex = route.indexOf('sendRecoveryEmail');
  const failureIndex = route.indexOf('if (!sent)');
  const revokeIndex = route.indexOf('update password_reset_tokens set used_at=coalesce(used_at,now())');
  const responseIndex = route.lastIndexOf('res.status(202).json({ ok: true })');

  assert.ok(issueIndex >= 0, 'request route must issue a one-time token');
  assert.ok(sendIndex > issueIndex, 'mail send must happen after token issuance');
  assert.ok(failureIndex > sendIndex, 'delivery failure must be handled after provider attempt');
  assert.ok(revokeIndex > failureIndex, 'failed delivery must revoke the freshly issued token');
  assert.ok(responseIndex > revokeIndex, 'generic response must only be returned after revocation handling');
  assert.match(route, /hashResetToken\(issued\.token\)/);
});

test('password reset request audit records delivery outcome without persisting the raw token', () => {
  const route = sliceBetween("app.post('/auth/request-password-reset'", "app.post('/auth/reset-password'");
  assert.match(route, /event: 'user\.password_reset_requested'/);
  assert.match(route, /metadata: \{ delivered: sent, expires_in_minutes: issued\.expiresInMinutes \}/);
  assert.doesNotMatch(route, /metadata:\s*\{[^}]*token\s*:/);
  assert.match(route, /return res\.status\(202\)\.json\(\{ ok: true \}\)/);
});
