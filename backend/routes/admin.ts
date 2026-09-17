import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { signToken, comparePassword, hashPassword } from '../lib/authTokens';
import { requireAdmin, adminConfigured, resolveAdminCredentials } from '../middleware/adminAuth';
import { upsertOrgSubscription, setOrgAutopay } from '../middleware/entitlements';
import { uniqueOrgSlug } from '../lib/slug';
import {
    PLANS,
    FEATURE_LABELS,
    FEATURE_KEYS,
    getFeaturesForPlan,
    formatPrice,
    isValidPlanId
} from '../lib/planCatalog';
import {
    isBookingPlanId,
    normalizeBookingIndustryId,
    bookingIndustryLabel
} from '../lib/bookingIndustryPresets';
import { setOrgBookingIndustry } from '../lib/bookingIndustryHydrate';
import Stripe from 'stripe';
import adminFullAuditsRouter from './adminFullAudits';
import { createSalesLead, bulkImportSalesLeads, convertLeadToCustomer, ensureCrmTables, resolveAllLeadIds } from '../lib/sales';

const router = Router();
router.use(adminFullAuditsRouter);

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
        serviceLabel: bookingIndustryLabel(bookingIndustryId) || null,
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

router.post('/login', async (req: Request, res: Response) => {
    try {
        if (!adminConfigured()) {
            return res.status(503).json({
                error: 'Admin login is not configured for this environment.'
            });
        }

        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        const { stage, email: adminEmail } = resolveAdminCredentials();

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        
        if (email !== adminEmail) {
            return res.status(401).json({
                error: 'Invalid admin credentials for this environment.',
                stage
            });
        }

        const ok = await verifyAdminPassword(password);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid admin credentials for this environment.', stage });
        }

        const token = signToken({ role: 'admin', email: adminEmail, stage });
        res.json({
            token,
            admin: { email: adminEmail, role: 'admin', stage }
        });
    } catch (err: any) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: err.message || 'Login failed' });
    }
});

router.get('/me', requireAdmin, async (req: Request, res: Response) => {
    let passwordUpdatedAt: string | null = null;
    try {
        const { rows } = await query(
            `SELECT updated_at FROM admin_settings WHERE id = 'default' LIMIT 1`
        );
        passwordUpdatedAt = rows[0]?.updated_at || null;
    } catch {
        
    }
    res.json({
        admin: (req as any).admin,
        products: PRODUCTS,
        stage: resolveAdminCredentials().stage,
        email: resolveAdminCredentials().email,
        passwordUpdatedAt,
        passwordSource: passwordUpdatedAt ? 'custom' : 'env'
    });
});

