-- Permisos mínimos del rol de la aplicación (idempotente). Se aplica después de restaurar un respaldo hecho con
-- --no-privileges, o para revisar que el rol tiene exactamente lo necesario.
-- 1.0.0-rc.1: alineado con los permisos reales de Supabase Preview tras 0001–0015 (antes estaba congelado en V0.3:
-- faltaban 8 tablas y 3 funciones, y las funciones SECURITY DEFINER quedaban ejecutables por PUBLIC tras restaurar).
-- tests/integration/release-rc1.test.ts compara este archivo contra una base recién migrada.

-- 1) Nada para PUBLIC/anon/authenticated (pg_restore --no-privileges deja EXECUTE a PUBLIC en TODAS las funciones).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
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

-- 2) Rol de la aplicación
GRANT USAGE ON SCHEMA public TO vlux_app;
GRANT SELECT, INSERT, UPDATE ON
  appointments, business_subscriptions, businesses, card_access_tokens, cards, customers, email_outbox,
  notification_outbox, notification_settings, password_reset_tokens, plans, platform_admin_invitations,
  platform_admin_recovery_codes, platform_admin_sessions, platform_admins, purchases, push_subscriptions,
  reward_rules, rewards, staff_invitations, staff_memberships, staff_sessions, staff_users, visits
  TO vlux_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON activation_drafts, card_pair_codes, rate_limits TO vlux_app;
-- Solo inserción (bitácoras y libro mayor; además los protege el disparador forbid_mutation)
GRANT SELECT, INSERT ON audit_events, business_deletions, email_events, platform_audit_events, review_events, stamp_events TO vlux_app;
-- schema_migrations: sin acceso para la app.

GRANT EXECUTE ON FUNCTION current_business_id() TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_business_stats() TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_recent_activity(integer) TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_purge_business(uuid, text) TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_business_export(uuid) TO vlux_app;
GRANT EXECUTE ON FUNCTION notification_due_businesses(integer) TO vlux_app;
