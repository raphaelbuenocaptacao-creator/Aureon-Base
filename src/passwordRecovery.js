import crypto from 'node:crypto';
import { validateProductionConfig } from './validateProductionConfig.js';

const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_COOLDOWN_SECONDS = 60;

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function assertPasswordRecoveryRuntimeConfigured(env = process.env) {
  const validation = validateProductionConfig(env);
  if (validation.ok) return true;
  const error = new Error('password_recovery_not_configured');
  error.code = 'PASSWORD_RECOVERY_NOT_CONFIGURED';
  throw error;
}

export async function issuePasswordResetToken({
  query,
  userId,
  requestedIp = null,
  ttlMinutes = DEFAULT_TTL_MINUTES,
  cooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
}) {
  if (typeof query !== 'function') throw new TypeError('query_required');
  if (!userId) throw new TypeError('user_id_required');
  assertPasswordRecoveryRuntimeConfigured();
  const ttl = Math.min(Math.max(Number(ttlMinutes) || DEFAULT_TTL_MINUTES, 5), 60);
  const cooldown = Math.min(Math.max(Number(cooldownSeconds) || DEFAULT_COOLDOWN_SECONDS, 30), 900);
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);

  const result = await query(
    `with lock_user as materialized (
       select pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) as acquired
     ), recent as materialized (
       select (not lock_user.acquired) or exists(
         select 1
           from password_reset_tokens
          where user_id=$1::uuid
            and created_at > now()-($5 || ' seconds')::interval
       ) as blocked
       from lock_user
     ), revoked as (
       update password_reset_tokens
          set used_at=coalesce(used_at, now())
        from recent
       where user_id=$1::uuid
         and used_at is null
         and recent.blocked=false
       returning id
     )
     insert into password_reset_tokens(user_id,token_hash,expires_at,requested_ip)
     select $1::uuid,$2,now()+($3 || ' minutes')::interval,$4
       from recent
      where recent.blocked=false
     returning id`,
    [userId, tokenHash, String(ttl), requestedIp, String(cooldown)],
  );

  if (!result?.rows?.[0]) {
    const error = new Error('password_reset_cooldown');
    error.code = 'PASSWORD_RESET_COOLDOWN';
    error.retryAfterSeconds = cooldown;
    throw error;
  }

  return { token, expiresInMinutes: ttl };
}

export async function consumePasswordResetToken({ query, userId, token }) {
  if (typeof query !== 'function') throw new TypeError('query_required');
  if (!userId || !token) return false;
  const tokenHash = hashResetToken(token);
  const result = await query(
    `update password_reset_tokens
        set used_at=now()
      where user_id=$1
        and token_hash=$2
        and used_at is null
        and expires_at > now()
      returning id`,
    [userId, tokenHash],
  );
  return Boolean(result?.rows?.[0]);
}
