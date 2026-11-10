-- V0.4.5 · Catálogo ampliado de giros y motor de recompensas común (sellos por compra, visita o servicio,
-- puntos por consumo y programa personalizado). Aditiva: las reglas existentes quedan como "sellos por compra"
-- con el mismo comportamiento; no se reescribe ningún saldo, compra ni premio.

-- 1) Giros admitidos (los existentes siguen siendo válidos).
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_vertical_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_vertical_check CHECK (vertical IN (
  'cafeteria','restaurante','barberia','salon','unas','dentista','consultorio','taller','autolavado',
  'gimnasio','veterinaria','spa','optica','boutique','accesorios','otro'));

-- 2) Regla versionada con tipo de programa. Los rangos por tipo los valida la API; la BD fija límites duros.
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS program_type text NOT NULL DEFAULT 'stamps_purchase'
  CHECK (program_type IN ('stamps_purchase','stamps_visit','stamps_service','points','custom'));
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS program_name text NOT NULL DEFAULT '' CHECK (char_length(program_name) <= 60);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS conditions text NOT NULL DEFAULT '' CHECK (char_length(conditions) <= 300);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS unit_singular text CHECK (unit_singular IS NULL OR char_length(unit_singular) BETWEEN 1 AND 24);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS unit_plural text CHECK (unit_plural IS NULL OR char_length(unit_plural) BETWEEN 1 AND 24);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS eligible_services text[] NOT NULL DEFAULT '{}' CHECK (cardinality(eligible_services) <= 20);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS amount_per_point_cents integer CHECK (amount_per_point_cents IS NULL OR amount_per_point_cents BETWEEN 100 AND 100000);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS max_awards_per_day integer CHECK (max_awards_per_day IS NULL OR max_awards_per_day BETWEEN 1 AND 20);
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE reward_rules DROP CONSTRAINT IF EXISTS reward_rules_stamps_required_check;
ALTER TABLE reward_rules ADD CONSTRAINT reward_rules_stamps_required_check CHECK (stamps_required BETWEEN 1 AND 100000);
ALTER TABLE reward_rules DROP CONSTRAINT IF EXISTS reward_rules_max_stamps_per_purchase_check;
ALTER TABLE reward_rules ADD CONSTRAINT reward_rules_max_stamps_per_purchase_check CHECK (max_stamps_per_purchase BETWEEN 1 AND 100000);
ALTER TABLE reward_rules DROP CONSTRAINT IF EXISTS reward_rules_points_need_rate;
ALTER TABLE reward_rules ADD CONSTRAINT reward_rules_points_need_rate CHECK (program_type <> 'points' OR amount_per_point_cents IS NOT NULL);

-- 3) Operación de caja: monto (puntos) y servicio (sellos por servicio). Sin datos de salud: solo el nombre del servicio.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS amount_cents integer CHECK (amount_cents IS NULL OR amount_cents BETWEEN 1 AND 10000000);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS service_label text CHECK (service_label IS NULL OR char_length(service_label) BETWEEN 1 AND 40);
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_stamps_awarded_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_stamps_awarded_check CHECK (stamps_awarded BETWEEN 0 AND 100000);

-- 4) Índice para el límite diario y las consultas por tarjeta con premio (idempotente).
CREATE INDEX IF NOT EXISTS purchases_card_awarded ON purchases (card_id, created_at DESC) WHERE stamps_awarded > 0 AND voided_at IS NULL;
