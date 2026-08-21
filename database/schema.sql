create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists project_users (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create table if not exists audit_logs (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists trading_operations (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  asset text not null,
  side text not null,
  contracts integer not null check (contracts > 0),
  result numeric(14,2) not null,
  stop_planned numeric(14,2) not null default 0,
  setup text not null default 'Sem setup',
  note text not null default '',
  operated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trading_operations_user_time on trading_operations(user_id, operated_at desc);
create index if not exists idx_trading_operations_project_user on trading_operations(project_id,user_id);

insert into projects(slug,name)
values('tradevision','TradeVision')
on conflict (slug) do nothing;
