import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { generateSlots, datesWithAvailability } from '../lib/availability';
import { newManageToken } from '../lib/authTokens';
import { fetchBusyBlocks, updateCalendarEvent, deleteCalendarEvent } from '../lib/googleCalendar';
import {
    sendCancellationEmail,
    sendRescheduleEmail
} from '../lib/bookingEmail';
import { buildIcs } from '../lib/ics';
import { confirmBookingPayment } from '../lib/confirmBooking';
import { refundBookingDeposit } from '../lib/invoices';
import {
    applicationFeeAmount,
    stripeAccountOpts
} from '../lib/stripeConnect';
import { upsertClientWithProperty } from '../lib/clients';
import { loadPortalByToken } from '../lib/clientPortal';
import {
    cancelRemindersForCancelledBooking,
    issuePortalAccess,
    processDueScheduledMessages,
    sendRequestReceivedEmail
} from '../lib/bookingReminders';
import {
    approveQuoteByToken,
    confirmQuoteDeposit,
    declineQuoteByToken,
    loadQuoteByToken
} from '../lib/quotes';
import { getPublicSite } from '../lib/marketing';
import { applyReferralCode } from '../lib/marketing';

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function normalizePhotoUrls(raw: any): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((u) => String(u || '').trim())
        .filter((u) => /^https?:\/\//i.test(u))
        .slice(0, 12);
}

