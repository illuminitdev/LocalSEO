import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { requireHost } from '../middleware/auth';
import { uniqueEventSlug } from '../lib/slug';
import { createBalanceInvoice, refundBookingDeposit } from '../lib/invoices';
import { sendInvoiceEmail, sendCancellationEmail } from '../lib/bookingEmail';
import { createBookingOrg, listUserBookingOrgs, assertUserOrgMembership } from '../lib/seed';
import { confirmBookingPayment } from '../lib/confirmBooking';
import { deleteCalendarEvent } from '../lib/googleCalendar';
import { requireFeature } from '../middleware/entitlements';
import {
    connectStatusPayload,
    createConnectAccountLink,
    createConnectLoginLink,
    ensureConnectAccount,
    refreshOrgStripeFromStripe,
    stripeAccountOpts
} from '../lib/stripeConnect';
import {
    getClientDetail,
    listClients,
    upsertClientWithProperty,
    addClientProperty,
    updateClientProperty,
    deleteClientProperty,
    findDuplicateEmail,
    mergeClients
} from '../lib/clients';
import {
    assertFieldAccess,
    listFieldJobs,
    getFieldBooking,
    checkInBooking,
    saveSignature,
    appendJobPhotos
} from '../lib/field';
import { fireZapierEvent } from '../lib/zapier';
import { createUploadPresign, isAllowedMediaUrl } from '../lib/media';
import { newManageToken } from '../lib/authTokens';
import {
    cancelRemindersForCancelledBooking,
    issuePortalAccess,
    processDueScheduledMessages,
    scheduleInvoiceUnpaidReminder,
    schedulePostJobFollowup,
    scheduleVisitReminder
} from '../lib/bookingReminders';
import {
    createQuote,
    listQuotes,
    loadQuoteWithItems,
    markQuoteSent,
    updateQuote
} from '../lib/quotes';
import {
    getThreadMessages,
    listThreads,
    sendOutboundSms,
    smsConfigured
} from '../lib/inbox';
import {
    acceptOrgInvite,
    createOrgInvite,
    listPendingInvites,
    listTeamMembers,
    updateMemberRole
} from '../lib/team';
import {
    addExpense,
    addTimeEntry,
    deleteExpense,
    expensesCsv,
    jobProfitSummary,
    moneyDashboard
} from '../lib/costing';
import {
    createCampaign,
    ensureReferralCode,
    listCampaigns,
    sendCampaign,
    updateSiteContent
} from '../lib/marketing';

function normalizePhotoUrls(raw: any): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((u) => String(u || '').trim())
        .filter((u) => /^https?:\/\//i.test(u))
        .slice(0, 12);
}

async function reconcilePendingPayments(orgId: any, stripeClient: any) {
    if (!stripeClient) return;
    const { rows: orgRows } = await query(
        'SELECT stripe_account_id FROM organizations WHERE id = $1',
        [orgId]
    );
    const stripeAccountId = orgRows[0]?.stripe_account_id || null;
    const { rows } = await query(
        `SELECT id, stripe_session_id FROM bookings
         WHERE org_id = $1 AND status = 'awaiting_payment' AND stripe_session_id IS NOT NULL`,
        [orgId]
    );
    for (const b of rows) {
        try {
            const session = await stripeClient.checkout.sessions.retrieve(
                b.stripe_session_id,
                {},
                stripeAccountOpts(stripeAccountId)
            );
            if (session.payment_status === 'paid') {
                await confirmBookingPayment({
                    bookingId: b.id,
                    stripeSessionId: b.stripe_session_id,
                    paymentIntentId: session.payment_intent
                });
            }
        } catch (err: any) {
            console.error('Reconcile payment error:', b.id, err.message);
        }
    }
}

async function loadDashboard(orgId: any) {
    const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    const org = orgRows[0];
    if (!org) return null;
    const { rows: eventTypes } = await query(
        'SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at',
        [orgId]
    );
    const { rows: bookings } = await query(
        `SELECT b.*, e.name AS event_name, e.slug AS event_slug,
                i.status AS invoice_status, i.stripe_hosted_url AS invoice_url, i.amount_cents AS invoice_amount_cents,
                c.name AS client_name, c.id AS linked_client_id
         FROM bookings b
         JOIN event_types e ON e.id = b.event_type_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         LEFT JOIN clients c ON c.id = b.client_id
         WHERE b.org_id = $1
         ORDER BY b.start_at DESC`,
        [orgId]
    );
    const { rows: dateRules } = await query(
        'SELECT * FROM availability_date_rules WHERE org_id = $1 ORDER BY avail_date, start_time',
        [orgId]
    );
    return { organization: org, eventTypes, bookings, availabilityDateRules: dateRules };
}


