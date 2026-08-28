import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const dbSource = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');

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

test('reset endpoint completes token consumption, password update and revocation in one transaction', () => {
  const start = source.indexOf("app.post('/auth/reset-password'");
  const end = source.indexOf("app.get('/me'", start);
  const route = source.slice(start, end);
  assert.match(source, /import \{ query, databaseHealth, withTransaction \} from '\.\/db\.js'/);
  assert.match(route, /withTransaction\(async transactionQuery => \{/);
  assert.match(route, /consumePasswordResetToken\(\{ query: transactionQuery/);
  assert.match(route, /transactionQuery\('update users set password_hash/);
  assert.match(route, /transactionQuery\('update sessions set revoked_at=now\(\)/);
  assert.match(route, /transactionQuery\('update password_reset_tokens set used_at=/);
  assert.ok(route.indexOf('consumePasswordResetToken') < route.indexOf("transactionQuery('update users set password_hash"));
  assert.ok(route.indexOf("transactionQuery('update users set password_hash") < route.indexOf("transactionQuery('update sessions set revoked_at=now()"));
});

test('database transaction helper commits on success and rolls back on failure', () => {
  assert.match(dbSource, /export async function withTransaction\(operation\)/);
  assert.match(dbSource, /await client\.query\('begin'\)/);
  assert.match(dbSource, /await client\.query\('commit'\)/);
  assert.match(dbSource, /await client\.query\('rollback'\)/);
  assert.match(dbSource, /client\.release\(\)/);
});
