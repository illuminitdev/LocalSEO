import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { query } from '../lib/db';
import { hashPassword, comparePassword, signToken } from '../lib/authTokens';
import { uniqueOrgSlug } from '../lib/slug';
import { requireAuth } from '../middleware/auth';
import { sendPasswordResetEmail } from '../lib/bookingEmail';
import {
    loadOrgEntitlements,
    upsertOrgSubscription,
    entitlementsDisabled,
    allowDevSubscriptionWrites,
    setOrgAutopay
} from '../middleware/entitlements';
import { isDevClientLogin, ensureDevClientAccount } from '../middleware/devClientAuth';
import { PLANS, getPlanById, formatPrice, FEATURE_LABELS, getFeaturesForPlan } from '../lib/planCatalog';
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

function frontendOrigin() {
    return (process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

/** ZappSites portal_invites.password_hash = SHA-256 hex of temp password */
function hashInvitePassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
}

function authUserPayload(user: { id: any; email: any; name: any; must_change_password?: boolean }) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        mustChangePassword: Boolean(user.must_change_password)
    };
}

async function claimPortalInvite(email: string, password: string) {
    const inviteRes = await query(
        `SELECT id, email, full_name, phone, plan_id, password_hash, stripe_subscription_id, features
         FROM portal_invites
         WHERE LOWER(email) = LOWER($1) AND status = 'paid' AND claimed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [email]
    );
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

        if (isDevClientLogin(normalizedEmail, String(password))) {
            const session = await ensureDevClientAccount();
            if (!session) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }
            const token = signToken({ userId: session.user.id, orgId: session.org.id });
            return res.json({
                token,
                user: authUserPayload(session.user),
                organization: {
                    id: session.org.id,
                    slug: session.org.slug,
                    name: session.org.name
                }
            });
        }

        const { rows } = await query(
            `SELECT id, email, name, password_hash, must_change_password
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
        // Shared RDS without ZappSites 011 yet — treat as invalid credentials
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
            const rawToken = randomBytes(32).toString('hex');
            const tokenHash = hashResetToken(rawToken);
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

            await query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
            await query(
                `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
                [user.id, tokenHash, expiresAt]
            );

            const resetUrl = `${frontendOrigin()}/reset-password?token=${rawToken}`;
            await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
        }

        res.json({
            success: true,
            message: 'If an account exists for that email, we sent password reset instructions.'
        });
    } catch (err: any) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: err.message || 'Could not process request' });
    }
});

router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const token = String(req.body?.token || '').trim();
        const password = String(req.body?.password || '');
        if (!token || !password) {
            return res.status(400).json({ error: 'Token and new password are required.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const tokenHash = hashResetToken(token);
        const { rows } = await query(
            `SELECT id, user_id FROM password_reset_tokens
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
             LIMIT 1`,
            [tokenHash]
        );
        if (!rows.length) {
            return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
        }

        const row = rows[0];
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
        res.json({
            ...entitlements,
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
    const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [(req as any).orgId]);
    const org = orgRows[0];
    const { rows: eventTypes } = await query(
        'SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at',
        [(req as any).orgId]
    );
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

        const { rows } = await query(
            `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name`,
            [name, (req as any).user.id]
        );
        res.json({ user: rows[0] });
    } catch (err: any) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: err.message || 'Could not update profile' });
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
