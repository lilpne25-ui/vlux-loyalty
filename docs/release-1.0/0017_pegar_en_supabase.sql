-- VLUX Loyalty 1.0.x · Migración 0017 (recuperación de acceso + WhatsApp del negocio) para PEGAR en el editor SQL de Supabase.
-- NO se ha aplicado en ningún entorno remoto. Solo con autorización explícita de Vlux.
-- Es ADITIVA e independiente de 0016: sirve con Preview en 0015 o en 0016, y 0016 puede pegarse después
-- (matriz probada en PostgreSQL 16 y 17 aislados: scripts/verify-migration-matrix.sh).
-- Orden: puede pegarse antes o después de desplegar el código. Sin 0017, el código responde 503 en las rutas nuevas
-- y el resto de la app sigue igual; con 0017 y código viejo, nada usa la tabla nueva.
-- Después: GET /api/internal/notifications/run (cron) aplica la retención; verifícala con 0017_verificar_retencion.sql.
-- Rollback: docs/release-1.0/0017_revertir_en_supabase.sql (borra solicitudes de recuperación y el WhatsApp de cada negocio).
-- Generado por scripts/gen-0017-paste.mjs. Checksum sha256 de db/migrations/0017_recovery_support.up.sql: de07e6721a58d61e33de96dab2c6754d18cdc3ac9182a0115211215b8f627c69
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0017_recovery_support') THEN RAISE EXCEPTION '0017 ya está registrada: no la pegues otra vez'; END IF; IF (SELECT count(*) FROM schema_migrations WHERE version <= '0015_release_hardening') <> 15 THEN RAISE EXCEPTION 'Faltan migraciones 0001-0015 en el historial'; END IF; END $$;
-- 1.0.x · Pulido operativo: recuperación de acceso del cliente y WhatsApp público del negocio.
-- Migración ADITIVA: una tabla nueva y una columna nueva opcional. No borra ni reescribe datos existentes.
-- Compatible con 0015 y con 0016: solo usa current_business_id() (existe desde 0001) y no toca app_scope().
-- Reversible con 0017_recovery_support.down.sql (borra las solicitudes de recuperación y el WhatsApp del negocio).
--
-- Privacidad (política de retención, verificable con docs/release-1.0/0017_verificar_retencion.sql):
--   * Abierta (pending): contacto en claro como máximo 30 días (expires_at). Es lo que el negocio necesita para
--     devolverle el acceso al cliente.
--   * Enlace generado (link_issued): el plazo se acorta a 7 días (para reenviar el enlace si no llegó).
--   * Cerrada, vencida o de un cliente anonimizado: contacto ENMASCARADO (a***@g***.com, ******4567), sin nombre y con
--     contact_hash aleatorio (ya no se puede volver a identificar comparando hashes). Lo exige la restricción
--     recovery_requests_minimized: la base rechaza una fila cerrada con datos en claro.
--   * Cerrada hace más de 90 días: se BORRA (recovery_retention_sweep). La bitácora conserva el hecho sin el contacto.
-- No guarda tokens ni enlaces. El enlace nuevo se genera solo cuando el dueño lo decide y nunca se escribe aquí.

-- 1) WhatsApp público del negocio (opcional). Lo ve el cliente para escribir al negocio; 10 dígitos de México.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_whatsapp text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_contact_whatsapp_check') THEN
    ALTER TABLE businesses ADD CONSTRAINT businesses_contact_whatsapp_check CHECK (contact_whatsapp IS NULL OR contact_whatsapp ~ '^[0-9]{10}$');
  END IF;
END $$;

