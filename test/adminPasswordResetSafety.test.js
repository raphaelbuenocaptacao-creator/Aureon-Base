import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

function routeSource(path, nextPath) {
  const start = source.indexOf(path);
  const end = source.indexOf(nextPath, start);
  assert.notEqual(start, -1, `${path} route missing`);
  assert.notEqual(end, -1, `${nextPath} boundary missing`);
  return source.slice(start, end);
}

test('admin password reset never returns the raw reset token', () => {
  const route = routeSource("app.post('/admin/users/:userId/reset-code'", "app.put('/admin/projects/:slug/users/:userId/access'");
  assert.match(route, /sendRecoveryEmail\(user\.email, issued\.token\)/);
  assert.doesNotMatch(route, /res\.json\([^\n]*token\s*:/);
  assert.doesNotMatch(route, /metadata:\s*\{[^}]*token\s*:/s);
  assert.match(route, /status\(202\)\.json\(\{ ok: true/);
});

test('admin password reset revokes the just-issued token when delivery fails', () => {
  const route = routeSource("app.post('/admin/users/:userId/reset-code'", "app.put('/admin/projects/:slug/users/:userId/access'");
  assert.match(route, /if \(!sent\)/);
  assert.match(route, /update password_reset_tokens set used_at=coalesce\(used_at,now\(\)\)/);
  assert.match(route, /hashResetToken\(issued\.token\)/);
  assert.match(route, /status\(503\)\.json\(\{ error: 'email_delivery_failed' \}\)/);
});

test('admin reset audit records delivery outcome without secret material', () => {
  const route = routeSource("app.post('/admin/users/:userId/reset-code'", "app.put('/admin/projects/:slug/users/:userId/access'");
  assert.match(route, /event: 'admin\.password_reset_requested'/);
  assert.match(route, /delivered: sent/);
  assert.match(route, /expires_in_minutes: issued\.expiresInMinutes/);
  assert.doesNotMatch(route, /admin\.reset_token_generated/);
});