router.patch('/settings/password', requireAdmin, async (req: Request, res: Response) => {
    try {
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }

        const ok = await verifyAdminPassword(currentPassword);
        if (!ok) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const passwordHash = await hashPassword(newPassword);
        await query(
            `INSERT INTO admin_settings (id, password_hash, updated_at)
             VALUES ('default', $1, NOW())
             ON CONFLICT (id) DO UPDATE
             SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
            [passwordHash]
        );

        res.json({
            success: true,
            message: 'Admin password updated. Use the new password next time you sign in.'
        });
    } catch (err: any) {
        console.error('Admin password update error:', err);
        res.status(500).json({ error: err.message || 'Could not update password' });
    }
});

router.get('/overview', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const [usersRes, orgsRes, subsRes, bookingsRes, invitesRes] = await Promise.all([
            query('SELECT COUNT(*)::int AS count FROM users'),
            query('SELECT COUNT(*)::int AS count FROM organizations'),
            query(
                `SELECT s.plan_id, p.name AS plan_name, COUNT(*)::int AS count
                 FROM subscriptions s
                 JOIN plans p ON p.id = s.plan_id
                 WHERE s.status = 'active'
                 GROUP BY s.plan_id, p.name
                 ORDER BY count DESC`
            ).catch(() => ({ rows: [] as any[] })),
            query(`SELECT COUNT(*)::int AS count FROM bookings WHERE status NOT IN ('cancelled')`).catch(() => ({
                rows: [{ count: 0 }]
            })),
            query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE claimed_at IS NULL AND status = 'paid')::int AS unclaimed,
                        COUNT(*) FILTER (WHERE claimed_at IS NOT NULL)::int AS claimed
                 FROM portal_invites`
            ).catch(() => ({ rows: [{ total: 0, unclaimed: 0, claimed: 0 }] }))
        ]);

        const noPlanRes = await query(
            `SELECT COUNT(DISTINCT o.id)::int AS count
             FROM organizations o
             LEFT JOIN subscriptions s ON s.org_id = o.id AND s.status = 'active'
             WHERE s.id IS NULL`
        ).catch(() => ({ rows: [{ count: 0 }] }));

        res.json({
            stage: resolveAdminCredentials().stage,
            totals: {
                users: usersRes.rows[0]?.count || 0,
                organizations: orgsRes.rows[0]?.count || 0,
                activeSubscriptions: subsRes.rows.reduce((n: number, r: any) => n + Number(r.count || 0), 0),
                organizationsWithoutPlan: noPlanRes.rows[0]?.count || 0,
                bookings: bookingsRes.rows[0]?.count || 0,
                portalInvites: invitesRes.rows[0]?.total || 0,
                invitesUnclaimed: invitesRes.rows[0]?.unclaimed || 0,
                invitesClaimed: invitesRes.rows[0]?.claimed || 0
            },
            subscriptionsByPlan: subsRes.rows,
            products: PRODUCTS,
            plans: PLANS.map((p: any) => ({
                id: p.id,
                name: p.name,
                priceLabel: formatPrice(p),
                features: getFeaturesForPlan(p.id)
            })),
            featureLabels: FEATURE_LABELS
        });
    } catch (err: any) {
        console.error('Admin overview error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/users', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables().catch(() => {});
        const { rows } = await query(
            `SELECT DISTINCT ON (u.id)
                    u.id AS user_id, u.email, u.name AS user_name, u.created_at AS user_created_at,
                    u.must_change_password, COALESCE(u.platform_role, 'customer') AS platform_role,
                    o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.trade_type, o.booking_industry_id, o.setup_complete,
                    COALESCE(NULLIF(TRIM(o.phone), ''), NULLIF(TRIM(pi.phone), '')) AS phone,
                    s.id AS subscription_id, s.plan_id, s.status AS subscription_status,
                    s.current_period_start, s.current_period_end, s.created_at AS subscription_created_at,
                    s.stripe_subscription_id, s.stripe_customer_id, s.cancel_at_period_end,
                    p.name AS plan_name, p.price_cents, p.currency,
                    pi.id AS invite_id, pi.status AS invite_status, pi.claimed_at, pi.credentials_emailed_at,
                    pi.created_at AS invite_created_at,
                    sl.id AS lead_id, sl.converted_at, sl.phone,
                    CASE WHEN (sl.is_customer = TRUE OR sl.status = 'converted') THEN TRUE ELSE FALSE END AS converted_by_telecaller,
                    u_agent.name AS telecaller_name,
                    (SELECT COUNT(*)::int FROM invoices inv
                       JOIN bookings b ON b.id = inv.booking_id
                       WHERE b.org_id = o.id) AS invoice_count,
                    (SELECT COALESCE(SUM(inv.amount_cents), 0)::int FROM invoices inv
                       JOIN bookings b ON b.id = inv.booking_id
                       WHERE b.org_id = o.id) AS invoice_total_cents
             FROM users u
             LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
             LEFT JOIN organizations o ON o.id = m.org_id
             LEFT JOIN subscriptions s ON s.status = 'active' AND (
                 (o.id IS NOT NULL AND s.org_id = o.id)
                 OR LOWER(s.customer_email) = LOWER(u.email)
             )
             LEFT JOIN plans p ON p.id = s.plan_id
             LEFT JOIN LATERAL (
                 SELECT id, status, claimed_at, credentials_emailed_at, created_at, phone
                 FROM portal_invites
                 WHERE LOWER(email) = LOWER(u.email)
                 ORDER BY created_at DESC
                 LIMIT 1
             ) pi ON TRUE
             LEFT JOIN LATERAL (
                 SELECT * FROM sales_leads
                  WHERE (is_customer = TRUE OR status = 'converted')
                    AND LOWER(email) = LOWER(u.email)
                 ORDER BY converted_at DESC NULLS LAST, created_at DESC
                 LIMIT 1
             ) sl ON TRUE
             LEFT JOIN users u_agent ON u_agent.id = sl.assigned_to
             ORDER BY u.id, s.created_at DESC NULLS LAST`
        );

        
        rows.sort(
            (a: any, b: any) =>
                new Date(b.user_created_at).getTime() - new Date(a.user_created_at).getTime()
        );

        
        const inviteOnly = await query(
            `SELECT pi.id AS invite_id, pi.email, pi.full_name, pi.phone, pi.plan_id, pi.status,
                    pi.claimed_at, pi.credentials_emailed_at, pi.created_at AS invite_created_at,
                    pi.stripe_subscription_id, pi.stripe_customer_id, pi.stripe_session_id,
                    pi.features AS invite_features, pi.booking_industry_id,
                    p.name AS plan_name, p.price_cents, p.currency,
                    s.id AS subscription_id, s.status AS subscription_status,
                    s.current_period_start, s.current_period_end, s.created_at AS subscription_created_at,
                    s.cancel_at_period_end
             FROM portal_invites pi
             LEFT JOIN plans p ON p.id = pi.plan_id
             LEFT JOIN subscriptions s ON s.status = 'active'
               AND (LOWER(s.customer_email) = LOWER(pi.email)
                    OR (pi.stripe_subscription_id IS NOT NULL AND s.stripe_subscription_id = pi.stripe_subscription_id))
             WHERE pi.claimed_at IS NULL AND pi.status = 'paid'
               AND NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(pi.email))
             ORDER BY pi.created_at DESC`
        ).catch(() => ({ rows: [] as any[] }));

        // Also include leads converted by telecallers that are not yet registered users or pending invites
        const convertedLeadsOnly = await query(
            `SELECT l.id AS lead_id, l.name AS lead_name, l.email AS lead_email, l.phone AS lead_phone,
                    l.industry, l.address, l.website, l.status AS lead_status, l.is_customer,
                    l.converted_at, l.created_at AS lead_created_at, l.assigned_to,
                    u_agent.name AS assigned_agent_name, u_agent.email AS assigned_agent_email
             FROM sales_leads l
             LEFT JOIN users u_agent ON u_agent.id = l.assigned_to
             WHERE (l.is_customer = TRUE OR l.status = 'converted')
               AND NOT EXISTS (SELECT 1 FROM users u WHERE (l.email IS NOT NULL AND l.email <> '' AND LOWER(u.email) = LOWER(l.email)))
               AND NOT EXISTS (SELECT 1 FROM portal_invites pi WHERE (l.email IS NOT NULL AND l.email <> '' AND LOWER(pi.email) = LOWER(l.email)))
             ORDER BY l.converted_at DESC NULLS LAST, l.created_at DESC`
        ).catch(() => ({ rows: [] as any[] }));

        const users = rows.map(mapRegisteredUser);
        const pendingInvites = inviteOnly.rows.map(mapInviteUser);
        const convertedLeads = convertedLeadsOnly.rows.map(mapConvertedLeadUser);

        res.json({
            stage: resolveAdminCredentials().stage,
            users: [...convertedLeads, ...pendingInvites, ...users],
            featureLabels: FEATURE_LABELS,
            plans: PLANS
        });
    } catch (err: any) {
        console.error('Admin users error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/users/user/:userId', requireAdmin, async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        const { rows } = await query(
            `SELECT u.id AS user_id, u.email, u.name AS user_name, u.created_at AS user_created_at,
                    u.must_change_password, COALESCE(u.platform_role, 'customer') AS platform_role,
                    o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.trade_type, o.booking_industry_id, o.setup_complete,
                    COALESCE(NULLIF(TRIM(o.phone), ''), NULLIF(TRIM(pi.phone), '')) AS phone,
                    s.id AS subscription_id, s.plan_id, s.status AS subscription_status,
                    s.current_period_start, s.current_period_end, s.created_at AS subscription_created_at,
                    s.stripe_subscription_id, s.stripe_customer_id, s.cancel_at_period_end,
                    p.name AS plan_name, p.price_cents, p.currency,
                    pi.id AS invite_id, pi.status AS invite_status, pi.claimed_at, pi.credentials_emailed_at,
                    pi.created_at AS invite_created_at,
                    (SELECT COUNT(*)::int FROM invoices inv
                       JOIN bookings b ON b.id = inv.booking_id
                       WHERE b.org_id = o.id) AS invoice_count,
                    (SELECT COALESCE(SUM(inv.amount_cents), 0)::int FROM invoices inv
                       JOIN bookings b ON b.id = inv.booking_id
                       WHERE b.org_id = o.id) AS invoice_total_cents
             FROM users u
             LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
             LEFT JOIN organizations o ON o.id = m.org_id
             LEFT JOIN subscriptions s ON s.status = 'active' AND (
                 (o.id IS NOT NULL AND s.org_id = o.id)
                 OR LOWER(s.customer_email) = LOWER(u.email)
             )
             LEFT JOIN plans p ON p.id = s.plan_id
             LEFT JOIN LATERAL (
                 SELECT id, status, claimed_at, credentials_emailed_at, created_at, phone
                 FROM portal_invites
                 WHERE LOWER(email) = LOWER(u.email)
                 ORDER BY created_at DESC
                 LIMIT 1
             ) pi ON TRUE
             WHERE u.id = $1
             ORDER BY s.created_at DESC NULLS LAST
             LIMIT 1`,
            [userId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
        res.json({ user: mapRegisteredUser(rows[0]), plans: PLANS });
    } catch (err: any) {
        console.error('Admin user detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/users/invite/:inviteId', requireAdmin, async (req: Request, res: Response) => {
    try {
        const inviteId = req.params.inviteId;
        const { rows } = await query(
            `SELECT pi.id AS invite_id, pi.email, pi.full_name, pi.phone, pi.plan_id, pi.status,
                    pi.claimed_at, pi.credentials_emailed_at, pi.created_at AS invite_created_at,
                    pi.stripe_subscription_id, pi.stripe_customer_id, pi.stripe_session_id,
                    pi.booking_industry_id,
                    p.name AS plan_name, p.price_cents, p.currency,
                    s.id AS subscription_id, s.status AS subscription_status,
                    s.current_period_start, s.current_period_end, s.created_at AS subscription_created_at,
                    s.cancel_at_period_end
             FROM portal_invites pi
             LEFT JOIN plans p ON p.id = pi.plan_id
             LEFT JOIN subscriptions s ON s.status = 'active'
               AND (LOWER(s.customer_email) = LOWER(pi.email)
                    OR (pi.stripe_subscription_id IS NOT NULL AND s.stripe_subscription_id = pi.stripe_subscription_id))
             WHERE pi.id = $1
             LIMIT 1`,
            [inviteId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
        res.json({ user: mapInviteUser(rows[0]), plans: PLANS });
    } catch (err: any) {
        console.error('Admin invite detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

function zappSitesOrigin() {
    const fromEnv = String(process.env.ZAPP_SITES_ORIGIN || '').trim().replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    const stage = (process.env.STAGE || 'dev').toLowerCase();
    return stage === 'prod' ? 'https://www.zappsites.com' : 'https://staging.zappsites.com';
}

function growthAuditTablesMissing(err: any) {
    const msg = String(err?.message || err || '');
    return /relation ["']?(submissions|audits)["']? does not exist/i.test(msg);
}

const ADMIN_LEAD_TYPES = [
    'growth_audit_lead',
    'contact',
    'audit_intake',
    'visibility_check',
    'checkout_lead'
] as const;

function normalizeLeadStatus(raw: unknown): string | null {
    const s = String(raw || '')
        .trim()
        .toLowerCase();
    if (!s) return null;
    if (s === 'otp_pending' || s === 'unverified' || s === 'pending') return s === 'pending' ? 'otp_pending' : s;
    if (s === 'completed' || s === 'submitted' || s === 'converted') return s;
    return s;
}

function mapAdminLead(row: any, origin: string) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const auditData = row.audit_data && typeof row.audit_data === 'object' ? row.audit_data : {};
    const business =
        auditData.business && typeof auditData.business === 'object' ? auditData.business : {};
    const customer =
        payload.customer && typeof payload.customer === 'object' ? payload.customer : {};

    const email =
        String(payload.email || row.submission_email || business.email || customer.email || '')
            .trim()
            .toLowerCase() || null;
    const phone =
        String(payload.phone || business.phone || customer.phone || '').trim() || null;
    const sharePath = String(payload.sharePath || '').trim() || null;
    const scoreRaw = payload.scoreTotal ?? auditData.scoreTotal ?? auditData.score?.total ?? null;
    const scoreTotal =
        scoreRaw == null || scoreRaw === ''
            ? null
            : Number.isFinite(Number(scoreRaw))
              ? Number(scoreRaw)
              : null;

    const name =
        String(
            payload.name ||
                payload.contactName ||
                payload.fullName ||
                customer.name ||
                ''
        ).trim() || null;

    const service =
        String(payload.service || payload.primaryService || payload.businessType || '').trim() ||
        null;
    const serviceLabel =
        String(payload.serviceLabel || payload.service || payload.primaryService || '').trim() ||
        null;

    const type = String(row.type || '').trim() || null;
    const status = normalizeLeadStatus(payload.status);
    const otpVerified =
        payload.otpVerified === true ||
        payload.otpVerified === 'true' ||
        status === 'completed' ||
        status === 'converted'
            ? true
            : payload.otpVerified === false || payload.otpVerified === 'false'
              ? false
              : null;

    return {
        id: row.id,
        createdAt: row.created_at,
        type,
        sourceCategory: 'growth_audit' as const,
        status,
        name,
        businessName:
            String(payload.businessName || business.name || business.businessName || '').trim() ||
            null,
        service,
        serviceLabel,
        address: String(payload.address || business.address || '').trim() || null,
        city: String(payload.city || business.city || '').trim() || null,
        website: String(payload.website || business.website || '').trim() || null,
        email,
        phone,
        scoreTotal,
        sharePath,
        reportUrl: sharePath ? `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}` : null,
        source: String(payload.source || type || '').trim() || null,
        auditId: String(payload.auditId || row.audit_id || '').trim() || null,
        pageUrl: String(payload.pageUrl || '').trim() || null,
        planId: String(payload.planId || '').trim() || null,
        otpVerified
    };
}

function mapSalesLeadToAdminLead(row: any) {
    const isExcel = row.source === 'excel_import' || String(row.source || '').toLowerCase().includes('excel');
    return {
        id: row.id,
        createdAt: row.created_at,
        type: isExcel ? 'excel_import' : 'added_lead',
        sourceCategory: 'added' as const,
        status: row.status || 'new',
        name: row.contact_name || row.name || null,
        businessName: row.company_name || row.name || null,
        service: row.industry || null,
        serviceLabel: row.industry || null,
        industry: row.industry || null,
        address: String(row.address || '').trim() || null,
        city: String(row.city || '').trim() || null,
        website: String(row.website || '').trim() || null,
        email: row.email ? String(row.email).trim().toLowerCase() : null,
        phone: String(row.phone || '').trim() || null,
        scoreTotal: null,
        sharePath: null,
        reportUrl: null,
        source: isExcel ? 'Excel Import' : (row.source || 'Added Lead'),
        auditId: null,
        pageUrl: null,
        planId: null,
        otpVerified: true,
        opportunityLevel: row.opportunity_level || null,
        leadOpportunity: row.lead_opportunity || null,
        gbpObservation: row.gbp_observation || null,
        aiVisibilityObservation: row.ai_visibility_observation || null,
        isCustomer: Boolean(row.is_customer),
        convertedAt: row.converted_at || null,
        updatedAt: row.updated_at || row.created_at,
        notes: row.notes || null,
        assignedTo: row.assigned_to || null,
        assignedAgentName: row.assignedAgentName || row.assigned_agent_name || null,
        assignedAgentEmail: row.assignedAgentEmail || row.assigned_agent_email || null
    };
}

/** Read-only list of marketing and CRM leads. */
router.get('/growth-audit-leads', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables().catch(() => {});
        const q = String(req.query.q || '').trim();
        const hasContact = String(req.query.hasContact || 'any').trim().toLowerCase();
        const contactFilter =
            hasContact === 'email' || hasContact === 'phone' || hasContact === 'both'
                ? hasContact
                : 'any';

        const params: any[] = [ADMIN_LEAD_TYPES];
        const where: string[] = [`s.type = ANY($1::text[])`];

        where.push(`(
            NULLIF(TRIM(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', s.payload->'customer'->>'email', '')), '') IS NOT NULL
            OR NULLIF(TRIM(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', s.payload->'customer'->>'phone', '')), '') IS NOT NULL
        )`);

        if (contactFilter === 'email') {
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', s.payload->'customer'->>'email', '')), '') IS NOT NULL`
            );
        } else if (contactFilter === 'phone') {
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', s.payload->'customer'->>'phone', '')), '') IS NOT NULL`
            );
        } else if (contactFilter === 'both') {
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', s.payload->'customer'->>'email', '')), '') IS NOT NULL`
            );
            where.push(
                `NULLIF(TRIM(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', s.payload->'customer'->>'phone', '')), '') IS NOT NULL`
            );
        }

        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const p = `$${params.length}`;
            where.push(`(
                LOWER(COALESCE(s.payload->>'businessName', '')) LIKE ${p}
                OR LOWER(COALESCE(s.payload->>'name', s.payload->>'contactName', s.payload->>'fullName', s.payload->'customer'->>'name', '')) LIKE ${p}
                OR LOWER(COALESCE(s.payload->>'email', s.email, a.data->'business'->>'email', '')) LIKE ${p}
                OR LOWER(COALESCE(s.payload->>'phone', a.data->'business'->>'phone', '')) LIKE ${p}
            )`);
        }

        const origin = zappSitesOrigin();

        // 1. Submissions query
        const submissionsPromise = query(
            `SELECT s.id, s.type, s.created_at, s.email AS submission_email, s.payload,
                    a.id AS audit_id, a.data AS audit_data
             FROM submissions s
             LEFT JOIN audits a ON a.id::text = s.payload->>'auditId'
             WHERE ${where.join(' AND ')}
             ORDER BY s.created_at DESC
             LIMIT 500`,
            params
        )
            .then((res) => res.rows.map((row) => mapAdminLead(row, origin)))
            .catch((err) => {
                console.warn('Submissions query error in growth-audit-leads:', err?.message || err);
                return [];
            });

        // 2. Added CRM sales leads query
        const salesParams: any[] = [];
        const salesWhere: string[] = ['1=1'];

        if (contactFilter === 'email') {
            salesWhere.push(`NULLIF(TRIM(l.email), '') IS NOT NULL`);
        } else if (contactFilter === 'phone') {
            salesWhere.push(`NULLIF(TRIM(l.phone), '') IS NOT NULL`);
        } else if (contactFilter === 'both') {
            salesWhere.push(`NULLIF(TRIM(l.email), '') IS NOT NULL AND NULLIF(TRIM(l.phone), '') IS NOT NULL`);
        }

        if (q) {
            salesParams.push(`%${q.toLowerCase()}%`);
            const sp = `$${salesParams.length}`;
            salesWhere.push(`(
                LOWER(COALESCE(l.name, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.email, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.phone, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.address, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.website, '')) LIKE ${sp}
                OR LOWER(COALESCE(l.industry, '')) LIKE ${sp}
            )`);
        }

        const salesLeadsPromise = query(
            `SELECT l.*, u.name AS "assignedAgentName", u.email AS "assignedAgentEmail"
             FROM sales_leads l
             LEFT JOIN users u ON u.id = l.assigned_to
             WHERE ${salesWhere.join(' AND ')}
             ORDER BY l.created_at DESC
             LIMIT 500`,
            salesParams
        )
            .then((res) => res.rows.map(mapSalesLeadToAdminLead))
            .catch((err) => {
                console.warn('Sales leads query error in growth-audit-leads:', err?.message || err);
                return [];
            });

        const [submissionLeads, addedLeads] = await Promise.all([
            submissionsPromise,
            salesLeadsPromise
        ]);

        const allLeads = [...addedLeads, ...submissionLeads].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Fetch latest sales agent activities / call notes and sales_leads status for each lead
        const leadIds = allLeads.map((l) => String(l.id)).filter(Boolean);
        const emails = allLeads
            .map((l) => String(l.email || '').trim().toLowerCase())
            .filter(Boolean);

        if (leadIds.length > 0 || emails.length > 0) {
            try {
                const [actResult, salesLeadStatusResult, taskResult] = await Promise.all([
                    query(
                        `SELECT DISTINCT ON (COALESCE(LOWER(sl.email), LOWER(sub.email), a.lead_id))
                            a.lead_id, a.activity_type, a.disposition, a.note, a.author_name, a.created_at,
                            COALESCE(LOWER(sl.email), LOWER(sub.email)) AS lead_email
                         FROM lead_activities a
                         LEFT JOIN sales_leads sl ON sl.id::text = a.lead_id
                         LEFT JOIN submissions sub ON sub.id::text = a.lead_id
                         WHERE a.lead_id = ANY($1::text[]) 
                            OR (COALESCE(LOWER(sl.email), LOWER(sub.email)) = ANY($2::text[]) AND COALESCE(sl.email, sub.email, '') <> '')
                         ORDER BY COALESCE(LOWER(sl.email), LOWER(sub.email), a.lead_id), a.created_at DESC`,
                        [leadIds, emails]
                    ).catch(() => ({ rows: [] })),
                    query(
                        `SELECT sl.id, sl.email, sl.status, sl.notes,
                                u.name AS assigned_agent_name
                         FROM sales_leads sl
                         LEFT JOIN users u ON u.id = sl.assigned_to
                         WHERE sl.id::text = ANY($1::text[]) OR LOWER(sl.email) = ANY($2::text[])`,
                        [leadIds, emails]
                    ).catch(() => ({ rows: [] })),
                    query(
                        `SELECT DISTINCT ON (COALESCE(LOWER(sl.email), LOWER(sub.email), t.lead_id))
                            t.lead_id, t.status AS task_status, t.notes AS task_notes, t.title AS task_title,
                            u.name AS task_agent_name,
                            COALESCE(LOWER(sl.email), LOWER(sub.email)) AS lead_email
                         FROM lead_tasks t
                         LEFT JOIN users u ON u.id = t.assigned_to_user_id
                         LEFT JOIN sales_leads sl ON sl.id::text = t.lead_id
                         LEFT JOIN submissions sub ON sub.id::text = t.lead_id
                         WHERE t.lead_id = ANY($1::text[])
                            OR (COALESCE(LOWER(sl.email), LOWER(sub.email)) = ANY($2::text[]) AND COALESCE(sl.email, sub.email, '') <> '')
                         ORDER BY COALESCE(LOWER(sl.email), LOWER(sub.email), t.lead_id), t.updated_at DESC`,
                        [leadIds, emails]
                    ).catch(() => ({ rows: [] }))
                ]);

                const actMap = new Map<string, any>();
                for (const act of actResult.rows) {
                    const entry = {
                        type: act.activity_type,
                        disposition: act.disposition,
                        note: act.note,
                        authorName: act.author_name,
                        createdAt: act.created_at
                    };
                    if (act.lead_id) actMap.set(String(act.lead_id), entry);
                    if (act.lead_email) actMap.set(String(act.lead_email).toLowerCase(), entry);
                }

                const statusMap = new Map<string, { status: string; notes: string | null; agentName: string | null }>();
                for (const sl of salesLeadStatusResult.rows) {
                    const entry = { status: sl.status, notes: sl.notes || null, agentName: sl.assigned_agent_name || null };
                    if (sl.id) statusMap.set(String(sl.id), entry);
                    if (sl.email) statusMap.set(String(sl.email).toLowerCase(), entry);
                }

                const taskMap = new Map<string, { status: string; notes: string | null; title: string | null; agentName: string | null }>();
                for (const t of taskResult.rows) {
                    const entry = {
                        status: t.task_status,
                        notes: t.task_notes || null,
                        title: t.task_title || null,
                        agentName: t.task_agent_name || null
                    };
                    if (t.lead_id) taskMap.set(String(t.lead_id), entry);
                    if (t.lead_email) taskMap.set(String(t.lead_email).toLowerCase(), entry);
                }

                for (const lead of allLeads) {
                    const leadIdStr = String(lead.id);
                    const emailStr = String(lead.email || '').toLowerCase();

                    // 1. Attach latest activity log
                    const latest = actMap.get(leadIdStr) || (emailStr ? actMap.get(emailStr) : null);
                    if (latest) {
                        (lead as any).latestActivity = latest;
                        if (latest.disposition && (!lead.status || lead.status === 'new' || lead.status === 'otp_pending')) {
                            lead.status = latest.disposition;
                        }
                    }

                    // 2. Direct sales_leads data always wins — authoritative agent update
                    const slData = statusMap.get(leadIdStr) || (emailStr ? statusMap.get(emailStr) : null);
                    if (slData) {
                        if (slData.status && slData.status !== 'new') {
                            lead.status = slData.status;
                        }
                        if (slData.notes) {
                            (lead as any).salesNotes = slData.notes;
                        }
                        if (slData.agentName) {
                            (lead as any).assignedAgentName = slData.agentName;
                        }
                    }

                    // 3. Lead tasks data — fallback/complement for notes & agent name
                    const taskData = taskMap.get(leadIdStr) || (emailStr ? taskMap.get(emailStr) : null);
                    if (taskData) {
                        if (!(lead as any).salesNotes && taskData.notes) {
                            (lead as any).salesNotes = taskData.notes;
                        }
                        if (!(lead as any).assignedAgentName && taskData.agentName) {
                            (lead as any).assignedAgentName = taskData.agentName;
                        }
                    }
                }
            } catch (actErr) {
                console.warn('Could not attach lead activities to admin leads:', actErr);
            }
        }

        res.json({
            stage: resolveAdminCredentials().stage,
            leads: allLeads
        });
    } catch (err: any) {
        console.error('Admin growth-audit-leads error:', err);
        if (growthAuditTablesMissing(err)) {
            return res.status(503).json({
                error: "Growth audit tables are not available on this environment's database."
            });
        }
        res.status(500).json({ error: err.message || 'Failed to load leads' });
    }
});

router.post('/users', requireAdmin, async (req: Request, res: Response) => {
    try {
        const email = String(req.body?.email || '')
            .trim()
            .toLowerCase();
        const name = String(req.body?.name || '').trim();
        const password = String(req.body?.password || '');
        const role = String(req.body?.role || '')
            .trim()
            .toLowerCase();
        const businessName = String(req.body?.businessName || name || 'My business').trim();
        const planId = req.body?.planId ? String(req.body.planId).trim() : '';
        const bookingIndustryId = normalizeBookingIndustryId(
            req.body?.bookingIndustryId ?? req.body?.booking_industry_id
        );

        if (!email || !name || !password || !role) {
            return res.status(400).json({ error: 'Name, email, password, and role are required.' });
        }
        if (role !== 'customer' && role !== 'sales_agent') {
            return res.status(400).json({ error: 'Role must be customer or sales_agent.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        if (role === 'customer' && planId && !isValidPlanId(planId)) {
            return res.status(400).json({ error: 'Invalid plan.' });
        }
        if (role === 'customer' && planId && isBookingPlanId(planId) && !bookingIndustryId) {
            return res.status(400).json({
                error: 'Select a service (industry) for booking plans (e.g. dentists, salons, restaurants).'
            });
        }
        if (
            role === 'customer' &&
            (req.body?.bookingIndustryId || req.body?.booking_industry_id) &&
            !bookingIndustryId
        ) {
            return res.status(400).json({ error: 'Invalid booking industry / services selection.' });
        }

        const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (existing.rows.length) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const passwordHash = await hashPassword(password);
        const userRes = await query(
            `INSERT INTO users (email, password_hash, name, must_change_password, platform_role)
             VALUES ($1, $2, $3, TRUE, $4)
             RETURNING id, email, name, must_change_password, platform_role, created_at`,
            [email, passwordHash, name, role]
        );
        const user = userRes.rows[0];

        if (role === 'sales_agent') {
            return res.status(201).json({
                success: true,
                user: {
                    kind: 'user',
                    userId: user.id,
                    email: user.email,
                    name: user.name,
                    platformRole: user.platform_role,
                    organization: null
                }
            });
        }

        const orgSlug = await uniqueOrgSlug(businessName, query);
        const orgRes = await query(
            `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, setup_complete)
             VALUES ($1, $2, $3, '', '', '', $4, FALSE)
             RETURNING id, slug, name`,
            [orgSlug, businessName, name, email]
        );
        const org = orgRes.rows[0];

        await query('INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)', [
            user.id,
            org.id,
            'owner'
        ]);

        if (bookingIndustryId) {
            await setOrgBookingIndustry(org.id, bookingIndustryId, { syncTradeType: true });
        }

        if (planId) {
            await upsertOrgSubscription(org.id, planId);
        }

        res.status(201).json({
            success: true,
            user: {
                kind: 'user',
                userId: user.id,
                email: user.email,
                name: user.name,
                platformRole: user.platform_role,
                organization: {
                    id: org.id,
                    name: org.name,
                    slug: org.slug,
                    bookingIndustryId: bookingIndustryId || null
                }
            }
        });
    } catch (err: any) {
        console.error('Admin create user error:', err);
        res.status(500).json({ error: err.message || 'Could not create user' });
    }
});

router.delete('/users/user/:userId', requireAdmin, async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        const { rows } = await query(
            `SELECT u.id, u.email,
                    ARRAY_REMOVE(ARRAY_AGG(DISTINCT m.org_id), NULL) AS org_ids
             FROM users u
             LEFT JOIN memberships m ON m.user_id = u.id
             WHERE u.id = $1
             GROUP BY u.id, u.email`,
            [userId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Customer not found' });

        const user = rows[0];
        const orgIds: string[] = Array.isArray(user.org_ids) ? user.org_ids.filter(Boolean) : [];

        await query(
            `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
             WHERE status = 'active'
               AND (
                 LOWER(COALESCE(customer_email, '')) = LOWER($1)
                 OR ($2::uuid[] IS NOT NULL AND org_id = ANY($2))
               )`,
            [user.email, orgIds.length ? orgIds : null]
        ).catch(() => {});

        if (orgIds.length) {
            await query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [orgIds]);
        }

        await query(`DELETE FROM portal_invites WHERE LOWER(email) = LOWER($1)`, [user.email]).catch(
            () => {}
        );
        await query(`DELETE FROM users WHERE id = $1`, [userId]);

        res.json({ success: true, deletedUserId: userId });
    } catch (err: any) {
        console.error('Admin delete user error:', err);
        res.status(500).json({ error: err.message || 'Could not delete user' });
    }
});

router.delete('/users/invite/:inviteId', requireAdmin, async (req: Request, res: Response) => {
    try {
        const inviteId = req.params.inviteId;
        const { rows } = await query(
            `SELECT id, email FROM portal_invites WHERE id = $1`,
            [inviteId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Invite not found' });

        const invite = rows[0];
        await query(
            `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
             WHERE status = 'active' AND LOWER(COALESCE(customer_email, '')) = LOWER($1)`,
            [invite.email]
        ).catch(() => {});
        await query(`DELETE FROM portal_invites WHERE id = $1`, [inviteId]);

        res.json({ success: true, deletedInviteId: inviteId });
    } catch (err: any) {
        console.error('Admin delete invite error:', err);
        res.status(500).json({ error: err.message || 'Could not delete invite' });
    }
});

router.delete('/users/converted-lead/:leadId', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = req.params.leadId;
        await query(`DELETE FROM lead_activities WHERE lead_id = $1`, [leadId]).catch(() => {});
        await query(`DELETE FROM lead_tasks WHERE lead_id = $1`, [leadId]).catch(() => {});
        await query(`DELETE FROM sales_leads WHERE id = $1`, [leadId]);
        res.json({ success: true, deletedLeadId: leadId });
    } catch (err: any) {
        console.error('Admin delete converted lead error:', err);
        res.status(500).json({ error: err.message || 'Could not delete converted lead' });
    }
});

router.patch('/organizations/:orgId/subscription', requireAdmin, async (req: Request, res: Response) => {
    try {
        const orgId = req.params.orgId;
        const planIdRaw = req.body?.planId;
        const planId = planIdRaw === null || planIdRaw === undefined ? '' : String(planIdRaw).trim();
        const hasAutopay = typeof req.body?.autopayEnabled === 'boolean' || typeof req.body?.cancelAtPeriodEnd === 'boolean';
        const autopayEnabled =
            typeof req.body?.autopayEnabled === 'boolean'
                ? req.body.autopayEnabled
                : typeof req.body?.cancelAtPeriodEnd === 'boolean'
                  ? !req.body.cancelAtPeriodEnd
                  : undefined;

        const { rows: orgRows } = await query('SELECT id, name, slug FROM organizations WHERE id = $1', [orgId]);
        if (!orgRows.length) return res.status(404).json({ error: 'Organization not found' });

        
        if (!planId && hasAutopay && autopayEnabled !== undefined) {
            const result = await setOrgAutopay(orgId, autopayEnabled, getStripeClient());
            return res.json({
                success: true,
                organization: orgRows[0],
                subscription: {
                    status: result.subscription?.status || 'active',
                    cancelAtPeriodEnd: result.cancelAtPeriodEnd,
                    autopayEnabled: result.autopayEnabled,
                    periodEnd: result.subscription?.current_period_end
                }
            });
        }

        if (!planId) {
            await query(
                `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
                 WHERE org_id = $1 AND status = 'active'`,
                [orgId]
            );
            return res.json({
                success: true,
                organization: orgRows[0],
                subscription: null,
                features: []
            });
        }

        if (!isValidPlanId(planId)) {
            return res.status(400).json({ error: `Invalid plan_id: ${planId}` });
        }

        const result = await upsertOrgSubscription(orgId, planId, {
            cancelAtPeriodEnd: autopayEnabled === undefined ? false : !autopayEnabled
        });

        if (autopayEnabled !== undefined && result.subscription?.stripe_subscription_id) {
            await setOrgAutopay(orgId, autopayEnabled, getStripeClient()).catch(() => {});
        }

        res.json({
            success: true,
            organization: orgRows[0],
            subscription: {
                planId: result.planId,
                planName: result.planName,
                status: 'active',
                cancelAtPeriodEnd: Boolean(result.subscription?.cancel_at_period_end),
                autopayEnabled: !result.subscription?.cancel_at_period_end,
                periodEnd: result.subscription?.current_period_end
            },
            features: result.features
        });
    } catch (err: any) {
        console.error('Admin assign plan error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/plans', requireAdmin, (_req: Request, res: Response) => {
    res.json({
        stage: resolveAdminCredentials().stage,
        plans: PLANS.map((p: any) => ({
            id: p.id,
            name: p.name,
            priceLabel: formatPrice(p),
            priceCents: p.priceCents,
            features: getFeaturesForPlan(p.id)
        })),
        featureKeys: FEATURE_KEYS,
        featureLabels: FEATURE_LABELS
    });
});

router.get('/services', requireAdmin, (_req: Request, res: Response) => {
    const services = FEATURE_KEYS.map((key) => ({
        key,
        label: FEATURE_LABELS[key],
        plans: PLANS.filter((p: any) => getFeaturesForPlan(p.id).includes(key)).map((p: any) => ({
            id: p.id,
            name: p.name,
            priceLabel: formatPrice(p)
        }))
    }));

    res.json({
        stage: resolveAdminCredentials().stage,
        services,
        plans: PLANS.map((p: any) => ({
            id: p.id,
            name: p.name,
            priceLabel: formatPrice(p),
            features: getFeaturesForPlan(p.id).map((k) => ({
                key: k,
                label: FEATURE_LABELS[k as keyof typeof FEATURE_LABELS]
            }))
        })),
        featureLabels: FEATURE_LABELS
    });
});





/** Get list of sales agents / telecallers available for assignment */
router.get('/crm/sales-agents', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { rows } = await query(`
            SELECT id, name, email, avatar_url, platform_role, created_at
            FROM users
            WHERE platform_role = 'sales_agent'
            ORDER BY name ASC, email ASC
        `);
        res.json({ agents: rows });
    } catch (err: any) {
        console.error('Fetch sales agents error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch sales agents' });
    }
});


async function fetchAdminLeadMetadataMap(leadIds: string[]) {
    if (!leadIds.length) return new Map<string, any>();
    const map = new Map<string, any>();
    const origin = zappSitesOrigin();

    
    try {
        const { rows: subRows } = await query(
            `SELECT s.id, s.created_at, s.email AS submission_email, s.payload,
                    a.id AS audit_id, a.data AS audit_data
             FROM submissions s
             LEFT JOIN audits a ON a.id::text = s.payload->>'auditId'
             WHERE s.id::text = ANY($1::text[])`,
            [leadIds]
        );

        for (const row of subRows) {
            const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
            const auditData = row.audit_data && typeof row.audit_data === 'object' ? row.audit_data : {};
            const business = auditData.business && typeof auditData.business === 'object' ? auditData.business : {};
            const sharePath = String(payload.sharePath || '').trim() || null;
            const scoreRaw = payload.scoreTotal ?? auditData.scoreTotal ?? auditData.score?.total ?? null;

            map.set(String(row.id), {
                id: String(row.id),
                businessName: String(payload.businessName || business.name || 'Lead').trim(),
                phone: String(payload.phone || business.phone || '').trim(),
                email: String(payload.email || row.submission_email || business.email || '').trim().toLowerCase(),
                website: String(payload.website || business.website || '').trim(),
                address: String(payload.address || business.address || '').trim(),
                city: String(payload.city || business.city || '').trim(),
                scoreTotal: scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null,
                reportUrl: sharePath ? `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}` : null,
                source: String(payload.source || 'growth_audit').trim()
            });
        }
    } catch {}

    
    const missing = leadIds.filter((id) => !map.has(id));
    if (missing.length) {
        try {
            const { rows: salesRows } = await query(
                `SELECT * FROM sales_leads WHERE id::text = ANY($1::text[])`,
                [missing]
            );
            for (const row of salesRows) {
                map.set(String(row.id), {
                    id: String(row.id),
                    businessName: row.name || 'Lead',
                    phone: row.phone || '',
                    email: row.email || '',
                    website: '',
                    address: '',
                    city: '',
                    scoreTotal: null,
                    reportUrl: null,
                    source: row.source || 'sales_lead'
                });
            }
        } catch {}
    }

    return map;
}


router.get('/crm/tasks', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.query.leadId || '').trim();
        const assignedTo = String(req.query.assignedTo || '').trim();
        const status = String(req.query.status || '').trim();
        const priority = String(req.query.priority || '').trim();
        const taskType = String(req.query.taskType || '').trim();
        const createdBy = String(req.query.createdBy || '').trim();

        const params: any[] = [];
        const where: string[] = ['1=1'];

        if (leadId) {
            params.push(leadId);
            where.push(`t.lead_id = $${params.length}`);
        }
        if (assignedTo) {
            params.push(assignedTo);
            where.push(`t.assigned_to_user_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`t.status = $${params.length}`);
        }
        if (priority) {
            params.push(priority);
            where.push(`t.priority = $${params.length}`);
        }
        if (taskType) {
            params.push(taskType);
            where.push(`t.task_type = $${params.length}`);
        }
        
        where.push(`(t.created_by_role = 'admin' OR t.created_by_role IS NULL)`);

        const { rows } = await query(`
            SELECT 
                t.id,
                t.lead_id AS "leadId",
                t.task_type AS "taskType",
                t.title,
                t.notes,
                t.priority,
                t.status,
                t.due_date AS "dueDate",
                t.completed_at AS "completedAt",
                t.created_at AS "createdAt",
                t.updated_at AS "updatedAt",
                t.assigned_to_user_id AS "assignedToUserId",
                COALESCE(t.created_by_role, 'admin') AS "createdByRole",
                COALESCE(t.created_by_name, 'Admin') AS "createdByName",
                u.name AS "assignedToName",
                u.email AS "assignedToEmail",
                u.avatar_url AS "assignedToAvatarUrl"
            FROM lead_tasks t
            LEFT JOIN users u ON u.id = t.assigned_to_user_id
            WHERE ${where.join(' AND ')}
            ORDER BY 
                CASE 
                    WHEN t.status = 'pending' THEN 1 
                    WHEN t.status = 'in_progress' THEN 2 
                    WHEN t.status = 'completed' THEN 3 
                    ELSE 4 
                END,
                t.due_date ASC NULLS LAST,
                t.created_at DESC
            LIMIT 500
        `, params);

        const leadIds = Array.from(new Set(rows.map((t: any) => t.leadId).filter(Boolean))) as string[];
        const leadMetaMap = await fetchAdminLeadMetadataMap(leadIds);

        const enrichedTasks = rows.map((t: any) => {
            const meta = leadMetaMap.get(t.leadId) || {};
            return {
                ...t,
                leadBusinessName: meta.businessName || 'Lead',
                leadPhone: meta.phone || '',
                leadEmail: meta.email || '',
                leadWebsite: meta.website || '',
                leadAddress: meta.address || '',
                leadCity: meta.city || '',
                leadScoreTotal: meta.scoreTotal ?? null,
                leadReportUrl: meta.reportUrl || null,
                leadSource: meta.source || ''
            };
        });

        res.json({ tasks: enrichedTasks });
    } catch (err: any) {
        console.error('Fetch CRM tasks error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch tasks' });
    }
});


router.post('/crm/tasks', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const {
            lead_id,
            task_type = 'follow_up_call',
            title,
            notes = '',
            priority = 'medium',
            assigned_to_user_id = null,
            due_date = null
        } = req.body || {};

        if (!lead_id) {
            return res.status(400).json({ error: 'lead_id is required.' });
        }
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Task title is required.' });
        }

        const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom', 'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'];
        const TASK_TYPE_MAP: Record<string, string> = {
            call: 'follow_up_call',
            follow_up: 'follow_up_call',
            audit_review: 'prepare_audit',
            proposal: 'send_proposal',
            meeting: 'custom',
            email: 'custom',
            other: 'custom'
        };
        const sanitizedTaskType = validTaskTypes.includes(task_type)
            ? (TASK_TYPE_MAP[task_type] || task_type)
            : 'custom';

        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const sanitizedPriority = validPriorities.includes(priority) ? priority : 'medium';

        const { rows } = await query(`
            INSERT INTO lead_tasks (
                lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
            ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'admin', 'Admin')
            RETURNING 
                id,
                lead_id AS "leadId",
                task_type AS "taskType",
                title,
                notes,
                priority,
                status,
                due_date AS "dueDate",
                completed_at AS "completedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                assigned_to_user_id AS "assignedToUserId",
                created_by_role AS "createdByRole",
                created_by_name AS "createdByName"
        `, [
            lead_id,
            sanitizedTaskType,
            String(title).trim(),
            String(notes || '').trim(),
            sanitizedPriority,
            assigned_to_user_id || null,
            due_date || null
        ]);

        const task = rows[0];

        if (assigned_to_user_id) {
            try {
                let agentName = 'Sales Agent';
                const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1`, [assigned_to_user_id]);
                if (uRows[0]?.name) agentName = uRows[0].name;

                await query(`
                    UPDATE sales_leads 
                    SET assigned_to = $1, updated_at = NOW() 
                    WHERE id::text = $2 OR email = (SELECT email FROM submissions WHERE id::text = $2 LIMIT 1)
                `, [assigned_to_user_id, lead_id]).catch(() => {});

                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                    VALUES ($1, 'Admin', 'task_event', $2)
                `, [lead_id, `Admin created task "${task.title}" assigned to ${agentName}${task.notes ? ` — Note: "${task.notes}"` : ''}`]).catch(() => {});
            } catch {}
        } else {
            try {
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                    VALUES ($1, 'Admin', 'task_event', $2)
                `, [lead_id, `Admin created task: "${task.title}"${task.notes ? ` — Note: "${task.notes}"` : ''}`]).catch(() => {});
            } catch {}
        }

        res.status(201).json({ task });
    } catch (err: any) {
        console.error('Create CRM task error:', err);
        res.status(500).json({ error: err.message || 'Failed to create task' });
    }
});


router.patch('/crm/tasks/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const taskId = req.params.id;
        const { status, priority, notes, assigned_to_user_id, due_date, title, task_type } = req.body || {};

        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [taskId];

        if (status !== undefined) {
            params.push(status);
            updates.push(`status = $${params.length}`);
            if (status === 'completed') {
                updates.push(`completed_at = NOW()`);
            } else {
                updates.push(`completed_at = NULL`);
            }
        }
        if (priority !== undefined) {
            params.push(priority);
            updates.push(`priority = $${params.length}`);
        }
        if (notes !== undefined) {
            params.push(String(notes || '').trim());
            updates.push(`notes = $${params.length}`);
        }
        if (title !== undefined && String(title).trim()) {
            params.push(String(title).trim());
            updates.push(`title = $${params.length}`);
        }
        if (task_type !== undefined) {
            const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom', 'call', 'follow_up', 'audit_review', 'proposal', 'meeting', 'email', 'other'];
            const TASK_TYPE_MAP: Record<string, string> = {
                call: 'follow_up_call',
                follow_up: 'follow_up_call',
                audit_review: 'prepare_audit',
                proposal: 'send_proposal',
                meeting: 'custom',
                email: 'custom',
                other: 'custom'
            };
            const sanitized = validTaskTypes.includes(task_type)
                ? (TASK_TYPE_MAP[task_type] || task_type)
                : 'custom';
            params.push(sanitized);
            updates.push(`task_type = $${params.length}`);
        }
        if (assigned_to_user_id !== undefined) {
            params.push(assigned_to_user_id || null);
            updates.push(`assigned_to_user_id = $${params.length}`);
        }
        if (due_date !== undefined) {
            params.push(due_date || null);
            updates.push(`due_date = $${params.length}`);
        }

        const { rows } = await query(`
            UPDATE lead_tasks
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING 
                id,
                lead_id AS "leadId",
                task_type AS "taskType",
                title,
                notes,
                priority,
                status,
                due_date AS "dueDate",
                completed_at AS "completedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                assigned_to_user_id AS "assignedToUserId",
                COALESCE(created_by_role, 'admin') AS "createdByRole",
                COALESCE(created_by_name, 'Admin') AS "createdByName"
        `, params);

        if (!rows.length) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = rows[0];

        // 1. If assigned_to_user_id was updated, synchronize sales_leads assignment and log activity
        if (assigned_to_user_id !== undefined) {
            try {
                let agentName = 'Unassigned';
                if (assigned_to_user_id) {
                    const { rows: uRows } = await query(`SELECT name FROM users WHERE id = $1`, [assigned_to_user_id]);
                    if (uRows[0]?.name) agentName = uRows[0].name;
                }
                await query(`
                    UPDATE sales_leads 
                    SET assigned_to = $1, updated_at = NOW() 
                    WHERE id::text = $2 OR email = (SELECT email FROM submissions WHERE id::text = $2 LIMIT 1)
                `, [assigned_to_user_id || null, task.leadId]).catch(() => {});

                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                    VALUES ($1, 'Admin', 'task_event', $2)
                `, [task.leadId, assigned_to_user_id ? `Admin assigned task "${task.title}" to ${agentName}` : `Admin unassigned task "${task.title}"`]).catch(() => {});
            } catch {}
        }

        // 2. Record task event activity for task edits without corrupting lead lifecycle status
        if (status !== undefined || (notes !== undefined && String(notes).trim())) {
            try {
                const author = (req as any).user?.name || 'Admin';
                const statusStr = status ? String(status).replace('_', ' ').toUpperCase() : (task.status ? String(task.status).replace('_', ' ').toUpperCase() : 'UPDATED');
                const cleanNote = notes && String(notes).trim() ? String(notes).trim() : `Task "${task.title}" status changed to ${statusStr}`;
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, $2, 'task_event', $3, $4, NOW())
                `, [task.leadId, author, status || task.status || 'in_progress', cleanNote]).catch(() => {});
            } catch {}
        }

        res.json({ task });
    } catch (err: any) {
        console.error('Update CRM task error:', err);
        res.status(500).json({ error: err.message || 'Failed to update task' });
    }
});


