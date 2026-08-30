import { validateProductionConfig } from './validateProductionConfig.js';

function configured(value) {
  return Boolean(String(value || '').trim());
}

export function getPasswordRecoveryReadiness(env = process.env) {
  const validation = validateProductionConfig(env);
  return {
    configured: validation.ok,
    production: validation.production,
    provider: configured(env.RESEND_API_KEY) ? 'resend' : null,
    api_key_configured: configured(env.RESEND_API_KEY),
    sender_configured: configured(env.MAIL_FROM),
    verified_sender_required: validation.production,
    issues: validation.errors.map(error => {
      if (error.startsWith('RESEND_API_KEY')) return 'provider_api_key_missing';
      if (error.startsWith('MAIL_FROM must use')) return 'verified_sender_required';
      if (error.startsWith('MAIL_FROM')) return 'sender_missing';
      return 'configuration_invalid';
    }),
  };
}
