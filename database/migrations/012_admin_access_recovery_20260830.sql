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
