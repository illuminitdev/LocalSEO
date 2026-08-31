const { query } = require('./db');
const { createCalendarEvent } = require('./googleCalendar');
const { sendBookingConfirmationEmail, sendHostBookingNotification } = require('./bookingEmail');

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

async function getHostUserId(orgId) {
    const { rows } = await query(
        `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
        [orgId]
    );
    return rows[0]?.user_id || null;
}

/** Mark booking confirmed after successful Stripe payment; sync calendar & send emails once. */
async function confirmBookingPayment({ bookingId, stripeSessionId, paymentIntentId }) {
    const { rows } = await query(
        `SELECT b.*, e.name AS event_name, o.name AS org_name, o.slug AS org_slug, o.email AS org_email
         FROM bookings b
         JOIN event_types e ON e.id = b.event_type_id
         JOIN organizations o ON o.id = b.org_id
         WHERE b.id = $1 OR ($2::text IS NOT NULL AND b.stripe_session_id = $2)
         LIMIT 1`,
        [bookingId || null, stripeSessionId || null]
    );
    if (!rows.length) return null;

    let booking = rows[0];
    const meta = rows[0];

    if (booking.deposit_paid && booking.status === 'confirmed') {
        return booking;
    }

    await query(
        `UPDATE bookings SET status = 'confirmed', deposit_paid = TRUE,
         stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id), updated_at = NOW()
         WHERE id = $2`,
        [paymentIntentId || null, booking.id]
    );
    booking = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];

    const userId = await getHostUserId(booking.org_id);
    if (userId && !booking.google_event_id) {
        const googleEventId = await createCalendarEvent(userId, booking, { name: meta.event_name }, { name: meta.org_name });
        if (googleEventId) {
            await query('UPDATE bookings SET google_event_id = $1 WHERE id = $2', [googleEventId, booking.id]);
            booking.google_event_id = googleEventId;
        }
    }

    if (!meta.confirmation_email_sent) {
        const manageUrl = `${frontendOrigin()}/book/manage/${booking.manage_token}`;
        const icsUrl = `${frontendOrigin()}/api/public/bookings/${booking.id}/calendar.ics`;
        const slotLabel = new Date(booking.start_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

        await sendBookingConfirmationEmail({
            to: booking.customer_email,
            customerName: booking.customer_name,
            businessName: meta.org_name,
            tradespersonName: meta.org_name,
            date: booking.start_at.slice(0, 10),
            slotLabel,
            depositAmount: booking.deposit_cents,
            currency: 'GBP',
            address: booking.customer_address,
            manageUrl,
            icsUrl
        });

        if (meta.org_email) {
            await sendHostBookingNotification({
                to: meta.org_email,
                customerName: booking.customer_name,
                eventName: meta.event_name,
                startAt: slotLabel,
                address: booking.customer_address
            });
        }

        await query('UPDATE bookings SET confirmation_email_sent = TRUE WHERE id = $1', [booking.id]);
    }

    return booking;
}

module.exports = { confirmBookingPayment };
