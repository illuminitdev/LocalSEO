-- Phase 4: Job expenses + time entries

CREATE TABLE IF NOT EXISTS job_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'materials',
    amount_cents INT NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_expenses_booking ON job_expenses (booking_id);
CREATE INDEX IF NOT EXISTS idx_job_expenses_org ON job_expenses (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    minutes INT NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_booking ON time_entries (booking_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_org ON time_entries (org_id, created_at DESC);
