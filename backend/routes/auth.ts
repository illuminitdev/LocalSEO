import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';
import { query } from '../lib/db';
import { hashPassword, comparePassword, signToken } from '../lib/authTokens';
import { uniqueOrgSlug } from '../lib/slug';
import { requireAuth } from '../middleware/auth';
import { sendPasswordResetOtpEmail } from '../lib/bookingEmail';
import {
    loadOrgEntitlements,
    upsertOrgSubscription,
    entitlementsDisabled,
    allowDevSubscriptionWrites,
    setOrgAutopay
} from '../middleware/entitlements';
import {
    PLANS,
    getPlanById,
    formatPrice,
    FEATURE_LABELS,
    getFeaturesForPlan,
    isValidPlanId
} from '../lib/planCatalog';
import Stripe from 'stripe';
import {
    industryIdFromPaymentCheckoutSession,
    industryIdFromStripeSubscription,
    setOrgBookingIndustry
} from '../lib/bookingIndustryHydrate';
import { isBookingPlanId, normalizeBookingIndustryId } from '../lib/bookingIndustryPresets';

const router = Router();

function getStripeClient() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    try {
        return new Stripe(process.env.STRIPE_SECRET_KEY);
    } catch {
        return null;
    }
}

function hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

function hashPasswordResetOtp(userId: string, otp: string) {
    return hashResetToken(`${userId}:${String(otp || '').trim()}`);
}

function generatePasswordResetOtp() {
    return String(randomInt(100000, 1000000));
}


function hashInvitePassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
}

function authUserPayload(user: {
    id: any;
    email: any;
    name: any;
    must_change_password?: boolean;
    avatar_url?: string;
    platform_role?: string;
}) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url || '',
        mustChangePassword: Boolean(user.must_change_password),
        platformRole: user.platform_role || 'customer'
    };
}

async function claimPortalInvite(email: string, password: string) {
    let inviteRes = await query(
        `SELECT id, email, full_name, phone, plan_id, password_hash, stripe_subscription_id,
                stripe_session_id, features, booking_industry_id
         FROM portal_invites
         WHERE LOWER(email) = LOWER($1) AND status = 'paid' AND claimed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [email]
    ).catch(async (err: any) => {
        if (!/booking_industry_id/i.test(String(err?.message || ''))) throw err;
        return query(
            `SELECT id, email, full_name, phone, plan_id, password_hash, stripe_subscription_id,
                    stripe_session_id, features
             FROM portal_invites
             WHERE LOWER(email) = LOWER($1) AND status = 'paid' AND claimed_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1`,
            [email]
        );
    });
    if (!inviteRes.rows.length) return null;

    const invite = inviteRes.rows[0];
    if (hashInvitePassword(password) !== invite.password_hash) {
        return null;
    }

    const passwordHash = await hashPassword(password);
    const displayName = String(invite.full_name || email.split('@')[0]).trim();

    const userRes = await query(
        `INSERT INTO users (email, password_hash, name, must_change_password)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id, email, name, must_change_password`,
        [email, passwordHash, displayName]
    );
    const user = userRes.rows[0];

    const orgSlug = await uniqueOrgSlug(displayName || 'My business', query);
    const orgRes = await query(
        `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, setup_complete)
         VALUES ($1, $2, $3, '', $4, '', $5, FALSE)
         RETURNING id, slug, name`,
        [orgSlug, displayName || 'My business', displayName, invite.phone || '', email]
    );
    const org = orgRes.rows[0];

    await query('INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)', [
        user.id,
        org.id,
        'owner'
    ]);

    await query(
        `UPDATE subscriptions
         SET org_id = $1, updated_at = NOW()
         WHERE status = 'active'
           AND (
             LOWER(customer_email) = LOWER($2)
             OR ($3::text IS NOT NULL AND stripe_subscription_id = $3)
           )`,
        [org.id, email, invite.stripe_subscription_id || null]
    );

    
    if (isBookingPlanId(String(invite.plan_id || ''))) {
        let industryId = normalizeBookingIndustryId(invite.booking_industry_id);
        if (!industryId) {
            industryId = await industryIdFromPaymentCheckoutSession(invite.stripe_session_id);
        }
        if (!industryId) {
            industryId = await industryIdFromStripeSubscription(invite.stripe_subscription_id);
        }
        if (industryId) {
            try {
                await setOrgBookingIndustry(org.id, industryId);
                if (!invite.booking_industry_id) {
                    await query(
                        `UPDATE portal_invites
                         SET booking_industry_id = $2, updated_at = NOW()
                         WHERE id = $1`,
                        [invite.id, industryId]
                    ).catch(() => undefined);
                }
            } catch (err: any) {
                console.warn('Claim: could not set booking_industry_id:', err?.message || err);
            }
        }
    }

    await query(
        `UPDATE portal_invites
         SET org_id = $1, claimed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [org.id, invite.id]
    );

    return { user, org };
}

