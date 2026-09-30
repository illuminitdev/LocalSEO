import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../lib/db';
import { requireAdmin } from './adminAuth';
import { createSalesLead, bulkImportSalesLeads, convertLeadToCustomer, ensureCrmTables, resolveAllLeadIds } from '../sales-agent/sales';
import { fetchAdminLeadMetadataMap } from './leadHelpers';
import { fetchLatestAuditEmailShareMap, shareInfoForAudit } from '../lib/auditEmailSends';
import {
    fetchLatestLeadObservationEmailShareMap,
    shareInfoForLeadObservation
} from '../lib/leadObservationEmailSends';
import { reportShareUrl } from '../lib/zappSitesAuditProxy';

const router = Router();

/** Get list of sales agents / telecallers available for assignment */
router.get('/crm/sales-agents', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { rows } = await query(`
            SELECT id, name, email, avatar_url, platform_role, created_at
            FROM users
            WHERE platform_role = 'sales_agent'
            ORDER BY name ASC, email ASC
        `);
        res.json({ agents: rows });
    } catch (err: any) {
        console.error('Fetch sales agents error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch sales agents' });
    }
});

router.get('/crm/tasks', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.query.leadId || '').trim();
        const assignedTo = String(req.query.assignedTo || '').trim();
        const status = String(req.query.status || '').trim();
        const priority = String(req.query.priority || '').trim();
        const taskType = String(req.query.taskType || '').trim();
        const createdBy = String(req.query.createdBy || '').trim();

        const params: any[] = [];
        const where: string[] = ['1=1'];

        if (leadId) {
            params.push(leadId);
            where.push(`t.lead_id = $${params.length}`);
        }
        if (assignedTo) {
            params.push(assignedTo);
            where.push(`t.assigned_to_user_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`t.status = $${params.length}`);
        }
        if (priority) {
            params.push(priority);
            where.push(`t.priority = $${params.length}`);
        }
        if (taskType) {
            params.push(taskType);
            where.push(`t.task_type = $${params.length}`);
        }
        
        where.push(`(t.created_by_role = 'admin' OR t.created_by_role IS NULL)`);

        const { rows } = await query(`
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
                COALESCE(t.created_by_name, 'Admin') AS "createdByName",
                u.name AS "assignedToName",
                u.email AS "assignedToEmail",
                u.avatar_url AS "assignedToAvatarUrl"
            FROM lead_tasks t
            LEFT JOIN users u ON u.id = t.assigned_to_user_id
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

        const leadIds = Array.from(new Set(rows.map((t: any) => t.leadId).filter(Boolean))) as string[];
        const leadMetaMap = await fetchAdminLeadMetadataMap(leadIds);
        const auditIds = Array.from(
            new Set(
                Array.from(leadMetaMap.values())
                    .map((m: any) => String(m.auditId || '').trim())
                    .filter(Boolean)
            )
        );
        const [shareMap, obsMap] = await Promise.all([
            fetchLatestAuditEmailShareMap(auditIds),
            fetchLatestLeadObservationEmailShareMap(leadIds)
        ]);

        const enrichedTasks = rows.map((t: any) => {
            const meta = leadMetaMap.get(t.leadId) || {};
            const share = shareInfoForAudit(shareMap, meta.auditId);
            const obs = shareInfoForLeadObservation(obsMap, t.leadId);
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
                leadSource: meta.source || '',
                leadIndustry: meta.industry || '',
                leadAuditId: meta.auditId || null,
                leadStatus: meta.status || (meta.isCustomer ? 'converted' : 'new'),
                emailShareStatus: share.emailShareStatus,
                emailShareSentAt: share.emailShareSentAt,
                emailShareOpenedAt: share.emailShareOpenedAt,
                observationEmailShareStatus: obs.observationEmailShareStatus,
                observationEmailSentAt: obs.observationEmailSentAt,
                observationEmailOpenedAt: obs.observationEmailOpenedAt
            };
        });

        res.json({ tasks: enrichedTasks });
    } catch (err: any) {
        console.error('Fetch CRM tasks error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch tasks' });
    }
});


router.post('/crm/tasks', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const {
            lead_id,
            task_type = 'follow_up_call',
            title,
            notes = '',
            priority = 'medium',
            assigned_to_user_id = null,
            due_date = null
        } = req.body || {};

        if (!lead_id) {
            return res.status(400).json({ error: 'lead_id is required.' });
        }
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Task title is required.' });
        }

        const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom', 'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'];
        const TASK_TYPE_MAP: Record<string, string> = {
            call: 'follow_up_call',
            follow_up: 'follow_up_call',
            audit_review: 'prepare_audit',
            proposal: 'send_proposal',
            meeting: 'custom',
            email: 'custom',
            other: 'custom'
        };
        const sanitizedTaskType = validTaskTypes.includes(task_type)
            ? (TASK_TYPE_MAP[task_type] || task_type)
            : 'custom';

        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const sanitizedPriority = validPriorities.includes(priority) ? priority : 'medium';

        const { rows } = await query(`
            INSERT INTO lead_tasks (
                lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
            ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'admin', 'Admin')
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
            assigned_to_user_id || null,
            due_date || null
        ]);

        const task = rows[0];

        if (assigned_to_user_id) {
            try {
                let agentName = 'Sales Agent';
                const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1`, [assigned_to_user_id]);
                if (uRows[0]?.name) agentName = uRows[0].name;

                await query(`
                    UPDATE sales_leads 
                    SET assigned_to = $1, updated_at = NOW() 
                    WHERE id::text = $2 OR email = (SELECT email FROM submissions WHERE id::text = $2 LIMIT 1)
                `, [assigned_to_user_id, lead_id]).catch(() => {});

                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                    VALUES ($1, 'Admin', 'task_event', $2)
                `, [lead_id, `Admin created task "${task.title}" assigned to ${agentName}${task.notes ? ` — Note: "${task.notes}"` : ''}`]).catch(() => {});
            } catch {}
        } else {
            try {
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                    VALUES ($1, 'Admin', 'task_event', $2)
                `, [lead_id, `Admin created task: "${task.title}"${task.notes ? ` — Note: "${task.notes}"` : ''}`]).catch(() => {});
            } catch {}
        }

        res.status(201).json({ task });
    } catch (err: any) {
        console.error('Create CRM task error:', err);
        res.status(500).json({ error: err.message || 'Failed to create task' });
    }
});


