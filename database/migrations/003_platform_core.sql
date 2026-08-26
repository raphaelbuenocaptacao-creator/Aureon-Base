-- Aureon Base Platform Core v1
-- Generic project-scoped data layer inspired by BaaS platforms.

create table if not exists project_collections (
  project_id uuid not null references projects(id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,62}$'),
  owner_scoped boolean not null default true,
  public_read boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(project_id,name)
);

create table if not exists project_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  collection text not null,
  owner_user_id uuid references users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_records_collection_fk
    foreign key(project_id,collection)
    references project_collections(project_id,name)
    on delete cascade
);

create index if not exists idx_project_records_collection_time
  on project_records(project_id,collection,created_at desc);
create index if not exists idx_project_records_owner_time
  on project_records(project_id,collection,owner_user_id,created_at desc);
create index if not exists idx_project_records_data_gin
  on project_records using gin(data);

create table if not exists project_environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null check (name in ('development','preview','production')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id,name)
);

create table if not exists project_domains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  origin text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id,origin)
);

insert into projects(slug,name,trial_days)
values('wilpay','W.I.L Pay',0)
on conflict(slug) do update set name=excluded.name,is_active=true;

insert into project_environments(project_id,name)
select id,env.name
from projects
cross join (values('development'),('preview'),('production')) env(name)
where slug in ('tradevision','wilpay')
on conflict(project_id,name) do nothing;

insert into project_collections(project_id,name,owner_scoped,public_read)
select p.id,c.name,c.owner_scoped,c.public_read
from projects p
cross join (values
  ('profiles',true,false),
  ('loans',true,false),
  ('payments',true,false),
  ('score_events',true,false),
  ('location_consents',true,false),
  ('location_history',true,false)
) c(name,owner_scoped,public_read)
where p.slug='wilpay'
on conflict(project_id,name) do nothing;
