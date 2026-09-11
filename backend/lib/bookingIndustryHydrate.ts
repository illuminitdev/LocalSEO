import Stripe from 'stripe';
import { query } from './db';
import {
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

type SubRow = { plan_id?: string; stripe_subscription_id?: string | null };

async function findBookingSubscriptionRows(orgId: string): Promise<SubRow[]> {
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
    const emails = Array.from(
        new Set(
            [orgEmail, ...memberEmails.map((r: any) => String(r.email || '').trim().toLowerCase())].filter(
                Boolean
            )
        )
    );

    const { rows: byOrg } = await query(
        `SELECT plan_id, stripe_subscription_id
         FROM subscriptions
         WHERE org_id = $1 AND status = 'active'
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 20`,
        [orgId]
    );

    let byEmail: SubRow[] = [];
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

    let byInvite: SubRow[] = [];
    if (emails.length) {
        const { rows } = await query(
            `SELECT plan_id, stripe_subscription_id
             FROM portal_invites
             WHERE LOWER(email) = ANY($1::text[])
                OR org_id = $2
             ORDER BY updated_at DESC NULLS LAST, created_at DESC
             LIMIT 10`,
            [emails, orgId]
        ).catch(() => ({ rows: [] as SubRow[] }));
        byInvite = rows;
    }

    const merged = [...byOrg, ...byEmail, ...byInvite];
    const seen = new Set<string>();
    const unique: SubRow[] = [];
    for (const row of merged) {
        const key = String(row.stripe_subscription_id || row.plan_id || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
    }
    return unique;
}

/**
 * If org has a booking-* plan and no industry yet,
 * pull from Stripe subscription metadata (and invite/email fallbacks) and persist.
 */
export async function hydrateOrgBookingIndustry(orgId: string): Promise<BookingIndustryId | null> {
    if (!orgId) return null;

    const { rows: orgRows } = await query(
        `SELECT booking_industry_id, trade_type FROM organizations WHERE id = $1`,
        [orgId]
    ).catch(async (err: any) => {
        // Migration not applied yet — still try Stripe, but cannot persist until column exists.
        if (/booking_industry_id/i.test(String(err?.message || ''))) {
            return { rows: [{ booking_industry_id: null, trade_type: '' }] };
        }
        throw err;
    });
    const org = orgRows[0];
    if (!org) return null;

    const existing = normalizeBookingIndustryId(org.booking_industry_id);
    if (existing) return existing;

    const subRows = await findBookingSubscriptionRows(orgId);
    const bookingSub =
        subRows.find((s) => isBookingPlanId(String(s.plan_id || ''))) ||
        subRows.find((s) => Boolean(s.stripe_subscription_id));

    let industryId: BookingIndustryId | null = null;
    if (bookingSub?.stripe_subscription_id) {
        industryId = await industryIdFromStripeSubscription(bookingSub.stripe_subscription_id);
    }

    // Soft fallback from trade_type text if Stripe meta missing
    if (!industryId && org.trade_type) {
        const preset = getBookingPreset(String(org.trade_type));
        // Only accept if trade_type looked like a real industry label / id
        if (String(org.trade_type).trim()) industryId = preset.id;
    }

    if (!industryId) return null;

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
        // Column missing — still return id so UI can lock to checkout industry this request.
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