router.patch('/crm/tasks/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const taskId = req.params.id;
        const { status, priority, notes, assigned_to_user_id, due_date, title, task_type } = req.body || {};

        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [taskId];

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
        if (task_type !== undefined) {
            const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom', 'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'];
            const TASK_TYPE_MAP: Record<string, string> = {
                call: 'follow_up_call',
                follow_up: 'follow_up_call',
                audit_review: 'prepare_audit',
                proposal: 'send_proposal',
                meeting: 'custom',
                email: 'custom',
                other: 'custom'
            };
            const sanitized = validTaskTypes.includes(task_type)
                ? (TASK_TYPE_MAP[task_type] || task_type)
                : 'custom';
            params.push(sanitized);
            updates.push(`task_type = $${params.length}`);
        }
        if (assigned_to_user_id !== undefined) {
            params.push(assigned_to_user_id || null);
            updates.push(`assigned_to_user_id = $${params.length}`);
        }
        if (due_date !== undefined) {
            params.push(due_date || null);
            updates.push(`due_date = $${params.length}`);
        }

        const { rows } = await query(`
            UPDATE lead_tasks
            SET ${updates.join(', ')}
            WHERE id = $1
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
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = rows[0];

        // 1. If assigned_to_user_id was updated, synchronize sales_leads assignment and log activity
        if (assigned_to_user_id !== undefined) {
            try {
                let agentName = 'Unassigned';
                if (assigned_to_user_id) {
                    const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1`, [assigned_to_user_id]);
                    if (uRows[0]?.name) agentName = uRows[0].name;
                }
                await query(`
                    UPDATE sales_leads 
                    SET assigned_to = $1, updated_at = NOW() 
                    WHERE id::text = $2 OR email = (SELECT email FROM submissions WHERE id::text = $2 LIMIT 1)
                `, [assigned_to_user_id || null, task.leadId]).catch(() => {});

                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                    VALUES ($1, 'Admin', 'task_event', $2)
                `, [task.leadId, assigned_to_user_id ? `Admin assigned task "${task.title}" to ${agentName}` : `Admin unassigned task "${task.title}"`]).catch(() => {});
            } catch {}
        }

        // 2. Record task event activity for task edits without corrupting lead lifecycle status
        if (status !== undefined || (notes !== undefined && String(notes).trim())) {
            try {
                const author = (req as any).user?.name || 'Admin';
                const statusStr = status ? String(status).replace('_', ' ').toUpperCase() : (task.status ? String(task.status).replace('_', ' ').toUpperCase() : 'UPDATED');
                const cleanNote = notes && String(notes).trim() ? String(notes).trim() : `Task "${task.title}" status changed to ${statusStr}`;
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, $2, 'task_event', $3, $4, NOW())
                `, [task.leadId, author, status || task.status || 'in_progress', cleanNote]).catch(() => {});
            } catch {}
        }

        res.json({ task });
    } catch (err: any) {
        console.error('Update CRM task error:', err);
        res.status(500).json({ error: err.message || 'Failed to update task' });
    }
});


