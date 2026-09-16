-- 027_lead_crm_excel_fields.sql
-- Add fields for Excel bulk import, observation analysis, and customer conversion

ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS gbp_observation TEXT DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS ai_visibility_observation TEXT DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS lead_opportunity TEXT DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS opportunity_level TEXT DEFAULT 'medium';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS is_customer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sales_leads_industry ON sales_leads(industry);
CREATE INDEX IF NOT EXISTS idx_sales_leads_is_customer ON sales_leads(is_customer);
CREATE INDEX IF NOT EXISTS idx_sales_leads_opportunity ON sales_leads(opportunity_level);
