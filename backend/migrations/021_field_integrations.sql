-- Field check-in / signature + Zapier / QuickBooks org columns

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS checkin_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS checkin_lng DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signature_url TEXT;

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS zapier_webhook_url TEXT,
    ADD COLUMN IF NOT EXISTS zapier_secret TEXT,
    ADD COLUMN IF NOT EXISTS qbo_realm_id TEXT,
    ADD COLUMN IF NOT EXISTS qbo_access_token TEXT,
    ADD COLUMN IF NOT EXISTS qbo_refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS qbo_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS qbo_connected_at TIMESTAMPTZ;
