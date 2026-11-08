-- VLUX Loyalty 1.0.x · REVERTIR 0017 en Supabase. Solo con autorización explícita de Vlux.
-- BORRA las solicitudes de recuperación y el WhatsApp configurado por cada negocio. No toca tarjetas, clientes ni bitácora.
-- Antes: si el código 1.0.x sigue desplegado, no pasa nada grave (las rutas nuevas responden 503 y la app sigue).
BEGIN;
-- Revierte 0017. BORRA las solicitudes de recuperación y el WhatsApp configurado por cada negocio.
-- No toca tarjetas, clientes, enlaces ni la bitácora (los eventos recovery.* y support.* quedan como historial).
DROP TABLE IF EXISTS recovery_requests;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_contact_whatsapp_check;
ALTER TABLE businesses DROP COLUMN IF EXISTS contact_whatsapp;
DELETE FROM schema_migrations WHERE version = '0017_recovery_support';
COMMIT;
