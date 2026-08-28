# Aureon Base — Validation Status

Last reviewed: 2026-08-28

This file records evidence-backed production validation. It must not contain secrets, credentials, tokens, connection strings, or private user data.

## Production baseline

- Public URL: https://aureonbase.vercel.app
- `/ready`: HTTP 200 on the last validated production deployment.
- Database: `neondb`
- Engine: PostgreSQL 18.6
- Current production commit at this review: `a28e96d5f480c76e0f3b317a85da33442402f28a`
- Vercel deployment for that commit: READY.
- Runtime error scan after deploy: no error/fatal logs found in the validated window.

## Storage / tenant isolation

Evidence confirmed:

- `storage_objects` has PostgreSQL RLS enabled in production.
- Storage API routes execute through `withTenantContext`.
- Application RLS role `aureon_app` exists with `BYPASSRLS = false` and `LOGIN = false`.
- Production PostgreSQL E2E used disposable storage objects in two real projects and the real restricted `aureon_app` role/context.
- Tenant A could read its own private storage row.
- Tenant A could not read the private row belonging to tenant B.
- A cross-tenant INSERT was rejected by RLS.
- Cross-tenant UPDATE and DELETE affected 0 rows.
- Disposable fixtures were removed in the same controlled transaction flow; final residue check returned 0 test storage objects.
- CI includes Storage validation and Storage/RLS route regression tests.

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
- Reset completion was changed to use one database transaction, so token consumption, password update and session/token revocation are atomic.
- CI includes password recovery lifecycle, atomicity, route regression and mobile recovery UI regression tests.

Still required before Password Recovery can be marked complete:

- Disposable-account black-box E2E: issue -> consume -> reuse rejected.
- Expired/revoked token E2E against a disposable production-equivalent fixture.
- Delivery path evidence for the configured recovery email provider without exposing provider credentials.

## RLS coverage audit

RLS enabled in production on:

- `storage_objects`
- `project_records`

`project_records` evidence confirmed:

- The production table has RLS enabled with the tenant policy active.
- `aureon_app` has the required CRUD privileges while remaining the restricted non-BYPASSRLS execution role.
- The API record operations were deployed through `withTenantContext` while retaining explicit project/environment/owner predicates as defense in depth.
- Temporary-branch E2E verified that one tenant/user could read its own rows, could not read another member's owner-scoped rows, and cross-owner mutation affected 0 rows.
- The migration was applied to the production parent branch without destructive schema changes and the temporary migration branch was removed.
- The production deployment for the matching application change is READY and `/ready` returned HTTP 200 afterward.

Core multi-tenant tables still observed without validated RLS coverage include:

- `project_collections`
- `project_environments`
- `project_users`
- `subscriptions`
- `api_keys`

Do not promote these remaining tables to RLS-complete until policy, grants, application execution context and regression tests are deployed and validated together.

## Realtime

No production realtime transport has been validated yet. Realtime remains incomplete until project membership is authenticated per connection, events are scoped by project, disconnect/revocation behavior is tested, and cross-project delivery is proven impossible.

## Completion rule

No capability is promoted to complete solely because code exists. Completion requires passing automated tests plus production or production-equivalent evidence for the relevant security boundary.
