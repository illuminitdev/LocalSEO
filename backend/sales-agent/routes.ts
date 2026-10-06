import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { requireSalesAgent } from '../middleware/auth';
import { comparePassword, hashPassword } from '../lib/authTokens';
import { query } from '../lib/db';
import { sendFullAuditShareEmail, sendLeadObservationsEmail } from '../lib/bookingEmail';
import {
    proxyZappSitesOps,
    proxyZappSitesPdf,
    reportShareUrl,
    zappSitesOrigin as zappSitesOriginFromProxy
} from '../lib/zappSitesAuditProxy';
import {
    auditEmailClickTrackingUrl,
    auditEmailLogoTrackingUrl,
    auditEmailOpenTrackingUrl,
    fetchLatestAuditEmailShareMap,
    newAuditEmailOpenToken,
    recordAuditEmailSend,
    shareInfoForAudit
} from '../lib/auditEmailSends';
import {
    fetchLatestLeadObservationEmailShareMap,
    leadEmailLogoTrackingUrl,
    leadEmailOpenTrackingUrl,
    leadFullAuditRequestUrl,
    newLeadObservationEmailToken,
    recordLeadObservationEmailSend,
    shareInfoForLeadObservation
} from '../lib/leadObservationEmailSends';
import {
    CALL_OUTCOMES,
    getAssignedLead,
    listAssignedLeads,
    logCall,
    updateAssignedLead,
    createSalesLead,
    bulkImportSalesLeads,
    convertLeadToCustomer,
    ensureCrmTables,
    resolveAllLeadIds,
    type CallOutcome,
    type LeadStatus
} from './sales';

const router = Router();

router.use(requireSalesAgent);

function zappSitesOrigin() {
    return zappSitesOriginFromProxy();
}

function reportUrlFromSharePath(sharePath: string | null, auditId: string | null) {
    if (sharePath) {
        const origin = zappSitesOrigin();
        return `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}`;
    }
    if (auditId) return reportShareUrl(auditId);
    return null;
}

function metaFromZappAudit(auditId: string, audit: Record<string, unknown>) {
    const business =
        audit.business && typeof audit.business === 'object'
            ? (audit.business as Record<string, unknown>)
            : {};
    const scoreObj =
        audit.score && typeof audit.score === 'object'
            ? (audit.score as { total?: number })
            : null;
    const scoreRaw =
        (audit.totalScore as number | null | undefined) ?? scoreObj?.total ?? null;
    return {
        id: auditId,
        businessName: String(
            business.businessName ||
                business.name ||
                audit.businessName ||
                'Lead'
        ).trim(),
        phone: String(business.phone || audit.phone || '').trim(),
        email: String(business.email || audit.email || '')
            .trim()
            .toLowerCase(),
        website: String(business.website || audit.website || '').trim(),
        address: String(business.address || audit.address || '').trim(),
        city: String(business.city || audit.city || '').trim(),
        scoreTotal:
            scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null,
        auditId,
        reportUrl: reportShareUrl(auditId),
        source: 'full_audit'
    };
}

async function fetchZappAuditMeta(auditId: string) {
    try {
        const detail = await proxyZappSitesOps(
            'GET',
            `/api/ops/audits/${encodeURIComponent(auditId)}`
        );
        if (detail.status >= 400 || !detail.json || typeof detail.json !== 'object') {
            return null;
        }
        const body = detail.json as {
            success?: boolean;
            data?: Record<string, unknown>;
        };
        const audit = (body.data || {}) as Record<string, unknown>;
        if (!audit.id && body.success === false) return null;
        return metaFromZappAudit(auditId, audit);
    } catch {
        return null;
    }
}

/** Helper to extract lead details from submissions + audits or sales_leads */
async function fetchLeadMetadataMap(leadIds: string[]) {
    if (!leadIds.length) return new Map<string, any>();
    const map = new Map<string, any>();

    
    try {
        const { rows: subRows } = await query(
            `SELECT s.id, s.created_at, s.email AS submission_email, s.payload,
                    a.id AS audit_id, a.data AS audit_data
             FROM submissions s
             LEFT JOIN audits a ON a.id::text = s.payload->>'auditId'
             WHERE s.id::text = ANY($1::text[])`,
            [leadIds]
        );

        for (const row of subRows) {
            const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
            const auditData = row.audit_data && typeof row.audit_data === 'object' ? row.audit_data : {};
            const business = auditData.business && typeof auditData.business === 'object' ? auditData.business : {};
            const sharePath = String(payload.sharePath || '').trim() || null;
            const auditId =
                String(payload.auditId || row.audit_id || '').trim() || null;
            const scoreRaw = payload.scoreTotal ?? auditData.scoreTotal ?? auditData.score?.total ?? null;

            map.set(String(row.id), {
                id: String(row.id),
                businessName: String(payload.businessName || business.name || 'Lead').trim(),
                phone: String(payload.phone || business.phone || '').trim(),
                email: String(payload.email || row.submission_email || business.email || '').trim().toLowerCase(),
                website: String(payload.website || business.website || '').trim(),
                address: String(payload.address || business.address || '').trim(),
                city: String(payload.city || business.city || '').trim(),
                scoreTotal: scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null,
                auditId,
                reportUrl: reportUrlFromSharePath(sharePath, auditId),
                source: String(payload.source || 'growth_audit').trim(),
                status: String(payload.status || 'new').trim().toLowerCase()
            });
        }
    } catch {}

    
    // 2. Query sales_leads for all IDs to overlay/merge CRM edits (email, phone, name, notes, etc.)
    try {
        const { rows: salesRows } = await query(
            `SELECT * FROM sales_leads WHERE id::text = ANY($1::text[])`,
            [leadIds]
        );
        for (const row of salesRows) {
            const auditId = String(row.audit_id || '').trim() || null;
            const idKey = String(row.id);
            const existing = map.get(idKey);
            map.set(idKey, {
                id: idKey,
                businessName: row.name || existing?.businessName || 'Lead',
                name: row.name || existing?.name || 'Lead',
                phone: row.phone || existing?.phone || '',
                email: (row.email || existing?.email || '').trim().toLowerCase(),
                website: row.website || existing?.website || '',
                address: row.address || existing?.address || '',
                city: existing?.city || '',
                industry: row.industry || existing?.industry || '',
                gbpObservation: row.gbp_observation || existing?.gbpObservation || '',
                aiVisibilityObservation: row.ai_visibility_observation || existing?.aiVisibilityObservation || '',
                leadOpportunity: row.lead_opportunity || existing?.leadOpportunity || '',
                opportunityLevel: row.opportunity_level || existing?.opportunityLevel || 'medium',
                isCustomer: Boolean(row.is_customer ?? existing?.isCustomer),
                convertedAt: row.converted_at || existing?.convertedAt || null,
                notes: row.notes || existing?.notes || '',
                status: row.status || existing?.status || 'new',
                scoreTotal: existing?.scoreTotal ?? null,
                auditId: auditId || existing?.auditId || null,
                reportUrl: existing?.reportUrl || (auditId ? reportShareUrl(auditId) : null),
                source: row.source || existing?.source || 'sales_lead',
                spreadsheetStatus: row.spreadsheet_status || existing?.spreadsheetStatus || '',
                spreadsheetStatus1: row.spreadsheet_status_1 || existing?.spreadsheetStatus1 || '',
                spreadsheetStatus2: row.spreadsheet_status_2 || existing?.spreadsheetStatus2 || '',
                spreadsheetStatus3: row.spreadsheet_status_3 || existing?.spreadsheetStatus3 || ''
            });
        }
    } catch {}

    // Full-audit CRM leads: lead_id is the ZappSites audit UUID (not a submission / sales_lead)
    const stillMissing = leadIds.filter((id) => !map.has(id));
    if (stillMissing.length) {
        // Prefer local audits cache when present, then fill gaps from ZappSites ops
        try {
            const { rows: auditRows } = await query(
                `SELECT id, data FROM audits WHERE id::text = ANY($1::text[])`,
                [stillMissing]
            );
            for (const row of auditRows) {
                const data = row.data && typeof row.data === 'object' ? row.data : {};
                const business =
                    data.business && typeof data.business === 'object' ? data.business : {};
                const auditId = String(row.id);
                const scoreRaw = data.scoreTotal ?? data.totalScore ?? data.score?.total ?? null;
                map.set(auditId, {
                    id: auditId,
                    businessName: String(
                        business.businessName || business.name || data.businessName || 'Lead'
                    ).trim(),
                    phone: String(business.phone || data.phone || '').trim(),
                    email: String(business.email || data.email || '').trim().toLowerCase(),
                    website: String(business.website || data.website || '').trim(),
                    address: String(business.address || data.address || '').trim(),
                    city: String(business.city || data.city || '').trim(),
                    scoreTotal:
                        scoreRaw != null && Number.isFinite(Number(scoreRaw))
                            ? Number(scoreRaw)
                            : null,
                    auditId,
                    reportUrl: reportShareUrl(auditId),
                    source: 'full_audit'
                });
            }
        } catch {}

        const needZapp = stillMissing.filter((id) => {
            const existing = map.get(id);
            if (!existing) return true;
            // Local row exists but contact fields empty — hydrate from ZappSites
            return !existing.email && !existing.phone && !existing.website;
        });

        if (needZapp.length) {
            const results = await Promise.all(
                needZapp.map(async (id) => ({ id, meta: await fetchZappAuditMeta(id) }))
            );
            for (const { id, meta } of results) {
                if (meta) {
                    map.set(id, meta);
                } else if (!map.has(id)) {
                    map.set(id, {
                        id,
                        businessName: 'Lead',
                        phone: '',
                        email: '',
                        website: '',
                        address: '',
                        city: '',
                        scoreTotal: null,
                        auditId: id,
                        reportUrl: reportShareUrl(id),
                        source: 'full_audit'
                    });
                }
            }
        }

        for (const id of stillMissing.filter((lid) => !map.has(lid))) {
            map.set(id, {
                id,
                businessName: 'Lead',
                phone: '',
                email: '',
                website: '',
                address: '',
                city: '',
                scoreTotal: null,
                auditId: id,
                reportUrl: reportShareUrl(id),
                source: 'full_audit'
            });
        }
    }

    return map;
}

