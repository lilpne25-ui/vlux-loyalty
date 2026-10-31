-- Revierte 0002 (los REVOKE a anon/authenticated no se revierten a propósito).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','staff_users','staff_memberships','staff_sessions','card_access_tokens','schema_migrations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS app_only ON %I', t);
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
DROP TABLE IF EXISTS rate_limits;