router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body || {};
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const existing = await query('SELECT id FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
        if (existing.rows.length) return res.status(409).json({ error: 'Email already registered.' });

        const passwordHash = await hashPassword(password);
        const displayName = String(name).trim();
        const userRes = await query(
            `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name`,
            [String(email).trim().toLowerCase(), passwordHash, displayName]
        );
        const user = userRes.rows[0];

        const orgSlug = await uniqueOrgSlug(displayName || 'My business', query);
        const orgRes = await query(
            `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, setup_complete)
             VALUES ($1, $2, $3, '', '', '', $4, FALSE) RETURNING id, slug, name`,
            [orgSlug, 'My business', displayName, user.email]
        );
        const org = orgRes.rows[0];

        await query('INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)', [user.id, org.id, 'owner']);

        if (process.env.NODE_ENV === 'development' && process.env.DEFAULT_DEV_PLAN_ID) {
            try {
                await upsertOrgSubscription(org.id, process.env.DEFAULT_DEV_PLAN_ID);
            } catch (subErr: any) {
                console.warn('DEFAULT_DEV_PLAN_ID subscription failed:', subErr.message);
            }
        }

        const token = signToken({ userId: user.id, orgId: org.id });
        res.status(201).json({
            token,
            user: authUserPayload({ ...user, must_change_password: false }),
            organization: { id: org.id, slug: org.slug, name: org.name }
        });
    } catch (err: any) {
        console.error('Register error:', err);
        res.status(500).json({ error: err.message || 'Registration failed' });
    }
});

