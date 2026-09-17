-- 028_lead_tasks_task_type_check.sql
-- Relax and expand lead_tasks_task_type_check to support both standard CRM presets and shorthand task types

ALTER TABLE lead_tasks DROP CONSTRAINT IF EXISTS lead_tasks_task_type_check;
ALTER TABLE lead_tasks ADD CONSTRAINT lead_tasks_task_type_check CHECK (task_type IN (
    'prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom',
    'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'
));
