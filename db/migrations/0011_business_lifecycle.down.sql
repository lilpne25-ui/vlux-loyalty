-- Revierte 0011. Los negocios archivados vuelven a "suspendido" (no se borra ninguno).
DROP FUNCTION IF EXISTS platform_business_export(uuid);
DROP FUNCTION IF EXISTS platform_purge_business(uuid, text);
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% es de solo inserción', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege'; END $$;
DROP TABLE IF EXISTS business_deletions;
UPDATE businesses SET status = 'suspended', suspended_reason = coalesce(suspended_reason, archived_reason, 'Archivado') WHERE status = 'archived';
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check CHECK (status IN ('active','suspended'));
ALTER TABLE businesses DROP COLUMN IF EXISTS synthetic_declared_at;
ALTER TABLE businesses DROP COLUMN IF EXISTS archived_reason;
ALTER TABLE businesses DROP COLUMN IF EXISTS archived_at;
-- La llave foránea se restaura sin validar filas históricas de negocios ya eliminados.
ALTER TABLE platform_audit_events ADD CONSTRAINT platform_audit_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) NOT VALID;
