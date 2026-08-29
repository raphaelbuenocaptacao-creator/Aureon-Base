# Aureon Base

Aureon Base is the shared backend platform for Aureon SaaS products. It centralizes authentication, sessions, users, SaaS projects, subscriptions, audit logs, secure tenant storage, password recovery, PostgreSQL RLS, tenant-scoped realtime events and a JavaScript SDK while keeping each project's data isolated.

## Current capabilities

- Node.js + Express API
- PostgreSQL 18 validation in CI
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
- secure project/tenant storage with RLS and soft-delete semantics
- password recovery with hashed, expiring, single-use tokens and session revocation after reset
- advanced PostgreSQL RLS for project-scoped core data
- tenant-scoped realtime event publishing and cursor polling
- Docker development stack
- additive, versioned database migrations
- GitHub Actions validation against PostgreSQL 18
- black-box HTTP integration tests for password recovery, storage and realtime tenant isolation

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
POST   /auth/password/forgot
POST   /auth/password/reset
GET    /me
GET    /projects
GET    /projects/:slug/access
GET    /projects/:slug/plans
GET    /projects/:slug/operations
POST   /projects/:slug/operations
DELETE /projects/:slug/operations/:id
GET    /projects/:slug/settings
PUT    /projects/:slug/settings
POST   /api/projects/:slug/realtime/publish
GET    /api/projects/:slug/realtime/events
GET    /admin/overview
```

## Security and tenant isolation

Project-scoped queries execute with an explicit tenant context. The restricted application role does not have `BYPASSRLS`, and RLS policies enforce project isolation for tenant data. Storage, core multi-tenant tables and realtime events have PostgreSQL integration coverage. Realtime events are append-only for the restricted application role.

Password reset tokens are random, stored only as hashes, expire, are single-use, and previous tokens are revoked when a new reset is requested. A successful reset revokes existing sessions. External e-mail delivery still depends on the configured provider and must be validated separately in each production environment.

## Validation policy

A capability is not considered complete solely because code exists. CI runs syntax checks and automated tests against PostgreSQL 18, including black-box HTTP coverage for critical tenant-isolation flows. Production validation should additionally confirm `/ready`, protected-route behavior and provider-dependent integrations without exposing secrets.

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
database/migrations/
sdk/aureon.js
src/auth.js
src/db.js
src/passwordRecovery.js
src/realtime.js
src/server.js
test/
docs/ARCHITECTURE.md
docs/SECURITY.md
docker-compose.yml
Dockerfile
```

## Production

Aureon Base is an API service and cannot be hosted by GitHub Pages. Deploy the API to a Node/container host and PostgreSQL to a managed or self-hosted database. Keep all production secrets outside GitHub. See `docs/DEPLOYMENT.md` and `docs/SECURITY.md`.

## Scope

Aureon Base is Aureon's own backend platform, designed to grow around the actual needs of Aureon SaaS products. Provider-dependent features, such as external password-recovery e-mail delivery, remain environment-specific and are only considered validated after production evidence exists.
