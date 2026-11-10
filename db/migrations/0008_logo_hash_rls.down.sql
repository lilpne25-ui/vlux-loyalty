-- Reversa de 0008 (solo desarrollo local).
DROP POLICY IF EXISTS businesses_select ON businesses;
DROP POLICY IF EXISTS businesses_insert ON businesses;
DROP POLICY IF EXISTS businesses_update_own ON businesses;
CREATE POLICY app_only ON businesses TO vlux_app USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS businesses_logo_hash ON businesses;
DROP FUNCTION IF EXISTS businesses_set_logo_hash();
ALTER TABLE businesses DROP COLUMN IF EXISTS logo_hash;
