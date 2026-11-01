-- V0.3 · VLUX Control Center: administradores de plataforma (con 2FA), invitaciones de un solo uso,
-- planes y suscripciones manuales, bitácora global y funciones de lectura agregada entre negocios.
-- Solo agrega tablas, columnas y funciones: no borra ni reescribe datos existentes.

-- ---------- Administradores de plataforma (identidad separada del personal de los negocios) ----------
CREATE TABLE platform_admins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254 AND email = lower(email)),
  display_name     text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  password_hash    text NOT NULL,
  totp_secret_enc  text,                       -- secreto TOTP cifrado (AES-256-GCM) con la llave del servidor
  totp_enabled_at  timestamptz,
  totp_last_step   bigint NOT NULL DEFAULT 0,  -- evita reutilizar el mismo código
  failed_logins    integer NOT NULL DEFAULT 0,  -- contraseñas incorrectas
  mfa_failures     integer NOT NULL DEFAULT 0,  -- códigos 2FA incorrectos (contador propio: el login NO lo reinicia)
  locked_until     timestamptz,
  disabled_at      timestamptz,
  created_by       uuid REFERENCES platform_admins(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_admins_email_key ON platform_admins (email);
CREATE TRIGGER platform_admins_updated BEFORE UPDATE ON platform_admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_admin_recovery_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES platform_admins(id),
  code_hash   bytea NOT NULL UNIQUE,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_admin_recovery_codes_admin ON platform_admin_recovery_codes (admin_id) WHERE used_at IS NULL;

CREATE TABLE platform_admin_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    bytea NOT NULL UNIQUE,
  admin_id      uuid NOT NULL REFERENCES platform_admins(id),
  mfa_verified  boolean NOT NULL DEFAULT false, -- false = solo puede completar el segundo factor
  user_agent    text CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX platform_admin_sessions_admin ON platform_admin_sessions (admin_id);

-- Alta de otros administradores: enlace de un solo uso emitido por un administrador.
CREATE TABLE platform_admin_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL UNIQUE,
  email        text NOT NULL CHECK (email = lower(email)),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  invited_by   uuid NOT NULL REFERENCES platform_admins(id),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Bitácora de la plataforma (solo agregar). Nunca guarda contraseñas, tokens ni códigos.
CREATE TABLE platform_audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    uuid REFERENCES platform_admins(id),
  action      text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 60),
  business_id uuid REFERENCES businesses(id),
  entity_type text,
  entity_id   uuid,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_events_created ON platform_audit_events (created_at DESC);
CREATE INDEX platform_audit_events_business ON platform_audit_events (business_id, created_at DESC);
CREATE TRIGGER platform_audit_events_append_only BEFORE UPDATE OR DELETE ON platform_audit_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------- Invitaciones de personal (dueños y empleados) ----------
CREATE TABLE staff_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       bytea NOT NULL UNIQUE,
  business_id      uuid NOT NULL REFERENCES businesses(id),
  email            text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254 AND email = lower(email)),
  display_name     text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  role             text NOT NULL CHECK (role IN ('OWNER','EMPLOYEE')),
  invited_by_type  text NOT NULL CHECK (invited_by_type IN ('platform','staff')),
  invited_by_id    uuid NOT NULL,
  expires_at       timestamptz NOT NULL,
  accepted_at      timestamptz,
  accepted_user_id uuid REFERENCES staff_users(id),
  revoked_at       timestamptz,
  failed_attempts  integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_invitations_business ON staff_invitations (business_id, created_at DESC);
