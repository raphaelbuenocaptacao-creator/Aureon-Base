import 'dotenv/config';
import { withTransaction, pool } from '../src/db.js';
import { resetAdminPassword } from '../src/adminPasswordReset.js';

const email = String(process.env.AUREON_ADMIN_EMAIL || '').trim().toLowerCase();
const newPassword = String(process.env.AUREON_ADMIN_NEW_PASSWORD || '');
const confirmEmail = String(process.env.AUREON_ADMIN_RESET_CONFIRM_EMAIL || '').trim().toLowerCase();

if (!email || !newPassword || confirmEmail !== email) {
  console.error('admin_password_reset_blocked: set AUREON_ADMIN_EMAIL, AUREON_ADMIN_NEW_PASSWORD and matching AUREON_ADMIN_RESET_CONFIRM_EMAIL');
  process.exitCode = 2;
} else {
  try {
    const user = await resetAdminPassword({ email, newPassword, withTransaction });
    console.log(JSON.stringify({ ok: true, email: user.email, is_superadmin: true, sessions_revoked: true, reset_tokens_revoked: true }));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || 'admin_password_reset_failed') }));
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}
