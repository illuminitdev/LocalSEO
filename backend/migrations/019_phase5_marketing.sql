-- Phase 5: Marketing mini-site, campaigns, referrals

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS marketing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS site_headline TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS site_blurb TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS site_services TEXT NOT NULL DEFAULT '';

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS referral_code TEXT,
    ADD COLUMN IF NOT EXISTS referred_by_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referral_credit_cents INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_referral_code
    ON clients (org_id, referral_code)
    WHERE referral_code IS NOT NULL AND trim(referral_code) <> '';

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Campaign',
    subject TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    status_filter TEXT NOT NULL DEFAULT 'active',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
    sent_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'failed', 'skipped')),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends (campaign_id);
