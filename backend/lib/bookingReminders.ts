import { query } from './db';
import { sendMail } from './bookingEmail';
import { ensureClientPortalToken, portalUrl } from './clientPortal';

const DEFAULT_SUBJECTS: Record<string, string> = {
    visit_reminder: 'Reminder: upcoming appointment with {{businessName}}',
    request_received: 'We received your request — {{businessName}}',
    post_job_followup: 'Thanks for choosing {{businessName}}',
    invoice_unpaid: 'Invoice reminder from {{businessName}}',
    portal_link: 'Your client hub — {{businessName}}'
};

function applyVars(template: string, vars: Record<string, string>) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function loadOrgReminderSettings(orgId: string) {
    const { rows } = await query(
        `SELECT id, name, email, phone, host_name, currency, slug,
                reminder_visit_hours, reminder_invoice_days, reminder_post_job_hours, reminders_enabled,
                sms_enabled
         FROM organizations WHERE id = $1`,
        [orgId]
    );
    return rows[0] || null;
}

async function cancelPendingForBooking(bookingId: string, triggerEvent?: string) {
    if (triggerEvent) {
        await query(
            `UPDATE scheduled_messages SET status = 'cancelled'
             WHERE booking_id = $1 AND trigger_event = $2 AND status = 'pending'`,
            [bookingId, triggerEvent]
        );
    } else {
        await query(
            `UPDATE scheduled_messages SET status = 'cancelled'
             WHERE booking_id = $1 AND status = 'pending'`,
            [bookingId]
        );
    }
}

export async function enqueueScheduledMessage({
    orgId,
    clientId,
    bookingId,
    invoiceId,
    triggerEvent,
    toEmail,
    subject,
    bodyText,
    bodyHtml,
    sendAt
}: {
    orgId: string;
    clientId?: string | null;
    bookingId?: string | null;
    invoiceId?: string | null;
    triggerEvent: string;
    toEmail: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    sendAt: Date;
}) {
    if (!toEmail?.trim()) return null;
    if (bookingId) {
        await cancelPendingForBooking(bookingId, triggerEvent);
    }
    const { rows } = await query(
        `INSERT INTO scheduled_messages (
            org_id, client_id, booking_id, invoice_id, trigger_event, channel,
            to_email, subject, body_text, body_html, send_at, status
         ) VALUES ($1,$2,$3,$4,$5,'email',$6,$7,$8,$9,$10,'pending') RETURNING *`,
        [
            orgId,
            clientId || null,
            bookingId || null,
            invoiceId || null,
            triggerEvent,
            toEmail.trim().toLowerCase(),
            subject,
            bodyText,
            bodyHtml || '',
            sendAt.toISOString()
        ]
    );
    return rows[0];
}

/** After confirm / schedule: visit reminder N hours before start. */
export async function scheduleVisitReminder(booking: any, org?: any) {
    const orgRow = org || (await loadOrgReminderSettings(booking.org_id));
    if (!orgRow?.reminders_enabled) return null;
    if (!booking.customer_email || !booking.start_at) return null;
    if (booking.status === 'cancelled' || booking.job_status === 'cancelled') return null;
    if (booking.job_status === 'requested') return null;

    const hours = Math.max(1, Number(orgRow.reminder_visit_hours) || 24);
    const start = new Date(booking.start_at);
    const sendAt = new Date(start.getTime() - hours * 3600000);
    if (sendAt.getTime() <= Date.now()) return null;

    const whenLabel = start.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const vars = {
        customerName: booking.customer_name || 'there',
        businessName: orgRow.name || 'Business',
        when: whenLabel,
        address: booking.customer_address || '',
        serviceName: booking.event_name || 'Appointment'
    };
    const subject = applyVars(DEFAULT_SUBJECTS.visit_reminder, vars);
    const bodyText = applyVars(
        `Hi {{customerName}},\n\nThis is a reminder of your appointment with {{businessName}}.\nWhen: {{when}}\n{{address}}\n\nSee you then.`,
        vars
    );
    const bodyHtml = `<p>Hi ${vars.customerName},</p><p>Reminder: your appointment with <strong>${vars.businessName}</strong>.</p><p><strong>When:</strong> ${vars.when}</p>${vars.address ? `<p><strong>Address:</strong> ${vars.address}</p>` : ''}`;

    return enqueueScheduledMessage({
        orgId: booking.org_id,
        clientId: booking.client_id,
        bookingId: booking.id,
        triggerEvent: 'visit_reminder',
        toEmail: booking.customer_email,
        subject,
        bodyText,
        bodyHtml,
        sendAt
    });
}

