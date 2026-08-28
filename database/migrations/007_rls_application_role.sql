-- Aureon Base v0.8: application RLS execution role.
-- Additive and reversible: no tables, columns, or rows are removed.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aureon_app') THEN
    CREATE ROLE aureon_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- Allow the migration/runtime owner to SET LOCAL ROLE aureon_app inside a transaction.
DO $$
BEGIN
  EXECUTE format('GRANT aureon_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO aureon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage_objects TO aureon_app;
GRANT SELECT ON TABLE projects, project_users TO aureon_app;

-- RLS must remain enabled on storage even if this migration is replayed.
ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;
