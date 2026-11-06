-- Revierte 0013 solo si no hay datos que dependan de los tipos nuevos (falla a propósito si los hay).
DROP INDEX IF EXISTS purchases_card_awarded;
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_stamps_awarded_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_stamps_awarded_check CHECK (stamps_awarded BETWEEN 0 AND 10);
ALTER TABLE purchases DROP COLUMN IF EXISTS service_label;
ALTER TABLE purchases DROP COLUMN IF EXISTS amount_cents;
ALTER TABLE reward_rules DROP CONSTRAINT IF EXISTS reward_rules_points_need_rate;
ALTER TABLE reward_rules DROP CONSTRAINT IF EXISTS reward_rules_max_stamps_per_purchase_check;
ALTER TABLE reward_rules ADD CONSTRAINT reward_rules_max_stamps_per_purchase_check CHECK (max_stamps_per_purchase BETWEEN 1 AND 10);
ALTER TABLE reward_rules DROP CONSTRAINT IF EXISTS reward_rules_stamps_required_check;
ALTER TABLE reward_rules ADD CONSTRAINT reward_rules_stamps_required_check CHECK (stamps_required BETWEEN 3 AND 15);
ALTER TABLE reward_rules DROP COLUMN IF EXISTS valid_until, DROP COLUMN IF EXISTS max_awards_per_day, DROP COLUMN IF EXISTS amount_per_point_cents,
  DROP COLUMN IF EXISTS eligible_services, DROP COLUMN IF EXISTS unit_plural, DROP COLUMN IF EXISTS unit_singular,
  DROP COLUMN IF EXISTS conditions, DROP COLUMN IF EXISTS program_name, DROP COLUMN IF EXISTS program_type;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_vertical_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_vertical_check CHECK (vertical IN ('cafeteria','barberia','salon','restaurante','otro'));
