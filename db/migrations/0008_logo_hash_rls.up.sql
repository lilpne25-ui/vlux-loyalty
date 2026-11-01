-- V0.4.2: (A) hash del logotipo almacenado (antes se calculaba md5 del data URL en cada petición pública)
--         (B) RLS de businesses: escritura solo del negocio activo de la transacción.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_hash text;
UPDATE businesses SET logo_hash = substr(md5(logo_data_url), 1, 12) WHERE logo_data_url IS NOT NULL AND logo_hash IS NULL;

CREATE OR REPLACE FUNCTION businesses_set_logo_hash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.logo_hash := CASE WHEN NEW.logo_data_url IS NULL THEN NULL ELSE substr(md5(NEW.logo_data_url), 1, 12) END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS businesses_logo_hash ON businesses;
CREATE TRIGGER businesses_logo_hash BEFORE INSERT OR UPDATE OF logo_data_url ON businesses FOR EACH ROW EXECUTE FUNCTION businesses_set_logo_hash();

-- Política por operación: lectura pública por clave (slug), alta sin contexto de negocio (plataforma/seed),
-- y actualización únicamente de la fila del negocio fijado en app.business_id (withTenant).
DROP POLICY IF EXISTS app_only ON businesses;
CREATE POLICY businesses_select ON businesses FOR SELECT TO vlux_app USING (true);
CREATE POLICY businesses_insert ON businesses FOR INSERT TO vlux_app WITH CHECK (true);
CREATE POLICY businesses_update_own ON businesses FOR UPDATE TO vlux_app
  USING (id = current_business_id()) WITH CHECK (id = current_business_id());
