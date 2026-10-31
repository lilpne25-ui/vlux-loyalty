-- VLUX Loyalty V0.2.1 · funciones operativas mínimas para el piloto:
-- anulación auditada de compras, restablecimiento de contraseña del personal y cambio obligatorio.

-- Anulación de compras (no se borra nada: se marca y se registra un movimiento negativo en el libro mayor).
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS voided_at   timestamptz;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES staff_users(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 3 AND 200);
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_void_consistent;
ALTER TABLE purchases ADD CONSTRAINT purchases_void_consistent
  CHECK ((voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL));

ALTER TABLE stamp_events DROP CONSTRAINT IF EXISTS stamp_events_reason_check;
ALTER TABLE stamp_events ADD CONSTRAINT stamp_events_reason_check CHECK (reason IN ('purchase','redemption','void'));
ALTER TABLE stamp_events DROP CONSTRAINT IF EXISTS stamp_events_check;
ALTER TABLE stamp_events ADD CONSTRAINT stamp_events_check CHECK (
     (reason = 'purchase'   AND purchase_id IS NOT NULL AND reward_id IS NULL AND delta > 0)
  OR (reason = 'redemption' AND reward_id IS NOT NULL AND purchase_id IS NULL AND delta < 0)
  OR (reason = 'void'       AND purchase_id IS NOT NULL AND reward_id IS NULL AND delta < 0));
-- Una compra solo se anula una vez.
CREATE UNIQUE INDEX IF NOT EXISTS stamp_events_one_void ON stamp_events (purchase_id) WHERE reason = 'void';

-- Contraseña temporal: el usuario debe cambiarla al entrar.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Enlaces de restablecimiento de contraseña (un solo uso, 60 min). Solo se guarda el hash.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES staff_users(id),
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens (user_id);
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'password_reset_tokens' AND policyname = 'app_only') THEN
    CREATE POLICY app_only ON password_reset_tokens TO vlux_app USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON password_reset_tokens TO vlux_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON password_reset_tokens FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON password_reset_tokens FROM authenticated; END IF;
END $$;
