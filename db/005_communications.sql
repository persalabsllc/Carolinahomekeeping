ALTER TABLE leads ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'transactional';
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id);
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id);
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS scheduled_start timestamptz;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS send_after timestamptz NOT NULL DEFAULT now();
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS plain_text text;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS headers jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox(send_after) WHERE status IN ('pending','sending');
CREATE TABLE IF NOT EXISTS email_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 unsubscribed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recovery_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid UNIQUE NOT NULL REFERENCES leads(id),
 email text UNIQUE NOT NULL, percent integer NOT NULL CHECK(percent BETWEEN 1 AND 50),
 expires_at timestamptz NOT NULL, redeemed_at timestamptz, booking_id uuid REFERENCES bookings(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE checkout_holds ADD COLUMN IF NOT EXISTS recovery_offer_id uuid REFERENCES recovery_offers(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_recovery_hold ON checkout_holds(recovery_offer_id) WHERE recovery_offer_id IS NOT NULL AND status IN ('creating','open','paid');
CREATE TABLE IF NOT EXISTS booking_feedback (
 booking_id uuid PRIMARY KEY REFERENCES bookings(id), rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 message text NOT NULL DEFAULT '', contact_requested boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings(key,value) VALUES('communications', jsonb_build_object(
 'ownerEmail','kkratoville@gmail.com','ownerAlerts',true,'reminders',true,'followups',true,'recovery',true,
 'followupHours',2,'recoveryHours',2,'offerDays',7,'offerPercent',10,'postalAddress','','reviewUrl','',
 'enabledAt',now())) ON CONFLICT(key) DO NOTHING;
