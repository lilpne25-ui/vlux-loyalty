-- VLUX Loyalty 1.0 · Migración 0016 (aislamiento entre negocios) para PEGAR en el editor SQL de Supabase. NO se ha aplicado en ningún entorno remoto.
-- ORDEN OBLIGATORIO: 1) desplegar primero el CÓDIGO de esta rama (funciona con el esquema 0015 y con 0016); 2) después pegar este archivo.
-- Si se pega antes de desplegar el código nuevo, el código anterior pierde acceso a sesiones/tokens/invitaciones y el inicio de sesión falla.
-- Rollback: db/migrations/0016_tenant_isolation.down.sql (y volver a desplegar el código anterior). Solo con autorización explícita de Vlux.
-- Checksum sha256 de db/migrations/0016_tenant_isolation.up.sql: b55d29db99d1fdbaa3b26534d86730d83d74b2df265adcbf409d006e31396459
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0016_tenant_isolation') THEN RAISE EXCEPTION '0016 ya está registrada: no la pegues otra vez'; END IF; IF (SELECT count(*) FROM schema_migrations WHERE version <= '0015_release_hardening') <> 15 THEN RAISE EXCEPTION 'Faltan migraciones 0001-0015 en el historial'; END IF; END $$;
-- 1.0 · Aislamiento entre negocios en PostgreSQL (cierra H-1 de docs/release-1.0/TENANT_ISOLATION_AUDIT.md).
-- Antes: nueve tablas con business_id tenían la política «ALL … USING (true)». Quien ejecutara SQL como vlux_app
-- (inyección SQL o un error de código) veía y modificaba las filas de TODOS los negocios; además las funciones
-- SECURITY DEFINER de plataforma (platform_business_export…) devolvían datos de cualquier negocio sin comprobar contexto.
--
-- Modelo: cada transacción declara de dónde viene su autoridad.
--   · negocio  : app.business_id (ya existía; lo fija withTenant). Ve y escribe SOLO filas de ese negocio.
--   · alcance  : app.scope = 'auth' | 'platform' | 'webhook' | 'worker' (nuevo; lo fija withScope/runWithScope en el servidor).
--                Cubre lo que ocurre ANTES de conocer el negocio (iniciar sesión, resolver un token de tarjeta…) y el
--                Control Center. Cada alcance recibe únicamente las operaciones que su ruta necesita (matriz abajo).
--   · sin nada : cero filas y cero escrituras (falla cerrado).
-- Límite honesto: app.scope y app.business_id son variables de sesión que vlux_app puede fijar; este diseño frena errores
-- de código, rutas olvidadas y consultas sin contexto, pero NO sustituye usar credenciales de BD distintas para
-- plataforma y negocios (ver docs/release-1.0/SECURITY_HARDENING_REPORT.md, riesgo residual R-1).
--
-- Matriz (S=SELECT, I=INSERT, U=UPDATE; «negocio» = business_id = current_business_id()):
--   tabla                    negocio   auth   platform   webhook
--   staff_sessions           S I U     S U    S U        -
--   staff_memberships        S I U     S      S          -
--   card_access_tokens       S I U     S U    -          -
--   staff_invitations        S I U     S      S          -
--   email_outbox             S I U     -      -          S
--   email_events             S I       -      -          -
--   business_subscriptions   S I U     -      S          -
--   platform_audit_events    -         -      S          -     (INSERT abierto: bitácora de solo escritura)
--   business_deletions       -         -      S I        -
-- Reversible con 0016_tenant_isolation.down.sql. No borra ni modifica datos.

-- ---------- 1) Alcance de la transacción ----------
CREATE OR REPLACE FUNCTION app_scope() RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT coalesce(nullif(current_setting('app.scope', true), ''), 'none')
$$;
REVOKE EXECUTE ON FUNCTION app_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_scope() TO vlux_app;

-- Uso interno de las envolturas SECURITY DEFINER (vlux_app NO puede ejecutarla directamente).
CREATE OR REPLACE FUNCTION require_scope(p_scope text) RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
BEGIN
  IF app_scope() IS DISTINCT FROM p_scope THEN
    RAISE EXCEPTION 'alcance % requerido', CASE p_scope WHEN 'platform' THEN 'de plataforma' WHEN 'worker' THEN 'de trabajo' ELSE p_scope END
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION require_scope(text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION app_scope() FROM anon; REVOKE ALL ON FUNCTION require_scope(text) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION app_scope() FROM authenticated; REVOKE ALL ON FUNCTION require_scope(text) FROM authenticated; END IF;
END $$;

-- ---------- 2) Políticas de las nueve tablas ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_sessions','staff_memberships','card_access_tokens','staff_invitations','email_outbox','email_events',
                           'business_subscriptions','platform_audit_events','business_deletions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_only ON %I', t);
  END LOOP;
END $$;

-- Filas del negocio activo de la transacción (lectura y escritura; WITH CHECK impide trasladar o crear filas en otro negocio).
CREATE POLICY tenant_all ON staff_sessions           TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
CREATE POLICY tenant_all ON staff_memberships        TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
CREATE POLICY tenant_all ON card_access_tokens       TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
CREATE POLICY tenant_all ON staff_invitations        TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
CREATE POLICY tenant_all ON email_outbox             TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
CREATE POLICY tenant_all ON email_events             TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
CREATE POLICY tenant_all ON business_subscriptions   TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());

