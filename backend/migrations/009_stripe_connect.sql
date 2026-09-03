-- Stripe Connect: per-org connected account for booking deposits (direct charges + application fee)
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_stripe_account_id
    ON organizations (stripe_account_id)
    WHERE stripe_account_id IS NOT NULL;
