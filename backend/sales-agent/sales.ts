import { randomUUID } from 'crypto';
import { query } from '../lib/db';

export const LEAD_STATUSES = [
    'new',
    'contacted',
    'in_progress',
    'callback',
    'interested',
    'not_interested',
    'converted',
    'completed',
    'pending'
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
                status TEXT NOT NULL DEFAULT 'new',
                source TEXT NOT NULL DEFAULT '',
                assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
                next_follow_up_at TIMESTAMPTZ,
                created_by_admin BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
            ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_status_check CHECK (
                status IN ('new', 'contacted', 'in_progress', 'callback', 'interested', 'not_interested', 'converted', 'completed', 'pending')
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
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_batch_id UUID NULL;
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_file_name TEXT NOT NULL DEFAULT '';
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS import_uploaded_at TIMESTAMPTZ NULL;
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status TEXT NOT NULL DEFAULT '';
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status_1 TEXT NOT NULL DEFAULT '';
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status_2 TEXT NOT NULL DEFAULT '';
            ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS spreadsheet_status_3 TEXT NOT NULL DEFAULT '';

            CREATE INDEX IF NOT EXISTS idx_sales_leads_industry ON sales_leads(industry);
            CREATE INDEX IF NOT EXISTS idx_sales_leads_is_customer ON sales_leads(is_customer);
            CREATE INDEX IF NOT EXISTS idx_sales_leads_opportunity ON sales_leads(opportunity_level);
            CREATE INDEX IF NOT EXISTS idx_sales_leads_phone ON sales_leads(phone);
            CREATE INDEX IF NOT EXISTS idx_sales_leads_import_batch_id ON sales_leads(import_batch_id);

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
                disposition TEXT,
                note TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE lead_tasks DROP CONSTRAINT IF EXISTS lead_tasks_task_type_check;
            ALTER TABLE lead_tasks ADD CONSTRAINT lead_tasks_task_type_check CHECK (task_type IN (
                'prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom',
                'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'
            ));
            ALTER TABLE lead_activities DROP CONSTRAINT IF EXISTS lead_activities_disposition_check;
            CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
            CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);

            CREATE TABLE IF NOT EXISTS audit_email_sends (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token TEXT NOT NULL UNIQUE,
                audit_id TEXT NOT NULL,
                to_email TEXT NOT NULL,
                sent_by_user_id UUID,
                sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                opened_at TIMESTAMPTZ,
                open_count INT NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_audit_email_sends_audit ON audit_email_sends(audit_id, sent_at DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_email_sends_token ON audit_email_sends(token);
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
        importBatchId: row.import_batch_id || null,
        importFileName: row.import_file_name || '',
        importUploadedAt: row.import_uploaded_at || null,
        spreadsheetStatus: row.spreadsheet_status || '',
        spreadsheetStatus1: row.spreadsheet_status_1 || '',
        spreadsheetStatus2: row.spreadsheet_status_2 || '',
        spreadsheetStatus3: row.spreadsheet_status_3 || '',
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

export async function resolveAllLeadIds(leadId: string): Promise<string[]> {
    if (!leadId) return [];
    try {
        // Step 1: Find lead info from sales_leads, submissions, and lead_tasks
        const [salesRes, subRes, taskRes] = await Promise.all([
            query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = $1`, [leadId]).catch(() => ({ rows: [] })),
            query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email, payload->>'phone' AS phone FROM submissions WHERE id::text = $1`, [leadId]).catch(() => ({ rows: [] })),
            query(`SELECT id, lead_id FROM lead_tasks WHERE id::text = $1 OR lead_id = $1`, [leadId]).catch(() => ({ rows: [] }))
        ]);

        const idSet = new Set<string>([leadId]);
        for (const t of taskRes.rows) {
            if (t.lead_id) idSet.add(String(t.lead_id));
        }

        // If we found a task linked to another lead_id, also lookup that lead
        let extraName = '';
        let extraEmail = '';
        let extraPhone = '';
        if (taskRes.rows.length > 0 && taskRes.rows[0].lead_id && taskRes.rows[0].lead_id !== leadId) {
            const [extraSales, extraSub] = await Promise.all([
                query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = $1`, [taskRes.rows[0].lead_id]).catch(() => ({ rows: [] })),
                query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email, payload->>'phone' AS phone FROM submissions WHERE id::text = $1`, [taskRes.rows[0].lead_id]).catch(() => ({ rows: [] }))
            ]);
            extraName = (extraSales.rows[0]?.name || extraSub.rows[0]?.bname || extraSub.rows[0]?.name || '').trim().toLowerCase();
            extraEmail = (extraSales.rows[0]?.email || extraSub.rows[0]?.email || '').trim().toLowerCase();
            extraPhone = (extraSales.rows[0]?.phone || extraSub.rows[0]?.phone || '').replace(/[^0-9]/g, '');
        }

        const leadName = (salesRes.rows[0]?.name || subRes.rows[0]?.bname || subRes.rows[0]?.name || extraName || '').trim().toLowerCase();
        const leadEmail = (salesRes.rows[0]?.email || subRes.rows[0]?.email || extraEmail || '').trim().toLowerCase();
        const rawPhone = (salesRes.rows[0]?.phone || subRes.rows[0]?.phone || extraPhone || '').replace(/[^0-9]/g, '');

        // Step 2: Gather all matching IDs from sales_leads, submissions, and lead_tasks
        const matches = await query(`
            SELECT DISTINCT id::text AS id FROM sales_leads 
            WHERE id::text = $1
               OR (NULLIF($2, '') IS NOT NULL AND LOWER(TRIM(email)) = $2)
               OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(name)) = $3)
               OR (NULLIF($4, '') IS NOT NULL AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $4 AND length($4) >= 7)
            UNION
            SELECT DISTINCT id::text AS id FROM submissions
            WHERE id::text = $1
               OR (NULLIF($2, '') IS NOT NULL AND LOWER(TRIM(COALESCE(email, payload->>'email', ''))) = $2)
               OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(COALESCE(payload->>'businessName', payload->>'name', ''))) = $3)
               OR (NULLIF($4, '') IS NOT NULL AND REGEXP_REPLACE(COALESCE(payload->>'phone', ''), '[^0-9]', '', 'g') = $4 AND length($4) >= 7)
            UNION
            SELECT DISTINCT lead_id::text AS id FROM lead_tasks
            WHERE lead_id = $1 OR id::text = $1
        `, [leadId, leadEmail || null, leadName || null, rawPhone || null]);

        for (const row of matches.rows) {
            if (row.id) idSet.add(String(row.id));
        }

        return Array.from(idSet);
    } catch (err) {
        console.warn('resolveAllLeadIds error:', err);
        return [leadId];
    }
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

    let agentName = 'Sales Agent';
    try {
        const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1`, [agentId]);
        if (uRows[0]?.name) agentName = uRows[0].name;
    } catch {}

    const { rows: callRows } = await query(
        `INSERT INTO sales_call_logs (lead_id, agent_id, outcome, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [leadId, agentId, outcome, String(notes || '').trim()]
    );

    try {
        await query(
            `INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note, created_at)
             VALUES ($1, $2, $3, 'call_log', $4, $5, NOW())`,
            [leadId, agentId, agentName, outcome, String(notes || '').trim() || null]
        );
    } catch (actErr) {
        console.warn('Could not record call activity:', actErr);
    }

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

    let agentName = 'Sales Agent';
    try {
        const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1`, [agentId]);
        if (uRows[0]?.name) agentName = uRows[0].name;
    } catch {}

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

    if (patch.status != null || patch.notes != null) {
        try {
            await query(
                `INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note, created_at)
                 VALUES ($1, $2, $3, 'status_change', $4, $5, NOW())`,
                [
                    leadId,
                    agentId,
                    agentName,
                    patch.status || owned.rows[0].status || 'status_change',
                    patch.notes ? String(patch.notes).trim() : null
                ]
            );
        } catch (actErr) {
            console.warn('Could not record status activity for assigned lead:', actErr);
        }
    }

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
    importBatchId?: string | null;
    importFileName?: string;
    importUploadedAt?: string | Date | null;
    spreadsheetStatus?: string;
    spreadsheetStatus1?: string;
    spreadsheetStatus2?: string;
    spreadsheetStatus3?: string;
}) {
    await ensureCrmTables();
    const oppLevel = ['high', 'medium', 'low'].includes(String(data.opportunityLevel || '').toLowerCase())
        ? String(data.opportunityLevel).toLowerCase()
        : 'medium';

    const status = LEAD_STATUSES.includes(data.status as LeadStatus) ? data.status : 'new';
    const assignedTo = sanitizeUuid(data.assignedTo);
    const importBatchId = sanitizeUuid(data.importBatchId);
    const status1 = String(data.spreadsheetStatus1 || '').trim();
    const status2 = String(data.spreadsheetStatus2 || '').trim();
    const status3 = String(data.spreadsheetStatus3 || '').trim();
    const statusParts = [status1, status2, status3].filter(
        (s, i, arr) => s && arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i
    );
    const spreadsheetStatus = String(data.spreadsheetStatus || '').trim() || statusParts.join(' · ');

    const isCustomer = status === 'converted';
    const convertedAt = isCustomer ? new Date() : null;

    const { rows } = await query(
        `INSERT INTO sales_leads (
            name, phone, email, notes, status, source, industry, address, website,
            gbp_observation, ai_visibility_observation, lead_opportunity, opportunity_level,
            assigned_to, next_follow_up_at, created_by_admin, is_customer, converted_at,
            import_batch_id, import_file_name, import_uploaded_at,
            spreadsheet_status, spreadsheet_status_1, spreadsheet_status_2, spreadsheet_status_3
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
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
            data.createdByAdmin ?? true,
            isCustomer,
            convertedAt,
            importBatchId,
            String(data.importFileName || '').trim(),
            data.importUploadedAt || null,
            spreadsheetStatus,
            status1,
            status2,
            status3
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
        spreadsheetStatus?: string;
        spreadsheetStatus1?: string;
        spreadsheetStatus2?: string;
        spreadsheetStatus3?: string;
    }>,
    createdByAdmin = true,
    opts?: {
        fileName?: string;
        importBatchId?: string | null;
        importUploadedAt?: string | Date | null;
    }
) {
    await ensureCrmTables();
    if (!Array.isArray(leads) || leads.length === 0) {
        return { count: 0, created: 0, skipped: 0, leads: [], importBatchId: null as string | null };
    }

    const importBatchId = sanitizeUuid(opts?.importBatchId) || randomUUID();
    const importFileName = String(opts?.fileName || '').trim();
    const importUploadedAt = opts?.importUploadedAt || new Date();

    let created = 0;
    let skipped = 0;
    const createdLeads: any[] = [];

   
    const batchSeenName = new Set<string>();
    const batchSeenEmail = new Set<string>();
    const batchSeenPhone = new Set<string>();
    const batchSeenWebsite = new Set<string>();

    const normalizeWebsiteKey = (value: string) =>
        String(value || '')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '');

    for (const item of leads) {
        const name = String(item.name || '').trim();
        const phone = String(item.phone || '').trim();
        const email = String(item.email || '').trim().toLowerCase();
        const website = String(item.website || '').trim();
        const nameKey = name && name.toLowerCase() !== 'lead' ? name.toLowerCase() : '';
        const rawPhoneDigits = phone.replace(/[^0-9]/g, '');
        const phoneKey = rawPhoneDigits.length >= 7 ? rawPhoneDigits : '';
        const websiteKey = normalizeWebsiteKey(website);

        if (!name && !phone && !email && !website) {
            skipped++;
            continue;
        }

        
        const batchDup =
            (nameKey && batchSeenName.has(nameKey)) ||
            (email && batchSeenEmail.has(email)) ||
            (phoneKey && batchSeenPhone.has(phoneKey)) ||
            (websiteKey && batchSeenWebsite.has(websiteKey));

        if (batchDup) {
            skipped++;
            continue;
        }

        
        let existingId: string | null = null;

        if (phone) {
            const existing = await query(
                `SELECT id FROM sales_leads WHERE phone = $1 OR (length($2) >= 7 AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $2) LIMIT 1`,
                [phone, rawPhoneDigits]
            );
            if (existing.rows.length > 0) {
                existingId = existing.rows[0].id;
            }
        }
        if (!existingId && email) {
            const existing = await query(
                `SELECT id FROM sales_leads WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
                [email]
            );
            if (existing.rows.length > 0) {
                existingId = existing.rows[0].id;
            }
        }
        if (!existingId && nameKey) {
            const existing = await query(
                `SELECT id FROM sales_leads WHERE LOWER(TRIM(name)) = $1 LIMIT 1`,
                [nameKey]
            );
            if (existing.rows.length > 0) {
                existingId = existing.rows[0].id;
            }
        }
        if (!existingId && websiteKey) {
            const existing = await query(
                `SELECT id FROM sales_leads
                 WHERE NULLIF(TRIM(website), '') IS NOT NULL
                   AND LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(website), '^https?://', '', 'i'), '^www\\.', '', 'i'), '/+$', '')) = $1
                 LIMIT 1`,
                [websiteKey]
            );
            if (existing.rows.length > 0) {
                existingId = existing.rows[0].id;
            }
        }

        if (existingId) {
            if (nameKey) batchSeenName.add(nameKey);
            if (email) batchSeenEmail.add(email);
            if (phoneKey) batchSeenPhone.add(phoneKey);
            if (websiteKey) batchSeenWebsite.add(websiteKey);
            // Update existing lead observations, notes & status if provided in the spreadsheet
            const updates: string[] = ['updated_at = NOW()'];
            const params: any[] = [existingId];

            if (item.status && LEAD_STATUSES.includes(item.status as LeadStatus)) {
                params.push(item.status);
                updates.push(`status = $${params.length}`);
                if (item.status === 'converted') {
                    updates.push(`is_customer = TRUE, converted_at = NOW()`);
                }
            }

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
            if (item.spreadsheetStatus && String(item.spreadsheetStatus).trim()) {
                params.push(String(item.spreadsheetStatus).trim());
                updates.push(`spreadsheet_status = $${params.length}`);
            }
            if (item.spreadsheetStatus1 && String(item.spreadsheetStatus1).trim()) {
                params.push(String(item.spreadsheetStatus1).trim());
                updates.push(`spreadsheet_status_1 = $${params.length}`);
            }
            if (item.spreadsheetStatus2 && String(item.spreadsheetStatus2).trim()) {
                params.push(String(item.spreadsheetStatus2).trim());
                updates.push(`spreadsheet_status_2 = $${params.length}`);
            }
            if (item.spreadsheetStatus3 && String(item.spreadsheetStatus3).trim()) {
                params.push(String(item.spreadsheetStatus3).trim());
                updates.push(`spreadsheet_status_3 = $${params.length}`);
            }

            // Move lead into this upload batch for filter / assign / delete by Excel
            if (importBatchId) {
                params.push(importBatchId);
                updates.push(`import_batch_id = $${params.length}`);
                params.push(importFileName);
                updates.push(`import_file_name = $${params.length}`);
                params.push(importUploadedAt);
                updates.push(`import_uploaded_at = $${params.length}`);
                if (!(item.source && String(item.source).trim())) {
                    updates.push(`source = COALESCE(NULLIF(source, ''), 'excel_import')`);
                }
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

            
            if (item.status || (item.notes && String(item.notes).trim())) {
                try {
                    const cleanNote = item.notes && String(item.notes).trim()
                        ? String(item.notes).trim()
                        : (item.status ? `Status updated from Excel as ${item.status}` : 'Updated from Excel import');
                    await query(`
                        INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note)
                        VALUES ($1, 'Excel Import', 'status_change', $2, $3)
                    `, [existingId, item.status || 'updated', cleanNote]);
                } catch {}
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
            createdByAdmin,
            importBatchId,
            importFileName,
            importUploadedAt,
            spreadsheetStatus: item.spreadsheetStatus || '',
            spreadsheetStatus1: item.spreadsheetStatus1 || '',
            spreadsheetStatus2: item.spreadsheetStatus2 || '',
            spreadsheetStatus3: item.spreadsheetStatus3 || ''
        });

        createdLeads.push(lead);
        created++;

        if (nameKey) batchSeenName.add(nameKey);
        if (email) batchSeenEmail.add(email);
        if (phoneKey) batchSeenPhone.add(phoneKey);
        if (websiteKey) batchSeenWebsite.add(websiteKey);

        
        try {
            const initialCleanNote = item.notes && String(item.notes).trim()
                ? String(item.notes).trim()
                : `Lead imported from Excel with status ${item.status || 'new'}`;
            await query(`
                INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note)
                VALUES ($1, 'Excel Import', 'status_change', $2, $3)
            `, [String(lead.id), item.status || 'new', initialCleanNote]);
        } catch {}
    }

    return {
        count: leads.length,
        created,
        skipped,
        leads: createdLeads,
        importBatchId
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

