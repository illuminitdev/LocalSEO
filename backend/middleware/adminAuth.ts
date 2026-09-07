import { verifyToken } from '../lib/authTokens';

/**
 * Admin credentials: password only from env (never hardcoded).
 * Email is always stage-locked (.net on dev, .com on prod) so a shared
 * backend/.env ADMIN_EMAIL cannot bleed the wrong address into the other stage.
 */
function resolveAdminCredentials() {
    const stage = (process.env.STAGE || 'dev').toLowerCase();

    const email = stage === 'prod' ? 'admin@localseo.com' : 'admin@localseo.net';

    return {
        stage,
        email,
        password: String(process.env.ADMIN_PASSWORD || ''),
        passwordHash: String(process.env.ADMIN_PASSWORD_HASH || '')
    };
}

function adminConfigured() {
    const c = resolveAdminCredentials();
    return Boolean(c.email && (c.password || c.passwordHash));
}

async function requireAdmin(req: any, res: any, next: any) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Admin login required' });

        const decoded: any = verifyToken(token);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access only' });
        }

        const { stage, email } = resolveAdminCredentials();
        if (decoded.stage && decoded.stage !== stage) {
            return res.status(403).json({ error: 'Admin session is for a different environment' });
        }
        if (decoded.email && String(decoded.email).toLowerCase() !== email) {
            return res.status(403).json({ error: 'Admin session is for a different environment' });
        }

        req.admin = { email: decoded.email, role: 'admin', stage };
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired admin session' });
    }
}

export { requireAdmin, adminConfigured, resolveAdminCredentials };
