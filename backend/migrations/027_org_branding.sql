-- Per-organization white-label branding for public booking / portal / site

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS brand_primary TEXT NOT NULL DEFAULT '#F59E0B',
    ADD COLUMN IF NOT EXISTS brand_secondary TEXT NOT NULL DEFAULT '#0F172A';
