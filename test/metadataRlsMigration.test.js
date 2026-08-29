import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../database/migrations/008_metadata_rls.sql', import.meta.url), 'utf8');

test('metadata RLS migration scopes both metadata tables to current tenant', () => {
  assert.match(migration, /ALTER TABLE project_collections ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /ALTER TABLE project_environments ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY project_collections_tenant_read/i);
  assert.match(migration, /CREATE POLICY project_environments_tenant_read/i);
  const scopedPolicies = migration.match(/USING \(project_id = aureon_current_project_id\(\)\)/gi) || [];
  assert.equal(scopedPolicies.length, 2);
});

test('metadata RLS migration is non-destructive', () => {
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+COLUMN\b/i);
});