-- 2) Solicitudes de recuperación de acceso (una abierta por contacto y negocio; las repeticiones solo suman).
CREATE TABLE IF NOT EXISTS recovery_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact            text NOT NULL CHECK (char_length(contact) BETWEEN 3 AND 120),
  contact_type       text NOT NULL CHECK (contact_type IN ('whatsapp','email')),
  contact_hash       bytea NOT NULL CHECK (octet_length(contact_hash) = 32),
  name_hint          text CHECK (name_hint IS NULL OR char_length(name_hint) <= 40),
  matched_card_id    uuid,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','link_issued','resolved','dismissed','expired')),
  resolution         text CHECK (resolution IS NULL OR resolution IN ('link_sent','in_person','not_customer','spam','expired')),
  request_count      integer NOT NULL DEFAULT 1 CHECK (request_count BETWEEN 1 AND 1000),
  last_requested_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by        uuid,
  resolved_at        timestamptz,
  expires_at         timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (matched_card_id, business_id) REFERENCES cards (id, business_id) ON DELETE CASCADE
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_requests_minimized') THEN
    ALTER TABLE recovery_requests ADD CONSTRAINT recovery_requests_minimized
      CHECK (status IN ('pending','link_issued') OR (name_hint IS NULL AND position('***' in contact) > 0));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS recovery_requests_open ON recovery_requests (business_id, contact_hash) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS recovery_requests_inbox ON recovery_requests (business_id, status, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS recovery_requests_expiry ON recovery_requests (expires_at) WHERE status IN ('pending','link_issued');
CREATE INDEX IF NOT EXISTS recovery_requests_card ON recovery_requests (matched_card_id, business_id) WHERE matched_card_id IS NOT NULL;
DROP TRIGGER IF EXISTS recovery_requests_updated ON recovery_requests;
CREATE TRIGGER recovery_requests_updated BEFORE UPDATE ON recovery_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) Aislamiento por negocio (RLS) igual que el resto de tablas de negocio. Sin DELETE: los registros se cierran o vencen.
ALTER TABLE recovery_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recovery_requests' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON recovery_requests TO vlux_app USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
  END IF;
END $$;
REVOKE ALL ON recovery_requests FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON recovery_requests FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON recovery_requests FROM authenticated; END IF;
END $$;
GRANT SELECT, INSERT ON recovery_requests TO vlux_app;
-- UPDATE solo en las columnas que el código modifica (business_id, id y contact_hash nunca).
GRANT UPDATE (contact, contact_hash, name_hint, matched_card_id, status, resolution, request_count, last_requested_at, resolved_by, resolved_at, expires_at)
  ON recovery_requests TO vlux_app;

-- 4) Enmascarado (misma regla que maskContact() en server/services/recovery.ts).
CREATE OR REPLACE FUNCTION recovery_mask(p_contact text, p_type text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_type = 'email' THEN left(split_part(p_contact, '@', 1), 1) || '***@' || left(split_part(p_contact, '@', 2), 1) || '***'
                                          || coalesce(substring(split_part(p_contact, '@', 2) from '\.[^.]*$'), '')
              ELSE '******' || right(p_contact, 4) END
$$;

-- 5) Barrido de retención para TODOS los negocios (lo llama la tarea programada y, como respaldo, la propia app cada
--    pocos minutos cuando hay actividad de recuperación). Solo reduce datos: vence/enmascara abiertas caducadas y borra
--    cerradas de más de 90 días. Devuelve conteos, nunca contenido. Con 0016 aplicada exige alcance «worker».
CREATE OR REPLACE FUNCTION recovery_retention_sweep(p_limit integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n_exp integer; n_del integer; lim integer := LEAST(GREATEST(coalesce(p_limit, 500), 1), 5000);
BEGIN
  IF to_regprocedure('public.require_scope(text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.require_scope($1)' USING 'worker';
  END IF;
  UPDATE public.recovery_requests r
     SET status = 'expired', resolution = coalesce(r.resolution, 'expired'), resolved_at = coalesce(r.resolved_at, now()),
         contact = public.recovery_mask(r.contact, r.contact_type), name_hint = NULL,
         contact_hash = sha256(convert_to(gen_random_uuid()::text, 'UTF8'))
   WHERE r.id IN (SELECT id FROM public.recovery_requests WHERE status IN ('pending','link_issued') AND expires_at < now() ORDER BY expires_at LIMIT lim);
  GET DIAGNOSTICS n_exp = ROW_COUNT;
  DELETE FROM public.recovery_requests
   WHERE id IN (SELECT id FROM public.recovery_requests WHERE status IN ('resolved','dismissed','expired')
                  AND coalesce(resolved_at, expires_at) < now() - interval '90 days' LIMIT lim);
  GET DIAGNOSTICS n_del = ROW_COUNT;
  RETURN jsonb_build_object('expired', n_exp, 'deleted', n_del);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['recovery_mask(text, text)', 'recovery_retention_sweep(integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO vlux_app', f);
  END LOOP;
END $$;
INSERT INTO schema_migrations (version, checksum) VALUES ('0017_recovery_support', 'de07e6721a58d61e33de96dab2c6754d18cdc3ac9182a0115211215b8f627c69');
COMMIT;
