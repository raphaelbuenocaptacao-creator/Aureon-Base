-- Aureon Base v0.9: make owner soft-delete/reuse compatible with RLS.
-- Additive/replay-safe policy replacement only. No table, column, or row changes.
-- Deleted objects remain hidden from other project members; only their owner may
-- see them at the RLS layer so the API can safely soft-delete and later restore
-- the same key. Public/project reads still require deleted_at IS NULL.

ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storage_objects_project_read ON storage_objects;
CREATE POLICY storage_objects_project_read ON storage_objects
  FOR SELECT
  USING (
    project_id = aureon_current_project_id()
    AND (
      owner_user_id = aureon_current_user_id()
      OR (
        deleted_at IS NULL
        AND visibility IN ('project','public')
      )
    )
  );
