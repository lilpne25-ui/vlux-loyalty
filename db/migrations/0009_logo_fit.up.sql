-- V0.4.3: ajuste del logotipo (Intelligent Logo Engine). Solo agrega columnas opcionales; no borra ni reescribe datos.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_fit jsonb;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_original_data_url text;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_logo_fit_size;
ALTER TABLE businesses ADD CONSTRAINT businesses_logo_fit_size CHECK (logo_fit IS NULL OR (jsonb_typeof(logo_fit) = 'object' AND length(logo_fit::text) <= 600));
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_logo_original_size;
ALTER TABLE businesses ADD CONSTRAINT businesses_logo_original_size CHECK (logo_original_data_url IS NULL OR length(logo_original_data_url) <= 90000);
