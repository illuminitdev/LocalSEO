-- One row per Local Search Grid scan started in a billing period. Written when the scan STARTS (before any
-- DataForSEO call), so a refresh, a second tab or a double click cannot start the same keyword+address twice.
-- The count of rows per org and period is the monthly grid scan limit.
CREATE TABLE IF NOT EXISTS grid_scan_slots (
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES org_locations(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    scan_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, location_id, keyword, period_start)
);

CREATE INDEX IF NOT EXISTS idx_grid_scan_slots_period
    ON grid_scan_slots (org_id, period_start);
CREATE INDEX IF NOT EXISTS idx_grid_scan_slots_scan
    ON grid_scan_slots (org_id, scan_id);
