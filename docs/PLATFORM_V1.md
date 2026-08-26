# Aureon Base V1

Aureon Base V1 is the shared Backend-as-a-Service layer for Aureon products.

## Core modules

1. Projects — isolated SaaS tenants such as `tradevision` and `wilpay`.
2. Auth — email/password registration, login, refresh sessions, logout and password recovery.
3. Users — global identities plus project membership and roles.
4. Database API — project-scoped JSON collections and records.
5. Security — membership, subscription access, owner-scoped collections and audit logs.
6. SDK — a client facade with `aureon.auth`, `aureon.projects` and `aureon.from()`.

## Data isolation

Every project record is bound to a `project_id`. Collections can additionally be `owner_scoped`, which means a normal user only sees records owned by their authenticated user id. Administrative access remains explicit and auditable.

## W.I.L Pay

`wilpay` is seeded as an Aureon Base project. Its initial collections are:

- `profiles`
- `loans`
- `payments`
- `score_events`
- `location_consents`
- `location_history`

This allows W.I.L Pay to move away from direct dependency on a vendor-specific auth/data client. The app should talk only to Aureon Base through the SDK.

## SDK direction

```js
const aureon = createAureon('https://aureonbase.vercel.app', { project: 'wilpay' })

await aureon.auth.signIn({ email, password })
await aureon.from('loans').list()
await aureon.from('loans').insert({ amount: 1000, status: 'pending' })
```

## Roadmap

V1: Projects, Auth, Users, Data API, Audit Logs, SDK.

V1.1: API key console, project domains, admin project creation, collection manager.

V1.2: Storage buckets and signed upload/download URLs.

V1.3: Realtime events and webhooks.

V1.4: Functions/jobs and scheduled tasks.

The PostgreSQL engine remains replaceable. Aureon applications depend on Aureon Base, not directly on Neon or Supabase.
