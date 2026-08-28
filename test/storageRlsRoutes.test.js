import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/platformData.js', import.meta.url), 'utf8');
const storageSection = source.slice(source.indexOf("app.get('/v1/projects/:slug/storage'"));

test('all storage database operations execute inside tenant RLS context', () => {
  assert.ok(storageSection.length > 0, 'storage routes must exist');
  const scopedCalls = storageSection.match(/withTenantContext\(/g) || [];
  assert.equal(scopedCalls.length, 4, 'list, create, read and delete must all use tenant context');
  assert.equal(/await query\(/.test(storageSection), false, 'storage routes must not bypass tenant context with direct query calls');
});

test('storage keeps explicit project and owner filters as defense in depth', () => {
  assert.match(storageSection, /project_id=\$1/);
  assert.match(storageSection, /owner_user_id=\$3/);
  assert.match(storageSection, /owner_user_id=\$4/);
});
