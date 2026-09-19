CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE, phone text NOT NULL,
 active boolean NOT NULL DEFAULT true, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS homes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), address text NOT NULL, city text NOT NULL, zip text NOT NULL,
 profile jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(customer_id,address,zip)
);
CREATE TABLE IF NOT EXISTS leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL, type text NOT NULL CHECK(type IN('residential','commercial','contact')),
 name text NOT NULL DEFAULT '', email text NOT NULL, phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 service text, quoted_amount integer, stage text NOT NULL, status text NOT NULL DEFAULT 'new', payload jsonb NOT NULL DEFAULT '{}', notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_updated ON leads(updated_at DESC);
CREATE TABLE IF NOT EXISTS appointment_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 50),
 blocked boolean NOT NULL DEFAULT false, label text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at), UNIQUE(starts_at,ends_at)
);
CREATE TABLE IF NOT EXISTS checkout_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), slot_id uuid NOT NULL REFERENCES appointment_slots(id),
 token_hash text NOT NULL, status text NOT NULL CHECK(status IN('creating','open','paid','expired','failed','issue')),
 expires_at timestamptz NOT NULL, stripe_session_id text UNIQUE, stripe_url text, payload jsonb NOT NULL, quote jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS holds_slot ON checkout_holds(slot_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_hold_per_lead ON checkout_holds(lead_id) WHERE status IN ('creating','open');
CREATE TABLE IF NOT EXISTS recurring_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), home_id uuid NOT NULL REFERENCES homes(id), frequency text NOT NULL,
 status text NOT NULL DEFAULT 'coordination_needed', preferences jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE, customer_id uuid NOT NULL REFERENCES customers(id), home_id uuid NOT NULL REFERENCES homes(id),
 slot_id uuid NOT NULL REFERENCES appointment_slots(id), hold_id uuid UNIQUE REFERENCES checkout_holds(id), recurring_plan_id uuid REFERENCES recurring_plans(id),
 kind text NOT NULL DEFAULT 'residential', service text NOT NULL, frequency text NOT NULL, amount integer NOT NULL CHECK(amount>=0), refunded_amount integer NOT NULL DEFAULT 0,
 payment_status text NOT NULL DEFAULT 'paid', status text NOT NULL DEFAULT 'confirmed', quote jsonb NOT NULL, details jsonb NOT NULL,
 stripe_session_id text UNIQUE, stripe_payment_intent text, internal_notes text NOT NULL DEFAULT '',
 en_route_at timestamptz, checked_in_at timestamptz, checked_out_at timestamptz, completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_slot ON bookings(slot_id,status);
CREATE INDEX IF NOT EXISTS bookings_customer ON bookings(customer_id);
CREATE TABLE IF NOT EXISTS cleaners (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS job_assignments (booking_id uuid REFERENCES bookings(id), cleaner_id uuid REFERENCES cleaners(id), PRIMARY KEY(booking_id,cleaner_id));
CREATE TABLE IF NOT EXISTS job_checklists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id), label text NOT NULL, category text NOT NULL, checked_at timestamptz, checked_by uuid REFERENCES cleaners(id));
CREATE TABLE IF NOT EXISTS job_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id), storage_key text NOT NULL,
 category text NOT NULL CHECK(category IN('before','after','damage')), uploaded_by uuid REFERENCES cleaners(id), consent_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE job_photos IS 'Private storage keys only. Future downloads require per-booking authorization and short-lived signed URLs. No public bucket or public photo route.';
CREATE TABLE IF NOT EXISTS booking_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES bookings(id), event text NOT NULL, actor text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS stripe_events (id text PRIMARY KEY, type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE, recipient text NOT NULL, subject text NOT NULL, html text NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, last_error text, locked_at timestamptz, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL,code_hash text NOT NULL,expires_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,used boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor text NOT NULL, action text NOT NULL, record_id text, created_at timestamptz NOT NULL DEFAULT now());