router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

        const normalizedEmail = String(email).trim().toLowerCase();

        const { rows } = await query(
            `SELECT id, email, name, password_hash, must_change_password, platform_role
             FROM users WHERE email = $1`,
            [normalizedEmail]
        );

        if (rows.length) {
            const user = rows[0];
            const ok = await comparePassword(password, user.password_hash);
            if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

            const orgRes = await query(
                `SELECT o.id, o.slug, o.name
                 FROM memberships m
                 JOIN organizations o ON o.id = m.org_id
                 WHERE m.user_id = $1
                 LIMIT 1`,
                [user.id]
            );
            const org = orgRes.rows[0];
            const token = signToken({ userId: user.id, orgId: org?.id });

            return res.json({
                token,
                user: authUserPayload(user),
                organization: org || null
            });
        }

        const claimed = await claimPortalInvite(normalizedEmail, String(password));
        if (!claimed) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = signToken({ userId: claimed.user.id, orgId: claimed.org.id });
        res.json({
            token,
            user: authUserPayload(claimed.user),
            organization: {
                id: claimed.org.id,
                slug: claimed.org.slug,
                name: claimed.org.name
            }
        });
    } catch (err: any) {
        console.error('Login error:', err);
        
        if (err?.message && /portal_invites|does not exist/i.test(err.message)) {
            return res.status(401).json({
                error: 'Invalid email or password.',
                hint: 'Ensure ZappSites migrations 010+011 are applied (Payment ops/platform-migrate).'
            });
        }
        res.status(500).json({ error: err.message || 'Login failed' });
    }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const { rows } = await query('SELECT id, email, name FROM users WHERE email = $1', [email]);
        if (rows.length) {
            const user = rows[0];
            const otp = generatePasswordResetOtp();
            const tokenHash = hashPasswordResetOtp(user.id, otp);
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            await query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
            await query(
                `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
                [user.id, tokenHash, expiresAt]
            );

            await sendPasswordResetOtpEmail({ to: user.email, name: user.name, otp });
        }

        res.json({
            success: true,
            message: 'If an account exists for that email, we sent a one-time code.'
        });
    } catch (err: any) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: err.message || 'Could not process request' });
    }
});

router.post('/verify-reset-otp', async (req: Request, res: Response) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const otp = String(req.body?.otp || '').trim().replace(/\s+/g, '');
        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and code are required.' });
        }
        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });
        }

        const { rows: users } = await query('SELECT id FROM users WHERE email = $1', [email]);
        if (!users.length) {
            return res.status(400).json({ error: 'Invalid or expired code.' });
        }

        const userId = users[0].id;
        const tokenHash = hashPasswordResetOtp(userId, otp);
        const { rows } = await query(
            `SELECT id FROM password_reset_tokens
             WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()
             LIMIT 1`,
            [userId, tokenHash]
        );
        if (!rows.length) {
            return res.status(400).json({ error: 'Invalid or expired code.' });
        }

        res.json({ success: true, message: 'Code verified. Choose a new password.' });
    } catch (err: any) {
        console.error('Verify reset OTP error:', err);
        res.status(500).json({ error: err.message || 'Could not verify code' });
    }
});

router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const password = String(req.body?.password || '');
        const email = String(req.body?.email || '').trim().toLowerCase();
        const otp = String(req.body?.otp || '').trim().replace(/\s+/g, '');
        const token = String(req.body?.token || '').trim();

        if (!password) {
            return res.status(400).json({ error: 'New password is required.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        let row: { id: string; user_id: string } | null = null;

        if (email && otp) {
            if (!/^\d{6}$/.test(otp)) {
                return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });
            }
            const { rows: users } = await query('SELECT id FROM users WHERE email = $1', [email]);
            if (!users.length) {
                return res.status(400).json({ error: 'Invalid or expired code.' });
            }
            const tokenHash = hashPasswordResetOtp(users[0].id, otp);
            const { rows } = await query(
                `SELECT id, user_id FROM password_reset_tokens
                 WHERE user_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()
                 LIMIT 1`,
                [users[0].id, tokenHash]
            );
            row = rows[0] || null;
        } else if (token) {
            const tokenHash = hashResetToken(token);
            const { rows } = await query(
                `SELECT id, user_id FROM password_reset_tokens
                 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
                 LIMIT 1`,
                [tokenHash]
            );
            row = rows[0] || null;
        } else {
            return res.status(400).json({ error: 'Email, code, and new password are required.' });
        }

        if (!row) {
            return res.status(400).json({ error: 'Invalid or expired code.' });
        }

        const passwordHash = await hashPassword(password);
        await query(
            `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
            [passwordHash, row.user_id]
        );
        await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
        await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2', [row.user_id, row.id]);

        res.json({ success: true, message: 'Password updated. You can sign in now.' });
    } catch (err: any) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: err.message || 'Could not reset password' });
    }
});

router.get('/entitlements', requireAuth, async (req: Request, res: Response) => {
    try {
        const entitlements = await loadOrgEntitlements((req as any).orgId, (req as any).user?.email);
        const plan = getPlanById(entitlements.planId);
        const activeSubscriptions = (entitlements.activeSubscriptions || []).map((sub: any) => {
            const catalogPlan = getPlanById(sub.planId);
            return {
                ...sub,
                priceLabel: catalogPlan
                    ? formatPrice(catalogPlan)
                    : sub.priceCents != null
                      ? `£${(Number(sub.priceCents) / 100).toFixed(0)}/mo`
                      : null
            };
        });
        res.json({
            ...entitlements,
            activeSubscriptions,
            priceLabel: plan ? formatPrice(plan) : null,
            entitlementsDisabled: entitlementsDisabled(),
            catalog: PLANS.map((p: any) => ({
                id: p.id,
                name: p.name,
                priceCents: p.priceCents,
                priceLabel: formatPrice(p),
                features: getFeaturesForPlan(p.id)
            })),
            featureLabels: FEATURE_LABELS
        });
    } catch (err: any) {
        console.error('Entitlements error:', err);
        res.status(500).json({ error: err.message || 'Could not load entitlements' });
    }
});

