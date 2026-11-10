-- V0.4.5 · Invitaciones por correo con buzón de salida (outbox) posterior al commit.
-- Una fila por invitación. El token del enlace se guarda CIFRADO (AES-256-GCM, llave del servidor) solo mientras
-- la invitación está pendiente, para poder reintentar el envío sin crear invitaciones nuevas; se borra al aceptarse,
-- revocarse o reemplazarse. Nunca se guarda el token en claro.
CREATE TABLE IF NOT EXISTS email_outbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          uuid NOT NULL,
  invitation_id        uuid NOT NULL UNIQUE,
  kind                 text NOT NULL DEFAULT 'staff_invitation' CHECK (kind IN ('staff_invitation')),
  to_email             text NOT NULL CHECK (char_length(to_email) BETWEEN 5 AND 254 AND to_email = lower(to_email)),
  link_enc             text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','requested','accepted','delivered','failed','bounced','complained','not_configured')),
  provider             text CHECK (provider IS NULL OR provider IN ('resend','mock')),
  provider_message_id  text CHECK (provider_message_id IS NULL OR char_length(provider_message_id) <= 200),
  attempts             integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sends_accepted       integer NOT NULL DEFAULT 0 CHECK (sends_accepted >= 0),
  last_error           text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  requested_at         timestamptz,
  accepted_at          timestamptz,
  delivered_at         timestamptz,
  failed_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_outbox_business ON email_outbox (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_outbox_message ON email_outbox (provider_message_id) WHERE provider_message_id IS NOT NULL;
DROP TRIGGER IF EXISTS email_outbox_updated ON email_outbox;
CREATE TRIGGER email_outbox_updated BEFORE UPDATE ON email_outbox FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Historial de intentos y avisos del proveedor (webhooks). Idempotente por event_key (p. ej. svix-id).
CREATE TABLE IF NOT EXISTS email_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  outbox_id   uuid NOT NULL REFERENCES email_outbox(id),
  business_id uuid NOT NULL,
  event_key   text UNIQUE CHECK (event_key IS NULL OR char_length(event_key) <= 200),
  kind        text NOT NULL CHECK (kind IN ('requested','accepted','failed','not_configured','delivered','bounced','complained','delayed','opened','other')),
  detail      text CHECK (detail IS NULL OR char_length(detail) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_outbox ON email_events (outbox_id, id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_outbox','email_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'app_only') THEN
      EXECUTE format('CREATE POLICY app_only ON %I TO vlux_app USING (true) WITH CHECK (true)', t);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated', t); END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON email_outbox TO vlux_app;
GRANT SELECT, INSERT ON email_events TO vlux_app;
