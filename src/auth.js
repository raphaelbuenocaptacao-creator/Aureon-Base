import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import 'dotenv/config';

const accessSecret = String(process.env.JWT_SECRET || '');
const refreshSecret = String(process.env.JWT_REFRESH_SECRET || '');

if (!accessSecret || accessSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}
if (!refreshSecret || refreshSecret.length < 32) {
  throw new Error('JWT_REFRESH_SECRET must be configured with at least 32 characters');
}
if (crypto.timingSafeEqual(Buffer.from(hashSecret(accessSecret)), Buffer.from(hashSecret(refreshSecret)))) {
  throw new Error('JWT_REFRESH_SECRET must be different from JWT_SECRET');
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeExpiry(value, fallback) {
  const text = String(value || '').trim();
  return /^\d+[smhdwy]$/i.test(text) ? text : fallback;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function hasValidEmail(value) {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const accessExpiresIn = safeExpiry(process.env.JWT_EXPIRES_IN, '30m');
const refreshExpiresIn = safeExpiry(process.env.JWT_REFRESH_EXPIRES_IN, '30d');

// `server.js` expects REFRESH_TOKEN_DAYS to be a plain number because it is
// interpolated as a PostgreSQL interval. Normalize bad values such as `30d`,
// empty strings or NaN so a successful password check can never fail while
// creating the session row.
const configuredRefreshDays = Number(process.env.REFRESH_TOKEN_DAYS);
if (!Number.isFinite(configuredRefreshDays) || configuredRefreshDays < 1 || configuredRefreshDays > 365) {
  process.env.REFRESH_TOKEN_DAYS = '30';
} else {
  process.env.REFRESH_TOKEN_DAYS = String(Math.trunc(configuredRefreshDays));
}

export function signAccessToken(user) {
  if (!isUuid(user?.id) || !hasValidEmail(user?.email)) throw new Error('invalid_user_claims');
  return jwt.sign(
    { sub: user.id, email: user.email, type: 'access' },
    accessSecret,
    {
      expiresIn: accessExpiresIn,
      issuer: 'aureon-base',
      audience: 'aureon-apps',
      algorithm: 'HS256',
      jwtid: crypto.randomUUID(),
    }
  );
}

export function signRefreshToken(user, sessionId) {
  if (!isUuid(user?.id) || !isUuid(sessionId)) throw new Error('invalid_refresh_claims');
  return jwt.sign(
    { sub: user.id, sid: sessionId, type: 'refresh' },
    refreshSecret,
    {
      expiresIn: refreshExpiresIn,
      issuer: 'aureon-base',
      audience: 'aureon-apps',
      algorithm: 'HS256',
      jwtid: crypto.randomUUID(),
    }
  );
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, refreshSecret, {
    issuer: 'aureon-base',
    audience: 'aureon-apps',
    algorithms: ['HS256'],
  });
  if (payload.type !== 'refresh' || !isUuid(payload.sub) || !isUuid(payload.sid) || !isUuid(payload.jti)) {
    throw new Error('invalid_refresh_claims');
  }
  return payload;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    const payload = jwt.verify(token, accessSecret, {
      issuer: 'aureon-base',
      audience: 'aureon-apps',
      algorithms: ['HS256'],
    });
    if (payload.type !== 'access' || !isUuid(payload.sub) || !isUuid(payload.jti) || !hasValidEmail(payload.email)) {
      return res.status(401).json({ error: 'invalid_token_claims' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }
}
