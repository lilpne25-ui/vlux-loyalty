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
  appointments, businesses, cards, customers,
  notification_outbox, notification_settings, password_reset_tokens, plans, platform_admin_invitations,
  platform_admin_recovery_codes, platform_admin_sessions, platform_admins, purchases, push_subscriptions,
  reward_rules, rewards, staff_users, visits
  TO vlux_app;
-- Seis tablas con business_id. Los permisos dependen de la versión del esquema que se restaura:
--   · respaldo ANTERIOR a 0016 (no existe app_scope()): UPDATE de tabla completa, igual que 0001-0015;
--   · 0016 o posterior: solo SELECT/INSERT y UPDATE por columnas (nunca business_id ni llaves).
-- Así el mismo archivo sirve antes y después de la transición de dos fases (docs/release-1.0/DEPLOY_0016_PLAN.md).
DO $$ BEGIN
  IF to_regprocedure('public.app_scope()') IS NULL THEN
    GRANT SELECT, INSERT, UPDATE ON business_subscriptions, card_access_tokens, email_outbox, staff_invitations, staff_memberships, staff_sessions TO vlux_app;
  ELSE
    GRANT SELECT, INSERT ON business_subscriptions, card_access_tokens, email_outbox, staff_invitations, staff_memberships, staff_sessions TO vlux_app;
    GRANT UPDATE (plan_code, commercial_status, start_date, pilot_end_date, renewal_date, price_cents, currency, notes, updated_by) ON business_subscriptions TO vlux_app;
    GRANT UPDATE (revoked_at, last_used_at) ON card_access_tokens TO vlux_app;
    GRANT UPDATE (status, provider, provider_message_id, attempts, sends_accepted, last_error, requested_at, accepted_at, delivered_at, failed_at, link_enc) ON email_outbox TO vlux_app;
    GRANT UPDATE (accepted_at, accepted_user_id, revoked_at, failed_attempts) ON staff_invitations TO vlux_app;
    GRANT UPDATE (role, active) ON staff_memberships TO vlux_app;
    GRANT UPDATE (revoked_at) ON staff_sessions TO vlux_app;
  END IF;
END $$;
-- recovery_requests nace en 0017: SELECT/INSERT y UPDATE por columnas, sin DELETE (no rompe respaldos anteriores a 0017).
DO $$ BEGIN
  IF to_regclass('public.recovery_requests') IS NOT NULL THEN
    GRANT SELECT, INSERT ON recovery_requests TO vlux_app;
    GRANT UPDATE (contact, name_hint, matched_card_id, status, resolution, request_count, last_requested_at, resolved_by, resolved_at) ON recovery_requests TO vlux_app;
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON activation_drafts, card_pair_codes, rate_limits TO vlux_app;
-- Solo inserción (bitácoras y libro mayor; además los protege el disparador forbid_mutation)
GRANT SELECT, INSERT ON audit_events, business_deletions, email_events, platform_audit_events, review_events, stamp_events TO vlux_app;
-- schema_migrations: sin acceso para la app.

GRANT EXECUTE ON FUNCTION current_business_id() TO vlux_app;
-- app_scope() nace en 0016: al restaurar un respaldo ANTERIOR a 0016 todavía no existe (no debe romper el simulacro).
DO $$ BEGIN IF to_regprocedure('public.app_scope()') IS NOT NULL THEN GRANT EXECUTE ON FUNCTION public.app_scope() TO vlux_app; END IF; END $$;
GRANT EXECUTE ON FUNCTION platform_business_stats() TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_recent_activity(integer) TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_purge_business(uuid, text) TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_business_export(uuid) TO vlux_app;
GRANT EXECUTE ON FUNCTION notification_due_businesses(integer) TO vlux_app;
