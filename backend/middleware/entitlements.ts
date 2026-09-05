import { query } from '../lib/db';
import { getFeaturesForPlan, getPlanById, getRequiredPlanHint, isValidPlanId } from '../lib/planCatalog';

function entitlementsDisabled() {
    return process.env.ENTITLEMENTS_DISABLED === 'true';
}

function emptyEntitlements() {
    return {
        planId: null,
        planName: null,
        features: [] as string[],
        subscriptionStatus: null,
        priceCents: null,
        currency: null,
        currentPeriodStart: null as string | null,
        currentPeriodEnd: null as string | null,
        cancelAtPeriodEnd: false,
        autopayEnabled: true,
        activeSubscriptions: [] as Array<{
            id: string;
            planId: string;
            planName: string;
            priceCents: number | null;
            currency: string | null;
            currentPeriodStart: string | null;
            currentPeriodEnd: string | null;
            cancelAtPeriodEnd: boolean;
            status: string;
        }>
    };
}

/** Dedupe join rows (one per feature) into unique subscriptions, preserving created_at DESC order. */
function dedupeActiveSubscriptions(rows: any[]) {
    const seen = new Set<string>();
    const list: ReturnType<typeof emptyEntitlements>['activeSubscriptions'] = [];
    for (const r of rows) {
        if (!r?.id || seen.has(r.id)) continue;
        seen.add(r.id);
        list.push({
            id: r.id,
            planId: r.plan_id,
            planName: r.plan_name,
            priceCents: r.price_cents ?? null,
            currency: r.currency ?? null,
            currentPeriodStart: r.current_period_start ?? null,
            currentPeriodEnd: r.current_period_end ?? null,
            cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
            status: r.status
        });
    }
    return list;
}

function periodStillValid(periodEnd: any) {
    if (!periodEnd) return true;
    return new Date(periodEnd).getTime() > Date.now();
}

/**
 * Load active plan features from shared ZappSites tables.
 * Matches by org_id (post-claim) OR customer_email (pre-claim / email link).
 * Expired periods (past current_period_end) yield no features and are marked canceled.
 */
async function loadOrgEntitlements(orgId: any, email?: any) {
    if (!orgId && !email) {
        return emptyEntitlements();
    }

    const { rows } = await query(
        `SELECT s.id, s.plan_id, s.status, s.current_period_start, s.current_period_end,
                s.cancel_at_period_end,
                p.name AS plan_name, p.price_cents, p.currency,
                pf.feature_key
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         LEFT JOIN plan_features pf ON pf.plan_id = s.plan_id
         WHERE s.status = 'active'
           AND (
             ($1::uuid IS NOT NULL AND s.org_id = $1)
             OR ($2::text IS NOT NULL AND LOWER(s.customer_email) = LOWER($2))
           )
         ORDER BY s.created_at DESC`,
        [orgId || null, email || null]
    );

    if (!rows.length) {
        return emptyEntitlements();
    }

    const featureSet = new Set<string>();
    const validRows = rows.filter((r) => periodStillValid(r.current_period_end));

    if (!validRows.length) {
        // Latest row expired — mark that one canceled and return empty features
        const expired = rows[0];
        await query(
            `UPDATE subscriptions
             SET status = 'canceled', updated_at = NOW()
             WHERE id = $1 AND status = 'active'`,
            [expired.id]
        ).catch(() => {});
        return {
            ...emptyEntitlements(),
            planId: expired.plan_id,
            planName: expired.plan_name,
            subscriptionStatus: 'canceled',
            priceCents: expired.price_cents,
            currency: expired.currency,
            currentPeriodStart: expired.current_period_start,
            currentPeriodEnd: expired.current_period_end,
            cancelAtPeriodEnd: Boolean(expired.cancel_at_period_end),
            autopayEnabled: !expired.cancel_at_period_end,
            activeSubscriptions: []
        };
    }

    // Primary plan = latest by created_at (already ORDER BY created_at DESC)
    // Features = union across all active non-expired stacked plans
    const primary = validRows[0];
    for (const r of validRows) {
        if (r.feature_key) featureSet.add(r.feature_key);
    }

    let features = [...featureSet];
    if (!features.length) {
        features = getFeaturesForPlan(primary.plan_id);
    }

    const cancelAtPeriodEnd = Boolean(primary.cancel_at_period_end);
    const activeSubscriptions = dedupeActiveSubscriptions(validRows);

    return {
        planId: primary.plan_id,
        planName: primary.plan_name,
        features,
        subscriptionStatus: primary.status,
        priceCents: primary.price_cents,
        currency: primary.currency,
        currentPeriodStart: primary.current_period_start,
        currentPeriodEnd: primary.current_period_end,
        cancelAtPeriodEnd,
        autopayEnabled: !cancelAtPeriodEnd,
        activeSubscriptions
    };
}

async function attachEntitlements(req: any) {
    if (entitlementsDisabled()) {
        req.entitlements = {
            planId: 'dev-bypass',
            planName: 'All features (dev bypass)',
            features: ['bookings', 'local_presence', 'local_growth', 'reporting'],
            subscriptionStatus: 'active',
            cancelAtPeriodEnd: false,
            autopayEnabled: true,
            activeSubscriptions: []
        };
        return req.entitlements;
    }
    if (!req.entitlements) {
        const email = req.user?.email || null;
        req.entitlements = await loadOrgEntitlements(req.orgId, email);
    }
    return req.entitlements || emptyEntitlements();
}

