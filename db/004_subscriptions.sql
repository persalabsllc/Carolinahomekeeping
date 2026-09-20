ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS initial_invoice_id text;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS anchor_start timestamptz;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS interval_weeks integer CHECK(interval_weeks IN(1,2,4));
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS amount integer;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS quote jsonb;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS cancel_at timestamptz;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE recurring_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_index integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_invoice_id text UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS booking_recurring_occurrence ON bookings(recurring_plan_id,recurrence_index) WHERE recurring_plan_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS subscription_invoices (
 id text PRIMARY KEY, plan_id uuid NOT NULL REFERENCES recurring_plans(id), booking_id uuid REFERENCES bookings(id),
 status text NOT NULL, amount_paid integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_sync ON recurring_plans(last_synced_at) WHERE stripe_subscription_id IS NOT NULL;