-- Alcance auth (antes de conocer el negocio: llave secreta o usuario ya verificado).
CREATE POLICY auth_platform_read ON staff_sessions    FOR SELECT TO vlux_app USING ((SELECT app_scope()) IN ('auth','platform'));
CREATE POLICY auth_platform_revoke ON staff_sessions  FOR UPDATE TO vlux_app USING ((SELECT app_scope()) IN ('auth','platform')) WITH CHECK ((SELECT app_scope()) IN ('auth','platform'));
CREATE POLICY auth_platform_read ON staff_memberships FOR SELECT TO vlux_app USING ((SELECT app_scope()) IN ('auth','platform'));
CREATE POLICY auth_read ON card_access_tokens         FOR SELECT TO vlux_app USING ((SELECT app_scope()) = 'auth');
CREATE POLICY auth_touch ON card_access_tokens        FOR UPDATE TO vlux_app USING ((SELECT app_scope()) = 'auth') WITH CHECK ((SELECT app_scope()) = 'auth');
CREATE POLICY auth_platform_read ON staff_invitations FOR SELECT TO vlux_app USING ((SELECT app_scope()) IN ('auth','platform'));

-- Alcance platform (Control Center, sesión de administrador con 2FA): lecturas transversales.
CREATE POLICY platform_read ON business_subscriptions FOR SELECT TO vlux_app USING ((SELECT app_scope()) = 'platform');
CREATE POLICY platform_read ON platform_audit_events  FOR SELECT TO vlux_app USING ((SELECT app_scope()) = 'platform');
-- Bitácora de solo escritura: cualquier contexto puede AGREGAR (también los intentos de inicio de sesión sin sesión),
-- pero solo platform la LEE. Sin UPDATE/DELETE (disparador append-only). Riesgo aceptado E-1: ver informe.
CREATE POLICY append_only_insert ON platform_audit_events FOR INSERT TO vlux_app WITH CHECK (true);
CREATE POLICY platform_read ON business_deletions     FOR SELECT TO vlux_app USING ((SELECT app_scope()) = 'platform');
CREATE POLICY platform_insert ON business_deletions   FOR INSERT TO vlux_app WITH CHECK ((SELECT app_scope()) = 'platform');

-- Alcance webhook (devoluciones del proveedor de correo, firmadas): localizar la salida por id del proveedor.
CREATE POLICY webhook_read ON email_outbox            FOR SELECT TO vlux_app USING ((SELECT app_scope()) = 'webhook');

-- ---------- 3) UPDATE solo en las columnas que el código modifica (business_id y llaves nunca) ----------
REVOKE UPDATE ON staff_sessions, staff_memberships, card_access_tokens, staff_invitations, email_outbox, business_subscriptions FROM vlux_app;
GRANT UPDATE (revoked_at)                                                          ON staff_sessions        TO vlux_app;
GRANT UPDATE (role, active)                                                        ON staff_memberships     TO vlux_app;
GRANT UPDATE (revoked_at, last_used_at)                                            ON card_access_tokens    TO vlux_app;
GRANT UPDATE (accepted_at, accepted_user_id, revoked_at, failed_attempts)          ON staff_invitations     TO vlux_app;
GRANT UPDATE (status, provider, provider_message_id, attempts, sends_accepted, last_error, requested_at, accepted_at,
              delivered_at, failed_at, link_enc)                                    ON email_outbox          TO vlux_app;
GRANT UPDATE (plan_code, commercial_status, start_date, pilot_end_date, renewal_date, price_cents, currency, notes, updated_by)
                                                                                   ON business_subscriptions TO vlux_app;

-- ---------- 4) Funciones SECURITY DEFINER: exigen alcance (envoltura con guardia; el cuerpo original no cambia) ----------
ALTER FUNCTION platform_business_stats()          RENAME TO platform_business_stats_impl;
ALTER FUNCTION platform_recent_activity(integer)  RENAME TO platform_recent_activity_impl;
ALTER FUNCTION platform_business_export(uuid)     RENAME TO platform_business_export_impl;
ALTER FUNCTION platform_purge_business(uuid, text) RENAME TO platform_purge_business_impl;
ALTER FUNCTION notification_due_businesses(integer) RENAME TO notification_due_businesses_impl;
REVOKE ALL ON FUNCTION platform_business_stats_impl(), platform_recent_activity_impl(integer), platform_business_export_impl(uuid),
  platform_purge_business_impl(uuid, text), notification_due_businesses_impl(integer) FROM vlux_app;

CREATE FUNCTION platform_business_stats()
RETURNS TABLE (business_id uuid, customers bigint, cards bigint, purchases bigint, stamps bigint, rewards_redeemed bigint, last_activity timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN PERFORM public.require_scope('platform'); RETURN QUERY SELECT * FROM public.platform_business_stats_impl(); END $$;

CREATE FUNCTION platform_recent_activity(p_limit integer)
RETURNS TABLE (business_id uuid, action text, actor_type text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN PERFORM public.require_scope('platform'); RETURN QUERY SELECT * FROM public.platform_recent_activity_impl(p_limit); END $$;

CREATE FUNCTION platform_business_export(p_business uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN PERFORM public.require_scope('platform'); RETURN public.platform_business_export_impl(p_business); END $$;

CREATE FUNCTION platform_purge_business(p_business uuid, p_confirm_slug text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN PERFORM public.require_scope('platform'); RETURN public.platform_purge_business_impl(p_business, p_confirm_slug); END $$;

CREATE FUNCTION notification_due_businesses(p_limit integer)
RETURNS TABLE (business_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN PERFORM public.require_scope('worker'); RETURN QUERY SELECT * FROM public.notification_due_businesses_impl(p_limit); END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_business_stats()','platform_recent_activity(integer)','platform_business_export(uuid)',
                           'platform_purge_business(uuid, text)','notification_due_businesses(integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO vlux_app', f);
  END LOOP;
END $$;
INSERT INTO schema_migrations (version, checksum) VALUES ('0016_tenant_isolation', 'b55d29db99d1fdbaa3b26534d86730d83d74b2df265adcbf409d006e31396459');
COMMIT;
