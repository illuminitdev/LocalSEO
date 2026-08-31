const express = require('express');
const { query } = require('../lib/db');
const { hashPassword, comparePassword, signToken } = require('../lib/authTokens');
const { uniqueOrgSlug, uniqueEventSlug } = require('../lib/slug');
const { requireAuth } = require('../middleware/auth');
const { seedDefaultEventTypes } = require('../lib/seed');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { email, password, name, businessName, tradeType, phone, serviceArea } = req.body || {};
        if (!email || !password || !name || !businessName) {
            return res.status(400).json({ error: 'Email, password, name, and business name are required.' });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const existing = await query('SELECT id FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
        if (existing.rows.length) return res.status(409).json({ error: 'Email already registered.' });

        const passwordHash = await hashPassword(password);
        const userRes = await query(
            `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name`,
            [String(email).trim().toLowerCase(), passwordHash, String(name).trim()]
        );
        const user = userRes.rows[0];

        const orgSlug = await uniqueOrgSlug(businessName, query);
        const orgRes = await query(
            `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, setup_complete)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING id, slug, name`,
            [orgSlug, String(businessName).trim(), String(name).trim(), String(tradeType || '').trim(), String(phone || '').trim(), String(serviceArea || '').trim(), user.email]
        );
        const org = orgRes.rows[0];

        await query('INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)', [user.id, org.id, 'owner']);
        await seedDefaultEventTypes(org.id);

        const token = signToken({ userId: user.id, orgId: org.id });
        res.status(201).json({
            token,
            user: { id: user.id, email: user.email, name: user.name },
            organization: { id: org.id, slug: org.slug, name: org.name }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: err.message || 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

        const { rows } = await query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
        if (!rows.length) return res.status(401).json({ error: 'Invalid email or password.' });

        const user = rows[0];
        const ok = await comparePassword(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

        const orgRes = await query(
            `SELECT o.id, o.slug, o.name FROM memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = $1 LIMIT 1`,
            [user.id]
        );
        const org = orgRes.rows[0];
        const token = signToken({ userId: user.id, orgId: org?.id });

        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name },
            organization: org || null
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message || 'Login failed' });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    const { rows: orgRows } = await query('SELECT * FROM organizations WHERE id = $1', [req.orgId]);
    const org = orgRows[0];
    const { rows: eventTypes } = await query(
        'SELECT * FROM event_types WHERE org_id = $1 ORDER BY sort_order, created_at',
        [req.orgId]
    );
    const { rows: cal } = await query('SELECT id, calendar_id, connected_at FROM calendar_connections WHERE user_id = $1', [req.user.id]);

    res.json({
        user: { id: req.user.id, email: req.user.email, name: req.user.name },
        organization: org,
        eventTypes,
        googleCalendarConnected: cal.length > 0,
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
    });
});

module.exports = router;
