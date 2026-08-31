const express = require('express');
const { query } = require('../lib/db');
const { requireHost } = require('../middleware/auth');
const { uniqueEventSlug } = require('../lib/slug');
const { createBalanceInvoice, refundBookingDeposit } = require('../lib/invoices');
const { sendInvoiceEmail, sendCancellationEmail } = require('../lib/bookingEmail');
const { createBookingOrg } = require('../lib/seed');
const { confirmBookingPayment } = require('../lib/confirmBooking');
const { deleteCalendarEvent } = require('../lib/googleCalendar');

async function reconcilePendingPayments(orgId, stripeClient) {
    if (!stripeClient) return;
    const { rows } = await query(
        `SELECT id, stripe_session_id FROM bookings
         WHERE org_id = $1 AND status = 'awaiting_payment' AND stripe_session_id IS NOT NULL`,
        [orgId]
    );
    for (const b of rows) {
        try {
            const session = await stripeClient.checkout.sessions.retrieve(b.stripe_session_id);
            if (session.payment_status === 'paid') {
                await confirmBookingPayment({
                    bookingId: b.id,
                    stripeSessionId: b.stripe_session_id,
                    paymentIntentId: session.payment_intent
                });
            }
        } catch (err) {
            console.error('Reconcile payment error:', b.id, err.message);
        }
    }
}

async function loadDashboard(orgId) {
    const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    const org = orgRows[0];
    if (!org) return null;
    const { rows: eventTypes } = await query(
        'SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at',
        [orgId]
    );
    const { rows: bookings } = await query(
        `SELECT b.*, e.name AS event_name, e.slug AS event_slug,
                i.status AS invoice_status, i.stripe_hosted_url AS invoice_url, i.amount_cents AS invoice_amount_cents
         FROM bookings b
         JOIN event_types e ON e.id = b.event_type_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE b.org_id = $1
         ORDER BY b.start_at DESC`,
        [orgId]
    );
    const { rows: rules } = await query('SELECT * FROM availability_rules WHERE org_id = $1 ORDER BY day_of_week, start_time', [orgId]);
    return { organization: org, eventTypes, bookings, availabilityRules: rules };
}

