import crypto from 'crypto';
import { query } from './db';
import {
    apiPublicOrigin,
    normalizeOpenToken,
    type EmailShareStatus
} from './auditEmailSends';

export type LeadObservationEmailShareInfo = {
    observationEmailShareStatus: EmailShareStatus;
    observationEmailSentAt: string | null;
    observationEmailOpenedAt: string | null;
};

const EMPTY_SHARE: LeadObservationEmailShareInfo = {
    observationEmailShareStatus: 'none',
    observationEmailSentAt: null,
    observationEmailOpenedAt: null
};

export function newLeadObservationEmailToken() {
    return crypto.randomBytes(24).toString('hex');
}

export function leadEmailLogoTrackingUrl(token: string) {
    const t = String(token || '').trim();
    if (!t) return '';
    return `${apiPublicOrigin()}/api/public/lead-email-open/${t}/logo.png`;
}

export function leadEmailOpenTrackingUrl(token: string) {
    const t = String(token || '').trim();
    if (!t) return '';
    return `${apiPublicOrigin()}/api/public/lead-email-open/${t}/pixel.gif`;
}

export function leadFullAuditRequestUrl(token: string) {
    const t = String(token || '').trim();
    if (!t) return '';
    // Branded app URL — not the raw API Gateway host
    const appOrigin = (
        process.env.FRONTEND_URL ||
        process.env.CLIENT_ORIGIN ||
        ''
    )
        .trim()
        .replace(/\/$/, '');
    if (appOrigin) {
        return `${appOrigin}/request-full-audit/${t}`;
    }
    return `${apiPublicOrigin()}/api/public/lead-full-audit-request/${t}`;
}

export async function recordLeadObservationEmailSend(opts: {
    token: string;
    leadId: string;
    toEmail: string;
    sentByUserId?: string | null;
}) {
    const token = String(opts.token || '').trim();
    const leadId = String(opts.leadId || '').trim();
    const toEmail = String(opts.toEmail || '').trim().toLowerCase();
    if (!token || !leadId || !toEmail) return;
    await query(
        `INSERT INTO lead_observation_email_sends (token, lead_id, to_email, sent_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token) DO NOTHING`,
        [token, leadId, toEmail, opts.sentByUserId || null]
    );
}

export async function markLeadObservationEmailOpened(tokenRaw: string): Promise<boolean> {
    const token = normalizeOpenToken(tokenRaw);
    if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return false;
    const { rowCount } = await query(
        `UPDATE lead_observation_email_sends
         SET opened_at = COALESCE(opened_at, NOW()),
             open_count = open_count + 1
         WHERE token = $1`,
        [token]
    );
    return Boolean(rowCount);
}

export async function getLeadObservationEmailSendByToken(tokenRaw: string) {
    const token = normalizeOpenToken(tokenRaw);
    if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return null;
    const { rows } = await query(
        `SELECT token, lead_id, to_email, sent_by_user_id, sent_at, opened_at
         FROM lead_observation_email_sends
         WHERE token = $1
         LIMIT 1`,
        [token]
    );
    return rows[0] || null;
}

export async function fetchLatestLeadObservationEmailShareMap(
    leadIds: string[]
): Promise<Map<string, LeadObservationEmailShareInfo>> {
    const map = new Map<string, LeadObservationEmailShareInfo>();
    const ids = Array.from(new Set(leadIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return map;

    try {
        const { rows } = await query(
            `SELECT
                lead_id,
                MAX(sent_at) AS sent_at,
                MAX(opened_at) AS opened_at
             FROM lead_observation_email_sends
             WHERE lead_id = ANY($1::text[])
             GROUP BY lead_id`,
            [ids]
        );
        for (const row of rows) {
            const leadId = String(row.lead_id);
            const openedAt = row.opened_at ? new Date(row.opened_at).toISOString() : null;
            const sentAt = row.sent_at ? new Date(row.sent_at).toISOString() : null;
            map.set(leadId, {
                observationEmailShareStatus: openedAt ? 'opened' : 'sent',
                observationEmailSentAt: sentAt,
                observationEmailOpenedAt: openedAt
            });
        }
    } catch (err) {
        console.warn('[lead-obs-email] fetch map failed:', err);
    }

    return map;
}

export function shareInfoForLeadObservation(
    map: Map<string, LeadObservationEmailShareInfo>,
    leadId: string | null | undefined
): LeadObservationEmailShareInfo {
    const id = String(leadId || '').trim();
    if (!id) return EMPTY_SHARE;
    return map.get(id) || EMPTY_SHARE;
}
