begin;

alter table users add column if not exists is_superadmin boolean not null default false;
alter table projects add column if not exists trial_days integer not null default 7;
alter table projects add column if not exists is_active boolean not null default true;

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

alter table audit_logs add column if not exists project_id uuid;
alter table audit_logs add column if not exists ip inet;
create index if not exists idx_audit_user_time on audit_logs(user_id,created_at desc);
create index if not exists idx_audit_project_time on audit_logs(project_id,created_at desc);

update projects set trial_days=7 where slug='tradevision';
insert into plans(project_id,code,name,price_cents,currency,interval,features)
select id,'pro-monthly','TradeVision Pro',3990,'BRL','month','{"analytics":true,"sync":true,"pwa":true}'::jsonb
from projects where slug='tradevision'
on conflict(project_id,code) do nothing;

commit;
