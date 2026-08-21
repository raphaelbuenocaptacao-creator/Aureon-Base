# Aureon Base

Aureon Base is the shared backend platform for Aureon SaaS products. Version `0.2` centralizes authentication, sessions, users, SaaS projects, trials, plans, subscriptions, audit logs and a JavaScript SDK while keeping each product's business data isolated.

## Current capabilities

- Node.js + Express API
- PostgreSQL
- bcrypt password hashing
- short-lived JWT access tokens
- hashed refresh-token sessions and logout revocation
- multi-SaaS project membership and roles
- 7-day trials configurable per SaaS
- monthly/yearly/lifetime plan model
- subscription access enforcement
- founder/tester lifetime accounts
- API-key storage model
- webhook idempotency table
- audit logs with user/project/IP context
- CORS allow list, Helmet and rate limiting
- health (`/health`) and readiness (`/ready`) endpoints
- JavaScript SDK with automatic access-token refresh
- Docker development stack
- versioned database migration for v0.2
- GitHub Actions validation

## TradeVision

TradeVision is the first Aureon SaaS using Aureon Base. The default seed creates:

- project: `tradevision`
- trial: 7 days
- plan: `TradeVision Pro`
- reference price: R$ 39.90/month (`3990` cents)

The tester/founder e-mail can be configured through `LIFETIME_EMAILS` so it bypasses billing without weakening normal customer access control.

## Access lifecycle

`register -> membership -> trial -> active subscription -> canceled/expired`

Users can always authenticate while active as users. Paid product endpoints additionally require valid project membership plus a valid `trialing`, `active` or `lifetime` subscription.

## Main endpoints

```text
GET    /health
GET    /ready
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /me
GET    /projects
GET    /projects/:slug/access
GET    /projects/:slug/plans
GET    /projects/:slug/operations
POST   /projects/:slug/operations
DELETE /projects/:slug/operations/:id
GET    /projects/:slug/settings
PUT    /projects/:slug/settings
GET    /admin/overview
```

## Local development

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Then open `http://localhost:3000/ready`.

## Repository structure

```text
database/schema.sql
database/migrations/002_multisaas.sql
sdk/aureon.js
src/auth.js
src/db.js
src/server.js
docs/ARCHITECTURE.md
docs/SECURITY.md
docker-compose.yml
Dockerfile
```

## Production

Aureon Base is an API service and cannot be hosted by GitHub Pages. Deploy the API to a Node/container host and PostgreSQL to a managed or self-hosted database. Keep all production secrets outside GitHub. See `docs/DEPLOYMENT.md` and `docs/SECURITY.md`.

## Scope

Aureon Base is intentionally not a clone of every Supabase feature. It is Aureon's own backend platform, designed to grow around the actual needs of Aureon SaaS products. Storage, realtime, payment-provider webhooks, password recovery, persistent distributed rate limiting and PostgreSQL RLS are planned as later layers.