router.patch('/subscription/autopay', requireAuth, async (req: Request, res: Response) => {
    try {
        const enabled = Boolean(req.body?.enabled);
        const result = await setOrgAutopay((req as any).orgId, enabled, getStripeClient());
        const entitlements = await loadOrgEntitlements((req as any).orgId, (req as any).user?.email);
        res.json({
            success: true,
            autopayEnabled: result.autopayEnabled,
            cancelAtPeriodEnd: result.cancelAtPeriodEnd,
            currentPeriodEnd: result.subscription?.current_period_end || entitlements.currentPeriodEnd,
            subscriptionStatus: entitlements.subscriptionStatus,
            features: entitlements.features
        });
    } catch (err: any) {
        console.error('Autopay update error:', err);
        res.status(400).json({ error: err.message || 'Could not update autopay' });
    }
});

/** Finds the Stripe customer (and subscription, when linked) behind the signed-in account. */
async function resolveStripeCustomer(stripe: any, req: Request): Promise<{ customerId?: string; stripeSubId?: string }> {
    const orgId = (req as any).orgId;
    const email = String((req as any).user?.email || '');
    const { rows } = await query(
        `SELECT stripe_subscription_id
         FROM subscriptions
         WHERE stripe_subscription_id IS NOT NULL
           AND (org_id = $1 OR LOWER(customer_email) = LOWER($2))
         ORDER BY (org_id = $1) DESC, (status = 'active') DESC, created_at DESC
         LIMIT 1`,
        [orgId, email]
    );
    let stripeSubId: string | undefined = rows[0]?.stripe_subscription_id || undefined;
    let customerId: string | undefined;
    if (!stripeSubId) {
        // The paid checkout invite this account was created from also carries the Stripe ids.
        const invite = await query(
            `SELECT stripe_subscription_id, stripe_customer_id
             FROM portal_invites
             WHERE (org_id = $1 OR LOWER(email) = LOWER($2))
               AND (stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL)
             ORDER BY created_at DESC
             LIMIT 1`,
            [orgId, email]
        ).catch(() => ({ rows: [] as any[] }));
        stripeSubId = invite.rows[0]?.stripe_subscription_id || undefined;
        customerId = invite.rows[0]?.stripe_customer_id || undefined;
    }
    if (stripeSubId) {
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id;
    } else if (!customerId && email) {
        // Fallback: org plan wasn't linked to a Stripe subscription row; match the customer by email.
        const found = await stripe.customers.list({ email, limit: 1 });
        customerId = found.data[0]?.id;
    }
    return { customerId, stripeSubId };
}

/** Resolve Stripe Price id for a plan (lookup_key = planId, same as ZappSites). */
async function resolvePlanStripePriceId(stripe: Stripe, planId: string): Promise<string | null> {
    const byLookup = await stripe.prices.list({ lookup_keys: [planId], active: true, limit: 1 });
    if (byLookup.data[0]?.id) return byLookup.data[0].id;

    const plan = getPlanById(planId);
    if (!plan) return null;
    const search = await stripe.prices
        .search({
            query: `active:'true' AND metadata['planId']:'${planId}'`,
            limit: 5
        })
        .catch(() => ({ data: [] as Stripe.Price[] }));
    const match =
        search.data.find(
            (p) =>
                p.unit_amount === plan.priceCents &&
                p.currency === 'gbp' &&
                p.recurring?.interval === 'month'
        ) || search.data[0];
    return match?.id || null;
}

/** Booking plans need the org's business type (carried in Stripe metadata). */
async function bookingIndustryForPlan(orgId: string | undefined, planId: string): Promise<{ id: string | null; error?: string }> {
    if (!isBookingPlanId(planId) || !orgId) return { id: null };
    const { rows } = await query(
        `SELECT booking_industry_id FROM organizations WHERE id = $1`,
        [orgId]
    ).catch(() => ({ rows: [] as any[] }));
    const id = normalizeBookingIndustryId(rows[0]?.booking_industry_id);
    return id
        ? { id }
        : { id: null, error: 'Select your business type in Account settings before switching to a booking plan.' };
}

/** The signed-in account's active subscription row (only its own). */
async function loadOwnSubscription(req: Request, subscriptionId: string) {
    const { rows } = await query(
        `SELECT id, plan_id, stripe_subscription_id, pending_plan_id, stripe_schedule_id
         FROM subscriptions
         WHERE id::text = $1 AND status = 'active'
           AND (org_id = $2 OR LOWER(customer_email) = LOWER($3))
         LIMIT 1`,
        [subscriptionId, (req as any).orgId || null, String((req as any).user?.email || '')]
    );
    return rows[0] || null;
}