router.delete('/crm/tasks/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const taskId = req.params.id;

        const { rows: taskRows } = await query(
            `SELECT title, lead_id FROM lead_tasks WHERE id = $1`,
            [taskId]
        );

        if (taskRows.length > 0) {
            const task = taskRows[0];
            try {
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, 'Admin', 'task_event', 'cancelled', $2, NOW())
                `, [task.lead_id, `Task "${task.title}" was deleted by Admin`]);
            } catch (actErr) {
                console.warn('Failed to record task deletion activity:', actErr);
            }
        }

        await query(`DELETE FROM lead_tasks WHERE id = $1`, [taskId]);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete CRM task error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete task' });
    }
});


router.get('/crm/leads/:leadId/crm', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.leadId);
        const metaMap = await fetchAdminLeadMetadataMap([leadId]);
        const meta = metaMap.get(leadId) || {};
        const lead: Record<string, any> = {
            id: leadId,
            businessName: meta.businessName || 'Lead',
            phone: meta.phone || '',
            email: meta.email || '',
            website: meta.website || '',
            address: meta.address || '',
            city: meta.city || '',
            industry: meta.industry || '',
            scoreTotal: meta.scoreTotal ?? null,
            auditId: meta.auditId || null,
            reportUrl: meta.reportUrl || null,
            source: meta.source || '',
            status: meta.status || 'new',
            notes: meta.notes || null,
            gbpObservation: meta.gbpObservation || null,
            aiVisibilityObservation: meta.aiVisibilityObservation || null,
            leadOpportunity: meta.leadOpportunity || null,
            opportunityLevel: meta.opportunityLevel || null,
            isCustomer: Boolean(meta.isCustomer),
            convertedAt: meta.convertedAt || null,
            assignedTo: meta.assignedTo || null,
            assignedAgentName: meta.assignedAgentName || null,
            spreadsheetStatus: meta.spreadsheetStatus || '',
            spreadsheetStatus1: meta.spreadsheetStatus1 || '',
            spreadsheetStatus2: meta.spreadsheetStatus2 || '',
            spreadsheetStatus3: meta.spreadsheetStatus3 || '',
            updatedAt: meta.updatedAt || null
        };

        const shareMap = await fetchLatestAuditEmailShareMap(
            lead.auditId ? [String(lead.auditId)] : []
        );
        Object.assign(lead, shareInfoForAudit(shareMap, lead.auditId));

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
                `SELECT id, name, email, phone, industry, status, notes,
                        gbp_observation, ai_visibility_observation, lead_opportunity, opportunity_level,
                        is_customer, converted_at, assigned_to, spreadsheet_status,
                        spreadsheet_status_1, spreadsheet_status_2, spreadsheet_status_3,
                        website, address, updated_at, created_at, audit_id
                 FROM sales_leads WHERE id::text = ANY($1::text[])`,
                [allLeadIds]
            ).catch(() => ({ rows: [] as any[] })),
            query(
                `SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name,
                        payload->>'email' AS email, payload
                 FROM submissions WHERE id::text = ANY($1::text[])`,
                [allLeadIds]
            ).catch(() => ({ rows: [] as any[] }))
        ]);

        if (salesRes.rows[0]) {
            const s = salesRes.rows[0];
            lead.businessName = s.name || lead.businessName;
            lead.phone = s.phone || lead.phone;
            lead.email = s.email || lead.email;
            lead.website = s.website || lead.website;
            lead.address = s.address || lead.address;
            lead.industry = s.industry || lead.industry;
            lead.status = s.status || lead.status;
            lead.notes = s.notes || lead.notes;
            lead.gbpObservation = s.gbp_observation || lead.gbpObservation;
            lead.aiVisibilityObservation = s.ai_visibility_observation || lead.aiVisibilityObservation;
            lead.leadOpportunity = s.lead_opportunity || lead.leadOpportunity;
            lead.opportunityLevel = s.opportunity_level || lead.opportunityLevel;
            lead.isCustomer = Boolean(s.is_customer);
            lead.convertedAt = s.converted_at || lead.convertedAt;
            lead.assignedTo = s.assigned_to || lead.assignedTo;
            lead.spreadsheetStatus = s.spreadsheet_status || lead.spreadsheetStatus;
            lead.spreadsheetStatus1 = s.spreadsheet_status_1 || lead.spreadsheetStatus1;
            lead.spreadsheetStatus2 = s.spreadsheet_status_2 || lead.spreadsheetStatus2;
            lead.spreadsheetStatus3 = s.spreadsheet_status_3 || lead.spreadsheetStatus3;
            lead.updatedAt = s.updated_at || s.created_at || lead.updatedAt;
            if (s.audit_id) {
                lead.auditId = String(s.audit_id);
                lead.reportUrl = reportShareUrl(String(s.audit_id));
                const auditShareMap = await fetchLatestAuditEmailShareMap([String(s.audit_id)]);
                Object.assign(lead, shareInfoForAudit(auditShareMap, String(s.audit_id)));
            }
        } else if (subRes.rows[0]) {
            const payload =
                subRes.rows[0].payload && typeof subRes.rows[0].payload === 'object'
                    ? subRes.rows[0].payload
                    : {};
            lead.businessName =
                subRes.rows[0].bname || subRes.rows[0].name || lead.businessName;
            lead.email = subRes.rows[0].email || payload.email || lead.email;
            lead.phone = payload.phone || lead.phone;
            lead.website = payload.website || lead.website;
            lead.address = payload.address || lead.address;
            lead.city = payload.city || lead.city;
        }

        const leadName = String(lead.businessName || '').trim().toLowerCase();
        const leadEmail = String(lead.email || '').trim().toLowerCase();

        const [tasksRes, activitiesRes, agentRes] = await Promise.all([
            query(
                `
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
                    COALESCE(t.created_by_name, 'Admin') AS "createdByName",
                    u.name AS "assignedToName",
                    u.email AS "assignedToEmail"
                FROM lead_tasks t
                LEFT JOIN users u ON u.id = t.assigned_to_user_id
                WHERE t.lead_id = ANY($1::text[])
                ORDER BY
                    CASE WHEN t.status = 'pending' THEN 1 WHEN t.status = 'in_progress' THEN 2 ELSE 3 END,
                    t.due_date ASC NULLS LAST,
                    t.created_at DESC
            `,
                [allLeadIds]
            ),
            query(
                `
                SELECT DISTINCT
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
                WHERE (
                    a.lead_id = ANY($1::text[])
                    OR (NULLIF($2, '') IS NOT NULL AND a.lead_id IN (SELECT id::text FROM sales_leads WHERE LOWER(TRIM(name)) = $2 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(email)) = $3)))
                    OR (NULLIF($2, '') IS NOT NULL AND a.lead_id IN (SELECT id::text FROM submissions WHERE LOWER(TRIM(COALESCE(payload->>'businessName', payload->>'name', ''))) = $2 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(COALESCE(email, payload->>'email', ''))) = $3)))
                )
                  AND a.activity_type IN ('call_log', 'status_change', 'note', 'task_event')
                ORDER BY a.created_at DESC
                LIMIT 200
            `,
                [allLeadIds, leadName || null, leadEmail || null]
            ),
            lead.assignedTo
                ? query(`SELECT name, email FROM users WHERE id = $1`, [lead.assignedTo]).catch(
                      () => ({ rows: [] as any[] })
                  )
                : Promise.resolve({ rows: [] as any[] })
        ]);

        if (agentRes.rows[0] && !lead.assignedAgentName) {
            lead.assignedAgentName = agentRes.rows[0].name || agentRes.rows[0].email || null;
        }

        res.json({
            lead,
            tasks: tasksRes.rows,
            activities: activitiesRes.rows
        });
    } catch (err: any) {
        console.error('Admin fetch lead CRM error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch lead CRM' });
    }
});

router.get('/crm/leads/:leadId/activities', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.leadId);
        const allLeadIds = await resolveAllLeadIds(leadId);

        const [salesRes, subRes] = await Promise.all([
            query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] })),
            query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email FROM submissions WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] }))
        ]);

        const leadName = (salesRes.rows[0]?.name || subRes.rows[0]?.bname || subRes.rows[0]?.name || '').trim().toLowerCase();
        const leadEmail = (salesRes.rows[0]?.email || subRes.rows[0]?.email || '').trim().toLowerCase();

        const { rows } = await query(`
            SELECT DISTINCT
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
            WHERE (
                a.lead_id = ANY($1::text[])
                OR (NULLIF($2, '') IS NOT NULL AND a.lead_id IN (SELECT id::text FROM sales_leads WHERE LOWER(TRIM(name)) = $2 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(email)) = $3)))
                OR (NULLIF($2, '') IS NOT NULL AND a.lead_id IN (SELECT id::text FROM submissions WHERE LOWER(TRIM(COALESCE(payload->>'businessName', payload->>'name', ''))) = $2 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(COALESCE(email, payload->>'email', ''))) = $3)))
            )
              AND a.activity_type IN ('call_log', 'status_change', 'note', 'task_event')
            ORDER BY a.created_at DESC
            LIMIT 200
        `, [allLeadIds, leadName || null, leadEmail || null]);

        res.json({ activities: rows });
    } catch (err: any) {
        console.error('Fetch lead activities error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch activities' });
    }
});


router.post('/crm/leads/:leadId/activities', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = req.params.leadId;
        const {
            activity_type = 'call_log',
            disposition = 'connected',
            note = '',
            author_name = 'Admin',
            user_id = null
        } = req.body || {};

        if (!note && !disposition) {
            return res.status(400).json({ error: 'Note or disposition is required.' });
        }

        const { rows } = await query(`
            INSERT INTO lead_activities (
                lead_id, user_id, author_name, activity_type, disposition, note
            ) VALUES ($1, $2, $3, $4, $5, $6)
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
            user_id || null,
            String(author_name || 'Admin').trim(),
            activity_type,
            disposition || null,
            String(note || '').trim()
        ]);

        res.status(201).json({ activity: rows[0] });
    } catch (err: any) {
        console.error('Create lead activity error:', err);
        res.status(500).json({ error: err.message || 'Failed to create activity' });
    }
});


