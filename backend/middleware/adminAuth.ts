import { verifyToken } from '../lib/authTokens';

/** Stage-locked admin credentials (dev email never accepted on prod API and vice versa). */
function resolveAdminCredentials() {
    const stage = (process.env.STAGE || 'dev').toLowerCase();

    const email =
        process.env.ADMIN_EMAIL ||
        (stage === 'prod' ? 'admin@localseo.com' : 'admin@localseo.net');

    const password =
        process.env.ADMIN_PASSWORD ||
        (stage === 'prod' || stage === 'dev' ? 'localseo@2026' : '');

    return {
        stage,
        email: String(email).trim().toLowerCase(),
        password: String(password),
        passwordHash: process.env.ADMIN_PASSWORD_HASH || ''
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
