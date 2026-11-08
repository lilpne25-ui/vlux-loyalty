-- VLUX Loyalty 1.0.x · Migración 0017 (recuperación de acceso + WhatsApp del negocio) para PEGAR en el editor SQL de Supabase.
-- NO se ha aplicado en ningún entorno remoto. Solo con autorización explícita de Vlux.
-- Es ADITIVA e independiente de 0016: sirve con Preview en 0015 o en 0016 (probado en PostgreSQL 16 local en ambos casos).
-- Orden: puede pegarse antes o después de desplegar el código. Sin 0017, el código responde 503 en las rutas nuevas
-- y el resto de la app sigue igual; con 0017 y código viejo, nada usa la tabla nueva.
-- Rollback: docs/release-1.0/0017_revertir_en_supabase.sql (borra solicitudes de recuperación y el WhatsApp de cada negocio).
-- Checksum sha256 de db/migrations/0017_recovery_support.up.sql: 9f679cf3003a25b6f98e9676255a40a8cc1312ed0564c12ea48718f3e9e857bb
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0017_recovery_support') THEN RAISE EXCEPTION '0017 ya está registrada: no la pegues otra vez'; END IF; IF (SELECT count(*) FROM schema_migrations WHERE version <= '0015_release_hardening') <> 15 THEN RAISE EXCEPTION 'Faltan migraciones 0001-0015 en el historial'; END IF; END $$;
-- 1.0.x · Pulido operativo: recuperación de acceso del cliente y WhatsApp público del negocio.
-- Migración ADITIVA: una tabla nueva y una columna nueva opcional. No borra ni reescribe datos existentes.
-- Compatible con 0015 y con 0016: solo usa current_business_id() (existe desde 0001) y no toca app_scope().
-- Reversible con 0017_recovery_support.down.sql (borra las solicitudes de recuperación y el WhatsApp del negocio).
--
-- Privacidad: la solicitud guarda el contacto que escribió el cliente porque el negocio lo necesita para devolverle
-- su acceso. Vence a los 30 días: al listar, la API sustituye el contacto por una versión enmascarada (***4567).
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
CREATE UNIQUE INDEX IF NOT EXISTS recovery_requests_open ON recovery_requests (business_id, contact_hash) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS recovery_requests_inbox ON recovery_requests (business_id, status, last_requested_at DESC);
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
GRANT UPDATE (contact, name_hint, matched_card_id, status, resolution, request_count, last_requested_at, resolved_by, resolved_at)
  ON recovery_requests TO vlux_app;
INSERT INTO schema_migrations (version, checksum) VALUES ('0017_recovery_support', '9f679cf3003a25b6f98e9676255a40a8cc1312ed0564c12ea48718f3e9e857bb');
COMMIT;