router.post('/crm/activities/clear', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        await query(`TRUNCATE TABLE lead_activities CASCADE`);
        res.json({ success: true, message: 'All call logs and activity history cleared' });
    } catch (err: any) {
        console.error('Clear activities error:', err);
        res.status(500).json({ error: err.message || 'Failed to clear activities' });
    }
});

/** Admin: List all CRM leads (sales_leads) */
router.get('/crm/leads', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const industry = String(req.query.industry || '').trim();
        const status = String(req.query.status || '').trim();
        const opportunityLevel = String(req.query.opportunityLevel || '').trim();
        const q = String(req.query.q || '').trim();
        const isCustomer = req.query.isCustomer === 'true' ? true : req.query.isCustomer === 'false' ? false : undefined;

        const params: any[] = [];
        const where: string[] = [];

        if (isCustomer !== undefined) {
            params.push(isCustomer);
            where.push(`l.is_customer = $${params.length}`);
        } else {
            where.push(`l.is_customer = FALSE`);
        }

        if (industry && industry !== 'all') {
            params.push(industry.toLowerCase());
            where.push(`LOWER(l.industry) = $${params.length}`);
        }

        if (status && status !== 'all') {
            params.push(status);
            where.push(`l.status = $${params.length}`);
        }

        if (opportunityLevel && opportunityLevel !== 'all') {
            params.push(opportunityLevel.toLowerCase());
            where.push(`LOWER(l.opportunity_level) = $${params.length}`);
        }

        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const p = `$${params.length}`;
            where.push(`(
                LOWER(l.name) LIKE ${p}
                OR LOWER(l.phone) LIKE ${p}
                OR LOWER(l.email) LIKE ${p}
                OR LOWER(l.address) LIKE ${p}
                OR LOWER(l.website) LIKE ${p}
            )`);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const { rows } = await query(`
            SELECT 
                l.id,
                l.name,
                l.name AS "businessName",
                l.phone,
                l.email,
                l.notes,
                l.status,
                l.source,
                l.industry,
                l.address,
                l.website,
                l.gbp_observation AS "gbpObservation",
                l.ai_visibility_observation AS "aiVisibilityObservation",
                l.lead_opportunity AS "leadOpportunity",
                l.opportunity_level AS "opportunityLevel",
                l.is_customer AS "isCustomer",
                l.converted_at AS "convertedAt",
                l.assigned_to AS "assignedTo",
                l.next_follow_up_at AS "nextFollowUpAt",
                l.created_at AS "createdAt",
                l.updated_at AS "updatedAt",
                u.name AS "assignedAgentName",
                u.email AS "assignedAgentEmail"
            FROM sales_leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            ${whereSql}
            ORDER BY l.created_at DESC
            LIMIT 1000
        `, params);

        res.json({ leads: rows });
    } catch (err: any) {
        console.error('Admin get CRM leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch leads' });
    }
});

