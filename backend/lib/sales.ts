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

function mapLead(row: any) {
    return {
        id: row.id,
        name: row.name || '',
        phone: row.phone || '',
        email: row.email || '',
        notes: row.notes || '',
        status: row.status,
        source: row.source || '',
        assignedTo: row.assigned_to,
        nextFollowUpAt: row.next_follow_up_at || null,
        createdByAdmin: Boolean(row.created_by_admin),
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
    opts: { status?: string; followUpToday?: boolean } = {}
) {
    const params: any[] = [agentId];
    const where = ['assigned_to = $1'];

    if (opts.status && LEAD_STATUSES.includes(opts.status as LeadStatus)) {
        params.push(opts.status);
        where.push(`status = $${params.length}`);
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
           updated_at DESC`,
        params
    );
    return rows.map(mapLead);
}

export async function getAssignedLead(leadId: string, agentId: string) {
    const { rows } = await query(
        `SELECT * FROM sales_leads WHERE id = $1 AND assigned_to = $2 LIMIT 1`,
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
        `SELECT id FROM sales_leads WHERE id = $1 AND assigned_to = $2 LIMIT 1`,
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
         WHERE id = $1 AND assigned_to = $2
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
        `SELECT * FROM sales_leads WHERE id = $1 AND assigned_to = $2 LIMIT 1`,
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
         WHERE id = $1 AND assigned_to = $2
         RETURNING *`,
        params
    );
    return mapLead(rows[0]);
}
