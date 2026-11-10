-- Restaura el respaldo de 0011 (antes de eliminar las tablas que la versión 0014 consulta).
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