export async function sendRequestReceivedEmail(booking: any, org: any) {
    if (!booking?.customer_email) return null;
    const vars = {
        customerName: booking.customer_name || 'there',
        businessName: org?.name || 'Business',
        serviceName: booking.event_name || 'Service'
    };
    const subject = applyVars(DEFAULT_SUBJECTS.request_received, vars);
    const text = applyVars(
        `Hi {{customerName}},\n\n{{businessName}} received your request for {{serviceName}}. We will confirm a time shortly.`,
        vars
    );
    const html = `<p>Hi ${vars.customerName},</p><p><strong>${vars.businessName}</strong> received your request for <strong>${vars.serviceName}</strong>. We will confirm a time shortly.</p>`;
    return sendMail({ to: booking.customer_email, subject, text, html });
}

export async function schedulePostJobFollowup(booking: any, org?: any) {
    const orgRow = org || (await loadOrgReminderSettings(booking.org_id));
    if (!orgRow?.reminders_enabled) return null;
    if (!booking.customer_email) return null;
    const hours = Math.max(1, Number(orgRow.reminder_post_job_hours) || 24);
    const sendAt = new Date(Date.now() + hours * 3600000);
    const vars = {
        customerName: booking.customer_name || 'there',
        businessName: orgRow.name || 'Business'
    };
    const subject = applyVars(DEFAULT_SUBJECTS.post_job_followup, vars);
    const bodyText = applyVars(
        `Hi {{customerName}},\n\nThanks for choosing {{businessName}}. We hope everything went well. Reply to this email if you need anything else.`,
        vars
    );
    const bodyHtml = `<p>Hi ${vars.customerName},</p><p>Thanks for choosing <strong>${vars.businessName}</strong>. We hope everything went well.</p>`;
    return enqueueScheduledMessage({
        orgId: booking.org_id,
        clientId: booking.client_id,
        bookingId: booking.id,
        triggerEvent: 'post_job_followup',
        toEmail: booking.customer_email,
        subject,
        bodyText,
        bodyHtml,
        sendAt
    });
}

export async function scheduleInvoiceUnpaidReminder(invoice: any, booking: any, org?: any) {
    const orgRow = org || (await loadOrgReminderSettings(booking.org_id));
    if (!orgRow?.reminders_enabled) return null;
    if (!booking.customer_email || !invoice?.stripe_hosted_url) return null;
    if (invoice.status === 'paid') return null;
    const days = Math.max(1, Number(orgRow.reminder_invoice_days) || 3);
    const sendAt = new Date(Date.now() + days * 86400000);
    const amount = ((Number(invoice.amount_cents) || 0) / 100).toFixed(2);
    const vars = {
        customerName: booking.customer_name || 'there',
        businessName: orgRow.name || 'Business',
        amount: `£${amount}`,
        invoiceUrl: invoice.stripe_hosted_url
    };
    const subject = applyVars(DEFAULT_SUBJECTS.invoice_unpaid, vars);
    const bodyText = applyVars(
        `Hi {{customerName}},\n\nFriendly reminder: your invoice from {{businessName}} ({{amount}}) is still unpaid.\nPay here: {{invoiceUrl}}`,
        vars
    );
    const bodyHtml = `<p>Hi ${vars.customerName},</p><p>Reminder: invoice from <strong>${vars.businessName}</strong> for <strong>${vars.amount}</strong> is unpaid.</p><p><a href="${vars.invoiceUrl}">Pay invoice</a></p>`;
    return enqueueScheduledMessage({
        orgId: booking.org_id,
        clientId: booking.client_id,
        bookingId: booking.id,
        invoiceId: invoice.id || null,
        triggerEvent: 'invoice_unpaid',
        toEmail: booking.customer_email,
        subject,
        bodyText,
        bodyHtml,
        sendAt
    });
}

