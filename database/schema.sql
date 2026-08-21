create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  trial_days integer not null default 7 check (trial_days between 0 and 90),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists project_users (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null default 'BRL',
  interval text not null default 'month' check (interval in ('month','year','lifetime')),
  is_active boolean not null default true,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id,code)
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid references plans(id) on delete set null,
  status text not null check (status in ('trialing','active','past_due','canceled','expired','lifetime')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,user_id)
);
create index if not exists idx_subscriptions_access on subscriptions(project_id,user_id,status);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  refresh_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_user on sessions(user_id);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['read'],
  is_active boolean not null default true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  event text not null,
  ip inet,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user_time on audit_logs(user_id,created_at desc);
create index if not exists idx_audit_project_time on audit_logs(project_id,created_at desc);

create table if not exists trading_operations (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  asset text not null,
  side text not null check (side in ('Compra','Venda')),
  contracts integer not null check (contracts > 0 and contracts <= 1000),
  result numeric(14,2) not null,
  stop_planned numeric(14,2) not null default 0 check (stop_planned >= 0),
  setup text not null default 'Sem setup',
  note text not null default '',
  operated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists trading_settings (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  daily_stop numeric(14,2) not null default 500,
  daily_target numeric(14,2) not null default 1000,
  base_contracts integer not null default 1,
  profit_step numeric(14,2) not null default 1000,
  max_contracts integer not null default 20,
  updated_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create index if not exists idx_trading_operations_user_time on trading_operations(user_id, operated_at desc);
create index if not exists idx_trading_operations_project_user on trading_operations(project_id,user_id);

insert into projects(slug,name,trial_days)
values('tradevision','TradeVision',7)
on conflict (slug) do update set trial_days=excluded.trial_days;

insert into plans(project_id,code,name,price_cents,currency,interval,features)
select id,'pro-monthly','TradeVision Pro',3990,'BRL','month','{"analytics":true,"sync":true,"pwa":true}'::jsonb
from projects where slug='tradevision'
on conflict(project_id,code) do nothing;
