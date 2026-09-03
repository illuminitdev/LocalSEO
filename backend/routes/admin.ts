import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { signToken, comparePassword } from '../lib/authTokens';
import { requireAdmin, adminConfigured, resolveAdminCredentials } from '../middleware/adminAuth';
import { upsertOrgSubscription, setOrgAutopay } from '../middleware/entitlements';
import {
    PLANS,
    FEATURE_LABELS,
    FEATURE_KEYS,
    getFeaturesForPlan,
    formatPrice,
    isValidPlanId
} from '../lib/planCatalog';
import Stripe from 'stripe';

const router = Router();

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
    const { passwordHash, password: plain } = resolveAdminCredentials();
    if (passwordHash) return comparePassword(password, passwordHash);
    return password === plain;
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

        // Dev email only on STAGE=dev; prod email only on STAGE=prod
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

router.get('/me', requireAdmin, (req: Request, res: Response) => {
    res.json({
        admin: (req as any).admin,
        products: PRODUCTS,
        stage: resolveAdminCredentials().stage
    });
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
        const { rows } = await query(
            `SELECT DISTINCT ON (u.id)
                    u.id AS user_id, u.email, u.name AS user_name, u.created_at AS user_created_at,
                    u.must_change_password,
                    o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.trade_type, o.setup_complete,
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
                 SELECT * FROM portal_invites
                 WHERE LOWER(email) = LOWER(u.email)
                 ORDER BY created_at DESC
                 LIMIT 1
             ) pi ON TRUE
             ORDER BY u.id, s.created_at DESC NULLS LAST`
        );

        // Re-sort by join date for display
        rows.sort(
            (a: any, b: any) =>
                new Date(b.user_created_at).getTime() - new Date(a.user_created_at).getTime()
        );

        // Also include paid invites not yet claimed as portal users
        const inviteOnly = await query(
            `SELECT pi.id AS invite_id, pi.email, pi.full_name, pi.phone, pi.plan_id, pi.status,
                    pi.claimed_at, pi.credentials_emailed_at, pi.created_at AS invite_created_at,
                    pi.stripe_subscription_id, pi.stripe_customer_id, pi.stripe_session_id,
                    pi.features AS invite_features,
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

        const users = rows.map((row: any) => {
            const features = row.plan_id
                ? getFeaturesForPlan(row.plan_id)
                : [];
            return {
                kind: 'user' as const,
                userId: row.user_id,
                email: row.email,
                name: row.user_name,
                createdAt: row.user_created_at,
                mustChangePassword: Boolean(row.must_change_password),
                organization: row.org_id
                    ? {
                          id: row.org_id,
                          name: row.org_name,
                          slug: row.org_slug,
                          tradeType: row.trade_type,
                          setupComplete: row.setup_complete
                      }
                    : null,
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
        });

        const pendingInvites = inviteOnly.rows.map((row: any) => {
            const features = row.plan_id ? getFeaturesForPlan(row.plan_id) : [];
            return {
                kind: 'invite' as const,
                userId: null,
                email: row.email,
                name: row.full_name || '',
                createdAt: row.invite_created_at,
                mustChangePassword: true,
                organization: null,
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
        });

        res.json({
            stage: resolveAdminCredentials().stage,
            users: [...pendingInvites, ...users],
            featureLabels: FEATURE_LABELS,
            plans: PLANS
        });
    } catch (err: any) {
        console.error('Admin users error:', err);
        res.status(500).json({ error: err.message });
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

        // Autopay-only update (keep current plan)
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

export default router;
