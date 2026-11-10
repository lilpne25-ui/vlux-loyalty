ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_logo_fit_size;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_logo_original_size;
ALTER TABLE businesses DROP COLUMN IF EXISTS logo_original_data_url;
ALTER TABLE businesses DROP COLUMN IF EXISTS logo_fit;
