-- V0.4.6 · Smart Access + Notificaciones. Migración ADITIVA: solo agrega columnas, tablas, índices y funciones.
-- No borra ni reescribe datos existentes. Reversible con 0014_access_push.down.sql.

-- 1) Invitaciones: canal de entrega y código de activación presencial (solo su hash; uso único, vence con la invitación).
ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS access_code_hash bytea;
ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS delivery text NOT NULL DEFAULT 'link';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_invitations_delivery_check') THEN
    ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_delivery_check CHECK (delivery IN ('link','in_person'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_access_code ON staff_invitations (access_code_hash) WHERE access_code_hash IS NOT NULL;

-- 2) Correo: el adaptador SMTP (Stalwart u otro servidor propio) es un proveedor más del outbox existente.
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_provider_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_provider_check CHECK (provider IS NULL OR provider IN ('resend','mock','smtp'));

-- 3) Ubicación pública del negocio (opcional). Solo la usa el teléfono del cliente para calcular la distancia
--    EN EL DISPOSITIVO. El servidor nunca recibe ni guarda la ubicación del cliente.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

-- 4) Suscripciones Web Push por tarjeta (consentimiento por dispositivo y por categoría). Datos personales mínimos:
--    endpoint del servicio push del navegador y sus llaves públicas. Sin nombre, sin teléfono, sin ubicación.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  card_id         uuid NOT NULL,
  endpoint        text NOT NULL CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh          text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 100),
  auth            text NOT NULL CHECK (char_length(auth) BETWEEN 16 AND 32),
  cat_rewards     boolean NOT NULL DEFAULT true,
  cat_reminders   boolean NOT NULL DEFAULT false,
  cat_promotions  boolean NOT NULL DEFAULT false,
  platform        text NOT NULL DEFAULT 'otro' CHECK (platform IN ('ios','android','desktop','otro')),
  consented_at    timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failures        integer NOT NULL DEFAULT 0,
  disabled_at     timestamptz,
  disabled_reason text CHECK (disabled_reason IS NULL OR disabled_reason IN ('unsubscribed','expired','invalid','card_revoked')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, endpoint),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS push_subscriptions_card ON push_subscriptions (business_id, card_id) WHERE disabled_at IS NULL;
DROP TRIGGER IF EXISTS push_subscriptions_updated ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5) Preferencias de comunicación del negocio (límites incluidos). Una fila por negocio; si falta, se usan los valores por omisión.
CREATE TABLE IF NOT EXISTS notification_settings (
  business_id          uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  rewards_enabled      boolean NOT NULL DEFAULT true,
  progress_enabled     boolean NOT NULL DEFAULT true,
  progress_remaining   integer NOT NULL DEFAULT 1 CHECK (progress_remaining BETWEEN 1 AND 3),
  return_enabled       boolean NOT NULL DEFAULT false,
  return_after_days    integer NOT NULL DEFAULT 30 CHECK (return_after_days BETWEEN 14 AND 180),
  appointments_enabled boolean NOT NULL DEFAULT false,
  quiet_start_hour     integer NOT NULL DEFAULT 21 CHECK (quiet_start_hour BETWEEN 0 AND 23),
  quiet_end_hour       integer NOT NULL DEFAULT 9 CHECK (quiet_end_hour BETWEEN 0 AND 23),
  max_per_week         integer NOT NULL DEFAULT 2 CHECK (max_per_week BETWEEN 1 AND 3),
  updated_by           uuid,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 6) Citas reales (mínimo indispensable). VLUX Loyalty NO es una agenda médica: solo fecha/hora verificada,
--    origen y estado. Prohibido guardar motivo, diagnóstico o cualquier dato clínico (no hay columnas para ello).
CREATE TABLE IF NOT EXISTS appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  card_id          uuid NOT NULL,
  starts_at        timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  source           text NOT NULL CHECK (source IN ('manual','integration')),
  external_ref     text CHECK (external_ref IS NULL OR char_length(external_ref) <= 120),
  created_by       uuid,
  reminder_sent_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS appointments_due ON appointments (starts_at) WHERE status = 'confirmed' AND reminder_sent_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_external ON appointments (business_id, external_ref) WHERE external_ref IS NOT NULL;
DROP TRIGGER IF EXISTS appointments_updated ON appointments;
CREATE TRIGGER appointments_updated BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7) Buzón de salida de notificaciones (outbox). La llave de deduplicación evita mensajes repetidos por reintentos
--    o por eventos duplicados. El cuerpo NO lleva datos personales (solo nombre del negocio y textos de plantilla).
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  card_id         uuid,
  category        text NOT NULL CHECK (category IN ('rewards','reminders','promotions')),
  template        text NOT NULL CHECK (template IN ('reward_ready','progress','return','promotion','appointment')),
  dedupe_key      text NOT NULL CHECK (char_length(dedupe_key) <= 200),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 180),
  url             text NOT NULL CHECK (url ~ '^/[^/]' AND char_length(url) <= 200),
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','partial','failed','skipped','expired')),
  skip_reason     text CHECK (skip_reason IS NULL OR char_length(skip_reason) <= 60),
  attempts        integer NOT NULL DEFAULT 0,
  devices_sent    integer NOT NULL DEFAULT 0,
  devices_failed  integer NOT NULL DEFAULT 0,
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  sent_at         timestamptz,
  last_error      text CHECK (last_error IS NULL OR char_length(last_error) <= 200),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, dedupe_key),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_outbox_due ON notification_outbox (scheduled_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS notification_outbox_card ON notification_outbox (business_id, card_id, created_at DESC);
DROP TRIGGER IF EXISTS notification_outbox_updated ON notification_outbox;
CREATE TRIGGER notification_outbox_updated BEFORE UPDATE ON notification_outbox FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8) Aislamiento por negocio (RLS) en todas las tablas nuevas, igual que el resto de tablas de negocio.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['push_subscriptions','notification_settings','appointments','notification_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id())', t);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated', t); END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO vlux_app', t);
  END LOOP;
END $$;

-- 9) Planificador: qué negocios tienen trabajo pendiente. Solo devuelve identificadores (sin datos personales).
--    La API después entra a cada negocio con su propio contexto RLS.
CREATE OR REPLACE FUNCTION notification_due_businesses(p_limit integer)
RETURNS TABLE (business_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.id FROM businesses b
   WHERE b.status = 'active' AND (
     EXISTS (SELECT 1 FROM notification_outbox o WHERE o.business_id = b.id AND o.status = 'queued' AND o.scheduled_at <= now())
     OR EXISTS (SELECT 1 FROM notification_settings s WHERE s.business_id = b.id AND (s.return_enabled OR s.appointments_enabled))
   )
   ORDER BY b.id LIMIT greatest(1, least(p_limit, 1000));
$$;
REVOKE ALL ON FUNCTION notification_due_businesses(integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION notification_due_businesses(integer) FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION notification_due_businesses(integer) FROM authenticated'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION notification_due_businesses(integer) TO vlux_app;
