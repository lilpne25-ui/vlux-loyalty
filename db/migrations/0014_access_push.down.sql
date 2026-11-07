-- Revierte 0014 (V0.4.6). BORRA suscripciones push, preferencias, citas y el historial de notificaciones.
DROP FUNCTION IF EXISTS notification_due_businesses(integer);
DROP TABLE IF EXISTS notification_outbox;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS notification_settings;
DROP TABLE IF EXISTS push_subscriptions;
ALTER TABLE businesses DROP COLUMN IF EXISTS longitude;
ALTER TABLE businesses DROP COLUMN IF EXISTS latitude;
UPDATE email_outbox SET provider = NULL WHERE provider = 'smtp';
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_provider_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_provider_check CHECK (provider IS NULL OR provider IN ('resend','mock'));
DROP INDEX IF EXISTS staff_invitations_access_code;
ALTER TABLE staff_invitations DROP CONSTRAINT IF EXISTS staff_invitations_delivery_check;
ALTER TABLE staff_invitations DROP COLUMN IF EXISTS delivery;
ALTER TABLE staff_invitations DROP COLUMN IF EXISTS access_code_hash;
