import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAdmin, resolveAdminCredentials } from './adminAuth';
import { ensureCrmTables } from '../sales-agent/sales';
import {
    zappSitesOrigin,
    growthAuditTablesMissing,
    ADMIN_LEAD_TYPES,
    mapAdminLead,
    mapSalesLeadToAdminLead
} from './leadHelpers';

const router = Router();

/** Read-only list of marketing and CRM leads. */
router.get('/growth-audit-leads', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables().catch(() => {});
        const q = String(req.query.q || '').trim();
        const hasContact = String(req.query.hasContact || 'any').trim().toLowerCase();
        const contactFilter =
            hasContact === 'email' || hasContact === 'phone' || hasContact === 'both'
                ? hasContact
                : 'any';

        const params: any[] = [ADMIN_LEAD_TYPES];
        const where: string[] = [`s.type = ANY($1::text[])`];

        where.push(`(
            NULLIF(TRIM(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', s.payload->'customer'->>'email', '')), '') IS NOT NULL
            OR NULLIF(TRIM(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', s.payload->'customer'->>'phone', '')), '') IS NOT NULL
        )`);

        if (contactFilter === 'email') {
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', s.payload->'customer'->>'email', '')), '') IS NOT NULL`
            );
        } else if (contactFilter === 'phone') {
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', s.payload->'customer'->>'phone', '')), '') IS NOT NULL`
            );
        } else if (contactFilter === 'both') {
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', s.payload->'customer'->>'email', '')), '') IS NOT NULL`
            );
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', s.payload->'customer'->>'phone', '')), '') IS NOT NULL`
            );
        }

        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const p = `$${params.length}`;
            where.push(`(
                LOWER(COALESCE(s.payload->>'businessName', '')) LIKE ${p}
                OR LOWER(COALESCE(s.payload->>'name', s.payload->>'contactName', s.payload->>'fullName', s.payload->'customer'->>'name', '')) LIKE ${p}
                OR LOWER(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', '')) LIKE ${p}
                OR LOWER(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', '')) LIKE ${p}
            )`);
        }

        const origin = zappSitesOrigin();

        // 1. Submissions query
        const submissionsPromise = query(
            `SELECT s.id, s.type, s.created_at, s.email AS submission_email, s.payload,
                    a.id AS audit_id, a.data AS audit_data
             FROM submissions s
             LEFT JOIN audits a ON a.id::text = s.payload->>'auditId'
             WHERE ${where.join(' AND ')}
             ORDER BY s.created_at DESC
             LIMIT 500`,
            params
        )
            .then((res) => res.rows.map((row) => mapAdminLead(row, origin)))
            .catch((err) => {
                console.warn('Submissions query error in growth-audit-leads:', err?.message || err);
                return [];
            });

        // 2. Added CRM sales leads query
        const salesParams: any[] = [];
        const salesWhere: string[] = ['1=1'];

        if (contactFilter === 'email') {
            salesWhere.push(`NULLIF(TRIM(l.email), '') IS NOT NULL`);
        } else if (contactFilter === 'phone') {
            salesWhere.push(`NULLIF(TRIM(l.phone), '') IS NOT NULL`);
        } else if (contactFilter === 'both') {
            salesWhere.push(`NULLIF(TRIM(l.email), '') IS NOT NULL AND NULLIF(TRIM(l.phone), '') IS NOT NULL`);
        }

        if (q) {
            salesParams.push(`%${q.toLowerCase()}%`);
            const sp = `$${salesParams.length}`;
            salesWhere.push(`(
                LOWER(COALESCE(l.name, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.email, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.phone, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.address, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.website, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.industry, '')) LIKE ${sp}
            )`);
        }

        const salesLeadsPromise = query(
            `SELECT l.*, u.name AS "assignedAgentName", u.email AS "assignedAgentEmail"
             FROM sales_leads l
             LEFT JOIN users u ON u.id = l.assigned_to
             WHERE ${salesWhere.join(' AND ')}
             ORDER BY l.created_at DESC
             LIMIT 500`,
            salesParams
        )
            .then((res) => res.rows.map(mapSalesLeadToAdminLead))
            .catch((err) => {
                console.warn('Sales leads query error in growth-audit-leads:', err?.message || err);
                return [];
            });

        const [submissionLeads, addedLeads] = await Promise.all([
            submissionsPromise,
            salesLeadsPromise
        ]);

        const allLeads = [...addedLeads, ...submissionLeads].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Fetch latest sales agent activities / call notes and sales_leads status for each lead
        const leadIds = allLeads.map((l) => String(l.id)).filter(Boolean);
        const emails = allLeads
            .map((l) => String(l.email || '').trim().toLowerCase())
            .filter(Boolean);

        if (leadIds.length > 0 || emails.length > 0) {
            try {
                const [actResult, salesLeadStatusResult, taskResult] = await Promise.all([
                    query(
                        `SELECT DISTINCT ON (COALESCE(LOWER(sl.email), LOWER(sub.email), a.lead_id))
                            a.lead_id, a.activity_type, a.disposition, a.note, a.author_name, a.created_at,
                            COALESCE(LOWER(sl.email), LOWER(sub.email)) AS lead_email
                         FROM (
                             SELECT lead_id::text AS lead_id, COALESCE(NULLIF(activity_type, ''), 'note') AS activity_type, disposition, note, author_name, created_at
                             FROM lead_activities
                             UNION ALL
                             SELECT c.lead_id::text AS lead_id, 'call_log' AS activity_type, COALESCE(c.outcome, 'connected') AS disposition, COALESCE(c.notes, '') AS note, COALESCE(u.name, 'Sales Agent') AS author_name, c.created_at
                             FROM sales_call_logs c
                             LEFT JOIN users u ON u.id::text = c.agent_id::text
                             WHERE NOT EXISTS (SELECT 1 FROM lead_activities la WHERE la.id::text = c.id::text)
                         ) a
                         LEFT JOIN sales_leads sl ON sl.id::text = a.lead_id
                         LEFT JOIN submissions sub ON sub.id::text = a.lead_id
                         WHERE a.lead_id = ANY($1::text[]) 
                            OR (COALESCE(LOWER(sl.email), LOWER(sub.email)) = ANY($2::text[]) AND COALESCE(sl.email, sub.email, '') <> '')
                         ORDER BY COALESCE(LOWER(sl.email), LOWER(sub.email), a.lead_id), a.created_at DESC`,
                        [leadIds, emails]
                    ).catch(() => ({ rows: [] })),
                    query(
                        `SELECT sl.id, sl.email, sl.status, sl.notes,
                                u.name AS assigned_agent_name
                         FROM sales_leads sl
                         LEFT JOIN users u ON u.id = sl.assigned_to
                         WHERE sl.id::text = ANY($1::text[]) OR LOWER(sl.email) = ANY($2::text[])`,
                        [leadIds, emails]
                    ).catch(() => ({ rows: [] })),
                    query(
                        `SELECT DISTINCT ON (COALESCE(LOWER(sl.email), LOWER(sub.email), t.lead_id))
                            t.lead_id, t.status AS task_status, t.notes AS task_notes, t.title AS task_title,
                            u.name AS task_agent_name,
                            COALESCE(LOWER(sl.email), LOWER(sub.email)) AS lead_email
                         FROM lead_tasks t
                         LEFT JOIN users u ON u.id = t.assigned_to_user_id
                         LEFT JOIN sales_leads sl ON sl.id::text = t.lead_id
                         LEFT JOIN submissions sub ON sub.id::text = t.lead_id
                         WHERE (t.created_by_role = 'admin' OR t.created_by_role IS NULL)
                           AND (t.lead_id = ANY($1::text[]) OR (COALESCE(LOWER(sl.email), LOWER(sub.email)) = ANY($2::text[]) AND COALESCE(sl.email, sub.email, '') <> ''))
                         ORDER BY COALESCE(LOWER(sl.email), LOWER(sub.email), t.lead_id), t.updated_at DESC`,
                        [leadIds, emails]
                    ).catch(() => ({ rows: [] }))
                ]);

                const actMap = new Map<string, any>();
                for (const act of actResult.rows) {
                    const entry = {
                        type: act.activity_type,
                        disposition: act.disposition,
                        note: act.note,
                        authorName: act.author_name,
                        createdAt: act.created_at
                    };
                    if (act.lead_id) actMap.set(String(act.lead_id), entry);
                    if (act.lead_email) actMap.set(String(act.lead_email).toLowerCase(), entry);
                }

                const statusMap = new Map<string, { status: string; notes: string | null; agentName: string | null }>();
                for (const sl of salesLeadStatusResult.rows) {
                    const entry = { status: sl.status, notes: sl.notes || null, agentName: sl.assigned_agent_name || null };
                    if (sl.id) statusMap.set(String(sl.id), entry);
                    if (sl.email) statusMap.set(String(sl.email).toLowerCase(), entry);
                }

                const taskMap = new Map<string, { status: string; notes: string | null; title: string | null; agentName: string | null }>();
                for (const t of taskResult.rows) {
                    const entry = {
                        status: t.task_status,
                        notes: t.task_notes || null,
                        title: t.task_title || null,
                        agentName: t.task_agent_name || null
                    };
                    if (t.lead_id) taskMap.set(String(t.lead_id), entry);
                    if (t.lead_email) taskMap.set(String(t.lead_email).toLowerCase(), entry);
                }

                for (const lead of allLeads) {
                    const leadIdStr = String(lead.id);
                    const emailStr = String(lead.email || '').toLowerCase();

                    // 1. Attach latest activity log
                    const latest = actMap.get(leadIdStr) || (emailStr ? actMap.get(emailStr) : null);
                    if (latest) {
                        (lead as any).latestActivity = latest;
                        if (latest.disposition && (!lead.status || lead.status === 'new' || lead.status === 'otp_pending')) {
                            lead.status = latest.disposition;
                        }
                    }

                    // 2. Direct sales_leads data always wins — authoritative agent update
                    const slData = statusMap.get(leadIdStr) || (emailStr ? statusMap.get(emailStr) : null);
                    if (slData) {
                        if (slData.status && slData.status !== 'new') {
                            lead.status = slData.status;
                        }
                        if (slData.notes) {
                            (lead as any).salesNotes = slData.notes;
                        }
                        if (slData.agentName) {
                            (lead as any).assignedAgentName = slData.agentName;
                        }
                    }

                    // 3. Lead tasks data — fallback/complement for notes
                    const taskData = taskMap.get(leadIdStr) || (emailStr ? taskMap.get(emailStr) : null);
                    if (taskData) {
                        if (!(lead as any).salesNotes && taskData.notes) {
                            (lead as any).salesNotes = taskData.notes;
                        }
                    }
                }
            } catch (actErr) {
                console.warn('Could not attach lead activities to admin leads:', actErr);
            }
        }

        res.json({
            stage: resolveAdminCredentials().stage,
            leads: allLeads
        });
    } catch (err: any) {
        console.error('Admin growth-audit-leads error:', err);
        if (growthAuditTablesMissing(err)) {
            return res.status(503).json({
                error: "Growth audit tables are not available on this environment's database."
            });
        }
        res.status(500).json({ error: err.message || 'Failed to load leads' });
    }
});

export default router;
