import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfig } from '../src/validateProductionConfig.js';

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

test('production rejects the resend.dev sandbox sender', () => {
  const result = validateProductionConfig({
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'configured-secret',
    MAIL_FROM: 'Aureon Base <onboarding@resend.dev>',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /verified non-resend\.dev sender/);
});

test('production accepts configured provider and verified custom sender', () => {
  const result = validateProductionConfig({
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'configured-secret',
    MAIL_FROM: 'Aureon Base <no-reply@example.com>',
  });
  assert.deepEqual(result, { ok: true, production: true, errors: [] });
});