/** Admin: Create single lead manually */
router.post('/crm/leads', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const {
            name,
            businessName,
            phone,
            email,
            notes,
            conclusion,
            status = 'new',
            source = 'admin_manual',
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
            assignedTo: assignedTo || null,
            nextFollowUpAt,
            createdByAdmin: true
        });

        res.status(201).json({ lead });
    } catch (err: any) {
        console.error('Admin create lead error:', err);
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

/** Admin: Bulk Import Leads (Excel / CSV) */
router.post('/crm/leads/bulk-import', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { leads, fileName } = req.body || {};

        if (!Array.isArray(leads) || !leads.length) {
            return res.status(400).json({ error: 'No leads provided for import.' });
        }

        const importBatchId = randomUUID();
        const importUploadedAt = new Date();
        const resolvedFileName = String(fileName || '').trim() || 'Excel Import';

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
                assignedTo: item.assignedTo || null,
                spreadsheetStatus: String(item.spreadsheetStatus || '').trim(),
                spreadsheetStatus1: String(item.spreadsheetStatus1 || '').trim(),
                spreadsheetStatus2: String(item.spreadsheetStatus2 || '').trim(),
                spreadsheetStatus3: String(item.spreadsheetStatus3 || '').trim()
            };
        });

        const result = await bulkImportSalesLeads(normalizedLeads, true, {
            fileName: resolvedFileName,
            importBatchId,
            importUploadedAt
        });
        res.json(result);
    } catch (err: any) {
        console.error('Admin bulk import error:', err);
        res.status(500).json({ error: err.message || 'Failed to import leads' });
    }
});

/** Admin: Bulk Assign Leads to Telecaller / Agent */
router.post('/crm/leads/bulk-assign', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { leadIds, assignedToUserId, task } = req.body || {};

        if (!Array.isArray(leadIds) || !leadIds.length) {
            return res.status(400).json({ error: 'No lead IDs provided.' });
        }

        const agentId = assignedToUserId ? String(assignedToUserId).trim() : null;

        let agentName = 'Unassigned';
        if (agentId) {
            const { rows: userRows } = await query(`SELECT name FROM users WHERE id = $1`, [agentId]);
            if (userRows[0]) {
                agentName = userRows[0].name;
            }
        }

        const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom'];
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const hasTaskToCreate = Boolean(task && task.title && String(task.title).trim());
        const taskTitle = hasTaskToCreate ? String(task.title).trim() : '';
        const taskType = hasTaskToCreate && validTaskTypes.includes(task.taskType) ? task.taskType : 'follow_up_call';
        const taskPriority = hasTaskToCreate && validPriorities.includes(task.priority) ? task.priority : 'medium';
        const taskNotes = hasTaskToCreate && task.notes ? String(task.notes).trim() : '';
        const taskDueDate = hasTaskToCreate && task.dueDate ? task.dueDate : null;

        let updatedCount = 0;
        let createdTasksCount = 0;

        for (const rawId of leadIds) {
            const id = String(rawId).trim();
            if (!id) continue;

            let targetLeadId: string | null = null;

            // 1. Try to update existing sales_leads
            const { rows: updatedRows } = await query(`
                UPDATE sales_leads
                SET assigned_to = $1, updated_at = NOW()
                WHERE id::text = $2 OR email = (SELECT email FROM submissions WHERE id::text = $2 LIMIT 1)
                RETURNING id
            `, [agentId, id]);

            if (updatedRows.length > 0) {
                updatedCount += updatedRows.length;
                for (const row of updatedRows) {
                    targetLeadId = String(row.id);
                    try {
                        await query(`
                            INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                            VALUES ($1, 'Admin', 'task_event', $2)
                        `, [targetLeadId, agentId ? `Assigned to telecaller: ${agentName}` : `Unassigned telecaller`]);
                    } catch {}

                    if (hasTaskToCreate) {
                        try {
                            await query(`
                                INSERT INTO lead_tasks (
                                    lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
                                ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'admin', 'Admin')
                            `, [targetLeadId, taskType, taskTitle, taskNotes, taskPriority, agentId, taskDueDate]);

                            await query(`
                                INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                                VALUES ($1, 'Admin', 'task_event', $2)
                            `, [targetLeadId, `Admin created task: "${taskTitle}"`]);
                            createdTasksCount++;
                        } catch (tErr) {
                            console.warn('Could not create task during bulk assign:', tErr);
                        }
                    }
                }
            } else {
                // 2. If it's a submission lead not yet in sales_leads, fetch submission and create a sales_lead entry
                const { rows: subRows } = await query(`
                    SELECT id, type, email, payload FROM submissions WHERE id::text = $1 LIMIT 1
                `, [id]);

                if (subRows[0]) {
                    const sub = subRows[0];
                    const p = sub.payload || {};
                    const name = String(p.businessName || p.name || p.contactName || p.fullName || 'Lead').trim();
                    const phone = String(p.phone || '').trim();
                    const email = String(sub.email || p.email || '').trim().toLowerCase();

                    try {
                        const newLead = await createSalesLead({
                            name,
                            phone,
                            email,
                            source: sub.type || 'growth_audit',
                            assignedTo: agentId,
                            createdByAdmin: true
                        });
                        updatedCount++;
                        targetLeadId = String(newLead.id);

                        try {
                            await query(`
                                INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                                VALUES ($1, 'Admin', 'task_event', $2)
                            `, [targetLeadId, agentId ? `Assigned to telecaller: ${agentName}` : `Unassigned telecaller`]);
                        } catch {}

                        if (hasTaskToCreate) {
                            try {
                                await query(`
                                    INSERT INTO lead_tasks (
                                        lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
                                    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'admin', 'Admin')
                                `, [targetLeadId, taskType, taskTitle, taskNotes, taskPriority, agentId, taskDueDate]);

                                await query(`
                                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                                    VALUES ($1, 'Admin', 'task_event', $2)
                                `, [targetLeadId, `Admin created task: "${taskTitle}"`]);
                                createdTasksCount++;
                            } catch (tErr) {
                                console.warn('Could not create task during bulk assign:', tErr);
                            }
                        }
                    } catch (createErr) {
                        console.warn('Could not create sales lead from submission during bulk assign:', createErr);
                    }
                }
            }
        }

        res.json({
            success: true,
            updatedCount,
            createdTasksCount,
            agentName,
            message: `Successfully assigned ${updatedCount} lead(s) to ${agentName}${createdTasksCount > 0 ? ` and created ${createdTasksCount} task(s)` : ''}.`
        });
    } catch (err: any) {
        console.error('Admin bulk assign leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to bulk assign leads' });
    }
});

