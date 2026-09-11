import Stripe from 'stripe';
import { query } from './db';
import {
    bookingIndustryPresets,
    getBookingPreset,
    isBookingPlanId,
    normalizeBookingIndustryId,
    type BookingIndustryId
} from './bookingIndustryPresets';

function getStripeClient(): Stripe | null {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    try {
        return new Stripe(process.env.STRIPE_SECRET_KEY);
    } catch {
        return null;
    }
}

function paymentApiBase(): string {
    const fromEnv = String(process.env.PAYMENT_API_URL || process.env.ZAPP_SITES_PAYMENT_API_URL || '')
        .trim()
        .replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    // Prod/live ZappSites payment API (same account as booking checkout)
    return 'https://gq94idnsj0.execute-api.us-east-1.amazonaws.com';
}

/** Read booking_industry_id from a Stripe subscription's metadata. */
export async function industryIdFromStripeSubscription(
    stripeSubscriptionId: string | null | undefined
): Promise<BookingIndustryId | null> {
    const subId = String(stripeSubscriptionId || '').trim();
    if (!subId) return null;
    const stripe = getStripeClient();
    if (!stripe) return null;
    try {
        const sub = await stripe.subscriptions.retrieve(subId);
        return normalizeBookingIndustryId(sub.metadata?.booking_industry_id);
    } catch (err: any) {
        console.warn('Stripe subscription industry lookup failed:', err?.message || err);
        return null;
    }
}

/** Read booking_industry_id via ZappSites Payment API (uses live Stripe there). */
export async function industryIdFromPaymentCheckoutSession(
    stripeSessionId: string | null | undefined
): Promise<BookingIndustryId | null> {
    const sessionId = String(stripeSessionId || '').trim();
    if (!sessionId.startsWith('cs_')) return null;
    const url = `${paymentApiBase()}/checkout/success-details?session_id=${encodeURIComponent(sessionId)}`;
    try {
        const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) {
            console.warn('Payment success-details industry lookup failed:', res.status);
            return null;
        }
        const data = (await res.json()) as { bookingIndustryId?: string | null };
        return normalizeBookingIndustryId(data?.bookingIndustryId);
    } catch (err: any) {
        console.warn('Payment success-details industry lookup failed:', err?.message || err);
        return null;
    }
}

type InviteIndustryRow = {
    id?: string;
    plan_id?: string;
    booking_industry_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_session_id?: string | null;
};

async function orgEmails(orgId: string): Promise<string[]> {
    const { rows: orgRows } = await query(`SELECT email FROM organizations WHERE id = $1`, [orgId]);
    const orgEmail = String(orgRows[0]?.email || '')
        .trim()
        .toLowerCase();

    const { rows: memberEmails } = await query(
        `SELECT LOWER(u.email) AS email
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1`,
        [orgId]
    );
    return Array.from(
        new Set(
            [orgEmail, ...memberEmails.map((r: any) => String(r.email || '').trim().toLowerCase())].filter(
                Boolean
            )
        )
    );
}

async function findInviteIndustryRows(orgId: string): Promise<InviteIndustryRow[]> {
    const emails = await orgEmails(orgId);
    const { rows } = await query(
        `SELECT id, plan_id, booking_industry_id, stripe_subscription_id, stripe_session_id
         FROM portal_invites
         WHERE org_id = $1
            OR ($2::text[] IS NOT NULL AND LOWER(email) = ANY($2::text[]))
         ORDER BY
           CASE WHEN plan_id LIKE 'booking%' THEN 0 ELSE 1 END,
           updated_at DESC NULLS LAST,
           created_at DESC
         LIMIT 10`,
        [orgId, emails.length ? emails : null]
    ).catch(() => ({ rows: [] as InviteIndustryRow[] }));
    return rows;
}

async function backfillInviteIndustry(inviteId: string | undefined, industryId: BookingIndustryId) {
    if (!inviteId) return;
    try {
        await query(
            `UPDATE portal_invites
             SET booking_industry_id = COALESCE(NULLIF(TRIM(booking_industry_id), ''), $2),
                 updated_at = NOW()
             WHERE id = $1`,
            [inviteId, industryId]
        );
    } catch (err: any) {
        if (!/booking_industry_id/i.test(String(err?.message || ''))) {
            console.warn('Could not backfill invite booking_industry_id:', err?.message || err);
        }
    }
}

function industryIdFromTradeTypeLabel(tradeType: string | null | undefined): BookingIndustryId | null {
    const raw = String(tradeType || '').trim();
    if (!raw) return null;
    const byId = normalizeBookingIndustryId(raw);
    if (byId) return byId;
    const lower = raw.toLowerCase();
    const byName = bookingIndustryPresets.find(
        (p) => p.name.toLowerCase() === lower || p.shortName.toLowerCase() === lower
    );
    return byName ? byName.id : null;
}

