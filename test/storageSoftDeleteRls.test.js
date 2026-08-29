import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../database/migrations/009_storage_soft_delete_rls.sql', import.meta.url), 'utf8');
const normalized = migration.toLowerCase().replace(/\s+/g, ' ');

test('storage soft-delete RLS keeps deleted objects owner-only', () => {
  assert.match(normalized, /project_id = aureon_current_project_id\(\)/);
  assert.match(normalized, /owner_user_id = aureon_current_user_id\(\)/);
  assert.match(normalized, /deleted_at is null/);
  assert.match(normalized, /visibility in \('project','public'\)/);
});

test('storage soft-delete RLS migration is non-destructive to schema and data', () => {
  for (const forbidden of ['drop table', 'truncate ', 'delete from', 'drop column', 'alter column']) {
    assert.equal(normalized.includes(forbidden), false, `migration must not contain ${forbidden}`);
  }
});
