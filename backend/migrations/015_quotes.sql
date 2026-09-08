-- Module 2: Quoting & estimates

CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    property_id UUID REFERENCES client_properties(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'expired')),
    title TEXT NOT NULL DEFAULT 'Quote',
    notes TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'GBP',
    deposit_cents INT NOT NULL DEFAULT 0,
    deposit_paid BOOLEAN NOT NULL DEFAULT FALSE,
    subtotal_cents INT NOT NULL DEFAULT 0,
    expiry_date DATE,
    public_token TEXT NOT NULL UNIQUE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes (client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes (public_token);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes (org_id, status);

CREATE TABLE IF NOT EXISTS quote_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    unit_price_cents INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote ON quote_line_items (quote_id, sort_order);

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
