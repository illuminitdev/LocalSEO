import crypto from 'crypto';
import { query } from './db';

export type EmailShareStatus = 'none' | 'sent' | 'opened';

export type AuditEmailShareInfo = {
    emailShareStatus: EmailShareStatus;
    emailShareSentAt: string | null;
    emailShareOpenedAt: string | null;
};

const EMPTY_SHARE: AuditEmailShareInfo = {
    emailShareStatus: 'none',
    emailShareSentAt: null,
    emailShareOpenedAt: null
};

export function apiPublicOrigin() {
    const raw = (
        process.env.API_BASE_URL ||
        process.env.API_PUBLIC_URL ||
        process.env.BACKEND_URL ||
        ''
    ).trim();
    // Do NOT fall back to FRONTEND_URL — pixel must hit the API host, not the SPA
    return (raw || 'http://localhost:4000').replace(/\/$/, '');
}

export function newAuditEmailOpenToken() {
    return crypto.randomBytes(24).toString('hex');
}

/** Visible logo URL (marks opened when Gmail loads images). */
export function auditEmailLogoTrackingUrl(token: string) {
    const t = String(token || '').trim();
    if (!t) return '';
    return `${apiPublicOrigin()}/api/public/audit-email-open/${t}/logo.png`;
}

/** Tiny pixel fallback. */
export function auditEmailOpenTrackingUrl(token: string) {
    const t = String(token || '').trim();
    if (!t) return '';
    return `${apiPublicOrigin()}/api/public/audit-email-open/${t}/pixel.gif`;
}

/** Click-through URL that marks opened, then redirects to the real report/PDF. */
export function auditEmailClickTrackingUrl(token: string, destinationUrl: string) {
    const t = String(token || '').trim();
    const dest = String(destinationUrl || '').trim();
    if (!t || !dest) return dest;
    return `${apiPublicOrigin()}/api/public/audit-email-click/${t}?u=${encodeURIComponent(dest)}`;
}

export async function recordAuditEmailSend(opts: {
    token: string;
    auditId: string;
    toEmail: string;
    sentByUserId?: string | null;
}) {
    const token = String(opts.token || '').trim();
    const auditId = String(opts.auditId || '').trim();
    const toEmail = String(opts.toEmail || '').trim().toLowerCase();
    if (!token || !auditId || !toEmail) return;
    await query(
        `INSERT INTO audit_email_sends (token, audit_id, to_email, sent_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token) DO NOTHING`,
        [token, auditId, toEmail, opts.sentByUserId || null]
    );
}

export function normalizeOpenToken(tokenRaw: string): string {
    return String(tokenRaw || '')
        .replace(/\/?(logo\.png|pixel\.gif)$/i, '')
        .replace(/\.gif$/i, '')
        .replace(/\.png$/i, '')
        .trim();
}

export async function markAuditEmailOpened(tokenRaw: string): Promise<boolean> {
    const token = normalizeOpenToken(tokenRaw);
    if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) return false;
    const { rowCount } = await query(
        `UPDATE audit_email_sends
         SET opened_at = COALESCE(opened_at, NOW()),
             open_count = open_count + 1
         WHERE token = $1`,
        [token]
    );
    return Boolean(rowCount);
}

export function isSafeHttpUrl(raw: string): boolean {
    try {
        const u = new URL(String(raw || '').trim());
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

export async function fetchLatestAuditEmailShareMap(
    auditIds: string[]
): Promise<Map<string, AuditEmailShareInfo>> {
    const map = new Map<string, AuditEmailShareInfo>();
    const ids = Array.from(new Set(auditIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return map;

    try {
        // Any successful open for this audit counts (not only the latest send row)
        const { rows } = await query(
            `SELECT
                audit_id,
                MAX(sent_at) AS sent_at,
                MAX(opened_at) AS opened_at
             FROM audit_email_sends
             WHERE audit_id = ANY($1::text[])
             GROUP BY audit_id`,
            [ids]
        );
        for (const row of rows) {
            const auditId = String(row.audit_id);
            const openedAt = row.opened_at ? new Date(row.opened_at).toISOString() : null;
            const sentAt = row.sent_at ? new Date(row.sent_at).toISOString() : null;
            map.set(auditId, {
                emailShareStatus: openedAt ? 'opened' : 'sent',
                emailShareSentAt: sentAt,
                emailShareOpenedAt: openedAt
            });
        }
    } catch (err) {
        console.warn('[audit-email-sends] fetch map failed:', err);
    }

    return map;
}

export function shareInfoForAudit(
    map: Map<string, AuditEmailShareInfo>,
    auditId: string | null | undefined
): AuditEmailShareInfo {
    const id = String(auditId || '').trim();
    if (!id) return EMPTY_SHARE;
    return map.get(id) || EMPTY_SHARE;
}

/** 1x1 transparent GIF */
export const TRANSPARENT_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

/**
 * Valid 1×1 PNG — shown larger in the email as the brand mark.
 * When Gmail loads this image, we mark the send as opened.
 */
export const ZAPP_EMAIL_LOGO_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);
