-- Aureon Base v0.7: small-object storage payloads.
-- Additive and reversible: existing rows remain untouched.

alter table storage_objects
  add column if not exists content bytea;

create index if not exists idx_storage_objects_project_owner_active
  on storage_objects(project_id, owner_user_id, created_at desc)
  where deleted_at is null;