function orgHasFeature(entitlements: any, featureKey: string) {
    if (entitlementsDisabled()) return true;
    return Array.isArray(entitlements?.features) && entitlements.features.includes(featureKey);
}

function orgHasAllFeatures(entitlements: any, featureKeys: string[]) {
    if (entitlementsDisabled()) return true;
    return featureKeys.every((k) => orgHasFeature(entitlements, k));
}

function denyUpgrade(res: any, featureKey: string) {
    const hint = getRequiredPlanHint(featureKey);
    return res.status(403).json({
        error: 'upgrade_required',
        feature: featureKey,
        requiredPlanHint: hint
    });
}

function requireFeature(featureKey: string) {
    return async (req: any, res: any, next: any) => {
        try {
            if (entitlementsDisabled()) return next();
            if (!req.orgId) {
                return res.status(401).json({ error: 'Login required' });
            }
            const entitlements = await attachEntitlements(req);
            if (!orgHasFeature(entitlements, featureKey)) {
                return denyUpgrade(res, featureKey);
            }
            next();
        } catch (err: any) {
            console.error('requireFeature error:', err);
            res.status(500).json({ error: err.message || 'Entitlement check failed' });
        }
    };
}

function requireAllFeatures(featureKeys: string[]) {
    return async (req: any, res: any, next: any) => {
        try {
            if (entitlementsDisabled()) return next();
            if (!req.orgId) {
                return res.status(401).json({ error: 'Login required' });
            }
            const entitlements = await attachEntitlements(req);
            const missing = featureKeys.find((k) => !orgHasFeature(entitlements, k));
            if (missing) {
                return denyUpgrade(res, missing);
            }
            next();
        } catch (err: any) {
            console.error('requireAllFeatures error:', err);
            res.status(500).json({ error: err.message || 'Entitlement check failed' });
        }
    };
}

function allowDevSubscriptionWrites() {
    if (entitlementsDisabled()) return true;
    if (process.env.SHARED_RDS === 'true' || process.env.DB_PROXY_ENDPOINT) return false;
    return process.env.NODE_ENV === 'development';
}

async function upsertOrgSubscription(
    orgId: any,
    planId: string,
    opts?: { cancelAtPeriodEnd?: boolean }
) {
    if (!isValidPlanId(planId)) {
        throw new Error(`Invalid plan_id: ${planId}`);
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const cancelAtPeriodEnd = Boolean(opts?.cancelAtPeriodEnd);

    await query(
        `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
         WHERE org_id = $1 AND status = 'active'`,
        [orgId]
    );
    await query(
        `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
         WHERE org_id = $1 AND status = 'cancelled'`,
        [orgId]
    ).catch(() => {});

    const { rows } = await query(
        `INSERT INTO subscriptions (
            org_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end
         ) VALUES ($1, $2, 'active', $3, $4, $5)
         RETURNING *`,
        [orgId, planId, now, periodEnd, cancelAtPeriodEnd]
    );

    const plan = getPlanById(planId);
    return {
        subscription: rows[0],
        planId,
        planName: plan?.name || planId,
        features: getFeaturesForPlan(planId)
    };
}

async function setOrgAutopay(orgId: any, enabled: boolean, stripeClient?: any) {
    const cancelAtPeriodEnd = !enabled;
    const { rows } = await query(
        `SELECT id, stripe_subscription_id, cancel_at_period_end, status, current_period_end
         FROM subscriptions
         WHERE org_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [orgId]
    );
    if (!rows.length) {
        throw new Error('No active subscription found.');
    }

    const sub = rows[0];
    if (stripeClient && sub.stripe_subscription_id) {
        await stripeClient.subscriptions.update(sub.stripe_subscription_id, {
            cancel_at_period_end: cancelAtPeriodEnd
        });
    }

    const { rows: updated } = await query(
        `UPDATE subscriptions
         SET cancel_at_period_end = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [cancelAtPeriodEnd, sub.id]
    );

    return {
        subscription: updated[0],
        cancelAtPeriodEnd,
        autopayEnabled: !cancelAtPeriodEnd
    };
}

async function syncStripeSubscriptionRecord(stripeSub: any) {
    if (!stripeSub?.id) return null;

    const periodStart = stripeSub.current_period_start
        ? new Date(stripeSub.current_period_start * 1000)
        : null;
    const periodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null;
    const cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);
    const status =
        stripeSub.status === 'active' || stripeSub.status === 'trialing'
            ? 'active'
            : stripeSub.status === 'canceled' || stripeSub.status === 'unpaid'
              ? 'canceled'
              : String(stripeSub.status || 'active');

    const { rows } = await query(
        `UPDATE subscriptions
         SET status = $2,
             cancel_at_period_end = $3,
             current_period_start = COALESCE($4, current_period_start),
             current_period_end = COALESCE($5, current_period_end),
             updated_at = NOW()
         WHERE stripe_subscription_id = $1
         RETURNING *`,
        [stripeSub.id, status, cancelAtPeriodEnd, periodStart, periodEnd]
    );
    return rows[0] || null;
}

export {
    entitlementsDisabled,
    loadOrgEntitlements,
    attachEntitlements,
    orgHasFeature,
    orgHasAllFeatures,
    requireFeature,
    requireAllFeatures,
    upsertOrgSubscription,
    allowDevSubscriptionWrites,
    setOrgAutopay,
    syncStripeSubscriptionRecord
};
