import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { attachEntitlements, orgHasFeature } from '../middleware/entitlements';
import { ensureCrmTables } from '../sales-agent/sales';

// Notification bells for all three portals. Feeds are built live from existing tables;
// the notification_state table only remembers what each viewer cleared / read, so it
// survives reloads, browsers and devices. The admin feed lives in admin/notificationsRoutes.ts
// and uses the state helpers exported here.

export type NotificationItem = {
    id: string;
    type: string;
    title: string;
    body: string;
    time: string;
    link: string;
};

export type NotificationState = {
    clearedAt: Date | null;
    clearedIds: Set<string>;
    readIds: Set<string>;
};

export type NotificationAction =
    | { type: 'clear_all'; ids?: string[] }
    | { type: 'read'; ids: string[] }
    | { type: 'read_all'; ids?: string[] }
    | { type: 'dismiss'; ids: string[] };

const MAX_IDS = 500;
const MAX_FEED = 50;

let tableReady = false;

export async function ensureNotificationStateTable() {
    if (tableReady) return;
    await query(`
        CREATE TABLE IF NOT EXISTS notification_state (
            owner_key TEXT NOT NULL,
            panel TEXT NOT NULL,
            cleared_at TIMESTAMPTZ,
            cleared_ids TEXT[] NOT NULL DEFAULT '{}',
            read_ids TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_key, panel)
        )
    `);
    tableReady = true;
}

export async function getNotificationState(ownerKey: string, panel: string): Promise<NotificationState> {
    await ensureNotificationStateTable();
    const { rows } = await query(
        `SELECT cleared_at, cleared_ids, read_ids FROM notification_state WHERE owner_key = $1 AND panel = $2`,
        [ownerKey, panel]
    );
    const row = rows[0];
    return {
        clearedAt: row?.cleared_at ? new Date(row.cleared_at) : null,
        clearedIds: new Set((row?.cleared_ids || []).map(String)),
        readIds: new Set((row?.read_ids || []).map(String))
    };
}

function cleanIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))).slice(0, MAX_IDS);
}

/** Merge new ids onto the end of an existing list, de-duplicated and capped to the newest MAX_IDS. */
function mergeIds(existing: Set<string>, add: string[]): string[] {
    const merged = Array.from(existing).filter((id) => !add.includes(id)).concat(add);
    return merged.slice(-MAX_IDS);
}

export function parseNotificationAction(body: any): NotificationAction | null {
    const type = String(body?.type || '');
    const ids = cleanIds(body?.ids);
    if (type === 'clear_all' || type === 'read_all') return { type, ids };
    if ((type === 'read' || type === 'dismiss') && ids.length) return { type, ids };
    return null;
}

export async function applyNotificationAction(ownerKey: string, panel: string, action: NotificationAction) {
    const state = await getNotificationState(ownerKey, panel);
    const ids = cleanIds(action.ids);
    let clearedAt = state.clearedAt;
    let clearedIds = Array.from(state.clearedIds);
    let readIds = Array.from(state.readIds);

    if (action.type === 'clear_all') {
        clearedAt = new Date();
        clearedIds = mergeIds(state.clearedIds, ids);
        readIds = mergeIds(state.readIds, ids);
    } else if (action.type === 'dismiss') {
        clearedIds = mergeIds(state.clearedIds, ids);
    } else {
        readIds = mergeIds(state.readIds, ids);
    }

    await query(
        `INSERT INTO notification_state (owner_key, panel, cleared_at, cleared_ids, read_ids, updated_at)
         VALUES ($1, $2, $3, $4::text[], $5::text[], NOW())
         ON CONFLICT (owner_key, panel) DO UPDATE SET
            cleared_at = EXCLUDED.cleared_at,
            cleared_ids = EXCLUDED.cleared_ids,
            read_ids = EXCLUDED.read_ids,
            updated_at = NOW()`,
        [ownerKey, panel, clearedAt, clearedIds, readIds]
    );
}

