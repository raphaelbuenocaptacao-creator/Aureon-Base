# Aureon Base Deployment

## Production topology

TradeVision / other Aureon SaaS -> HTTPS -> Aureon Base API -> PostgreSQL

## Required services

1. Node.js 20+ or Docker host for the API.
2. PostgreSQL 16-compatible database.
3. HTTPS endpoint.
4. Secret manager / environment variables.
5. Automated database backups.

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

Leave `ALLOWED_EMAILS` empty for public registration.

## First production deploy

1. Provision PostgreSQL.
2. Run `database/schema.sql` on a fresh database, or apply migrations in order to an existing database.
3. Deploy the API using `npm start` or the provided Dockerfile.
4. Set all environment variables in the host dashboard.
5. Confirm `GET /health` returns HTTP 200.
6. Confirm `GET /ready` returns `database: online`.
7. Register a test customer and confirm a 7-day `trialing` subscription is created.
8. Register the founder/tester account and confirm it receives `lifetime` access.
9. Set `CORS_ORIGINS` to the exact production PWA domains.
10. Connect each SaaS through `sdk/aureon.js`.

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
