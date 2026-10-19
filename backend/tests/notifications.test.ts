import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Notification bells end to end: real SQL (PGlite) through the real routers, auth stubbed by header.
const { pg } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PGlite } = require('@electric-sql/pglite');
    return { pg: new PGlite() };
});

vi.mock('../lib/db', () => ({
    query: async (text: string, params?: any[]) => {
        const r = await pg.query(text, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    }
}));

const userFromHeader = (req: any) => JSON.parse(String(req.headers['x-test-user'] || '{}'));

vi.mock('../middleware/auth', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        const u = userFromHeader(req);
        req.user = u;
        req.orgId = u.org_id || null;
        next();
    }
}));
vi.mock('../admin/adminAuth', () => ({
    requireAdmin: (req: any, _res: any, next: any) => {
        req.admin = { email: 'admin@localseo.net', role: 'admin' };
        next();
    }
}));
vi.mock('../middleware/entitlements', () => ({
    attachEntitlements: async () => ({ features: ['bookings', 'local_presence'] }),
    orgHasFeature: (e: any, f: string) => Boolean(e?.features?.includes(f))
}));
vi.mock('../sales-agent/sales', () => ({ ensureCrmTables: async () => {} }));

import adminNotifications from '../admin/notificationsRoutes';
import { hostNotificationsRouter as hostNotifications, salesNotificationsRouter as salesNotifications } from '../routes/notifications';

let server: Server;
let base = '';
let orgId = '';
let ownerId = '';
let memberId = '';
let agentId = '';
let otherAgentId = '';

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

async function call(path: string, user: any, body?: any) {
    const res = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(user) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, data: (await res.json()) as any };
}

beforeAll(async () => {
    await pg.exec(`
        CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, email TEXT);
        CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);
        CREATE TABLE event_types (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, name TEXT);
        CREATE TABLE bookings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, event_type_id UUID,
            status TEXT DEFAULT 'pending', customer_name TEXT, start_at TIMESTAMPTZ, total_cents INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, name TEXT);
        CREATE TABLE quotes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, client_id UUID, status TEXT, title TEXT,
            subtotal_cents INT DEFAULT 0, responded_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE message_threads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, client_id UUID,
            customer_phone TEXT DEFAULT '', customer_name TEXT DEFAULT '');
        CREATE TABLE messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), thread_id UUID, org_id UUID, direction TEXT,
            channel TEXT DEFAULT 'sms', body TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE review_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, rating INT, name TEXT DEFAULT '',
            comment TEXT DEFAULT '', is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE grid_scans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, keyword TEXT, avg_rank NUMERIC(5,1) DEFAULT 0,
            health INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE plans (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID, plan_id TEXT, status TEXT,
            cancel_at_period_end BOOLEAN DEFAULT FALSE, current_period_end TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW());

        CREATE TABLE sales_leads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT DEFAULT '', source TEXT DEFAULT '',
            status TEXT DEFAULT 'new', assigned_to UUID, next_follow_up_at TIMESTAMPTZ, audit_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE lead_tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id TEXT, assigned_to_user_id UUID, title TEXT,
            priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'pending', due_date TIMESTAMPTZ, completed_at TIMESTAMPTZ,
            created_by_role TEXT DEFAULT 'admin', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE lead_activities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id TEXT, user_id UUID, author_name TEXT DEFAULT 'Admin',
            activity_type TEXT DEFAULT 'note', disposition TEXT, note TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW());
        CREATE TABLE full_audit_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id TEXT, business_name TEXT DEFAULT '', to_email TEXT DEFAULT '',
            status TEXT DEFAULT 'pending', requested_at TIMESTAMPTZ DEFAULT NOW(), assigned_to_user_id UUID, completed_at TIMESTAMPTZ);
        CREATE TABLE lead_observation_email_sends (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id TEXT, to_email TEXT, sent_by_user_id UUID,
            opened_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ);
        CREATE TABLE audit_email_sends (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), audit_id TEXT, to_email TEXT, sent_by_user_id UUID, opened_at TIMESTAMPTZ);
    `);

    orgId = (await pg.query(`INSERT INTO organizations (name) VALUES ('Acme') RETURNING id`)).rows[0].id;
    ownerId = (await pg.query(`INSERT INTO users (name) VALUES ('Owner') RETURNING id`)).rows[0].id;
    memberId = (await pg.query(`INSERT INTO users (name) VALUES ('Member') RETURNING id`)).rows[0].id;
    agentId = (await pg.query(`INSERT INTO users (name) VALUES ('Agent A') RETURNING id`)).rows[0].id;
    otherAgentId = (await pg.query(`INSERT INTO users (name) VALUES ('Agent B') RETURNING id`)).rows[0].id;

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminNotifications);
    app.use('/api/sales', (req: any, _res, next) => {
        req.user = userFromHeader(req);
        next();
    }, salesNotifications);
    app.use('/api/notifications', hostNotifications);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
    server?.close();
});

