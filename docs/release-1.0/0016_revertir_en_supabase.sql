-- VLUX Loyalty 1.0 · REVERSA de 0016 para PEGAR en el editor SQL de Supabase. Solo con autorización explícita de Vlux. NO ejecutada en ningún entorno remoto.
-- Vuelve al estado 0015 (políticas app_only, UPDATE de tabla completa, funciones sin guardia) y borra la fila de historial. No toca datos.
-- El código nuevo FUNCIONA sobre 0015 (148/148 en la verificación local), así que no hace falta revertir el código para usar esta reversa.
BEGIN;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0016_tenant_isolation' AND checksum = 'b55d29db99d1fdbaa3b26534d86730d83d74b2df265adcbf409d006e31396459') THEN RAISE EXCEPTION '0016 no está registrada con ese checksum: no hay nada que revertir'; END IF; END $$;
-- Revierte 0016: vuelve al estado de 0015 (políticas app_only, UPDATE de tabla completa y funciones sin guardia). No toca datos.
DROP FUNCTION IF EXISTS platform_business_stats();
DROP FUNCTION IF EXISTS platform_recent_activity(integer);
DROP FUNCTION IF EXISTS platform_business_export(uuid);
DROP FUNCTION IF EXISTS platform_purge_business(uuid, text);
DROP FUNCTION IF EXISTS notification_due_businesses(integer);
ALTER FUNCTION platform_business_stats_impl()            RENAME TO platform_business_stats;
ALTER FUNCTION platform_recent_activity_impl(integer)    RENAME TO platform_recent_activity;
ALTER FUNCTION platform_business_export_impl(uuid)       RENAME TO platform_business_export;
ALTER FUNCTION platform_purge_business_impl(uuid, text)  RENAME TO platform_purge_business;
ALTER FUNCTION notification_due_businesses_impl(integer) RENAME TO notification_due_businesses;
GRANT EXECUTE ON FUNCTION platform_business_stats(), platform_recent_activity(integer), platform_business_export(uuid),
  platform_purge_business(uuid, text), notification_due_businesses(integer) TO vlux_app;

REVOKE UPDATE (revoked_at) ON staff_sessions FROM vlux_app;
REVOKE UPDATE (role, active) ON staff_memberships FROM vlux_app;
REVOKE UPDATE (revoked_at, last_used_at) ON card_access_tokens FROM vlux_app;
REVOKE UPDATE (accepted_at, accepted_user_id, revoked_at, failed_attempts) ON staff_invitations FROM vlux_app;
REVOKE UPDATE (status, provider, provider_message_id, attempts, sends_accepted, last_error, requested_at, accepted_at, delivered_at, failed_at, link_enc) ON email_outbox FROM vlux_app;
REVOKE UPDATE (plan_code, commercial_status, start_date, pilot_end_date, renewal_date, price_cents, currency, notes, updated_by) ON business_subscriptions FROM vlux_app;
GRANT UPDATE ON staff_sessions, staff_memberships, card_access_tokens, staff_invitations, email_outbox, business_subscriptions TO vlux_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_sessions','staff_memberships','card_access_tokens','staff_invitations','email_outbox','email_events',
                           'business_subscriptions','platform_audit_events','business_deletions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_all ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_platform_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_platform_revoke ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_touch ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS append_only_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS webhook_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS app_only ON %I', t);
    EXECUTE format('CREATE POLICY app_only ON %I TO vlux_app USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS require_scope(text);
DROP FUNCTION IF EXISTS app_scope();
DELETE FROM schema_migrations WHERE version = '0016_tenant_isolation';
COMMIT;
