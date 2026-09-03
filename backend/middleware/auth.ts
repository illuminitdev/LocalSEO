import { verifyToken } from '../lib/authTokens';
import { query } from '../lib/db';

function authRequired() {
    return process.env.AUTH_REQUIRED === 'true';
}

async function attachUserFromToken(req: any, token: string) {
    const decoded: any = verifyToken(token);
    const { rows } = await query(
        `SELECT u.id, u.email, u.name, u.must_change_password,
                m.org_id, m.role, o.slug AS org_slug, o.name AS org_name
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         JOIN organizations o ON o.id = m.org_id
         WHERE u.id = $1
         LIMIT 1`,
        [decoded.userId]
    );
    if (!rows.length) return false;
    req.user = rows[0];
    req.orgId = rows[0].org_id;
    return true;
}

async function attachOrgBySlug(req: any, slug: string) {
    const { rows } = await query('SELECT id, slug, setup_complete FROM organizations WHERE slug = $1', [slug]);
    if (!rows.length) return false;
    req.orgId = rows[0].id;
    req.orgSlug = rows[0].slug;
    req.orgSetupComplete = rows[0].setup_complete;
    return true;
}

/** Host routes: JWT, or X-Booking-Org slug from browser after setup wizard. */
async function requireHost(req: any, res: any, next: any) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
        if (token) {
            try {
                if (await attachUserFromToken(req, token)) return next();
            } catch {
                if (authRequired()) return res.status(401).json({ error: 'Invalid or expired session' });
            }
        }

        const orgSlug = String(req.headers['x-booking-org'] || '').trim();
        if (!authRequired() && orgSlug && (await attachOrgBySlug(req, orgSlug))) {
            return next();
        }

        if (authRequired()) {
            return res.status(401).json({ error: 'Login required' });
        }

        req.orgId = null;
        next();
    } catch (err: any) {
        console.error('requireHost error:', err);
        res.status(500).json({ error: err.message || 'Auth failed' });
    }
}

async function requireAuth(req: any, res: any, next: any) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
        if (!token) return res.status(401).json({ error: 'Login required' });
        if (!(await attachUserFromToken(req, token))) {
            return res.status(401).json({ error: 'Invalid session' });
        }
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }
}

async function resolveHostUserId(req: any) {
    if (req.user?.id) return req.user.id;
    if (!req.orgId) return null;
    const { rows } = await query(
        `SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
        [req.orgId]
    );
    return rows[0]?.user_id || null;
}

export { requireAuth, requireHost, authRequired, resolveHostUserId };
