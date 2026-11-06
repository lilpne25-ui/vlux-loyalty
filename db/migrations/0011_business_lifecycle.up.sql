-- V0.4.5 · Ciclo de vida de negocios: archivar, restaurar y eliminar de forma controlada.
-- Aditiva: no borra ni reescribe datos existentes. La eliminación definitiva solo ocurre por la función
-- platform_purge_business(), que la API llama tras confirmación escrita, 2FA, respaldo descargado y bitácora.

-- 1) Nuevo estado "archived" (fuera de operación, recuperable).
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check CHECK (status IN ('active','suspended','archived'));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS archived_reason text CHECK (archived_reason IS NULL OR char_length(archived_reason) <= 300);
-- Cuándo y por qué se declaró que los datos del negocio son sintéticos (pruebas de VLUX).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS synthetic_declared_at timestamptz;

-- 2) La bitácora global sobrevive a la eliminación del negocio: se quita la llave foránea (las filas se conservan).
ALTER TABLE platform_audit_events DROP CONSTRAINT IF EXISTS platform_audit_events_business_id_fkey;

-- 3) Lápida de cada eliminación definitiva (solo inserción). Sin datos personales: solo conteos.
CREATE TABLE IF NOT EXISTS business_deletions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL UNIQUE,
  slug             text NOT NULL,
  name             text NOT NULL,
  was_demo         boolean NOT NULL,
  counts           jsonb NOT NULL,
  backup_sha256    text CHECK (backup_sha256 IS NULL OR backup_sha256 ~ '^[0-9a-f]{64}$'),
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  deleted_by       uuid NOT NULL REFERENCES platform_admins(id),
  deleted_at       timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS business_deletions_append_only ON business_deletions;
CREATE TRIGGER business_deletions_append_only BEFORE UPDATE OR DELETE ON business_deletions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
ALTER TABLE business_deletions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_deletions' AND policyname = 'app_only') THEN
    CREATE POLICY app_only ON business_deletions TO vlux_app USING (true) WITH CHECK (true);
  END IF;
END $$;
REVOKE ALL ON business_deletions FROM PUBLIC;
GRANT SELECT, INSERT ON business_deletions TO vlux_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON business_deletions FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON business_deletions FROM authenticated; END IF;
END $$;

-- 4) Las tablas de solo inserción permiten borrar SOLO dentro de la purga de su propio negocio
--    (variable de transacción fijada por la función de purga, que corre como dueño del esquema, nunca como vlux_app).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME IN ('stamp_events','audit_events')
     AND current_user <> 'vlux_app'
     AND current_setting('vlux.purge_business', true) = OLD.business_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% es de solo inserción', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;

