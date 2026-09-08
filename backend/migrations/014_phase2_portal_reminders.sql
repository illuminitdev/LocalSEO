-- Phase 2: Client portal magic links + email reminder automation

CREATE TABLE IF NOT EXISTS client_portal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_client ON client_portal_tokens (client_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_org ON client_portal_tokens (org_id);

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS reminder_visit_hours INT NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS reminder_invoice_days INT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS reminder_post_job_hours INT NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    trigger_event TEXT NOT NULL
        CHECK (trigger_event IN (
            'visit_reminder',
            'request_received',
            'post_job_followup',
            'invoice_unpaid',
            'portal_link'
        )),
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
    subject TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, trigger_event, channel)
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    trigger_event TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    send_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    sent_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
    ON scheduled_messages (status, send_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_booking
    ON scheduled_messages (booking_id);
