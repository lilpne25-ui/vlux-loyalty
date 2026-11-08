-- Revierte 0017. BORRA las solicitudes de recuperación y el WhatsApp configurado por cada negocio.
-- No toca tarjetas, clientes, enlaces ni la bitácora (los eventos recovery.* y support.* quedan como historial).
DROP TABLE IF EXISTS recovery_requests;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_contact_whatsapp_check;
ALTER TABLE businesses DROP COLUMN IF EXISTS contact_whatsapp;
