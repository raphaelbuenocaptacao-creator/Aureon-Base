# Aureon Base Deployment

## Production topology

TradeVision / other Aureon SaaS -> HTTPS -> Aureon Base API -> PostgreSQL

## Required services

1. Node.js 20+ or Docker host for the API.
2. PostgreSQL 16-compatible database.
3. HTTPS endpoint.
4. Secret manager / environment variables.
5. Automated database backups.
6. Transactional e-mail provider for password recovery.

## Required environment variables

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `REFRESH_TOKEN_DAYS`
- `CORS_ORIGINS`
- `DEFAULT_PROJECT_SLUG`
- `LIFETIME_EMAILS`
- `RESEND_API_KEY` for password-recovery delivery
- `MAIL_FROM` using a sender on a domain verified by the e-mail provider

Leave `ALLOWED_EMAILS` empty for public registration.

Never commit production secret values. Configure `RESEND_API_KEY` only in the deployment environment. For production, do not rely on a sandbox sender such as `onboarding@resend.dev`; use a verified domain and a dedicated sender such as `security@your-domain`.

## First production deploy

1. Provision PostgreSQL.
2. Run `database/schema.sql` on a fresh database, or apply migrations in order to an existing database.
3. Deploy the API using `npm start` or the provided Dockerfile.
4. Set all environment variables in the host dashboard.
5. Confirm `GET /health` returns HTTP 200.
6. Confirm `GET /ready` returns HTTP 200 and reports the configured PostgreSQL database.
7. Register a test customer and confirm a 7-day `trialing` subscription is created.
8. Register the founder/tester account and confirm it receives `lifetime` access.
9. Set `CORS_ORIGINS` to the exact production PWA domains.
10. Connect each SaaS through `sdk/aureon.js`.
11. Trigger `POST /auth/request-password-reset` for a controlled production test account, confirm the API keeps the response generic, and verify the message reaches the intended mailbox.
12. Complete the reset through `POST /auth/reset-password`, confirm the token cannot be reused, and confirm older sessions are revoked.

## Password-recovery production evidence

A provider HTTP acceptance alone is not considered proof of mailbox delivery. To mark password recovery as fully validated in an environment, retain evidence of all of the following without storing or publishing the raw reset token:

- provider configuration is present (`RESEND_API_KEY` and a verified `MAIL_FROM`)
- reset request returns the generic anti-enumeration response
- the message reaches a controlled mailbox
- the token expires and is single-use
- issuing a newer token revokes the older one
- successful reset revokes existing sessions
- failed provider delivery revokes the newly issued token
- audit metadata does not contain the raw token

Do not paste the reset token, API key, e-mail body, or production credentials into issues, CI logs, screenshots, or commit history.

## Before charging customers

- choose a payment provider
- verify webhook signatures
- map provider events to `subscriptions`
- use `webhook_events` for idempotency
- test renewal, cancellation, failed payment and refund flows
- enable daily backups
- test restore procedure
- enable uptime monitoring
- add a custom API domain when ready

## Recommended URL layout

- API: `https://api.aureonbase.com`
- TradeVision PWA: its own public domain or GitHub Pages domain
- future SaaS products: separate domains, same Aureon Base API
