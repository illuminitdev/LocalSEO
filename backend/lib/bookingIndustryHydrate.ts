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

/**
 * If org has bookings entitlement / a booking-* plan and no industry yet,
 * pull from Stripe subscription metadata and persist.
 */
export async function hydrateOrgBookingIndustry(orgId: string): Promise<BookingIndustryId | null> {
    if (!orgId) return null;

    const { rows: orgRows } = await query(
        `SELECT booking_industry_id, trade_type FROM organizations WHERE id = $1`,
        [orgId]
    );
    const org = orgRows[0];
    if (!org) return null;

    const existing = normalizeBookingIndustryId(org.booking_industry_id);
    if (existing) return existing;

    const { rows: subRows } = await query(
        `SELECT plan_id, stripe_subscription_id
         FROM subscriptions
         WHERE org_id = $1 AND status = 'active'
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 10`,
        [orgId]
    );

    const bookingSub = subRows.find((s: any) => isBookingPlanId(s.plan_id));
    if (!bookingSub) return null;

    let industryId = await industryIdFromStripeSubscription(bookingSub.stripe_subscription_id);

    // Soft fallback from trade_type text if Stripe meta missing
    if (!industryId && org.trade_type) {
        const preset = getBookingPreset(String(org.trade_type));
        industryId = preset.id;
    }

    if (!industryId) return null;

    const preset = getBookingPreset(industryId);
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
