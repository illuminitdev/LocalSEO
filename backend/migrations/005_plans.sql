CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_cents INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    min_term_months INT NOT NULL DEFAULT 6,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_features (
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    PRIMARY KEY (plan_id, feature_key)
);

INSERT INTO plans (id, name, price_cents, currency, min_term_months) VALUES
    ('website-essential', 'Website Essential', 3900, 'GBP', 6),
    ('booking-solo', 'Booking Solo', 2900, 'GBP', 6),
    ('booking-solo-plus', 'Booking Solo Plus', 4900, 'GBP', 6),
    ('booking-pro', 'Booking Pro', 7900, 'GBP', 6),
    ('local-presence', 'Local Presence', 9900, 'GBP', 6),
    ('local-growth', 'Local Growth', 19900, 'GBP', 6),
    ('complete-growth-system', 'Complete Growth System', 24900, 'GBP', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plan_features (plan_id, feature_key) VALUES
    ('booking-solo', 'bookings'),
    ('booking-solo-plus', 'bookings'),
    ('booking-pro', 'bookings'),
    ('local-presence', 'local_presence'),
    ('local-growth', 'local_presence'),
    ('local-growth', 'local_growth'),
    ('local-growth', 'reporting'),
    ('complete-growth-system', 'local_presence'),
    ('complete-growth-system', 'local_growth'),
    ('complete-growth-system', 'reporting'),
    ('complete-growth-system', 'bookings')
ON CONFLICT (plan_id, feature_key) DO NOTHING;
