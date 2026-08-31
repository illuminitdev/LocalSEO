const express = require('express');
const { query } = require('../lib/db');
const { generateSlots, datesWithAvailability } = require('../lib/availability');
const { newManageToken } = require('../lib/authTokens');
const { fetchBusyBlocks, updateCalendarEvent, deleteCalendarEvent } = require('../lib/googleCalendar');
const {
    sendCancellationEmail,
    sendRescheduleEmail
} = require('../lib/bookingEmail');
const { buildIcs } = require('../lib/ics');
const { confirmBookingPayment } = require('../lib/confirmBooking');

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function createPublicRouter({ stripeClient }) {
    const router = express.Router();

    async function loadOrg(hostSlug) {
        const { rows } = await query('SELECT * FROM organizations WHERE slug = $1', [hostSlug]);
        return rows[0] || null;
    }

    async function loadEventType(orgId, eventSlug) {
        const { rows } = await query(
            'SELECT * FROM event_types WHERE org_id = $1 AND slug = $2 AND active = TRUE',
            [orgId, eventSlug]
        );
        return rows[0] || null;
    }

    async function getHostUserId(orgId) {
        const { rows } = await query(
            `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
            [orgId]
        );
        return rows[0]?.user_id || null;
    }

    async function computeAvailability(org, eventType, fromDate, toDate, userId) {
        const { rows: rules } = await query(
            'SELECT * FROM availability_rules WHERE org_id = $1 AND enabled = TRUE',
            [org.id]
        );
        const { rows: bookings } = await query(
            `SELECT start_at, end_at FROM bookings
             WHERE org_id = $1 AND status IN ('confirmed', 'done') AND start_at >= $2 AND start_at <= $3`,
            [org.id, new Date(fromDate), new Date(`${toDate}T23:59:59`)]
        );
        let busyBlocks = [];
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

    router.get('/checkout/verify', async (req, res) => {
        try {
            const sessionId = String(req.query.session_id || '').trim();
            if (!sessionId) return res.status(400).json({ error: 'session_id required' });
            if (!stripeClient) return res.status(400).json({ error: 'Stripe not configured' });

            const session = await stripeClient.checkout.sessions.retrieve(sessionId);
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
        } catch (err) {
            console.error('Verify error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/manage/:token', async (req, res) => {
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

    router.post('/manage/:token/cancel', async (req, res) => {
        try {
            const { rows } = await query('SELECT * FROM bookings WHERE manage_token = $1', [req.params.token]);
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            if (booking.status === 'cancelled') return res.json({ booking });

            await query(`UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [booking.id]);
            const userId = await getHostUserId(booking.org_id);
            if (userId && booking.google_event_id) await deleteCalendarEvent(userId, booking.google_event_id);

            const { rows: orgRows } = await query('SELECT name FROM organizations WHERE id = $1', [booking.org_id]);
            await sendCancellationEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: orgRows[0]?.name || 'Business',
                startAt: new Date(booking.start_at).toLocaleString('en-GB')
            });

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/manage/:token/reschedule', async (req, res) => {
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
                (s) => new Date(s.startAt).getTime() === startMs && new Date(s.endAt).getTime() === endMs
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
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/bookings/:id/calendar.ics', async (req, res) => {
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

    router.get('/:hostSlug', async (req, res) => {
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
                serviceArea: org.service_area,
                eventTypes
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:hostSlug/:eventSlug', async (req, res) => {
        try {
            const org = await loadOrg(req.params.hostSlug);
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const eventType = await loadEventType(org.id, req.params.eventSlug);
            if (!eventType) return res.status(404).json({ error: 'Service not found' });
            res.json({
                host: { slug: org.slug, name: org.name, tradeType: org.trade_type, phone: org.phone, serviceArea: org.service_area },
                eventType: {
                    slug: eventType.slug,
                    name: eventType.name,
                    description: eventType.description,
                    durationMinutes: eventType.duration_minutes,
                    depositCents: eventType.deposit_cents,
                    totalCents: eventType.total_cents
                },
                paymentsMode: stripeClient ? 'stripe' : 'simulated',
                stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
                maxDaysAhead: org.max_days_ahead,
                minNoticeHours: org.min_notice_hours
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:hostSlug/:eventSlug/availability', async (req, res) => {
        try {
            const org = await loadOrg(req.params.hostSlug);
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const eventType = await loadEventType(org.id, req.params.eventSlug);
            if (!eventType) return res.status(404).json({ error: 'Service not found' });

            const fromDate = req.query.from || new Date().toISOString().slice(0, 10);
            const toDate = req.query.to || new Date(Date.now() + org.max_days_ahead * 86400000).toISOString().slice(0, 10);
            const userId = await getHostUserId(org.id);
            const { rows: rules } = await query(
                'SELECT id FROM availability_rules WHERE org_id = $1 AND enabled = TRUE LIMIT 1',
                [org.id]
            );
            const slots = await computeAvailability(org, eventType, fromDate, toDate, userId);

            res.json({
                slots,
                availableDates: datesWithAvailability(slots),
                hasAvailabilityRules: rules.length > 0,
                maxDaysAhead: org.max_days_ahead
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:hostSlug/:eventSlug/book', async (req, res) => {
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
                (s) => new Date(s.startAt).getTime() === startMs && new Date(s.endAt).getTime() === endMs
            );
            if (!valid) return res.status(409).json({ error: 'That time slot is no longer available' });

            const manageToken = newManageToken();
            const pendingRes = await query(
                `INSERT INTO bookings (org_id, event_type_id, status, customer_name, customer_email, customer_phone,
                  customer_address, description, start_at, end_at, deposit_cents, total_cents, manage_token)
                 VALUES ($1,$2,'awaiting_payment',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
                [org.id, eventType.id, customerName, email.toLowerCase(), phone, address, description || '', startAt, endAt, eventType.deposit_cents, eventType.total_cents, manageToken]
            );
            const booking = pendingRes.rows[0];

            if (!stripeClient) {
                await query(
                    `UPDATE bookings SET status = 'confirmed', deposit_paid = TRUE, updated_at = NOW() WHERE id = $1`,
                    [booking.id]
                );
                return res.json({ mode: 'simulated', success: true, bookingId: booking.id, manageToken });
            }

            const session = await stripeClient.checkout.sessions.create({
                mode: 'payment',
                customer_email: email.toLowerCase(),
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency: (org.currency || 'GBP').toLowerCase(),
                        unit_amount: eventType.deposit_cents,
                        product_data: {
                            name: `Deposit — ${eventType.name}`,
                            description: `${org.name} on ${new Date(startAt).toLocaleString('en-GB')}`
                        }
                    }
                }],
                metadata: { bookingId: booking.id },
                success_url: `${frontendOrigin()}/book/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${frontendOrigin()}/book/${org.slug}/${eventType.slug}?cancelled=1`
            });

            await query('UPDATE bookings SET stripe_session_id = $1 WHERE id = $2', [session.id, booking.id]);
            res.json({ mode: 'stripe', url: session.url, sessionId: session.id });
        } catch (err) {
            console.error('Book error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = createPublicRouter;