/** Drop ids from both lists (e.g. a notice that should be able to come back later). */
export async function forgetNotificationIds(ownerKey: string, panel: string, ids: string[]) {
    await ensureNotificationStateTable();
    await query(
        `UPDATE notification_state
         SET cleared_ids = ARRAY(SELECT x FROM unnest(cleared_ids) x WHERE NOT (x = ANY($3::text[]))),
             read_ids = ARRAY(SELECT x FROM unnest(read_ids) x WHERE NOT (x = ANY($3::text[]))),
             updated_at = NOW()
         WHERE owner_key = $1 AND panel = $2
           AND (cleared_ids && $3::text[] OR read_ids && $3::text[])`,
        [ownerKey, panel, ids]
    );
}

/**
 * Hide everything cleared (by time watermark or explicit id), mark read flags,
 * sort newest first and cap the list.
 */
export function applyStateToFeed(items: NotificationItem[], state: NotificationState) {
    const clearedMs = state.clearedAt ? state.clearedAt.getTime() : null;
    const seen = new Set<string>();
    const visible = items
        .filter((item) => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            if (state.clearedIds.has(item.id)) return false;
            const t = new Date(item.time).getTime();
            if (clearedMs !== null && Number.isFinite(t) && t <= clearedMs) return false;
            return true;
        })
        .map((item) => ({ ...item, read: state.readIds.has(item.id) }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, MAX_FEED);

    return {
        notifications: visible,
        unreadCount: visible.filter((n) => !n.read).length,
        generatedAt: new Date().toISOString()
    };
}

