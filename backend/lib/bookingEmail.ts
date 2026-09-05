import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

let sesClient: SESv2Client | null = null;

function emailFrom() {
    return process.env.BOOKING_EMAIL_FROM || 'info@zappsites.com';
}

function getSesClient() {
    if (sesClient) return sesClient;
    sesClient = new SESv2Client({
        region: process.env.AWS_REGION || process.env.SES_REGION || 'us-east-1'
    });
    return sesClient;
}

function formatMoneyFromCents(cents: number, currency = 'GBP') {
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
    return `${symbol}${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatDeposit(depositAmount: any, currency = 'GBP') {
    return formatMoneyFromCents(Number(depositAmount || 0), currency);
}

async function sendMail({ to, subject, text, html }: any) {
    const from = emailFrom();
    try {
        const client = getSesClient();
        await client.send(
            new SendEmailCommand({
                FromEmailAddress: from,
                Destination: { ToAddresses: [to] },
                Content: {
                    Simple: {
                        Subject: { Data: subject, Charset: 'UTF-8' },
                        Body: {
                            Text: { Data: text || '', Charset: 'UTF-8' },
                            ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {})
                        }
                    }
                }
            })
        );
        return { sent: true, mode: 'ses', to };
    } catch (err: any) {
        console.error('[booking-email] SES send failed:', err?.message || err);
        console.log('[booking-email] email logged (not delivered):');
        console.log(`  From: ${from}`);
        console.log(`  To: ${to}`);
        console.log(`  Subject: ${subject}`);
        console.log(text);
        return { sent: false, mode: 'logged', to };
    }
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
        tradespersonName ? `Engineer / provider: ${tradespersonName}` : '',
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
                ${tradespersonName ? `<tr><td style="padding:8px 0;color:#64748B">Engineer / provider</td><td style="padding:8px 0;font-weight:600">${tradespersonName}</td></tr>` : ''}
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
    businessName,
    hostName
}: any) {
    const paid = formatDeposit(depositAmount, currency || 'GBP');
    const subject = `New booking — ${customerName}`;
    const text = [
        'A customer paid and booked a service.',
        '',
        businessName ? `Business: ${businessName}` : '',
        hostName ? `Assigned to: ${hostName}` : '',
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
            <h1 style="font-size:20px">New booking paid</h1>
            <p>A customer paid and confirmed a booking${businessName ? ` for <strong>${businessName}</strong>` : ''}.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
                ${hostName ? `<tr><td style="padding:8px 0;color:#64748B">Assigned to</td><td style="padding:8px 0;font-weight:600">${hostName}</td></tr>` : ''}
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