function createHostRouter({ stripeClient }: { stripeClient: any }) {
    const router = Router();
    router.use(requireHost);
    router.use(requireFeature('bookings'));

    router.get('/dashboard', async (req: Request, res: Response) => {
        try {
            if (!(req as any).orgId) {
                return res.json({ ready: false, canResume: false });
            }
            const data = await loadDashboard((req as any).orgId);
            const org = data?.organization;
            const hasBookingData = Boolean(
                String(org?.trade_type || '').trim() && (data?.eventTypes || []).length > 0
            );
            const bookingReady = Boolean(org?.setup_complete && hasBookingData);
            if (!bookingReady) {
                return res.json({
                    ready: false,
                    canResume: hasBookingData,
                    organization: hasBookingData
                        ? {
                              id: org.id,
                              slug: org.slug,
                              name: org.name,
                              host_name: org.host_name,
                              trade_type: org.trade_type,
                              service_area: org.service_area
                          }
                        : null,
                    stripeConfigured: Boolean(stripeClient)
                });
            }
            reconcilePendingPayments((req as any).orgId, stripeClient).catch((err: any) => {
                console.error('Background payment reconcile error:', err.message);
            });
            processDueScheduledMessages(25).catch((err: any) => {
                console.error('Reminder process error:', err.message);
            });
            res.json({
                ready: true,
                canResume: false,
                ...data,
                stripeConfigured: Boolean(stripeClient),
                stripeConnect: connectStatusPayload(org)
            });
        } catch (err: any) {
            console.error('Dashboard error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/stripe/status', async (req: Request, res: Response) => {
        try {
            if (!(req as any).orgId) return res.status(400).json({ error: 'No booking organization' });
            if (!stripeClient) {
                return res.json(connectStatusPayload(null));
            }
            const org = await refreshOrgStripeFromStripe(stripeClient, (req as any).orgId);
            res.json(connectStatusPayload(org));
        } catch (err: any) {
            console.error('Stripe status error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/stripe/connect', async (req: Request, res: Response) => {
        try {
            if (!stripeClient) return res.status(400).json({ error: 'Stripe not configured' });
            if (!(req as any).orgId) return res.status(400).json({ error: 'No booking organization' });

            const { rows } = await query('SELECT * FROM organizations WHERE id = $1', [(req as any).orgId]);
            const org = rows[0];
            if (!org) return res.status(404).json({ error: 'Organization not found' });

            const accountId = await ensureConnectAccount(stripeClient, org);
            const url = await createConnectAccountLink(stripeClient, accountId);
            res.json({ url, accountId });
        } catch (err: any) {
            console.error('Stripe connect error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/stripe/dashboard', async (req: Request, res: Response) => {
        try {
            if (!stripeClient) return res.status(400).json({ error: 'Stripe not configured' });
            if (!(req as any).orgId) return res.status(400).json({ error: 'No booking organization' });

            const { rows } = await query(
                'SELECT stripe_account_id FROM organizations WHERE id = $1',
                [(req as any).orgId]
            );
            const accountId = rows[0]?.stripe_account_id;
            if (!accountId) return res.status(400).json({ error: 'Connect Stripe first' });

            const url = await createConnectLoginLink(stripeClient, accountId);
            res.json({ url });
        } catch (err: any) {
            console.error('Stripe dashboard link error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/setup', async (req: Request, res: Response) => {
        try {
            const {
                name,
                businessName,
                tradeType,
                contact,
                phone,
                serviceArea,
                standardDeposit,
                emergencyDeposit,
                deposit,
                currency,
                acceptingEmergencies,
                emergencyNote,
                createNew
            } = req.body || {};

            const rawContact = String(contact || phone || '').trim();
            const isEmail = rawContact.includes('@');
            const parsedPhone = isEmail ? '' : rawContact;
            const parsedEmail = isEmail ? rawContact.toLowerCase() : '';

            if (!String(name || '').trim() || !String(businessName || '').trim() || !String(tradeType || '').trim()) {
                return res.status(400).json({ error: 'Your name, business name, and service type are required.' });
            }

            const userId = (req as any).user?.id || null;
            const forceNew = Boolean(createNew);
            let orgIdForUpdate: string | null = forceNew ? null : (req as any).orgId || null;

            // If current org already has a completed booking service, adding another must create new.
            if (orgIdForUpdate && !forceNew) {
                const { rows: existing } = await query(
                    `SELECT trade_type,
                            EXISTS (SELECT 1 FROM event_types et WHERE et.org_id = organizations.id LIMIT 1) AS has_events
                     FROM organizations WHERE id = $1`,
                    [orgIdForUpdate]
                );
                const row = existing[0];
                if (row && String(row.trade_type || '').trim() && row.has_events) {
                    orgIdForUpdate = null;
                }
            }

            const org = await createBookingOrg({
                hostName: name,
                businessName,
                tradeType,
                phone: parsedPhone,
                email: parsedEmail,
                serviceArea,
                standardDeposit: standardDeposit ?? deposit ?? 45,
                emergencyDeposit: emergencyDeposit ?? 60,
                currency,
                acceptingEmergencies,
                emergencyNote,
                orgId: orgIdForUpdate,
                userId,
                createNew: forceNew || !orgIdForUpdate
            });

            const data = await loadDashboard(org.id);
            res.status(201).json({ ready: true, orgSlug: org.slug, ...data, stripeConfigured: Boolean(stripeClient) });
        } catch (err: any) {
            console.error('Setup error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/organizations', async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) {
                // Dev slug-only auth: return current org if any
                if (!(req as any).orgId) return res.json({ organizations: [] });
                const data = await loadDashboard((req as any).orgId);
                const org = data?.organization;
                if (!org) return res.json({ organizations: [] });
                const hasBookingData = Boolean(
                    String(org.trade_type || '').trim() && (data?.eventTypes || []).length > 0
                );
                return res.json({
                    organizations: [
                        {
                            id: org.id,
                            slug: org.slug,
                            name: org.name,
                            host_name: org.host_name,
                            trade_type: org.trade_type,
                            service_area: org.service_area,
                            setup_complete: Boolean(org.setup_complete),
                            canResume: hasBookingData,
                            ready: Boolean(org.setup_complete && hasBookingData)
                        }
                    ]
                });
            }
            const organizations = await listUserBookingOrgs(userId);
            res.json({ organizations });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/organizations', async (req: Request, res: Response) => {
        try {
            const {
                name,
                businessName,
                tradeType,
                contact,
                phone,
                serviceArea,
                standardDeposit,
                emergencyDeposit,
                deposit,
                currency,
                acceptingEmergencies,
                emergencyNote
            } = req.body || {};

            const rawContact = String(contact || phone || '').trim();
            const isEmail = rawContact.includes('@');
            const parsedPhone = isEmail ? '' : rawContact;
            const parsedEmail = isEmail ? rawContact.toLowerCase() : '';

            if (!String(name || '').trim() || !String(businessName || '').trim() || !String(tradeType || '').trim()) {
                return res.status(400).json({ error: 'Your name, business name, and service type are required.' });
            }

            const userId = (req as any).user?.id || null;
            if (!userId) {
                return res.status(401).json({ error: 'Login required to add another booking service' });
            }

            const org = await createBookingOrg({
                hostName: name,
                businessName,
                tradeType,
                phone: parsedPhone,
                email: parsedEmail,
                serviceArea,
                standardDeposit: standardDeposit ?? deposit ?? 45,
                emergencyDeposit: emergencyDeposit ?? 60,
                currency,
                acceptingEmergencies,
                emergencyNote,
                userId,
                createNew: true
            });

            const data = await loadDashboard(org.id);
            res.status(201).json({ ready: true, orgSlug: org.slug, ...data, stripeConfigured: Boolean(stripeClient) });
        } catch (err: any) {
            console.error('Create organization error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    /** Leave booking board only — keeps settings, Stripe, bookings, and event types. */
    router.post('/logout', async (req: Request, res: Response) => {
        try {
            if (!(req as any).orgId) {
                return res.json({ ready: false, canResume: false, success: true });
            }
            const orgId = (req as any).orgId;
            await query(`UPDATE organizations SET setup_complete = FALSE WHERE id = $1`, [orgId]);
            const userId = (req as any).user?.id;
            const organizations = userId ? await listUserBookingOrgs(userId) : [];
            res.json({
                ready: false,
                canResume: organizations.some((o: any) => o.canResume),
                success: true,
                organizations
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** Re-enter booking board with existing saved data (after booking logout). */
    router.post('/resume', async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            let orgId = (req as any).orgId as string | null;
            const bodyOrgId = req.body?.orgId ? String(req.body.orgId) : null;
            const bodySlug = req.body?.slug ? String(req.body.slug).trim() : null;

            if (bodyOrgId || bodySlug) {
                if (userId) {
                    if (bodyOrgId) {
                        const allowed = await assertUserOrgMembership(userId, bodyOrgId);
                        if (!allowed) return res.status(403).json({ error: 'Not a member of that booking service' });
                        orgId = bodyOrgId;
                    } else if (bodySlug) {
                        const { rows } = await query(
                            `SELECT o.id FROM organizations o
                             JOIN memberships m ON m.org_id = o.id
                             WHERE m.user_id = $1 AND o.slug = $2 LIMIT 1`,
                            [userId, bodySlug]
                        );
                        if (!rows.length) return res.status(403).json({ error: 'Not a member of that booking service' });
                        orgId = rows[0].id;
                    }
                } else if (bodySlug) {
                    const { rows } = await query('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', [bodySlug]);
                    orgId = rows[0]?.id || null;
                } else if (bodyOrgId) {
                    orgId = bodyOrgId;
                }
            }

            if (!orgId) {
                return res.status(400).json({ error: 'No booking organization' });
            }
            const { rows: orgs } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
            const org = orgs[0];
            if (!org) return res.status(404).json({ error: 'Organization not found' });

            const { rows: types } = await query('SELECT id FROM event_types WHERE org_id = $1 LIMIT 1', [orgId]);
            if (!String(org.trade_type || '').trim() || !types.length) {
                return res.status(400).json({ error: 'Complete booking setup first.' });
            }

            await query(`UPDATE organizations SET setup_complete = TRUE WHERE id = $1`, [orgId]);
            const data = await loadDashboard(orgId);
            res.json({
                ready: true,
                canResume: false,
                orgSlug: org.slug,
                ...data,
                stripeConfigured: Boolean(stripeClient),
                stripeConnect: connectStatusPayload(data?.organization)
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    /** @deprecated Prefer /logout — no longer deletes org data. */
    router.post('/reset', async (req: Request, res: Response) => {
        try {
            if (!(req as any).orgId) {
                return res.json({ ready: false, canResume: false, success: true });
            }
            await query(`UPDATE organizations SET setup_complete = FALSE WHERE id = $1`, [(req as any).orgId]);
            res.json({ ready: false, success: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/event-types', async (req: Request, res: Response) => {
        if (!(req as any).orgId) return res.status(400).json({ error: 'Complete setup first' });
        const { rows } = await query('SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at', [(req as any).orgId]);
        res.json(rows);
    });

    router.post('/event-types', async (req: Request, res: Response) => {
        try {
            if (!(req as any).orgId) return res.status(400).json({ error: 'Complete setup first' });
            const { name, description, durationMinutes, depositCents, totalCents, active } = req.body || {};
            if (!name) return res.status(400).json({ error: 'Name is required' });
            const slug = await uniqueEventSlug((req as any).orgId, name, query);
            const { rows } = await query(
                `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [(req as any).orgId, slug, name, description || '', Number(durationMinutes) || 60, Number(depositCents) || 4500, Number(totalCents) || Number(depositCents) || 4500, active !== false]
            );
            res.status(201).json(rows[0]);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/event-types/:id', async (req: Request, res: Response) => {
        try {
            const { name, description, durationMinutes, depositCents, totalCents, active } = req.body || {};
            const { rows } = await query(
                `UPDATE event_types SET
                  name = COALESCE($1, name),
                  description = COALESCE($2, description),
                  duration_minutes = COALESCE($3, duration_minutes),
                  deposit_cents = COALESCE($4, deposit_cents),
                  total_cents = COALESCE($5, total_cents),
                  active = COALESCE($6, active)
                 WHERE id = $7 AND org_id = $8 RETURNING *`,
                [name, description, durationMinutes, depositCents, totalCents, active, req.params.id, (req as any).orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Event type not found' });
            res.json(rows[0]);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/event-types/:id', async (req: Request, res: Response) => {
        const { rowCount } = await query('DELETE FROM event_types WHERE id = $1 AND org_id = $2', [req.params.id, (req as any).orgId]);
        if (!rowCount) return res.status(404).json({ error: 'Event type not found' });
        res.json({ success: true });
    });

    router.get('/availability', async (req: Request, res: Response) => {
        const { rows: org } = await query('SELECT timezone, min_notice_hours, max_days_ahead, buffer_minutes FROM organizations WHERE id = $1', [(req as any).orgId]);
        const { rows: dateRules } = await query(
            'SELECT * FROM availability_date_rules WHERE org_id = $1 ORDER BY avail_date, start_time',
            [(req as any).orgId]
        );
        res.json({ settings: org[0], dateRules });
    });

    router.put('/availability', async (req: Request, res: Response) => {
        try {
            const { settings, dateRules } = req.body || {};
            if (settings) {
                await query(
                    `UPDATE organizations SET timezone = COALESCE($1, timezone), min_notice_hours = COALESCE($2, min_notice_hours),
                     max_days_ahead = COALESCE($3, max_days_ahead), buffer_minutes = COALESCE($4, buffer_minutes) WHERE id = $5`,
                    [settings.timezone, settings.minNoticeHours, settings.maxDaysAhead, settings.bufferMinutes, (req as any).orgId]
                );
            }
            if (Array.isArray(dateRules)) {
                await query('DELETE FROM availability_date_rules WHERE org_id = $1', [(req as any).orgId]);
                for (const r of dateRules) {
                    const date = String(r.date || r.avail_date || '').slice(0, 10);
                    const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
                    const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
                    if (!date || !startTime || !endTime) continue;
                    await query(
                        `INSERT INTO availability_date_rules (org_id, avail_date, start_time, end_time, enabled)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [(req as any).orgId, date, startTime, endTime, r.enabled !== false]
                    );
                }
            }
            res.json({ success: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/organization', async (req: Request, res: Response) => {
        const allowed = [
            'name',
            'phone',
            'email',
            'service_area',
            'trade_type',
            'timezone',
            'host_name',
            'reminder_visit_hours',
            'reminder_invoice_days',
            'reminder_post_job_hours',
            'reminders_enabled',
            'sms_enabled',
            'default_hourly_cents',
            'zapier_webhook_url',
            'zapier_secret'
        ];
        const sets: string[] = [];
        const vals: any[] = [];
        let i = 1;
        const map: Record<string, string> = {
            serviceArea: 'service_area',
            tradeType: 'trade_type',
            hostName: 'host_name',
            reminderVisitHours: 'reminder_visit_hours',
            reminderInvoiceDays: 'reminder_invoice_days',
            reminderPostJobHours: 'reminder_post_job_hours',
            remindersEnabled: 'reminders_enabled',
            smsEnabled: 'sms_enabled',
            defaultHourlyCents: 'default_hourly_cents',
            zapierWebhookUrl: 'zapier_webhook_url',
            zapierSecret: 'zapier_secret'
        };
        for (const [k, v] of Object.entries(req.body || {})) {
            const col = map[k] || k;
            if (allowed.includes(col)) {
                sets.push(`${col} = $${i++}`);
                vals.push(v);
            }
        }
        if (!sets.length) return res.status(400).json({ error: 'No fields' });
        vals.push((req as any).orgId);
        const { rows } = await query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
        res.json(rows[0]);
    });

    router.get('/clients', async (req: Request, res: Response) => {
        try {
            const clients = await listClients((req as any).orgId, {
                q: (req.query.q as string) || '',
                status: (req.query.status as string) || ''
            });
            res.json({ clients });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/clients', async (req: Request, res: Response) => {
        try {
            const { name, email, phone, address, status, notes } = req.body || {};
            if (!String(name || '').trim()) return res.status(400).json({ error: 'Name is required' });
            const dup = await findDuplicateEmail((req as any).orgId, email || '');
            const { client, property, duplicateEmail } = await upsertClientWithProperty({
                orgId: (req as any).orgId,
                name,
                email: email || '',
                phone,
                address,
                status: status || 'lead',
                notes
            });
            res.status(201).json({
                client,
                property,
                warning: dup || duplicateEmail ? 'A client with this email already existed and was updated.' : null
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/clients/merge', async (req: Request, res: Response) => {
        try {
            const { keepClientId, mergeClientId } = req.body || {};
            const detail = await mergeClients(
                (req as any).orgId,
                String(keepClientId || ''),
                String(mergeClientId || '')
            );
            res.json(detail);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.get('/clients/:id', async (req: Request, res: Response) => {
        try {
            const detail = await getClientDetail((req as any).orgId, String(req.params.id));
            if (!detail) return res.status(404).json({ error: 'Client not found' });
            res.json(detail);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/clients/:id', async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const clientId = String(req.params.id);
            const { rows: existing } = await query(`SELECT * FROM clients WHERE id = $1 AND org_id = $2`, [
                clientId,
                orgId
            ]);
            if (!existing.length) return res.status(404).json({ error: 'Client not found' });

            const { name, email, phone, status, notes, address } = req.body || {};
            const allowedStatus = ['lead', 'active', 'inactive'];
            const nextStatus = status && allowedStatus.includes(status) ? status : existing[0].status;

            const { rows } = await query(
                `UPDATE clients SET
                    name = COALESCE(NULLIF(trim($1), ''), name),
                    email = COALESCE(NULLIF(lower(trim($2)), ''), email),
                    phone = COALESCE($3, phone),
                    status = $4,
                    notes = COALESCE($5, notes),
                    updated_at = NOW()
                 WHERE id = $6 AND org_id = $7 RETURNING *`,
                [
                    name != null ? String(name) : existing[0].name,
                    email != null ? String(email) : existing[0].email,
                    phone != null ? String(phone) : existing[0].phone,
                    nextStatus,
                    notes != null ? String(notes) : existing[0].notes,
                    clientId,
                    orgId
                ]
            );
            const client = rows[0];
            // Address on PATCH no longer overwrites first property — use property endpoints
            const { rows: props } = await query(
                `SELECT * FROM client_properties WHERE client_id = $1 ORDER BY created_at ASC`,
                [client.id]
            );
            res.json({ client, properties: props, property: props[0] || null });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/clients/:id/properties', async (req: Request, res: Response) => {
        try {
            const property = await addClientProperty((req as any).orgId, String(req.params.id), {
                address: req.body?.address,
                label: req.body?.label,
                notes: req.body?.notes
            });
            res.status(201).json({ property });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.patch('/clients/:id/properties/:propertyId', async (req: Request, res: Response) => {
        try {
            const property = await updateClientProperty(
                (req as any).orgId,
                String(req.params.id),
                String(req.params.propertyId),
                {
                    address: req.body?.address,
                    label: req.body?.label,
                    notes: req.body?.notes
                }
            );
            res.json({ property });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.delete('/clients/:id/properties/:propertyId', async (req: Request, res: Response) => {
        try {
            const property = await deleteClientProperty(
                (req as any).orgId,
                String(req.params.id),
                String(req.params.propertyId)
            );
            res.json({ property });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/clients/:id/portal-link', async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const clientId = String(req.params.id);
            const detail = await getClientDetail(orgId, clientId);
            if (!detail) return res.status(404).json({ error: 'Client not found' });
            const emailClient = Boolean(req.body?.emailClient);
            const result = await issuePortalAccess(orgId, clientId, { emailClient });
            if (req.body?.ensureReferral) {
                await ensureReferralCode(clientId, orgId);
            }
            res.json(result);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/clients/:id/referral-code', async (req: Request, res: Response) => {
        try {
            const client = await ensureReferralCode(String(req.params.id), (req as any).orgId);
            if (!client) return res.status(404).json({ error: 'Client not found' });
            res.json({ client });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Media ---
    router.post('/media/presign', async (req: Request, res: Response) => {
        try {
            const data = await createUploadPresign({
                kind: 'job',
                contentType: String(req.body?.contentType || 'image/jpeg'),
                orgId: (req as any).orgId
            });
            res.json(data);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    // --- Field ---
    router.get('/field/jobs', async (req: Request, res: Response) => {
        try {
            const jobs = await listFieldJobs((req as any).orgId, (req as any).user);
            res.json({ jobs });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/field/jobs/:id', async (req: Request, res: Response) => {
        try {
            const booking = await getFieldBooking((req as any).orgId, String(req.params.id));
            if (!booking) return res.status(404).json({ error: 'Job not found' });
            assertFieldAccess((req as any).user, booking);
            res.json({ booking });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/field/jobs/:id/checkin', async (req: Request, res: Response) => {
        try {
            const booking = await getFieldBooking((req as any).orgId, String(req.params.id));
            if (!booking) return res.status(404).json({ error: 'Job not found' });
            assertFieldAccess((req as any).user, booking);
            const lat = Number(req.body?.lat);
            const lng = Number(req.body?.lng);
            const updated = await checkInBooking((req as any).orgId, booking.id, lat, lng);
            res.json({ booking: updated });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/field/jobs/:id/signature', async (req: Request, res: Response) => {
        try {
            const booking = await getFieldBooking((req as any).orgId, String(req.params.id));
            if (!booking) return res.status(404).json({ error: 'Job not found' });
            assertFieldAccess((req as any).user, booking);
            const url = String(req.body?.signatureUrl || '');
            if (!isAllowedMediaUrl(url)) {
                return res.status(400).json({ error: 'Invalid signature URL' });
            }
            const updated = await saveSignature((req as any).orgId, booking.id, url);
            res.json({ booking: updated });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/field/jobs/:id/photos', async (req: Request, res: Response) => {
        try {
            const booking = await getFieldBooking((req as any).orgId, String(req.params.id));
            if (!booking) return res.status(404).json({ error: 'Job not found' });
            assertFieldAccess((req as any).user, booking);
            const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
            if (urls.some((u: string) => !isAllowedMediaUrl(u))) {
                return res.status(400).json({ error: 'Invalid photo URL' });
            }
            const updated = await appendJobPhotos((req as any).orgId, booking.id, urls);
            res.json({ booking: updated });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    // --- Inbox / SMS ---
    router.get('/inbox', async (req: Request, res: Response) => {
        try {
            const threads = await listThreads((req as any).orgId);
            res.json({ threads, smsConfigured: smsConfigured() });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/inbox/:threadId', async (req: Request, res: Response) => {
        try {
            const data = await getThreadMessages((req as any).orgId, String(req.params.threadId));
            if (!data) return res.status(404).json({ error: 'Thread not found' });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/inbox/:threadId/reply', async (req: Request, res: Response) => {
        try {
            const data = await getThreadMessages((req as any).orgId, String(req.params.threadId));
            if (!data) return res.status(404).json({ error: 'Thread not found' });
            const body = String(req.body?.body || '').trim();
            if (!body) return res.status(400).json({ error: 'Message body required' });
            const result = await sendOutboundSms({
                orgId: (req as any).orgId,
                clientId: data.thread.client_id,
                phone: data.thread.customer_phone,
                name: data.thread.customer_name,
                body
            });
            res.json(result);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    // --- Team ---
    router.get('/team', async (req: Request, res: Response) => {
        try {
            const members = await listTeamMembers((req as any).orgId);
            const invites = await listPendingInvites((req as any).orgId);
            res.json({ members, invites });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/team/invites', async (req: Request, res: Response) => {
        try {
            const result = await createOrgInvite({
                orgId: (req as any).orgId,
                email: req.body?.email,
                role: req.body?.role || 'tech',
                invitedBy: (req as any).user.id
            });
            res.status(201).json(result);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.patch('/team/members/:membershipId', async (req: Request, res: Response) => {
        try {
            const member = await updateMemberRole(
                (req as any).orgId,
                String(req.params.membershipId),
                String(req.body?.role || 'tech'),
                req.body?.active
            );
            res.json({ member });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    // --- Costing ---
    router.get('/bookings/:id/costing', async (req: Request, res: Response) => {
        try {
            const data = await jobProfitSummary((req as any).orgId, String(req.params.id));
            if (!data) return res.status(404).json({ error: 'Booking not found' });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/expenses', async (req: Request, res: Response) => {
        try {
            const expense = await addExpense((req as any).orgId, String(req.params.id), (req as any).user.id, {
                category: req.body?.category,
                amountCents: req.body?.amountCents,
                note: req.body?.note
            });
            res.status(201).json({ expense });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.delete('/expenses/:expenseId', async (req: Request, res: Response) => {
        try {
            const expense = await deleteExpense((req as any).orgId, String(req.params.expenseId));
            res.json({ expense });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/time-entries', async (req: Request, res: Response) => {
        try {
            const entry = await addTimeEntry((req as any).orgId, String(req.params.id), (req as any).user.id, {
                minutes: req.body?.minutes,
                note: req.body?.note
            });
            res.status(201).json({ entry });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.get('/money', async (req: Request, res: Response) => {
        try {
            const summary = await moneyDashboard((req as any).orgId, {
                from: (req.query.from as string) || undefined,
                to: (req.query.to as string) || undefined
            });
            res.json({ summary });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/money/expenses.csv', async (req: Request, res: Response) => {
        try {
            const { rows } = await query(
                `SELECT * FROM job_expenses WHERE org_id = $1 ORDER BY created_at DESC LIMIT 2000`,
                [(req as any).orgId]
            );
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
            res.send(expensesCsv(rows));
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Marketing ---
    router.patch('/marketing/site', async (req: Request, res: Response) => {
        try {
            const org = await updateSiteContent((req as any).orgId, req.body || {});
            res.json({ organization: org });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/campaigns', async (req: Request, res: Response) => {
        try {
            const campaigns = await listCampaigns((req as any).orgId);
            res.json({ campaigns });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/campaigns', async (req: Request, res: Response) => {
        try {
            const campaign = await createCampaign((req as any).orgId, req.body || {});
            res.status(201).json({ campaign });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/campaigns/:id/send', async (req: Request, res: Response) => {
        try {
            const campaign = await sendCampaign((req as any).orgId, String(req.params.id));
            res.json({ campaign });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.get('/quotes', async (req: Request, res: Response) => {
        try {
            const quotes = await listQuotes((req as any).orgId, {
                clientId: (req.query.clientId as string) || undefined,
                status: (req.query.status as string) || undefined
            });
            res.json({ quotes });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/quotes', async (req: Request, res: Response) => {
        try {
            const data = await createQuote((req as any).orgId, req.body || {});
            res.status(201).json(data);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.get('/quotes/:id', async (req: Request, res: Response) => {
        try {
            const data = await loadQuoteWithItems(String(req.params.id), (req as any).orgId);
            if (!data) return res.status(404).json({ error: 'Quote not found' });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/quotes/:id', async (req: Request, res: Response) => {
        try {
            const data = await updateQuote((req as any).orgId, String(req.params.id), req.body || {});
            res.json(data);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/quotes/:id/send', async (req: Request, res: Response) => {
        try {
            const data = await markQuoteSent((req as any).orgId, String(req.params.id), {
                scheduleFollowUp: req.body?.scheduleFollowUp !== false
            });
            res.json(data);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/bookings', async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const {
                eventTypeId,
                customerName,
                email,
                phone,
                address,
                description,
                startAt,
                endAt,
                intakeType,
                preferredSlots,
                photoUrls,
                internalNotes,
                clientStatus,
                propertyId,
                assignedUserId
            } = req.body || {};

            if (!eventTypeId || !String(customerName || '').trim() || !String(email || '').trim()) {
                return res.status(400).json({ error: 'eventTypeId, customerName, and email are required' });
            }

            const { rows: etRows } = await query(
                `SELECT * FROM event_types WHERE id = $1 AND org_id = $2`,
                [eventTypeId, orgId]
            );
            if (!etRows.length) return res.status(404).json({ error: 'Event type not found' });
            const eventType = etRows[0];

            const isRequest = intakeType === 'request';
            let start = startAt;
            let end = endAt;
            const preferred = Array.isArray(preferredSlots) ? preferredSlots : [];

            if (isRequest) {
                if (!preferred.length && !(start && end)) {
                    return res.status(400).json({ error: 'Request needs preferredSlots or a provisional start/end' });
                }
                if (!(start && end) && preferred[0]?.startAt && preferred[0]?.endAt) {
                    start = preferred[0].startAt;
                    end = preferred[0].endAt;
                }
            }

            if (!start || !end) {
                return res.status(400).json({ error: 'startAt and endAt are required' });
            }

            const { client, property } = await upsertClientWithProperty({
                orgId,
                name: customerName,
                email,
                phone,
                address,
                propertyId: propertyId || null,
                status: clientStatus || 'active'
            });

            const photos = normalizePhotoUrls(photoUrls);
            const manageToken = newManageToken();
            const jobStatus = isRequest ? 'requested' : 'scheduled';

            const { rows } = await query(
                `INSERT INTO bookings (
                    org_id, event_type_id, status, customer_name, customer_email, customer_phone,
                    customer_address, description, start_at, end_at, deposit_cents, total_cents, manage_token,
                    client_id, property_id, job_status, photo_urls, preferred_slots, intake_type, internal_notes, deposit_paid, assigned_user_id
                 ) VALUES (
                    $1,$2,'confirmed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,TRUE,$20
                 ) RETURNING *`,
                [
                    orgId,
                    eventType.id,
                    customerName,
                    String(email).trim().toLowerCase(),
                    phone || '',
                    address || property?.address || '',
                    description || '',
                    start,
                    end,
                    eventType.deposit_cents,
                    eventType.total_cents,
                    manageToken,
                    client.id,
                    property?.id || null,
                    jobStatus,
                    JSON.stringify(photos),
                    JSON.stringify(preferred),
                    isRequest ? 'request' : 'instant',
                    internalNotes || '',
                    assignedUserId || null
                ]
            );

            res.status(201).json({ booking: rows[0], client, property });
            const created = rows[0];
            fireZapierEvent(orgId, 'booking.created', {
                bookingId: created.id,
                customerName: created.customer_name,
                startAt: created.start_at,
                jobStatus: created.job_status
            }).catch(() => {});
            if (!isRequest) {
                scheduleVisitReminder({ ...created, event_name: eventType.name }).catch(() => {});
            }
            issuePortalAccess(orgId, client.id, { emailClient: false }).catch(() => {});
        } catch (err: any) {
            console.error('Manual booking error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/bookings/:id', async (req: Request, res: Response) => {
        try {
            const orgId = (req as any).orgId;
            const {
                status,
                jobStatus,
                description,
                internalNotes,
                photoUrls,
                clientId,
                propertyId,
                assignedUserId,
                routeSort,
                startAt,
                endAt
            } = req.body || {};

            const allowedJob = ['requested', 'scheduled', 'in_progress', 'completed', 'cancelled', 'invoiced'];
            const photos =
                photoUrls !== undefined ? JSON.stringify(normalizePhotoUrls(photoUrls)) : null;

            const nextJob =
                jobStatus && allowedJob.includes(jobStatus) ? jobStatus : null;

            const { rows } = await query(
                `UPDATE bookings SET
                    status = COALESCE($1, status),
                    job_status = COALESCE($2, job_status),
                    description = COALESCE($3, description),
                    internal_notes = COALESCE($4, internal_notes),
                    photo_urls = COALESCE($5::jsonb, photo_urls),
                    client_id = COALESCE($6::uuid, client_id),
                    start_at = COALESCE($7::timestamptz, start_at),
                    end_at = COALESCE($8::timestamptz, end_at),
                    property_id = COALESCE($9::uuid, property_id),
                    assigned_user_id = CASE WHEN $10::text = '__clear' THEN NULL ELSE COALESCE($10::uuid, assigned_user_id) END,
                    route_sort = COALESCE($11::int, route_sort),
                    updated_at = NOW()
                 WHERE id = $12 AND org_id = $13 RETURNING *`,
                [
                    status || null,
                    nextJob,
                    description != null ? String(description) : null,
                    internalNotes != null ? String(internalNotes) : null,
                    photos,
                    clientId || null,
                    startAt || null,
                    endAt || null,
                    propertyId || null,
                    assignedUserId === null ? '__clear' : assignedUserId || null,
                    routeSort != null ? Number(routeSort) : null,
                    req.params.id,
                    orgId
                ]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            res.json(rows[0]);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/start', async (req: Request, res: Response) => {
        try {
            const { rows } = await query(
                `SELECT * FROM bookings WHERE id = $1 AND org_id = $2`,
                [req.params.id, (req as any).orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            assertFieldAccess((req as any).user, booking);
            if (booking.status === 'cancelled' || booking.job_status === 'cancelled') {
                return res.status(400).json({ error: 'Cancelled bookings cannot be started' });
            }
            if (booking.job_status === 'completed' || booking.status === 'done') {
                return res.status(400).json({ error: 'Completed bookings cannot be started' });
            }
            const { rows: updated } = await query(
                `UPDATE bookings SET job_status = 'in_progress', started_at = COALESCE(started_at, NOW()),
                    status = CASE WHEN status = 'awaiting_payment' THEN status ELSE 'confirmed' END,
                    updated_at = NOW()
                 WHERE id = $1 RETURNING *`,
                [booking.id]
            );
            res.json({ booking: updated[0] });
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/cancel', async (req: Request, res: Response) => {
        try {
            const { rows } = await query(
                `SELECT b.*, e.name AS event_name FROM bookings b
                 JOIN event_types e ON e.id = b.event_type_id
                 WHERE b.id = $1 AND b.org_id = $2`,
                [req.params.id, (req as any).orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            if (booking.status === 'cancelled') {
                return res.json({ booking, alreadyCancelled: true });
            }

            const { rows: orgRows } = await query(
                'SELECT name, stripe_account_id, currency FROM organizations WHERE id = $1',
                [(req as any).orgId]
            );
            const org = orgRows[0];

            let refund: any = null;
            let refundError: any = null;
            if (stripeClient && booking.deposit_paid) {
                try {
                    refund = await refundBookingDeposit(stripeClient, booking, org?.stripe_account_id);
                } catch (err: any) {
                    console.error('Refund error:', err.message);
                    refundError = err.message;
                }
            }

            await query(
                `UPDATE bookings SET status = 'cancelled', job_status = 'cancelled', deposit_paid = FALSE, updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );
            await cancelRemindersForCancelledBooking(booking.id).catch(() => {});

            const { rows: ownerRows } = await query(
                `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
                [(req as any).orgId]
            );
            const userId = ownerRows[0]?.user_id;
            if (userId && booking.google_event_id) {
                await deleteCalendarEvent(userId, booking.google_event_id);
            }

            await sendCancellationEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: org?.name || 'Business',
                startAt: new Date(booking.start_at).toLocaleString('en-GB')
            });

            const updated = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];
            res.json({ booking: updated, refund, refundError });
        } catch (err: any) {
            console.error('Cancel booking error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/complete', async (req: Request, res: Response) => {
        try {
            const { rows } = await query(
                `SELECT b.*, e.name AS event_name, e.slug AS event_slug
                 FROM bookings b JOIN event_types e ON e.id = b.event_type_id
                 WHERE b.id = $1 AND b.org_id = $2`,
                [req.params.id, (req as any).orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            assertFieldAccess((req as any).user, booking);
            if (booking.status === 'done' || booking.job_status === 'completed') {
                return res.json({ booking, alreadyDone: true });
            }
            const canComplete =
                booking.status === 'confirmed' ||
                ['scheduled', 'in_progress', 'requested'].includes(booking.job_status);
            if (!canComplete) {
                return res.status(400).json({ error: 'Only scheduled or in-progress jobs can be marked done' });
            }

            await query(
                `UPDATE bookings SET status = 'done', job_status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );
            const updated = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];

            // Return immediately so the UI does not hang / fail while Stripe invoice APIs run
            res.json({ booking: updated, invoicePending: Boolean(stripeClient) });

            fireZapierEvent((req as any).orgId, 'booking.completed', {
                bookingId: updated.id,
                customerName: updated.customer_name,
                completedAt: updated.completed_at
            }).catch(() => {});

            schedulePostJobFollowup(updated).catch(() => {});

            if (stripeClient) {
                setImmediate(async () => {
                    try {
                        const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [(req as any).orgId]);
                        const org = orgRows[0];
                        const { rows: etRows } = await query('SELECT * FROM event_types WHERE id = $1', [booking.event_type_id]);
                        const eventType = etRows[0];
                        const invoiceResult = await createBalanceInvoice(stripeClient, updated, eventType, org);
                        if (!invoiceResult.skipped && invoiceResult.stripeInvoiceId) {
                            const invIns = await query(
                                `INSERT INTO invoices (booking_id, client_id, stripe_invoice_id, stripe_hosted_url, amount_cents, status)
                                 VALUES ($1, $2, $3, $4, $5, $6)
                                 ON CONFLICT (booking_id) DO UPDATE SET stripe_invoice_id = EXCLUDED.stripe_invoice_id,
                                   stripe_hosted_url = EXCLUDED.stripe_hosted_url, amount_cents = EXCLUDED.amount_cents,
                                   status = EXCLUDED.status, client_id = COALESCE(EXCLUDED.client_id, invoices.client_id), updated_at = NOW()
                                 RETURNING *`,
                                [
                                    booking.id,
                                    updated.client_id || null,
                                    invoiceResult.stripeInvoiceId,
                                    invoiceResult.hostedUrl,
                                    invoiceResult.amountCents,
                                    invoiceResult.status || 'sent'
                                ]
                            );
                            await query(
                                `UPDATE bookings SET job_status = 'invoiced', updated_at = NOW() WHERE id = $1`,
                                [booking.id]
                            );
                            if (invoiceResult.status !== 'paid') {
                                await sendInvoiceEmail({
                                    to: booking.customer_email,
                                    customerName: booking.customer_name,
                                    businessName: org.name,
                                    amountCents: invoiceResult.amountCents,
                                    currency: org.currency,
                                    invoiceUrl: invoiceResult.hostedUrl
                                });
                                await scheduleInvoiceUnpaidReminder(
                                    invIns.rows[0] || {
                                        id: null,
                                        amount_cents: invoiceResult.amountCents,
                                        stripe_hosted_url: invoiceResult.hostedUrl,
                                        status: invoiceResult.status
                                    },
                                    updated,
                                    org
                                );
                            }
                        }
                    } catch (err: any) {
                        console.error('Balance invoice error (job already marked done):', err.message);
                    }
                });
            }
        } catch (err: any) {
            console.error('Complete booking error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/invoice', async (req: Request, res: Response) => {
        try {
            if (!stripeClient) return res.status(400).json({ error: 'Stripe not configured' });

            const { rows } = await query(
                `SELECT b.*, e.name AS event_name, e.slug AS event_slug
                 FROM bookings b JOIN event_types e ON e.id = b.event_type_id
                 WHERE b.id = $1 AND b.org_id = $2`,
                [req.params.id, (req as any).orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];

            const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [(req as any).orgId]);
            const org = orgRows[0];
            const { rows: etRows } = await query('SELECT * FROM event_types WHERE id = $1', [booking.event_type_id]);
            const eventType = etRows[0];

            const invoiceResult = await createBalanceInvoice(stripeClient, booking, eventType, org);
            if (invoiceResult.skipped) {
                return res.json({ skipped: true, reason: invoiceResult.reason });
            }

            const invIns = await query(
                `INSERT INTO invoices (booking_id, client_id, stripe_invoice_id, stripe_hosted_url, amount_cents, status)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (booking_id) DO UPDATE SET stripe_invoice_id = EXCLUDED.stripe_invoice_id,
                   stripe_hosted_url = EXCLUDED.stripe_hosted_url, amount_cents = EXCLUDED.amount_cents,
                   status = EXCLUDED.status, client_id = COALESCE(EXCLUDED.client_id, invoices.client_id), updated_at = NOW()
                 RETURNING *`,
                [
                    booking.id,
                    booking.client_id || null,
                    invoiceResult.stripeInvoiceId,
                    invoiceResult.hostedUrl,
                    invoiceResult.amountCents,
                    'sent'
                ]
            );
            await scheduleInvoiceUnpaidReminder(invIns.rows[0], booking, org).catch(() => {});

            await query(
                `UPDATE bookings SET status = 'done', job_status = 'invoiced', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );
            schedulePostJobFollowup(booking).catch(() => {});

            const emailResult = await sendInvoiceEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: org.name,
                amountCents: invoiceResult.amountCents,
                currency: org.currency,
                invoiceUrl: invoiceResult.hostedUrl
            });

            res.json({ invoice: invoiceResult, email: emailResult });
        } catch (err: any) {
            console.error('Invoice error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

export default createHostRouter;
