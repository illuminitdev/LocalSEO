-- Per-org portal state (business profile + dashboard metrics) — shared across Lambda instances
CREATE TABLE IF NOT EXISTS org_app_state (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    dashboard JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_app_state_updated ON org_app_state (updated_at DESC);
