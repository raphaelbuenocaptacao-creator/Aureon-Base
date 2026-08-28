# RLS metadata validation — 2026-08-28

This document records non-production validation evidence for the next RLS expansion step.

## Scope

Tables evaluated: `project_collections` and `project_environments`.

## Production baseline before change

- `storage_objects`: RLS enabled.
- `project_records`: RLS enabled.
- `project_collections`: RLS not yet enabled in production.
- `project_environments`: RLS not yet enabled in production.
- `project_users`, `subscriptions`, `api_keys`: RLS not yet enabled in production.

## Temporary-branch validation

Migration ID: `5dbe09e3-44a6-43f4-b3f2-1c28e2620051`.

Temporary Neon branch: `mcp-migration-2026-08-28T19-53-49` (`br-winter-heart-au0jtrpn`).

The migration grants the restricted application role read access to the two metadata tables, enables RLS on them, and scopes reads to the tenant project context.

Validation under `aureon_app` for an existing project with known metadata returned:

- visible collections: 7
- cross-tenant collections: 0
- visible environments: 3
- cross-tenant environments: 0

A second tenant-context check returned 3 visible environments and 0 cross-tenant environments.

Result: **PASS on temporary branch**.

## Safety

No production schema or data was changed by this validation. No fixtures were inserted. The production application remains on the previously validated schema until the migration is explicitly approved and completed.

## Remaining work before production completion

1. Apply the already-tested migration to the parent branch through the Neon migration completion workflow.
2. Wire metadata reads in `platformData.js` to the restricted tenant context so PostgreSQL RLS is enforced in the HTTP path as well as by explicit predicates.
3. Add route-level regression tests.
4. Run CI and deploy.
5. Revalidate production health and tenant isolation before marking the tables complete.
