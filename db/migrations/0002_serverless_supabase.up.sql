-- VLUX Loyalty V0.2.1 · preparación para Vercel Functions + Supabase.
-- 1) Límite de solicitudes compartido entre instancias (antes vivía en memoria del proceso).
-- 2) Endurecimiento para Supabase: las tablas viven en "public", que la Data API (PostgREST) expone
--    a los roles anon/authenticated. La app NO usa la Data API: se les quita todo acceso y se activa
--    RLS en todas las tablas para que, aunque alguien vuelva a otorgar permisos, no vean filas.
-- Es idempotente y funciona también en PostgreSQL local (donde anon/authenticated no existen).

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash    text PRIMARY KEY,            -- sha256 de la llave (no se guarda IP ni correo en claro)
  count       integer NOT NULL,
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expires ON rate_limits (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO vlux_app;

-- Tablas globales: RLS activado con una política que solo admite al rol de la aplicación.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','staff_users','staff_memberships','staff_sessions','card_access_tokens','rate_limits','schema_migrations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'app_only') THEN
        EXECUTE format('CREATE POLICY app_only ON %I TO vlux_app USING (true) WITH CHECK (true)', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Roles de la Data API de Supabase: sin acceso a nada de la aplicación.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
