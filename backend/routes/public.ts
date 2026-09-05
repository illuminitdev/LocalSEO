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

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
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
        const { rows: rules } = await query(
            'SELECT * FROM availability_date_rules WHERE org_id = $1 AND enabled = TRUE',
            [org.id]
        );
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
            rules,
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
                `UPDATE bookings SET status = 'cancelled', deposit_paid = FALSE, updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );
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
            const { rows: rules } = await query(
                'SELECT id FROM availability_date_rules WHERE org_id = $1 AND enabled = TRUE LIMIT 1',
                [org.id]
            );
            const slots = await computeAvailability(org, eventType, fromDate, toDate, userId);

            res.json({
                slots,
                availableDates: datesWithAvailability(slots),
                hasAvailabilityRules: rules.length > 0,
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

            const { customerName, email, phone, address, description, startAt, endAt } = req.body || {};
            if (!customerName?.trim() || !email?.trim() || !phone?.trim() || !address?.trim() || !startAt || !endAt) {
                return res.status(400).json({ error: 'Name, email, phone, address, and time slot are required' });
            }

            const userId = await getHostUserId(org.id);
            const dateStr = startAt.slice(0, 10);
            const slots = await computeAvailability(org, eventType, dateStr, dateStr, userId);
            const startMs = new Date(startAt).getTime();
            const endMs = new Date(endAt).getTime();
            const valid = slots.some(
                (s: any) => new Date(s.startAt).getTime() === startMs && new Date(s.endAt).getTime() === endMs
            );
            if (!valid) return res.status(409).json({ error: 'That time slot is no longer available' });

            const manageToken = newManageToken();
            const depositCents = Number(eventType.deposit_cents) || 0;
            const allowSimulated =
                String(process.env.ALLOW_SIMULATED_PAYMENTS || '').toLowerCase() === 'true' ||
                String(process.env.ALLOW_SIMULATED_PAYMENTS || '') === '1';

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

            const pendingRes = await query(
                `INSERT INTO bookings (org_id, event_type_id, status, customer_name, customer_email, customer_phone,
                  customer_address, description, start_at, end_at, deposit_cents, total_cents, manage_token)
                 VALUES ($1,$2,'awaiting_payment',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
                [org.id, eventType.id, customerName, email.toLowerCase(), phone, address, description || '', startAt, endAt, eventType.deposit_cents, eventType.total_cents, manageToken]
            );
            const booking = pendingRes.rows[0];

            if (!stripeClient || depositCents <= 0) {
                await confirmBookingPayment({ bookingId: booking.id });
                return res.json({
                    mode: stripeClient ? 'free' : 'simulated',
                    success: true,
                    bookingId: booking.id,
                    manageToken
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
                                description: `${org.name} on ${new Date(startAt).toLocaleString('en-GB')}`
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
            res.json({ mode: 'stripe', url: session.url, sessionId: session.id });
        } catch (err: any) {
            console.error('Book error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

export default createPublicRouter;
