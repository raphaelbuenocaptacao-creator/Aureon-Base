import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/platformData.js', import.meta.url), 'utf8');
const start = source.indexOf("app.get('/v1/projects/:slug/storage'");
const storage = source.slice(start);

function route(method, pattern) {
  const marker = `app.${method}('${pattern}'`;
  const from = storage.indexOf(marker);
  assert.ok(from >= 0, `${marker} missing`);
  const next = storage.indexOf('\n  app.', from + marker.length);
  return storage.slice(from, next >= 0 ? next : storage.length);
}

test('every storage HTTP endpoint requires authentication before tenant resolution', () => {
  for (const [method, pattern] of [
    ['get', '/v1/projects/:slug/storage'],
    ['post', '/v1/projects/:slug/storage/:bucket/*'],
    ['get', '/v1/projects/:slug/storage/:bucket/*'],
    ['delete', '/v1/projects/:slug/storage/:bucket/*'],
  ]) {
    const body = route(method, pattern);
    assert.match(body.split('async (req, res)')[0], /requireAuth/);
    assert.match(body, /const ctx = await context\(req, res\)/);
  }
});

test('every storage database operation is executed inside project and user RLS context', () => {
  for (const [method, pattern] of [
    ['get', '/v1/projects/:slug/storage'],
    ['post', '/v1/projects/:slug/storage/:bucket/*'],
    ['get', '/v1/projects/:slug/storage/:bucket/*'],
    ['delete', '/v1/projects/:slug/storage/:bucket/*'],
  ]) {
    const body = route(method, pattern);
    assert.match(body, /withTenantContext\(\{ userId: req\.user\.sub, projectId: ctx\.membership\.id \}/);
    assert.equal(/await query\(/.test(body), false, `${method} ${pattern} bypasses tenant context`);
  }
});

test('storage list/read/create/delete keep explicit tenant and ownership filters as defense in depth', () => {
  const list = route('get', '/v1/projects/:slug/storage');
  assert.match(list, /project_id=\$1/);
  assert.match(list, /owner_user_id=\$3/);
  assert.match(list, /visibility in \('project','public'\)/);

  const create = route('post', '/v1/projects/:slug/storage/:bucket/*');
  assert.match(create, /ctx\.membership\.id, req\.user\.sub/);
  assert.match(create, /validateStorageObject/);
  assert.match(create, /checksum_sha256/);

  const read = route('get', '/v1/projects/:slug/storage/:bucket/*');
  assert.match(read, /project_id=\$1/);
  assert.match(read, /owner_user_id=\$4/);
  assert.match(read, /visibility in \('project','public'\)/);

  const remove = route('delete', '/v1/projects/:slug/storage/:bucket/*');
  assert.match(remove, /project_id=\$1/);
  assert.match(remove, /owner_user_id=\$4/);
  assert.match(remove, /deleted_at=now\(\)/);
  assert.doesNotMatch(remove, /delete from storage_objects/i);
});

test('storage object paths are validated on create, read and delete', () => {
  const create = route('post', '/v1/projects/:slug/storage/:bucket/*');
  assert.match(create, /validateStorageObject/);

  for (const method of ['get', 'delete']) {
    const body = route(method, '/v1/projects/:slug/storage/:bucket/*');
    assert.match(body, /storageBucket\.test\(bucket\)/);
    assert.match(body, /storageKey\.test\(key\)/);
    assert.match(body, /key\.includes\('\.\.'\)/);
    assert.match(body, /key\.includes\('\/\/'\)/);
  }
});
