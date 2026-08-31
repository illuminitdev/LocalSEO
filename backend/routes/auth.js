const express = require('express');
const { createHash, randomBytes } = require('crypto');
const { query } = require('../lib/db');
const { hashPassword, comparePassword, signToken } = require('../lib/authTokens');
const { uniqueOrgSlug } = require('../lib/slug');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/bookingEmail');

const router = express.Router();

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function hashResetToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

router.post('/register', async (req, res) => {
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

router.post('/forgot-password', async (req, res) => {
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
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: err.message || 'Could not process request' });
    }
});

router.post('/reset-password', async (req, res) => {
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
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, row.user_id]);
        await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
        await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2', [row.user_id, row.id]);

        res.json({ success: true, message: 'Password updated. You can sign in now.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: err.message || 'Could not reset password' });
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

router.patch('/profile', requireAuth, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Name is required.' });

        const { rows } = await query(
            `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name`,
            [name, req.user.id]
        );
        res.json({ user: rows[0] });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: err.message || 'Could not update profile' });
    }
});

router.patch('/password', requireAuth, async (req, res) => {
    try {
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }

        const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });

        const ok = await comparePassword(currentPassword, rows[0].password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

        const passwordHash = await hashPassword(newPassword);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
        res.json({ success: true, message: 'Password updated.' });
    } catch (err) {
        console.error('Update password error:', err);
        res.status(500).json({ error: err.message || 'Could not update password' });
    }
});

module.exports = router;
