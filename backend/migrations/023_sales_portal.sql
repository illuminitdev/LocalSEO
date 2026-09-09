-- Sales / telecaller portal: assigned leads + call logs

CREATE TABLE IF NOT EXISTS sales_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'contacted', 'callback', 'interested', 'not_interested', 'converted')),
    source TEXT NOT NULL DEFAULT '',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    next_follow_up_at TIMESTAMPTZ,
    created_by_admin BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_assigned
    ON sales_leads (assigned_to, status, next_follow_up_at NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_sales_leads_created
    ON sales_leads (created_at DESC);

CREATE TABLE IF NOT EXISTS sales_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL
        CHECK (outcome IN ('no_answer', 'reached', 'callback', 'interested', 'not_interested')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_call_logs_lead
    ON sales_call_logs (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_call_logs_agent
    ON sales_call_logs (agent_id, created_at DESC);