const stripeId = (v: any): string | undefined => (typeof v === 'string' ? v : v?.id) || undefined;

/**
 * Plan row without stripe_subscription_id: find the customer's live Stripe subscription for the same plan
 * (price lookup_key or metadata plan_id) and save the link on the row.
 */
async function linkStripeSubscription(stripe: Stripe, req: Request, row: any): Promise<string | null> {
    const { customerId } = await resolveStripeCustomer(stripe, req);
    if (!customerId) return null;
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 20 });
    const planOf = (s: Stripe.Subscription) =>
        s.items.data[0]?.price?.lookup_key || s.items.data[0]?.price?.metadata?.planId || s.metadata?.plan_id || '';
    const match = subs.data.find((s) => planOf(s) === row.plan_id);
    if (!match) return null;
    await query(
        `UPDATE subscriptions SET stripe_subscription_id = $2, updated_at = NOW() WHERE id = $1 AND stripe_subscription_id IS NULL`,
        [row.id, match.id]
    );
    return match.id;
}

/** Drop a scheduled plan change: the subscription stays on its current plan and keeps renewing. */
async function releasePendingPlanChange(stripe: Stripe, row: any) {
    const scheduleId = row.stripe_schedule_id || (row.stripe_subscription_id
        ? stripeId((await stripe.subscriptions.retrieve(row.stripe_subscription_id)).schedule)
        : undefined);
    if (scheduleId) {
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        if (schedule.status === 'active' || schedule.status === 'not_started') {
            await stripe.subscriptionSchedules.release(scheduleId);
        }
    }
    await query(
        `UPDATE subscriptions
         SET pending_plan_id = NULL, pending_plan_starts_at = NULL, stripe_schedule_id = NULL, updated_at = NOW()
         WHERE id = $1`,
        [row.id]
    );
}

/**
 * Switch an existing paid plan to another one at the end of the current billing period (no new checkout, no second
 * subscription). The current plan stays active until then; Stripe bills the new price from the next renewal and the
 * webhook (syncStripeSubscriptionRecord) moves the plan over when it starts. Choosing the current plan again cancels
 * the scheduled change.
 */
