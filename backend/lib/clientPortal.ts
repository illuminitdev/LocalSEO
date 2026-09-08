import { randomBytes } from 'crypto';
import { query } from './db';

const PORTAL_TOKEN_DAYS = 90;

export function newPortalToken() {
    return randomBytes(24).toString('hex');
}

/** Issue or refresh a long-lived portal magic link for a client. */
export async function ensureClientPortalToken(orgId: string, clientId: string) {
    const { rows: existing } = await query(
        `SELECT * FROM client_portal_tokens
         WHERE org_id = $1 AND client_id = $2 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, clientId]
    );
    if (existing[0]) return existing[0];

    const token = newPortalToken();
    const { rows } = await query(
        `INSERT INTO client_portal_tokens (org_id, client_id, token, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 day'))
         RETURNING *`,
        [orgId, clientId, token, PORTAL_TOKEN_DAYS]
    );
    return rows[0];
}

export async function loadPortalByToken(token: string) {
    const { rows } = await query(
        `SELECT t.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                c.status AS client_status, c.notes AS client_notes,
                o.slug AS org_slug, o.name AS org_name, o.phone AS org_phone, o.email AS org_email,
                o.host_name, o.trade_type, o.currency
         FROM client_portal_tokens t
         JOIN clients c ON c.id = t.client_id
         JOIN organizations o ON o.id = t.org_id
         WHERE t.token = $1 AND t.expires_at > NOW()`,
        [token]
    );
    if (!rows.length) return null;
    const row = rows[0];
    await query(`UPDATE client_portal_tokens SET last_used_at = NOW() WHERE id = $1`, [row.id]);

    const { rows: properties } = await query(
        `SELECT * FROM client_properties WHERE client_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [row.client_id]
    );

    const { rows: bookings } = await query(
        `SELECT b.id, b.status, b.job_status, b.intake_type, b.start_at, b.end_at, b.description,
                b.customer_address, b.manage_token, b.deposit_paid, b.deposit_cents, b.total_cents,
                e.name AS event_name, e.slug AS event_slug,
                i.status AS invoice_status, i.stripe_hosted_url AS invoice_url, i.amount_cents AS invoice_amount_cents
         FROM bookings b
         LEFT JOIN event_types e ON e.id = b.event_type_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE b.client_id = $1 AND b.org_id = $2
         ORDER BY b.start_at DESC
         LIMIT 50`,
        [row.client_id, row.org_id]
    );

    const { rows: invoices } = await query(
        `SELECT i.id, i.status, i.amount_cents, i.stripe_hosted_url, i.created_at, b.start_at AS booking_start
         FROM invoices i
         JOIN bookings b ON b.id = i.booking_id
         WHERE (i.client_id = $1 OR b.client_id = $1) AND b.org_id = $2
         ORDER BY i.created_at DESC
         LIMIT 30`,
        [row.client_id, row.org_id]
    );

    const { rows: eventTypes } = await query(
        `SELECT slug, name, description, duration_minutes, deposit_cents, total_cents
         FROM event_types WHERE org_id = $1 AND active = TRUE ORDER BY sort_order, created_at`,
        [row.org_id]
    );

    return {
        token: row.token,
        expiresAt: row.expires_at,
        organization: {
            slug: row.org_slug,
            name: row.org_name,
            phone: row.org_phone,
            email: row.org_email,
            hostName: row.host_name,
            tradeType: row.trade_type,
            currency: row.currency || 'GBP'
        },
        client: {
            id: row.client_id,
            name: row.client_name,
            email: row.client_email,
            phone: row.client_phone,
            status: row.client_status,
            address: properties[0]?.address || ''
        },
        bookings,
        invoices,
        eventTypes
    };
}

export function portalUrl(token: string) {
    const origin = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return `${origin}/book/portal/${token}`;
}
