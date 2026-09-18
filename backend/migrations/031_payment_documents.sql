-- Shared post-payment invoice/receipt documents for Checkout deposits & food orders

CREATE TABLE IF NOT EXISTS payment_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('booking_deposit', 'food_order', 'quote_deposit')),
    source_id UUID NOT NULL,
    invoice_number TEXT NOT NULL,
    amount_cents INT NOT NULL CHECK (amount_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'GBP',
    status TEXT NOT NULL DEFAULT 'paid',
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method_brand TEXT NOT NULL DEFAULT '',
    payment_method_last4 TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    business_name TEXT NOT NULL DEFAULT '',
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_documents_org_paid
    ON payment_documents (org_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_documents_client
    ON payment_documents (client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_documents_source
    ON payment_documents (source_type, source_id);

ALTER TABLE food_orders
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_food_orders_client
    ON food_orders (client_id) WHERE client_id IS NOT NULL;
