import bcrypt from 'bcryptjs';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resetAdminPassword({ email, newPassword, withTransaction, rounds = 12 }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const password = String(newPassword || '');
  if (!emailRegex.test(normalizedEmail)) throw new Error('invalid_email');
  if (password.length < 14 || password.length > 128) throw new Error('invalid_new_password');
  if (typeof withTransaction !== 'function') throw new Error('transaction_required');

  const passwordHash = await bcrypt.hash(password, rounds);
  return withTransaction(async query => {
    const found = await query(
      'select id,email,is_active,is_superadmin from users where email=$1 for update',
      [normalizedEmail]
    );
    const user = found.rows[0];
    if (!user || !user.is_active || !user.is_superadmin) throw new Error('admin_not_found');

    await query('update users set password_hash=$1,updated_at=now() where id=$2', [passwordHash, user.id]);
    await query('update sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [user.id]);
    await query('update password_reset_tokens set used_at=coalesce(used_at,now()) where user_id=$1 and used_at is null', [user.id]);
    await query(
      "insert into audit_logs(user_id,event,metadata) values($1,'admin.password_reset_by_operator',$2)",
      [user.id, JSON.stringify({ email: normalizedEmail })]
    );
    return { id: user.id, email: user.email, is_superadmin: user.is_superadmin };
  });
}
