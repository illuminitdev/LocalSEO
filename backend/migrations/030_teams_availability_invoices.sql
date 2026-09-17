-- Phase 1: surface invoice failures on bookings
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS invoice_last_error TEXT;

-- Phase 2: bookable team members + per-member availability (Booking Pro)
ALTER TABLE memberships
    ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';

ALTER TABLE availability_rules
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE availability_date_rules
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_availability_rules_org_user
    ON availability_rules (org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_availability_date_rules_org_user
    ON availability_date_rules (org_id, user_id);