router.delete('/crm/tasks/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const taskId = req.params.id;

        const { rows: taskRows } = await query(
            `SELECT title, lead_id FROM lead_tasks WHERE id = $1`,
            [taskId]
        );

        if (taskRows.length > 0) {
            const task = taskRows[0];
            try {
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, 'Admin', 'task_event', 'cancelled', $2, NOW())
                `, [task.lead_id, `Task "${task.title}" was deleted by Admin`]);
            } catch (actErr) {
                console.warn('Failed to record task deletion activity:', actErr);
            }
        }

        await query(`DELETE FROM lead_tasks WHERE id = $1`, [taskId]);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete CRM task error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete task' });
    }
});


router.get('/crm/leads/:leadId/activities', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.leadId);
        const allLeadIds = await resolveAllLeadIds(leadId);

        const [salesRes, subRes] = await Promise.all([
            query(`SELECT id, name, email, phone FROM sales_leads WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] })),
            query(`SELECT id, payload->>'businessName' AS bname, payload->>'name' AS name, payload->>'email' AS email FROM submissions WHERE id::text = ANY($1::text[])`, [allLeadIds]).catch(() => ({ rows: [] }))
        ]);

        const leadName = (salesRes.rows[0]?.name || subRes.rows[0]?.bname || subRes.rows[0]?.name || '').trim().toLowerCase();
        const leadEmail = (salesRes.rows[0]?.email || subRes.rows[0]?.email || '').trim().toLowerCase();

        const { rows } = await query(`
            SELECT DISTINCT
                a.id,
                a.lead_id AS "leadId",
                a.activity_type AS "activityType",
                a.disposition,
                a.note,
                a.author_name AS "authorName",
                a.created_at AS "createdAt",
                u.name AS "userName",
                u.email AS "userEmail"
            FROM lead_activities a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE (
                a.lead_id = ANY($1::text[])
                OR (NULLIF($2, '') IS NOT NULL AND a.lead_id IN (SELECT id::text FROM sales_leads WHERE LOWER(TRIM(name)) = $2 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(email)) = $3)))
                OR (NULLIF($2, '') IS NOT NULL AND a.lead_id IN (SELECT id::text FROM submissions WHERE LOWER(TRIM(COALESCE(payload->>'businessName', payload->>'name', ''))) = $2 OR (NULLIF($3, '') IS NOT NULL AND LOWER(TRIM(COALESCE(email, payload->>'email', ''))) = $3)))
            )
              AND a.activity_type IN ('call_log', 'status_change', 'note', 'task_event')
            ORDER BY a.created_at DESC
            LIMIT 200
        `, [allLeadIds, leadName || null, leadEmail || null]);

        res.json({ activities: rows });
    } catch (err: any) {
        console.error('Fetch lead activities error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch activities' });
    }
});


