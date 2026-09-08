import { createHmac } from 'crypto';
import { query } from './db';

export type ZapierEvent =
    | 'booking.created'
    | 'booking.completed'
    | 'quote.approved'
    | 'invoice.paid';

async function loadZapierConfig(orgId: string) {
    const { rows } = await query(
        `SELECT zapier_webhook_url, zapier_secret FROM organizations WHERE id = $1`,
        [orgId]
    );
    const url = String(rows[0]?.zapier_webhook_url || '').trim();
    const secret = String(rows[0]?.zapier_secret || '').trim();
    if (!url.startsWith('https://')) return null;
    return { url, secret };
}

function signBody(secret: string, body: string) {
    if (!secret) return null;
    return createHmac('sha256', secret).update(body).digest('hex');
}

/** Fire-and-forget Zapier webhook. Never throws to callers. */
export async function fireZapierEvent(orgId: string, event: ZapierEvent, payload: Record<string, unknown>) {
    try {
        const cfg = await loadZapierConfig(orgId);
        if (!cfg) return;
        const body = JSON.stringify({
            event,
            orgId,
            occurredAt: new Date().toISOString(),
            data: payload
        });
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-LocalPulse-Event': event
        };
        const sig = signBody(cfg.secret, body);
        if (sig) headers['X-LocalPulse-Signature'] = `sha256=${sig}`;
        const res = await fetch(cfg.url, { method: 'POST', headers, body });
        if (!res.ok) {
            console.warn(`Zapier webhook ${event} failed:`, res.status, await res.text().catch(() => ''));
        }
    } catch (err: any) {
        console.warn('Zapier webhook error:', err?.message || err);
    }
}