function createHostRouter({ stripeClient }) {
    const router = express.Router();
    router.use(requireHost);

    router.get('/dashboard', async (req, res) => {
        try {
            if (!req.orgId) {
                return res.json({ ready: false });
            }
            const data = await loadDashboard(req.orgId);
            if (!data?.organization?.setup_complete) {
                return res.json({ ready: false });
            }
            reconcilePendingPayments(req.orgId, stripeClient).catch((err) => {
                console.error('Background payment reconcile error:', err.message);
            });
            res.json({ ready: true, ...data, stripeConfigured: Boolean(stripeClient) });
        } catch (err) {
            console.error('Dashboard error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/setup', async (req, res) => {
        try {
            const {
                name,
                businessName,
                tradeType,
                phone,
                serviceArea,
                standardDeposit,
                emergencyDeposit,
                deposit,
                currency,
                acceptingEmergencies,
                emergencyNote
            } = req.body || {};

            if (!String(name || '').trim() || !String(businessName || '').trim() || !String(tradeType || '').trim()) {
                return res.status(400).json({ error: 'Your name, business name, and service type are required.' });
            }

            const org = await createBookingOrg({
                hostName: name,
                businessName,
                tradeType,
                phone,
                serviceArea,
                standardDeposit: standardDeposit ?? deposit ?? 45,
                emergencyDeposit: emergencyDeposit ?? 60,
                currency,
                acceptingEmergencies,
                emergencyNote
            });

            const data = await loadDashboard(org.id);
            res.status(201).json({ ready: true, orgSlug: org.slug, ...data, stripeConfigured: Boolean(stripeClient) });
        } catch (err) {
            console.error('Setup error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/reset', async (req, res) => {
        try {
            if (!req.orgId) {
                return res.json({ ready: false, success: true });
            }
            await query('DELETE FROM organizations WHERE id = $1', [req.orgId]);
            res.json({ ready: false, success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/event-types', async (req, res) => {
        if (!req.orgId) return res.status(400).json({ error: 'Complete setup first' });
        const { rows } = await query('SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at', [req.orgId]);
        res.json(rows);
    });

    router.post('/event-types', async (req, res) => {
        try {
            if (!req.orgId) return res.status(400).json({ error: 'Complete setup first' });
            const { name, description, durationMinutes, depositCents, totalCents, active } = req.body || {};
            if (!name) return res.status(400).json({ error: 'Name is required' });
            const slug = await uniqueEventSlug(req.orgId, name, query);
            const { rows } = await query(
                `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [req.orgId, slug, name, description || '', Number(durationMinutes) || 60, Number(depositCents) || 4500, Number(totalCents) || 15000, active !== false]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/event-types/:id', async (req, res) => {
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
                [name, description, durationMinutes, depositCents, totalCents, active, req.params.id, req.orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Event type not found' });
            res.json(rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/event-types/:id', async (req, res) => {
        const { rowCount } = await query('DELETE FROM event_types WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
        if (!rowCount) return res.status(404).json({ error: 'Event type not found' });
        res.json({ success: true });
    });

    router.get('/availability', async (req, res) => {
        const { rows: org } = await query('SELECT timezone, min_notice_hours, max_days_ahead, buffer_minutes FROM organizations WHERE id = $1', [req.orgId]);
        const { rows: rules } = await query('SELECT * FROM availability_rules WHERE org_id = $1 ORDER BY day_of_week, start_time', [req.orgId]);
        res.json({ settings: org[0], rules });
    });

    router.put('/availability', async (req, res) => {
        try {
            const { settings, rules } = req.body || {};
            if (settings) {
                await query(
                    `UPDATE organizations SET timezone = COALESCE($1, timezone), min_notice_hours = COALESCE($2, min_notice_hours),
                     max_days_ahead = COALESCE($3, max_days_ahead), buffer_minutes = COALESCE($4, buffer_minutes) WHERE id = $5`,
                    [settings.timezone, settings.minNoticeHours, settings.maxDaysAhead, settings.bufferMinutes, req.orgId]
                );
            }
            if (Array.isArray(rules)) {
                await query('DELETE FROM availability_rules WHERE org_id = $1', [req.orgId]);
                for (const r of rules) {
                    await query(
                        `INSERT INTO availability_rules (org_id, day_of_week, start_time, end_time, enabled)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [req.orgId, r.dayOfWeek, r.startTime, r.endTime, r.enabled !== false]
                    );
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch('/organization', async (req, res) => {
        const allowed = ['name', 'phone', 'email', 'service_area', 'trade_type', 'timezone'];
        const sets = [];
        const vals = [];
        let i = 1;
        const map = { serviceArea: 'service_area', tradeType: 'trade_type' };
        for (const [k, v] of Object.entries(req.body || {})) {
            const col = map[k] || k;
            if (allowed.includes(col)) {
                sets.push(`${col} = $${i++}`);
                vals.push(v);
            }
        }
        if (!sets.length) return res.status(400).json({ error: 'No fields' });
        vals.push(req.orgId);
        const { rows } = await query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
        res.json(rows[0]);
    });

    router.patch('/bookings/:id', async (req, res) => {
        try {
            const { status } = req.body || {};
            const { rows } = await query(
                `UPDATE bookings SET status = COALESCE($1, status), updated_at = NOW()
                 WHERE id = $2 AND org_id = $3 RETURNING *`,
                [status, req.params.id, req.orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            res.json(rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/cancel', async (req, res) => {
        try {
            const { rows } = await query(
                `SELECT b.*, e.name AS event_name FROM bookings b
                 JOIN event_types e ON e.id = b.event_type_id
                 WHERE b.id = $1 AND b.org_id = $2`,
                [req.params.id, req.orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            if (booking.status === 'cancelled') {
                return res.json({ booking, alreadyCancelled: true });
            }

            let refund = null;
            let refundError = null;
            if (stripeClient && booking.deposit_paid) {
                try {
                    refund = await refundBookingDeposit(stripeClient, booking);
                } catch (err) {
                    console.error('Refund error:', err.message);
                    refundError = err.message;
                }
            }

            await query(
                `UPDATE bookings SET status = 'cancelled', deposit_paid = FALSE, updated_at = NOW() WHERE id = $1`,
                [booking.id]
            );

            const { rows: ownerRows } = await query(
                `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
                [req.orgId]
            );
            const userId = ownerRows[0]?.user_id;
            if (userId && booking.google_event_id) {
                await deleteCalendarEvent(userId, booking.google_event_id);
            }

            const { rows: orgRows } = await query('SELECT name FROM organizations WHERE id = $1', [req.orgId]);
            await sendCancellationEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: orgRows[0]?.name || 'Business',
                startAt: new Date(booking.start_at).toLocaleString('en-GB')
            });

            const updated = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];
            res.json({ booking: updated, refund, refundError });
        } catch (err) {
            console.error('Cancel booking error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/complete', async (req, res) => {
        try {
            const { rows } = await query(
                `SELECT b.*, e.name AS event_name, e.slug AS event_slug
                 FROM bookings b JOIN event_types e ON e.id = b.event_type_id
                 WHERE b.id = $1 AND b.org_id = $2`,
                [req.params.id, req.orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];
            if (booking.status === 'done') {
                return res.json({ booking, alreadyDone: true });
            }
            if (booking.status !== 'confirmed') {
                return res.status(400).json({ error: 'Only confirmed bookings can be marked done' });
            }

            await query(`UPDATE bookings SET status = 'done', updated_at = NOW() WHERE id = $1`, [booking.id]);
            const updated = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];

            let invoiceResult = null;
            let invoiceError = null;
            if (stripeClient) {
                try {
                    const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [req.orgId]);
                    const org = orgRows[0];
                    const { rows: etRows } = await query('SELECT * FROM event_types WHERE id = $1', [booking.event_type_id]);
                    const eventType = etRows[0];
                    invoiceResult = await createBalanceInvoice(stripeClient, updated, eventType, org);
                    if (!invoiceResult.skipped && invoiceResult.stripeInvoiceId) {
                        await query(
                            `INSERT INTO invoices (booking_id, stripe_invoice_id, stripe_hosted_url, amount_cents, status)
                             VALUES ($1, $2, $3, $4, $5)
                             ON CONFLICT (booking_id) DO UPDATE SET stripe_invoice_id = EXCLUDED.stripe_invoice_id,
                               stripe_hosted_url = EXCLUDED.stripe_hosted_url, amount_cents = EXCLUDED.amount_cents,
                               status = EXCLUDED.status, updated_at = NOW()`,
                            [booking.id, invoiceResult.stripeInvoiceId, invoiceResult.hostedUrl, invoiceResult.amountCents, 'sent']
                        );
                        await sendInvoiceEmail({
                            to: booking.customer_email,
                            customerName: booking.customer_name,
                            businessName: org.name,
                            amountCents: invoiceResult.amountCents,
                            currency: org.currency,
                            invoiceUrl: invoiceResult.hostedUrl
                        });
                    }
                } catch (err) {
                    console.error('Balance invoice error (job still marked done):', err.message);
                    invoiceError = err.message;
                }
            }

            res.json({ booking: updated, invoice: invoiceResult, invoiceError });
        } catch (err) {
            console.error('Complete booking error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bookings/:id/invoice', async (req, res) => {
        try {
            if (!stripeClient) return res.status(400).json({ error: 'Stripe not configured' });

            const { rows } = await query(
                `SELECT b.*, e.name AS event_name, e.slug AS event_slug
                 FROM bookings b JOIN event_types e ON e.id = b.event_type_id
                 WHERE b.id = $1 AND b.org_id = $2`,
                [req.params.id, req.orgId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];

            const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [req.orgId]);
            const org = orgRows[0];
            const { rows: etRows } = await query('SELECT * FROM event_types WHERE id = $1', [booking.event_type_id]);
            const eventType = etRows[0];

            const invoiceResult = await createBalanceInvoice(stripeClient, booking, eventType, org);
            if (invoiceResult.skipped) {
                return res.json({ skipped: true, reason: invoiceResult.reason });
            }

            await query(
                `INSERT INTO invoices (booking_id, stripe_invoice_id, stripe_hosted_url, amount_cents, status)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (booking_id) DO UPDATE SET stripe_invoice_id = EXCLUDED.stripe_invoice_id,
                   stripe_hosted_url = EXCLUDED.stripe_hosted_url, amount_cents = EXCLUDED.amount_cents,
                   status = EXCLUDED.status, updated_at = NOW()`,
                [booking.id, invoiceResult.stripeInvoiceId, invoiceResult.hostedUrl, invoiceResult.amountCents, 'sent']
            );

            await query(`UPDATE bookings SET status = 'done', updated_at = NOW() WHERE id = $1`, [booking.id]);

            const emailResult = await sendInvoiceEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: org.name,
                amountCents: invoiceResult.amountCents,
                currency: org.currency,
                invoiceUrl: invoiceResult.hostedUrl
            });

            res.json({ invoice: invoiceResult, email: emailResult });
        } catch (err) {
            console.error('Invoice error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

module.exports = createHostRouter;
