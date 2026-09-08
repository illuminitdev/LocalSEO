-- Phase 3: Team invites + job assignment

CREATE TABLE IF NOT EXISTS org_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'tech'
        CHECK (role IN ('owner', 'admin', 'dispatcher', 'tech')),
    token TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org ON org_invites (org_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_pending_email
    ON org_invites (org_id, lower(email))
    WHERE status = 'pending';

ALTER TABLE memberships
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Normalize role check softly via app; ensure common roles exist as text
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS route_sort INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bookings_assigned ON bookings (org_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_route ON bookings (org_id, route_sort, start_at);