async function agentCanShareAudit(agentId: string, auditId: string): Promise<boolean> {
    const { rows } = await query(
        `SELECT 1
         FROM lead_tasks t
         WHERE t.assigned_to_user_id = $1
           AND (
             t.lead_id = $2
             OR EXISTS (
               SELECT 1 FROM submissions s
               WHERE s.id::text = t.lead_id
                 AND s.payload->>'auditId' = $2
             )
             OR EXISTS (
               SELECT 1 FROM sales_leads sl
               WHERE sl.id::text = t.lead_id
                 AND sl.audit_id = $2
             )
           )
         LIMIT 1`,
        [agentId, auditId]
    );
    if (rows.length > 0) return true;

    const { rows: leadRows } = await query(
        `SELECT 1 FROM sales_leads
         WHERE audit_id = $2
           AND (assigned_to = $1 OR id::text IN (
             SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $1
           ))
         LIMIT 1`,
        [agentId, auditId]
    );
    return leadRows.length > 0;
}

async function agentOwnsLead(agentId: string, leadId: string): Promise<boolean> {
    const allIds = await resolveAllLeadIds(leadId);
    const { rows } = await query(
        `SELECT 1 FROM sales_leads
         WHERE id::text = ANY($1::text[])
           AND (assigned_to = $2 OR id::text IN (
             SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $2
           ))
         LIMIT 1`,
        [allIds, agentId]
    );
    if (rows.length > 0) return true;

    const { rows: taskRows } = await query(
        `SELECT 1 FROM lead_tasks
         WHERE assigned_to_user_id = $1 AND lead_id = ANY($2::text[])
         LIMIT 1`,
        [agentId, allIds]
    );
    return taskRows.length > 0;
}

router.get('/me', async (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatar_url || '',
            platformRole: user.platform_role || 'sales_agent',
            mustChangePassword: Boolean(user.must_change_password)
        }
    });
});


router.get('/summary', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;

        const [tasksPendingRes, tasksInProgressRes, tasksDueTodayRes, callsTodayRes, tasksCompletedRes, leadsCountRes] = await Promise.all([
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status = 'pending'`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status = 'in_progress'`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status IN ('pending', 'in_progress') AND due_date IS NOT NULL AND due_date::date <= CURRENT_DATE`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_activities WHERE user_id = $1 AND activity_type = 'call_log' AND created_at::date = CURRENT_DATE`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status = 'completed'`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM sales_leads WHERE (assigned_to = $1 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $1)) AND is_customer = FALSE`, [agentId]).catch(() => ({ rows: [{ count: 0 }] }))
        ]);

        const pendingCount = tasksPendingRes.rows[0]?.count || 0;
        const inProgressCount = tasksInProgressRes.rows[0]?.count || 0;

        res.json({
            pendingTasksCount: pendingCount,
            inProgressTasksCount: inProgressCount,
            activeTasksCount: pendingCount + inProgressCount,
            dueTodayTasksCount: tasksDueTodayRes.rows[0]?.count || 0,
            callsTodayCount: callsTodayRes.rows[0]?.count || 0,
            completedTasksCount: tasksCompletedRes.rows[0]?.count || 0,
            leadsCount: leadsCountRes.rows[0]?.count || 0
        });
    } catch (err: any) {
        console.error('Sales summary error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch summary' });
    }
});


router.get('/tasks', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const status = String(req.query.status || '').trim();
        const priority = String(req.query.priority || '').trim();
        const taskType = String(req.query.taskType || '').trim();
        const dueToday = String(req.query.dueToday || '').toLowerCase() === 'true' || String(req.query.dueToday || '') === '1';
        const leadId = String(req.query.leadId || '').trim();
        const createdBy = String(req.query.createdBy || '').trim();

        const params: any[] = [agentId];
        const where: string[] = [
            `(
                t.assigned_to_user_id = $1 
                OR t.lead_id IN (SELECT DISTINCT lt2.lead_id FROM lead_tasks lt2 WHERE lt2.assigned_to_user_id = $1)
                OR t.lead_id IN (SELECT id::text FROM sales_leads WHERE assigned_to = $1)
            )`
        ];

        if (status && status !== 'all') {
            params.push(status);
            where.push(`t.status = $${params.length}`);
        }
        if (priority && priority !== 'all') {
            params.push(priority);
            where.push(`t.priority = $${params.length}`);
        }
        if (taskType && taskType !== 'all') {
            params.push(taskType);
            where.push(`t.task_type = $${params.length}`);
        }
        if (dueToday) {
            where.push(`t.due_date IS NOT NULL AND t.due_date::date <= CURRENT_DATE`);
        }
        if (leadId) {
            params.push(leadId);
            where.push(`t.lead_id = $${params.length}`);
        }
        if (createdBy === 'admin') {
            where.push(`(t.created_by_role = 'admin' OR t.created_by_role IS NULL)`);
        } else if (createdBy === 'self') {
            where.push(`t.created_by_role = 'self'`);
        }

        const { rows: tasks } = await query(`
            SELECT 
                t.id,
                t.lead_id AS "leadId",
                t.task_type AS "taskType",
                t.title,
                t.notes,
                t.priority,
                t.status,
                t.due_date AS "dueDate",
                t.completed_at AS "completedAt",
                t.created_at AS "createdAt",
                t.updated_at AS "updatedAt",
                t.assigned_to_user_id AS "assignedToUserId",
                COALESCE(t.assigned_to_role, 'sales_agent') AS "assignedToRole",
                COALESCE(t.created_by_role, 'admin') AS "createdByRole",
                COALESCE(t.created_by_name, 'Admin') AS "createdByName"
            FROM lead_tasks t
            WHERE ${where.join(' AND ')}
            ORDER BY 
                CASE 
                    WHEN t.status = 'pending' THEN 1 
                    WHEN t.status = 'in_progress' THEN 2 
                    WHEN t.status = 'completed' THEN 3 
                    ELSE 4 
                END,
                t.due_date ASC NULLS LAST,
                t.created_at DESC
            LIMIT 500
        `, params);

        const leadIds = Array.from(new Set(tasks.map((t) => t.leadId)));
        const leadMetaMap = await fetchLeadMetadataMap(leadIds);
        const auditIds = Array.from(
            new Set(
                Array.from(leadMetaMap.values())
                    .map((m: any) => String(m.auditId || '').trim())
                    .filter(Boolean)
            )
        );
        const shareMap = await fetchLatestAuditEmailShareMap(auditIds);

        const enrichedTasks = tasks.map((t) => {
            const meta = leadMetaMap.get(t.leadId) || {};
            const share = shareInfoForAudit(shareMap, meta.auditId);
            return {
                ...t,
                leadBusinessName: t.leadId === 'general' ? '' : (meta.businessName || ''),
                leadPhone: meta.phone || '',
                leadEmail: meta.email || '',
                leadWebsite: meta.website || '',
                leadAddress: meta.address || '',
                leadCity: meta.city || '',
                leadScoreTotal: meta.scoreTotal ?? null,
                leadReportUrl: meta.reportUrl || null,
                leadAuditId: meta.auditId || null,
                leadSource: meta.source || '',
                leadIndustry: String(meta.industry || '').trim() || '',
                leadStatus: meta.status || (meta.isCustomer ? 'converted' : 'new'),
                emailShareStatus: share.emailShareStatus,
                emailShareSentAt: share.emailShareSentAt,
                emailShareOpenedAt: share.emailShareOpenedAt
            };
        });

        res.json({ tasks: enrichedTasks });
    } catch (err: any) {
        console.error('Sales fetch tasks error:', err);
        res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
});


