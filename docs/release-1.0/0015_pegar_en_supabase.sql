-- VLUX Loyalty 1.0.0-rc.1 · Migración 0015 para PEGAR en el editor SQL de Supabase (Preview primero; Producción nueva usa migrate.ts).
-- Aditiva: índices, permisos y search_path. No borra ni modifica datos. Registra la fila de historial con su checksum.
-- Checksum sha256 de db/migrations/0015_release_hardening.up.sql: e1b0156b6b8389530aa8e4ba57631cd7d4b7b6a78c1c95cca0358b0dea2fe24f
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0015_release_hardening') THEN RAISE EXCEPTION '0015 ya está registrada: no la pegues otra vez'; END IF; IF (SELECT count(*) FROM schema_migrations WHERE version <= '0014_access_push') <> 14 THEN RAISE EXCEPTION 'Faltan migraciones 0001-0014 en el historial'; END IF; END $$;
-- 1.0.0-rc.1 · Endurecimiento para la versión comercial. ADITIVA: no borra datos ni cambia columnas.
-- Ver docs/release-1.0/SECURITY_REVIEW.md y docs/release-1.0/PERFORMANCE.md.

-- 1) search_path fijo (asesor de Supabase 0011 "function_search_path_mutable").
--    Causa: 0004 lo fijó, pero 0011 recreó forbid_mutation con CREATE OR REPLACE sin SET y eso borró la
--    configuración; businesses_set_logo_hash (0008) nunca lo tuvo. El cuerpo de ambas NO cambia, así que la
--    eliminación controlada (vlux.purge_business) y las bitácoras de solo inserción se comportan igual.
ALTER FUNCTION forbid_mutation() SET search_path = pg_catalog, public;
ALTER FUNCTION businesses_set_logo_hash() SET search_path = pg_catalog, public;

-- 2) EXECUTE mínimo. Las funciones de disparador no necesitan EXECUTE del rol que modifica la tabla
--    (PostgreSQL no lo revisa al disparar), así que se retira a PUBLIC. current_business_id lo usa RLS
--    como vlux_app, que conserva su permiso explícito.
REVOKE EXECUTE ON FUNCTION forbid_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION businesses_set_logo_hash() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION current_business_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_business_id() TO vlux_app;

-- 3) Supabase concede por omisión permisos a anon/authenticated sobre objetos NUEVOS de public. Las
--    migraciones anteriores los retiran tabla por tabla; esto evita que una migración futura los olvide.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- 4) Índices de llaves foráneas en la ruta de borrado de la purga controlada (medido, no por el linter):
--    negocio sintético con 1 año de historial (54,770 visitas y compras): 212 s → 1.5 s. Sin ellos, cada fila
--    borrada revisa la tabla hija completa y la purga superaría el límite de 15 s de Vercel con bloqueos abiertos.
--    Las tablas de Preview pesan ~13 MB: crear los índices dentro de la transacción tarda milisegundos.
--    En una base grande, crearlos antes con CREATE INDEX CONCURRENTLY (mismo nombre) y esta migración los omite.
CREATE INDEX IF NOT EXISTS purchases_visit_fk ON purchases (visit_id, business_id);
CREATE INDEX IF NOT EXISTS purchases_rule_fk ON purchases (rule_id, business_id);
CREATE INDEX IF NOT EXISTS stamp_events_purchase_fk ON stamp_events (purchase_id, business_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stamp_events_reward_fk ON stamp_events (reward_id, business_id) WHERE reward_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rewards_card_fk ON rewards (card_id, business_id);
CREATE INDEX IF NOT EXISTS rewards_rule_fk ON rewards (rule_id, business_id);
CREATE INDEX IF NOT EXISTS cards_customer_fk ON cards (customer_id, business_id);
CREATE INDEX IF NOT EXISTS card_access_tokens_card_fk ON card_access_tokens (card_id, business_id);
CREATE INDEX IF NOT EXISTS card_pair_codes_card_fk ON card_pair_codes (card_id, business_id);
CREATE INDEX IF NOT EXISTS review_events_card_fk ON review_events (card_id, business_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_card_fk ON push_subscriptions (card_id, business_id);
CREATE INDEX IF NOT EXISTS appointments_card_fk ON appointments (card_id, business_id);
INSERT INTO schema_migrations (version, checksum) VALUES ('0015_release_hardening', 'e1b0156b6b8389530aa8e4ba57631cd7d4b7b6a78c1c95cca0358b0dea2fe24f');
COMMIT;
