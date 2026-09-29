import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAdmin } from './adminAuth';
import { ensureCrmTables } from '../sales-agent/sales';
import { ADMIN_LEAD_TYPES, growthAuditTablesMissing } from './leadHelpers';

const router = Router();

export type AdminNotifType = 'lead' | 'task' | 'audit' | 'system' | 'alert';

type AdminNotifItem = {
    id: string;
    type: AdminNotifType;
    title: string;
    body: string;
    time: string;
    link: string;
};

function leadLabelFromPayload(payload: any, fallbackEmail?: string | null): string {
    const p = payload && typeof payload === 'object' ? payload : {};
    return (
        String(p.businessName || p.name || p.contactName || p.fullName || '').trim() ||
        String(fallbackEmail || '').trim() ||
        'New lead'
    );
}

function typeLabel(type: string): string {
    const t = String(type || '').toLowerCase();
    if (t.includes('visibility')) return 'Visibility check';
    if (t.includes('quick')) return 'Quick growth audit';
    if (t.includes('intake')) return 'Audit intake';
    if (t.includes('contact')) return 'Contact form';
    if (t.includes('checkout')) return 'Checkout lead';
    return 'Growth audit lead';
}

function isDeepAuditRow(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (data.auditKind === 'deep') return true;
    if (data?.score?.mode === 'deep-local-aeo-geo') return true;
    if (data?.crawlMeta?.mode === 'deep-crawl') return true;
    return false;
}

/** Aggregate telecaller CRM updates + ZappSites growth/full audit events for the admin bell. */
router.get('/notifications', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables().catch(() => {});

        const items: AdminNotifItem[] = [];
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // 1) Telecaller / CRM activity updates
        try {
            const { rows } = await query(
                `SELECT
                    a.id,
                    a.lead_id AS "leadId",
                    a.activity_type AS "activityType",
                    a.disposition,
                    a.note,
                    a.author_name AS "authorName",
                    a.created_at AS "createdAt",
                    u.name AS "userName"
                 FROM lead_activities a
                 LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.created_at >= $1::timestamptz
                   AND a.activity_type IN ('call_log', 'status_change', 'note', 'task_event')
                 ORDER BY a.created_at DESC
                 LIMIT 40`,
                [since]
            );

            for (const row of rows) {
                const author = String(row.authorName || row.userName || 'Telecaller').trim();
                const kind = String(row.activityType || 'note');
                const disposition = String(row.disposition || '').replace(/_/g, ' ').trim();
                const note = String(row.note || '').trim();
                const title =
                    kind === 'call_log'
                        ? `${author} logged a call`
                        : kind === 'status_change'
                          ? `${author} updated lead status`
                          : kind === 'task_event'
                            ? `${author} updated a task`
                            : `${author} left a note`;
                const bodyParts = [
                    disposition ? disposition : null,
                    note ? (note.length > 120 ? `${note.slice(0, 117)}…` : note) : null
                ].filter(Boolean);

                items.push({
                    id: `activity:${row.id}`,
                    type: kind === 'task_event' ? 'task' : kind === 'call_log' ? 'alert' : 'task',
                    title,
                    body: bodyParts.join(' — ') || 'CRM update from telecaller',
                    time: new Date(row.createdAt).toISOString(),
                    link: row.leadId ? `/admin/leads/${encodeURIComponent(String(row.leadId))}` : '/admin/tasks'
                });
            }
        } catch (err: any) {
            console.warn('[admin-notifications] activities query failed:', err?.message || err);
        }

        // 2) New mini / growth audit form submissions from ZappSites (shared RDS `submissions`)
        try {
            const { rows } = await query(
                `SELECT s.id, s.type, s.created_at, s.email AS submission_email, s.payload
                 FROM submissions s
                 WHERE s.type = ANY($1::text[])
                   AND s.created_at >= $2::timestamptz
                 ORDER BY s.created_at DESC
                 LIMIT 30`,
                [ADMIN_LEAD_TYPES, since]
            );

            for (const row of rows) {
                const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
                const name = leadLabelFromPayload(payload, row.submission_email);
                const form = typeLabel(row.type);
                items.push({
                    id: `submission:${row.id}`,
                    type: 'lead',
                    title: `New ${form}`,
                    body: name,
                    time: new Date(row.created_at).toISOString(),
                    link: '/admin/growth-audit-leads'
                });
            }
        } catch (err: any) {
            if (!growthAuditTablesMissing(err)) {
                console.warn('[admin-notifications] submissions query failed:', err?.message || err);
            }
        }

        // 3) Full / deep growth audits (shared RDS `audits` — ZappSites + LocalPulse worker)
        try {
            const { rows } = await query(
                `SELECT id, status, data, updated_at, created_at
                 FROM audits
                 WHERE COALESCE(updated_at, created_at) >= $1::timestamptz
                 ORDER BY COALESCE(updated_at, created_at) DESC
                 LIMIT 40`,
                [since]
            );

            for (const row of rows) {
                const data = row.data && typeof row.data === 'object' ? row.data : {};
                if (!isDeepAuditRow(data)) continue;
                const biz =
                    String(data?.business?.businessName || data?.business?.name || '').trim() ||
                    'Business';
                const status = String(row.status || data.status || '').trim() || 'updated';
                items.push({
                    id: `audit:${row.id}`,
                    type: 'audit',
                    title: status === 'completed' || status === 'ready' || status === 'done'
                        ? 'Full growth audit ready'
                        : `Full growth audit ${status}`,
                    body: biz,
                    time: new Date(row.updated_at || row.created_at).toISOString(),
                    link: '/admin/full-audits'
                });
            }
        } catch (err: any) {
            if (!growthAuditTablesMissing(err)) {
                console.warn('[admin-notifications] audits query failed:', err?.message || err);
            }
        }

        // 4) Prospect full-audit requests from observation email CTA
        try {
            const { rows } = await query(
                `SELECT id, business_name, to_email, status, requested_at
                 FROM full_audit_requests
                 WHERE requested_at >= $1::timestamptz
                   AND status IN ('pending', 'in_progress')
                 ORDER BY requested_at DESC
                 LIMIT 30`,
                [since]
            );
            for (const row of rows) {
                items.push({
                    id: `full-audit-req:${row.id}`,
                    type: 'audit',
                    title:
                        row.status === 'in_progress'
                            ? 'Full audit request in progress'
                            : 'New full audit request',
                    body: String(row.business_name || row.to_email || 'Prospect').trim(),
                    time: new Date(row.requested_at).toISOString(),
                    link: '/admin/full-audits?tab=requests'
                });
            }
        } catch (err: any) {
            console.warn('[admin-notifications] full_audit_requests query failed:', err?.message || err);
        }

        items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        res.json({
            notifications: items.slice(0, 50),
            generatedAt: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('Admin notifications error:', err);
        res.status(500).json({ error: err.message || 'Failed to load notifications' });
    }
});

export default router;