router.post('/tasks', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const agentName = (req as any).user.name || 'Sales Agent';
        const {
            lead_id,
            task_type = 'follow_up_call',
            title,
            notes = '',
            priority = 'medium',
            due_date = null,
            assigned_to_role = 'sales_agent',
            assigned_to_user_id = null
        } = req.body || {};

        const effectiveLeadId = (lead_id && String(lead_id).trim()) ? String(lead_id).trim() : 'general';
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Task title is required.' });
        }

        const validTaskTypes = [
            'prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom',
            'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'
        ];
        const sanitizedTaskType = validTaskTypes.includes(task_type) ? task_type : 'follow_up_call';

        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const sanitizedPriority = validPriorities.includes(priority) ? priority : 'medium';

        // If the task type is prepare_audit, it is an audit request sent to Admin/SEO, not a personal sales task
        if (sanitizedTaskType === 'prepare_audit') {
            let bName = '';
            let bEmail = '';
            const allLeadIds = await resolveAllLeadIds(effectiveLeadId);

            const [salesRes, subRes] = await Promise.all([
                query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] as any[] })),
                query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email FROM submissions WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] as any[] }))
            ]);

            bName = String(salesRes.rows[0]?.name || subRes.rows[0]?.bname || subRes.rows[0]?.name || '').trim();
            bEmail = String(salesRes.rows[0]?.email || subRes.rows[0]?.email || '').trim().toLowerCase();

            if (!bName) {
                bName = title.replace(/^Full\s+Growth\s+Audit\s+for\s+/i, '').replace(/^Audit\s+for\s+/i, '').trim() || 'Lead';
            }

            let validAgentUserId = null;
            if (agentId) {
                const { rows: uRows } = await query(
                    `SELECT id FROM users WHERE id::text = $1 LIMIT 1`,
                    [String(agentId)]
                ).catch(() => ({ rows: [] as any[] }));
                if (uRows[0]) validAgentUserId = uRows[0].id;
            }

            // Remove any legacy prepare_audit from lead_tasks so sales agent does not see a pending task
            await query(
                `DELETE FROM lead_tasks WHERE lead_id = ANY($1::text[]) AND task_type = 'prepare_audit'`,
                [allLeadIds]
            ).catch(() => {});

            // Insert into full_audit_requests so Admin sees it in Full Audit Requests
            await query(`
                INSERT INTO full_audit_requests (
                    lead_id, business_name, to_email, status, source, assigned_to_user_id, notes, requested_at
                ) VALUES ($1, $2, $3, 'pending', 'sales_agent_request', $4, $5, NOW())
            `, [
                effectiveLeadId,
                bName,
                bEmail,
                validAgentUserId,
                notes ? String(notes).trim() : null
            ]);

            // Record in lead activities timeline
            await query(`
                INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note, created_at)
                VALUES ($1, $2, $3, 'status_change', 'Audit Requested', $4, NOW())
            `, [
                effectiveLeadId,
                validAgentUserId,
                agentName,
                `Requested Full Growth Audit from Admin / SEO Team${notes ? ` (Note: ${notes})` : ''}`
            ]);

            await query(
                `UPDATE sales_leads SET status = 'interested', updated_at = NOW() WHERE id::text = $1`,
                [effectiveLeadId]
            ).catch(() => {});

            return res.status(200).json({
                success: true,
                message: `Full Growth Audit requested from Admin successfully for ${bName || 'lead'}!`,
                task: null
            });
        }

        const targetRole = String(assigned_to_role || 'sales_agent').trim();
        const targetUserId = targetRole === 'sales_agent' ? (assigned_to_user_id || agentId) : (assigned_to_user_id || null);
        const createdByRole = 'self';

        const { rows } = await query(`
            INSERT INTO lead_tasks (
                lead_id, task_type, title, notes, priority, status, assigned_to_user_id, assigned_to_role, due_date, created_by_role, created_by_name
            ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
            RETURNING 
                id,
                lead_id AS "leadId",
                task_type AS "taskType",
                title,
                notes,
                priority,
                status,
                due_date AS "dueDate",
                completed_at AS "completedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                assigned_to_user_id AS "assignedToUserId",
                assigned_to_role AS "assignedToRole",
                created_by_role AS "createdByRole",
                created_by_name AS "createdByName"
        `, [
            effectiveLeadId,
            sanitizedTaskType,
            String(title).trim(),
            String(notes || '').trim(),
            sanitizedPriority,
            targetUserId,
            targetRole,
            due_date || null,
            createdByRole,
            agentName
        ]);

        const task = rows[0];

        // Record task creation activity on lead timeline
        if (effectiveLeadId !== 'general') {
            try {
                await query(`
                    INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note)
                    VALUES ($1, $2, $3, 'task_event', $4, $5)
                `, [
                    effectiveLeadId,
                    agentId,
                    agentName,
                    sanitizedTaskType,
                    `Created Task: "${task.title}"${notes ? ` - ${notes}` : ''}`
                ]);
            } catch {}
        }

        res.status(201).json({ task });
    } catch (err: any) {
        console.error('Sales create task error:', err);
        res.status(500).json({ error: err.message || 'Failed to create task' });
    }
});

router.post('/leads/:id/request-audit', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id || '').trim();
        const agentId = String((req as any).user?.id || '');
        const agentName = String((req as any).user?.name || (req as any).user?.email || 'Sales Agent').trim();
        const { notes = '', title = '', priority = '', dueDate = null } = req.body || {};

        const allLeadIds = await resolveAllLeadIds(leadId);

        const [salesRes, subRes] = await Promise.all([
            query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] as any[] })),
            query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email FROM submissions WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] as any[] }))
        ]);

        let bName = String(salesRes.rows[0]?.name || subRes.rows[0]?.bname || subRes.rows[0]?.name || '').trim();
        let bEmail = String(salesRes.rows[0]?.email || subRes.rows[0]?.email || '').trim().toLowerCase();

        if (!bName) {
            bName = String(title || '').replace(/^Full\s+Growth\s+Audit\s+for\s+/i, '').replace(/^Audit\s+for\s+/i, '').trim() || 'Lead';
        }

        let validAgentUserId = null;
        if (agentId && agentId !== 'general') {
            const { rows: uRows } = await query(`SELECT id FROM users WHERE id::text = $1 LIMIT 1`, [agentId]).catch(() => ({ rows: [] as any[] }));
            if (uRows[0]?.id) validAgentUserId = uRows[0].id;
        }

        const noteParts: string[] = [];
        if (priority) noteParts.push(`Priority: ${priority.toUpperCase()}`);
        if (dueDate) {
            try {
                const dStr = new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                noteParts.push(`Target Due: ${dStr}`);
            } catch {}
        }
        if (notes && String(notes).trim()) noteParts.push(String(notes).trim());
        const combinedNotes = noteParts.join(' | ');

        // Clean up any old prepare_audit tasks from lead_tasks so sales agent does not have a lingering pending task
        await query(
            `DELETE FROM lead_tasks WHERE lead_id = ANY($1::text[]) AND task_type = 'prepare_audit'`,
            [allLeadIds]
        ).catch(() => {});

        // Insert into full_audit_requests so it appears in Admin Full Audits section
        await query(`
            INSERT INTO full_audit_requests (
                lead_id, business_name, to_email, status, source, assigned_to_user_id, notes, requested_at
            ) VALUES ($1, $2, $3, 'pending', 'sales_agent_request', $4, $5, NOW())
        `, [
            leadId,
            bName,
            bEmail,
            validAgentUserId,
            combinedNotes
        ]);

        // Insert into lead_activities timeline
        await query(`
            INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note, created_at)
            VALUES ($1, $2, $3, 'status_change', 'Audit Requested', $4, NOW())
        `, [
            leadId,
            validAgentUserId,
            agentName,
            `Requested Full Growth Audit from Admin / SEO Team${combinedNotes ? ` (${combinedNotes})` : ''}`
        ]);

        await query(
            `UPDATE sales_leads SET status = 'interested', updated_at = NOW() WHERE id::text = $1`,
            [leadId]
        ).catch(() => {});

        res.json({
            success: true,
            message: `Full Growth Audit requested from Admin successfully for ${bName || 'lead'}!`
        });
    } catch (err: any) {
        console.error('Request full audit error:', err);
        res.status(500).json({ error: err.message || 'Failed to submit audit request' });
    }
});


