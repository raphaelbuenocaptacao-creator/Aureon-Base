# Aureon Base Production Validation Runbook

This runbook defines the minimum evidence required before promoting production capabilities from partial to complete. It is intentionally secret-safe: do not print tokens, passwords, API keys, reset links, mailbox contents, or raw authorization headers in logs or issues.

## Status rule

Use these states consistently:

- ✅ complete: implementation exists and the required automated and production evidence has passed.
- 🟡 partial: implementation exists, but one or more required production proofs are missing or blocked.
- ❌ missing/broken: implementation does not exist or a required validation fails.

A successful build, preview deploy, provider acceptance response, or unit test alone is not enough to promote a provider-dependent production capability to ✅.

## 1. Storage tenant isolation

Required evidence:

1. authenticated tenant A can create, list, download and delete its own temporary object;
2. authenticated tenant B can do the same in B;
3. A cannot read or mutate B's object;
4. B cannot read or mutate A's object;
5. unauthenticated list/read/write attempts fail closed;
6. temporary validation objects are removed in cleanup;
7. PostgreSQL RLS tests pass for storage metadata.

Do not retain validation objects after the smoke test.

## 2. Password recovery

Production prerequisites:

- `RESEND_API_KEY` exists only in the deployment secret store;
- `MAIL_FROM` is configured with a sender on a verified provider domain;
- a controlled production test account and mailbox are available.

Required evidence:

1. `POST /auth/request-password-reset` returns the same generic response for known and unknown addresses;
2. the provider accepts the message;
3. the message is actually received by the controlled mailbox;
4. the raw reset token never appears in application, CI or audit logs;
5. the token expires;
6. the token is single-use;
7. creating a newer reset revokes the older token;
8. provider delivery failure revokes the newly created token;
9. successful reset revokes existing sessions;
10. login with the old password fails;
11. login with the new password succeeds for the same account.

Retain only redacted evidence: timestamps, HTTP status, boolean outcomes, test account identifier if non-sensitive, provider message id if safe, and the commit/deployment being validated.

## 3. PostgreSQL RLS / multi-tenant isolation

Required evidence:

1. migrations are additive and non-destructive;
2. the application role has no `BYPASSRLS`;
3. project-scoped tables have RLS enabled and appropriate policies;
4. forged tenant context without project membership cannot read or insert tenant data;
5. a legitimate project member can perform the allowed operation;
6. automated PostgreSQL isolation tests pass on the same schema revision being deployed.

Do not weaken RLS to make application tests pass.

## 4. Realtime tenant isolation

Required production evidence with two independent tenants/projects:

1. tenant A publishes an event in A and reads it back from A;
2. tenant B publishes an event in B and reads it back from B;
3. A cannot publish into B;
4. B cannot publish into A;
5. A never receives B's test event;
6. B never receives A's test event;
7. unauthenticated publish/read fail closed;
8. PostgreSQL RLS tests for realtime pass.

Use unique, non-sensitive correlation ids in test payloads and avoid customer data.

## 5. Authenticated production E2E configuration

The CI production smoke may execute tenant A/B validation only when all required secrets are configured. Treat partial configuration as invalid rather than silently testing one side.

Required CI secrets:

- `AUREON_E2E_A_TOKEN`
- `AUREON_E2E_A_PROJECT`
- `AUREON_E2E_B_TOKEN`
- `AUREON_E2E_B_PROJECT`

Rules:

- use dedicated validation users/projects, not founder or customer credentials;
- tokens must have the minimum permissions required;
- rotate test credentials periodically and immediately after suspected exposure;
- never echo secret values;
- if all four values are not available, report the authenticated production smoke as `NÃO TESTADO`, not `PASS`.

## 6. CI and deployment evidence

For every release candidate, record:

- Git commit SHA;
- CI run URL and conclusion;
- migration/schema validation result;
- automated authentication and PostgreSQL isolation result;
- Vercel deployment id/URL and state;
- `/ready` result for the deployment being validated;
- authenticated production E2E result or explicit `NÃO TESTADO` reason;
- provider-dependent password-recovery result or explicit `NÃO TESTADO` reason.

If production deployment is rate-limited or otherwise blocked, CI success does not imply production validation. Keep the affected capability at 🟡 until the exact commit is deployed and validated.

## 7. Secret-safe evidence format

Recommended evidence record:

```text
commit: <sha>
deployment: <deployment-id-or-url>
ready: PASS|FAIL
ci: PASS|FAIL
storage-e2e: PASS|FAIL|NÃO TESTADO
realtime-e2e: PASS|FAIL|NÃO TESTADO
password-email-delivery: PASS|FAIL|NÃO TESTADO
rls: PASS|FAIL
notes: <redacted blockers only>
```

Never include raw credentials, reset tokens, mailbox bodies, authorization headers, API keys or full environment-variable values.