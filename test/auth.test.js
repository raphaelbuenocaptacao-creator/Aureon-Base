import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret-32-characters-minimum-123456';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-characters-minimum-12345';

const { signAccessToken, signRefreshToken, verifyRefreshToken, requireAuth } = await import('../src/auth.js');

const user = {
  id: '2f1b0f42-1b3b-4f44-8cc5-3ecaa5dc53b2',
  email: 'admin@aureon.test',
};
const sessionId = '0b607cf0-8ca1-4a04-9bf0-8c65e8726044';

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('refresh token is signed with expected immutable claims', () => {
  const token = signRefreshToken(user, sessionId);
  const payload = verifyRefreshToken(token);
  assert.equal(payload.sub, user.id);
  assert.equal(payload.sid, sessionId);
  assert.equal(payload.type, 'refresh');
  assert.match(payload.jti, /^[0-9a-f-]{36}$/i);
});

test('refresh token rejects malformed and oversized input before verification', () => {
  assert.throws(() => verifyRefreshToken('not-a-jwt'));
  assert.throws(() => verifyRefreshToken(`a.${'b'.repeat(5000)}.c`));
});

test('access middleware accepts a valid access token', () => {
  const token = signAccessToken(user);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = responseMock();
  let called = false;

  requireAuth(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.user.sub, user.id);
  assert.equal(req.user.email, user.email);
});

test('access middleware rejects malformed bearer tokens', () => {
  const req = { headers: { authorization: 'Bearer definitely-not-a-jwt' } };
  const res = responseMock();
  let called = false;

  requireAuth(req, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'invalid_token' });
});

test('token signing rejects invalid user claims', () => {
  assert.throws(() => signAccessToken({ id: 'bad-id', email: 'admin@aureon.test' }));
  assert.throws(() => signAccessToken({ id: user.id, email: 'not-an-email' }));
  assert.throws(() => signRefreshToken({ id: 'bad-id' }, sessionId));
});
