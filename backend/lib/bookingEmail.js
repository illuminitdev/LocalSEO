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

function formatMoney(amount, currencySymbol) {
    return `${currencySymbol || '£'}${Number(amount).toFixed(2)}`;
}

async function sendBookingConfirmationEmail({ to, customerName, businessName, tradespersonName, date, slotLabel, depositAmount, currency, address }) {
    const from = process.env.BOOKING_EMAIL_FROM || process.env.SMTP_USER || 'bookings@localpulse.app';
    const subject = `Booking confirmed — ${businessName}`;
    const text = [
        `Hi ${customerName},`,
        '',
        'Your payment was successful and your booking is confirmed.',
        '',
        `Business: ${businessName}`,
        `Tradesperson: ${tradespersonName}`,
        `Date: ${date}`,
        `Time: ${slotLabel}`,
        `Address: ${address}`,
        `Deposit paid: ${formatMoney(depositAmount, currency)}`,
        '',
        `${tradespersonName} has been notified and will be in touch.`,
        '',
        'Thank you for booking with LocalPulse Booking Plots.'
    ].join('\n');

    const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">
            <h1 style="color:#0F172A;font-size:22px">Booking confirmed</h1>
            <p>Hi ${customerName},</p>
            <p>Your payment was <strong>successful</strong> and your booking is confirmed.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
                <tr><td style="padding:8px 0;color:#64748B">Business</td><td style="padding:8px 0;font-weight:600">${businessName}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Tradesperson</td><td style="padding:8px 0;font-weight:600">${tradespersonName}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Date</td><td style="padding:8px 0;font-weight:600">${date}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Time</td><td style="padding:8px 0;font-weight:600">${slotLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Address</td><td style="padding:8px 0;font-weight:600">${address}</td></tr>
                <tr><td style="padding:8px 0;color:#64748B">Deposit paid</td><td style="padding:8px 0;font-weight:600;color:#F59E0B">${formatMoney(depositAmount, currency)}</td></tr>
            </table>
            <p>${tradespersonName} has been notified and will be in touch.</p>
            <p style="color:#64748B;font-size:13px">Thank you for booking with LocalPulse Booking Plots.</p>
        </div>
    `;

    const mail = { from, to, subject, text, html };
    const transport = getTransporter();

    if (!transport) {
        console.log('[booking-email] SMTP not configured — confirmation email logged:');
        console.log(`  To: ${to}`);
        console.log(`  Subject: ${subject}`);
        console.log(text);
        return { sent: false, mode: 'logged', to };
    }

    await transport.sendMail(mail);
    return { sent: true, mode: 'smtp', to };
}

module.exports = { sendBookingConfirmationEmail };
