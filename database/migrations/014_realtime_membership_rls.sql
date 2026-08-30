-- Aureon Base: defense-in-depth membership guard for realtime RLS.
-- Non-destructive: only tightens existing SELECT/INSERT policies.
-- A forged tenant context is not sufficient: the current user must also be
-- explicitly linked to the current project in project_users.

ALTER POLICY realtime_events_tenant_read ON realtime_events
  USING (
    project_id = aureon_current_project_id()
    AND EXISTS (
      SELECT 1
      FROM project_users pu
      WHERE pu.project_id = realtime_events.project_id
        AND pu.user_id = aureon_current_user_id()
    )
  );

ALTER POLICY realtime_events_tenant_publish ON realtime_events
  WITH CHECK (
    project_id = aureon_current_project_id()
    AND actor_user_id = aureon_current_user_id()
    AND EXISTS (
      SELECT 1
      FROM project_users pu
      WHERE pu.project_id = realtime_events.project_id
        AND pu.user_id = aureon_current_user_id()
    )
  );