router.post('/crm/leads/:leadId/activities', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = req.params.leadId;
        const {
            activity_type = 'call_log',
            disposition = 'connected',
            note = '',
            author_name = 'Admin',
            user_id = null
        } = req.body || {};

        if (!note && !disposition) {
            return res.status(400).json({ error: 'Note or disposition is required.' });
        }

        const { rows } = await query(`
            INSERT INTO lead_activities (
                lead_id, user_id, author_name, activity_type, disposition, note
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING 
                id,
                lead_id AS "leadId",
                activity_type AS "activityType",
                disposition,
                note,
                author_name AS "authorName",
                created_at AS "createdAt"
        `, [
            leadId,
            user_id || null,
            String(author_name || 'Admin').trim(),
            activity_type,
            disposition || null,
            String(note || '').trim()
        ]);

        res.status(201).json({ activity: rows[0] });
    } catch (err: any) {
        console.error('Create lead activity error:', err);
        res.status(500).json({ error: err.message || 'Failed to create activity' });
    }
});


router.post('/crm/activities/clear', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        await query(`TRUNCATE TABLE lead_activities CASCADE`);
        res.json({ success: true, message: 'All call logs and activity history cleared' });
    } catch (err: any) {
        console.error('Clear activities error:', err);
        res.status(500).json({ error: err.message || 'Failed to clear activities' });
    }
});

