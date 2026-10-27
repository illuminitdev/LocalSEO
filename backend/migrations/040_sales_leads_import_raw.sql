-- 040_sales_leads_import_raw.sql
-- Admin Excel export: keep the uploaded row (original columns, in order) and its sheet name per lead.
-- JSON (not JSONB) so the column order of the uploaded sheet is kept.

ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_raw JSON NULL;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_sheet_name TEXT NOT NULL DEFAULT '';
