DO $$
DECLARE
  target_id uuid;
  recovery_event constant text := 'ops.admin_access_recovery.2026-08-30';
  target_email constant text := 'raphaelbueno.captacao@gmail.com';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM audit_logs
    WHERE event = recovery_event
      AND metadata->>'email' = target_email
  ) THEN
    RETURN;
  END IF;

  SELECT id
  INTO target_id
  FROM users
  WHERE lower(email) = lower(target_email)
  LIMIT 1
  FOR UPDATE;

  IF target_id IS NULL THEN
    INSERT INTO users(id, email, password_hash, is_active, is_superadmin)
    VALUES (
      gen_random_uuid(),
      target_email,
      '$2b$12$ZWr5wyzVz7v46OYGDkK2meFbpWcHXOCRhfsTHmw8zDAR2AVTldupy',
      true,
      true
    )
    RETURNING id INTO target_id;
  ELSE
    UPDATE users
    SET password_hash = '$2b$12$ZWr5wyzVz7v46OYGDkK2meFbpWcHXOCRhfsTHmw8zDAR2AVTldupy',
        is_active = true,
        is_superadmin = true,
        updated_at = now()
    WHERE id = target_id;
  END IF;

  UPDATE sessions
  SET revoked_at = now()
  WHERE user_id = target_id
    AND revoked_at IS NULL;

  UPDATE password_reset_tokens
  SET used_at = COALESCE(used_at, now())
  WHERE user_id = target_id
    AND used_at IS NULL;

  INSERT INTO audit_logs(user_id, event, metadata)
  VALUES (
    target_id,
    recovery_event,
    jsonb_build_object('email', target_email, 'method', 'one_time_guarded_migration')
  );
END
$$;

DO $$
DECLARE
  target_id uuid;
  target_email constant text := 'raphaelbueno.captacao@gmail.com';
  expected_hash constant text := '$2b$12$ZWr5wyzVz7v46OYGDkK2meFbpWcHXOCRhfsTHmw8zDAR2AVTldupy';
BEGIN
  SELECT id
  INTO target_id
  FROM users
  WHERE lower(email) = lower(target_email)
    AND is_active = true
    AND is_superadmin = true
    AND password_hash = expected_hash
  LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'admin_access_recovery_verification_failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sessions
    WHERE user_id = target_id
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'admin_access_recovery_active_sessions_remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM password_reset_tokens
    WHERE user_id = target_id
      AND used_at IS NULL
  ) THEN
    RAISE EXCEPTION 'admin_access_recovery_active_reset_tokens_remain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM audit_logs
    WHERE user_id = target_id
      AND event = 'ops.admin_access_recovery.2026-08-30'
      AND metadata->>'email' = target_email
  ) THEN
    RAISE EXCEPTION 'admin_access_recovery_audit_marker_missing';
  END IF;
END
$$;
