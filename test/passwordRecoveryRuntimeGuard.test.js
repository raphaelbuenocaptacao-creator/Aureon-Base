import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPasswordRecoveryRuntimeConfigured,
  issuePasswordResetToken,
} from '../src/passwordRecovery.js';

test('password recovery runtime rejects missing provider configuration in production', () => {
  assert.throws(
    () => assertPasswordRecoveryRuntimeConfigured({ VERCEL_ENV: 'production' }),
    error => error?.code === 'PASSWORD_RECOVERY_NOT_CONFIGURED',
  );
});

test('password recovery runtime rejects resend.dev sender in production', () => {
  assert.throws(
    () => assertPasswordRecoveryRuntimeConfigured({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 'configured-secret',
      MAIL_FROM: 'Aureon Base <onboarding@resend.dev>',
    }),
    error => error?.code === 'PASSWORD_RECOVERY_NOT_CONFIGURED',
  );
});

test('password recovery runtime accepts a configured custom sender', () => {
  assert.equal(assertPasswordRecoveryRuntimeConfigured({
    VERCEL_ENV: 'production',
    RESEND_API_KEY: 'configured-secret',
    MAIL_FROM: 'Aureon Base <no-reply@example.com>',
  }), true);
});

test('misconfigured production never reaches token persistence', async () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
  };
  let queryCalled = false;
  try {
    process.env.VERCEL_ENV = 'production';
    delete process.env.NODE_ENV;
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;

    await assert.rejects(
      issuePasswordResetToken({
        query: async () => {
          queryCalled = true;
          return { rows: [] };
        },
        userId: '00000000-0000-0000-0000-000000000001',
      }),
      error => error?.code === 'PASSWORD_RECOVERY_NOT_CONFIGURED',
    );
    assert.equal(queryCalled, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
