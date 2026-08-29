import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('valid-shaped reset requests do not reveal whether the account exists', () => {
  const start = source.indexOf("app.post('/auth/reset-password'");
  const end = source.indexOf("app.get('/me'", start);
  const route = source.slice(start, end);

  assert.match(
    route,
    /if \(!user \|\| !user\.is_active\) return res\.status\(401\)\.json\(\{ error: 'invalid_reset_token' \}\)/,
  );
  assert.match(
    route,
    /if \(!completed\) return res\.status\(401\)\.json\(\{ error: 'invalid_reset_token' \}\)/,
  );
  assert.doesNotMatch(
    route,
    /if \(!user \|\| !user\.is_active\) return res\.status\(400\)\.json\(\{ error: 'invalid_reset' \}\)/,
  );
});
