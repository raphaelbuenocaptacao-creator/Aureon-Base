import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.INTEGRATION_DATABASE_URL;

const tenantTables = [
  'storage_objects',
  'project_collections',
  'project_environments',
  'project_users',
  'plans',
  'subscriptions',
  'api_keys',
  'realtime_events',
];

test('tenant-scoped PostgreSQL tables keep RLS enabled and app role cannot bypass it', { skip: !url }, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const catalog = await client.query(
      `select c.relname, c.relrowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = any($1::text[])
       order by c.relname`,
      [tenantTables],
    );

    assert.equal(catalog.rowCount, tenantTables.length, 'every expected tenant-scoped table must exist');

    const byTable = new Map(catalog.rows.map(row => [row.relname, row]));
    for (const table of tenantTables) {
      assert.equal(byTable.has(table), true, `${table} is missing from PostgreSQL catalog`);
      assert.equal(byTable.get(table).relrowsecurity, true, `${table} must have ROW LEVEL SECURITY enabled`);
    }

    const role = await client.query(
      `select rolname, rolsuper, rolbypassrls
       from pg_roles
       where rolname = 'aureon_app'`,
    );

    assert.equal(role.rowCount, 1, 'aureon_app role must exist');
    assert.equal(role.rows[0].rolsuper, false, 'aureon_app must never be a superuser');
    assert.equal(role.rows[0].rolbypassrls, false, 'aureon_app must never have BYPASSRLS');
  } finally {
    await client.end();
  }
});