router.post('/subscription/change', requireAuth, async (req: Request, res: Response) => {
    try {
        const planId = String(req.body?.planId || '').trim();
        const subscriptionId = String(req.body?.subscriptionId || '').trim();
        if (!planId || !isValidPlanId(planId)) {
            return res.status(400).json({ error: 'A valid planId is required.' });
        }

        const stripe = getStripeClient();
        if (!stripe) return res.status(400).json({ error: 'Billing is not configured.' });

        const row = subscriptionId ? await loadOwnSubscription(req, subscriptionId) : null;
        if (!row) return res.status(404).json({ error: 'Subscription not found.' });
        if (!row.stripe_subscription_id) {
            row.stripe_subscription_id = await linkStripeSubscription(stripe, req, row);
            if (!row.stripe_subscription_id) {
                return res.status(400).json({
                    error: 'Your plan is not linked to Stripe billing yet, so it cannot be changed here. Please contact support.'
                });
            }
        }

        if (planId === row.plan_id) {
            if (row.pending_plan_id) await releasePendingPlanChange(stripe, row);
            return res.json({ success: true, pendingPlanId: null });
        }
        if (planId === row.pending_plan_id) {
            return res.json({ success: true, pendingPlanId: planId });
        }

        const industry = await bookingIndustryForPlan((req as any).orgId, planId);
        if (industry.error) return res.status(400).json({ error: industry.error });

        const priceId = await resolvePlanStripePriceId(stripe, planId);
        if (!priceId) {
            return res.status(404).json({
                error: 'Stripe price not found for this plan. Sync plans in ZappSites Payment first.'
            });
        }

        let sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        if (sub.status !== 'active' && sub.status !== 'trialing') {
            return res.status(400).json({ error: 'This subscription is not active, so its plan cannot be changed.' });
        }
        // Choosing a new plan means the customer wants to continue, so stop the end-of-period cancellation.
        if (sub.cancel_at_period_end) {
            sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
            await query(
                `UPDATE subscriptions SET cancel_at_period_end = FALSE, updated_at = NOW() WHERE id = $1`,
                [row.id]
            );
        }

        const existingScheduleId = stripeId(sub.schedule);
        const schedule = existingScheduleId
            ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
            : await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
        const currentStart = schedule.current_phase?.start_date;
        const current = schedule.phases.find((p) => p.start_date === currentStart) || schedule.phases[0];
        if (!current?.end_date) {
            return res.status(400).json({ error: 'Could not read the current billing period from Stripe.' });
        }

        const nextMeta: Record<string, string> = {
            ...(sub.metadata || {}),
            plan_id: planId,
            ...(industry.id ? { booking_industry_id: industry.id } : {})
        };
        const updated = await stripe.subscriptionSchedules.update(schedule.id, {
            end_behavior: 'release',
            phases: [
                {
                    // Current period unchanged: same price(s), discounts and dates.
                    start_date: current.start_date,
                    end_date: current.end_date,
                    items: current.items.map((i) => ({ price: stripeId(i.price) as string, quantity: i.quantity ?? 1 })),
                    discounts: (current.discounts || []).map((d) =>
                        d.discount
                            ? { discount: stripeId(d.discount) }
                            : d.promotion_code
                              ? { promotion_code: stripeId(d.promotion_code) }
                              : { coupon: stripeId(d.coupon) }
                    ),
                    metadata: current.metadata || {},
                    proration_behavior: 'none'
                },
                {
                    // New plan from the next renewal; the schedule then releases and the subscription carries on.
                    items: [{ price: priceId, quantity: 1 }],
                    metadata: nextMeta,
                    proration_behavior: 'none'
                }
            ]
        });

        const startsAt = new Date(current.end_date * 1000);
        await query(
            `UPDATE subscriptions
             SET pending_plan_id = $2, pending_plan_starts_at = $3, stripe_schedule_id = $4, updated_at = NOW()
             WHERE id = $1`,
            [row.id, planId, startsAt, updated.id]
        );
        res.json({ success: true, pendingPlanId: planId, pendingPlanStartsAt: startsAt.toISOString() });
    } catch (err: any) {
        console.error('Subscription change error:', err);
        res.status(400).json({ error: err.message || 'Could not change the plan' });
    }
});

/** Cancel a scheduled plan change (keep the current plan). */
router.post('/subscription/change/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
        const stripe = getStripeClient();
        if (!stripe) return res.status(400).json({ error: 'Billing is not configured.' });
        const row = await loadOwnSubscription(req, String(req.body?.subscriptionId || '').trim());
        if (!row) return res.status(404).json({ error: 'Subscription not found.' });
        if (row.pending_plan_id || row.stripe_schedule_id) await releasePendingPlanChange(stripe, row);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Subscription change cancel error:', err);
        res.status(400).json({ error: err.message || 'Could not cancel the plan change' });
    }
});

