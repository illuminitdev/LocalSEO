-- Migration 029: Expand sales_leads status check constraint to support in_progress, completed, pending
ALTER TABLE sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_status_check CHECK (
    status IN ('new', 'contacted', 'in_progress', 'callback', 'interested', 'not_interested', 'converted', 'completed', 'pending')
);
