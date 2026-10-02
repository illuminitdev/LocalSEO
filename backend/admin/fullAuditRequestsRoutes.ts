import { Router, Request, Response } from 'express';
import { requireAdmin } from './adminAuth';
import { query } from '../lib/db';
import { ensureCrmTables } from '../sales-agent/sales';
import { reportShareUrl } from '../lib/zappSitesAuditProxy';

const router = Router();

function mapRequestRow(row: any) {
    return {
        id: String(row.id),
        leadId: String(row.lead_id || ''),
        observationEmailToken: row.observation_email_token || null,
        businessName: row.business_name || '',
        toEmail: row.to_email || '',
        status: row.status || 'pending',
        source: row.source || 'email_cta',
        requestedAt: row.requested_at || null,
        fulfilledAuditId: row.fulfilled_audit_id || null,
        assignedToUserId: row.assigned_to_user_id || null,
        assignedAgentName: row.assigned_agent_name || null,
        assignedAgentEmail: row.assigned_agent_email || null,
        completedAt: row.completed_at || null,
        notes: row.notes || '',
        reportUrl: row.fulfilled_audit_id ? reportShareUrl(String(row.fulfilled_audit_id)) : null
    };
}

router.get('/full-audit-requests', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();

        // Auto-sync any prepare_audit tasks from lead_tasks into full_audit_requests if not already present
        await query(`
            INSERT INTO full_audit_requests (
                lead_id, business_name, to_email, status, source, assigned_to_user_id, notes, requested_at
            )
            SELECT 
                t.lead_id,
                COALESCE(
                    NULLIF(TRIM(sl.name), ''),
                    NULLIF(TRIM(sub.payload->>'businessName'), ''),
                    NULLIF(TRIM(sub.payload->>'name'), ''),
                    REGEXP_REPLACE(t.title, '^(Full\\s+Growth\\s+Audit\\s+for|Audit\\s+for)\\s*', '', 'i'),
                    'Lead'
                ) AS business_name,
                COALESCE(
                    NULLIF(TRIM(sl.email), ''),
                    NULLIF(TRIM(sub.email), ''),
                    NULLIF(TRIM(sub.payload->>'email'), ''),
                    ''
                ) AS to_email,
                CASE 
                    WHEN t.status = 'completed' THEN 'completed'
                    WHEN t.status = 'cancelled' THEN 'dismissed'
                    ELSE 'pending'
                END AS status,
                'sales_agent_request' AS source,
                u.id AS assigned_to_user_id,
                COALESCE(t.notes, '') AS notes,
                COALESCE(t.created_at, NOW()) AS requested_at
            FROM lead_tasks t
            LEFT JOIN sales_leads sl ON sl.id::text = t.lead_id
            LEFT JOIN submissions sub ON sub.id::text = t.lead_id
            LEFT JOIN users u ON u.id = t.assigned_to_user_id
            WHERE t.task_type = 'prepare_audit'
              AND t.lead_id IS NOT NULL 
              AND t.lead_id != 'general'
              AND NOT EXISTS (
                  SELECT 1 FROM full_audit_requests far 
                  WHERE far.lead_id = t.lead_id
              )
        `).catch((err) => {
            console.warn('[full-audit-requests] auto-sync lead_tasks failed:', err?.message || err);
        });

        const status = String(req.query.status || '').trim().toLowerCase();
        const params: any[] = [];
        let where = '';
        if (status && status !== 'all') {
            params.push(status);
            where = `WHERE r.status = $${params.length}`;
        }

        const { rows } = await query(
            `
            SELECT
                r.*,
                u.name AS assigned_agent_name,
                u.email AS assigned_agent_email
            FROM full_audit_requests r
            LEFT JOIN users u ON u.id = r.assigned_to_user_id
            ${where}
            ORDER BY
                CASE r.status
                    WHEN 'pending' THEN 1
                    WHEN 'in_progress' THEN 2
                    WHEN 'completed' THEN 3
                    ELSE 4
                END,
                r.requested_at DESC
            LIMIT 200
            `,
            params
        );

        res.json({ requests: rows.map(mapRequestRow) });
    } catch (err: any) {
        console.error('Admin list full-audit-requests error:', err);
        res.status(500).json({ error: err.message || 'Failed to load full audit requests' });
    }
});

