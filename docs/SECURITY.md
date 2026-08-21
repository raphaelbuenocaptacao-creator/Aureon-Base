# Aureon Base Security

## Principles

- Never store plaintext passwords.
- Never commit production secrets.
- Access tokens are short-lived JWTs.
- Refresh tokens are stored only as SHA-256 hashes in PostgreSQL.
- Every product request checks project membership and subscription state.
- Product data is scoped by `project_id` and `user_id`.
- Authentication routes are rate limited.
- CORS is allow-list based in production.
- Helmet security headers are enabled.
- Audit events record user, project and IP when available.

## Required production secrets

Use different random values with at least 32 bytes of entropy for:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- PostgreSQL password / managed database credentials
- future payment webhook secrets

## Founder / tester access

`LIFETIME_EMAILS` is a controlled bootstrap feature. Accounts listed there receive a `lifetime` subscription when they register. It must contain only trusted test/founder accounts.

## Public registration

Leave `ALLOWED_EMAILS` empty for a public SaaS. Populate it only for invite-only products.

## Production checklist

- HTTPS only
- database not publicly exposed unless the provider requires it and enforces TLS/authentication
- secrets stored in the hosting provider, never GitHub
- daily backups enabled
- database recovery tested periodically
- dependency and CI checks enabled
- payment webhooks verified cryptographically before subscription changes
- admin accounts protected separately from regular members

## Important limitation

Aureon Base v0.2 provides a strong application-level isolation model. Before high-scale or high-compliance workloads, add PostgreSQL Row Level Security, centralized persistent rate limiting, structured observability, secret rotation and independent penetration testing.
