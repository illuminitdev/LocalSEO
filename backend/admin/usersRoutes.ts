import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { hashPassword } from '../lib/authTokens';
import { requireAdmin, resolveAdminCredentials } from './adminAuth';
import { upsertOrgSubscription, setOrgAutopay } from '../middleware/entitlements';
import { uniqueOrgSlug } from '../lib/slug';
import {
    PLANS,
    FEATURE_LABELS,
    isValidPlanId
} from '../lib/planCatalog';
import {
    isBookingPlanId,
    normalizeBookingIndustryId
} from '../lib/bookingIndustryPresets';
import { isActiveBookingIndustryId } from '../lib/bookingIndustriesDb';
import { setOrgBookingIndustry } from '../lib/bookingIndustryHydrate';
import { ensureCrmTables } from '../sales-agent/sales';
import {
    getStripeClient,
    mapRegisteredUser,
    mapConvertedLeadUser,
    mapInviteUser
} from './helpers';

const router = Router();

router.get('/users', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await ensureCrmTables().catch(() => {});
        const { rows } = await query(
            `SELECT DISTINCT ON (u.id)
                    u.id AS user_id, u.email, u.name AS user_name, u.created_at AS user_created_at,
                    u.must_change_password, COALESCE(u.platform_role, 'customer') AS platform_role,
                    o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.trade_type, o.booking_industry_id, o.setup_complete,
                    bi.name AS industry_name, bi.short_name AS industry_short_name,
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
             LEFT JOIN booking_industries bi ON bi.id = o.booking_industry_id
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
             WHERE u.email NOT ILIKE '%@team.localpulse.local'
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
                    bi.name AS industry_name, bi.short_name AS industry_short_name,
                    p.name AS plan_name, p.price_cents, p.currency,
                    s.id AS subscription_id, s.status AS subscription_status,
                    s.current_period_start, s.current_period_end, s.created_at AS subscription_created_at,
                    s.cancel_at_period_end
             FROM portal_invites pi
             LEFT JOIN booking_industries bi ON bi.id = pi.booking_industry_id
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
                    bi.name AS industry_name, bi.short_name AS industry_short_name,
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
             LEFT JOIN booking_industries bi ON bi.id = o.booking_industry_id
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
               AND u.email NOT ILIKE '%@team.localpulse.local'
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
                    bi.name AS industry_name, bi.short_name AS industry_short_name,
                    p.name AS plan_name, p.price_cents, p.currency,
                    s.id AS subscription_id, s.status AS subscription_status,
                    s.current_period_start, s.current_period_end, s.created_at AS subscription_created_at,
                    s.cancel_at_period_end
             FROM portal_invites pi
             LEFT JOIN booking_industries bi ON bi.id = pi.booking_industry_id
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
        if (role === 'customer' && bookingIndustryId) {
            const ok = await isActiveBookingIndustryId(bookingIndustryId);
            if (!ok) {
                return res.status(400).json({
                    error: 'Unknown or inactive booking industry. Add it under Admin → Industries first.'
                });
            }
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
        if (String(user.email || '').toLowerCase().includes('@team.localpulse.local')) {
            return res.status(400).json({
                error: 'Booking team members are managed in the client Team section, not Admin Users.'
            });
        }
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

export default router;
