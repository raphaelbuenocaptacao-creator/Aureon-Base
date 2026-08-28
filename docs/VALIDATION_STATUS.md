# Aureon Base — Validation Status

Last reviewed: 2026-08-28

This file records evidence-backed production validation. It must not contain secrets, credentials, tokens, connection strings, or private user data.

## Production baseline

- Public URL: https://aureonbase.vercel.app
- `/ready`: HTTP 200
- Database: `neondb`
- Engine: PostgreSQL 18.6
- Connection source reported by readiness endpoint: `DATABASE_URL`
- Current production commit at review time: `f2866a283e11b2fcac36ddafa0ff4955aa08d790`
- Vercel deployment for that commit: READY
- GitHub Actions `Aureon Base CI` run #92: success
- Vercel runtime error scan over the preceding 2 hours: no runtime errors found

## Storage / tenant isolation

Evidence confirmed:

- `storage_objects` has PostgreSQL RLS enabled.
- Storage API routes execute through `withTenantContext`.
- Application RLS role `aureon_app` exists with `BYPASSRLS = false` and `LOGIN = false`.
- Database owner `neondb_owner` has `BYPASSRLS = true`; tenant-facing data access must therefore continue to use the restricted role/context helper rather than relying on owner connections alone.
- CI includes Storage validation and Storage/RLS route regression tests.

Still required before Storage can be marked complete:

- Authenticated HTTP E2E with disposable fixtures: tenant A upload/read/delete.
- Cross-tenant HTTP attempt from tenant B must be denied/not found.
- Verify cleanup leaves no test objects or credentials behind.

## Password recovery

Evidence confirmed:

- Reset tokens are cryptographically random.
- Only the SHA-256 token hash is persisted.
- Tokens have expiration, prior-token revocation, and one-time consumption.
- Password reset revokes active sessions after a successful change.
- Reset request response is uniform for unknown/known accounts to reduce account enumeration.
- CI includes password recovery lifecycle and route regression tests.

Still required before Password Recovery can be marked complete:

- Disposable-account E2E: issue -> consume -> reuse rejected.
- Expired/revoked token E2E in an isolated test fixture.

## RLS coverage audit

RLS enabled on the Aureon Base core table:

- `storage_objects`

Core multi-tenant tables observed without RLS at review time include:

- `project_records`
- `project_collections`
- `project_environments`
- `project_users`
- `subscriptions`
- `trading_operations`
- `trading_settings`
- `api_keys`

Do not enable or force RLS on these tables until policies, grants, application execution context and regression tests are prepared together. The current API still uses explicit `project_id` / `user_id` predicates on several of these paths.

## Completion rule

No capability is promoted to complete solely because code exists. Completion requires passing automated tests plus production or production-equivalent evidence for the relevant security boundary.
