-- 024_lead_tasks_created_by.sql
-- Differentiate admin-assigned tasks from self-created reminders in sales portal

ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS created_by_role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS created_by_name TEXT NOT NULL DEFAULT 'Admin';

CREATE INDEX IF NOT EXISTS idx_lead_tasks_created_by_role ON lead_tasks(created_by_role);
