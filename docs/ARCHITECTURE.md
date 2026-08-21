# Aureon Base Architecture

Aureon Base is the shared backend platform for Aureon SaaS products.

## Core flow

Client PWA / Web App -> Aureon SDK -> Aureon Base API -> PostgreSQL

## Isolation model

- `projects` represents one SaaS product.
- `project_users` defines which users belong to each SaaS and their role.
- `subscriptions` controls trial, paid, canceled and lifetime access per user and per SaaS.
- Product-specific tables always carry both `project_id` and `user_id` when the data is private to an end user.
- One SaaS never receives another SaaS user's data by default.

## Shared services

Aureon Base centralizes:

- authentication and sessions
- users
- projects / SaaS catalog
- roles
- plans
- trials
- subscriptions
- API keys
- audit logs
- webhook idempotency
- shared SDK
- health and readiness endpoints

## Product services

Product-specific business tables remain separate from the shared core. TradeVision is the first example with `trading_operations` and `trading_settings`.

## Access lifecycle

1. User registers for a project.
2. Aureon Base creates membership in that project.
3. Aureon Base creates a 7-day trial using `projects.trial_days`.
4. Product endpoints verify membership and subscription state.
5. Trialing, active and lifetime accounts are allowed.
6. Expired, canceled or past-due accounts can still authenticate, but paid product endpoints are blocked until access is restored.

This allows every future Aureon SaaS to reuse the same auth, billing and security platform without sharing business data unintentionally.
