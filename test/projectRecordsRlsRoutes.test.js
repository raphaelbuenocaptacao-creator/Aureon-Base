import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/platformData.js', import.meta.url), 'utf8');
const dataStart = source.indexOf("app.get('/v1/projects/:slug/data/:collection'");
const storageStart = source.indexOf("app.get('/v1/projects/:slug/storage'");

assert.ok(dataStart >= 0, 'project data routes missing');
assert.ok(storageStart > dataStart, 'storage boundary missing');

const dataRoutes = source.slice(dataStart, storageStart);
const operations = [
  'select id,data,owner_user_id,created_at,updated_at from project_records',
  'insert into project_records',
  'update project_records set data=',
  'delete from project_records',
];

for (const operation of operations) {
  assert.ok(dataRoutes.includes(operation), `project_records operation missing: ${operation}`);
}

const scopedCalls = dataRoutes.match(/recordsQuery\(ctx, req\.user\.sub, scopedQuery => scopedQuery\(/g) || [];
assert.equal(scopedCalls.length, 5, 'all five project_records route operations must use tenant context');

const unsafeDirectCalls = dataRoutes.match(/(?:const (?:result|found|saved|deleted) = await )query\(\s*[`'][^`']*project_records/gs) || [];
assert.equal(unsafeDirectCalls.length, 0, 'project_records routes must not execute through unrestricted query()');

assert.ok(source.includes('withTenantContext'), 'tenant context helper import missing');
console.log('project records RLS route regression PASS');