function clip(text: unknown, max = 120) {
    const s = String(text || '').trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─── Sales-agent bell ─────────────────────────────────────────────────────────
// Live feed of work and lead events relevant to the signed-in agent. Mounted by sales-agent/routes.ts.
export const salesNotificationsRouter = Router();

const SALES_PANEL = 'sales';

function salesOwnerKey(req: Request) {
    return `user:${(req as any).user.id}`;
}

function leadLink(leadId: unknown) {
    const id = String(leadId || '').trim();
    return id && id !== 'general' ? `/sales/leads/${encodeURIComponent(id)}` : '/sales/tasks';
}

/** Lead ids this agent works: assigned leads + leads with tasks assigned to them. */
const MY_LEADS_CTE = `
    my_leads AS (
        SELECT id::text AS lead_id, name FROM sales_leads WHERE assigned_to = $1
        UNION
        SELECT DISTINCT t.lead_id, NULL::text AS name FROM lead_tasks t WHERE t.assigned_to_user_id = $1
    )`;

async function buildSalesFeed(agentId: string): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayKey = todayStart.toISOString().slice(0, 10);

    const run = async (label: string, fn: () => Promise<void>) => {
        try {
            await fn();
        } catch (err: any) {
            console.warn(`[sales-notifications] ${label} failed:`, err?.message || err);
        }
    };

    // Leads newly assigned to me (admin writes an "Assigned to telecaller" activity)
    await run('assignments', async () => {
        const { rows } = await query(
            `SELECT a.id, a.lead_id, a.created_at, l.name
             FROM lead_activities a
             JOIN sales_leads l ON l.id::text = a.lead_id AND l.assigned_to = $1
             WHERE a.created_at >= $2::timestamptz
               AND a.note LIKE 'Assigned to telecaller:%'
             ORDER BY a.created_at DESC
             LIMIT 30`,
            [agentId, since]
        );
        for (const row of rows) {
            items.push({
                id: `assigned:${row.id}`,
                type: 'lead',
                title: 'New lead assigned to you',
                body: String(row.name || '').trim() || 'Lead',
                time: new Date(row.created_at).toISOString(),
                link: leadLink(row.lead_id)
            });
        }
    });

    // New tasks created for me by admin
    await run('admin tasks', async () => {
        const { rows } = await query(
            `SELECT t.id, t.lead_id, t.title, t.priority, t.created_at, l.name
             FROM lead_tasks t
             LEFT JOIN sales_leads l ON l.id::text = t.lead_id
             WHERE t.assigned_to_user_id = $1
               AND COALESCE(t.created_by_role, 'admin') = 'admin'
               AND t.created_at >= $2::timestamptz
             ORDER BY t.created_at DESC
             LIMIT 30`,
            [agentId, since]
        );
        for (const row of rows) {
            const priority = String(row.priority || '');
            items.push({
                id: `task-new:${row.id}`,
                type: 'admin_task',
                title: priority === 'urgent' || priority === 'high' ? `New ${priority} priority task` : 'New task from admin',
                body: [clip(row.title, 90), String(row.name || '').trim()].filter(Boolean).join(' · '),
                time: new Date(row.created_at).toISOString(),
                link: leadLink(row.lead_id)
            });
        }
    });

    // Open tasks due today / overdue (one item per task per day, so it resurfaces daily until done)
    await run('due tasks', async () => {
        const { rows } = await query(
            `WITH ${MY_LEADS_CTE}
             SELECT t.id, t.lead_id, t.title, t.due_date, l.name
             FROM lead_tasks t
             LEFT JOIN sales_leads l ON l.id::text = t.lead_id
             WHERE (t.assigned_to_user_id = $1 OR t.lead_id IN (SELECT lead_id FROM my_leads))
               AND t.status IN ('pending', 'in_progress')
               AND t.due_date IS NOT NULL
               AND t.due_date::date <= CURRENT_DATE
             ORDER BY t.due_date ASC
             LIMIT 30`,
            [agentId]
        );
        for (const row of rows) {
            const overdue = new Date(row.due_date).getTime() < todayStart.getTime();
            items.push({
                id: `task-due:${row.id}:${todayKey}`,
                type: 'due_task',
                title: overdue ? 'Task overdue' : 'Task due today',
                body: [clip(row.title, 90), String(row.name || '').trim()].filter(Boolean).join(' · '),
                time: todayStart.toISOString(),
                link: leadLink(row.lead_id)
            });
        }
    });

    // Lead follow-ups due
    await run('follow-ups', async () => {
        const { rows } = await query(
            `SELECT id, name, next_follow_up_at
             FROM sales_leads
             WHERE assigned_to = $1
               AND next_follow_up_at IS NOT NULL
               AND next_follow_up_at::date <= CURRENT_DATE
               AND COALESCE(status, '') NOT IN ('converted', 'not_interested', 'completed')
             ORDER BY next_follow_up_at ASC
             LIMIT 20`,
            [agentId]
        );
        for (const row of rows) {
            items.push({
                id: `follow-up:${row.id}:${todayKey}`,
                type: 'reminder',
                title: 'Follow-up due',
                body: String(row.name || '').trim() || 'Lead',
                time: todayStart.toISOString(),
                link: leadLink(row.id)
            });
        }
    });

    // Full audits completed for my leads
    await run('full audits', async () => {
        const { rows } = await query(
            `WITH ${MY_LEADS_CTE}
             SELECT r.id, r.lead_id, r.business_name, r.to_email, r.completed_at
             FROM full_audit_requests r
             WHERE r.status = 'completed'
               AND r.completed_at >= $2::timestamptz
               AND (r.assigned_to_user_id = $1 OR r.lead_id IN (SELECT lead_id FROM my_leads))
             ORDER BY r.completed_at DESC
             LIMIT 20`,
            [agentId, since]
        );
        for (const row of rows) {
            items.push({
                id: `audit-ready:${row.id}`,
                type: 'audit',
                title: 'Full growth audit ready',
                body: String(row.business_name || row.to_email || 'Lead').trim(),
                time: new Date(row.completed_at).toISOString(),
                link: leadLink(row.lead_id)
            });
        }
    });

    // Admin notes / updates on my leads
    await run('admin activity', async () => {
        const { rows } = await query(
            `WITH ${MY_LEADS_CTE}
             SELECT a.id, a.lead_id, a.author_name, a.activity_type, a.disposition, a.note, a.created_at, l.name
             FROM lead_activities a
             LEFT JOIN sales_leads l ON l.id::text = a.lead_id
             WHERE a.lead_id IN (SELECT lead_id FROM my_leads)
               AND a.user_id IS DISTINCT FROM $1
               AND a.created_at >= $2::timestamptz
               AND a.note NOT LIKE 'Assigned to telecaller:%'
               AND a.note NOT LIKE 'Unassigned telecaller%'
             ORDER BY a.created_at DESC
             LIMIT 30`,
            [agentId, since]
        );
        for (const row of rows) {
            const author = String(row.author_name || 'Admin').trim() || 'Admin';
            const disposition = String(row.disposition || '').replace(/_/g, ' ').trim();
            items.push({
                id: `activity:${row.id}`,
                type: 'note',
                title: `${author} updated ${String(row.name || '').trim() || 'your lead'}`,
                body: [disposition, clip(row.note)].filter(Boolean).join(' — ') || 'Lead updated',
                time: new Date(row.created_at).toISOString(),
                link: leadLink(row.lead_id)
            });
        }
    });

    // Prospect opened / clicked an observation email I sent
    await run('observation emails', async () => {
        const { rows } = await query(
            `SELECT e.id, e.lead_id, e.to_email, e.opened_at, e.clicked_at, l.name
             FROM lead_observation_email_sends e
             LEFT JOIN sales_leads l ON l.id::text = e.lead_id
             WHERE e.sent_by_user_id = $1
               AND (e.opened_at >= $2::timestamptz OR e.clicked_at >= $2::timestamptz)
             ORDER BY GREATEST(COALESCE(e.opened_at, 'epoch'), COALESCE(e.clicked_at, 'epoch')) DESC
             LIMIT 20`,
            [agentId, since]
        );
        for (const row of rows) {
            const who = String(row.name || row.to_email || 'Prospect').trim();
            if (row.opened_at) {
                items.push({
                    id: `obs-open:${row.id}`,
                    type: 'email',
                    title: 'Prospect opened your email',
                    body: who,
                    time: new Date(row.opened_at).toISOString(),
                    link: leadLink(row.lead_id)
                });
            }
            if (row.clicked_at) {
                items.push({
                    id: `obs-click:${row.id}`,
                    type: 'email',
                    title: 'Prospect clicked your email link',
                    body: who,
                    time: new Date(row.clicked_at).toISOString(),
                    link: leadLink(row.lead_id)
                });
            }
        }
    });

    // Prospect opened an audit report email I sent
    await run('audit emails', async () => {
        const { rows } = await query(
            `SELECT e.id, e.to_email, e.opened_at, l.id AS lead_id, l.name
             FROM audit_email_sends e
             LEFT JOIN LATERAL (
                SELECT id, name FROM sales_leads WHERE audit_id = e.audit_id LIMIT 1
             ) l ON TRUE
             WHERE e.sent_by_user_id = $1
               AND e.opened_at >= $2::timestamptz
             ORDER BY e.opened_at DESC
             LIMIT 20`,
            [agentId, since]
        );
        for (const row of rows) {
            items.push({
                id: `audit-open:${row.id}`,
                type: 'email',
                title: 'Prospect opened the audit report email',
                body: String(row.name || row.to_email || 'Prospect').trim(),
                time: new Date(row.opened_at).toISOString(),
                link: leadLink(row.lead_id)
            });
        }
    });

    return items;
}

