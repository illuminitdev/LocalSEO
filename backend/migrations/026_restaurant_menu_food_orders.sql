-- Restaurant menu catalog + paid food orders (pickup / delivery)

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS food_delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS food_pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS delivery_fee_cents INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_min_order_cents INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS org_menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_menu_items_org_active_sort
    ON org_menu_items (org_id, active, sort_order);

CREATE TABLE IF NOT EXISTS food_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    fulfillment TEXT NOT NULL CHECK (fulfillment IN ('delivery', 'pickup')),
    status TEXT NOT NULL DEFAULT 'pending_payment',
    customer_name TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    delivery_address TEXT NOT NULL DEFAULT '',
    delivery_notes TEXT NOT NULL DEFAULT '',
    pickup_at TIMESTAMPTZ,
    subtotal_cents INT NOT NULL DEFAULT 0,
    delivery_fee_cents INT NOT NULL DEFAULT 0,
    total_cents INT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'GBP',
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    paid_at TIMESTAMPTZ,
    manage_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_orders_org_created
    ON food_orders (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_food_orders_manage_token
    ON food_orders (manage_token);

CREATE TABLE IF NOT EXISTS food_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES org_menu_items(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    line_total_cents INT NOT NULL CHECK (line_total_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_order_items_order
    ON food_order_items (food_order_id);
