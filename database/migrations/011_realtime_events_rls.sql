-- Aureon Base: durable tenant-scoped realtime event log.
-- Additive only: no existing rows, columns, constraints, or tables are removed.

CREATE TABLE IF NOT EXISTS realtime_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 120),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_project_cursor
  ON realtime_events(project_id, id);

ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE realtime_events TO aureon_app;
GRANT USAGE, SELECT ON SEQUENCE realtime_events_id_seq TO aureon_app;

DROP POLICY IF EXISTS realtime_events_tenant_read ON realtime_events;
CREATE POLICY realtime_events_tenant_read ON realtime_events
  FOR SELECT
  USING (project_id = aureon_current_project_id());

DROP POLICY IF EXISTS realtime_events_tenant_publish ON realtime_events;
CREATE POLICY realtime_events_tenant_publish ON realtime_events
  FOR INSERT
  WITH CHECK (
    project_id = aureon_current_project_id()
    AND actor_user_id = aureon_current_user_id()
  );
