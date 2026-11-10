-- Revierte 0015 (1.0.0-rc.1). No borra datos: solo índices, permisos y configuración de funciones.
DROP INDEX IF EXISTS appointments_card_fk;
DROP INDEX IF EXISTS push_subscriptions_card_fk;
DROP INDEX IF EXISTS review_events_card_fk;
DROP INDEX IF EXISTS card_pair_codes_card_fk;
DROP INDEX IF EXISTS card_access_tokens_card_fk;
DROP INDEX IF EXISTS cards_customer_fk;
DROP INDEX IF EXISTS rewards_rule_fk;
DROP INDEX IF EXISTS rewards_card_fk;
DROP INDEX IF EXISTS stamp_events_reward_fk;
DROP INDEX IF EXISTS stamp_events_purchase_fk;
DROP INDEX IF EXISTS purchases_rule_fk;
DROP INDEX IF EXISTS purchases_visit_fk;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', r);
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION current_business_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION businesses_set_logo_hash() TO PUBLIC;
GRANT EXECUTE ON FUNCTION forbid_mutation() TO PUBLIC;

ALTER FUNCTION businesses_set_logo_hash() RESET search_path;
ALTER FUNCTION forbid_mutation() RESET search_path;
