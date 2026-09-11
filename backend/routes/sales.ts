import { Router, Request, Response } from 'express';
import { requireSalesAgent } from '../middleware/auth';
import { comparePassword, hashPassword } from '../lib/authTokens';
import { query } from '../lib/db';
import {
    CALL_OUTCOMES,
    getAssignedLead,
    listAssignedLeads,
    logCall,
    updateAssignedLead,
    type CallOutcome,
    type LeadStatus
} from '../lib/sales';

const router = Router();

router.use(requireSalesAgent);

function zappSitesOrigin() {
    const fromEnv = String(process.env.ZAPP_SITES_ORIGIN || '').trim().replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    const stage = (process.env.STAGE || 'dev').toLowerCase();
    return stage === 'prod' ? 'https://www.zappsites.com' : 'https://staging.zappsites.com';
}

let crmTablesChecked = false;
async function ensureCrmTables() {
    if (crmTablesChecked) return;
    try {
        await query(`
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
        crmTablesChecked = true;
    } catch (err) {
        console.warn('ensureCrmTables warning:', err);
    }
}

/** Helper to extract lead details from submissions + audits or sales_leads */
async function fetchLeadMetadataMap(leadIds: string[]) {
    if (!leadIds.length) return new Map<string, any>();
    const map = new Map<string, any>();
    const origin = zappSitesOrigin();

    // 1. Try growth audit submissions
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
                reportUrl: sharePath ? `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}` : null,
                source: String(payload.source || 'growth_audit').trim()
            });
        }
    } catch {}

    // 2. Try sales_leads for any remaining
    const missing = leadIds.filter((id) => !map.has(id));
    if (missing.length) {
        try {
            const { rows: salesRows } = await query(
                `SELECT * FROM sales_leads WHERE id::text = ANY($1::text[])`,
                [missing]
            );
            for (const row of salesRows) {
                map.set(String(row.id), {
                    id: String(row.id),
                    businessName: row.name || 'Lead',
                    phone: row.phone || '',
                    email: row.email || '',
                    website: '',
                    address: '',
                    city: '',
                    scoreTotal: null,
                    reportUrl: null,
                    source: row.source || 'sales_lead'
                });
            }
        } catch {}
    }

    return map;
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

/** Sales Agent summary metrics for Dashboard header */
router.get('/summary', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;

        const [tasksPendingRes, tasksDueTodayRes, callsTodayRes, tasksCompletedRes, leadsCountRes] = await Promise.all([
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status IN ('pending', 'in_progress')`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status IN ('pending', 'in_progress') AND due_date IS NOT NULL AND due_date::date <= CURRENT_DATE`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_activities WHERE user_id = $1 AND activity_type = 'call_log' AND created_at::date = CURRENT_DATE`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM lead_tasks WHERE assigned_to_user_id = $1 AND status = 'completed'`, [agentId]),
            query(`SELECT COUNT(*)::int AS count FROM sales_leads WHERE assigned_to = $1`, [agentId]).catch(() => ({ rows: [{ count: 0 }] }))
        ]);

        res.json({
            pendingTasksCount: tasksPendingRes.rows[0]?.count || 0,
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

/** Get CRM tasks assigned to this sales agent */
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
        const where: string[] = ['t.assigned_to_user_id = $1'];

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

        const enrichedTasks = tasks.map((t) => {
            const meta = leadMetaMap.get(t.leadId) || {};
            return {
                ...t,
                leadBusinessName: meta.businessName || 'Lead',
                leadPhone: meta.phone || '',
                leadEmail: meta.email || '',
                leadWebsite: meta.website || '',
                leadAddress: meta.address || '',
                leadCity: meta.city || '',
                leadScoreTotal: meta.scoreTotal ?? null,
                leadReportUrl: meta.reportUrl || null,
                leadSource: meta.source || ''
            };
        });

        res.json({ tasks: enrichedTasks });
    } catch (err: any) {
        console.error('Sales fetch tasks error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch tasks' });
    }
});

/** Create a new task (sales agent creating follow-up task) */
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
            due_date = null
        } = req.body || {};

        if (!lead_id) {
            return res.status(400).json({ error: 'lead_id is required.' });
        }
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Task title is required.' });
        }

        const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom'];
        const sanitizedTaskType = validTaskTypes.includes(task_type) ? task_type : 'follow_up_call';

        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const sanitizedPriority = validPriorities.includes(priority) ? priority : 'medium';

        const { rows } = await query(`
            INSERT INTO lead_tasks (
                lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
            ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'self', $8)
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
                created_by_role AS "createdByRole",
                created_by_name AS "createdByName"
        `, [
            lead_id,
            sanitizedTaskType,
            String(title).trim(),
            String(notes || '').trim(),
            sanitizedPriority,
            agentId,
            due_date || null,
            agentName
        ]);

        const task = rows[0];

        res.status(201).json({ task });
    } catch (err: any) {
        console.error('Sales create task error:', err);
        res.status(500).json({ error: err.message || 'Failed to create task' });
    }
});

/** Update task status / notes */
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

        // If status changed, record activity log in lead_activities so both admin and sales see it in real-time
        if (status) {
            try {
                const agentName = (req as any).user.name || 'Sales Agent';
                const agentId = (req as any).user.id;
                await query(`
                    INSERT INTO lead_activities (lead_id, user_id, author_name, activity_type, note)
                    VALUES ($1, $2, $3, 'task_event', $4)
                `, [task.leadId, agentId, agentName, `Task "${task.title}" marked as ${status}`]);
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

/** Delete task (sales agent deleting their task) */
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

/** Unified Lead CRM detail for Sales Agent */
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
            reportUrl: null,
            source: ''
        };

        const [tasksRes, activitiesRes] = await Promise.all([
            query(`
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
                    COALESCE(created_by_role, 'admin') AS "createdByRole",
                    COALESCE(created_by_name, 'Admin') AS "createdByName"
                FROM lead_tasks
                WHERE lead_id = $1
                ORDER BY 
                    CASE WHEN status = 'pending' THEN 1 WHEN status = 'in_progress' THEN 2 ELSE 3 END,
                    due_date ASC NULLS LAST,
                    created_at DESC
            `, [leadId]),
            query(`
                SELECT 
                    a.id,
                    a.lead_id AS "leadId",
                    a.activity_type AS "activityType",
                    a.disposition,
                    a.note,
                    a.author_name AS "authorName",
                    a.created_at AS "createdAt",
                    u.name AS "userName",
                    u.email AS "userEmail"
                FROM lead_activities a
                LEFT JOIN users u ON u.id = a.user_id
                WHERE a.lead_id = $1 
                  AND (a.activity_type = 'call_log' OR (a.activity_type = 'task_event' AND a.note NOT LIKE 'Created task:%'))
                ORDER BY a.created_at DESC
                LIMIT 200
            `, [leadId])
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

/** Log an activity / call note for a lead from Sales Portal */
router.post('/leads/:id/crm/activities', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const agentId = (req as any).user.id;
        const agentName = (req as any).user.name || 'Sales Agent';
        const {
            disposition = 'connected',
            note = '',
            nextFollowUpAt = null
        } = req.body || {};

        const validDispositions = ['connected', 'voicemail', 'callback_requested', 'not_interested', 'converted', 'other'];
        const sanitizedDisposition = validDispositions.includes(disposition) ? disposition : 'connected';

        const { rows } = await query(`
            INSERT INTO lead_activities (
                lead_id, user_id, author_name, activity_type, disposition, note
            ) VALUES ($1, $2, $3, 'call_log', $4, $5)
            RETURNING 
                id,
                lead_id AS "leadId",
                activity_type AS "activityType",
                disposition,
                note,
                author_name AS "authorName",
                created_at AS "createdAt"
        `, [
            leadId,
            agentId,
            agentName,
            sanitizedDisposition,
            String(note || '').trim()
        ]);

        const activity = rows[0];

        // If next follow-up is provided, auto-create follow-up task as self-created
        if (nextFollowUpAt) {
            try {
                await query(`
                    INSERT INTO lead_tasks (
                        lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
                    ) VALUES ($1, 'follow_up_call', $2, $3, 'medium', 'pending', $4, $5, 'self', $6)
                `, [
                    leadId,
                    `Scheduled Follow-Up Call (${sanitizedDisposition})`,
                    String(note || '').trim(),
                    agentId,
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

/** Get all CRM activity & call logs for the logged-in agent */
router.get('/activities', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const agentId = (req as any).user.id;
        const disposition = String(req.query.disposition || '').trim();
        const leadId = String(req.query.leadId || '').trim();

        const params: any[] = [];
        const where: string[] = [
            "(a.activity_type = 'call_log' OR (a.activity_type = 'task_event' AND a.note NOT LIKE 'Created task:%'))"
        ];

        if (leadId) {
            params.push(leadId);
            where.push(`a.lead_id = $${params.length}`);
        } else {
            params.push(agentId);
            where.push(`(a.user_id = $${params.length} OR a.user_id IS NULL OR a.activity_type = 'task_event')`);
        }

        if (disposition && disposition !== 'all') {
            params.push(disposition);
            where.push(`a.disposition = $${params.length}`);
        }

        const { rows: activities } = await query(`
            SELECT 
                a.id,
                a.lead_id AS "leadId",
                a.activity_type AS "activityType",
                a.disposition,
                a.note,
                a.author_name AS "authorName",
                a.created_at AS "createdAt",
                u.name AS "userName",
                u.email AS "userEmail"
            FROM lead_activities a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE ${where.join(' AND ')}
            ORDER BY a.created_at DESC
            LIMIT 100
        `, params);

        const leadIds = Array.from(new Set(activities.map((a) => a.leadId)));
        const leadMetaMap = await fetchLeadMetadataMap(leadIds);

        const enrichedActivities = activities.map((a) => {
            const meta = leadMetaMap.get(a.leadId);
            return {
                ...a,
                leadBusinessName: meta?.businessName || 'Lead',
                leadPhone: meta?.phone || '',
                leadEmail: meta?.email || ''
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
        const followUpToday =
            String(req.query.followUpToday || '') === '1' ||
            String(req.query.followUpToday || '').toLowerCase() === 'true';

        // 1. Leads from sales_leads table
        const salesLeadsList = await listAssignedLeads(agentId, { status, followUpToday }).catch(() => []);

        // 2. Leads from lead_tasks assigned to this agent
        const { rows: taskLeadRows } = await query(`
            SELECT DISTINCT lead_id FROM lead_tasks WHERE assigned_to_user_id = $1
        `, [agentId]).catch(() => ({ rows: [] }));

        const taskLeadIds = taskLeadRows.map((r: any) => String(r.lead_id)).filter(Boolean);
        const metaMap = await fetchLeadMetadataMap(taskLeadIds);

        // Combine into unified map
        const leadMap = new Map<string, any>();

        for (const l of salesLeadsList) {
            leadMap.set(String(l.id), {
                id: String(l.id),
                name: l.name || 'Lead',
                phone: l.phone || '',
                email: l.email || '',
                status: l.status || 'new',
                source: l.source || 'sales_lead',
                nextFollowUpAt: l.nextFollowUpAt || null
            });
        }

        for (const [leadId, meta] of metaMap.entries()) {
            if (!leadMap.has(leadId)) {
                leadMap.set(leadId, {
                    id: leadId,
                    name: meta.businessName || 'Lead',
                    phone: meta.phone || '',
                    email: meta.email || '',
                    status: 'new',
                    source: meta.source || 'growth_audit',
                    nextFollowUpAt: null
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

router.get('/leads/:id', async (req: Request, res: Response) => {
    try {
        const detail = await getAssignedLead(String(req.params.id), (req as any).user.id);
        if (!detail) {
            // Fallback to unified lead CRM lookup
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