describe('user (host) bell', () => {
    const owner = () => ({ id: ownerId, org_id: orgId, must_change_password: false });
    const member = () => ({ id: memberId, org_id: orgId, must_change_password: false });

    it('shows real bookings, cancellations, quotes, messages, reviews, scans and billing', async () => {
        const et = (await pg.query(`INSERT INTO event_types (org_id, name) VALUES ($1, 'Haircut') RETURNING id`, [orgId])).rows[0].id;
        await pg.query(
            `INSERT INTO bookings (org_id, event_type_id, customer_name, start_at, created_at, updated_at)
             VALUES ($1, $2, 'Jane', NOW() + INTERVAL '2 days', $3, $3)`,
            [orgId, et, ago(30)]
        );
        await pg.query(
            `INSERT INTO bookings (org_id, event_type_id, status, customer_name, start_at, created_at, updated_at)
             VALUES ($1, $2, 'cancelled', 'Bob', NOW() + INTERVAL '3 days', $3, $4)`,
            [orgId, et, ago(600), ago(20)]
        );
        const client = (await pg.query(`INSERT INTO clients (org_id, name) VALUES ($1, 'Carol') RETURNING id`, [orgId])).rows[0].id;
        await pg.query(
            `INSERT INTO quotes (org_id, client_id, status, title, subtotal_cents, responded_at) VALUES ($1, $2, 'approved', 'Roof', 12000, $3)`,
            [orgId, client, ago(15)]
        );
        const thread = (await pg.query(`INSERT INTO message_threads (org_id, customer_name) VALUES ($1, 'Dave') RETURNING id`, [orgId])).rows[0].id;
        await pg.query(`INSERT INTO messages (thread_id, org_id, direction, body, created_at) VALUES ($1, $2, 'inbound', 'old', $3)`, [thread, orgId, ago(14)]);
        await pg.query(`INSERT INTO messages (thread_id, org_id, direction, body, created_at) VALUES ($1, $2, 'inbound', 'Are you open?', $3)`, [thread, orgId, ago(10)]);
        await pg.query(`INSERT INTO messages (thread_id, org_id, direction, body, created_at) VALUES ($1, $2, 'outbound', 'yes', $3)`, [thread, orgId, ago(9)]);
        await pg.query(`INSERT INTO review_submissions (org_id, rating, name, comment, created_at) VALUES ($1, 5, 'Eve', 'Great!', $2)`, [orgId, ago(8)]);
        await pg.query(`INSERT INTO review_submissions (org_id, rating, name, is_read, created_at) VALUES ($1, 2, 'Old', TRUE, $2)`, [orgId, ago(7)]);
        await pg.query(`INSERT INTO grid_scans (org_id, keyword, avg_rank, health, created_at) VALUES ($1, 'barber', 3.2, 71, $2)`, [orgId, ago(5)]);
        await pg.query(`INSERT INTO plans (id, name) VALUES ('growth', 'Growth')`);
        await pg.query(`INSERT INTO subscriptions (org_id, plan_id, status, updated_at) VALUES ($1, 'growth', 'past_due', $2)`, [orgId, ago(4)]);
        // Another org's data must never leak in.
        const other = (await pg.query(`INSERT INTO organizations (name) VALUES ('Other') RETURNING id`)).rows[0].id;
        await pg.query(`INSERT INTO review_submissions (org_id, rating, name) VALUES ($1, 1, 'Leak')`, [other]);

        const { status, data } = await call('/api/notifications', owner());
        expect(status).toBe(200);
        const titles = data.notifications.map((n: any) => n.title);
        expect(titles).toEqual(
            expect.arrayContaining([
                'New booking from Jane',
                'Booking cancelled — Bob',
                'Carol approved your quote',
                'New message from Dave',
                'New 5★ review from Eve',
                'Rank scan finished: “barber”',
                'Payment failed — update your card'
            ])
        );
        expect(titles.some((t: string) => t.includes('Leak'))).toBe(false);
        // one item per inbox thread, showing the latest inbound message
        const msgs = data.notifications.filter((n: any) => n.type === 'message');
        expect(msgs).toHaveLength(1);
        expect(msgs[0].body).toBe('Are you open?');
        // a review already opened on the Reviews page is not shown
        expect(titles.some((t: string) => t.includes('Old'))).toBe(false);
        expect(data.unreadCount).toBe(data.notifications.filter((n: any) => !n.read).length);
        // newest first
        const times = data.notifications.map((n: any) => new Date(n.time).getTime());
        expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('mark read persists and is per user', async () => {
        const before = await call('/api/notifications', owner());
        const review = before.data.notifications.find((n: any) => n.type === 'review' && !n.read);
        await call('/api/notifications/state', owner(), { type: 'read', ids: [review.id] });

        const after = await call('/api/notifications', owner());
        expect(after.data.notifications.find((n: any) => n.id === review.id).read).toBe(true);
        expect(after.data.unreadCount).toBe(before.data.unreadCount - 1);

        const forMember = await call('/api/notifications', member());
        expect(forMember.data.notifications.find((n: any) => n.id === review.id).read).toBe(false);
    });

    it('clear all sticks after reload, and only genuinely new events come back', async () => {
        const before = await call('/api/notifications', owner());
        expect(before.data.notifications.length).toBeGreaterThan(0);
        await call('/api/notifications/state', owner(), {
            type: 'clear_all',
            ids: before.data.notifications.map((n: any) => n.id)
        });

        const reloaded = await call('/api/notifications', owner());
        expect(reloaded.data.notifications).toEqual([]);
        expect(reloaded.data.unreadCount).toBe(0);

        await pg.query(`INSERT INTO review_submissions (org_id, rating, name, created_at) VALUES ($1, 4, 'Fresh', NOW() + INTERVAL '1 second')`, [orgId]);
        const later = await call('/api/notifications', owner());
        expect(later.data.notifications.map((n: any) => n.title)).toEqual(['New 4★ review from Fresh']);

        // The other team member did not clear anything.
        const forMember = await call('/api/notifications', member());
        expect(forMember.data.notifications.length).toBeGreaterThan(1);
    });

    it('temporary-password notice can be cleared, and returns if a new temp password is issued', async () => {
        const u = { id: memberId, org_id: orgId, must_change_password: true };
        const first = await call('/api/notifications', u);
        const pw = first.data.notifications.find((n: any) => n.type === 'security');
        expect(pw).toBeTruthy();

        await call('/api/notifications/state', u, { type: 'clear_all', ids: [pw.id] });
        const cleared = await call('/api/notifications', u);
        expect(cleared.data.notifications.find((n: any) => n.type === 'security')).toBeUndefined();

        // Password changed -> next load forgets the dismissal; a later temp password shows again.
        await call('/api/notifications', { ...u, must_change_password: false });
        const again = await call('/api/notifications', u);
        expect(again.data.notifications.find((n: any) => n.type === 'security')).toBeTruthy();
    });

    it('rejects bad actions', async () => {
        expect((await call('/api/notifications/state', owner(), { type: 'nope' })).status).toBe(400);
        expect((await call('/api/notifications/state', owner(), { type: 'read', ids: [] })).status).toBe(400);
    });
});

describe('sales agent bell', () => {
    const agent = () => ({ id: agentId });
    let leadId = '';

    it('shows assignments, admin tasks, due tasks, follow-ups, audits, admin notes and email opens — only for my leads', async () => {
        leadId = (await pg.query(
            `INSERT INTO sales_leads (name, assigned_to, next_follow_up_at, audit_id) VALUES ('Joe Plumbing', $1, NOW() - INTERVAL '1 hour', 'aud-1') RETURNING id`,
            [agentId]
        )).rows[0].id;
        const otherLead = (await pg.query(`INSERT INTO sales_leads (name, assigned_to) VALUES ('Not mine', $1) RETURNING id`, [otherAgentId])).rows[0].id;

        await pg.query(`INSERT INTO lead_activities (lead_id, activity_type, note, created_at) VALUES ($1, 'task_event', 'Assigned to telecaller: Agent A', $2)`, [leadId, ago(60)]);
        await pg.query(`INSERT INTO lead_activities (lead_id, note, created_at) VALUES ($1, 'Call them after 5pm', $2)`, [leadId, ago(50)]);
        await pg.query(`INSERT INTO lead_activities (lead_id, user_id, note, created_at) VALUES ($1, $2, 'my own note', $3)`, [leadId, agentId, ago(49)]);
        await pg.query(`INSERT INTO lead_activities (lead_id, note) VALUES ($1, 'someone else lead')`, [otherLead]);
        await pg.query(`INSERT INTO lead_tasks (lead_id, assigned_to_user_id, title, priority, created_at) VALUES ($1, $2, 'Send proposal', 'urgent', $3)`, [leadId, agentId, ago(40)]);
        await pg.query(`INSERT INTO lead_tasks (lead_id, assigned_to_user_id, title, due_date, created_by_role) VALUES ($1, $2, 'Call back', NOW() - INTERVAL '2 days', 'sales_agent')`, [leadId, agentId]);
        await pg.query(`INSERT INTO lead_tasks (lead_id, assigned_to_user_id, title, due_date, status, created_by_role) VALUES ($1, $2, 'Done one', NOW() - INTERVAL '2 days', 'completed', 'sales_agent')`, [leadId, agentId]);
        await pg.query(`INSERT INTO lead_tasks (lead_id, assigned_to_user_id, title) VALUES ($1, $2, 'B task')`, [otherLead, otherAgentId]);
        await pg.query(`INSERT INTO full_audit_requests (lead_id, business_name, status, completed_at) VALUES ($1, 'Joe Plumbing', 'completed', $2)`, [leadId, ago(30)]);
        await pg.query(`INSERT INTO lead_observation_email_sends (lead_id, to_email, sent_by_user_id, opened_at, clicked_at) VALUES ($1, 'joe@x.com', $2, $3, $4)`, [leadId, agentId, ago(20), ago(19)]);
        await pg.query(`INSERT INTO audit_email_sends (audit_id, to_email, sent_by_user_id, opened_at) VALUES ('aud-1', 'joe@x.com', $1, $2)`, [agentId, ago(10)]);

        const { status, data } = await call('/api/sales/notifications', agent());
        expect(status).toBe(200);
        const titles = data.notifications.map((n: any) => n.title);
        expect(titles).toEqual(
            expect.arrayContaining([
                'New lead assigned to you',
                'New urgent priority task',
                'Task overdue',
                'Follow-up due',
                'Full growth audit ready',
                'Admin updated Joe Plumbing',
                'Prospect opened your email',
                'Prospect clicked your email link',
                'Prospect opened the audit report email'
            ])
        );
        const bodies = data.notifications.map((n: any) => n.body).join(' | ');
        expect(bodies).not.toContain('my own note');
        expect(bodies).not.toContain('someone else lead');
        expect(bodies).not.toContain('B task');
        expect(bodies).not.toContain('Done one');
        expect(data.notifications.every((n: any) => n.link === `/sales/leads/${leadId}`)).toBe(true);

        const forB = await call('/api/sales/notifications', { id: otherAgentId });
        expect(forB.data.notifications.map((n: any) => n.body).join(' ')).not.toContain('Joe Plumbing');
    });

    it('clear all sticks across reloads, including time-less due reminders; new work still appears', async () => {
        const before = await call('/api/sales/notifications', agent());
        await call('/api/sales/notifications/state', agent(), {
            type: 'clear_all',
            ids: before.data.notifications.map((n: any) => n.id)
        });
        expect((await call('/api/sales/notifications', agent())).data.notifications).toEqual([]);

        await pg.query(
            `INSERT INTO lead_tasks (lead_id, assigned_to_user_id, title, created_at) VALUES ($1, $2, 'Brand new', NOW() + INTERVAL '1 second')`,
            [leadId, agentId]
        );
        const later = await call('/api/sales/notifications', agent());
        expect(later.data.notifications.map((n: any) => n.body)).toEqual(['Brand new · Joe Plumbing']);
    });

    it('mark all read keeps items listed but unread = 0', async () => {
        const before = await call('/api/sales/notifications', agent());
        await call('/api/sales/notifications/state', agent(), {
            type: 'read_all',
            ids: before.data.notifications.map((n: any) => n.id)
        });
        const after = await call('/api/sales/notifications', agent());
        expect(after.data.notifications.length).toBe(before.data.notifications.length);
        expect(after.data.unreadCount).toBe(0);
    });
});

describe('admin bell', () => {
    it('clearing hides the whole backlog, not just the 50 items that were shown', async () => {
        // 70 recent CRM events: more than one page of the bell.
        for (let i = 0; i < 70; i++) {
            await pg.query(`INSERT INTO lead_activities (lead_id, activity_type, note, created_at) VALUES ('x', 'note', $1, $2)`, [`n${i}`, ago(100 + i)]);
        }
        const first = await call('/api/admin/notifications', {});
        expect(first.status).toBe(200);
        expect(first.data.notifications.length).toBeGreaterThanOrEqual(40);

        await call('/api/admin/notifications/state', {}, {
            type: 'clear_all',
            ids: first.data.notifications.map((n: any) => n.id)
        });
        const reloaded = await call('/api/admin/notifications', {});
        expect(reloaded.data.notifications).toEqual([]);

        await pg.query(`INSERT INTO sales_leads (name, source, created_at) VALUES ('New Co', 'import', NOW() + INTERVAL '1 second')`);
        const later = await call('/api/admin/notifications', {});
        expect(later.data.notifications.map((n: any) => n.title)).toEqual(['New CRM lead added']);
    });

    it('shows completed telecaller tasks and persists read state', async () => {
        await pg.query(
            `INSERT INTO lead_tasks (lead_id, assigned_to_user_id, title, status, completed_at) VALUES ('general', $1, 'Called 10 leads', 'completed', NOW() + INTERVAL '2 seconds')`,
            [agentId]
        );
        const feed = await call('/api/admin/notifications', {});
        const done = feed.data.notifications.find((n: any) => n.title === 'Agent A completed a task');
        expect(done).toBeTruthy();
        expect(done.link).toBe('/admin/tasks');

        await call('/api/admin/notifications/state', {}, { type: 'read', ids: [done.id] });
        const again = await call('/api/admin/notifications', {});
        expect(again.data.notifications.find((n: any) => n.id === done.id).read).toBe(true);
    });
});
