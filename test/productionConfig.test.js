import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfig } from '../src/validateProductionConfig.js';
import { getPublicPasswordRecoveryReadiness } from '../src/passwordRecoveryReadiness.js';

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

test('public recovery readiness exposes status without secret values', () => {
  const apiKey = 're_secret_value_that_must_never_leak';
  const sender = 'Aureon Base <security@example.com>';
  const result = getPublicPasswordRecoveryReadiness({
    VERCEL_ENV: 'production',
    RESEND_API_KEY: apiKey,
    MAIL_FROM: sender,
  });

  assert.deepEqual(result, {
    configured: true,
    production: true,
    provider: 'resend',
    sender_configured: true,
    verified_sender_required: true,
    issues: [],
  });
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.equal(JSON.stringify(result).includes(sender), false);
  assert.equal(Object.hasOwn(result, 'api_key_configured'), false);
});
