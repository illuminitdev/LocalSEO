-- Admin-managed booking industries (Who We Help / payment dropdown catalog)
CREATE TABLE IF NOT EXISTS booking_industries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Building2',
    sort_order INT NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    nav_slug TEXT,
    demo_ready BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_industries_active_sort
    ON booking_industries (active, sort_order)
    WHERE active = TRUE;

-- Seed current industries (idempotent). Canonical booking ids; nav_slug for Who We Help links.
INSERT INTO booking_industries (id, name, short_name, icon, sort_order, active, nav_slug, demo_ready) VALUES
    ('plumbing', 'Plumbers & Heating', 'Plumbers', 'Flame', 10, TRUE, '/web-design-for-plumbers', TRUE),
    ('electricians', 'Electricians & EV Chargers', 'Electricians', 'Zap', 20, TRUE, '/web-design-for-electricians', TRUE),
    ('cleaners', 'Cleaning Services', 'Cleaning', 'Sparkles', 30, TRUE, '/booking-system-for-cleaners', TRUE),
    ('valeting', 'Mobile Car Valeters & Detailers', 'Mobile car valeters & Detailers', 'Car', 40, TRUE, '/booking-system-for-car-valeters', TRUE),
    ('pressure-washing', 'Pressure Washing & Exterior', 'Pressure washing', 'Droplets', 50, TRUE, '/booking-system-for-pressure-washing', TRUE),
    ('pest-control', 'Pest Control Services', 'Pest Control', 'ShieldAlert', 60, TRUE, '/booking-system-for-pest-control', TRUE),
    ('gardeners', 'Gardeners & Landscapers', 'Gardeners & Landscapers', 'Trees', 70, TRUE, '/booking-system-for-gardeners', TRUE),
    ('dentists', 'Dental & Aesthetics', 'Dentists', 'Smile', 80, TRUE, '/booking-demo?industry=dentists', TRUE),
    ('restaurants', 'Restaurants & Cafes', 'Restaurants', 'Utensils', 90, TRUE, '/booking-demo?industry=restaurants', TRUE),
    ('salons', 'Salons & Aesthetics', 'Salons & Beauty', 'Scissors', 100, TRUE, '/booking-demo?industry=salons', TRUE),
    ('personal-trainers', 'Personal Trainers & Fitness', 'Personal Trainers', 'Dumbbell', 110, TRUE, '/booking-demo?industry=personal-trainers', TRUE),
    ('professional-services', 'Professional Services', 'Professional Services', 'Briefcase', 120, TRUE, '/booking-demo?industry=professional-services', TRUE),
    ('small-business', 'Small Businesses', 'Small Businesses', 'Building2', 130, TRUE, '/web-design-for-small-business-uk', TRUE)
ON CONFLICT (id) DO NOTHING;
