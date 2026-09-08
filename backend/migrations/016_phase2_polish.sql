-- Phase 2 polish: multi-property labels, avatars, SMS/inbox, media helpers

ALTER TABLE client_properties
    ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT 'Service address';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS default_hourly_cents INT NOT NULL DEFAULT 0;

-- Allow SMS on templates / scheduled messages (best-effort constraint refresh)
DO $$ BEGIN
    ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_channel_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE message_templates
        ADD CONSTRAINT message_templates_channel_check CHECK (channel IN ('email', 'sms'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE scheduled_messages
    ADD COLUMN IF NOT EXISTS to_phone TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS message_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    customer_phone TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_threads_org_phone
    ON message_threads (org_id, customer_phone)
    WHERE trim(customer_phone) <> '';

CREATE INDEX IF NOT EXISTS idx_message_threads_org ON message_threads (org_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    channel TEXT NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email')),
    body TEXT NOT NULL DEFAULT '',
    provider_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages (org_id, created_at DESC);
