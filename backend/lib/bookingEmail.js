const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass }
    });
    return transporter;
}

function formatMoneyFromCents(cents, currency = 'GBP') {
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatMoney(amount, currencySymbol) {
    return `${currencySymbol || '£'}${Number(amount).toFixed(2)}`;
}

async function sendMail({ to, subject, text, html }) {
    const from = process.env.BOOKING_EMAIL_FROM || process.env.SMTP_USER || 'bookings@localpulse.app';
    const transport = getTransporter();
    if (!transport) {
        console.log('[booking-email] SMTP not configured — email logged:');
        console.log(`  To: ${to}`);
        console.log(`  Subject: ${subject}`);
        console.log(text);
        return { sent: false, mode: 'logged', to };
    }
    await transport.sendMail({ from, to, subject, text, html });
    return { sent: true, mode: 'smtp', to };
}

async function sendBookingConfirmationEmail({ to, customerName, businessName, tradespersonName, date, slotLabel, depositAmount, currency, address, manageUrl, icsUrl }) {
    const subject = `Booking confirmed — ${businessName}`;
    const manageLine = manageUrl ? `\nManage booking: ${manageUrl}` : '';
    const text = [
        `Hi ${customerName},`,
        '',
        'Your payment was successful and your booking is confirmed.',
        '',
        `Business: ${businessName}`,
        `Service: ${slotLabel}`,
        `Date: ${date}`,
        `Address: ${address}`,
        `Deposit paid: ${typeof depositAmount === 'number' && depositAmount > 100 ? formatMoneyFromCents(depositAmount, currency) : formatMoney(depositAmount, currency === 'GBP' ? '£' : currency)}`,
        manageLine,
        icsUrl ? `\nAdd to calendar: ${icsUrl}` : '',
        '',
        `${tradespersonName || businessName} has been notified.`
    ].join('\n');

    const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">
            <h1 style="color:#0F172A;font-size:22px">Booking confirmed</h1>
            <p>Hi ${customerName},</p>
            <p>Your deposit payment was <strong>successful</strong> and your booking is confirmed.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
                <tr><td style="padding:8px 0;color:#64748B">Business</td><td style="padding:8px 0;font-weight:600">${businessName}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">When</td><td style="padding:8px 0;font-weight:600">${date} — ${slotLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Address</td><td style="padding:8px 0;font-weight:600">${address}</td></tr>
            </table>
            ${manageUrl ? `<p><a href="${manageUrl}" style="color:#F59E0B;font-weight:600">Reschedule or cancel your booking</a></p>` : ''}
            ${icsUrl ? `<p><a href="${icsUrl}" style="color:#0F172A">Download calendar invite (.ics)</a></p>` : ''}
        </div>
    `;

    return sendMail({ to, subject, text, html });
}

async function sendHostBookingNotification({ to, customerName, eventName, startAt, address }) {
    const subject = `New booking — ${customerName}`;
    const text = `New booking confirmed.\n\nCustomer: ${customerName}\nService: ${eventName}\nWhen: ${startAt}\nAddress: ${address}`;
    const html = `<p><strong>New booking</strong> from ${customerName}</p><p>${eventName}<br>${startAt}<br>${address}</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendInvoiceEmail({ to, customerName, businessName, amountCents, currency, invoiceUrl }) {
    const subject = `Invoice from ${businessName}`;
    const amount = formatMoneyFromCents(amountCents, currency);
    const text = `Hi ${customerName},\n\nYour job with ${businessName} is complete. Balance due: ${amount}\n\nPay here: ${invoiceUrl}`;
    const html = `<p>Hi ${customerName},</p><p>Your job with <strong>${businessName}</strong> is complete.</p><p>Balance due: <strong>${amount}</strong></p><p><a href="${invoiceUrl}">Pay invoice</a></p>`;
    return sendMail({ to, subject, text, html });
}

async function sendCancellationEmail({ to, customerName, businessName, startAt }) {
    const subject = `Booking cancelled — ${businessName}`;
    const text = `Hi ${customerName},\n\nYour booking on ${startAt} with ${businessName} has been cancelled.`;
    const html = `<p>Hi ${customerName},</p><p>Your booking on <strong>${startAt}</strong> with ${businessName} has been cancelled.</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendRescheduleEmail({ to, customerName, businessName, startAt }) {
    const subject = `Booking rescheduled — ${businessName}`;
    const text = `Hi ${customerName},\n\nYour booking with ${businessName} has been rescheduled to ${startAt}.`;
    const html = `<p>Hi ${customerName},</p><p>Your booking with ${businessName} has been rescheduled to <strong>${startAt}</strong>.</p>`;
    return sendMail({ to, subject, text, html });
}

module.exports = {
    sendBookingConfirmationEmail,
    sendHostBookingNotification,
    sendInvoiceEmail,
    sendCancellationEmail,
    sendRescheduleEmail,
    formatMoneyFromCents
};
