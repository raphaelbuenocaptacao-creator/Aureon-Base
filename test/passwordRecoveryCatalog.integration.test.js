import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.INTEGRATION_DATABASE_URL;

test('password reset token schema keeps one-time/expiry persistence safeguards', { skip: !url }, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const columns = await client.query(
      `select column_name, is_nullable
         from information_schema.columns
        where table_schema='public'
          and table_name='password_reset_tokens'`,
    );
    const byColumn = new Map(columns.rows.map(row => [row.column_name, row]));
    for (const name of ['id', 'user_id', 'token_hash', 'expires_at', 'created_at']) {
      assert.equal(byColumn.has(name), true, `${name} must exist`);
      assert.equal(byColumn.get(name).is_nullable, 'NO', `${name} must be NOT NULL`);
    }
    assert.equal(byColumn.has('used_at'), true, 'used_at must exist for one-time consumption/revocation');

    const constraints = await client.query(
      `select c.contype, pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_class t on t.oid=c.conrelid
         join pg_namespace n on n.oid=t.relnamespace
        where n.nspname='public'
          and t.relname='password_reset_tokens'`,
    );
    const defs = constraints.rows.map(row => `${row.contype}:${row.definition}`);
    assert.equal(defs.some(def => def.startsWith('u:') && /token_hash/.test(def)), true, 'token_hash must remain UNIQUE');
    assert.equal(defs.some(def => def.startsWith('f:') && /user_id/.test(def) && /users/.test(def) && /ON DELETE CASCADE/i.test(def)), true, 'user_id must keep FK cascade');
    assert.equal(defs.some(def => def.startsWith('c:') && /expires_at > created_at/.test(def)), true, 'expiry must remain after creation');

    const indexes = await client.query(
      `select indexname, indexdef
         from pg_indexes
        where schemaname='public'
          and tablename='password_reset_tokens'`,
    );
    const indexDefs = indexes.rows.map(row => `${row.indexname}:${row.indexdef}`);
    assert.equal(indexDefs.some(def => /idx_password_reset_tokens_user_created/.test(def)), true, 'user cooldown lookup index must exist');
    assert.equal(indexDefs.some(def => /idx_password_reset_tokens_active/.test(def) && /used_at IS NULL/i.test(def)), true, 'active-token partial index must exist');
  } finally {
    await client.end();
  }
});
