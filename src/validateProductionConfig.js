function clean(value) {
  return String(value || '').trim();
}

export function validateProductionConfig(env = process.env) {
  const production = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';
  if (!production) return { ok: true, production: false, errors: [] };

  const errors = [];
  const apiKey = clean(env.RESEND_API_KEY);
  const mailFrom = clean(env.MAIL_FROM);
  const jwtSecret = clean(env.JWT_SECRET);
  const jwtRefreshSecret = clean(env.JWT_REFRESH_SECRET);

  if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must contain at least 32 characters in production');
  }
  if (jwtRefreshSecret.length < 32) {
    errors.push('JWT_REFRESH_SECRET must contain at least 32 characters in production');
  }
  if (jwtSecret && jwtRefreshSecret && jwtSecret === jwtRefreshSecret) {
    errors.push('JWT_REFRESH_SECRET must be different from JWT_SECRET in production');
  }

  if (!apiKey) errors.push('RESEND_API_KEY is required in production');
  if (!mailFrom) errors.push('MAIL_FROM is required in production');
  if (mailFrom && /@resend\.dev\b/i.test(mailFrom)) {
    errors.push('MAIL_FROM must use a verified non-resend.dev sender in production');
  }

  return { ok: errors.length === 0, production: true, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateProductionConfig(process.env);
  if (!result.ok) {
    console.error('production_config_invalid');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}