/**
 * If org has no industry yet, recover from invite / Payment API / Stripe and persist.
 */
export async function hydrateOrgBookingIndustry(orgId: string): Promise<BookingIndustryId | null> {
    if (!orgId) return null;

    const { rows: orgRows } = await query(
        `SELECT booking_industry_id, trade_type FROM organizations WHERE id = $1`,
        [orgId]
    ).catch(async (err: any) => {
        if (/booking_industry_id/i.test(String(err?.message || ''))) {
            return { rows: [{ booking_industry_id: null, trade_type: '' }] };
        }
        throw err;
    });
    const org = orgRows[0];
    if (!org) return null;

    const existing = normalizeBookingIndustryId(org.booking_industry_id);
    if (existing) return existing;

    const invites = await findInviteIndustryRows(orgId);
    let industryId: BookingIndustryId | null = null;
    let sourceInviteId: string | undefined;

    // 1) Invite column written at ZappSites checkout
    for (const inv of invites) {
        const id = normalizeBookingIndustryId(inv.booking_industry_id);
        if (id) {
            industryId = id;
            sourceInviteId = inv.id;
            break;
        }
    }

    // 2) ZappSites Payment API (live Stripe) via checkout session on invite
    if (!industryId) {
        for (const inv of invites) {
            if (!inv.stripe_session_id) continue;
            const id = await industryIdFromPaymentCheckoutSession(inv.stripe_session_id);
            if (id) {
                industryId = id;
                sourceInviteId = inv.id;
                break;
            }
        }
    }

    // 3) Local Stripe key (often wrong stage/account — last resort)
    if (!industryId) {
        for (const inv of invites) {
            if (!inv.stripe_subscription_id) continue;
            const id = await industryIdFromStripeSubscription(inv.stripe_subscription_id);
            if (id) {
                industryId = id;
                sourceInviteId = inv.id;
                break;
            }
        }
    }

    // 4) Active booking subscription rows (org / email)
    if (!industryId) {
        const emails = await orgEmails(orgId);
        const { rows: byOrg } = await query(
            `SELECT plan_id, stripe_subscription_id
             FROM subscriptions
             WHERE org_id = $1 AND status = 'active'
             ORDER BY updated_at DESC NULLS LAST, created_at DESC
             LIMIT 20`,
            [orgId]
        );
        let byEmail: { plan_id?: string; stripe_subscription_id?: string | null }[] = [];
        if (emails.length) {
            const { rows } = await query(
                `SELECT plan_id, stripe_subscription_id
                 FROM subscriptions
                 WHERE status = 'active'
                   AND LOWER(customer_email) = ANY($1::text[])
                 ORDER BY updated_at DESC NULLS LAST, created_at DESC
                 LIMIT 20`,
                [emails]
            );
            byEmail = rows;
        }
        const subRows = [...byOrg, ...byEmail];
        const bookingSub =
            subRows.find((s) => isBookingPlanId(String(s.plan_id || ''))) ||
            subRows.find((s) => Boolean(s.stripe_subscription_id));
        if (bookingSub?.stripe_subscription_id) {
            industryId = await industryIdFromStripeSubscription(bookingSub.stripe_subscription_id);
        }
    }

    // 5) Exact trade_type label match only (never guess plumbing)
    if (!industryId) {
        industryId = industryIdFromTradeTypeLabel(org.trade_type);
    }

    if (!industryId) return null;

    await backfillInviteIndustry(sourceInviteId, industryId);

    const preset = getBookingPreset(industryId);
    try {
        await query(
            `UPDATE organizations
             SET booking_industry_id = $2,
                 trade_type = CASE
                   WHEN TRIM(COALESCE(trade_type, '')) = '' THEN $3
                   ELSE trade_type
                 END
             WHERE id = $1`,
            [orgId, industryId, preset.name]
        );
    } catch (err: any) {
        if (!/booking_industry_id/i.test(String(err?.message || ''))) throw err;
        console.warn('Could not persist booking_industry_id (run migration 024):', err.message);
    }

    return industryId;
}

export async function setOrgBookingIndustry(
    orgId: string,
    industryIdRaw: string | null | undefined,
    { syncTradeType = true }: { syncTradeType?: boolean } = {}
): Promise<BookingIndustryId | null> {
    const industryId = normalizeBookingIndustryId(industryIdRaw);
    if (!industryId || !orgId) return null;
    const preset = getBookingPreset(industryId);
    if (syncTradeType) {
        await query(
            `UPDATE organizations SET booking_industry_id = $2, trade_type = $3 WHERE id = $1`,
            [orgId, industryId, preset.name]
        );
    } else {
        await query(`UPDATE organizations SET booking_industry_id = $2 WHERE id = $1`, [
            orgId,
            industryId
        ]);
    }
    return industryId;
}
