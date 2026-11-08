-- VLUX Loyalty 1.0.x · REVERTIR 0017 en Supabase. Solo con autorización explícita de Vlux.
-- BORRA las solicitudes de recuperación y el WhatsApp configurado por cada negocio. No toca tarjetas, clientes ni bitácora.
-- Con el código 1.0.x desplegado no hace falta apagar nada: las rutas de recuperación pasan a 503 en ≤60 s (o al primer
-- error) y el resto de la app sigue. Generado por scripts/gen-0017-paste.mjs.
BEGIN;
-- Revierte 0017. BORRA las solicitudes de recuperación y el WhatsApp configurado por cada negocio.
-- No toca tarjetas, clientes, enlaces ni la bitácora (los eventos recovery.* y support.* quedan como historial).
-- Se puede ejecutar con la app encendida: el código 1.0.x detecta la tabla faltante (42P01/42703), olvida su caché
-- y responde 503 «recovery_unavailable» solo en las rutas de recuperación; el resto de la app sigue igual.
DROP FUNCTION IF EXISTS recovery_retention_sweep(integer);
DROP FUNCTION IF EXISTS recovery_mask(text, text);
DROP TABLE IF EXISTS recovery_requests;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_contact_whatsapp_check;
ALTER TABLE businesses DROP COLUMN IF EXISTS contact_whatsapp;
DELETE FROM schema_migrations WHERE version = '0017_recovery_support';
COMMIT;
