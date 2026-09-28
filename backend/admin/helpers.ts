import Stripe from 'stripe';
import { query } from '../lib/db';
import { comparePassword } from '../lib/authTokens';
import { resolveAdminCredentials } from './adminAuth';
import {
    getFeaturesForPlan,
    formatPrice
} from '../lib/planCatalog';
import { bookingIndustryLabel } from '../lib/bookingIndustryPresets';

function getStripeClient() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    try {
        return new Stripe(process.env.STRIPE_SECRET_KEY);
    } catch {
        return null;
    }
}

function daysLeft(periodEnd?: string | null) {
    if (!periodEnd) return null;
    const ms = new Date(periodEnd).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function serviceModulesForPlan(planId: string | null | undefined) {
    const features = planId ? getFeaturesForPlan(planId) : [];
    const has = (k: string) => features.includes(k as any);
    return [
        { id: 'booking', name: 'Booking board', feature: 'bookings', enrolled: has('bookings') },
        { id: 'profile', name: 'Business profile', feature: 'local_presence', enrolled: has('local_presence') },
        { id: 'citations', name: 'Citations', feature: 'local_presence', enrolled: has('local_presence') },
        { id: 'posts', name: 'GBP posts', feature: 'local_presence', enrolled: has('local_presence') },
        { id: 'media', name: 'Photos', feature: 'local_presence', enrolled: has('local_presence') },
        { id: 'reviews', name: 'Reviews', feature: 'local_presence', enrolled: has('local_presence') },
        { id: 'qa', name: 'Q&A', feature: 'local_presence', enrolled: has('local_presence') },
        { id: 'rank-tracker', name: 'Local Search Grid', feature: 'local_growth', enrolled: has('local_growth') },
        {
            id: 'report',
            name: 'AI Insights',
            feature: 'reporting',
            enrolled: has('local_growth') && has('reporting')
        }
    ];
}

const PRODUCTS = [
    {
        id: 'local_seo',
        name: 'Local SEO Portal',
        status: 'active',
        description: 'This app — rankings, GBP tools, bookings. Access from ZappSites plan features only.'
    },
    {
        id: 'website',
        name: 'ZappSites Website',
        status: 'planned',
        description: 'Marketing / website product (checkout on ZappSites)'
    }
];

async function verifyAdminPassword(password: string) {
    try {
        const { rows } = await query(
            `SELECT password_hash FROM admin_settings WHERE id = 'default' LIMIT 1`
        );
        if (rows[0]?.password_hash) {
            return comparePassword(password, rows[0].password_hash);
        }
    } catch {
        
    }
    const { passwordHash, password: plain } = resolveAdminCredentials();
    if (passwordHash) return comparePassword(password, passwordHash);
    return password === plain;
}

function mapRegisteredUser(row: any) {
    const features = row.plan_id ? getFeaturesForPlan(row.plan_id) : [];
    const phone = String(row.phone || '').trim() || null;
    const bookingIndustryId = row.booking_industry_id || null;
    return {
        kind: 'user' as const,
        userId: row.user_id,
        leadId: row.lead_id || null,
        email: row.email,
        name: row.user_name,
        phone,
        createdAt: row.user_created_at,
        convertedAt: row.converted_at || null,
        convertedByTelecaller: Boolean(row.converted_by_telecaller),
        telecallerName: row.telecaller_name || null,
        mustChangePassword: Boolean(row.must_change_password),
        platformRole: row.platform_role === 'sales_agent' ? 'sales_agent' : 'customer',
        organization: row.org_id
            ? {
                  id: row.org_id,
                  name: row.org_name,
                  slug: row.org_slug,
                  tradeType: row.trade_type,
                  bookingIndustryId,
                  setupComplete: row.setup_complete
              }
            : null,
        serviceLabel:
            row.industry_short_name ||
            row.industry_name ||
            bookingIndustryLabel(bookingIndustryId) ||
            String(row.trade_type || '').trim() ||
            null,
        subscription: row.plan_id
            ? {
                  id: row.subscription_id,
                  planId: row.plan_id,
                  planName: row.plan_name,
                  status: row.subscription_status,
                  priceLabel: row.price_cents
                      ? formatPrice({ priceCents: row.price_cents, currency: row.currency })
                      : null,
                  periodStart: row.current_period_start,
                  periodEnd: row.current_period_end,
                  daysLeft: daysLeft(row.current_period_end),
                  paidAt: row.subscription_created_at,
                  stripeSubscriptionId: row.stripe_subscription_id,
                  stripeCustomerId: row.stripe_customer_id,
                  cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
                  autopayEnabled: !row.cancel_at_period_end
              }
            : null,
        invite: row.invite_id
            ? {
                  id: row.invite_id,
                  status: row.invite_status,
                  claimedAt: row.claimed_at,
                  credentialsEmailedAt: row.credentials_emailed_at,
                  createdAt: row.invite_created_at
              }
            : null,
        invoices: {
            count: row.invoice_count || 0,
            totalCents: row.invoice_total_cents || 0,
            totalLabel:
                row.invoice_total_cents != null
                    ? `£${(Number(row.invoice_total_cents) / 100).toFixed(2)}`
                    : '£0.00'
        },
        features,
        services: serviceModulesForPlan(row.plan_id),
        products: [
            { id: 'local_seo', name: 'Local SEO Portal', enrolled: features.length > 0 || Boolean(row.plan_id) },
            {
                id: 'website',
                name: 'ZappSites Website',
                enrolled: row.plan_id === 'website-essential'
            }
        ]
    };
}

function mapConvertedLeadUser(row: any) {
    return {
        kind: 'converted_lead' as const,
        userId: null,
        leadId: row.lead_id,
        email: row.lead_email || '—',
        name: row.lead_name || 'Converted Customer',
        phone: row.lead_phone || null,
        createdAt: row.converted_at || row.lead_created_at,
        convertedAt: row.converted_at || null,
        convertedByTelecaller: true,
        telecallerName: row.assigned_agent_name || 'Telecaller',
        mustChangePassword: false,
        platformRole: 'customer' as const,
        organization: row.lead_name
            ? {
                  id: row.lead_id,
                  name: row.lead_name,
                  tradeType: row.industry || 'General'
              }
            : null,
        subscription: {
            id: null,
            planId: null,
            planName: 'Converted by Telecaller',
            status: 'converted',
            priceLabel: null,
            periodStart: null,
            periodEnd: null,
            daysLeft: null,
            paidAt: row.converted_at || null,
            stripeSubscriptionId: null,
            stripeCustomerId: null,
            cancelAtPeriodEnd: false,
            autopayEnabled: false
        },
        invite: null,
        invoices: { count: 0, totalCents: 0, totalLabel: '£0.00' },
        features: ['bookings', 'local_presence'],
        services: [],
        products: [
            { id: 'local_seo', name: 'Local SEO Portal', enrolled: true }
        ]
    };
}

function mapInviteUser(row: any) {
    const features = row.plan_id ? getFeaturesForPlan(row.plan_id) : [];
    const phone = String(row.phone || '').trim() || null;
    const bookingIndustryId = row.booking_industry_id || null;
    return {
        kind: 'invite' as const,
        userId: null,
        email: row.email,
        name: row.full_name || '',
        phone,
        createdAt: row.invite_created_at,
        mustChangePassword: true,
        platformRole: 'customer' as const,
        organization: null,
        serviceLabel:
            row.industry_short_name ||
            row.industry_name ||
            bookingIndustryLabel(bookingIndustryId) ||
            null,
        subscription: row.plan_id
            ? {
                  id: row.subscription_id,
                  planId: row.plan_id,
                  planName: row.plan_name,
                  status: row.subscription_status || 'active',
                  priceLabel: row.price_cents
                      ? formatPrice({ priceCents: row.price_cents, currency: row.currency })
                      : null,
                  periodStart: row.current_period_start,
                  periodEnd: row.current_period_end,
                  daysLeft: daysLeft(row.current_period_end),
                  paidAt: row.subscription_created_at || row.invite_created_at,
                  stripeSubscriptionId: row.stripe_subscription_id,
                  stripeCustomerId: row.stripe_customer_id,
                  cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
                  autopayEnabled: !row.cancel_at_period_end
              }
            : null,
        invite: {
            id: row.invite_id,
            status: row.status,
            claimedAt: row.claimed_at,
            credentialsEmailedAt: row.credentials_emailed_at,
            createdAt: row.invite_created_at
        },
        invoices: { count: 0, totalCents: 0, totalLabel: '£0.00' },
        features,
        services: serviceModulesForPlan(row.plan_id),
        products: [
            { id: 'local_seo', name: 'Local SEO Portal', enrolled: features.length > 0 },
            { id: 'website', name: 'ZappSites Website', enrolled: row.plan_id === 'website-essential' }
        ]
    };
}

export {
    getStripeClient,
    daysLeft,
    serviceModulesForPlan,
    PRODUCTS,
    verifyAdminPassword,
    mapRegisteredUser,
    mapConvertedLeadUser,
    mapInviteUser
};
