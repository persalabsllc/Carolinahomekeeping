CREATE TABLE IF NOT EXISTS admin_credentials (
 email text PRIMARY KEY,
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_invitations (
 token_hash text PRIMARY KEY,
 email text NOT NULL,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE admin_invitations IS 'Single-use administrator setup invitations. Only SHA-256 token hashes are stored. Never expose these rows through public or CRM APIs.';
