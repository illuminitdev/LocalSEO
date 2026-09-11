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

function escapeHtml(value: string) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function encodeSubject(subject: string) {
    if (/^[\x20-\x7E]*$/.test(subject)) return subject;
    return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

/** SES raw message soft cap (~10MB). Base64 expands ~33%, so keep binaries under ~7MB. */
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

async function sendMailWithAttachment({
    to,
    subject,
    text,
    html,
    attachment
}: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachment?: { filename: string; contentType: string; content: Buffer } | null;
}) {
    const from = emailFrom();
    const fromHeader = `ZappSites Local SEO <${from}>`;
    const boundaryMixed = `mixed_${Date.now().toString(36)}`;
    const boundaryAlt = `alt_${Date.now().toString(36)}`;

    const textPart = [
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        text
    ].join('\r\n');

    const htmlPart = html
        ? [
              `Content-Type: text/html; charset=UTF-8`,
              `Content-Transfer-Encoding: 8bit`,
              ``,
              html
          ].join('\r\n')
        : '';

    const alternative = html
        ? [
              `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
              ``,
              `--${boundaryAlt}`,
              textPart,
              `--${boundaryAlt}`,
              htmlPart,
              `--${boundaryAlt}--`
          ].join('\r\n')
        : textPart;

    const includeAttachment =
        attachment &&
        Buffer.isBuffer(attachment.content) &&
        attachment.content.length > 0 &&
        attachment.content.length <= MAX_ATTACHMENT_BYTES;

    const headers = [
        `From: ${fromHeader}`,
        `To: ${to}`,
        `Reply-To: ${from}`,
        `Subject: ${encodeSubject(subject)}`,
        `MIME-Version: 1.0`
    ];

    let raw: string;
    if (includeAttachment && attachment) {
        const filename = String(attachment.filename || 'attachment.pdf').replace(/["\r\n]/g, '');
        const b64 = attachment.content.toString('base64').replace(/(.{76})/g, '$1\r\n');
        raw = [
            ...headers,
            `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
            ``,
            `--${boundaryMixed}`,
            alternative,
            `--${boundaryMixed}`,
            `Content-Type: ${attachment.contentType || 'application/pdf'}; name="${filename}"`,
            `Content-Disposition: attachment; filename="${filename}"`,
            `Content-Transfer-Encoding: base64`,
            ``,
            b64,
            `--${boundaryMixed}--`,
            ``
        ].join('\r\n');
    } else {
        raw = [
            ...headers,
            `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
            ``,
            `--${boundaryAlt}`,
            textPart,
            ...(html ? [`--${boundaryAlt}`, htmlPart] : []),
            `--${boundaryAlt}--`,
            ``
        ].join('\r\n');
    }

    try {
        const client = getSesClient();
        await client.send(
            new SendEmailCommand({
                FromEmailAddress: from,
                Destination: { ToAddresses: [to] },
                Content: {
                    Raw: {
                        Data: Buffer.from(raw, 'utf8')
                    }
                }
            })
        );
        return {
            sent: true,
            mode: 'ses' as const,
            to,
            attached: Boolean(includeAttachment)
        };
    } catch (err: any) {
        console.error('[booking-email] SES raw send failed:', err?.message || err);
        console.log('[booking-email] email logged (not delivered):');
        console.log(`  From: ${from}`);
        console.log(`  To: ${to}`);
        console.log(`  Subject: ${subject}`);
        console.log(text);
        return {
            sent: false,
            mode: 'logged' as const,
            to,
            attached: Boolean(includeAttachment)
        };
    }
}

async function sendFullAuditShareEmail({
    to,
    businessName,
    website,
    score,
    reportUrl,
    pdfBuffer,
    pdfFilename
}: {
    to: string;
    businessName?: string | null;
    website?: string | null;
    score?: number | null;
    reportUrl?: string | null;
    pdfBuffer?: Buffer | null;
    pdfFilename?: string;
}) {
    const biz = String(businessName || 'there').trim() || 'there';
    const site = String(website || '').trim();
    const scoreLabel = score != null && Number.isFinite(Number(score)) ? `${Number(score)}/100` : null;
    const report = String(reportUrl || '').trim();
    const subject = scoreLabel
        ? `Your Local SEO audit for ${biz} — ${scoreLabel}`
        : `Your Local SEO audit for ${biz}`;

    const text = [
        `Hi ${biz},`,
        '',
        site
            ? `We reviewed your website (${site})${scoreLabel ? ` and your Local SEO score is ${scoreLabel}` : ''}.`
            : `We completed a Local SEO review for your business${scoreLabel ? ` — your score is ${scoreLabel}` : ''}.`,
        '',
        'There are clear gaps that are likely costing you local visibility and leads.',
        'We have put together a short plan to improve this — your full audit report PDF is attached.',
        report ? `You can also view the report online: ${report}` : '',
        '',
        'Have a look and reply to this email if you would like us to walk you through the next steps.',
        '',
        '— ZappSites Local SEO'
    ]
        .filter((line) => line !== '')
        .join('\n');

    const safeBiz = escapeHtml(biz);
    const safeSite = escapeHtml(site);
    const siteHref = site
        ? escapeHtml(/^https?:\/\//i.test(site) ? site : `https://${site}`)
        : '';
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0F172A;line-height:1.55">
            <p>Hi ${safeBiz},</p>
            <p>${
                site
                    ? `We reviewed your website (<a href="${siteHref}" style="color:#0F172A">${safeSite}</a>)${
                          scoreLabel ? ` and your Local SEO score is <strong>${escapeHtml(scoreLabel)}</strong>` : ''
                      }.`
                    : `We completed a Local SEO review for your business${
                          scoreLabel ? ` — your score is <strong>${escapeHtml(scoreLabel)}</strong>` : ''
                      }.`
            }</p>
            <p>There are clear gaps that are likely costing you local visibility and leads.</p>
            <p>We have put together a short plan to improve this — your full audit report PDF is attached.</p>
            ${
                report
                    ? `<p><a href="${escapeHtml(report)}" style="color:#D97706;font-weight:600">View your audit report online</a></p>`
                    : ''
            }
            <p>Have a look and reply to this email if you would like us to walk you through the next steps.</p>
            <p style="color:#64748B;margin-top:24px">— ZappSites Local SEO</p>
        </div>
    `;

    const attachment =
        pdfBuffer && pdfBuffer.length
            ? {
                  filename: pdfFilename || `zappsites-audit-${biz.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`,
                  contentType: 'application/pdf',
                  content: pdfBuffer
              }
            : null;

    if (attachment && attachment.content.length > MAX_ATTACHMENT_BYTES) {
        console.warn(
            `[booking-email] PDF too large for SES attachment (${attachment.content.length} bytes); sending link only`
        );
    }

    return sendMailWithAttachment({
        to,
        subject,
        text,
        html,
        attachment
    });
}

export {
    sendMail,
    sendMailWithAttachment,
    sendFullAuditShareEmail,
    sendBookingConfirmationEmail,
    sendHostBookingNotification,
    sendInvoiceEmail,
    sendCancellationEmail,
    sendRescheduleEmail,
    sendPasswordResetEmail,
    formatMoneyFromCents
};
