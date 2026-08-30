import test from 'node:test';
import assert from 'node:assert/strict';
import { getPasswordRecoveryReadiness } from '../src/passwordRecoveryReadiness.js';

test('production readiness reports missing mail configuration without secrets', () => {
  const result = getPasswordRecoveryReadiness({ NODE_ENV: 'production' });
  assert.equal(result.configured, false);
  assert.equal(result.production, true);
  assert.equal(result.api_key_configured, false);
  assert.equal(result.sender_configured, false);
  assert.deepEqual(result.issues.sort(), ['provider_api_key_missing', 'sender_missing']);
  assert.equal(JSON.stringify(result).includes('RESEND_API_KEY'), false);
  assert.equal(JSON.stringify(result).includes('MAIL_FROM'), false);
});

test('production readiness recognizes configured verified sender without exposing values', () => {
  const secret = 're_test_secret_value';
  const sender = 'Aureon <security@example.com>';
  const result = getPasswordRecoveryReadiness({
    NODE_ENV: 'production',
    RESEND_API_KEY: secret,
    MAIL_FROM: sender,
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.configured, true);
  assert.equal(result.provider, 'resend');
  assert.equal(result.api_key_configured, true);
  assert.equal(result.sender_configured, true);
  assert.deepEqual(result.issues, []);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(sender), false);
});

test('production readiness rejects resend.dev sender', () => {
  const result = getPasswordRecoveryReadiness({
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 're_test_secret_value',
    MAIL_FROM: 'onboarding@resend.dev',
  });
  assert.equal(result.configured, false);
  assert.deepEqual(result.issues, ['verified_sender_required']);
});