-- Una sola invitación abierta por correo y negocio.
CREATE UNIQUE INDEX staff_invitations_open ON staff_invitations (business_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ---------- Planes y suscripciones (administración manual, sin cobros automáticos) ----------
CREATE TABLE plans (
  code         text PRIMARY KEY CHECK (code IN ('piloto','inicio','crecimiento')),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  price_cents  integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  currency     text NOT NULL DEFAULT 'MXN' CHECK (currency ~ '^[A-Z]{3}$'),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Precios iniciales = hipótesis comerciales de VLUX; se editan en Control Center.
INSERT INTO plans (code, name, price_cents, currency) VALUES
  ('piloto', 'Piloto', 0, 'MXN'),
  ('inicio', 'Inicio', 29900, 'MXN'),
  ('crecimiento', 'Crecimiento', 49900, 'MXN')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE business_subscriptions (
  business_id        uuid PRIMARY KEY REFERENCES businesses(id),
  plan_code          text NOT NULL REFERENCES plans(code),
  commercial_status  text NOT NULL CHECK (commercial_status IN ('piloto','activo','vencido','suspendido','cancelado')),
  start_date         date NOT NULL,
  pilot_end_date     date,
  renewal_date       date,
  price_cents        integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  currency           text NOT NULL DEFAULT 'MXN' CHECK (currency ~ '^[A-Z]{3}$'),
  notes              text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  updated_by         uuid REFERENCES platform_admins(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER business_subscriptions_updated BEFORE UPDATE ON business_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Suscripción inicial para negocios existentes: demos como piloto, sin precio.
INSERT INTO business_subscriptions (business_id, plan_code, commercial_status, start_date, price_cents, currency, notes)
SELECT id, 'piloto', 'piloto', created_at::date, 0, 'MXN', CASE WHEN is_demo THEN 'Negocio de demostración' ELSE '' END
  FROM businesses ON CONFLICT (business_id) DO NOTHING;

-- Identidad visual extra y motivo de suspensión del servicio.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_data_url text
  CHECK (logo_data_url IS NULL OR (logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' AND char_length(logo_data_url) <= 90000));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS suspended_reason text CHECK (suspended_reason IS NULL OR char_length(suspended_reason) <= 300);

-- ---------- Seguridad de las tablas globales ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_admins','platform_admin_recovery_codes','platform_admin_sessions','platform_admin_invitations',
                           'platform_audit_events','staff_invitations','plans','business_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY app_only ON %I TO vlux_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated', t); END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON platform_admins, platform_admin_recovery_codes, platform_admin_sessions, platform_admin_invitations,
  staff_invitations, plans, business_subscriptions TO vlux_app;
GRANT SELECT, INSERT ON platform_audit_events TO vlux_app;
GRANT USAGE ON SEQUENCE platform_audit_events_id_seq TO vlux_app;

-- ---------- Lecturas agregadas entre negocios (sin datos personales) ----------
-- Las tablas por negocio tienen RLS. Para el tablero de la plataforma se exponen SOLO conteos por negocio
-- mediante funciones SECURITY DEFINER con search_path fijo. No devuelven nombres, contactos ni tokens.
CREATE OR REPLACE FUNCTION platform_business_stats()
RETURNS TABLE (business_id uuid, customers bigint, cards bigint, purchases bigint, stamps bigint, rewards_redeemed bigint, last_activity timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.id,
         (SELECT count(*) FROM customers c WHERE c.business_id = b.id AND c.anonymized_at IS NULL),
         (SELECT count(*) FROM cards k WHERE k.business_id = b.id),
         (SELECT count(*) FROM purchases p WHERE p.business_id = b.id AND p.voided_at IS NULL),
         (SELECT coalesce(sum(s.delta), 0) FROM stamp_events s WHERE s.business_id = b.id AND s.reason = 'purchase'),
         (SELECT count(*) FROM rewards r WHERE r.business_id = b.id AND r.status = 'redeemed'),
         (SELECT max(a.created_at) FROM audit_events a WHERE a.business_id = b.id)
    FROM businesses b;
$$;

CREATE OR REPLACE FUNCTION platform_recent_activity(max_rows integer)
RETURNS TABLE (business_id uuid, action text, actor_type text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.business_id, a.action, a.actor_type, a.created_at
    FROM audit_events a ORDER BY a.created_at DESC LIMIT least(greatest(max_rows, 1), 100);
$$;

REVOKE ALL ON FUNCTION platform_business_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_recent_activity(integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION platform_business_stats() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION platform_recent_activity(integer) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION platform_business_stats() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION platform_recent_activity(integer) FROM authenticated';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION platform_business_stats() TO vlux_app;
GRANT EXECUTE ON FUNCTION platform_recent_activity(integer) TO vlux_app;
