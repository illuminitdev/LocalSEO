import nodemailer from 'nodemailer';

let transporter: any = null;

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

function formatMoneyFromCents(cents: number, currency = 'GBP') {
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
    return `${symbol}${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDeposit(depositAmount: any, currency = 'GBP') {
    return formatMoneyFromCents(Number(depositAmount || 0), currency);
}

async function sendMail({ to, subject, text, html }: any) {
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

async function sendBookingConfirmationEmail({
    to,
    customerName,
    businessName,
    tradespersonName,
    serviceName,
    date,
    slotLabel,
    depositAmount,
    currency,
    address,
    hostPhone,
    hostEmail,
    manageUrl,
    icsUrl
}: any) {
    const whenLabel = [date, slotLabel].filter(Boolean).join(' — ');
    const paid = formatDeposit(depositAmount, currency || 'GBP');
    const service = serviceName || slotLabel || 'Booking';
    const subject = `Booking confirmed — ${businessName}`;
    const contactLines = [
        hostPhone ? `Phone: ${hostPhone}` : '',
        hostEmail ? `Email: ${hostEmail}` : ''
    ].filter(Boolean);

    const text = [
        `Hi ${customerName},`,
        '',
        'Your payment was successful and your booking is confirmed.',
        '',
        `Business: ${businessName}`,
        tradespersonName && tradespersonName !== businessName ? `With: ${tradespersonName}` : '',
        `Service: ${service}`,
        `When: ${whenLabel}`,
        address ? `Address: ${address}` : '',
        `Deposit paid: ${paid}`,
        ...contactLines,
        manageUrl ? `\nManage booking: ${manageUrl}` : '',
        icsUrl ? `Add to calendar: ${icsUrl}` : '',
        '',
        'Please arrive at the time above. If you need to change anything, use the manage link.'
    ]
        .filter((line) => line !== '')
        .join('\n');

    const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">
            <h1 style="color:#0F172A;font-size:22px">Booking confirmed</h1>
            <p>Hi ${customerName},</p>
            <p>Your deposit payment was <strong>successful</strong> and your booking is confirmed.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
                <tr><td style="padding:8px 0;color:#64748B">Business</td><td style="padding:8px 0;font-weight:600">${businessName}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Service</td><td style="padding:8px 0;font-weight:600">${service}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">When</td><td style="padding:8px 0;font-weight:600">${whenLabel}</td></tr>
                ${address ? `<tr><td style="padding:8px 0;color:#64748B">Address</td><td style="padding:8px 0;font-weight:600">${address}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#64748B">Deposit paid</td><td style="padding:8px 0;font-weight:600">${paid}</td></tr>
                ${hostPhone ? `<tr><td style="padding:8px 0;color:#64748B">Business phone</td><td style="padding:8px 0;font-weight:600">${hostPhone}</td></tr>` : ''}
            </table>
            <p style="color:#64748B;font-size:14px">Please come at the appointment time above.</p>
            ${manageUrl ? `<p><a href="${manageUrl}" style="color:#F59E0B;font-weight:600">Reschedule or cancel your booking</a></p>` : ''}
            ${icsUrl ? `<p><a href="${icsUrl}" style="color:#0F172A">Download calendar invite (.ics)</a></p>` : ''}
        </div>
    `;

    return sendMail({ to, subject, text, html });
}

async function sendHostBookingNotification({
    to,
    customerName,
    customerEmail,
    customerPhone,
    eventName,
    startAt,
    address,
    depositAmount,
    currency,
    businessName
}: any) {
    const paid = formatDeposit(depositAmount, currency || 'GBP');
    const subject = `New booking — ${customerName}`;
    const text = [
        'New booking confirmed.',
        '',
        businessName ? `Business: ${businessName}` : '',
        `Customer: ${customerName}`,
        customerEmail ? `Customer email: ${customerEmail}` : '',
        customerPhone ? `Customer phone: ${customerPhone}` : '',
        `Service: ${eventName}`,
        `When: ${startAt}`,
        address ? `Address: ${address}` : '',
        `Deposit paid: ${paid}`
    ]
        .filter((line) => line !== '')
        .join('\n');

    const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">
            <h1 style="font-size:20px">New booking</h1>
            <p>A customer paid and confirmed a booking${businessName ? ` for <strong>${businessName}</strong>` : ''}.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px 0;color:#64748B">Customer</td><td style="padding:8px 0;font-weight:600">${customerName}</td></tr>
                ${customerEmail ? `<tr><td style="padding:8px 0;color:#64748B">Email</td><td style="padding:8px 0;font-weight:600">${customerEmail}</td></tr>` : ''}
                ${customerPhone ? `<tr><td style="padding:8px 0;color:#64748B">Phone</td><td style="padding:8px 0;font-weight:600">${customerPhone}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#64748B">Service</td><td style="padding:8px 0;font-weight:600">${eventName}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">When</td><td style="padding:8px 0;font-weight:600">${startAt}</td></tr>
                ${address ? `<tr><td style="padding:8px 0;color:#64748B">Address</td><td style="padding:8px 0;font-weight:600">${address}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#64748B">Deposit paid</td><td style="padding:8px 0;font-weight:600">${paid}</td></tr>
            </table>
        </div>
    `;
    return sendMail({ to, subject, text, html });
}

async function sendInvoiceEmail({ to, customerName, businessName, amountCents, currency, invoiceUrl }: any) {
    const subject = `Invoice from ${businessName}`;
    const amount = formatMoneyFromCents(amountCents, currency);
    const text = `Hi ${customerName},\n\nYour job with ${businessName} is complete. Balance due: ${amount}\n\nPay here: ${invoiceUrl}`;
    const html = `<p>Hi ${customerName},</p><p>Your job with <strong>${businessName}</strong> is complete.</p><p>Balance due: <strong>${amount}</strong></p><p><a href="${invoiceUrl}">Pay invoice</a></p>`;
    return sendMail({ to, subject, text, html });
}

async function sendCancellationEmail({ to, customerName, businessName, startAt }: any) {
    const subject = `Booking cancelled — ${businessName}`;
    const text = `Hi ${customerName},\n\nYour booking on ${startAt} with ${businessName} has been cancelled.`;
    const html = `<p>Hi ${customerName},</p><p>Your booking on <strong>${startAt}</strong> with ${businessName} has been cancelled.</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendRescheduleEmail({ to, customerName, businessName, startAt }: any) {
    const subject = `Booking rescheduled — ${businessName}`;
    const text = `Hi ${customerName},\n\nYour booking with ${businessName} has been rescheduled to ${startAt}.`;
    const html = `<p>Hi ${customerName},</p><p>Your booking with ${businessName} has been rescheduled to <strong>${startAt}</strong>.</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendPasswordResetEmail({ to, name, resetUrl }: any) {
    const subject = 'Reset your Zappsites Local SEO password';
    const text = [
        `Hi ${name || 'there'},`,
        '',
        'We received a request to reset your password.',
        `Open this link to choose a new password (valid for 1 hour):`,
        resetUrl,
        '',
        'If you did not ask for this, you can ignore this email.'
    ].join('\n');
    const html = `<p>Hi ${name || 'there'},</p>
<p>We received a request to reset your password.</p>
<p><a href="${resetUrl}">Choose a new password</a> — this link is valid for 1 hour.</p>
<p>If you did not ask for this, you can ignore this email.</p>`;
    return sendMail({ to, subject, text, html });
}

export {
    sendBookingConfirmationEmail,
    sendHostBookingNotification,
    sendInvoiceEmail,
    sendCancellationEmail,
    sendRescheduleEmail,
    sendPasswordResetEmail,
    formatMoneyFromCents
};
