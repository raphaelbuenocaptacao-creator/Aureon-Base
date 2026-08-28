# Aureon Base — Validation Status

Last reviewed: 2026-08-28

This file records evidence-backed production validation. It must not contain secrets, credentials, tokens, connection strings, or private user data.

## Production baseline

- Public URL: https://aureonbase.vercel.app
- `/ready`: HTTP 200
- Database: `neondb`
- Engine: PostgreSQL 18.6
- Connection source reported by readiness endpoint: `DATABASE_URL`
- Current production commit at review time: `98062e1ee8f4fecad8fc9338cdd7e6e3774cf4e6`
- Vercel deployment for that commit: READY
- GitHub Actions `Aureon Base CI` run #93: success
- Vercel runtime error scan over the preceding 2 hours: no runtime errors found

## Storage / tenant isolation

Evidence confirmed:

- `storage_objects` has PostgreSQL RLS enabled.
- Storage API routes execute through `withTenantContext`.
- Application RLS role `aureon_app` exists with `BYPASSRLS = false` and `LOGIN = false`.
- Database owner `neondb_owner` has `BYPASSRLS = true`; tenant-facing data access must therefore continue to use the restricted role/context helper rather than relying on owner connections alone.
- CI includes Storage validation and Storage/RLS route regression tests.
- Production PostgreSQL E2E used disposable users/projects/objects and the real `aureon_app` RLS context. A user in tenant A could read its own private object and a project-visible peer object, could not see another user's private object, and could not see or update a project-visible object from tenant B.
- The disposable E2E fixtures were deleted in the same transaction flow; final residue checks returned 0 users, 0 projects and 0 storage objects.

Still required before Storage can be marked complete:

- Authenticated black-box HTTP E2E with disposable credentials: tenant A upload/read/delete.
- Cross-tenant HTTP attempt from tenant B must be denied/not found.

## Password recovery

Evidence confirmed:

- Reset tokens are cryptographically random.
- Only the SHA-256 token hash is persisted.
- Tokens have expiration, prior-token revocation, and one-time consumption.
- Password reset revokes active sessions after a successful change.
- Reset request response is uniform for unknown/known accounts to reduce account enumeration.
- CI includes password recovery lifecycle and route regression tests.

Open issue found during review:

- Token consumption currently occurs before password update/session revocation in separate database operations. A database failure after token consumption could invalidate the token without completing the password change. This is safe from takeover, but not atomic. The intended fix is to run token consumption, password update and session/token revocation in one database transaction.

Still required before Password Recovery can be marked complete:

- Make reset completion atomic.
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