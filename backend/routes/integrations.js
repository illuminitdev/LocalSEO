const express = require('express');
const { getAuthUrl, handleCallback } = require('../lib/googleCalendar');
const { query } = require('../lib/db');
const { requireHost, resolveHostUserId } = require('../middleware/auth');

const router = express.Router();

router.get('/google/start', requireHost, async (req, res) => {
    try {
        const userId = await resolveHostUserId(req);
        if (!userId) return res.status(400).json({ error: 'Sign in to connect Google Calendar.' });
        const url = getAuthUrl(userId);
        if (!url) return res.status(503).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
        res.json({ url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/google/callback', async (req, res) => {
    try {
        const { code, state: userId } = req.query;
        if (!code || !userId) {
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/settings?tab=integrations&error=oauth`);
        }
        await handleCallback(code, userId);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/settings?tab=integrations&connected=1`);
    } catch (err) {
        console.error('Google callback error:', err);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/settings?tab=integrations&error=oauth`);
    }
});

router.get('/google/status', requireHost, async (req, res) => {
    try {
        const userId = await resolveHostUserId(req);
        if (!userId) return res.json({ connected: false });
        const { rows } = await query(
            'SELECT connected_at, calendar_id FROM calendar_connections WHERE user_id = $1',
            [userId]
        );
        res.json({ connected: rows.length > 0, connectedAt: rows[0]?.connected_at, calendarId: rows[0]?.calendar_id });
    } catch (err) {
        console.error('Google status error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
