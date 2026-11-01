DROP TABLE IF EXISTS password_reset_tokens;
ALTER TABLE staff_users DROP COLUMN IF EXISTS must_change_password;
DROP INDEX IF EXISTS stamp_events_one_void;
ALTER TABLE stamp_events DROP CONSTRAINT IF EXISTS stamp_events_check;
ALTER TABLE stamp_events ADD CONSTRAINT stamp_events_check CHECK (
     (reason = 'purchase'   AND purchase_id IS NOT NULL AND reward_id IS NULL AND delta > 0)
  OR (reason = 'redemption' AND reward_id IS NOT NULL AND purchase_id IS NULL AND delta < 0));
ALTER TABLE stamp_events DROP CONSTRAINT IF EXISTS stamp_events_reason_check;
ALTER TABLE stamp_events ADD CONSTRAINT stamp_events_reason_check CHECK (reason IN ('purchase','redemption'));
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_void_consistent;
ALTER TABLE purchases DROP COLUMN IF EXISTS void_reason, DROP COLUMN IF EXISTS voided_by, DROP COLUMN IF EXISTS voided_at;