/** Admin: List all CRM leads (sales_leads) */
router.get('/crm/leads', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const industry = String(req.query.industry || '').trim();
        const status = String(req.query.status || '').trim();
        const opportunityLevel = String(req.query.opportunityLevel || '').trim();
        const q = String(req.query.q || '').trim();
        const isCustomer = req.query.isCustomer === 'true' ? true : req.query.isCustomer === 'false' ? false : undefined;

        const params: any[] = [];
        const where: string[] = [];

        if (isCustomer !== undefined) {
            params.push(isCustomer);
            where.push(`l.is_customer = $${params.length}`);
        } else {
            where.push(`l.is_customer = FALSE`);
        }

        if (industry && industry !== 'all') {
            params.push(industry.toLowerCase());
            where.push(`LOWER(l.industry) = $${params.length}`);
        }

        if (status && status !== 'all') {
            params.push(status);
            where.push(`l.status = $${params.length}`);
        }

        if (opportunityLevel && opportunityLevel !== 'all') {
            params.push(opportunityLevel.toLowerCase());
            where.push(`LOWER(l.opportunity_level) = $${params.length}`);
        }

        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const p = `$${params.length}`;
            where.push(`(
                LOWER(l.name) LIKE ${p}
                OR LOWER(l.phone) LIKE ${p}
                OR LOWER(l.email) LIKE ${p}
                OR LOWER(l.address) LIKE ${p}
                OR LOWER(l.website) LIKE ${p}
            )`);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const { rows } = await query(`
            SELECT 
                l.id,
                l.name,
                l.name AS "businessName",
                l.phone,
                l.email,
                l.notes,
                l.status,
                l.source,
                l.industry,
                l.address,
                l.website,
                l.gbp_observation AS "gbpObservation",
                l.ai_visibility_observation AS "aiVisibilityObservation",
                l.lead_opportunity AS "leadOpportunity",
                l.opportunity_level AS "opportunityLevel",
                l.is_customer AS "isCustomer",
                l.converted_at AS "convertedAt",
                l.assigned_to AS "assignedTo",
                l.next_follow_up_at AS "nextFollowUpAt",
                l.created_at AS "createdAt",
                l.updated_at AS "updatedAt",
                u.name AS "assignedAgentName",
                u.email AS "assignedAgentEmail"
            FROM sales_leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            ${whereSql}
            ORDER BY l.created_at DESC
            LIMIT 1000
        `, params);

        res.json({ leads: rows });
    } catch (err: any) {
        console.error('Admin get CRM leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch leads' });
    }
});

