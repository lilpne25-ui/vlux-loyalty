-- V0.2.2: códigos de vinculación de un solo uso para abrir la tarjeta en la app instalada (PWA).
-- En iPhone la app de pantalla de inicio puede no compartir cookies con Safari; el cliente
-- genera un código corto en Safari (con su cookie) y lo escribe en la app instalada.
-- Solo se guarda el hash del código (con el negocio como sal); caduca a los 15 minutos.
CREATE TABLE card_pair_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   bytea NOT NULL,
  card_id     uuid NOT NULL,
  business_id uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (card_id, business_id) REFERENCES cards (id, business_id)
);
CREATE INDEX card_pair_codes_card ON card_pair_codes (card_id) WHERE used_at IS NULL;
-- Único solo entre códigos sin usar del mismo negocio: un número ya usado puede volver a salir.
CREATE UNIQUE INDEX card_pair_codes_open ON card_pair_codes (business_id, code_hash) WHERE used_at IS NULL;
CREATE INDEX card_pair_codes_expiry ON card_pair_codes (business_id, expires_at);

ALTER TABLE card_pair_codes ENABLE ROW LEVEL SECURITY;
-- Aislamiento por negocio, igual que las tablas de 0001 (todas las consultas van en withTenant).
CREATE POLICY tenant_isolation ON card_pair_codes USING (business_id = current_business_id()) WITH CHECK (business_id = current_business_id());
REVOKE ALL ON card_pair_codes FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON card_pair_codes FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON card_pair_codes FROM authenticated'; END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON card_pair_codes TO vlux_app;
