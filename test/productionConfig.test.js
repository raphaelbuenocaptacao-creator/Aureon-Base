import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfig } from '../src/validateProductionConfig.js';

const secureProductionEnv = {
  VERCEL_ENV: 'production',
  RESEND_API_KEY: 'configured-secret',
  MAIL_FROM: 'Aureon Base <no-reply@example.com>',
  JWT_SECRET: 'access-secret-with-at-least-32-characters-123',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters-456',
};

test('non-production environments do not require mail provider configuration', () => {
  assert.deepEqual(validateProductionConfig({ NODE_ENV: 'test' }), {
    ok: true,
    production: false,
    errors: [],
  });
});

test('production fails closed without recovery provider credentials', () => {
  const result = validateProductionConfig({ VERCEL_ENV: 'production' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /RESEND_API_KEY is required/);
  assert.match(result.errors.join('\n'), /MAIL_FROM is required/);
});

test('production rejects missing or weak JWT secrets', () => {
  const result = validateProductionConfig({
    ...secureProductionEnv,
    JWT_SECRET: 'too-short',
    JWT_REFRESH_SECRET: '',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /JWT_SECRET must contain at least 32 characters/);
  assert.match(result.errors.join('\n'), /JWT_REFRESH_SECRET must contain at least 32 characters/);
});

test('production requires separate access and refresh secrets', () => {
  const shared = 'shared-secret-with-at-least-32-characters-123';
  const result = validateProductionConfig({
    ...secureProductionEnv,
    JWT_SECRET: shared,
    JWT_REFRESH_SECRET: shared,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /JWT_REFRESH_SECRET must be different from JWT_SECRET/);
});

test('production rejects the resend.dev sandbox sender', () => {
  const result = validateProductionConfig({
    ...secureProductionEnv,
    MAIL_FROM: 'Aureon Base <onboarding@resend.dev>',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /verified non-resend\.dev sender/);
});

test('production accepts configured provider, verified sender and separate strong JWT secrets', () => {
  const result = validateProductionConfig(secureProductionEnv);
  assert.deepEqual(result, { ok: true, production: true, errors: [] });
});