router.post('/subscription/checkout', requireAuth, async (req: Request, res: Response) => {
    try {
        const planId = String(req.body?.planId || '').trim();
        if (!planId || !isValidPlanId(planId)) {
            return res.status(400).json({ error: 'A valid planId is required.' });
        }

        const stripe = getStripeClient();
        if (!stripe) return res.status(400).json({ error: 'Billing is not configured.' });

        const orgId = (req as any).orgId as string | undefined;
        const email = String((req as any).user?.email || '').trim();
        const fullName = String((req as any).user?.name || email.split('@')[0] || 'Customer').trim();
        if (!email) {
            return res.status(400).json({ error: 'Your account has no email for checkout.' });
        }

        // One plan per account: an existing plan is changed with a schedule (/subscription/change), never a 2nd checkout.
        const existing = await loadOrgEntitlements(orgId, email);
        if (existing.activeSubscriptions.length) {
            return res.status(409).json({
                error: 'You already have an active plan. Use "Adjust plan" to change it - the new plan starts when the current one ends.'
            });
        }

        const industry = await bookingIndustryForPlan(orgId, planId);
        if (industry.error) return res.status(400).json({ error: industry.error });
        const bookingIndustryId = industry.id;

        const { customerId: stripeCustomerId } = await resolveStripeCustomer(stripe, req);
        const priceId = await resolvePlanStripePriceId(stripe, planId);
        if (!priceId) {
            return res.status(404).json({
                error: 'Stripe price not found for this plan. Sync plans in ZappSites Payment first.'
            });
        }

        const returnUrl = String(req.body?.returnUrl || req.headers.origin || '').trim();
        const base = returnUrl ? returnUrl.split('#')[0] : '';
        const successUrl = base
            ? `${base}${base.includes('?') ? '&' : '?'}plan_checkout=1&session_id={CHECKOUT_SESSION_ID}#plan`
            : undefined;
        const cancelUrl = returnUrl || undefined;

        // Metadata matches ZappSites Payment webhook (checkout.session.completed).
        const meta: Record<string, string> = {
            plan_id: planId,
            customer_email: email,
            full_name: fullName,
            phone: '',
            ...(bookingIndustryId ? { booking_industry_id: bookingIndustryId } : {}),
            ...(orgId ? { org_id: orgId } : {})
        };

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            allow_promotion_codes: true,
            ...(stripeCustomerId
                ? { customer: stripeCustomerId }
                : { customer_email: email }),
            line_items: [{ price: priceId, quantity: 1 }],
            metadata: meta,
            subscription_data: { metadata: meta },
            ...(successUrl ? { success_url: successUrl } : {}),
            ...(cancelUrl ? { cancel_url: cancelUrl } : {})
        });

        if (!session.url) {
            return res.status(500).json({ error: 'Stripe did not return a checkout URL.' });
        }
        res.json({ url: session.url });
    } catch (err: any) {
        console.error('Subscription checkout error:', err);
        res.status(400).json({ error: err.message || 'Could not open Stripe checkout' });
    }
});

router.post('/subscription/portal', requireAuth, async (req: Request, res: Response) => {
    try {
        const stripe = getStripeClient();
        if (!stripe) return res.status(400).json({ error: 'Billing is not configured.' });
        const { customerId, stripeSubId } = await resolveStripeCustomer(stripe, req);
        if (!customerId) {
            // No linked customer: fall back to Stripe's no-code portal login link (user signs in by email code).
            const loginLink = String(process.env.STRIPE_PORTAL_LINK || '').trim();
            if (loginLink) {
                const email = String((req as any).user?.email || '');
                const sep = loginLink.includes('?') ? '&' : '?';
                return res.json({
                    url: email ? `${loginLink}${sep}prefilled_email=${encodeURIComponent(email)}` : loginLink
                });
            }
            return res.status(404).json({
                error: 'No Stripe subscription found for this account. Subscribe through Stripe checkout with the same email first.'
            });
        }
        const origin = String(req.body?.returnUrl || req.headers.origin || '').trim();
        const baseParams: any = { customer: customerId, ...(origin ? { return_url: origin } : {}) };

        // "Choose plan" opens Stripe's plan-switch screen; otherwise the full portal home.
        let session: any = null;
        if (req.body?.flow === 'update') {
            try {
                let subId = stripeSubId;
                if (!subId) {
                    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
                    subId = subs.data[0]?.id;
                }
                if (subId) {
                    session = await stripe.billingPortal.sessions.create({
                        ...baseParams,
                        flow_data: {
                            type: 'subscription_update',
                            subscription_update: { subscription: subId },
                            ...(origin
                                ? { after_completion: { type: 'redirect', redirect: { return_url: origin } } }
                                : {})
                        }
                    });
                }
            } catch (err: any) {
                console.warn('Plan switch flow unavailable, opening portal home:', err?.message || err);
            }
        }
        if (!session) session = await stripe.billingPortal.sessions.create(baseParams);
        res.json({ url: session.url });
    } catch (err: any) {
        console.error('Billing portal error:', err);
        res.status(400).json({ error: err.message || 'Could not open billing portal' });
    }
});

