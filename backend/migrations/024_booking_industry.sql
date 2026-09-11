-- Booking industry presets + customer intake answers
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS booking_industry_id TEXT;

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS intake_answers JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_organizations_booking_industry
    ON organizations (booking_industry_id)
    WHERE booking_industry_id IS NOT NULL;
