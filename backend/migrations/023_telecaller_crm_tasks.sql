-- 023_telecaller_crm_tasks.sql
-- Lead tasks and activity logs for Telecaller / Admin CRM

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS lead_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id TEXT NOT NULL,
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    task_type TEXT NOT NULL DEFAULT 'follow_up_call' CHECK (task_type IN ('prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom')),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_id ON lead_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_assigned_to ON lead_tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_status ON lead_tasks(status);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_due_date ON lead_tasks(due_date);

CREATE TABLE IF NOT EXISTS lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT 'Admin',
    activity_type TEXT NOT NULL DEFAULT 'call_log' CHECK (activity_type IN ('call_log', 'status_change', 'task_event', 'note')),
    disposition TEXT CHECK (disposition IN ('connected', 'voicemail', 'callback_requested', 'not_interested', 'converted', 'other')),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
