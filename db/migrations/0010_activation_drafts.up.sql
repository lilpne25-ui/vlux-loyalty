-- V0.4.4: Brand Activation Draft. Diseño de tarjeta preparado en la parte pública que el equipo VLUX recupera (tras login + 2FA)
-- en el Control Center. NO es un negocio: no concede permisos. Se guarda solo el hash de la referencia (alta entropía),
-- expira, y se consume una sola vez al crear el negocio. Aditiva y reversible.
CREATE TABLE IF NOT EXISTS activation_drafts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_hash           text NOT NULL UNIQUE,            -- sha256(hex) de la referencia; la referencia en claro nunca se guarda
  data               jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  consumed_at        timestamptz,
  consumed_business  uuid,
  CONSTRAINT activation_drafts_size CHECK (length(data::text) <= 300000),
  CONSTRAINT activation_drafts_ttl CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')
);
CREATE INDEX IF NOT EXISTS activation_drafts_expires ON activation_drafts (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON activation_drafts TO vlux_app;
ALTER TABLE activation_drafts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'activation_drafts' AND policyname = 'app_only') THEN
    CREATE POLICY app_only ON activation_drafts TO vlux_app USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON activation_drafts FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON activation_drafts FROM authenticated; END IF;
END $$;
