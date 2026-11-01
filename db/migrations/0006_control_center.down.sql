-- Reversa de 0006 (solo para desarrollo local; en entornos con datos, crear una migración nueva).
DROP FUNCTION IF EXISTS platform_recent_activity(integer);
DROP FUNCTION IF EXISTS platform_business_stats();
ALTER TABLE businesses DROP COLUMN IF EXISTS suspended_reason;
ALTER TABLE businesses DROP COLUMN IF EXISTS logo_data_url;
DROP TABLE IF EXISTS business_subscriptions;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS staff_invitations;
DROP TABLE IF EXISTS platform_audit_events;
DROP TABLE IF EXISTS platform_admin_invitations;
DROP TABLE IF EXISTS platform_admin_sessions;
DROP TABLE IF EXISTS platform_admin_recovery_codes;
DROP TABLE IF EXISTS platform_admins;