salesNotificationsRouter.get('/notifications', async (req: Request, res: Response) => {
    try {
        await ensureCrmTables().catch(() => {});
        const agentId = String((req as any).user.id);
        const [items, state] = await Promise.all([
            buildSalesFeed(agentId),
            getNotificationState(salesOwnerKey(req), SALES_PANEL)
        ]);
        res.json(applyStateToFeed(items, state));
    } catch (err: any) {
        console.error('Sales notifications error:', err);
        res.status(500).json({ error: err.message || 'Failed to load notifications' });
    }
});

salesNotificationsRouter.post('/notifications/state', async (req: Request, res: Response) => {
    try {
        const action = parseNotificationAction(req.body);
        if (!action) return res.status(400).json({ error: 'Invalid notification action' });
        await applyNotificationAction(salesOwnerKey(req), SALES_PANEL, action);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Sales notification state error:', err);
        res.status(500).json({ error: err.message || 'Failed to save notification state' });
    }
});

// ─── User (host) bell ─────────────────────────────────────────────────────────
// Mounted at /api/notifications behind requireAuth only, so every plan gets a bell;
// each feed section checks its own feature entitlement.
export const hostNotificationsRouter = Router();

const PW_NOTIF_ID = 'security:must-change-password';

function hostOwnerKey(req: Request) {
    return `user:${(req as any).user.id}`;
}

