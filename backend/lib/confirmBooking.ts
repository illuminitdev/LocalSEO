import { query } from './db';
import { createCalendarEvent } from './googleCalendar';
import { sendBookingConfirmationEmail, sendHostBookingNotification } from './bookingEmail';
import { scheduleVisitReminder, issuePortalAccess } from './bookingReminders';
import {
    ensureClientForPayment,
    upsertPaymentDocument,
    getPaymentDocumentBySource
} from './paymentDocuments';

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

function serviceLabelFromBooking(booking: any, fallbackName: string) {
    try {
        const answers =
            typeof booking.intake_answers === 'string'
                ? JSON.parse(booking.intake_answers || '{}')
                : booking.intake_answers || {};
        const cart = Array.isArray(answers.cartServices) ? answers.cartServices : [];
        if (cart.length) {
            return cart.map((i: any) => i.name || i.slug).filter(Boolean).join(', ');
        }
    } catch {
        /* ignore */
    }
    return fallbackName || 'Booking';
}

async function confirmBookingPayment({
    bookingId,
    stripeSessionId,
    paymentIntentId,
    paymentMethodBrand,
    paymentMethodLast4
}: any) {
    const { rows } = await query(
        `SELECT b.*, e.name AS event_name,
                o.name AS org_name, o.slug AS org_slug, o.email AS org_email,
                o.phone AS org_phone, o.host_name AS org_host_name, o.currency AS org_currency,
                o.reminder_visit_hours, o.reminders_enabled, o.logo_url AS org_logo_url
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
    const serviceLabel = serviceLabelFromBooking(booking, meta.event_name);
    const alreadyConfirmed = booking.deposit_paid && booking.status === 'confirmed';

    if (!alreadyConfirmed) {
        await query(
            `UPDATE bookings SET status = 'confirmed', deposit_paid = TRUE,
             job_status = COALESCE(NULLIF(job_status, ''), 'scheduled'),
             stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id), updated_at = NOW()
             WHERE id = $2`,
            [paymentIntentId || null, booking.id]
        );
        booking = (await query('SELECT * FROM bookings WHERE id = $1', [booking.id])).rows[0];
    }

    const userId = await getHostUserId(booking.org_id);
    if (userId && !booking.google_event_id) {
        const googleEventId = await createCalendarEvent(userId, booking, { name: serviceLabel }, { name: meta.org_name });
        if (googleEventId) {
            await query('UPDATE bookings SET google_event_id = $1 WHERE id = $2', [googleEventId, booking.id]);
            booking.google_event_id = googleEventId;
        }
    }

    let portalLink = '';
    if (booking.client_id) {
        try {
            const portal = await issuePortalAccess(booking.org_id, booking.client_id, { emailClient: false });
            portalLink = portal.portalUrl;
        } catch (err: any) {
            console.error('Portal token error:', err.message);
        }
    }

    if (!meta.confirmation_email_sent) {
        try {
            const manageUrl = portalLink || `${frontendOrigin()}/book/manage/${booking.manage_token}`;
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
                serviceName: serviceLabel,
                date: datePart(booking.start_at),
                slotLabel: whenLabel,
                depositAmount: booking.deposit_cents,
                currency,
                address: booking.customer_address,
                hostPhone: meta.org_phone,
                hostEmail: meta.org_email,
                manageUrl,
                icsUrl,
                logoUrl: meta.org_logo_url || process.env.BOOKING_EMAIL_LOGO_URL || ''
            });

            if (meta.org_email) {
                await sendHostBookingNotification({
                    to: meta.org_email,
                    customerName: booking.customer_name,
                    customerEmail: booking.customer_email,
                    customerPhone: booking.customer_phone,
                    eventName: serviceLabel,
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

    try {
        await scheduleVisitReminder(
            { ...booking, event_name: serviceLabel },
            {
                id: booking.org_id,
                name: meta.org_name,
                reminders_enabled: meta.reminders_enabled !== false,
                reminder_visit_hours: meta.reminder_visit_hours
            }
        );
    } catch (err: any) {
        console.error('Visit reminder schedule error:', err.message);
    }

    if (!alreadyConfirmed) {
        const { fireZapierEvent } = await import('./zapier');
        fireZapierEvent(booking.org_id, 'booking.created', {
            bookingId: booking.id,
            customerName: booking.customer_name,
            startAt: booking.start_at,
            jobStatus: booking.job_status
        }).catch(() => {});
    }

    let paymentDocument = null;
    const depositCents = Number(booking.deposit_cents) || 0;
    if (depositCents > 0 || booking.deposit_paid) {
        try {
            let clientId = booking.client_id || null;
            if (!clientId) {
                const client = await ensureClientForPayment({
                    orgId: booking.org_id,
                    name: booking.customer_name,
                    email: booking.customer_email,
                    phone: booking.customer_phone,
                    address: booking.customer_address
                });
                clientId = client.id;
                await query(`UPDATE bookings SET client_id = $1, updated_at = NOW() WHERE id = $2`, [
                    clientId,
                    booking.id
                ]);
                booking.client_id = clientId;
            }
            paymentDocument = await upsertPaymentDocument({
                orgId: booking.org_id,
                clientId,
                sourceType: 'booking_deposit',
                sourceId: booking.id,
                amountCents: depositCents,
                currency: meta.org_currency || 'GBP',
                paidAt: new Date(),
                paymentMethodBrand: paymentMethodBrand || '',
                paymentMethodLast4: paymentMethodLast4 || '',
                customerName: booking.customer_name,
                customerEmail: booking.customer_email,
                businessName: meta.org_name,
                lineItems: [
                    {
                        description: `${serviceLabel || 'Booking'} — deposit`,
                        amountCents: depositCents,
                        quantity: 1
                    }
                ],
                stripeSessionId: stripeSessionId || booking.stripe_session_id,
                stripePaymentIntentId: paymentIntentId || booking.stripe_payment_intent_id
            });
        } catch (err: any) {
            console.error('Booking payment document error:', err.message);
            paymentDocument = await getPaymentDocumentBySource('booking_deposit', booking.id).catch(
                () => null
            );
        }
    }

    return {
        ...booking,
        event_name: serviceLabel,
        org_name: meta.org_name,
        org_currency: meta.org_currency,
        paymentDocument
    };
}

export { confirmBookingPayment };
