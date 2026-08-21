import jwt from 'jsonwebtoken';
import 'dotenv/config';

const accessSecret = process.env.JWT_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

if (!accessSecret || accessSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, type: 'access' },
    accessSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m', issuer: 'aureon-base', audience: 'aureon-apps' }
  );
}

export function signRefreshToken(user, sessionId) {
  return jwt.sign(
    { sub: user.id, sid: sessionId, type: 'refresh' },
    refreshSecret,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d', issuer: 'aureon-base', audience: 'aureon-apps' }
  );
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, refreshSecret, { issuer: 'aureon-base', audience: 'aureon-apps' });
  if (payload.type !== 'refresh') throw new Error('invalid_token_type');
  return payload;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    const payload = jwt.verify(token, accessSecret, { issuer: 'aureon-base', audience: 'aureon-apps' });
    if (payload.type !== 'access') return res.status(401).json({ error: 'invalid_token_type' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }
}
