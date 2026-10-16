-- Usage credits (monthly pool per org), locked business locations, and rank history tables.

-- One row per org: the credit pool for the current billing period.
CREATE TABLE IF NOT EXISTS org_credits (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL DEFAULT '',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    allowance INT NOT NULL DEFAULT 0,
    used INT NOT NULL DEFAULT 0 CHECK (used >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only record of every spend / refund (negative credits = refund).
CREATE TABLE IF NOT EXISTS usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    credits INT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_org_created
    ON usage_ledger (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_org_ref
    ON usage_ledger (org_id, ref);

-- Saved scan locations (the business address is the primary one).
CREATE TABLE IF NOT EXISTS org_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    place_id TEXT NOT NULL DEFAULT '',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_locations_org
    ON org_locations (org_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_locations_one_primary
    ON org_locations (org_id) WHERE is_primary;

-- One Google Maps rank check per keyword and location (Visibility Tracker).
CREATE TABLE IF NOT EXISTS rank_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES org_locations(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    rank INT NOT NULL,
    top3 JSONB NOT NULL DEFAULT '[]'::jsonb,
    source TEXT NOT NULL DEFAULT 'manual',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rank_checks_lookup
    ON rank_checks (org_id, location_id, keyword, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_rank_checks_checked_at
    ON rank_checks (checked_at);

-- One Local Search Grid scan. `grid` is cleared after 90 days; the summary numbers stay for 12 months.
CREATE TABLE IF NOT EXISTS grid_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES org_locations(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    grid_size INT NOT NULL DEFAULT 3,
    grid JSONB,
    avg_rank NUMERIC(5,1) NOT NULL DEFAULT 0,
    top3_pct INT NOT NULL DEFAULT 0,
    health INT NOT NULL DEFAULT 0,
    competitor_share JSONB NOT NULL DEFAULT '[]'::jsonb,
    competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
    center JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grid_scans_lookup
    ON grid_scans (org_id, location_id, keyword, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grid_scans_created_at
    ON grid_scans (created_at);