export async function sendPortalLinkEmail({
    to,
    customerName,
    businessName,
    portalLink
}: {
    to: string;
    customerName: string;
    businessName: string;
    portalLink: string;
}) {
    const subject = applyVars(DEFAULT_SUBJECTS.portal_link, { businessName });
    const text = `Hi ${customerName},\n\nAccess your appointments, invoices, and requests for ${businessName}:\n${portalLink}\n\nThis link stays valid for 90 days.`;
    const html = `<p>Hi ${customerName},</p><p>Open your <strong>client hub</strong> for ${businessName}:</p><p><a href="${portalLink}">Open client hub</a></p><p style="color:#64748B;font-size:13px">Link valid for 90 days.</p>`;
    return sendMail({ to, subject, text, html });
}

/** Ensure portal token exists and optionally email the client hub link. */
export async function issuePortalAccess(orgId: string, clientId: string, { emailClient = false } = {}) {
    const tokenRow = await ensureClientPortalToken(orgId, clientId);
    const link = portalUrl(tokenRow.token);
    if (emailClient) {
        const { rows } = await query(
            `SELECT c.name, c.email, o.name AS org_name FROM clients c
             JOIN organizations o ON o.id = c.org_id WHERE c.id = $1 AND c.org_id = $2`,
            [clientId, orgId]
        );
        const row = rows[0];
        if (row?.email) {
            await sendPortalLinkEmail({
                to: row.email,
                customerName: row.name || 'there',
                businessName: row.org_name || 'Business',
                portalLink: link
            });
        }
    }
    return { token: tokenRow.token, portalUrl: link };
}

export async function processDueScheduledMessages(limit = 40) {
    const { rows } = await query(
        `SELECT sm.*, o.sms_enabled,
                c.phone AS client_phone
         FROM scheduled_messages sm
         JOIN organizations o ON o.id = sm.org_id
         LEFT JOIN clients c ON c.id = sm.client_id
         WHERE sm.status = 'pending' AND sm.send_at <= NOW()
         ORDER BY sm.send_at ASC
         LIMIT $1`,
        [limit]
    );
    let sent = 0;
    let failed = 0;
    const { maybeSendReminderSms } = await import('./inbox');
    for (const msg of rows) {
        try {
            if (msg.channel === 'sms') {
                const phone = msg.to_phone || msg.client_phone;
                await maybeSendReminderSms(
                    { id: msg.org_id, sms_enabled: true },
                    phone,
                    msg.body_text,
                    msg.client_id
                );
            } else {
                const result = await sendMail({
                    to: msg.to_email,
                    subject: msg.subject,
                    text: msg.body_text,
                    html: msg.body_html || undefined
                });
                if (msg.sms_enabled && (msg.to_phone || msg.client_phone)) {
                    await maybeSendReminderSms(
                        { id: msg.org_id, sms_enabled: true },
                        msg.to_phone || msg.client_phone,
                        msg.body_text,
                        msg.client_id
                    );
                }
                void result;
            }
            await query(
                `UPDATE scheduled_messages SET status = 'sent', sent_at = NOW(), error = NULL WHERE id = $1`,
                [msg.id]
            );
            sent += 1;
        } catch (err: any) {
            failed += 1;
            await query(
                `UPDATE scheduled_messages SET status = 'failed', error = $2 WHERE id = $1`,
                [msg.id, String(err?.message || err).slice(0, 500)]
            );
        }
    }
    return { processed: rows.length, sent, failed };
}

export async function cancelRemindersForCancelledBooking(bookingId: string) {
    await cancelPendingForBooking(bookingId);
}

export { loadOrgReminderSettings };