/** Admin: Create single lead manually */
router.post('/crm/leads', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const {
            name,
            businessName,
            phone,
            email,
            notes,
            conclusion,
            status = 'new',
            source = 'admin_manual',
            industry = '',
            address = '',
            website = '',
            gbpObservation = '',
            aiVisibilityObservation = '',
            leadOpportunity = '',
            opportunityLevel = 'medium',
            assignedTo,
            nextFollowUpAt
        } = req.body || {};

        const leadName = String(businessName || name || '').trim();
        if (!leadName) {
            return res.status(400).json({ error: 'Business name is required.' });
        }

        const lead = await createSalesLead({
            name: leadName,
            phone: phone ? String(phone).trim() : '',
            email: email ? String(email).trim().toLowerCase() : '',
            notes: (notes || conclusion) ? String(notes || conclusion).trim() : '',
            status,
            source,
            industry,
            address,
            website,
            gbpObservation,
            aiVisibilityObservation,
            leadOpportunity,
            opportunityLevel,
            assignedTo: assignedTo || null,
            nextFollowUpAt,
            createdByAdmin: true
        });

        res.status(201).json({ lead });
    } catch (err: any) {
        console.error('Admin create lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to create lead' });
    }
});

function normalizeSpreadsheetStatus(rawStatus: any): string {
    const s = String(rawStatus || '').toLowerCase().trim().replace(/[-_]/g, ' ');
    if (!s) return 'new';
    if (s.includes('convert') || s.includes('won') || s.includes('closed') || s.includes('customer') || s.includes('paid')) return 'converted';
    if (s.includes('not interested') || s.includes('lost') || s.includes('rejected') || s.includes('declined') || s.includes('dnc') || s.includes('cold') || s.includes('wrong number')) return 'not_interested';
    if (s.includes('callback') || s.includes('call back') || s.includes('follow') || s.includes('call later')) return 'callback';
    if (s.includes('interested') || s.includes('warm') || s.includes('hot') || s.includes('qualified') || s.includes('in progress') || s.includes('audit scheduled')) return 'interested';
    if (s.includes('contacted') || s.includes('called') || s.includes('spoke') || s.includes('reached') || s.includes('connected') || s.includes('attempted') || s.includes('voicemail') || s.includes('ringing') || s.includes('no answer') || s.includes('busy')) return 'contacted';
    return 'new';
}