function createPublicRouter({ stripeClient }: { stripeClient: any }) {
    const router = Router();

    async function loadOrg(hostSlug: any) {
        const { rows } = await query('SELECT * FROM organizations WHERE slug = $1', [hostSlug]);
        return rows[0] || null;
    }

    async function loadOrgByBookingSession(sessionId: string) {
        const { rows } = await query(
            `SELECT o.stripe_account_id
             FROM bookings b
             JOIN organizations o ON o.id = b.org_id
             WHERE b.stripe_session_id = $1
             LIMIT 1`,
            [sessionId]
        );
        return rows[0] || null;
    }

    async function loadEventType(orgId: any, eventSlug: any) {
        const { rows } = await query(
            'SELECT * FROM event_types WHERE org_id = $1 AND slug = $2 AND active = TRUE',
            [orgId, eventSlug]
        );
        return rows[0] || null;
    }

    async function getHostUserId(orgId: any) {
        const { rows } = await query(
            `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
            [orgId]
        );
        return rows[0]?.user_id || null;
    }

    async function computeAvailability(org: any, eventType: any, fromDate: any, toDate: any, userId: any) {
        const [{ rows: dateRules }, { rows: weeklyRules }] = await Promise.all([
            query('SELECT * FROM availability_date_rules WHERE org_id = $1', [org.id]),
            query('SELECT * FROM availability_rules WHERE org_id = $1 AND enabled = TRUE', [org.id])
        ]);
        const { rows: bookings } = await query(
            `SELECT start_at, end_at FROM bookings
             WHERE org_id = $1 AND status IN ('confirmed', 'done') AND start_at >= $2 AND start_at <= $3`,
            [org.id, new Date(fromDate), new Date(`${toDate}T23:59:59`)]
        );
        let busyBlocks: any[] = [];
        if (userId) {
            busyBlocks = await fetchBusyBlocks(userId, `${fromDate}T00:00:00`, `${toDate}T23:59:59`);
        }
        return generateSlots({
            fromDate,
            toDate,
            timezone: org.timezone,
            dateRules,
            weeklyRules,
            durationMinutes: eventType.duration_minutes,
            bufferMinutes: org.buffer_minutes,
            minNoticeHours: org.min_notice_hours,
            maxDaysAhead: org.max_days_ahead,
            existingBookings: bookings,
            busyBlocks
        });
    }

    router.get('/checkout/verify', async (req: Request, res: Response) => {
        try {
            const sessionId = String(req.query.session_id || '').trim();
            if (!sessionId) return res.status(400).json({ error: 'session_id required' });
            if (!stripeClient) return res.status(400).json({ error: 'Stripe not configured' });

            const orgRow = await loadOrgByBookingSession(sessionId);
            const session = await stripeClient.checkout.sessions.retrieve(
                sessionId,
                {},
                stripeAccountOpts(orgRow?.stripe_account_id)
            );
            if (session.payment_status !== 'paid') return res.status(402).json({ error: 'Payment not completed' });

            const booking = await confirmBookingPayment({
                bookingId: session.metadata?.bookingId,
                stripeSessionId: sessionId,
                paymentIntentId: session.payment_intent
            });
            if (!booking) return res.status(404).json({ error: 'Booking not found' });

            res.json({
                booking,
                manageUrl: `${frontendOrigin()}/book/manage/${booking.manage_token}`
            });
        } catch (err: any) {
            console.error('Verify error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/manage/:token', async (req: Request, res: Response) => {
        const { rows } = await query(
            `SELECT b.*, e.name AS event_name, e.slug AS event_slug, e.duration_minutes,
                    o.slug AS org_slug, o.name AS org_name
             FROM bookings b JOIN event_types e ON e.id = b.event_type_id JOIN organizations o ON o.id = b.org_id
             WHERE b.manage_token = $1`,
            [req.params.token]
        );
        if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
        res.json({ booking: rows[0] });
    });

    router.get('/portal/:token', async (req: Request, res: Response) => {
        try {
            processDueScheduledMessages(20).catch(() => {});
            const data = await loadPortalByToken(String(req.params.token));
            if (!data) return res.status(404).json({ error: 'Portal link invalid or expired' });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/quotes/checkout/verify', async (req: Request, res: Response) => {
        try {
            const sessionId = String(req.query.session_id || '');
            if (!sessionId || !stripeClient) return res.status(400).json({ error: 'session_id required' });
            const { rows: qrows } = await query(`SELECT * FROM quotes WHERE stripe_session_id = $1`, [sessionId]);
            if (!qrows.length) return res.status(404).json({ error: 'Quote checkout not found' });
            const quote = qrows[0];
            const { rows: orgRows } = await query(
                `SELECT stripe_account_id FROM organizations WHERE id = $1`,
                [quote.org_id]
            );
            const session = await stripeClient.checkout.sessions.retrieve(
                sessionId,
                {},
                stripeAccountOpts(orgRows[0]?.stripe_account_id)
            );
            if (session.payment_status === 'paid') {
                await confirmQuoteDeposit({
                    quoteId: quote.id,
                    stripeSessionId: sessionId,
                    paymentIntentId: session.payment_intent
                });
            }
            const data = await loadQuoteByToken(quote.public_token);
            res.json({ quote: data?.quote, lineItems: data?.lineItems, paymentStatus: session.payment_status });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/quotes/:token', async (req: Request, res: Response) => {
        try {
            const data = await loadQuoteByToken(String(req.params.token));
            if (!data) return res.status(404).json({ error: 'Quote not found' });
            const q = data.quote;
            res.json({
                quote: {
                    id: q.id,
                    title: q.title,
                    notes: q.notes,
                    status: q.status,
                    subtotalCents: q.subtotal_cents,
                    depositCents: q.deposit_cents,
                    depositPaid: q.deposit_paid,
                    currency: q.org_currency || q.currency || 'GBP',
                    expiryDate: q.expiry_date,
                    businessName: q.org_name,
                    clientName: q.client_name,
                    bookingId: q.booking_id
                },
                lineItems: data.lineItems.map((li: any) => ({
                    id: li.id,
                    description: li.description,
                    quantity: Number(li.quantity),
                    unitPriceCents: li.unit_price_cents
                }))
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/quotes/:token/approve', async (req: Request, res: Response) => {
        try {
            const result = await approveQuoteByToken(String(req.params.token), { stripeClient });
            res.json(result);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        }
    });

    router.post('/quotes/:token/decline', async (req: Request, res: Response) => {
        try {
            const data = await declineQuoteByToken(String(req.params.token));
            res.json(data);
        } catch (err: any) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    router.post('/portal/:token/request', async (req: Request, res: Response) => {
        try {
            const data = await loadPortalByToken(String(req.params.token));
            if (!data) return res.status(404).json({ error: 'Portal link invalid or expired' });

            const { eventSlug, description, preferredAt, photoUrls } = req.body || {};
            const { rows: tok } = await query(
                `SELECT org_id, client_id FROM client_portal_tokens WHERE token = $1 AND expires_at > NOW()`,
                [String(req.params.token)]
            );
            if (!tok.length) return res.status(404).json({ error: 'Portal link invalid or expired' });
            const orgId = tok[0].org_id;
            const slug = String(eventSlug || data.eventTypes[0]?.slug || '').trim();
            if (!slug) return res.status(400).json({ error: 'No bookable service available' });

            const et = await loadEventType(orgId, slug);
            if (!et) return res.status(404).json({ error: 'Service not found' });

            const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
            const org = orgRows[0];
            const preferred = preferredAt ? new Date(preferredAt) : new Date(Date.now() + 86400000);
            if (Number.isNaN(preferred.getTime())) {
                return res.status(400).json({ error: 'Invalid preferredAt' });
            }
            const end = new Date(preferred.getTime() + (et.duration_minutes || 60) * 60000);
            const photos = normalizePhotoUrls(photoUrls);
            const manageToken = newManageToken();

            const { rows: propRows } = await query(
                `SELECT * FROM client_properties WHERE client_id = $1 ORDER BY created_at ASC LIMIT 1`,
                [tok[0].client_id]
            );

            const { rows: bookingRows } = await query(
                `INSERT INTO bookings (
                    org_id, event_type_id, status, customer_name, customer_email, customer_phone,
                    customer_address, description, start_at, end_at, deposit_cents, total_cents, manage_token,
                    client_id, property_id, job_status, photo_urls, preferred_slots, intake_type, deposit_paid
                 ) VALUES (
                    $1,$2,'confirmed',$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,'requested',$14::jsonb,$15::jsonb,'request',TRUE
                 ) RETURNING *`,
                [
                    orgId,
                    et.id,
                    data.client.name,
                    data.client.email,
                    data.client.phone || '',
                    data.client.address || propRows[0]?.address || '',
                    description || '',
                    preferred.toISOString(),
                    end.toISOString(),
                    et.total_cents,
                    manageToken,
                    tok[0].client_id,
                    propRows[0]?.id || null,
                    JSON.stringify(photos),
                    JSON.stringify([{ startAt: preferred.toISOString(), endAt: end.toISOString() }])
                ]
            );
            const booking = bookingRows[0];
            await sendRequestReceivedEmail({ ...booking, event_name: et.name }, org).catch(() => {});

            res.status(201).json({ success: true, booking });
        } catch (err: any) {
            console.error('Portal request error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/manage/:token/cancel', async (req: Request, res: Response) => {
        try {
            const { rows } = await query('SELECT * FROM bookings WHERE manage_token = $1', [req.params.token]);
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            if (booking.status === 'cancelled') return res.json({ booking, alreadyCancelled: true });

            const { rows: orgRows } = await query(
                'SELECT name, stripe_account_id FROM organizations WHERE id = $1',
                [booking.org_id]
            );
            const org = orgRows[0];

            let refund: any = null;
            let refundError: any = null;
            if (stripeClient && booking.deposit_paid) {
                try {
                    refund = await refundBookingDeposit(stripeClient, booking, org?.stripe_account_id);
                } catch (err: any) {
                    console.error('Public manage refund error:', err.message);
                    refundError = err.message;
                }
            }

            await query(
                `UPDATE bookings SET status = 'cancelled', job_status = 'cancelled', deposit_paid = FALSE, updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );
            await cancelRemindersForCancelledBooking(booking.id).catch(() => {});
            const userId = await getHostUserId(booking.org_id);
            if (userId && booking.google_event_id) await deleteCalendarEvent(userId, booking.google_event_id);

            await sendCancellationEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: org?.name || 'Business',
                startAt: new Date(booking.start_at).toLocaleString('en-GB')
            });

            const updated = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];
            res.json({ success: true, booking: updated, refund, refundError });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/manage/:token/reschedule', async (req: Request, res: Response) => {
        try {
            const { startAt, endAt } = req.body || {};
            if (!startAt || !endAt) return res.status(400).json({ error: 'startAt and endAt required' });

            const { rows } = await query(
                `SELECT b.*, e.duration_minutes FROM bookings b JOIN event_types e ON e.id = b.event_type_id WHERE b.manage_token = $1`,
                [req.params.token]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            if (booking.status !== 'confirmed') {
                return res.status(400).json({ error: 'Only confirmed bookings can be rescheduled' });
            }
            const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [booking.org_id]);
            const org = orgRows[0];
            const { rows: etRows } = await query('SELECT * FROM event_types WHERE id = $1', [booking.event_type_id]);
            const eventType = etRows[0];

            const userId = await getHostUserId(org.id);
            const dateStr = startAt.slice(0, 10);
            const slots = await computeAvailability(org, eventType, dateStr, dateStr, userId);
            const startMs = new Date(startAt).getTime();
            const endMs = new Date(endAt).getTime();
            const valid = slots.some(
                (s: any) => new Date(s.startAt).getTime() === startMs && new Date(s.endAt).getTime() === endMs
            );
            if (!valid) return res.status(409).json({ error: 'Slot not available' });

            await query(
                `UPDATE bookings SET start_at = $1, end_at = $2, updated_at = NOW() WHERE id = $3`,
                [startAt, endAt, booking.id]
            );
            const updated = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];

            if (userId && booking.google_event_id) await updateCalendarEvent(userId, booking.google_event_id, updated);

            await sendRescheduleEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: org.name,
                startAt: new Date(startAt).toLocaleString('en-GB')
            });

            res.json({ booking: updated });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/bookings/:id/calendar.ics', async (req: Request, res: Response) => {
        const { rows } = await query(
            `SELECT b.*, e.name AS event_name, o.name AS org_name FROM bookings b
             JOIN event_types e ON e.id = b.event_type_id JOIN organizations o ON o.id = b.org_id
             WHERE b.id = $1 AND b.status = 'confirmed'`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).send('Not found');
        const b = rows[0];
        const ics = buildIcs({
            uid: `booking-${b.id}@localpulse`,
            summary: `${b.event_name} — ${b.org_name}`,
            description: b.description,
            location: b.customer_address,
            startAt: b.start_at,
            endAt: b.end_at
        });
        res.setHeader('Content-Type', 'text/calendar');
        res.setHeader('Content-Disposition', `attachment; filename="booking-${b.id}.ics"`);
        res.send(ics);
    });

    router.get('/site/:orgSlug', async (req: Request, res: Response) => {
        try {
            const data = await getPublicSite(String(req.params.orgSlug));
            if (!data) return res.status(404).json({ error: 'Site not found' });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:hostSlug', async (req: Request, res: Response) => {
        try {
            const org = await loadOrg(req.params.hostSlug);
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const { rows: eventTypes } = await query(
                'SELECT id, slug, name, description, duration_minutes, deposit_cents, total_cents FROM event_types WHERE org_id = $1 AND active = TRUE ORDER BY sort_order',
                [org.id]
            );
            res.json({
                slug: org.slug,
                name: org.name,
                tradeType: org.trade_type,
                phone: org.phone,
                email: org.email,
                serviceArea: org.service_area,
                eventTypes
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:hostSlug/:eventSlug', async (req: Request, res: Response) => {
        try {
            const org = await loadOrg(req.params.hostSlug);
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const eventType = await loadEventType(org.id, req.params.eventSlug);
            if (!eventType) return res.status(404).json({ error: 'Service not found' });
            res.json({
                host: { slug: org.slug, name: org.name, tradeType: org.trade_type, phone: org.phone, email: org.email, serviceArea: org.service_area },
                eventType: {
                    slug: eventType.slug,
                    name: eventType.name,
                    description: eventType.description,
                    durationMinutes: eventType.duration_minutes,
                    depositCents: eventType.deposit_cents,
                    totalCents: eventType.total_cents
                },
                paymentsMode: stripeClient ? 'stripe' : 'simulated',
                stripePaymentsReady: Boolean(
                    stripeClient && org.stripe_account_id && org.stripe_charges_enabled
                ),
                stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
                maxDaysAhead: org.max_days_ahead,
                minNoticeHours: org.min_notice_hours
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:hostSlug/:eventSlug/availability', async (req: Request, res: Response) => {
        try {
            const org = await loadOrg(req.params.hostSlug);
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const eventType = await loadEventType(org.id, req.params.eventSlug);
            if (!eventType) return res.status(404).json({ error: 'Service not found' });

            const fromDate = (req.query.from as string) || new Date().toISOString().slice(0, 10);
            const toDate = (req.query.to as string) || new Date(Date.now() + org.max_days_ahead * 86400000).toISOString().slice(0, 10);
            const userId = await getHostUserId(org.id);
            const { rows: anyRules } = await query(
                `(SELECT id FROM availability_rules WHERE org_id = $1 AND enabled = TRUE LIMIT 1)
                 UNION ALL
                 (SELECT id FROM availability_date_rules WHERE org_id = $1 AND enabled = TRUE LIMIT 1)`,
                [org.id]
            );
            const slots = await computeAvailability(org, eventType, fromDate, toDate, userId);

            res.json({
                slots,
                availableDates: datesWithAvailability(slots),
                hasAvailabilityRules: anyRules.length > 0,
                maxDaysAhead: org.max_days_ahead
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:hostSlug/:eventSlug/book', async (req: Request, res: Response) => {
        try {
            const org = await loadOrg(req.params.hostSlug);
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const eventType = await loadEventType(org.id, req.params.eventSlug);
            if (!eventType) return res.status(404).json({ error: 'Service not found' });

            const {
                customerName,
                email,
                phone,
                address,
                description,
                startAt,
                endAt,
                intakeType,
                preferredSlots,
                photoUrls
            } = req.body || {};

            const isRequest = intakeType === 'request';
            if (!customerName?.trim() || !email?.trim() || !phone?.trim() || !address?.trim()) {
                return res.status(400).json({ error: 'Name, email, phone, and address are required' });
            }

            let start = startAt;
            let end = endAt;
            const preferred = Array.isArray(preferredSlots) ? preferredSlots : [];

            if (isRequest) {
                if (!preferred.length && !(start && end)) {
                    return res.status(400).json({
                        error: 'Request intake needs preferredSlots (or a provisional startAt/endAt)'
                    });
                }
                if (!(start && end) && preferred[0]?.startAt && preferred[0]?.endAt) {
                    start = preferred[0].startAt;
                    end = preferred[0].endAt;
                }
                if (!(start && end)) {
                    // Provisional window: tomorrow + duration
                    const provisional = new Date(Date.now() + 86400000);
                    provisional.setMinutes(0, 0, 0);
                    start = provisional.toISOString();
                    end = new Date(provisional.getTime() + (eventType.duration_minutes || 60) * 60000).toISOString();
                }
            } else {
                if (!start || !end) {
                    return res.status(400).json({ error: 'Name, email, phone, address, and time slot are required' });
                }
                const userId = await getHostUserId(org.id);
                const dateStr = String(start).slice(0, 10);
                const slots = await computeAvailability(org, eventType, dateStr, dateStr, userId);
                const startMs = new Date(start).getTime();
                const endMs = new Date(end).getTime();
                const valid = slots.some(
                    (s: any) => new Date(s.startAt).getTime() === startMs && new Date(s.endAt).getTime() === endMs
                );
                if (!valid) return res.status(409).json({ error: 'That time slot is no longer available' });
            }

            const { client, property } = await upsertClientWithProperty({
                orgId: org.id,
                name: customerName,
                email,
                phone,
                address,
                status: isRequest ? 'lead' : 'active'
            });

            const photos = normalizePhotoUrls(photoUrls);
            const manageToken = newManageToken();
            const depositCents = isRequest ? 0 : Number(eventType.deposit_cents) || 0;
            const allowSimulated =
                String(process.env.ALLOW_SIMULATED_PAYMENTS || '').toLowerCase() === 'true' ||
                String(process.env.ALLOW_SIMULATED_PAYMENTS || '') === '1';

            if (!isRequest) {
                if (!stripeClient) {
                    if (depositCents > 0 && !allowSimulated) {
                        return res.status(503).json({
                            error:
                                'Card payments are not configured on the server yet. The business cannot collect this deposit until Stripe is set up.',
                            code: 'payments_not_configured'
                        });
                    }
                } else if (depositCents > 0 && (!org.stripe_account_id || !org.stripe_charges_enabled)) {
                    return res.status(400).json({
                        error:
                            'This business has not finished connecting Stripe. Ask them to open Booking → Settings → Integrations and connect Stripe.',
                        code: 'stripe_not_connected'
                    });
                }
            }

            const initialStatus = isRequest ? 'confirmed' : 'awaiting_payment';
            const jobStatus = isRequest ? 'requested' : 'scheduled';

            const pendingRes = await query(
                `INSERT INTO bookings (
                    org_id, event_type_id, status, customer_name, customer_email, customer_phone,
                    customer_address, description, start_at, end_at, deposit_cents, total_cents, manage_token,
                    client_id, property_id, job_status, photo_urls, preferred_slots, intake_type, deposit_paid
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20
                 ) RETURNING *`,
                [
                    org.id,
                    eventType.id,
                    initialStatus,
                    customerName,
                    email.toLowerCase(),
                    phone,
                    address,
                    description || '',
                    start,
                    end,
                    isRequest ? 0 : eventType.deposit_cents,
                    eventType.total_cents,
                    manageToken,
                    client.id,
                    property?.id || null,
                    jobStatus,
                    JSON.stringify(photos),
                    JSON.stringify(preferred),
                    isRequest ? 'request' : 'instant',
                    isRequest
                ]
            );
            const booking = pendingRes.rows[0];

            if (isRequest) {
                try {
                    await sendRequestReceivedEmail(
                        { ...booking, event_name: eventType.name },
                        org
                    );
                    await issuePortalAccess(org.id, client.id, { emailClient: true });
                } catch (err: any) {
                    console.error('Request follow-up error:', err.message);
                }
                return res.json({
                    mode: 'request',
                    success: true,
                    bookingId: booking.id,
                    manageToken,
                    clientId: client.id
                });
            }

            if (!stripeClient || depositCents <= 0) {
                await confirmBookingPayment({ bookingId: booking.id });
                return res.json({
                    mode: stripeClient ? 'free' : 'simulated',
                    success: true,
                    bookingId: booking.id,
                    manageToken,
                    clientId: client.id
                });
            }

            const fee = applicationFeeAmount(depositCents);
            const session = await stripeClient.checkout.sessions.create(
                {
                    mode: 'payment',
                    customer_email: email.toLowerCase(),
                    line_items: [{
                        quantity: 1,
                        price_data: {
                            currency: (org.currency || 'GBP').toLowerCase(),
                            unit_amount: depositCents,
                            product_data: {
                                name: `Deposit — ${eventType.name}`,
                                description: `${org.name} on ${new Date(start).toLocaleString('en-GB')}`
                            }
                        }
                    }],
                    payment_intent_data: {
                        application_fee_amount: fee,
                        metadata: { bookingId: booking.id, orgId: org.id }
                    },
                    metadata: { bookingId: booking.id, orgId: org.id },
                    success_url: `${frontendOrigin()}/book/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${frontendOrigin()}/book/${org.slug}/${eventType.slug}?cancelled=1`
                },
                stripeAccountOpts(org.stripe_account_id)
            );

            await query('UPDATE bookings SET stripe_session_id = $1 WHERE id = $2', [session.id, booking.id]);
            res.json({ mode: 'stripe', url: session.url, sessionId: session.id, clientId: client.id });
        } catch (err: any) {
            console.error('Book error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

export default createPublicRouter;
