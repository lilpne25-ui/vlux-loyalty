-- Permisos mínimos del rol de la aplicación (idempotente). Se aplica después de restaurar un respaldo
-- hecho con --no-privileges, o para revisar que el rol tiene exactamente lo necesario.
GRANT USAGE ON SCHEMA public TO vlux_app;
GRANT SELECT, INSERT, UPDATE ON businesses, staff_users, staff_memberships, staff_sessions, card_access_tokens,
  reward_rules, customers, cards, visits, purchases, rewards, password_reset_tokens TO vlux_app;
GRANT SELECT, INSERT ON stamp_events, review_events, audit_events TO vlux_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO vlux_app;
GRANT EXECUTE ON FUNCTION current_business_id() TO vlux_app;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;