router.patch('/tasks/:id', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const taskId = req.params.id;
        const agentId = (req as any).user.id;
        const agentName = (req as any).user.name || 'Sales Agent';
        const { status, priority, notes, due_date, title } = req.body || {};

        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [taskId, agentId];

        if (status !== undefined) {
            params.push(status);
            updates.push(`status = $${params.length}`);
            if (status === 'completed') {
                updates.push(`completed_at = NOW()`);
            } else {
                updates.push(`completed_at = NULL`);
            }
        }
        if (priority !== undefined) {
            params.push(priority);
            updates.push(`priority = $${params.length}`);
        }
        if (notes !== undefined) {
            params.push(String(notes || '').trim());
            updates.push(`notes = $${params.length}`);
        }
        if (title !== undefined && String(title).trim()) {
            params.push(String(title).trim());
            updates.push(`title = $${params.length}`);
        }
        if (due_date !== undefined) {
            params.push(due_date || null);
            updates.push(`due_date = $${params.length}`);
        }

        const { rows } = await query(`
            UPDATE lead_tasks
            SET ${updates.join(', ')}
            WHERE id = $1 AND assigned_to_user_id = $2
            RETURNING 
                id,
                lead_id AS "leadId",
                task_type AS "taskType",
                title,
                notes,
                priority,
                status,
                due_date AS "dueDate",
                completed_at AS "completedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                assigned_to_user_id AS "assignedToUserId",
                COALESCE(created_by_role, 'admin') AS "createdByRole",
                COALESCE(created_by_name, 'Admin') AS "createdByName"
        `, params);

        if (!rows.length) {
            return res.status(404).json({ error: 'Task not found or not assigned to you' });
        }

        const task = rows[0];

        // If status or note changed, record activity log in lead_activities so both admin and sales see it in real-time
        if (status !== undefined || (notes !== undefined && String(notes).trim())) {
            try {
                const agentName = (req as any).user.name || 'Sales Agent';
                const agentId = (req as any).user.id;
                const statusStr = status ? String(status).replace('_', ' ').toUpperCase() : 'UPDATED';
                const cleanNote = notes && String(notes).trim() ? String(notes).trim() : `Task "${task.title}" status changed to ${statusStr}`;
                await query(`
                    INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, $2, $3, 'task_event', $4, $5, NOW())
                `, [task.leadId, agentId, agentName, status || task.status || 'in_progress', cleanNote]);
            } catch (actErr) {
                console.warn('Failed to record task status activity:', actErr);
            }
        }

        res.json({ task });
    } catch (err: any) {
        console.error('Sales update task error:', err);
        res.status(500).json({ error: err.message || 'Failed to update task' });
    }
});


router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const taskId = req.params.id;
        const agentId = (req as any).user.id;
        const agentName = (req as any).user.name || 'Sales Agent';

        const { rows: taskRows } = await query(
            `SELECT title, lead_id FROM lead_tasks WHERE id = $1 AND assigned_to_user_id = $2`,
            [taskId, agentId]
        );

        if (taskRows.length > 0) {
            const task = taskRows[0];
            try {
                await query(`
                    INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, note)
                    VALUES ($1, $2, $3, 'task_event', $4)
                `, [task.lead_id, agentId, agentName, `Task "${task.title}" was deleted`]);
            } catch (actErr) {
                console.warn('Failed to record task deletion activity:', actErr);
            }
        }

        const { rowCount } = await query(`
            DELETE FROM lead_tasks
            WHERE id = $1 AND assigned_to_user_id = $2
        `, [taskId, agentId]);

        if (!rowCount) {
            return res.status(404).json({ error: 'Task not found or not assigned to you' });
        }

        res.json({ ok: true });
    } catch (err: any) {
        console.error('Sales delete task error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete task' });
    }
});


router.get('/leads/:id/crm', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const metaMap = await fetchLeadMetadataMap([leadId]);
        const lead = metaMap.get(leadId) || {
            id: leadId,
            businessName: 'Lead',
            phone: '',
            email: '',
            website: '',
            address: '',
            city: '',
            scoreTotal: null,
            auditId: null,
            reportUrl: null,
            source: ''
        };

        const shareMap = await fetchLatestAuditEmailShareMap(
            lead.auditId ? [String(lead.auditId)] : []
        );
        const share = shareInfoForAudit(shareMap, lead.auditId);
        Object.assign(lead, share);

        const allLeadIds = await resolveAllLeadIds(leadId);
        const obsMap = await fetchLatestLeadObservationEmailShareMap(allLeadIds);
        let obsShare = shareInfoForLeadObservation(obsMap, leadId);
        if (obsShare.observationEmailShareStatus === 'none') {
            for (const altId of allLeadIds) {
                const alt = shareInfoForLeadObservation(obsMap, altId);
                if (alt.observationEmailShareStatus !== 'none') {
                    obsShare = alt;
                    break;
                }
            }
        }
        Object.assign(lead, obsShare);

        const [salesRes, subRes] = await Promise.all([
            query(
                `SELECT id, name, email, phone, gbp_observation, ai_visibility_observation, notes, status, industry, website, address, audit_id
                 FROM sales_leads WHERE id::text = ANY($1::text[])`,
                [allLeadIds]
            ).catch(() => ({ rows: [] as any[] })),
            query(
                `SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email
                 FROM submissions WHERE id::text = ANY($1::text[])`,
                [allLeadIds]
            ).catch(() => ({ rows: [] as any[] }))
        ]);

        const matchedSales = salesRes.rows.find((r) => String(r.id) === leadId) || salesRes.rows[0];
        const matchedSub = subRes.rows.find((r) => String(r.id) === leadId) || subRes.rows[0];

        if (matchedSales) {
            const s = matchedSales;
            lead.businessName = s.name || lead.businessName;
            lead.email = s.email || lead.email;
            lead.phone = s.phone || lead.phone;
            lead.website = s.website || lead.website;
            lead.address = s.address || lead.address;
            lead.industry = s.industry || lead.industry;
            lead.notes = s.notes || lead.notes;
            lead.status = s.status || lead.status;
            lead.gbpObservation = s.gbp_observation || lead.gbpObservation || '';
            lead.aiVisibilityObservation =
                s.ai_visibility_observation || lead.aiVisibilityObservation || '';
            if (s.audit_id) {
                lead.auditId = String(s.audit_id);
                lead.reportUrl = reportShareUrl(String(s.audit_id));
            }
        }

        const leadName = (
            matchedSales?.name ||
            matchedSub?.bname ||
            matchedSub?.name ||
            ''
        )
            .trim()
            .toLowerCase();
        const leadEmail = (matchedSales?.email || matchedSub?.email || '')
            .trim()
            .toLowerCase();

        const [tasksRes, activitiesRes] = await Promise.all([
            query(
                `
                SELECT 
                    id,
                    lead_id AS "leadId",
                    task_type AS "taskType",
                    title,
                    notes,
                    priority,
                    status,
                    due_date AS "dueDate",
                    completed_at AS "completedAt",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    assigned_to_user_id AS "assignedToUserId",
                    COALESCE(assigned_to_role, 'sales_agent') AS "assignedToRole",
                    COALESCE(created_by_role, 'admin') AS "createdByRole",
                    COALESCE(created_by_name, 'Admin') AS "createdByName"
                FROM lead_tasks
                WHERE lead_id = ANY($1::text[])
                ORDER BY 
                    CASE 
                        WHEN status = 'in_progress' THEN 1 
                        WHEN status = 'pending' THEN 2 
                        WHEN status = 'completed' THEN 3 
                        ELSE 4 
                    END,
                    due_date ASC NULLS LAST,
                    created_at DESC
            `,
                [allLeadIds]
            ),
            query(
                `
                SELECT 
                    act_item.id,
                    act_item.lead_id AS "leadId",
                    act_item.activity_type AS "activityType",
                    act_item.disposition,
                    act_item.note,
                    act_item.author_name AS "authorName",
                    act_item.created_at AS "createdAt",
                    act_item.user_name AS "userName",
                    act_item.user_email AS "userEmail"
                FROM (
                    SELECT 
                        a.id::text AS id,
                        a.lead_id::text AS lead_id,
                        COALESCE(NULLIF(a.activity_type, ''), 'note') AS activity_type,
                        COALESCE(NULLIF(a.disposition, ''), 'Update') AS disposition,
                        COALESCE(a.note, '') AS note,
                        COALESCE(NULLIF(a.author_name, ''), u.name, 'Sales Agent') AS author_name,
                        a.created_at,
                        u.name AS user_name,
                        u.email AS user_email
                    FROM lead_activities a
                    LEFT JOIN users u ON u.id::text = a.user_id::text
                    WHERE a.lead_id::text = ANY($1::text[])

                    UNION ALL

                    SELECT 
                        c.id::text AS id,
                        c.lead_id::text AS lead_id,
                        'call_log' AS activity_type,
                        COALESCE(c.outcome, 'connected') AS disposition,
                        COALESCE(c.notes, '') AS note,
                        COALESCE(u.name, 'Sales Agent') AS author_name,
                        c.created_at,
                        u.name AS user_name,
                        u.email AS user_email
                    FROM sales_call_logs c
                    LEFT JOIN users u ON u.id::text = c.agent_id::text
                    WHERE c.lead_id::text = ANY($1::text[])
                    AND NOT EXISTS (
                        SELECT 1 FROM lead_activities la WHERE la.id::text = c.id::text
                    )
                ) act_item
                ORDER BY act_item.created_at DESC
                LIMIT 200
            `,
                [allLeadIds]
            )
        ]);

        res.json({
            lead,
            tasks: tasksRes.rows,
            activities: activitiesRes.rows
        });
    } catch (err: any) {
        console.error('Sales get lead CRM error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch lead CRM' });
    }
});