/** Admin: Update Single Lead (Assignee, Status, Notes, etc.) */
router.patch('/crm/leads/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const {
            assignedTo,
            status,
            notes,
            opportunityLevel,
            industry,
            website,
            phone,
            email,
            name,
            gbpObservation,
            aiVisibilityObservation,
            leadOpportunity,
            address,
            spreadsheetStatus,
            spreadsheetStatus1,
            spreadsheetStatus2,
            spreadsheetStatus3,
            auditId
        } = req.body || {};

        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [leadId];

        if (assignedTo !== undefined) {
            params.push(assignedTo || null);
            updates.push(`assigned_to = $${params.length}`);
        }
        if (status !== undefined) {
            params.push(status);
            updates.push(`status = $${params.length}`);
            if (status === 'converted') {
                updates.push(`is_customer = TRUE`);
                updates.push(`converted_at = COALESCE(converted_at, NOW())`);
            }
        }
        if (notes !== undefined) {
            params.push(String(notes || '').trim());
            updates.push(`notes = $${params.length}`);
        }
        if (opportunityLevel !== undefined) {
            params.push(String(opportunityLevel || '').toLowerCase());
            updates.push(`opportunity_level = $${params.length}`);
        }
        if (industry !== undefined) {
            params.push(String(industry || '').trim());
            updates.push(`industry = $${params.length}`);
        }
        if (website !== undefined) {
            params.push(String(website || '').trim());
            updates.push(`website = $${params.length}`);
        }
        if (phone !== undefined) {
            params.push(String(phone || '').trim());
            updates.push(`phone = $${params.length}`);
        }
        if (email !== undefined) {
            params.push(String(email || '').trim().toLowerCase());
            updates.push(`email = $${params.length}`);
        }
        if (name !== undefined) {
            params.push(String(name || '').trim());
            updates.push(`name = $${params.length}`);
        }
        if (gbpObservation !== undefined) {
            params.push(String(gbpObservation || '').trim());
            updates.push(`gbp_observation = $${params.length}`);
        }
        if (aiVisibilityObservation !== undefined) {
            params.push(String(aiVisibilityObservation || '').trim());
            updates.push(`ai_visibility_observation = $${params.length}`);
        }
        if (leadOpportunity !== undefined) {
            params.push(String(leadOpportunity || '').trim());
            updates.push(`lead_opportunity = $${params.length}`);
        }
        if (address !== undefined) {
            params.push(String(address || '').trim());
            updates.push(`address = $${params.length}`);
        }
        if (spreadsheetStatus !== undefined) {
            params.push(String(spreadsheetStatus || '').trim());
            updates.push(`spreadsheet_status = $${params.length}`);
        }
        if (spreadsheetStatus1 !== undefined) {
            params.push(String(spreadsheetStatus1 || '').trim());
            updates.push(`spreadsheet_status_1 = $${params.length}`);
        }
        if (spreadsheetStatus2 !== undefined) {
            params.push(String(spreadsheetStatus2 || '').trim());
            updates.push(`spreadsheet_status_2 = $${params.length}`);
        }
        if (spreadsheetStatus3 !== undefined) {
            params.push(String(spreadsheetStatus3 || '').trim());
            updates.push(`spreadsheet_status_3 = $${params.length}`);
        }
        if (auditId !== undefined) {
            params.push(String(auditId || '').trim() || null);
            updates.push(`audit_id = $${params.length}`);
        }

        const { rows } = await query(`
            UPDATE sales_leads
            SET ${updates.join(', ')}
            WHERE id::text = $1
            RETURNING *
        `, params);

        let updatedLead = rows[0];
        if (!rows.length) {
            // Check if it's a submission ID
            const { rows: subRows } = await query(`
                SELECT id, type, email, payload FROM submissions WHERE id::text = $1 LIMIT 1
            `, [leadId]);
            if (subRows[0]) {
                const sub = subRows[0];
                const p = sub.payload || {};
                const leadName = String(name || p.businessName || p.name || p.contactName || 'Lead').trim();
                const leadPhone = String(phone || p.phone || '').trim();
                const leadEmail = String(email || sub.email || p.email || '').trim().toLowerCase();
                const newLead = await createSalesLead({
                    name: leadName,
                    phone: leadPhone,
                    email: leadEmail,
                    source: sub.type || 'growth_audit',
                    status: status || 'contacted',
                    notes: notes ? String(notes).trim() : '',
                    assignedTo: assignedTo || null,
                    createdByAdmin: true
                });
                updatedLead = newLead;
            } else {
                return res.status(404).json({ error: 'Lead not found' });
            }
        }

        if (status !== undefined || (notes !== undefined && String(notes).trim())) {
            try {
                const author = (req as any).user?.name || 'Admin';
                const actDate = req.body?.createdAt || req.body?.activityDate ? new Date(req.body.createdAt || req.body.activityDate) : new Date();
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, $2, 'status_change', $3, $4, $5)
                `, [leadId, author, status || updatedLead?.status || 'status_change', notes ? String(notes).trim() : `Status updated to ${status}`, actDate]);
            } catch (actErr) {
                console.warn('Could not record status change activity:', actErr);
            }
        }

        res.json({ success: true, lead: updatedLead });
    } catch (err: any) {
        console.error('Admin update lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to update lead' });
    }
});

/** Admin: Convert Lead to Customer */
router.patch('/crm/leads/:id/convert', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const { note = '' } = req.body || {};

        const lead = await convertLeadToCustomer(leadId);

        try {
            await query(`
                INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note)
                VALUES ($1, 'Admin', 'call_log', 'converted', $2)
            `, [leadId, note ? `Converted lead to Customer by Admin. Note: ${note}` : 'Converted lead to Customer by Admin']);
        } catch {}

        res.json({ success: true, lead });
    } catch (err: any) {
        console.error('Admin convert lead error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to convert lead to customer' });
    }
});

/** Admin: Get Converted Customers */
router.get('/crm/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const q = String(req.query.q || '').trim();
        const industry = String(req.query.industry || '').trim();

        const params: any[] = [];
        const where: string[] = ['l.is_customer = TRUE'];

        if (industry && industry !== 'all') {
            params.push(industry.toLowerCase());
            where.push(`LOWER(l.industry) = $${params.length}`);
        }

        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const p = `$${params.length}`;
            where.push(`(
                LOWER(l.name) LIKE ${p}
                OR LOWER(l.phone) LIKE ${p}
                OR LOWER(l.email) LIKE ${p}
                OR LOWER(l.address) LIKE ${p}
                OR LOWER(l.website) LIKE ${p}
            )`);
        }

        const { rows } = await query(`
            SELECT 
                l.id,
                l.name,
                l.name AS "businessName",
                l.phone,
                l.email,
                l.notes,
                l.status,
                l.source,
                l.industry,
                l.address,
                l.website,
                l.gbp_observation AS "gbpObservation",
                l.ai_visibility_observation AS "aiVisibilityObservation",
                l.lead_opportunity AS "leadOpportunity",
                l.opportunity_level AS "opportunityLevel",
                l.is_customer AS "isCustomer",
                l.converted_at AS "convertedAt",
                l.assigned_to AS "assignedTo",
                l.created_at AS "createdAt",
                l.updated_at AS "updatedAt",
                u.name AS "assignedAgentName",
                u.email AS "assignedAgentEmail"
            FROM sales_leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE ${where.join(' AND ')}
            ORDER BY l.converted_at DESC NULLS LAST, l.updated_at DESC
        `, params);

        res.json({ customers: rows });
    } catch (err: any) {
        console.error('Admin get customers error:', err);
        res.status(500).json({ error: err.message || 'Failed to load customers' });
    }
});

/** Admin: Get Distinct Industries with counts */
router.get('/crm/industries', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { rows } = await query(`
            SELECT 
                COALESCE(NULLIF(TRIM(industry), ''), 'General') AS name,
                COUNT(*)::int AS count
            FROM sales_leads
            GROUP BY COALESCE(NULLIF(TRIM(industry), ''), 'General')
            ORDER BY count DESC
        `);
        res.json({ industries: rows });
    } catch (err: any) {
        console.error('Admin get industries error:', err);
        res.status(500).json({ error: err.message || 'Failed to load industries' });
    }
});

/** Admin: List Excel import batches (for filter / assign / delete by file) */
router.get('/crm/leads/excel-batches', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();

        const { rows: batches } = await query(`
            SELECT
                import_batch_id::text AS "batchId",
                COALESCE(NULLIF(TRIM(MAX(import_file_name)), ''), 'Excel Import') AS "fileName",
                MAX(import_uploaded_at) AS "uploadedAt",
                COUNT(*)::int AS "leadCount"
            FROM sales_leads
            WHERE import_batch_id IS NOT NULL
              AND (source = 'excel_import' OR source ILIKE '%excel%')
            GROUP BY import_batch_id
            ORDER BY MAX(import_uploaded_at) DESC NULLS LAST, MAX(created_at) DESC
        `);

        const { rows: legacyRows } = await query(`
            SELECT COUNT(*)::int AS count
            FROM sales_leads
            WHERE import_batch_id IS NULL
              AND (source = 'excel_import' OR source ILIKE '%excel%')
        `);
        const legacyCount = Number(legacyRows[0]?.count || 0);

        const result = [...batches];
        if (legacyCount > 0) {
            result.push({
                batchId: 'legacy',
                fileName: 'Older Excel imports',
                uploadedAt: null,
                leadCount: legacyCount
            });
        }

        res.json({ batches: result });
    } catch (err: any) {
        console.error('Admin list excel batches error:', err);
        res.status(500).json({ error: err.message || 'Failed to load excel batches' });
    }
});

/** Admin: Delete leads from one Excel upload batch (not all Excel data) */
router.delete('/crm/leads/excel', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const batchId = String(req.query.batchId || (req.body as any)?.batchId || '').trim();
        if (!batchId) {
            return res.status(400).json({
                error: 'Select one Excel file (batchId) to delete. Deleting all Excel data at once is not allowed.'
            });
        }

        const isLegacy = batchId === 'legacy';
        if (!isLegacy) {
            const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId);
            if (!uuidOk) {
                return res.status(400).json({ error: 'Invalid Excel batch id.' });
            }
        }

        const leadIdSubquery = isLegacy
            ? `SELECT id::text FROM sales_leads
               WHERE import_batch_id IS NULL
                 AND (source = 'excel_import' OR source ILIKE '%excel%')`
            : `SELECT id::text FROM sales_leads
               WHERE import_batch_id = $1::uuid
                 AND (source = 'excel_import' OR source ILIKE '%excel%')`;

        const params = isLegacy ? [] : [batchId];

        await query(
            `DELETE FROM lead_tasks WHERE lead_id IN (${leadIdSubquery})`,
            params
        ).catch(() => {});

        await query(
            `DELETE FROM lead_activities WHERE lead_id IN (${leadIdSubquery})`,
            params
        ).catch(() => {});

        const { rows } = await query(
            isLegacy
                ? `DELETE FROM sales_leads
                   WHERE import_batch_id IS NULL
                     AND (source = 'excel_import' OR source ILIKE '%excel%')
                   RETURNING id`
                : `DELETE FROM sales_leads
                   WHERE import_batch_id = $1::uuid
                     AND (source = 'excel_import' OR source ILIKE '%excel%')
                   RETURNING id`,
            params
        );

        res.json({
            success: true,
            count: rows.length,
            batchId,
            message: `Successfully deleted ${rows.length} lead(s) from this Excel upload.`
        });
    } catch (err: any) {
        console.error('Admin delete excel leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete excel leads' });
    }
});

/** Admin: Bulk delete selected leads (sales_leads and/or submissions) */
router.post('/crm/leads/bulk-delete', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const rawIds = Array.isArray((req.body as any)?.leadIds) ? (req.body as any).leadIds : [];
        const leadIds = Array.from(
            new Set(rawIds.map((id: any) => String(id || '').trim()).filter(Boolean))
        );

        if (!leadIds.length) {
            return res.status(400).json({ error: 'No lead IDs provided.' });
        }
        if (leadIds.length > 2000) {
            return res.status(400).json({ error: 'Too many leads selected (max 2000).' });
        }

        await query(`DELETE FROM lead_tasks WHERE lead_id = ANY($1::text[])`, [leadIds]).catch(() => {});
        await query(`DELETE FROM lead_activities WHERE lead_id = ANY($1::text[])`, [leadIds]).catch(
            () => {}
        );

        const { rows: salesRows } = await query(
            `DELETE FROM sales_leads WHERE id::text = ANY($1::text[]) RETURNING id::text AS id`,
            [leadIds]
        );

        let submissionCount = 0;
        try {
            const { rows: subRows } = await query(
                `DELETE FROM submissions WHERE id::text = ANY($1::text[]) RETURNING id::text AS id`,
                [leadIds]
            );
            submissionCount = subRows.length;
        } catch {
            // submissions table may be unavailable in some envs
        }

        const deletedCount = salesRows.length + submissionCount;
        res.json({
            success: true,
            count: deletedCount,
            salesLeadsDeleted: salesRows.length,
            submissionsDeleted: submissionCount,
            message: `Successfully deleted ${deletedCount} lead(s).`
        });
    } catch (err: any) {
        console.error('Admin bulk delete leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete leads' });
    }
});

/** Admin: Delete a single lead (sales_leads and/or submissions) */
router.delete('/crm/leads/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id || '').trim();
        if (!leadId) {
            return res.status(400).json({ error: 'Lead ID is required.' });
        }

        const leadIds = [leadId];

        await query(`DELETE FROM lead_tasks WHERE lead_id = ANY($1::text[])`, [leadIds]).catch(() => {});
        await query(`DELETE FROM lead_activities WHERE lead_id = ANY($1::text[])`, [leadIds]).catch(
            () => {}
        );

        const { rows: salesRows } = await query(
            `DELETE FROM sales_leads WHERE id::text = ANY($1::text[]) RETURNING id::text AS id`,
            [leadIds]
        );

        let submissionCount = 0;
        let submissionError: string | null = null;
        try {
            const { rows: subRows } = await query(
                `DELETE FROM submissions WHERE id::text = ANY($1::text[]) RETURNING id::text AS id`,
                [leadIds]
            );
            submissionCount = subRows.length;
        } catch (err: any) {
            submissionError = err?.message || String(err);
            console.warn('[admin-delete-lead] submissions delete failed:', submissionError);
        }

        const deletedCount = salesRows.length + submissionCount;
        if (!deletedCount) {
            return res.status(404).json({
                error: submissionError
                    ? `Lead not found in CRM, and form-submission delete failed: ${submissionError}`
                    : 'Lead not found.'
            });
        }

        res.json({
            success: true,
            id: leadId,
            count: deletedCount,
            salesLeadsDeleted: salesRows.length,
            submissionsDeleted: submissionCount
        });
    } catch (err: any) {
        console.error('Admin delete lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete lead' });
    }
});

export default router;
