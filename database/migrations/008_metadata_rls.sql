-- Aureon Base v0.9: tenant-scoped RLS for project metadata.
-- Additive/replay-safe: no tables, columns, or rows are removed.
-- This policy shape was validated on a temporary Neon branch on 2026-08-28.

GRANT SELECT ON TABLE project_collections, project_environments TO aureon_app;

ALTER TABLE project_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_collections_tenant_read ON project_collections;
CREATE POLICY project_collections_tenant_read ON project_collections
  FOR SELECT
  USING (project_id = aureon_current_project_id());

DROP POLICY IF EXISTS project_environments_tenant_read ON project_environments;
CREATE POLICY project_environments_tenant_read ON project_environments
  FOR SELECT
  USING (project_id = aureon_current_project_id());
