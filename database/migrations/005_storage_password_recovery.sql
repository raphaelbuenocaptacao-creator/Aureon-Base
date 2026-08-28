-- Aureon Base v0.7 foundations: secure password recovery + tenant-scoped storage.
-- Additive migration only: no destructive changes.

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists idx_password_reset_tokens_user_created
  on password_reset_tokens(user_id, created_at desc);
create index if not exists idx_password_reset_tokens_active
  on password_reset_tokens(token_hash, expires_at)
  where used_at is null;

-- Only one currently usable recovery token per user should remain active.
-- The application revokes older unused rows when issuing a new token.

create table if not exists storage_objects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  bucket text not null default 'default',
  object_key text not null,
  provider text not null default 'external',
  provider_key text,
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum_sha256 text,
  visibility text not null default 'private' check (visibility in ('private','project','public')),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, bucket, object_key)
);

create index if not exists idx_storage_objects_project_bucket
  on storage_objects(project_id, bucket, created_at desc)
  where deleted_at is null;
create index if not exists idx_storage_objects_owner
  on storage_objects(owner_user_id, created_at desc)
  where deleted_at is null;

-- RLS starts on the new storage table without forcing RLS for the table owner.
-- The API must set aureon.user_id and aureon.project_id per transaction before
-- tenant-scoped direct SQL access is considered protected by these policies.
alter table storage_objects enable row level security;

create or replace function aureon_current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('aureon.user_id', true), '')::uuid
$$;

create or replace function aureon_current_project_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('aureon.project_id', true), '')::uuid
$$;

drop policy if exists storage_objects_project_read on storage_objects;
create policy storage_objects_project_read on storage_objects
  for select
  using (
    project_id = aureon_current_project_id()
    and (
      visibility in ('project','public')
      or owner_user_id = aureon_current_user_id()
    )
    and deleted_at is null
  );

drop policy if exists storage_objects_owner_insert on storage_objects;
create policy storage_objects_owner_insert on storage_objects
  for insert
  with check (
    project_id = aureon_current_project_id()
    and owner_user_id = aureon_current_user_id()
  );

drop policy if exists storage_objects_owner_update on storage_objects;
create policy storage_objects_owner_update on storage_objects
  for update
  using (
    project_id = aureon_current_project_id()
    and owner_user_id = aureon_current_user_id()
  )
  with check (
    project_id = aureon_current_project_id()
    and owner_user_id = aureon_current_user_id()
  );

drop policy if exists storage_objects_owner_delete on storage_objects;
create policy storage_objects_owner_delete on storage_objects
  for delete
  using (
    project_id = aureon_current_project_id()
    and owner_user_id = aureon_current_user_id()
  );
