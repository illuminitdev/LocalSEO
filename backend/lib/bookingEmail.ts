import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

let sesClient: SESv2Client | null = null;

function emailFrom() {
    return process.env.BOOKING_EMAIL_FROM || 'info@zappsites.com';
}

/** Shown in inboxes as "ZappSites" — never bare info@… */
function emailFromHeader() {
    return `"ZappSites" <${emailFrom()}>`;
}

/** SES FromEmailAddress with display name so Gmail/Outlook show ZappSites */
function emailFromAddress() {
    return emailFromHeader();
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
    // Use the same Raw MIME path as attachment emails — more reliable with SES identities
    // and display names than Simple Content.
    return sendMailWithAttachment({
        to,
        subject,
        text,
        html,
        attachment: null
    });
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
    icsUrl,
    logoUrl
}: any) {
    const whenLabel = [date, slotLabel].filter(Boolean).join(' — ');
    const paid = formatDeposit(depositAmount, currency || 'GBP');
    const service = serviceName || slotLabel || 'Booking';
    const subject = `Booking confirmed — ${businessName}`;
    const contactLines = [
        hostPhone ? `Phone: ${hostPhone}` : '',
        hostEmail ? `Email: ${hostEmail}` : ''
    ].filter(Boolean);
    const safeLogo = String(logoUrl || '')
        .trim()
        .replace(/"/g, '');
    const logoOk = /^https?:\/\//i.test(safeLogo);

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
            ${
                logoOk
                    ? `<div style="margin:0 0 20px 0"><img src="${safeLogo}" alt="${businessName}" width="160" style="display:block;max-width:160px;height:auto;border:0" /></div>`
                    : ''
            }
            <h1 style="color:#0F172A;font-size:22px;margin:0 0 12px 0">Booking confirmed</h1>
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

async function sendPasswordResetOtpEmail({ to, name, otp }: { to: string; name?: string; otp: string }) {
    const subject = 'Your ZappSites password reset code';
    const text = [
        `Hi ${name || 'there'},`,
        '',
        'Use this one-time code to reset your password:',
        otp,
        '',
        'This code expires in 15 minutes. If you did not ask for this, you can ignore this email.'
    ].join('\n');
    const html = `<p>Hi ${name || 'there'},</p>
<p>Use this one-time code to reset your password:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:4px;">${escapeHtml(otp)}</p>
<p>This code expires in 15 minutes. If you did not ask for this, you can ignore this email.</p>`;
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
    const fromHeader = emailFromHeader();
    const fromAddress = emailFromAddress();
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
        // Reuse the same multipart/alternative body used for attached sends
        raw = [...headers, alternative, ``].join('\r\n');
    }

    try {
        const client = getSesClient();
        const out = await client.send(
            new SendEmailCommand({
                FromEmailAddress: fromAddress,
                Destination: { ToAddresses: [to] },
                Content: {
                    Raw: {
                        Data: Buffer.from(raw, 'utf8')
                    }
                }
            })
        );
        const messageId = String((out as { MessageId?: string })?.MessageId || '').trim();
        console.log('[booking-email] SES accepted', {
            to,
            from: fromAddress,
            subject: subject.slice(0, 80),
            messageId: messageId || null,
            attached: Boolean(includeAttachment)
        });
        return {
            sent: true,
            mode: 'ses' as const,
            to,
            attached: Boolean(includeAttachment),
            messageId: messageId || null
        };
    } catch (err: any) {
        const detail =
            err?.message ||
            err?.name ||
            (typeof err === 'string' ? err : 'SES send failed');
        console.error('[booking-email] SES raw send failed:', detail, err?.$metadata || '');
        console.log('[booking-email] email logged (not delivered):');
        console.log(`  From: ${fromHeader}`);
        console.log(`  To: ${to}`);
        console.log(`  Subject: ${subject}`);
        console.log(text);
        return {
            sent: false,
            mode: 'logged' as const,
            to,
            attached: Boolean(includeAttachment),
            messageId: null,
            error: String(detail)
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
    pdfFilename,
    openTrackingUrl,
    logoTrackingUrl,
    clickTrackingUrl
}: {
    to: string;
    businessName?: string | null;
    website?: string | null;
    score?: number | null;
    reportUrl?: string | null;
    pdfBuffer?: Buffer | null;
    pdfFilename?: string;
    openTrackingUrl?: string | null;
    logoTrackingUrl?: string | null;
    /** Tracked wrapper around reportUrl — marks opened on click, then redirects */
    clickTrackingUrl?: string | null;
}) {
    const biz = String(businessName || 'there').trim() || 'there';
    const site = String(website || '').trim();
    const scoreLabel = score != null && Number.isFinite(Number(score)) ? `${Number(score)}/100` : null;
    const report = String(reportUrl || '').trim();
    const track = String(openTrackingUrl || '').trim();
    const logoTrack = String(logoTrackingUrl || openTrackingUrl || '').trim();
    const clickThru = String(clickTrackingUrl || report || '').trim();
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
        report ? `View your report online: ${report}` : '',
        '',
        'Have a look and reply to this email if you would like us to walk you through the next steps.',
        '',
        '— ZappSites'
    ]
        .filter((line) => line !== '')
        .join('\n');

    const safeBiz = escapeHtml(biz);
    const safeSite = escapeHtml(site);
    const siteHref = site
        ? escapeHtml(/^https?:\/\//i.test(site) ? site : `https://${site}`)
        : '';
    const safeClick = clickThru && /^https?:\/\//i.test(clickThru) ? escapeHtml(clickThru) : '';
    const safeScore = scoreLabel ? escapeHtml(scoreLabel) : '';
    const safeLogo =
        logoTrack && /^https?:\/\//i.test(logoTrack) ? escapeHtml(logoTrack) : '';
    const safePixel = track && /^https?:\/\//i.test(track) ? escapeHtml(track) : '';

    const logoImg = safeLogo
        ? `<img src="${safeLogo}" width="36" height="36" alt="ZappSites" border="0" style="display:block;width:36px;height:36px;border:0;border-radius:50%;" />`
        : '';

    const pixel = safePixel
        ? `<img src="${safePixel}" width="1" height="1" alt="" border="0" style="width:1px;height:1px;border:0;display:block;" />`
        : '';

    const scoreBlock = safeScore
        ? `
            <tr>
              <td align="center" style="padding:0 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 28px;text-align:center;">
                      <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#92400E;">Local SEO score</div>
                      <div style="font-size:36px;font-weight:800;color:#0F172A;line-height:1.2;margin-top:4px;">${safeScore}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
        : '';

    const siteLine = site
        ? `We reviewed <a href="${siteHref}" style="color:#0F172A;font-weight:600;text-decoration:underline;">${safeSite}</a>${
              safeScore ? ` and scored your Local SEO at <strong>${safeScore}</strong>` : ''
          }.`
        : `We completed a Local SEO review for your business${
              safeScore ? ` — your score is <strong>${safeScore}</strong>` : ''
          }.`;

    const ctaBlock = safeClick
        ? `
            <tr>
              <td align="center" style="padding:8px 32px 28px;">
                <a href="${safeClick}" style="display:inline-block;background:#F59E0B;color:#0F172A;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">
                  View full audit report
                </a>
                <div style="font-size:12px;color:#64748B;margin-top:12px;">PDF is also attached — opening the report link confirms you received this email</div>
              </td>
            </tr>`
        : `
            <tr>
              <td align="center" style="padding:8px 32px 28px;">
                <div style="font-size:13px;color:#64748B;">Your full audit report PDF is attached to this email.</div>
              </td>
            </tr>`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
          <tr>
            <td style="background:#0F172A;padding:22px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">${logoImg}</td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">ZappSites</div>
                    <div style="font-size:12px;color:#94A3B8;margin-top:4px;">Local SEO Audit Report</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 16px;font-size:16px;color:#0F172A;line-height:1.5;">Hi ${safeBiz},</p>
              <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">${siteLine}</p>
              <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
                There are clear gaps that are likely costing you local visibility and leads.
                We’ve put together a short plan to improve this — details are in your report.
              </p>
            </td>
          </tr>
          ${scoreBlock}
          ${ctaBlock}
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="margin:0;font-size:14px;color:#64748B;line-height:1.55;">
                Reply to this email if you’d like us to walk you through the next steps.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:18px 32px;">
              <div style="font-size:13px;font-weight:700;color:#0F172A;">ZappSites</div>
              <div style="font-size:12px;color:#94A3B8;margin-top:2px;">Local SEO for growing businesses</div>
            </td>
          </tr>
        </table>
        ${pixel}
      </td>
    </tr>
  </table>
</body>
</html>`;

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

    if (logoTrack) {
        console.log('[booking-email] open-track logo', logoTrack.slice(0, 80));
    }

    return sendMailWithAttachment({
        to,
        subject,
        text,
        html,
        attachment
    });
}

function formatCriticalIssueHtml(raw: string) {
    const lines = String(raw || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    if (!lines.length) return '';
    const items = lines
        .map((l) => l.replace(/^\d+[\).\]]\s+/, '').replace(/^[-•*]\s+/, ''))
        .map(
            (l) =>
                `<tr>
                  <td style="padding:0 10px 10px 0;vertical-align:top;width:22px;">
                    <div style="width:18px;height:18px;border-radius:50%;background:#DC2626;color:#ffffff;font-size:11px;font-weight:800;line-height:18px;text-align:center;">✕</div>
                  </td>
                  <td style="padding:0 0 10px;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;color:#1E293B;font-size:14px;line-height:1.55;">${escapeHtml(l)}</td>
                </tr>`
        )
        .join('');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${items}</table>`;
}

async function sendLeadObservationsEmail({
    to,
    businessName,
    gbpObservation,
    aiVisibilityObservation,
    openTrackingUrl,
    logoTrackingUrl,
    requestFullAuditUrl
}: {
    to: string;
    businessName?: string | null;
    gbpObservation?: string | null;
    aiVisibilityObservation?: string | null;
    openTrackingUrl?: string | null;
    logoTrackingUrl?: string | null;
    requestFullAuditUrl?: string | null;
}) {
    const biz = String(businessName || 'there').trim() || 'there';
    const gbp = String(gbpObservation || '').trim();
    const ai = String(aiVisibilityObservation || '').trim();
    const track = String(openTrackingUrl || '').trim();
    const logoTrack = String(logoTrackingUrl || openTrackingUrl || '').trim();
    const requestUrl = String(requestFullAuditUrl || '').trim();
    const subject = `Visibility notes for ${biz}`;

    const textParts = [
        `Hi ${biz},`,
        '',
        'CRITICAL ALERT — Your business visibility is at risk!',
        'Our quick review found issues that can impact how your business appears online — and it needs your attention.',
        ''
    ];
    if (gbp) {
        textParts.push('Google Business Profile — Note: critical issues', gbp, '');
    }
    if (ai) {
        textParts.push('AI visibility — Note: critical issues', ai, '');
    }
    textParts.push(
        'Want the full picture? Request a full main audit and we will run it, then get back to you.',
        requestUrl ? `Request a full main audit: ${requestUrl}` : '',
        '',
        'ZappSites',
        'Local SEO for growing businesses'
    );
    const text = textParts.filter((line) => line !== null).join('\n');

    const safeBiz = escapeHtml(biz);
    const gbpHtml = gbp ? formatCriticalIssueHtml(gbp) : '';
    const aiHtml = ai ? formatCriticalIssueHtml(ai) : '';
    const safeLogo =
        logoTrack && /^https?:\/\//i.test(logoTrack) ? escapeHtml(logoTrack) : '';
    const safePixel = track && /^https?:\/\//i.test(track) ? escapeHtml(track) : '';
    const safeRequest =
        requestUrl && /^https?:\/\//i.test(requestUrl) ? escapeHtml(requestUrl) : '';

    const logoImg = safeLogo
        ? `<img src="${safeLogo}" width="36" height="36" alt="ZappSites" border="0" style="display:block;width:36px;height:36px;border:0;border-radius:50%;" />`
        : '';
    const pixel = safePixel
        ? `<img src="${safePixel}" width="1" height="1" alt="" border="0" style="width:1px;height:1px;border:0;display:block;" />`
        : '';

    const criticalBlock =
        gbp || ai
            ? `
            <tr>
              <td style="padding:0 28px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF2F2;border-left:5px solid #DC2626;border-radius:0 12px 12px 0;">
                  <tr>
                    <td style="padding:16px 18px;vertical-align:top;width:44px;">
                      <div style="width:36px;height:36px;border-radius:8px;background:#DC2626;color:#ffffff;font-size:20px;font-weight:800;line-height:36px;text-align:center;">!</div>
                    </td>
                    <td style="padding:14px 18px 14px 0;vertical-align:top;">
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#DC2626;margin-bottom:6px;">
                        Critical alert
                      </div>
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#0F172A;margin-bottom:6px;line-height:1.3;">
                        Your business visibility is <span style="color:#DC2626;">at risk!</span>
                      </div>
                      <p style="margin:0;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:14px;color:#475569;line-height:1.55;">
                        Our quick review found issues that can impact how your business appears online — and it needs your attention.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
            : '';

    const gbpBlock = gbp
        ? `
            <tr>
              <td style="padding:0 28px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:0 12px 12px 0;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#EA580C;margin-bottom:4px;">
                        Google Business Profile
                      </div>
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;color:#DC2626;margin-bottom:12px;">
                        Note: critical issues
                      </div>
                      ${gbpHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
        : '';

    const aiBlock = ai
        ? `
            <tr>
              <td style="padding:0 28px 14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;border-left:4px solid #0F172A;border-radius:0 12px 12px 0;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#0F172A;margin-bottom:4px;">
                        AI visibility
                      </div>
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;color:#DC2626;margin-bottom:12px;">
                        Note: critical issues
                      </div>
                      ${aiHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
        : '';

    const ctaBlock = safeRequest
        ? `
            <tr>
              <td style="padding:8px 28px 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0F172A;border-radius:14px;">
                  <tr>
                    <td style="padding:26px 24px;" align="center">
                      <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;margin-bottom:8px;text-align:center;">Want the full picture?</div>
                      <p style="margin:0 auto 18px;max-width:400px;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:14px;color:#CBD5E1;line-height:1.55;text-align:center;">
                        Request a full main audit and we will run it, then get back to you with the complete report.
                      </p>
                      <a href="${safeRequest}" style="display:inline-block;background:#F59E0B;color:#0F172A;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;">
                        Request a full main audit
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
        : '';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <!--<![endif]-->
</head>
<body style="margin:0;padding:0;background:#EEF2F6;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF2F6;padding:28px 12px;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;">
          <tr>
            <td style="background:#0F172A;padding:20px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;width:36px;">${logoImg}</td>
                  <td style="vertical-align:middle;">
                    <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">ZappSites</div>
                    <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#FBBF24;margin-top:3px;font-weight:700;">Visibility notes</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 16px;">
              <p style="margin:0 0 10px;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:17px;color:#0F172A;line-height:1.4;font-weight:700;">Hi ${safeBiz},</p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:15px;color:#475569;line-height:1.6;">
                Quick notes from our visibility review of your business — focused on what matters for local discovery.
              </p>
            </td>
          </tr>
          ${criticalBlock}
          ${ctaBlock}
          ${gbpBlock}
          ${aiBlock}
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 28px;">
              <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;color:#0F172A;">ZappSites</div>
              <div style="font-family:'Plus Jakarta Sans',Inter,Arial,Helvetica,sans-serif;font-size:12px;color:#94A3B8;margin-top:2px;">Local SEO for growing businesses</div>
            </td>
          </tr>
        </table>
        ${pixel}
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (logoTrack) {
        console.log('[booking-email] lead-obs open-track logo', logoTrack.slice(0, 80));
    }

    return sendMail({ to, subject, text, html });
}

export {
    sendMail,
    sendMailWithAttachment,
    sendFullAuditShareEmail,
    sendLeadObservationsEmail,
    sendBookingConfirmationEmail,
    sendHostBookingNotification,
    sendInvoiceEmail,
    sendCancellationEmail,
    sendRescheduleEmail,
    sendPasswordResetEmail,
    sendPasswordResetOtpEmail,
    formatMoneyFromCents
};
