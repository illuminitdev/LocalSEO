-- 037_sales_leads_gbp_enrich.sql
-- Admin Excel upload: GBP URL per lead + auto-enrichment (6 GBP checks -> observations + priority)

ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS gbp_url TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS enrich_status TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS enrich_error TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS enrich_checks JSONB NULL;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_enrich_status ON sales_leads(enrich_status) WHERE enrich_status <> '';
