-- Aureon Base: tenant isolation for core project-scoped tables.
-- Additive only: no rows, columns, constraints, or tables are removed.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_users, plans, subscriptions, api_keys TO aureon_app;

ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_users_tenant_scope ON project_users;
CREATE POLICY project_users_tenant_scope ON project_users
  FOR ALL
  USING (project_id = aureon_current_project_id())
  WITH CHECK (project_id = aureon_current_project_id());

DROP POLICY IF EXISTS plans_tenant_scope ON plans;
CREATE POLICY plans_tenant_scope ON plans
  FOR ALL
  USING (project_id = aureon_current_project_id())
  WITH CHECK (project_id = aureon_current_project_id());

DROP POLICY IF EXISTS subscriptions_tenant_scope ON subscriptions;
CREATE POLICY subscriptions_tenant_scope ON subscriptions
  FOR ALL
  USING (project_id = aureon_current_project_id())
  WITH CHECK (project_id = aureon_current_project_id());

DROP POLICY IF EXISTS api_keys_tenant_scope ON api_keys;
CREATE POLICY api_keys_tenant_scope ON api_keys
  FOR ALL
  USING (project_id = aureon_current_project_id())
  WITH CHECK (project_id = aureon_current_project_id());