-- 5) Purga transaccional de un negocio archivado. Reglas en BD (defensa en profundidad, además de la API):
--    - el negocio debe estar archivado y el identificador escrito debe coincidir;
--    - solo negocios de demostración o declarados con datos sintéticos (o sin clientes);
--    - el personal compartido con otros negocios NO se borra (solo su acceso a este negocio).
CREATE OR REPLACE FUNCTION platform_purge_business(p_business uuid, p_confirm_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b record;
  n_customers bigint;
  users uuid[];
  u uuid;
  kept int := 0;
  removed int := 0;
  c jsonb := '{}'::jsonb;
  k bigint;
BEGIN
  SELECT id, slug, status, is_demo, synthetic_declared_at INTO b FROM businesses WHERE id = p_business FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'negocio inexistente' USING ERRCODE = 'no_data_found'; END IF;
  IF b.status <> 'archived' THEN RAISE EXCEPTION 'el negocio debe estar archivado' USING ERRCODE = 'check_violation'; END IF;
  IF b.slug IS DISTINCT FROM p_confirm_slug THEN RAISE EXCEPTION 'confirmación incorrecta' USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*) INTO n_customers FROM customers WHERE business_id = p_business;
  IF NOT b.is_demo AND b.synthetic_declared_at IS NULL AND n_customers > 0 THEN
    RAISE EXCEPTION 'negocio con clientes reales: solo se puede archivar' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(DISTINCT user_id), '{}') INTO users FROM staff_memberships WHERE business_id = p_business;
  PERFORM set_config('vlux.purge_business', p_business::text, true);

  DELETE FROM review_events WHERE business_id = p_business;       GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('reviewEvents', k);
  DELETE FROM stamp_events WHERE business_id = p_business;        GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('stampEvents', k);
  DELETE FROM rewards WHERE business_id = p_business;             GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('rewards', k);
  DELETE FROM purchases WHERE business_id = p_business;           GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('purchases', k);
  DELETE FROM visits WHERE business_id = p_business;              GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('visits', k);
  DELETE FROM card_pair_codes WHERE business_id = p_business;
  DELETE FROM card_access_tokens WHERE business_id = p_business;
  DELETE FROM cards WHERE business_id = p_business;               GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('cards', k);
  DELETE FROM customers WHERE business_id = p_business;           GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('customers', k);
  DELETE FROM reward_rules WHERE business_id = p_business;        GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('rewardRules', k);
  DELETE FROM audit_events WHERE business_id = p_business;        GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('auditEvents', k);
  DELETE FROM staff_sessions WHERE business_id = p_business;      GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('staffSessions', k);
  DELETE FROM staff_invitations WHERE business_id = p_business;   GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('invitations', k);
  DELETE FROM staff_memberships WHERE business_id = p_business;   GET DIAGNOSTICS k = ROW_COUNT; c := c || jsonb_build_object('memberships', k);
  IF to_regclass('public.email_outbox') IS NOT NULL THEN
    EXECUTE 'DELETE FROM email_outbox WHERE business_id = $1' USING p_business;
  END IF;
  DELETE FROM business_subscriptions WHERE business_id = p_business;
  DELETE FROM businesses WHERE id = p_business;

  -- Personal: se borra SOLO quien ya no tiene acceso a ningún otro negocio ni dejó rastro en otro negocio.
  FOREACH u IN ARRAY users LOOP
    IF EXISTS (SELECT 1 FROM staff_memberships WHERE user_id = u)
       OR EXISTS (SELECT 1 FROM staff_invitations WHERE accepted_user_id = u)
       OR EXISTS (SELECT 1 FROM purchases WHERE staff_user_id = u OR voided_by = u)
       OR EXISTS (SELECT 1 FROM visits WHERE created_by = u)
       OR EXISTS (SELECT 1 FROM rewards WHERE redeemed_by = u)
       OR EXISTS (SELECT 1 FROM stamp_events WHERE staff_user_id = u)
       OR EXISTS (SELECT 1 FROM reward_rules WHERE created_by = u) THEN
      kept := kept + 1;
    ELSE
      DELETE FROM password_reset_tokens WHERE user_id = u;
      DELETE FROM staff_sessions WHERE user_id = u;
      DELETE FROM staff_users WHERE id = u;
      removed := removed + 1;
    END IF;
  END LOOP;
  RETURN c || jsonb_build_object('usersKept', kept, 'usersDeleted', removed);
END $$;
REVOKE ALL ON FUNCTION platform_purge_business(uuid, text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION platform_purge_business(uuid, text) FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION platform_purge_business(uuid, text) FROM authenticated'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION platform_purge_business(uuid, text) TO vlux_app;

-- 6) Respaldo previo a la eliminación: lectura completa de UN negocio (solo para el Control Center, tras 2FA).
--    No incluye hashes de contraseñas, tokens ni códigos.
CREATE OR REPLACE FUNCTION platform_business_export(p_business uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'business', (SELECT to_jsonb(b) - 'logo_data_url' - 'logo_original_data_url' FROM businesses b WHERE b.id = p_business),
    'subscription', (SELECT to_jsonb(s) FROM business_subscriptions s WHERE s.business_id = p_business),
    'rewardRules', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.version), '[]') FROM reward_rules r WHERE r.business_id = p_business),
    'customers', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]') FROM customers x WHERE x.business_id = p_business),
    'cards', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]') FROM cards x WHERE x.business_id = p_business),
    'visits', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.started_at), '[]') FROM visits x WHERE x.business_id = p_business),
    'purchases', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]') FROM purchases x WHERE x.business_id = p_business),
    'rewards', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.unlocked_at), '[]') FROM rewards x WHERE x.business_id = p_business),
    'stampEvents', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id), '[]') FROM stamp_events x WHERE x.business_id = p_business),
    'reviewEvents', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id), '[]') FROM review_events x WHERE x.business_id = p_business),
    'staff', (SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId', m.id, 'role', m.role, 'active', m.active, 'email', u.email, 'displayName', u.display_name, 'createdAt', m.created_at)), '[]')
                FROM staff_memberships m JOIN staff_users u ON u.id = m.user_id WHERE m.business_id = p_business),
    'invitations', (SELECT coalesce(jsonb_agg(to_jsonb(i) - 'token_hash'), '[]') FROM staff_invitations i WHERE i.business_id = p_business),
    'auditEvents', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]') FROM audit_events a WHERE a.business_id = p_business)
  );
$$;
REVOKE ALL ON FUNCTION platform_business_export(uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION platform_business_export(uuid) FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION platform_business_export(uuid) FROM authenticated'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION platform_business_export(uuid) TO vlux_app;
