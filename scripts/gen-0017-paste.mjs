// Genera docs/release-1.0/0017_{pegar,revertir}_en_supabase.sql a partir de db/migrations/0017_* (mismo checksum que
// scripts/migrate.ts). Así el archivo para pegar nunca se desincroniza de la migración probada.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const up = readFileSync('db/migrations/0017_recovery_support.up.sql', 'utf8');
const down = readFileSync('db/migrations/0017_recovery_support.down.sql', 'utf8');
const sum = createHash('sha256').update(up).digest('hex');
writeFileSync('docs/release-1.0/0017_pegar_en_supabase.sql', `-- VLUX Loyalty 1.0.x · Migración 0017 (recuperación de acceso + WhatsApp del negocio) para PEGAR en el editor SQL de Supabase.
-- NO se ha aplicado en ningún entorno remoto. Solo con autorización explícita de Vlux.
-- Es ADITIVA e independiente de 0016: sirve con Preview en 0015 o en 0016, y 0016 puede pegarse después
-- (matriz probada en PostgreSQL 16 y 17 aislados: scripts/verify-migration-matrix.sh).
-- Orden: puede pegarse antes o después de desplegar el código. Sin 0017, el código responde 503 en las rutas nuevas
-- y el resto de la app sigue igual; con 0017 y código viejo, nada usa la tabla nueva.
-- Después: GET /api/internal/notifications/run (cron) aplica la retención; verifícala con 0017_verificar_retencion.sql.
-- Rollback: docs/release-1.0/0017_revertir_en_supabase.sql (borra solicitudes de recuperación y el WhatsApp de cada negocio).
-- Generado por scripts/gen-0017-paste.mjs. Checksum sha256 de db/migrations/0017_recovery_support.up.sql: ${sum}
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0017_recovery_support') THEN RAISE EXCEPTION '0017 ya está registrada: no la pegues otra vez'; END IF; IF (SELECT count(*) FROM schema_migrations WHERE version <= '0015_release_hardening') <> 15 THEN RAISE EXCEPTION 'Faltan migraciones 0001-0015 en el historial'; END IF; END $$;
${up.trimEnd()}
INSERT INTO schema_migrations (version, checksum) VALUES ('0017_recovery_support', '${sum}');
COMMIT;
`);
writeFileSync('docs/release-1.0/0017_revertir_en_supabase.sql', `-- VLUX Loyalty 1.0.x · REVERTIR 0017 en Supabase. Solo con autorización explícita de Vlux.
-- BORRA las solicitudes de recuperación y el WhatsApp configurado por cada negocio. No toca tarjetas, clientes ni bitácora.
-- Con el código 1.0.x desplegado no hace falta apagar nada: las rutas de recuperación pasan a 503 en ≤60 s (o al primer
-- error) y el resto de la app sigue. Generado por scripts/gen-0017-paste.mjs.
BEGIN;
${down.trimEnd()}
DELETE FROM schema_migrations WHERE version = '0017_recovery_support';
COMMIT;
`);
console.log(`0017 checksum ${sum}`);