router.patch('/full-audit-requests/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'Missing request id' });

        const {
            status,
            notes,
            assignedToUserId,
            fulfilledAuditId
        } = req.body || {};

        const { rows: existingRows } = await query(
            `SELECT * FROM full_audit_requests WHERE id = $1 LIMIT 1`,
            [id]
        );
        const existing = existingRows[0];
        if (!existing) return res.status(404).json({ error: 'Request not found' });

        const nextStatus = status !== undefined ? String(status).trim() : existing.status;
        const allowed = ['pending', 'in_progress', 'completed', 'dismissed'];
        if (!allowed.includes(nextStatus)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const nextNotes = notes !== undefined ? String(notes || '').trim() : existing.notes || '';
        const nextAssigned =
            assignedToUserId !== undefined
                ? assignedToUserId || null
                : existing.assigned_to_user_id || null;
        const nextAuditId =
            fulfilledAuditId !== undefined
                ? String(fulfilledAuditId || '').trim() || null
                : existing.fulfilled_audit_id || null;

        const completedAt =
            nextStatus === 'completed'
                ? existing.completed_at || new Date()
                : nextStatus === 'dismissed'
                  ? existing.completed_at || new Date()
                  : null;

        const { rows } = await query(
            `
            UPDATE full_audit_requests
            SET status = $2,
                notes = $3,
                assigned_to_user_id = $4,
                fulfilled_audit_id = $5,
                completed_at = $6
            WHERE id = $1
            RETURNING *
            `,
            [id, nextStatus, nextNotes, nextAssigned, nextAuditId, completedAt]
        );

        const leadId = String(rows[0].lead_id || '').trim();

        // Link audit + assign sales agent on the lead when fulfilling
        if (nextAuditId || nextAssigned) {
            try {
                const leadUpdates: string[] = ['updated_at = NOW()'];
                const leadParams: any[] = [leadId];
                if (nextAssigned) {
                    leadParams.push(nextAssigned);
                    leadUpdates.push(`assigned_to = $${leadParams.length}`);
                }
                if (nextAuditId) {
                    leadParams.push(nextAuditId);
                    leadUpdates.push(`audit_id = $${leadParams.length}`);
                }
                const { rowCount } = await query(
                    `UPDATE sales_leads SET ${leadUpdates.join(', ')} WHERE id::text = $1`,
                    leadParams
                );

                // If lead is only a submission, create/update a sales_leads row so sales can email PDF
                if (!rowCount && nextAuditId) {
                    const { rows: subRows } = await query(
                        `SELECT email, payload FROM submissions WHERE id::text = $1 LIMIT 1`,
                        [leadId]
                    ).catch(() => ({ rows: [] as any[] }));
                    if (subRows[0]) {
                        const p =
                            subRows[0].payload && typeof subRows[0].payload === 'object'
                                ? subRows[0].payload
                                : {};
                        await query(
                            `INSERT INTO sales_leads
                             (id, name, email, phone, website, address, source, assigned_to, audit_id, created_by_admin)
                             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
                             ON CONFLICT (id) DO UPDATE SET
                               audit_id = EXCLUDED.audit_id,
                               assigned_to = COALESCE(EXCLUDED.assigned_to, sales_leads.assigned_to),
                               updated_at = NOW()`,
                            [
                                leadId,
                                String(p.businessName || p.name || rows[0].business_name || 'Lead').trim(),
                                String(subRows[0].email || p.email || rows[0].to_email || '')
                                    .trim()
                                    .toLowerCase(),
                                String(p.phone || '').trim(),
                                String(p.website || '').trim(),
                                String(p.address || '').trim(),
                                'full_audit_request',
                                nextAssigned,
                                nextAuditId
                            ]
                        ).catch(async () => {
                            // id may not be uuid — upsert by matching email/name instead
                            await query(
                                `UPDATE sales_leads
                                 SET audit_id = $2,
                                     assigned_to = COALESCE($3, assigned_to),
                                     updated_at = NOW()
                                 WHERE id::text = $1 OR LOWER(TRIM(email)) = LOWER(TRIM($4))`,
                                [
                                    leadId,
                                    nextAuditId,
                                    nextAssigned,
                                    String(subRows[0].email || rows[0].to_email || '').trim()
                                ]
                            ).catch(() => {});
                        });
                    } else {
                        await query(
                            `UPDATE sales_leads
                             SET audit_id = COALESCE($2, audit_id),
                                 assigned_to = COALESCE($3, assigned_to),
                                 updated_at = NOW()
                             WHERE id::text = $1`,
                            [leadId, nextAuditId, nextAssigned]
                        ).catch(() => {});
                    }
                }
            } catch (linkErr) {
                console.warn('Could not link audit to lead:', linkErr);
            }
        }

        // Create a CRM task for the sales agent when assigning a completed audit
        if (nextAssigned && nextAuditId && nextStatus === 'completed') {
            try {
                let taskLeadId = leadId;
                let bizName = String(rows[0].business_name || '').trim();
                if (!taskLeadId) {
                    const email = String(rows[0].to_email || '').trim().toLowerCase();
                    if (email) {
                        const { rows: byEmail } = await query(
                            `SELECT id, name FROM sales_leads WHERE LOWER(TRIM(email)) = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
                            [email]
                        ).catch(() => ({ rows: [] as any[] }));
                        if (byEmail[0]) {
                            taskLeadId = String(byEmail[0].id).trim();
                            if (!bizName && byEmail[0].name) bizName = byEmail[0].name;
                        }
                    }
                }
                if (taskLeadId) {
                    // Avoid duplicate open share tasks for the same audit
                    const { rows: existingTasks } = await query(
                        `SELECT id FROM lead_tasks
                         WHERE lead_id = $1
                           AND assigned_to_user_id = $2
                           AND task_type IN ('prepare_audit', 'follow_up_call')
                           AND status IN ('pending', 'in_progress')
                           AND (notes ILIKE $3 OR title ILIKE '%Growth Audit Ready%')
                         LIMIT 1`,
                        [taskLeadId, nextAssigned, `%${nextAuditId}%`]
                    ).catch(() => ({ rows: [] as any[] }));

                    if (!existingTasks[0]) {
                        await query(
                            `INSERT INTO lead_tasks
                             (lead_id, assigned_to_user_id, task_type, title, notes, priority, status, created_by_role, created_by_name)
                             VALUES ($1, $2, 'follow_up_call', $3, $4, 'high', 'pending', 'admin', 'Admin')`,
                            [
                                taskLeadId,
                                nextAssigned,
                                `Growth Audit Ready: Deliver & Pitch to ${bizName || 'Lead'}`,
                                `Full Growth Audit is ready (${nextAuditId}). Review the live report and share the PDF report with the business.`
                            ]
                        );
                    }
                    await query(
                        `INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note)
                         VALUES ($1, 'Admin', 'task_event', 'full_audit_assigned', $2)`,
                        [
                            taskLeadId,
                            `Admin published Full Growth Audit (${nextAuditId}) and assigned report back to sales agent to deliver to client`
                        ]
                    );
                } else {
                    console.warn('[full-audit-request] no lead_id to create CRM task for', id);
                }
            } catch (taskErr) {
                console.warn('Could not create fulfill task:', taskErr);
            }
        }

        const { rows: outRows } = await query(
            `
            SELECT r.*, u.name AS assigned_agent_name, u.email AS assigned_agent_email
            FROM full_audit_requests r
            LEFT JOIN users u ON u.id = r.assigned_to_user_id
            WHERE r.id = $1
            `,
            [id]
        );

        res.json({ success: true, request: mapRequestRow(outRows[0] || rows[0]) });
    } catch (err: any) {
        console.error('Admin patch full-audit-requests error:', err);
        res.status(500).json({ error: err.message || 'Failed to update request' });
    }
});

router.post('/full-audit-requests/assign', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const {
            requestId,
            auditId,
            agentId,
            businessName,
            leadId: rawLeadId
        } = req.body || {};

        if (!auditId || !agentId) {
            return res.status(400).json({ error: 'Both auditId and agentId are required.' });
        }

        // Get agent details
        const { rows: uRows } = await query(`SELECT id, name, email FROM users WHERE id = $1`, [agentId]);
        const agent = uRows[0];
        if (!agent) return res.status(404).json({ error: 'Sales agent not found.' });

        let finalLeadId = rawLeadId ? String(rawLeadId).trim() : '';

        // If requestId was supplied and is a UUID, update that request
        if (requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(requestId))) {
            const { rows: reqRows } = await query(
                `UPDATE full_audit_requests
                 SET status = 'completed',
                     fulfilled_audit_id = $2,
                     assigned_to_user_id = $3,
                     completed_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [requestId, auditId, agentId]
            );
            if (reqRows[0]?.lead_id) {
                finalLeadId = reqRows[0].lead_id;
            }
        } else {
            // Find existing request by auditId or create one
            const { rows: existingReqs } = await query(
                `SELECT id, lead_id FROM full_audit_requests WHERE fulfilled_audit_id = $1 OR lead_id = $1 LIMIT 1`,
                [auditId]
            );
            if (existingReqs.length > 0) {
                await query(
                    `UPDATE full_audit_requests
                     SET status = 'completed',
                         fulfilled_audit_id = $2,
                         assigned_to_user_id = $3,
                         completed_at = NOW()
                     WHERE id = $1`,
                    [existingReqs[0].id, auditId, agentId]
                );
                if (existingReqs[0].lead_id) finalLeadId = existingReqs[0].lead_id;
            } else {
                await query(
                    `INSERT INTO full_audit_requests (
                        lead_id, business_name, status, source, fulfilled_audit_id, assigned_to_user_id, completed_at
                    ) VALUES ($1, $2, 'completed', 'admin_audit', $3, $4, NOW())`,
                    [finalLeadId || auditId, businessName || 'Business', auditId, agentId]
                );
            }
        }

        // Link audit_id and assigned_to on sales_leads
        const bizName = String(businessName || '').trim();
        try {
            if (finalLeadId) {
                await query(
                    `UPDATE sales_leads
                     SET audit_id = $1, assigned_to = $2, updated_at = NOW()
                     WHERE id::text = $3`,
                    [auditId, agentId, finalLeadId]
                );
            }
            await query(
                `UPDATE sales_leads
                 SET audit_id = $1, assigned_to = $2, updated_at = NOW()
                 WHERE audit_id = $1 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(name)) = LOWER(TRIM($3)))`,
                [auditId, agentId, bizName]
            );
        } catch (linkErr) {
            console.warn('Could not sync sales_leads assignment:', linkErr);
        }

        // Upsert or re-assign CRM task for the sales agent
        try {
            const taskLeadId = finalLeadId || auditId;
            // Complete or update previous tasks for other agents if re-assigning
            await query(
                `UPDATE lead_tasks
                 SET assigned_to_user_id = $1, updated_at = NOW()
                 WHERE lead_id = $2 AND (notes ILIKE $3 OR title ILIKE '%Growth Audit Ready%')`,
                [agentId, taskLeadId, `%${auditId}%`]
            );

            const { rows: existingTasks } = await query(
                `SELECT id FROM lead_tasks
                 WHERE lead_id = $1 AND assigned_to_user_id = $2 AND (notes ILIKE $3 OR title ILIKE '%Growth Audit Ready%')
                 LIMIT 1`,
                [taskLeadId, agentId, `%${auditId}%`]
            );

            if (!existingTasks[0]) {
                await query(
                    `INSERT INTO lead_tasks (
                        lead_id, assigned_to_user_id, task_type, title, notes, priority, status, created_by_role, created_by_name
                    ) VALUES ($1, $2, 'follow_up_call', $3, $4, 'high', 'pending', 'admin', 'Admin')`,
                    [
                        taskLeadId,
                        agentId,
                        `Growth Audit Ready: Deliver & Pitch to ${bizName || 'Lead'}`,
                        `Full Growth Audit is ready (${auditId}). Review the live report and share the PDF report with the business.`
                    ]
                );
            }

            await query(
                `INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note)
                 VALUES ($1, 'Admin', 'task_event', 'full_audit_assigned', $2)`,
                [
                    taskLeadId,
                    `Admin assigned Full Growth Audit (${auditId}) to sales agent ${agent.name || agent.email} to deliver to client`
                ]
            );
        } catch (taskErr) {
            console.warn('Could not create/update task for assigned audit:', taskErr);
        }

        res.json({ success: true, message: `Full audit assigned to ${agent.name || agent.email}` });
    } catch (err: any) {
        console.error('Admin assign full audit error:', err);
        res.status(500).json({ error: err.message || 'Failed to assign audit' });
    }
});

export default router;
