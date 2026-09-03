import { query } from './db';

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

/** Application fee in cents from deposit; `STRIPE_PLATFORM_FEE_BPS` (default 500 = 5%). */
export function applicationFeeAmount(depositCents: number): number {
    const raw = parseInt(process.env.STRIPE_PLATFORM_FEE_BPS || '500', 10);
    const bps = Number.isFinite(raw) && raw >= 0 ? raw : 500;
    if (!depositCents || depositCents <= 0 || bps === 0) return 0;
    return Math.min(depositCents, Math.floor((depositCents * bps) / 10000));
}

export function connectReturnUrl() {
    return (
        process.env.STRIPE_CONNECT_RETURN_URL ||
        `${frontendOrigin()}/booking/settings?tab=integrations&stripe=return`
    );
}

export function connectRefreshUrl() {
    return (
        process.env.STRIPE_CONNECT_REFRESH_URL ||
        `${frontendOrigin()}/booking/settings?tab=integrations&stripe=refresh`
    );
}

export function defaultConnectCountry() {
    return (process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'GB').toUpperCase();
}

export function stripeAccountOpts(stripeAccountId: string | null | undefined) {
    if (!stripeAccountId) return undefined;
    return { stripeAccount: stripeAccountId };
}

export async function syncOrgStripeAccount(account: {
    id: string;
    charges_enabled?: boolean;
    details_submitted?: boolean;
}) {
    const { rows } = await query(
        `UPDATE organizations
         SET stripe_charges_enabled = $2,
             stripe_details_submitted = $3
         WHERE stripe_account_id = $1
         RETURNING id, stripe_account_id, stripe_charges_enabled, stripe_details_submitted`,
        [account.id, Boolean(account.charges_enabled), Boolean(account.details_submitted)]
    );
    return rows[0] || null;
}

export async function refreshOrgStripeFromStripe(stripeClient: any, orgId: string) {
    const { rows } = await query(
        `SELECT id, stripe_account_id, stripe_charges_enabled, stripe_details_submitted
         FROM organizations WHERE id = $1`,
        [orgId]
    );
    const org = rows[0];
    if (!org?.stripe_account_id || !stripeClient) return org || null;

    const account = await stripeClient.accounts.retrieve(org.stripe_account_id);
    await syncOrgStripeAccount(account);
    const { rows: updated } = await query(
        `SELECT id, stripe_account_id, stripe_charges_enabled, stripe_details_submitted
         FROM organizations WHERE id = $1`,
        [orgId]
    );
    return updated[0] || null;
}

export function connectStatusPayload(org: {
    stripe_account_id?: string | null;
    stripe_charges_enabled?: boolean;
    stripe_details_submitted?: boolean;
} | null) {
    const accountId = org?.stripe_account_id || null;
    const chargesEnabled = Boolean(org?.stripe_charges_enabled);
    const detailsSubmitted = Boolean(org?.stripe_details_submitted);
    return {
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        accountId,
        chargesEnabled,
        detailsSubmitted,
        connected: Boolean(accountId),
        ready: Boolean(accountId && chargesEnabled),
        onboardingComplete: detailsSubmitted && chargesEnabled
    };
}

export async function ensureConnectAccount(stripeClient: any, org: any) {
    if (org.stripe_account_id) {
        return org.stripe_account_id as string;
    }

    const account = await stripeClient.accounts.create({
        type: 'express',
        country: defaultConnectCountry(),
        email: org.email || undefined,
        capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true }
        },
        business_profile: {
            name: org.name || undefined,
            product_description: 'Local service bookings via ZappSites'
        },
        metadata: {
            orgId: org.id,
            orgSlug: org.slug || ''
        }
    });

    await query(
        `UPDATE organizations
         SET stripe_account_id = $2,
             stripe_charges_enabled = FALSE,
             stripe_details_submitted = FALSE
         WHERE id = $1`,
        [org.id, account.id]
    );

    return account.id as string;
}

export async function createConnectAccountLink(stripeClient: any, accountId: string) {
    const link = await stripeClient.accountLinks.create({
        account: accountId,
        refresh_url: connectRefreshUrl(),
        return_url: connectReturnUrl(),
        type: 'account_onboarding'
    });
    return link.url as string;
}

export async function createConnectLoginLink(stripeClient: any, accountId: string) {
    const link = await stripeClient.accounts.createLoginLink(accountId);
    return link.url as string;
}
