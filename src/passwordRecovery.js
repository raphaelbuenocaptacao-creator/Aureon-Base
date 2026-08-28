import crypto from 'node:crypto';

const DEFAULT_TTL_MINUTES = 10;

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function issuePasswordResetToken({ query, userId, requestedIp = null, ttlMinutes = DEFAULT_TTL_MINUTES }) {
  if (typeof query !== 'function') throw new TypeError('query_required');
  if (!userId) throw new TypeError('user_id_required');
  const ttl = Math.min(Math.max(Number(ttlMinutes) || DEFAULT_TTL_MINUTES, 5), 60);
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);

  await query(
    `update password_reset_tokens
       set used_at=coalesce(used_at, now())
     where user_id=$1 and used_at is null`,
    [userId],
  );

  await query(
    `insert into password_reset_tokens(user_id,token_hash,expires_at,requested_ip)
     values($1,$2,now()+($3 || ' minutes')::interval,$4)`,
    [userId, tokenHash, String(ttl), requestedIp],
  );

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
