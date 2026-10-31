-- Reversa de 0001_init. Borra TODOS los datos de VLUX Loyalty: solo para desarrollo y pruebas.
DROP TABLE IF EXISTS audit_events, review_events, stamp_events, rewards, purchases, visits,
  card_access_tokens, cards, customers, reward_rules, staff_sessions, staff_memberships, staff_users, businesses CASCADE;
DROP FUNCTION IF EXISTS current_business_id();
DROP FUNCTION IF EXISTS forbid_mutation();
DROP FUNCTION IF EXISTS set_updated_at();
-- El rol vlux_app se conserva: puede tener permisos en otras bases.
