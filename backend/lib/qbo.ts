import { query } from './db';

const QBO_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_API = process.env.QBO_SANDBOX === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';

function qboConfigured() {
    return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

function redirectUri() {
    const base = (process.env.API_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    if (base) return `${base}/api/integrations/qbo/callback`;
    return `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/api/integrations/qbo/callback`;
}

export function qboStatus() {
    return { configured: qboConfigured() };
}

export function getQboAuthUrl(orgId: string) {
    if (!qboConfigured()) return null;
    const params = new URLSearchParams({
        client_id: process.env.QBO_CLIENT_ID!,
        response_type: 'code',
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: redirectUri(),
        state: orgId
    });
    return `${QBO_AUTH}?${params}`;
}

async function exchangeCode(code: string) {
    const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri()
    });
    const res = await fetch(QBO_TOKEN, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
        },
        body
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`QBO token exchange failed: ${text}`);
    }
    return res.json();
}

export async function handleQboCallback(code: string, realmId: string, orgId: string) {
    const tokens = await exchangeCode(code);
    const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000);
    await query(
        `UPDATE organizations SET
            qbo_realm_id = $1,
            qbo_access_token = $2,
            qbo_refresh_token = $3,
            qbo_token_expires_at = $4,
            qbo_connected_at = NOW()
         WHERE id = $5`,
        [realmId, tokens.access_token, tokens.refresh_token || null, expiresAt.toISOString(), orgId]
    );
    return { connected: true };
}

export async function getOrgQboStatus(orgId: string) {
    const { rows } = await query(
        `SELECT qbo_realm_id, qbo_connected_at, qbo_token_expires_at,
                (qbo_access_token IS NOT NULL AND qbo_access_token <> '') AS connected
         FROM organizations WHERE id = $1`,
        [orgId]
    );
    const row = rows[0];
    return {
        configured: qboConfigured(),
        connected: Boolean(row?.connected),
        realmId: row?.qbo_realm_id || null,
        connectedAt: row?.qbo_connected_at || null,
        expiresAt: row?.qbo_token_expires_at || null
    };
}

export async function disconnectQbo(orgId: string) {
    await query(
        `UPDATE organizations SET
            qbo_realm_id = NULL, qbo_access_token = NULL, qbo_refresh_token = NULL,
            qbo_token_expires_at = NULL, qbo_connected_at = NULL
         WHERE id = $1`,
        [orgId]
    );
}

/** Push a minimal sales receipt / journal note for a paid invoice. Best-effort stub. */
export async function pushPaidInvoiceToQbo(orgId: string, invoice: any, booking?: any) {
    try {
        const { rows } = await query(
            `SELECT qbo_realm_id, qbo_access_token FROM organizations WHERE id = $1`,
            [orgId]
        );
        const org = rows[0];
        if (!org?.qbo_access_token || !org?.qbo_realm_id) return { skipped: true, reason: 'not_connected' };

        const amount = Number(invoice.amount_cents || 0) / 100;
        const doc = {
            Line: [
                {
                    Amount: amount,
                    DetailType: 'SalesItemLineDetail',
                    Description: `LocalPulse invoice ${invoice.id || ''} — ${booking?.customer_name || ''}`.trim(),
                    SalesItemLineDetail: {
                        Qty: 1,
                        UnitPrice: amount
                    }
                }
            ],
            PrivateNote: `Synced from LocalPulse booking ${booking?.id || invoice.booking_id || ''}`
        };

        const res = await fetch(
            `${QBO_API}/v3/company/${org.qbo_realm_id}/salesreceipt?minorversion=65`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${org.qbo_access_token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify(doc)
            }
        );
        if (!res.ok) {
            const text = await res.text();
            console.warn('QBO push failed:', res.status, text.slice(0, 500));
            return { skipped: false, ok: false, error: text.slice(0, 200) };
        }
        return { skipped: false, ok: true };
    } catch (err: any) {
        console.warn('QBO push error:', err?.message || err);
        return { skipped: false, ok: false, error: err?.message };
    }
}
