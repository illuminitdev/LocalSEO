-- 032_sales_leads_excel_import_fields.sql
-- Excel upload batches (filter / assign / delete by file) + raw Status 1 / Status 2 text

ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_batch_id UUID NULL;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_uploaded_at TIMESTAMPTZ NULL;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status_1 TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status_2 TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sales_leads_import_batch_id ON sales_leads(import_batch_id);