router.post('/leads/:id/share-observations-email', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id || '').trim();
        const agentId = String((req as any).user?.id || '');
        if (!leadId || !agentId) {
            return res.status(400).json({ success: false, error: 'Missing lead id' });
        }

        const owns = await agentOwnsLead(agentId, leadId);
        if (!owns) {
            return res.status(403).json({
                success: false,
                error: 'You can only email leads assigned to you.'
            });
        }

        const allLeadIds = await resolveAllLeadIds(leadId);
        const { rows: salesRows } = await query(
            `SELECT id, name, email, gbp_observation, ai_visibility_observation
             FROM sales_leads WHERE id::text = ANY($1::text[]) LIMIT 1`,
            [allLeadIds]
        );
        let businessName = String(salesRows[0]?.name || '').trim();
        let email = String(salesRows[0]?.email || '').trim().toLowerCase();
        let gbp = String(salesRows[0]?.gbp_observation || '').trim();
        let ai = String(salesRows[0]?.ai_visibility_observation || '').trim();
        const canonicalLeadId = String(salesRows[0]?.id || leadId);

        if (!email || (!gbp && !ai)) {
            const metaMap = await fetchLeadMetadataMap([leadId]);
            const meta = metaMap.get(leadId) || {};
            businessName = businessName || String(meta.businessName || '').trim();
            email = email || String(meta.email || '').trim().toLowerCase();
            gbp = gbp || String(meta.gbpObservation || '').trim();
            ai = ai || String(meta.aiVisibilityObservation || '').trim();
        }

        const bodyEmail = String((req.body as { email?: string } | undefined)?.email || '')
            .trim()
            .toLowerCase();
        if (bodyEmail) email = bodyEmail;

        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'A valid business email is required to send observations.'
            });
        }
        if (!gbp && !ai) {
            return res.status(400).json({
                success: false,
                error: 'Add GBP or AI visibility observations before emailing.'
            });
        }

        // Persist prompted / override email so the lead profile shows the real recipient
        if (bodyEmail || !String(salesRows[0]?.email || '').trim()) {
            try {
                await query(`UPDATE sales_leads SET email = $1, updated_at = NOW() WHERE id::text = $2`, [
                    email,
                    canonicalLeadId
                ]);
            } catch (emailSaveErr) {
                console.warn('Could not persist observation recipient email on lead:', emailSaveErr);
            }
        }

        const openToken = newLeadObservationEmailToken();
        const openTrackingUrl = leadEmailOpenTrackingUrl(openToken);
        const logoTrackingUrl = leadEmailLogoTrackingUrl(openToken);
        const requestFullAuditUrl = leadFullAuditRequestUrl(openToken);

        const result = await sendLeadObservationsEmail({
            to: email,
            businessName: businessName || 'there',
            gbpObservation: gbp || null,
            aiVisibilityObservation: ai || null,
            openTrackingUrl,
            logoTrackingUrl,
            requestFullAuditUrl
        });

        if (!result.sent) {
            return res.status(502).json({
                success: false,
                error:
                    (result as { error?: string }).error ||
                    'Email could not be delivered via SES. Check sender identity and try again.'
            });
        }

        // Only record "sent" after SES accepts — avoids false Sent badges when delivery fails
        await recordLeadObservationEmailSend({
            token: openToken,
            leadId: canonicalLeadId,
            toEmail: email,
            sentByUserId: agentId
        });

        try {
            const agentName = (req as any).user?.name || 'Sales Agent';
            await query(
                `INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note)
                 VALUES ($1, $2, $3, 'note', 'observation_email', $4)`,
                [
                    canonicalLeadId,
                    agentId,
                    agentName,
                    `Sent observation email (GBP / AI visibility) to ${email}`
                ]
            );
        } catch (actErr) {
            console.warn('Could not record observation email activity:', actErr);
        }

        return res.json({
            success: true,
            to: email,
            emailShareStatus: 'sent',
            observationEmailShareStatus: 'sent',
            messageId: (result as { messageId?: string | null }).messageId || null
        });
    } catch (err: any) {
        console.error('Sales share-observations-email error:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Failed to email observations'
        });
    }
});

router.get('/leads/:id/activities', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const allLeadIds = await resolveAllLeadIds(leadId);

        const [salesRes, subRes] = await Promise.all([
            query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] })),
            query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email FROM submissions WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] }))
        ]);

        const { rows } = await query(`
            SELECT 
                act_item.id,
                act_item.lead_id AS "leadId",
                act_item.activity_type AS "activityType",
                act_item.disposition,
                act_item.note,
                act_item.author_name AS "authorName",
                act_item.created_at AS "createdAt",
                act_item.user_name AS "userName",
                act_item.user_email AS "userEmail"
            FROM (
                SELECT 
                    a.id::text AS id,
                    a.lead_id,
                    COALESCE(NULLIF(a.activity_type, ''), 'note') AS activity_type,
                    COALESCE(NULLIF(a.disposition, ''), 'Update') AS disposition,
                    COALESCE(a.note, '') AS note,
                    COALESCE(NULLIF(a.author_name, ''), u.name, 'Sales Agent') AS author_name,
                    a.created_at,
                    u.name AS user_name,
                    u.email AS user_email
                FROM lead_activities a
                LEFT JOIN users u ON u.id::text = a.user_id::text
                WHERE a.lead_id::text = ANY($1::text[])

                UNION ALL

                SELECT 
                    c.id::text AS id,
                    c.lead_id::text AS lead_id,
                    'call_log' AS activity_type,
                    COALESCE(c.outcome, 'connected') AS disposition,
                    COALESCE(c.notes, '') AS note,
                    COALESCE(u.name, 'Sales Agent') AS author_name,
                    c.created_at,
                    u.name AS user_name,
                    u.email AS user_email
                FROM sales_call_logs c
                LEFT JOIN users u ON u.id::text = c.agent_id::text
                WHERE c.lead_id::text = ANY($1::text[])
                AND NOT EXISTS (
                    SELECT 1 FROM lead_activities la WHERE la.id::text = c.id::text
                )
            ) act_item
            ORDER BY act_item.created_at DESC
            LIMIT 200
        `, [allLeadIds]);

        res.json({ activities: rows });
    } catch (err: any) {
        console.error('Sales get lead activities error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch lead activities' });
    }
});