/** Admin: Bulk Import Leads (Excel / CSV) */
router.post('/crm/leads/bulk-import', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { leads } = req.body || {};

        if (!Array.isArray(leads) || !leads.length) {
            return res.status(400).json({ error: 'No leads provided for import.' });
        }

        const normalizedLeads = leads.map((item: any) => {
            let rawConclusion =
                item.notes ??
                item.conclusion ??
                item['My Conclusion'] ??
                item['My Conclusions'] ??
                item['My Concluision'] ??
                item['My Concluisions'] ??
                item['myConclusion'] ??
                item['myConclusions'] ??
                item['Conclusion'] ??
                item['Conclusions'] ??
                item['Concluision'] ??
                item['Concluisions'] ??
                item['Takeaways'] ??
                item['Takeaway'] ??
                item['Remarks'] ??
                item['Summary'] ??
                item['Notes'] ??
                '';

            if (!rawConclusion && typeof item === 'object' && item !== null) {
                for (const [k, v] of Object.entries(item)) {
                    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanKey.includes('concl') || cleanKey.includes('takeaway') || cleanKey.includes('verdict')) {
                        if (v && String(v).trim()) {
                            rawConclusion = String(v).trim();
                            break;
                        }
                    }
                }
            }

            const rawStatusVal = item.status || item.callingStatus || item.stage || item.disposition || item['Status'] || item['Calling Status'] || item['Lead Status'] || item['Disposition'] || 'new';

            return {
                name: String(item.businessName || item.name || item['Business name'] || item['Business Name'] || item['Company Name'] || '').trim(),
                phone: String(item.phone || item.businessPhone || item['Business Phone'] || item['Phone'] || '').trim(),
                email: String(item.email || item['Email'] || '').trim().toLowerCase(),
                industry: String(item.industry || item.category || item.sheetName || item['Industry'] || item['Business'] || '').trim(),
                address: String(item.address || item.townPostcode || item['Town postcode'] || item['Town Postcode'] || item['Address'] || '').trim(),
                website: String(item.website || item.websiteUrl || item['Website URL'] || item['Website'] || '').trim(),
                gbpObservation: String(item.gbpObservation || item['My Observation GBP'] || item['GBP Observation'] || '').trim(),
                aiVisibilityObservation: String(item.aiVisibilityObservation || item['My Observation AI Visibility'] || item['AI Visibility'] || '').trim(),
                leadOpportunity: String(item.leadOpportunity || item['Lead Opportunity'] || item['Opportunity'] || '').trim(),
                opportunityLevel: String(item.opportunityLevel || '').toLowerCase() || 'medium',
                status: normalizeSpreadsheetStatus(rawStatusVal),
                notes: String(rawConclusion).trim(),
                assignedTo: item.assignedTo || null
            };
        });

        const result = await bulkImportSalesLeads(normalizedLeads, true);
        res.json(result);
    } catch (err: any) {
        console.error('Admin bulk import error:', err);
        res.status(500).json({ error: err.message || 'Failed to import leads' });
    }
});

/** Admin: Bulk Assign Leads to Telecaller / Agent */
router.post('/crm/leads/bulk-assign', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { leadIds, assignedToUserId, task } = req.body || {};

        if (!Array.isArray(leadIds) || !leadIds.length) {
            return res.status(400).json({ error: 'No lead IDs provided.' });
        }

        const agentId = assignedToUserId ? String(assignedToUserId).trim() : null;

        let agentName = 'Unassigned';
        if (agentId) {
            const { rows: userRows } = await query(`SELECT name FROM users WHERE id = $1`, [agentId]);
            if (userRows[0]) {
                agentName = userRows[0].name;
            }
        }

        const validTaskTypes = ['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom'];
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const hasTaskToCreate = Boolean(task && task.title && String(task.title).trim());
        const taskTitle = hasTaskToCreate ? String(task.title).trim() : '';
        const taskType = hasTaskToCreate && validTaskTypes.includes(task.taskType) ? task.taskType : 'follow_up_call';
        const taskPriority = hasTaskToCreate && validPriorities.includes(task.priority) ? task.priority : 'medium';
        const taskNotes = hasTaskToCreate && task.notes ? String(task.notes).trim() : '';
        const taskDueDate = hasTaskToCreate && task.dueDate ? task.dueDate : null;

        let updatedCount = 0;
        let createdTasksCount = 0;

        for (const rawId of leadIds) {
            const id = String(rawId).trim();
            if (!id) continue;

            let targetLeadId: string | null = null;

            // 1. Try to update existing sales_leads
            const { rows: updatedRows } = await query(`
                UPDATE sales_leads
                SET assigned_to = $1, updated_at = NOW()
                WHERE id::text = $2 OR email = (SELECT email FROM submissions WHERE id::text = $2 LIMIT 1)
                RETURNING id
            `, [agentId, id]);

            if (updatedRows.length > 0) {
                updatedCount += updatedRows.length;
                for (const row of updatedRows) {
                    targetLeadId = String(row.id);
                    try {
                        await query(`
                            INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                            VALUES ($1, 'Admin', 'task_event', $2)
                        `, [targetLeadId, agentId ? `Assigned to telecaller: ${agentName}` : `Unassigned telecaller`]);
                    } catch {}

                    if (hasTaskToCreate) {
                        try {
                            await query(`
                                INSERT INTO lead_tasks (
                                    lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
                                ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'admin', 'Admin')
                            `, [targetLeadId, taskType, taskTitle, taskNotes, taskPriority, agentId, taskDueDate]);

                            await query(`
                                INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                                VALUES ($1, 'Admin', 'task_event', $2)
                            `, [targetLeadId, `Admin created task: "${taskTitle}"`]);
                            createdTasksCount++;
                        } catch (tErr) {
                            console.warn('Could not create task during bulk assign:', tErr);
                        }
                    }
                }
            } else {
                // 2. If it's a submission lead not yet in sales_leads, fetch submission and create a sales_lead entry
                const { rows: subRows } = await query(`
                    SELECT id, type, email, payload FROM submissions WHERE id::text = $1 LIMIT 1
                `, [id]);

                if (subRows[0]) {
                    const sub = subRows[0];
                    const p = sub.payload || {};
                    const name = String(p.businessName || p.name || p.contactName || p.fullName || 'Lead').trim();
                    const phone = String(p.phone || '').trim();
                    const email = String(sub.email || p.email || '').trim().toLowerCase();

                    try {
                        const newLead = await createSalesLead({
                            name,
                            phone,
                            email,
                            source: sub.type || 'growth_audit',
                            assignedTo: agentId,
                            createdByAdmin: true
                        });
                        updatedCount++;
                        targetLeadId = String(newLead.id);

                        try {
                            await query(`
                                INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                                VALUES ($1, 'Admin', 'task_event', $2)
                            `, [targetLeadId, agentId ? `Assigned to telecaller: ${agentName}` : `Unassigned telecaller`]);
                        } catch {}

                        if (hasTaskToCreate) {
                            try {
                                await query(`
                                    INSERT INTO lead_tasks (
                                        lead_id, task_type, title, notes, priority, status, assigned_to_user_id, due_date, created_by_role, created_by_name
                                    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'admin', 'Admin')
                                `, [targetLeadId, taskType, taskTitle, taskNotes, taskPriority, agentId, taskDueDate]);

                                await query(`
                                    INSERT INTO lead_activities (lead_id, author_name, activity_type, note)
                                    VALUES ($1, 'Admin', 'task_event', $2)
                                `, [targetLeadId, `Admin created task: "${taskTitle}"`]);
                                createdTasksCount++;
                            } catch (tErr) {
                                console.warn('Could not create task during bulk assign:', tErr);
                            }
                        }
                    } catch (createErr) {
                        console.warn('Could not create sales lead from submission during bulk assign:', createErr);
                    }
                }
            }
        }

        res.json({
            success: true,
            updatedCount,
            createdTasksCount,
            agentName,
            message: `Successfully assigned ${updatedCount} lead(s) to ${agentName}${createdTasksCount > 0 ? ` and created ${createdTasksCount} task(s)` : ''}.`
        });
    } catch (err: any) {
        console.error('Admin bulk assign leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to bulk assign leads' });
    }
});

