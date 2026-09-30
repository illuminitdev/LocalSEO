-- Migration 034: Support follow_up status and assigned_to_role for lead tasks
ALTER TABLE sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_status_check CHECK (
    status IN ('new', 'contacted', 'in_progress', 'callback', 'follow_up', 'interested', 'not_interested', 'converted', 'completed', 'pending')
);

ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS assigned_to_role TEXT DEFAULT 'sales_agent';
