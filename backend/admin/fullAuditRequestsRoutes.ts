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

export default router;