router.get('/subscription/invoices', requireAuth, async (req: Request, res: Response) => {
    try {
        const stripe = getStripeClient();
        if (!stripe) return res.json({ invoices: [] });
        const { customerId } = await resolveStripeCustomer(stripe, req);
        if (!customerId) return res.json({ invoices: [] });
        const list = await stripe.invoices.list({ customer: customerId, limit: 24 });
        const invoices = list.data
            .filter((inv: any) => inv.status !== 'draft' && inv.status !== 'void')
            .map((inv: any) => ({
                id: inv.id,
                number: inv.number || null,
                created: new Date(inv.created * 1000).toISOString(),
                description:
                    inv.description ||
                    inv.lines?.data?.[0]?.description ||
                    (inv.number ? `Invoice ${inv.number}` : 'Subscription'),
                status: inv.status,
                amount: inv.status === 'paid' ? inv.amount_paid : inv.amount_due,
                currency: String(inv.currency || 'gbp').toUpperCase(),
                url: inv.hosted_invoice_url || null,
                pdf: inv.invoice_pdf || null
            }));
        res.json({ invoices });
    } catch (err: any) {
        console.error('Invoice list error:', err);
        res.status(400).json({ error: err.message || 'Could not load invoices' });
    }
});

router.patch('/dev/subscription', requireAuth, async (req: Request, res: Response) => {
    if (!allowDevSubscriptionWrites()) {
        return res.status(404).json({ error: 'Not found' });
    }
    try {
        const planId = String(req.body?.planId || '').trim();
        if (!planId) return res.status(400).json({ error: 'planId is required.' });
        const result = await upsertOrgSubscription((req as any).orgId, planId);
        res.json({
            success: true,
            planId: result.planId,
            planName: result.planName,
            features: result.features,
            subscriptionStatus: 'active'
        });
    } catch (err: any) {
        console.error('Dev subscription error:', err);
        res.status(400).json({ error: err.message || 'Could not update subscription' });
    }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const orgId = (req as any).orgId;
    let org = null;
    let eventTypes: any[] = [];
    if (orgId) {
        const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
        org = orgRows[0] || null;
        const { rows: et } = await query(
            'SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at',
            [orgId]
        );
        eventTypes = et;
    }
    const { rows: cal } = await query(
        'SELECT id, calendar_id, connected_at FROM calendar_connections WHERE user_id = $1',
        [user.id]
    );

    res.json({
        user: authUserPayload(user),
        organization: org,
        eventTypes,
        googleCalendarConnected: cal.length > 0,
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
    });
});

router.patch('/profile', requireAuth, async (req: Request, res: Response) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Name is required.' });
        const avatarUrl =
            req.body?.avatarUrl != null ? String(req.body.avatarUrl).trim() : undefined;
        const userId = (req as any).user.id;

        const { rows } = await query(
            `UPDATE users SET
                name = $1,
                avatar_url = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE avatar_url END
             WHERE id = $2
             RETURNING id, email, name, avatar_url, must_change_password`,
            [name, userId, avatarUrl ?? null]
        );
        // Keep Team / booking display in sync with Account settings name
        await query(`UPDATE memberships SET display_name = $1 WHERE user_id = $2`, [name, userId]);
        res.json({ user: authUserPayload(rows[0]) });
    } catch (err: any) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: err.message || 'Could not update profile' });
    }
});

router.post('/avatar/presign', requireAuth, async (req: Request, res: Response) => {
    try {
        const { createUploadPresign } = await import('../lib/media');
        const data = await createUploadPresign({
            kind: 'avatar',
            contentType: String(req.body?.contentType || 'image/jpeg'),
            userId: (req as any).user.id
        });
        res.json(data);
    } catch (err: any) {
        res.status(err.status || 500).json({ error: err.message || 'Presign failed' });
    }
});

router.post('/team/accept', requireAuth, async (req: Request, res: Response) => {
    try {
        const { acceptOrgInvite } = await import('../lib/team');
        const result = await acceptOrgInvite(String(req.body?.token || ''), (req as any).user.id);
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

router.patch('/password', requireAuth, async (req: Request, res: Response) => {
    try {
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }

        const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [(req as any).user.id]);
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });

        const ok = await comparePassword(currentPassword, rows[0].password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

        const passwordHash = await hashPassword(newPassword);
        await query(
            `UPDATE users
             SET password_hash = $1, must_change_password = FALSE
             WHERE id = $2`,
            [passwordHash, (req as any).user.id]
        );
        res.json({ success: true, message: 'Password updated.', mustChangePassword: false });
    } catch (err: any) {
        console.error('Update password error:', err);
        res.status(500).json({ error: err.message || 'Could not update password' });
    }
});

export default router;