function panelFor(req: Request) {
    const orgId = (req as any).orgId;
    return orgId ? `host:${orgId}` : 'host:none';
}

function money(cents: unknown) {
    const n = Number(cents || 0);
    return n > 0 ? (n / 100).toFixed(2) : '';
}

async function buildHostFeed(req: Request): Promise<NotificationItem[]> {
    const user = (req as any).user || {};
    const orgId = (req as any).orgId ? String((req as any).orgId) : null;
    const items: NotificationItem[] = [];

    if (user.must_change_password) {
        items.push({
            id: PW_NOTIF_ID,
            type: 'security',
            title: 'Change your temporary password',
            body: 'You signed in with a ZappSites invite password — set a new one in Settings.',
            time: new Date().toISOString(),
            link: '/account#password'
        });
    }

    if (!orgId) return items;

    let entitlements: any = null;
    try {
        entitlements = await attachEntitlements(req);
    } catch (err: any) {
        console.warn('[host-notifications] entitlements failed:', err?.message || err);
    }
    const has = (feature: string) => orgHasFeature(entitlements, feature);

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayKey = todayStart.toISOString().slice(0, 10);

    const run = async (label: string, fn: () => Promise<void>) => {
        try {
            await fn();
        } catch (err: any) {
            console.warn(`[host-notifications] ${label} failed:`, err?.message || err);
        }
    };

    const tasks: Promise<void>[] = [];

    if (has('bookings')) {
        // New bookings + cancellations
        tasks.push(run('bookings', async () => {
            const { rows } = await query(
                `SELECT b.id, b.status, b.customer_name, b.start_at, b.total_cents, b.created_at, b.updated_at,
                        et.name AS service_name
                 FROM bookings b
                 LEFT JOIN event_types et ON et.id = b.event_type_id
                 WHERE b.org_id = $1
                   AND (b.created_at >= $2::timestamptz
                        OR (b.status = 'cancelled' AND b.updated_at >= $2::timestamptz))
                 ORDER BY GREATEST(b.created_at, b.updated_at) DESC
                 LIMIT 40`,
                [orgId, since]
            );
            for (const row of rows) {
                const who = String(row.customer_name || '').trim() || 'A customer';
                const when = row.start_at
                    ? new Date(row.start_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'UTC'
                      })
                    : '';
                const service = String(row.service_name || '').trim();
                if (new Date(row.created_at).toISOString() >= since) {
                    items.push({
                        id: `booking:${row.id}:new`,
                        type: 'booking',
                        title: `New booking from ${who}`,
                        body: [service, when ? `${when} UTC` : ''].filter(Boolean).join(' · ') || 'New booking',
                        time: new Date(row.created_at).toISOString(),
                        link: '/booking'
                    });
                }
                if (row.status === 'cancelled') {
                    items.push({
                        id: `booking:${row.id}:cancelled`,
                        type: 'booking',
                        title: `Booking cancelled — ${who}`,
                        body: [service, when ? `${when} UTC` : ''].filter(Boolean).join(' · ') || 'Booking cancelled',
                        time: new Date(row.updated_at).toISOString(),
                        link: '/booking'
                    });
                }
            }
        }));

        // Today's schedule summary
        tasks.push(run('today', async () => {
            const { rows } = await query(
                `SELECT COUNT(*)::int AS n
                 FROM bookings
                 WHERE org_id = $1
                   AND status IN ('pending', 'confirmed')
                   AND start_at >= $2::timestamptz
                   AND start_at < $2::timestamptz + INTERVAL '1 day'`,
                [orgId, todayStart.toISOString()]
            );
            const n = Number(rows[0]?.n || 0);
            if (n > 0) {
                items.push({
                    id: `bookings-today:${todayKey}`,
                    type: 'booking',
                    title: `${n} booking${n === 1 ? '' : 's'} today`,
                    body: 'Open your schedule to see today’s appointments.',
                    time: todayStart.toISOString(),
                    link: '/booking'
                });
            }
        }));

        // Quote responses
        tasks.push(run('quotes', async () => {
            const { rows } = await query(
                `SELECT q.id, q.status, q.title, q.subtotal_cents, q.responded_at, q.updated_at, c.name AS client_name
                 FROM quotes q
                 LEFT JOIN clients c ON c.id = q.client_id
                 WHERE q.org_id = $1
                   AND q.status IN ('approved', 'declined', 'expired')
                   AND COALESCE(q.responded_at, q.updated_at) >= $2::timestamptz
                 ORDER BY COALESCE(q.responded_at, q.updated_at) DESC
                 LIMIT 20`,
                [orgId, since]
            );
            for (const row of rows) {
                const who = String(row.client_name || '').trim() || 'Client';
                const amount = money(row.subtotal_cents);
                const verb = row.status === 'approved' ? 'approved' : row.status === 'declined' ? 'declined' : 'expired';
                items.push({
                    id: `quote:${row.id}:${row.status}`,
                    type: 'quote',
                    title: row.status === 'expired' ? `Quote expired — ${who}` : `${who} ${verb} your quote`,
                    body: [clip(row.title, 60), amount].filter(Boolean).join(' · '),
                    time: new Date(row.responded_at || row.updated_at).toISOString(),
                    link: `/quotes/${encodeURIComponent(String(row.id))}`
                });
            }
        }));

        // Latest inbound message per inbox thread
        tasks.push(run('inbox', async () => {
            const { rows } = await query(
                `SELECT DISTINCT ON (m.thread_id)
                        m.id, m.thread_id, m.body, m.channel, m.created_at,
                        COALESCE(NULLIF(t.customer_name, ''), c.name, t.customer_phone) AS who
                 FROM messages m
                 JOIN message_threads t ON t.id = m.thread_id
                 LEFT JOIN clients c ON c.id = t.client_id
                 WHERE m.org_id = $1
                   AND m.direction = 'inbound'
                   AND m.created_at >= $2::timestamptz
                 ORDER BY m.thread_id, m.created_at DESC
                 LIMIT 30`,
                [orgId, since]
            );
            for (const row of rows) {
                items.push({
                    id: `message:${row.id}`,
                    type: 'message',
                    title: `New ${row.channel === 'email' ? 'email' : 'message'} from ${String(row.who || '').trim() || 'a customer'}`,
                    body: clip(row.body) || 'Open your inbox to reply.',
                    time: new Date(row.created_at).toISOString(),
                    link: '/inbox'
                });
            }
        }));
    }

    if (has('local_presence')) {
        // New reviews collected via review link / QR / NFC
        tasks.push(run('reviews', async () => {
            const { rows } = await query(
                `SELECT id, rating, name, comment, created_at
                 FROM review_submissions
                 WHERE org_id = $1 AND created_at >= $2::timestamptz
                   AND is_read = FALSE
                 ORDER BY created_at DESC
                 LIMIT 30`,
                [orgId, since]
            );
            for (const row of rows) {
                const rating = Math.max(1, Math.min(5, Number(row.rating || 0)));
                const who = String(row.name || '').trim() || 'A customer';
                items.push({
                    id: `review:${row.id}`,
                    type: 'review',
                    title: `New ${rating}★ review from ${who}`,
                    body: clip(row.comment) || (rating <= 3 ? 'Low rating — consider following up.' : 'No comment left.'),
                    time: new Date(row.created_at).toISOString(),
                    link: '/reviews'
                });
            }
        }));

        // Completed local-grid rank scans
        tasks.push(run('grid scans', async () => {
            const { rows } = await query(
                `SELECT id, keyword, avg_rank, health, created_at
                 FROM grid_scans
                 WHERE org_id = $1 AND created_at >= $2::timestamptz
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [orgId, since]
            );
            for (const row of rows) {
                const avg = Number(row.avg_rank || 0);
                items.push({
                    id: `grid:${row.id}`,
                    type: 'rank',
                    title: `Rank scan finished: “${clip(row.keyword, 40)}”`,
                    body: [avg > 0 ? `Avg rank ${avg.toFixed(1)}` : '', `Health ${Number(row.health || 0)}%`]
                        .filter(Boolean)
                        .join(' · '),
                    time: new Date(row.created_at).toISOString(),
                    link: '/rank-tracker'
                });
            }
        }));
    }

    // Billing problems (always shown)
    tasks.push(run('billing', async () => {
        const { rows } = await query(
            `SELECT s.id, s.status, s.cancel_at_period_end, s.current_period_end, s.updated_at, p.name AS plan_name
             FROM subscriptions s
             LEFT JOIN plans p ON p.id = s.plan_id
             WHERE s.org_id = $1
               AND s.updated_at >= NOW() - INTERVAL '30 days'
               AND (s.status IN ('past_due', 'unpaid', 'incomplete') OR s.cancel_at_period_end = TRUE)
             ORDER BY s.updated_at DESC
             LIMIT 5`,
            [orgId]
        );
        for (const row of rows) {
            const plan = String(row.plan_name || 'Your plan').trim();
            const endsOn = row.current_period_end
                ? new Date(row.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
            const pastDue = row.status !== 'active' && row.status !== 'trialing';
            items.push({
                id: `billing:${row.id}:${pastDue ? row.status : 'cancelling'}`,
                type: 'billing',
                title: pastDue ? 'Payment failed — update your card' : `${plan} will not renew`,
                body: pastDue
                    ? `${plan} subscription is ${String(row.status).replace(/_/g, ' ')}.`
                    : endsOn
                      ? `Access ends on ${endsOn}.`
                      : 'Your subscription is set to cancel at period end.',
                time: new Date(row.updated_at).toISOString(),
                link: '/account'
            });
        }
    }));

    await Promise.all(tasks);
    return items;
}

hostNotificationsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user || {};
        const key = hostOwnerKey(req);
        const panel = panelFor(req);
        // A previously dismissed password notice must be able to come back if a new temp password is issued.
        if (!user.must_change_password) {
            await forgetNotificationIds(key, panel, [PW_NOTIF_ID]).catch(() => {});
        }
        const [items, state] = await Promise.all([buildHostFeed(req), getNotificationState(key, panel)]);
        res.json(applyStateToFeed(items, state));
    } catch (err: any) {
        console.error('Host notifications error:', err);
        res.status(500).json({ error: err.message || 'Failed to load notifications' });
    }
});

hostNotificationsRouter.post('/state', requireAuth, async (req: Request, res: Response) => {
    try {
        const action = parseNotificationAction(req.body);
        if (!action) return res.status(400).json({ error: 'Invalid notification action' });
        await applyNotificationAction(hostOwnerKey(req), panelFor(req), action);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Host notification state error:', err);
        res.status(500).json({ error: err.message || 'Failed to save notification state' });
    }
});