router.post('/leads/:id/crm/activities', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const rawLeadId = String(req.params.id);
        const agentId = (req as any).user?.id;
        const agentName = (req as any).user?.name || 'Sales Agent';
        const {
            disposition = 'connected',
            note = '',
            nextFollowUpAt = null
        } = req.body || {};

        const validDispositions = ['connected', 'voicemail', 'callback_requested', 'not_interested', 'converted', 'other'];
        const sanitizedDisposition = validDispositions.includes(disposition) ? disposition : 'connected';
        const validUserId = (agentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(agentId))) ? agentId : null;

        const allLeadIds = await resolveAllLeadIds(rawLeadId);

        const { rows } = await query(`
            INSERT INTO lead_activities (
                lead_id, user_id, author_name, activity_type, disposition, note, created_at
            ) VALUES ($1, $2, $3, 'call_log', $4, $5, NOW())
            RETURNING 
                id,
                lead_id AS "leadId",
                activity_type AS "activityType",
                disposition,
                note,
                author_name AS "authorName",
                created_at AS "createdAt"
        `, [
            rawLeadId,
            validUserId,
            agentName,
            sanitizedDisposition,
            String(note || '').trim()
        ]);

        const activity = rows[0];

        // Also insert into sales_call_logs if sales_leads record exists
        try {
            const { rows: slRows } = await query(
                `SELECT id FROM sales_leads WHERE id::text = ANY($1::text[]) LIMIT 1`,
                [allLeadIds]
            );
            if (slRows.length > 0 && validUserId) {
                await query(
                    `INSERT INTO sales_call_logs (id, lead_id, agent_id, outcome, notes, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())
                     ON CONFLICT (id) DO NOTHING`,
                    [activity.id, slRows[0].id, validUserId, sanitizedDisposition, String(note || '').trim()]
                ).catch(() => {});
            }
        } catch {}

        // Sync disposition to sales_leads status so Admin & Sales stay 100% in sync
        let mappedLeadStatus: string | null = null;
        if (sanitizedDisposition === 'converted') mappedLeadStatus = 'converted';
        else if (sanitizedDisposition === 'callback_requested') mappedLeadStatus = 'callback';
        else if (sanitizedDisposition === 'not_interested') mappedLeadStatus = 'not_interested';
        else if (sanitizedDisposition === 'connected' || sanitizedDisposition === 'voicemail') mappedLeadStatus = 'contacted';

        if (mappedLeadStatus) {
            try {
                await query(
                    `UPDATE sales_leads 
                     SET status = $1, 
                         updated_at = NOW()
                         ${mappedLeadStatus === 'converted' ? ', is_customer = TRUE, converted_at = NOW()' : ''}
                     WHERE id::text = ANY($2::text[])`,
                    [mappedLeadStatus, allLeadIds]
                );
            } catch (updateErr) {
                console.warn('Could not sync status to sales_leads:', updateErr);
            }
            try {
                await query(
                    `UPDATE submissions
                     SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{status}', to_jsonb($1::text), true),
                         updated_at = NOW()
                     WHERE id::text = ANY($2::text[])`,
                    [mappedLeadStatus, allLeadIds]
                );
            } catch {}
        }

        if (nextFollowUpAt) {
            try {
                await query(`
                    INSERT INTO lead_tasks (
                        lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
                    ) VALUES ($1, 'follow_up_call', $2, $3, 'medium', 'pending', $4, $5, 'self', $6)
                `, [
                    rawLeadId,
                    `Scheduled Follow-Up Call (${sanitizedDisposition})`,
                    String(note || '').trim(),
                    validUserId,
                    nextFollowUpAt,
                    agentName
                ]);
            } catch {}
        }

        res.status(201).json({ activity });
    } catch (err: any) {
        console.error('Sales log activity error:', err);
        res.status(500).json({ error: err.message || 'Failed to log activity' });
    }
});


router.get('/activities', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const disposition = String(req.query.disposition || '').trim();
        const rawLeadId = String(req.query.leadId || '').trim();

        const params: any[] = [];
        let leadConditionActivities = '';
        let leadConditionCalls = '';

        if (rawLeadId) {
            const allLeadIds = await resolveAllLeadIds(rawLeadId);
            params.push(allLeadIds);
            leadConditionActivities = `AND a.lead_id::text = ANY($${params.length}::text[])`;
            leadConditionCalls = `AND c.lead_id::text = ANY($${params.length}::text[])`;
        }

        let dispConditionActivities = '';
        let dispConditionCalls = '';
        if (disposition && disposition !== 'all') {
            params.push(disposition);
            dispConditionActivities = `AND a.disposition = $${params.length}`;
            dispConditionCalls = `AND c.outcome = $${params.length}`;
        }

        const { rows: activities } = await query(`
            SELECT DISTINCT
                act_item.id,
                act_item.lead_id AS "leadId",
                act_item.activity_type AS "activityType",
                act_item.disposition,
                act_item.note,
                act_item.author_name AS "authorName",
                act_item.created_at AS "createdAt",
                act_item.user_name AS "userName",
                act_item.user_email AS "userEmail"
            FROM (
                SELECT 
                    a.id::text AS id,
                    a.lead_id::text AS lead_id,
                    COALESCE(NULLIF(a.activity_type, ''), 'note') AS activity_type,
                    COALESCE(NULLIF(a.disposition, ''), 'Update') AS disposition,
                    COALESCE(a.note, '') AS note,
                    COALESCE(NULLIF(a.author_name, ''), u.name, 'Sales Agent') AS author_name,
                    a.created_at,
                    u.name AS user_name,
                    u.email AS user_email
                FROM lead_activities a
                LEFT JOIN users u ON u.id::text = a.user_id::text
                WHERE (a.activity_type IN ('call_log', 'call', 'note', 'status_change', 'status_update') OR a.disposition IS NOT NULL OR a.note IS NOT NULL)
                ${leadConditionActivities}
                ${dispConditionActivities}

                UNION ALL

                SELECT 
                    c.id::text AS id,
                    c.lead_id::text AS lead_id,
                    'call_log' AS activity_type,
                    COALESCE(c.outcome, 'connected') AS disposition,
                    COALESCE(c.notes, '') AS note,
                    COALESCE(u.name, 'Sales Agent') AS author_name,
                    c.created_at,
                    u.name AS user_name,
                    u.email AS user_email
                FROM sales_call_logs c
                LEFT JOIN users u ON u.id::text = c.agent_id::text
                WHERE (1=1)
                ${leadConditionCalls}
                ${dispConditionCalls}
                AND NOT EXISTS (
                    SELECT 1 FROM lead_activities la WHERE la.id::text = c.id::text
                )
            ) act_item
            ORDER BY act_item.created_at DESC
            LIMIT 100
        `, params);

        const leadIds = Array.from(new Set(activities.map((a: any) => a.leadId).filter(Boolean)));
        const leadMetaMap = await fetchLeadMetadataMap(leadIds);

        const enrichedActivities = activities.map((a: any) => {
            const meta = leadMetaMap.get(a.leadId) || {};
            return {
                ...a,
                leadBusinessName: meta.businessName || meta.name || 'Lead',
                leadPhone: meta.phone || '',
                leadEmail: meta.email || ''
            };
        });

        res.json({ activities: enrichedActivities });
    } catch (err: any) {
        console.error('Sales fetch activities error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch activities' });
    }
});

