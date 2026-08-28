import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('tenant database context drops into restricted role before tenant queries', () => {
  const source = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  assert.match(source, /set local role aureon_app/i);
  assert.match(source, /aureon\.user_id/);
  assert.match(source, /aureon\.project_id/);
  assert.match(source, /begin/);
  assert.match(source, /commit/);
  assert.match(source, /rollback/);
});

test('RLS application role is non-login and cannot bypass RLS', () => {
  const sql = fs.readFileSync(new URL('../database/migrations/007_rls_application_role.sql', import.meta.url), 'utf8');
  assert.match(sql, /NOLOGIN/i);
  assert.match(sql, /NOBYPASSRLS/i);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage_objects TO aureon_app/i);
  assert.match(sql, /ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM storage_objects/i);
});
