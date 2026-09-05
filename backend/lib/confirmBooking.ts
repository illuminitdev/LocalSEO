import { query } from './db';
import { createCalendarEvent } from './googleCalendar';
import { sendBookingConfirmationEmail, sendHostBookingNotification } from './bookingEmail';

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function datePart(value: any) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

async function getHostUserId(orgId: any) {
    const { rows } = await query(
        `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
        [orgId]
    );
    return rows[0]?.user_id || null;
}

/** Mark booking confirmed after successful Stripe payment (or free/sim); sync calendar & send emails once. */
async function confirmBookingPayment({ bookingId, stripeSessionId, paymentIntentId }: any) {
    const { rows } = await query(
        `SELECT b.*, e.name AS event_name,
                o.name AS org_name, o.slug AS org_slug, o.email AS org_email,
                o.phone AS org_phone, o.host_name AS org_host_name, o.currency AS org_currency
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
    const alreadyConfirmed = booking.deposit_paid && booking.status === 'confirmed';

    if (!alreadyConfirmed) {
        await query(
            `UPDATE bookings SET status = 'confirmed', deposit_paid = TRUE,
             stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id), updated_at = NOW()
             WHERE id = $2`,
            [paymentIntentId || null, booking.id]
        );
        booking = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];
    }

    const userId = await getHostUserId(booking.org_id);
    if (userId && !booking.google_event_id) {
        const googleEventId = await createCalendarEvent(userId, booking, { name: meta.event_name }, { name: meta.org_name });
        if (googleEventId) {
            await query('UPDATE bookings SET google_event_id = $1 WHERE id = $2', [googleEventId, booking.id]);
            booking.google_event_id = googleEventId;
        }
    }

    if (!meta.confirmation_email_sent) {
        try {
            const manageUrl = `${frontendOrigin()}/book/manage/${booking.manage_token}`;
            const icsUrl = `${frontendOrigin()}/api/public/bookings/${booking.id}/calendar.ics`;
            const whenLabel = new Date(booking.start_at).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            const currency = meta.org_currency || 'GBP';

            await sendBookingConfirmationEmail({
                to: booking.customer_email,
                customerName: booking.customer_name,
                businessName: meta.org_name,
                tradespersonName: meta.org_host_name || meta.org_name,
                serviceName: meta.event_name,
                date: datePart(booking.start_at),
                slotLabel: whenLabel,
                depositAmount: booking.deposit_cents,
                currency,
                address: booking.customer_address,
                hostPhone: meta.org_phone,
                hostEmail: meta.org_email,
                manageUrl,
                icsUrl
            });

            if (meta.org_email) {
                await sendHostBookingNotification({
                    to: meta.org_email,
                    customerName: booking.customer_name,
                    customerEmail: booking.customer_email,
                    customerPhone: booking.customer_phone,
                    eventName: meta.event_name,
                    startAt: whenLabel,
                    address: booking.customer_address,
                    depositAmount: booking.deposit_cents,
                    currency,
                    businessName: meta.org_name,
                    hostName: meta.org_host_name || meta.org_name
                });
            } else {
                console.log(
                    `[booking-email] Host notification skipped — set organizations.email for org ${booking.org_id}`
                );
            }

            await query('UPDATE bookings SET confirmation_email_sent = TRUE WHERE id = $1', [booking.id]);
        } catch (emailErr: any) {
            console.error('Booking confirmation email error:', emailErr.message);
        }
    }

    return booking;
}

export { confirmBookingPayment };