router.patch('/password', async (req: Request, res: Response) => {
    try {
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const userId = (req as any).user.id;
        const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });

        const ok = await comparePassword(currentPassword, rows[0].password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

        const passwordHash = await hashPassword(newPassword);
        await query(
            `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
            [passwordHash, userId]
        );
        res.json({ success: true, message: 'Password updated.', mustChangePassword: false });
    } catch (err: any) {
        console.error('Sales password error:', err);
        res.status(500).json({ error: err.message || 'Could not update password' });
    }
});

router.get('/leads', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const status = req.query.status ? String(req.query.status) : undefined;
        const industry = req.query.industry ? String(req.query.industry) : undefined;
        const opportunityLevel = req.query.opportunityLevel ? String(req.query.opportunityLevel) : undefined;
        const q = req.query.q ? String(req.query.q) : undefined;
        const isCustomer = req.query.isCustomer === 'true' ? true : req.query.isCustomer === 'false' ? false : undefined;
        const followUpToday =
            String(req.query.followUpToday || '') === '1' ||
            String(req.query.followUpToday || '').toLowerCase() === 'true';

        // 1. Leads from sales_leads table
        const salesLeadsList = await listAssignedLeads(agentId, {
            status,
            followUpToday,
            industry,
            opportunityLevel,
            isCustomer: isCustomer ?? false,
            q
        }).catch(() => []);

        // 2. Leads from lead_tasks assigned to this agent (only if not filtering for customers)
        let inboundLeads: any[] = [];
        if (!isCustomer && (!industry || industry === 'all')) {
            const { rows: taskLeadRows } = await query(`
                SELECT DISTINCT lead_id FROM lead_tasks WHERE assigned_to_user_id = $1
            `, [agentId]).catch(() => ({ rows: [] }));

            const taskLeadIds = taskLeadRows.map((r: any) => String(r.lead_id)).filter(Boolean);
            const metaMap = await fetchLeadMetadataMap(taskLeadIds);
            inboundLeads = Array.from(metaMap.values());
        }

        
        const leadMap = new Map<string, any>();

        for (const l of salesLeadsList) {
            leadMap.set(String(l.id), l);
        }

        for (const meta of inboundLeads) {
            if (!leadMap.has(meta.id)) {
                if (q && !meta.businessName.toLowerCase().includes(q.toLowerCase()) && !meta.phone.includes(q)) {
                    continue;
                }
                leadMap.set(meta.id, {
                    id: meta.id,
                    name: meta.businessName || 'Lead',
                    businessName: meta.businessName || 'Lead',
                    phone: meta.phone || '',
                    email: meta.email || '',
                    website: meta.website || '',
                    address: meta.address || '',
                    status: 'new',
                    source: meta.source || 'growth_audit',
                    industry: meta.industry || '',
                    gbpObservation: meta.gbpObservation || '',
                    aiVisibilityObservation: meta.aiVisibilityObservation || '',
                    leadOpportunity: meta.leadOpportunity || '',
                    opportunityLevel: meta.opportunityLevel || 'medium',
                    isCustomer: false,
                    nextFollowUpAt: null,
                    scoreTotal: meta.scoreTotal ?? null,
                    auditId: meta.auditId || null,
                    reportUrl: meta.reportUrl || null
                });
            }
        }

        const leads = Array.from(leadMap.values());
        res.json({ leads });
    } catch (err: any) {
        console.error('Sales list leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to load leads' });
    }
});

/** Manual Lead Creation */
router.post('/leads', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const {
            name,
            businessName,
            phone,
            email,
            notes,
            conclusion,
            status = 'new',
            source = 'manual_entry',
            industry = '',
            address = '',
            website = '',
            gbpObservation = '',
            aiVisibilityObservation = '',
            leadOpportunity = '',
            opportunityLevel = 'medium',
            assignedTo,
            nextFollowUpAt
        } = req.body || {};

        const leadName = String(businessName || name || '').trim();
        if (!leadName) {
            return res.status(400).json({ error: 'Business name is required.' });
        }

        const lead = await createSalesLead({
            name: leadName,
            phone: phone ? String(phone).trim() : '',
            email: email ? String(email).trim().toLowerCase() : '',
            notes: (notes || conclusion) ? String(notes || conclusion).trim() : '',
            status,
            source,
            industry,
            address,
            website,
            gbpObservation,
            aiVisibilityObservation,
            leadOpportunity,
            opportunityLevel,
            assignedTo: assignedTo || agentId,
            nextFollowUpAt,
            createdByAdmin: false
        });

        // Record creation activity
        try {
            const agentName = (req as any).user.name || 'Sales Agent';
            await query(`
                INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, note)
                VALUES ($1, $2, $3, 'note', $4)
            `, [lead.id, agentId, agentName, `Created lead manually in CRM: ${lead.name}`]);
        } catch {}

        res.status(201).json({ lead });
    } catch (err: any) {
        console.error('Sales create lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to create lead' });
    }
});

function normalizeSpreadsheetStatus(rawStatus: any): string {
    const s = String(rawStatus || '').toLowerCase().trim().replace(/[-_]/g, ' ');
    if (!s) return 'new';
    if (s.includes('convert') || s.includes('won') || s.includes('closed') || s.includes('customer') || s.includes('paid')) return 'converted';
    if (s.includes('not interested') || s.includes('lost') || s.includes('rejected') || s.includes('declined') || s.includes('dnc') || s.includes('cold') || s.includes('wrong number')) return 'not_interested';
    if (s.includes('callback') || s.includes('call back') || s.includes('follow') || s.includes('call later')) return 'callback';
    if (s.includes('interested') || s.includes('warm') || s.includes('hot') || s.includes('qualified') || s.includes('in progress') || s.includes('audit scheduled')) return 'interested';
    if (s.includes('contacted') || s.includes('called') || s.includes('spoke') || s.includes('reached') || s.includes('connected') || s.includes('attempted') || s.includes('voicemail') || s.includes('ringing') || s.includes('no answer') || s.includes('busy')) return 'contacted';
    return 'new';
}

/** Bulk Import Leads (Excel / CSV) */
router.post('/leads/bulk-import', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const { leads, fileName } = req.body || {};

        if (!Array.isArray(leads) || !leads.length) {
            return res.status(400).json({ error: 'No leads provided for import.' });
        }

        const resolvedFileName = String(fileName || '').trim() || 'Excel Import';
        const importBatchId = randomUUID();
        const importUploadedAt = new Date();

        const normalizedLeads = leads.map((item: any) => {
            let rawConclusion =
                item.notes ??
                item.conclusion ??
                item['My Conclusion'] ??
                item['My Conclusions'] ??
                item['My Concluision'] ??
                item['My Concluisions'] ??
                item['myConclusion'] ??
                item['myConclusions'] ??
                item['Conclusion'] ??
                item['Conclusions'] ??
                item['Concluision'] ??
                item['Concluisions'] ??
                item['Takeaways'] ??
                item['Takeaway'] ??
                item['Remarks'] ??
                item['Summary'] ??
                item['Notes'] ??
                '';

            if (!rawConclusion && typeof item === 'object' && item !== null) {
                for (const [k, v] of Object.entries(item)) {
                    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanKey.includes('concl') || cleanKey.includes('takeaway') || cleanKey.includes('verdict')) {
                        if (v && String(v).trim()) {
                            rawConclusion = String(v).trim();
                            break;
                        }
                    }
                }
            }

            const rawStatusVal = item.status || item.callingStatus || item.stage || item.disposition || item['Status'] || item['Calling Status'] || item['Lead Status'] || item['Disposition'] || 'new';

            return {
                name: String(item.businessName || item.name || item['Business name'] || item['Business Name'] || item['Company Name'] || '').trim(),
                phone: String(item.phone || item.businessPhone || item['Business Phone'] || item['Phone'] || '').trim(),
                email: String(item.email || item['Email'] || '').trim().toLowerCase(),
                industry: String(item.industry || item.category || item.sheetName || item['Industry'] || item['Business'] || '').trim(),
                address: String(item.address || item.townPostcode || item['Town postcode'] || item['Town Postcode'] || item['Address'] || '').trim(),
                website: String(item.website || item.websiteUrl || item['Website URL'] || item['Website'] || '').trim(),
                gbpObservation: String(item.gbpObservation || item['My Observation GBP'] || item['GBP Observation'] || '').trim(),
                aiVisibilityObservation: String(item.aiVisibilityObservation || item['My Observation AI Visibility'] || item['AI Visibility'] || '').trim(),
                leadOpportunity: String(item.leadOpportunity || item['Lead Opportunity'] || item['Opportunity'] || '').trim(),
                opportunityLevel: String(item.opportunityLevel || '').toLowerCase() || 'medium',
                status: normalizeSpreadsheetStatus(rawStatusVal),
                notes: String(rawConclusion).trim(),
                assignedTo: item.assignedTo || agentId,
                spreadsheetStatus: String(item.spreadsheetStatus || '').trim(),
                spreadsheetStatus1: String(item.spreadsheetStatus1 || '').trim(),
                spreadsheetStatus2: String(item.spreadsheetStatus2 || '').trim(),
                spreadsheetStatus3: String(item.spreadsheetStatus3 || '').trim()
            };
        });

        const result = await bulkImportSalesLeads(normalizedLeads, false, {
            fileName: resolvedFileName,
            importBatchId,
            importUploadedAt
        });

        res.json(result);
    } catch (err: any) {
        console.error('Sales bulk import error:', err);
        res.status(500).json({ error: err.message || 'Failed to import leads' });
    }
});

/** Convert Lead to Customer */
router.patch('/leads/:id/convert', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const agentId = (req as any).user.id;
        const agentName = (req as any).user.name || 'Sales Agent';
        const { note = '' } = req.body || {};

        const lead = await convertLeadToCustomer(leadId, agentId);

        // Record conversion activity
        try {
            await query(`
                INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note)
                VALUES ($1, $2, $3, 'call_log', 'converted', $4)
            `, [leadId, agentId, agentName, note ? `Converted lead to Customer. Note: ${note}` : 'Converted lead to Customer']);
        } catch {}

        res.json({ success: true, lead });
    } catch (err: any) {
        console.error('Sales convert lead error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to convert lead to customer' });
    }
});

/** Get Converted Customers */
router.get('/customers', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const q = req.query.q ? String(req.query.q) : undefined;
        const industry = req.query.industry ? String(req.query.industry) : undefined;

        const customers = await listAssignedLeads(agentId, {
            isCustomer: true,
            industry,
            q
        });

        res.json({ customers });
    } catch (err: any) {
        console.error('Sales get customers error:', err);
        res.status(500).json({ error: err.message || 'Failed to load customers' });
    }
});

/** Get Distinct Industries / Categories with counts for this sales agent */
router.get('/industries', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const { rows } = await query(`
            SELECT 
                COALESCE(NULLIF(TRIM(industry), ''), 'General') AS name,
                COUNT(*)::int AS count
            FROM sales_leads
            WHERE (assigned_to = $1 OR id::text IN (SELECT lead_id FROM lead_tasks WHERE assigned_to_user_id = $1))
              AND is_customer = FALSE
            GROUP BY COALESCE(NULLIF(TRIM(industry), ''), 'General')
            ORDER BY count DESC
        `, [agentId]);
        res.json({ industries: rows });
    } catch (err: any) {
        console.error('Sales get industries error:', err);
        res.status(500).json({ error: err.message || 'Failed to load industries' });
    }
});

router.post('/full-audits/:auditId/share-email', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const auditId = String(req.params.auditId || '').trim();
        if (!auditId) {
            return res.status(400).json({ success: false, error: 'Missing audit id' });
        }

        const agentId = String((req as any).user?.id || '');
        const allowed = await agentCanShareAudit(agentId, auditId);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                error: 'You can only email audit reports for leads assigned to you.'
            });
        }

        const detail = await proxyZappSitesOps('GET', `/api/ops/audits/${encodeURIComponent(auditId)}`);
        if (detail.status >= 400 || !detail.json || typeof detail.json !== 'object') {
            return res.status(detail.status || 502).json(
                detail.json && typeof detail.json === 'object'
                    ? detail.json
                    : { success: false, error: 'Failed to load audit' }
            );
        }
        const body = detail.json as { success?: boolean; data?: Record<string, unknown>; error?: string };
        const audit = (body.data || {}) as Record<string, unknown>;
        if (!audit.id && !body.success) {
            return res.status(detail.status || 404).json({
                success: false,
                error: body.error || 'Audit not found'
            });
        }

        const business =
            audit.business && typeof audit.business === 'object'
                ? (audit.business as Record<string, unknown>)
                : {};
        const bodyEmail = String((req.body as { email?: string } | undefined)?.email || '')
            .trim()
            .toLowerCase();
        const email = (bodyEmail || String(business.email || audit.email || '').trim()).toLowerCase();
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'This audit has no company email to share with. Enter an email and try again.'
            });
        }

        const published = Boolean(audit.published ?? business.published);
        if (!published) {
            return res.status(400).json({
                success: false,
                error: 'Publish the audit before emailing the PDF report.'
            });
        }

        const businessName = String(
            business.businessName || audit.businessName || 'there'
        ).trim();
        const website = String(business.website || audit.website || '').trim();
        const scoreObj =
            audit.score && typeof audit.score === 'object'
                ? (audit.score as { total?: number })
                : null;
        const scoreRaw =
            (audit.totalScore as number | null | undefined) ?? scoreObj?.total ?? null;
        const score =
            scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
        const reportUrl = reportShareUrl(auditId);

        const pdfResult = await proxyZappSitesPdf(auditId);
        if (!pdfResult.buffer || pdfResult.status !== 200) {
            const errBody =
                pdfResult.json && typeof pdfResult.json === 'object'
                    ? (pdfResult.json as { error?: string })
                    : null;
            return res.status(pdfResult.status || 502).json({
                success: false,
                error: errBody?.error || 'Could not load the audit PDF to attach.'
            });
        }

        const safeName =
            businessName
                .replace(/[^a-z0-9]+/gi, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40)
                .toLowerCase() || 'audit';

        const openToken = newAuditEmailOpenToken();
        const openTrackingUrl = auditEmailOpenTrackingUrl(openToken);
        const logoTrackingUrl = auditEmailLogoTrackingUrl(openToken);
        const clickTrackingUrl = reportUrl
            ? auditEmailClickTrackingUrl(openToken, reportUrl)
            : null;

        // Record before send so an instant open/click can update the row
        await recordAuditEmailSend({
            token: openToken,
            auditId,
            toEmail: email,
            sentByUserId: agentId
        });

        const result = await sendFullAuditShareEmail({
            to: email,
            businessName,
            website,
            score,
            reportUrl,
            pdfBuffer: pdfResult.buffer,
            pdfFilename: `zappsites-audit-${safeName}.pdf`,
            openTrackingUrl,
            logoTrackingUrl,
            clickTrackingUrl
        });

        if (!result.sent) {
            await query(`DELETE FROM audit_email_sends WHERE token = $1`, [openToken]).catch(() => {});
            return res.status(502).json({
                success: false,
                error: 'Email could not be delivered via SES. Check sender identity and try again.'
            });
        }

        try {
            const agentName = (req as any).user?.name || 'Sales Agent';
            const { rows: matchedLeads } = await query(
                `SELECT id FROM sales_leads WHERE audit_id = $1 OR id::text = $1 LIMIT 1`,
                [auditId]
            );
            const leadIdToRecord = matchedLeads[0]?.id ? String(matchedLeads[0].id) : auditId;
            await query(
                `INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, disposition, note)
                 VALUES ($1, $2, $3, 'note', 'audit_email', $4)`,
                [
                    leadIdToRecord,
                    agentId,
                    agentName,
                    `Sent full audit PDF report to ${email}`
                ]
            );
        } catch (actErr) {
            console.warn('Could not record audit share email activity:', actErr);
        }

        return res.json({
            success: true,
            to: email,
            attached: result.attached,
            reportUrl,
            emailShareStatus: 'sent'
        });
    } catch (err: any) {
        console.error('Sales full-audit share-email error:', err);
        res.status(502).json({
            success: false,
            error: err.message || 'Failed to email audit report'
        });
    }
});

router.get('/leads/:id', async (req: Request, res: Response) => {
    try {
        const detail = await getAssignedLead(String(req.params.id), (req as any).user.id);
        if (!detail) {
            
            const metaMap = await fetchLeadMetadataMap([String(req.params.id)]);
            const lead = metaMap.get(String(req.params.id));
            if (lead) {
                return res.json({ lead, calls: [] });
            }
            return res.status(404).json({ error: 'Lead not found' });
        }
        res.json(detail);
    } catch (err: any) {
        console.error('Sales get lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to load lead' });
    }
});

router.post('/leads/:id/calls', async (req: Request, res: Response) => {
    try {
        const outcome = String(req.body?.outcome || '').trim() as CallOutcome;
        if (!CALL_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ error: 'Valid call outcome is required.' });
        }
        const status = req.body?.status ? (String(req.body.status) as LeadStatus) : null;
        const nextFollowUpAt =
            req.body?.nextFollowUpAt != null && String(req.body.nextFollowUpAt).trim()
                ? String(req.body.nextFollowUpAt).trim()
                : req.body?.nextFollowUpAt === null || req.body?.nextFollowUpAt === ''
                  ? null
                  : undefined;

        const result = await logCall({
            leadId: String(req.params.id),
            agentId: (req as any).user.id,
            outcome,
            notes: req.body?.notes,
            status,
            nextFollowUpAt
        });
        res.status(201).json(result);
    } catch (err: any) {
        console.error('Sales log call error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to log call' });
    }
});

router.patch('/leads/:id', async (req: Request, res: Response) => {
    try {
        const patch: { status?: string; notes?: string; nextFollowUpAt?: string | null } = {};
        if (req.body?.status != null) patch.status = String(req.body.status);
        if (req.body?.notes != null) patch.notes = String(req.body.notes);
        if (req.body?.nextFollowUpAt !== undefined) {
            patch.nextFollowUpAt =
                req.body.nextFollowUpAt == null || req.body.nextFollowUpAt === ''
                    ? null
                    : String(req.body.nextFollowUpAt);
        }

        const lead = await updateAssignedLead(String(req.params.id), (req as any).user.id, patch);
        res.json({ lead });
    } catch (err: any) {
        console.error('Sales update lead error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to update lead' });
    }
});

export default router;

