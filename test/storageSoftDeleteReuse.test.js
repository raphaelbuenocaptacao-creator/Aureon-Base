import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/platformData.js', import.meta.url), 'utf8');

function storageCreateRoute() {
  const start = source.indexOf("app.post('/v1/projects/:slug/storage/:bucket/*'");
  const end = source.indexOf("app.get('/v1/projects/:slug/storage/:bucket/*'", start);
  assert.ok(start >= 0 && end > start, 'storage create route must exist');
  return source.slice(start, end);
}

test('storage create safely restores only caller-owned soft-deleted key before insert', () => {
  const route = storageCreateRoute();
  assert.match(route, /withTenantContext\(\{ userId: req\.user\.sub, projectId: ctx\.membership\.id \}/);
  assert.match(route, /update storage_objects/);
  assert.match(route, /set deleted_at=null/);
  assert.match(route, /where project_id=\$1 and owner_user_id=\$2 and bucket=\$3 and object_key=\$4 and deleted_at is not null/);
  assert.ok(route.indexOf('update storage_objects') < route.indexOf('insert into storage_objects'));
  assert.match(route, /if \(restored\.rows\[0\]\) return restored/);
});

test('storage create still rejects active duplicate keys instead of overwriting them', () => {
  const route = storageCreateRoute();
  assert.match(route, /if \(err\.code === '23505'\) return res\.status\(409\)\.json\(\{ error: 'object_already_exists' \}\)/);
  assert.doesNotMatch(route, /on conflict[\s\S]*do update/i);
});
