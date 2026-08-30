import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { resetAdminPassword } from '../src/adminPasswordReset.js';

test('resetAdminPassword hashes password and revokes sessions/tokens atomically', async () => {
  const calls = [];
  let committed = false;
  const withTransaction = async operation => {
    const query = async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('select id,email,is_active,is_superadmin')) {
        return { rows: [{ id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.com', is_active: true, is_superadmin: true }] };
      }
      return { rows: [] };
    };
    const result = await operation(query);
    committed = true;
    return result;
  };

  const result = await resetAdminPassword({ email: 'ADMIN@EXAMPLE.COM', newPassword: 'VeryStrongPassword#2026', withTransaction, rounds: 4 });
  assert.equal(result.email, 'admin@example.com');
  assert.equal(committed, true);
  const update = calls.find(c => c.sql.startsWith('update users set password_hash'));
  assert.ok(update);
  assert.notEqual(update.params[0], 'VeryStrongPassword#2026');
  assert.equal(await bcrypt.compare('VeryStrongPassword#2026', update.params[0]), true);
  assert.ok(calls.some(c => c.sql.startsWith('update sessions set revoked_at')));
  assert.ok(calls.some(c => c.sql.startsWith('update password_reset_tokens set used_at')));
  assert.ok(calls.some(c => c.sql.includes('admin.password_reset_by_operator')));
});

test('resetAdminPassword refuses inactive or non-superadmin users', async () => {
  const withTransaction = async operation => operation(async sql => {
    if (sql.startsWith('select id,email,is_active,is_superadmin')) {
      return { rows: [{ id: 'x', email: 'admin@example.com', is_active: true, is_superadmin: false }] };
    }
    throw new Error('unexpected_write');
  });
  await assert.rejects(
    resetAdminPassword({ email: 'admin@example.com', newPassword: 'VeryStrongPassword#2026', withTransaction, rounds: 4 }),
    /admin_not_found/
  );
});

test('resetAdminPassword validates email and password before any transaction', async () => {
  let called = false;
  const withTransaction = async () => { called = true; };
  await assert.rejects(resetAdminPassword({ email: 'bad', newPassword: 'short', withTransaction }), /invalid_email/);
  assert.equal(called, false);
});
