import { query } from './db';

export const LEAD_STATUSES = [
    'new',
    'contacted',
    'callback',
    'interested',
    'not_interested',
    'converted'
] as const;

export const CALL_OUTCOMES = [
    'no_answer',
    'reached',
    'callback',
    'interested',
    'not_interested'
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export function sanitizeUuid(val?: any): string | null {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(trimmed) ? trimmed : null;
}

let crmTablesInitialized = false;
export async function ensureCrmTables() {
    if (crmTablesInitialized) return;
    try {
        await query(`
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
            CREATE INDEX IF NOT EXISTS idx_sales_leads_phone ON sales_leads(phone);

            CREATE TABLE IF NOT EXISTS sales_call_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                lead_id UUID NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
                agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                outcome TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

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
            ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS created_by_role TEXT DEFAULT 'admin';
            ALTER TABLE lead_tasks ADD COLUMN IF NOT EXISTS created_by_name TEXT DEFAULT 'Admin';
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
        `);
        crmTablesInitialized = true;
    } catch (err) {
        console.warn('ensureCrmTables warning:', err);
    }
}

function mapLead(row: any) {
    return {
        id: row.id,
        name: row.name || '',
        businessName: row.name || '',
        phone: row.phone || '',
        email: row.email || '',
        notes: row.notes || '',
        status: row.status,
        source: row.source || '',
        assignedTo: row.assigned_to,
        nextFollowUpAt: row.next_follow_up_at || null,
        createdByAdmin: Boolean(row.created_by_admin),
        industry: row.industry || '',
        address: row.address || '',
        website: row.website || '',
        gbpObservation: row.gbp_observation || '',
        aiVisibilityObservation: row.ai_visibility_observation || '',
        leadOpportunity: row.lead_opportunity || '',
        opportunityLevel: row.opportunity_level || 'medium',
        isCustomer: Boolean(row.is_customer),
        convertedAt: row.converted_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapCall(row: any) {
    return {
        id: row.id,
        leadId: row.lead_id,
        agentId: row.agent_id,
        outcome: row.outcome,
        notes: row.notes || '',
        createdAt: row.created_at
    };
}

export async function listAssignedLeads(
    agentId: string,
    opts: {
        status?: string;
        followUpToday?: boolean;
        industry?: string;
        opportunityLevel?: string;
        isCustomer?: boolean;
        q?: string;
    } = {}
) {
    const params: any[] = [agentId];
    const where = ['(assigned_to = $1 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $1))'];

    if (opts.isCustomer !== undefined) {
        params.push(Boolean(opts.isCustomer));
        where.push(`is_customer = $${params.length}`);
    } else {
        where.push(`is_customer = FALSE`);
    }

    if (opts.status && LEAD_STATUSES.includes(opts.status as LeadStatus)) {
        params.push(opts.status);
        where.push(`status = $${params.length}`);
    }

    if (opts.industry && opts.industry !== 'all') {
        params.push(opts.industry.toLowerCase());
        where.push(`LOWER(industry) = $${params.length}`);
    }

    if (opts.opportunityLevel && opts.opportunityLevel !== 'all') {
        params.push(opts.opportunityLevel.toLowerCase());
        where.push(`LOWER(opportunity_level) = $${params.length}`);
    }

    if (opts.q) {
        params.push(`%${opts.q.toLowerCase()}%`);
        const p = `$${params.length}`;
        where.push(`(
            LOWER(name) LIKE ${p}
            OR LOWER(phone) LIKE ${p}
            OR LOWER(email) LIKE ${p}
            OR LOWER(address) LIKE ${p}
            OR LOWER(website) LIKE ${p}
        )`);
    }

    if (opts.followUpToday) {
        where.push(`next_follow_up_at IS NOT NULL AND next_follow_up_at::date <= CURRENT_DATE`);
    }

    const { rows } = await query(
        `SELECT * FROM sales_leads
         WHERE ${where.join(' AND ')}
         ORDER BY
           CASE WHEN next_follow_up_at IS NOT NULL AND next_follow_up_at::date <= CURRENT_DATE THEN 0 ELSE 1 END,
           next_follow_up_at ASC NULLS LAST,
           created_at DESC`,
        params
    );
    return rows.map(mapLead);
}

export async function getAssignedLead(leadId: string, agentId: string) {
    const { rows } = await query(
        `SELECT * FROM sales_leads WHERE id = $1 AND (assigned_to = $2 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $2)) LIMIT 1`,
        [leadId, agentId]
    );
    if (!rows[0]) return null;

    const { rows: calls } = await query(
        `SELECT * FROM sales_call_logs WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [leadId]
    );

    return {
        lead: mapLead(rows[0]),
        calls: calls.map(mapCall)
    };
}

export async function logCall({
    leadId,
    agentId,
    outcome,
    notes,
    status,
    nextFollowUpAt
}: {
    leadId: string;
    agentId: string;
    outcome: CallOutcome;
    notes?: string;
    status?: LeadStatus | null;
    nextFollowUpAt?: string | null;
}) {
    const owned = await query(
        `SELECT id FROM sales_leads WHERE id = $1 AND (assigned_to = $2 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $2)) LIMIT 1`,
        [leadId, agentId]
    );
    if (!owned.rows[0]) {
        throw Object.assign(new Error('Lead not found'), { status: 404 });
    }

    const { rows: callRows } = await query(
        `INSERT INTO sales_call_logs (lead_id, agent_id, outcome, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [leadId, agentId, outcome, String(notes || '').trim()]
    );

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [leadId, agentId];

    if (status && LEAD_STATUSES.includes(status)) {
        params.push(status);
        sets.push(`status = $${params.length}`);
    } else if (outcome === 'callback') {
        params.push('callback');
        sets.push(`status = $${params.length}`);
    } else if (outcome === 'interested') {
        params.push('interested');
        sets.push(`status = $${params.length}`);
    } else if (outcome === 'not_interested') {
        params.push('not_interested');
        sets.push(`status = $${params.length}`);
    } else if (outcome === 'reached' || outcome === 'no_answer') {
        params.push('contacted');
        sets.push(`status = $${params.length}`);
    }

    if (nextFollowUpAt !== undefined) {
        params.push(nextFollowUpAt || null);
        sets.push(`next_follow_up_at = $${params.length}`);
    }

    const { rows: leadRows } = await query(
        `UPDATE sales_leads SET ${sets.join(', ')}
         WHERE id = $1 AND (assigned_to = $2 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $2))
         RETURNING *`,
        params
    );

    return {
        call: mapCall(callRows[0]),
        lead: mapLead(leadRows[0])
    };
}

export async function updateAssignedLead(
    leadId: string,
    agentId: string,
    patch: { status?: string; notes?: string; nextFollowUpAt?: string | null }
) {
    const owned = await query(
        `SELECT * FROM sales_leads WHERE id = $1 AND (assigned_to = $2 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $2)) LIMIT 1`,
        [leadId, agentId]
    );
    if (!owned.rows[0]) {
        throw Object.assign(new Error('Lead not found'), { status: 404 });
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [leadId, agentId];

    if (patch.status != null) {
        if (!LEAD_STATUSES.includes(patch.status as LeadStatus)) {
            throw Object.assign(new Error('Invalid status'), { status: 400 });
        }
        params.push(patch.status);
        sets.push(`status = $${params.length}`);
    }

    if (patch.notes != null) {
        params.push(String(patch.notes));
        sets.push(`notes = $${params.length}`);
    }

    if (patch.nextFollowUpAt !== undefined) {
        params.push(patch.nextFollowUpAt || null);
        sets.push(`next_follow_up_at = $${params.length}`);
    }

    const { rows } = await query(
        `UPDATE sales_leads SET ${sets.join(', ')}
         WHERE id = $1 AND (assigned_to = $2 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $2))
         RETURNING *`,
        params
    );
    return mapLead(rows[0]);
}

export async function createSalesLead(data: {
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
    status?: string;
    source?: string;
    industry?: string;
    address?: string;
    website?: string;
    gbpObservation?: string;
    aiVisibilityObservation?: string;
    leadOpportunity?: string;
    opportunityLevel?: string;
    assignedTo?: string | null;
    nextFollowUpAt?: string | null;
    createdByAdmin?: boolean;
}) {
    await ensureCrmTables();
    const oppLevel = ['high', 'medium', 'low'].includes(String(data.opportunityLevel || '').toLowerCase())
        ? String(data.opportunityLevel).toLowerCase()
        : 'medium';

    const status = LEAD_STATUSES.includes(data.status as LeadStatus) ? data.status : 'new';
    const assignedTo = sanitizeUuid(data.assignedTo);

    const { rows } = await query(
        `INSERT INTO sales_leads (
            name, phone, email, notes, status, source, industry, address, website,
            gbp_observation, ai_visibility_observation, lead_opportunity, opportunity_level,
            assigned_to, next_follow_up_at, created_by_admin
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
            String(data.name || 'New Lead').trim(),
            String(data.phone || '').trim(),
            String(data.email || '').trim().toLowerCase(),
            String(data.notes || '').trim(),
            status,
            String(data.source || 'manual_entry').trim(),
            String(data.industry || '').trim(),
            String(data.address || '').trim(),
            String(data.website || '').trim(),
            String(data.gbpObservation || '').trim(),
            String(data.aiVisibilityObservation || '').trim(),
            String(data.leadOpportunity || '').trim(),
            oppLevel,
            assignedTo,
            data.nextFollowUpAt || null,
            data.createdByAdmin ?? true
        ]
    );

    return mapLead(rows[0]);
}

export async function bulkImportSalesLeads(
    leads: Array<{
        name: string;
        phone?: string;
        email?: string;
        notes?: string;
        status?: string;
        source?: string;
        industry?: string;
        address?: string;
        website?: string;
        gbpObservation?: string;
        aiVisibilityObservation?: string;
        leadOpportunity?: string;
        opportunityLevel?: string;
        assignedTo?: string | null;
        nextFollowUpAt?: string | null;
    }>,
    createdByAdmin = true
) {
    await ensureCrmTables();
    if (!Array.isArray(leads) || leads.length === 0) {
        return { count: 0, created: 0, skipped: 0, leads: [] };
    }

    let created = 0;
    let skipped = 0;
    const createdLeads: any[] = [];

    for (const item of leads) {
        const name = String(item.name || '').trim();
        const phone = String(item.phone || '').trim();
        const email = String(item.email || '').trim().toLowerCase();

        if (!name && !phone && !email) {
            skipped++;
            continue;
        }

        // Deduplication & Upsert check: check if phone (if exists) or name exists
        let existingId: string | null = null;
        if (phone) {
            const existing = await query(
                `SELECT id FROM sales_leads WHERE phone = $1 LIMIT 1`,
                [phone]
            );
            if (existing.rows.length > 0) {
                existingId = existing.rows[0].id;
            }
        } else if (name) {
            const existing = await query(
                `SELECT id FROM sales_leads WHERE LOWER(name) = LOWER($1) LIMIT 1`,
                [name]
            );
            if (existing.rows.length > 0) {
                existingId = existing.rows[0].id;
            }
        }

        if (existingId) {
            // Update existing lead observations & notes if provided in the spreadsheet
            const updates: string[] = ['updated_at = NOW()'];
            const params: any[] = [existingId];

            if (item.notes && String(item.notes).trim()) {
                params.push(String(item.notes).trim());
                updates.push(`notes = $${params.length}`);
            }
            if (item.gbpObservation && String(item.gbpObservation).trim()) {
                params.push(String(item.gbpObservation).trim());
                updates.push(`gbp_observation = $${params.length}`);
            }
            if (item.aiVisibilityObservation && String(item.aiVisibilityObservation).trim()) {
                params.push(String(item.aiVisibilityObservation).trim());
                updates.push(`ai_visibility_observation = $${params.length}`);
            }
            if (item.leadOpportunity && String(item.leadOpportunity).trim()) {
                params.push(String(item.leadOpportunity).trim());
                updates.push(`lead_opportunity = $${params.length}`);
            }
            if (item.address && String(item.address).trim()) {
                params.push(String(item.address).trim());
                updates.push(`address = COALESCE(NULLIF(address, ''), $${params.length})`);
            }
            if (item.website && String(item.website).trim()) {
                params.push(String(item.website).trim());
                updates.push(`website = COALESCE(NULLIF(website, ''), $${params.length})`);
            }
            if (item.industry && String(item.industry).trim()) {
                params.push(String(item.industry).trim());
                updates.push(`industry = COALESCE(NULLIF(industry, ''), $${params.length})`);
            }

            if (updates.length > 1) {
                const { rows: updatedRows } = await query(
                    `UPDATE sales_leads SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
                    params
                );
                if (updatedRows[0]) {
                    createdLeads.push(mapLead(updatedRows[0]));
                }
            }
            skipped++;
            continue;
        }

        let oppLevel = 'medium';
        const rawOpp = String(item.leadOpportunity || item.opportunityLevel || '').toLowerCase();
        if (rawOpp.includes('high')) oppLevel = 'high';
        else if (rawOpp.includes('low')) oppLevel = 'low';

        const lead = await createSalesLead({
            name: name || 'Lead',
            phone,
            email,
            notes: item.notes || '',
            status: item.status || 'new',
            source: item.source || 'excel_import',
            industry: item.industry || '',
            address: item.address || '',
            website: item.website || '',
            gbpObservation: item.gbpObservation || '',
            aiVisibilityObservation: item.aiVisibilityObservation || '',
            leadOpportunity: item.leadOpportunity || '',
            opportunityLevel: oppLevel,
            assignedTo: sanitizeUuid(item.assignedTo),
            nextFollowUpAt: item.nextFollowUpAt || null,
            createdByAdmin
        });

        createdLeads.push(lead);
        created++;
    }

    return {
        count: leads.length,
        created,
        skipped,
        leads: createdLeads
    };
}

export async function convertLeadToCustomer(leadId: string, agentId?: string) {
    const sets = [
        'is_customer = TRUE',
        'status = $1',
        'converted_at = NOW()',
        'updated_at = NOW()'
    ];
    const params: any[] = ['converted', leadId];

    let where = 'id = $2';
    if (agentId) {
        params.push(agentId);
        where += ' AND (assigned_to = $3 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $3))';
    }

    const { rows } = await query(
        `UPDATE sales_leads SET ${sets.join(', ')} WHERE ${where} RETURNING *`,
        params
    );

    if (!rows.length) {
        throw Object.assign(new Error('Lead not found or conversion unauthorized'), { status: 404 });
    }

    return mapLead(rows[0]);
}

