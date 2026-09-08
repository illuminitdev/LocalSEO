import { Router, Request, Response } from 'express';
import { getAuthUrl, handleCallback } from '../lib/googleCalendar';
import { query } from '../lib/db';
import { requireHost, resolveHostUserId } from '../middleware/auth';
import { requireFeature } from '../middleware/entitlements';
import {
    disconnectQbo,
    getOrgQboStatus,
    getQboAuthUrl,
    handleQboCallback,
    qboStatus
} from '../lib/qbo';

const router = Router();

router.get('/google/start', requireHost, requireFeature('bookings'), async (req: Request, res: Response) => {
    try {
        const userId = await resolveHostUserId(req);
        if (!userId) return res.status(400).json({ error: 'Sign in to connect Google Calendar.' });
        const url = getAuthUrl(userId);
        if (!url) return res.status(503).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
        res.json({ url });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/google/callback', async (req: Request, res: Response) => {
    try {
        const { code, state: userId } = req.query;
        if (!code || !userId) {
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/settings?tab=integrations&error=oauth`);
        }
        await handleCallback(String(code), String(userId));
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/settings?tab=integrations&connected=1`);
    } catch (err: any) {
        console.error('Google callback error:', err);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/settings?tab=integrations&error=oauth`);
    }
});

router.get('/google/status', requireHost, requireFeature('bookings'), async (req: Request, res: Response) => {
    try {
        const userId = await resolveHostUserId(req);
        if (!userId) return res.json({ connected: false });
        const { rows } = await query(
            'SELECT connected_at, calendar_id FROM calendar_connections WHERE user_id = $1',
            [userId]
        );
        res.json({ connected: rows.length > 0, connectedAt: rows[0]?.connected_at, calendarId: rows[0]?.calendar_id });
    } catch (err: any) {
        console.error('Google status error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/qbo/status', requireHost, requireFeature('bookings'), async (req: Request, res: Response) => {
    try {
        const status = await getOrgQboStatus((req as any).orgId);
        res.json(status);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/qbo/start', requireHost, requireFeature('bookings'), async (req: Request, res: Response) => {
    try {
        if (!qboStatus().configured) {
            return res.status(503).json({
                error: 'QuickBooks not configured. Set QBO_CLIENT_ID and QBO_CLIENT_SECRET.'
            });
        }
        const url = getQboAuthUrl((req as any).orgId);
        if (!url) return res.status(503).json({ error: 'QuickBooks OAuth not available' });
        res.json({ url });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/qbo/callback', async (req: Request, res: Response) => {
    const front = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const code = String(req.query.code || '');
        const realmId = String(req.query.realmId || '');
        const orgId = String(req.query.state || '');
        if (!code || !realmId || !orgId) {
            return res.redirect(`${front}/booking/settings?tab=integrations&error=qbo`);
        }
        await handleQboCallback(code, realmId, orgId);
        res.redirect(`${front}/booking/settings?tab=integrations&qbo=1`);
    } catch (err: any) {
        console.error('QBO callback error:', err);
        res.redirect(`${front}/booking/settings?tab=integrations&error=qbo`);
    }
});

router.post('/qbo/disconnect', requireHost, requireFeature('bookings'), async (req: Request, res: Response) => {
    try {
        await disconnectQbo((req as any).orgId);
        res.json({ connected: false });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