/** Admin: Update Single Lead (Assignee, Status, Notes, etc.) */
router.patch('/crm/leads/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const { assignedTo, status, notes, opportunityLevel, industry, website, phone, email, name } = req.body || {};

        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [leadId];

        if (assignedTo !== undefined) {
            params.push(assignedTo || null);
            updates.push(`assigned_to = $${params.length}`);
        }
        if (status !== undefined) {
            params.push(status);
            updates.push(`status = $${params.length}`);
        }
        if (notes !== undefined) {
            params.push(String(notes || '').trim());
            updates.push(`notes = $${params.length}`);
        }
        if (opportunityLevel !== undefined) {
            params.push(String(opportunityLevel || '').toLowerCase());
            updates.push(`opportunity_level = $${params.length}`);
        }
        if (industry !== undefined) {
            params.push(String(industry || '').trim());
            updates.push(`industry = $${params.length}`);
        }
        if (website !== undefined) {
            params.push(String(website || '').trim());
            updates.push(`website = $${params.length}`);
        }
        if (phone !== undefined) {
            params.push(String(phone || '').trim());
            updates.push(`phone = $${params.length}`);
        }
        if (email !== undefined) {
            params.push(String(email || '').trim().toLowerCase());
            updates.push(`email = $${params.length}`);
        }
        if (name !== undefined) {
            params.push(String(name || '').trim());
            updates.push(`name = $${params.length}`);
        }

        const { rows } = await query(`
            UPDATE sales_leads
            SET ${updates.join(', ')}
            WHERE id::text = $1
            RETURNING *
        `, params);

        let updatedLead = rows[0];
        if (!rows.length) {
            // Check if it's a submission ID
            const { rows: subRows } = await query(`
                SELECT id, type, email, payload FROM submissions WHERE id::text = $1 LIMIT 1
            `, [leadId]);
            if (subRows[0]) {
                const sub = subRows[0];
                const p = sub.payload || {};
                const leadName = String(name || p.businessName || p.name || p.contactName || 'Lead').trim();
                const leadPhone = String(phone || p.phone || '').trim();
                const leadEmail = String(email || sub.email || p.email || '').trim().toLowerCase();
                const newLead = await createSalesLead({
                    name: leadName,
                    phone: leadPhone,
                    email: leadEmail,
                    source: sub.type || 'growth_audit',
                    status: status || 'contacted',
                    notes: notes ? String(notes).trim() : '',
                    assignedTo: assignedTo || null,
                    createdByAdmin: true
                });
                updatedLead = newLead;
            } else {
                return res.status(404).json({ error: 'Lead not found' });
            }
        }

        if (status !== undefined || (notes !== undefined && String(notes).trim())) {
            try {
                const author = (req as any).user?.name || 'Admin';
                const actDate = req.body?.createdAt || req.body?.activityDate ? new Date(req.body.createdAt || req.body.activityDate) : new Date();
                await query(`
                    INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note, created_at)
                    VALUES ($1, $2, 'status_change', $3, $4, $5)
                `, [leadId, author, status || updatedLead?.status || 'status_change', notes ? String(notes).trim() : `Status updated to ${status}`, actDate]);
            } catch (actErr) {
                console.warn('Could not record status change activity:', actErr);
            }
        }

        res.json({ success: true, lead: updatedLead });
    } catch (err: any) {
        console.error('Admin update lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to update lead' });
    }
});

/** Admin: Convert Lead to Customer */
router.patch('/crm/leads/:id/convert', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);
        const { note = '' } = req.body || {};

        const lead = await convertLeadToCustomer(leadId);

        try {
            await query(`
                INSERT INTO lead_activities (lead_id, author_name, activity_type, disposition, note)
                VALUES ($1, 'Admin', 'call_log', 'converted', $2)
            `, [leadId, note ? `Converted lead to Customer by Admin. Note: ${note}` : 'Converted lead to Customer by Admin']);
        } catch {}

        res.json({ success: true, lead });
    } catch (err: any) {
        console.error('Admin convert lead error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to convert lead to customer' });
    }
});

/** Admin: Get Converted Customers */
router.get('/crm/customers', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const q = String(req.query.q || '').trim();
        const industry = String(req.query.industry || '').trim();

        const params: any[] = [];
        const where: string[] = ['l.is_customer = TRUE'];

        if (industry && industry !== 'all') {
            params.push(industry.toLowerCase());
            where.push(`LOWER(l.industry) = $${params.length}`);
        }

        if (q) {
            params.push(`%${q.toLowerCase()}%`);
            const p = `$${params.length}`;
            where.push(`(
                LOWER(l.name) LIKE ${p}
                OR LOWER(l.phone) LIKE ${p}
                OR LOWER(l.email) LIKE ${p}
                OR LOWER(l.address) LIKE ${p}
                OR LOWER(l.website) LIKE ${p}
            )`);
        }

        const { rows } = await query(`
            SELECT 
                l.id,
                l.name,
                l.name AS "businessName",
                l.phone,
                l.email,
                l.notes,
                l.status,
                l.source,
                l.industry,
                l.address,
                l.website,
                l.gbp_observation AS "gbpObservation",
                l.ai_visibility_observation AS "aiVisibilityObservation",
                l.lead_opportunity AS "leadOpportunity",
                l.opportunity_level AS "opportunityLevel",
                l.is_customer AS "isCustomer",
                l.converted_at AS "convertedAt",
                l.assigned_to AS "assignedTo",
                l.created_at AS "createdAt",
                l.updated_at AS "updatedAt",
                u.name AS "assignedAgentName",
                u.email AS "assignedAgentEmail"
            FROM sales_leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE ${where.join(' AND ')}
            ORDER BY l.converted_at DESC NULLS LAST, l.updated_at DESC
        `, params);

        res.json({ customers: rows });
    } catch (err: any) {
        console.error('Admin get customers error:', err);
        res.status(500).json({ error: err.message || 'Failed to load customers' });
    }
});

/** Admin: Get Distinct Industries with counts */
router.get('/crm/industries', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const { rows } = await query(`
            SELECT 
                COALESCE(NULLIF(TRIM(industry), ''), 'General') AS name,
                COUNT(*)::int AS count
            FROM sales_leads
            GROUP BY COALESCE(NULLIF(TRIM(industry), ''), 'General')
            ORDER BY count DESC
        `);
        res.json({ industries: rows });
    } catch (err: any) {
        console.error('Admin get industries error:', err);
        res.status(500).json({ error: err.message || 'Failed to load industries' });
    }
});

/** Admin: Delete all leads uploaded from Excel / bulk imports */
router.delete('/crm/leads/excel', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables();

        // 1. Delete tasks for excel leads
        await query(`
            DELETE FROM lead_tasks
            WHERE lead_id IN (
                SELECT id::text FROM sales_leads WHERE source = 'excel_import' OR source ILIKE '%excel%'
            )
        `).catch(() => {});

        // 2. Delete activities for excel leads
        await query(`
            DELETE FROM lead_activities
            WHERE lead_id IN (
                SELECT id::text FROM sales_leads WHERE source = 'excel_import' OR source ILIKE '%excel%'
            )
        `).catch(() => {});

        // 3. Delete sales leads
        const { rows } = await query(`
            DELETE FROM sales_leads
            WHERE source = 'excel_import' OR source ILIKE '%excel%'
            RETURNING id
        `);

        res.json({ success: true, count: rows.length, message: `Successfully deleted ${rows.length} excel leads.` });
    } catch (err: any) {
        console.error('Admin delete excel leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete excel leads' });
    }
});

/** Admin: Delete a single sales lead */
router.delete('/crm/leads/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        await ensureCrmTables();
        const leadId = String(req.params.id);

        await query(`DELETE FROM lead_tasks WHERE lead_id = $1`, [leadId]).catch(() => {});
        await query(`DELETE FROM lead_activities WHERE lead_id = $1`, [leadId]).catch(() => {});
        const { rows } = await query(`DELETE FROM sales_leads WHERE id = $1 RETURNING id`, [leadId]);

        if (!rows.length) {
            return res.status(404).json({ error: 'Lead not found.' });
        }

        res.json({ success: true, id: leadId });
    } catch (err: any) {
        console.error('Admin delete lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete lead' });
    }
});

export default router;


