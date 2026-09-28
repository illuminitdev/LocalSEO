import { Router, Request, Response } from 'express';
import { query } from '../lib/db';
import { signToken, hashPassword } from '../lib/authTokens';
import { requireAdmin, adminConfigured, resolveAdminCredentials } from './adminAuth';
import {
    PLANS,
    FEATURE_LABELS,
    getFeaturesForPlan,
    formatPrice
} from '../lib/planCatalog';
import { PRODUCTS, verifyAdminPassword } from './helpers';

const router = Router();

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
    let avatarUrl = '';
    try {
        const { rows } = await query(
            `SELECT updated_at, COALESCE(avatar_url, '') AS avatar_url
             FROM admin_settings WHERE id = 'default' LIMIT 1`
        );
        passwordUpdatedAt = rows[0]?.updated_at || null;
        avatarUrl = rows[0]?.avatar_url || '';
    } catch {
        
    }
    res.json({
        admin: (req as any).admin,
        products: PRODUCTS,
        stage: resolveAdminCredentials().stage,
        email: resolveAdminCredentials().email,
        avatarUrl,
        passwordUpdatedAt,
        passwordSource: passwordUpdatedAt ? 'custom' : 'env'
    });
});

router.post('/settings/avatar/presign', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { createUploadPresign } = await import('../lib/media');
        const data = await createUploadPresign({
            kind: 'avatar',
            contentType: String(req.body?.contentType || 'image/jpeg'),
            userId: 'admin'
        });
        res.json(data);
    } catch (err: any) {
        res.status(err.status || 500).json({ error: err.message || 'Presign failed' });
    }
});

router.patch('/settings/avatar', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { isAllowedMediaUrl } = await import('../lib/media');
        const raw = req.body?.avatarUrl != null ? String(req.body.avatarUrl).trim() : '';
        if (raw && !isAllowedMediaUrl(raw)) {
            return res.status(400).json({ error: 'Invalid avatar URL.' });
        }

        await query(
            `INSERT INTO admin_settings (id, password_hash, avatar_url, updated_at)
             VALUES ('default', '', $1, NOW())
             ON CONFLICT (id) DO UPDATE
             SET avatar_url = EXCLUDED.avatar_url`,
            [raw]
        );

        res.json({ success: true, avatarUrl: raw });
    } catch (err: any) {
        console.error('Admin avatar update error:', err);
        res.status(500).json({ error: err.message || 'Could not update avatar' });
    }
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

export default router;
