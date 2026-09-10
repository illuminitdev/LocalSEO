import { Router, Request, Response } from 'express';
import { requireSalesAgent } from '../middleware/auth';
import { comparePassword, hashPassword } from '../lib/authTokens';
import { query } from '../lib/db';
import {
    CALL_OUTCOMES,
    getAssignedLead,
    listAssignedLeads,
    logCall,
    updateAssignedLead,
    type CallOutcome,
    type LeadStatus
} from '../lib/sales';

const router = Router();

router.use(requireSalesAgent);

router.get('/me', async (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatar_url || '',
            platformRole: user.platform_role || 'sales_agent',
            mustChangePassword: Boolean(user.must_change_password)
        }
    });
});

router.patch('/password', async (req: Request, res: Response) => {
    try {
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const userId = (req as any).user.id;
        const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });

        const ok = await comparePassword(currentPassword, rows[0].password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

        const passwordHash = await hashPassword(newPassword);
        await query(
            `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
            [passwordHash, userId]
        );
        res.json({ success: true, message: 'Password updated.', mustChangePassword: false });
    } catch (err: any) {
        console.error('Sales password error:', err);
        res.status(500).json({ error: err.message || 'Could not update password' });
    }
});

router.get('/leads', async (req: Request, res: Response) => {
    try {
        const agentId = (req as any).user.id;
        const status = req.query.status ? String(req.query.status) : undefined;
        const followUpToday =
            String(req.query.followUpToday || '') === '1' ||
            String(req.query.followUpToday || '').toLowerCase() === 'true';
        const leads = await listAssignedLeads(agentId, { status, followUpToday });
        res.json({ leads });
    } catch (err: any) {
        console.error('Sales list leads error:', err);
        res.status(500).json({ error: err.message || 'Failed to load leads' });
    }
});

router.get('/leads/:id', async (req: Request, res: Response) => {
    try {
        const detail = await getAssignedLead(String(req.params.id), (req as any).user.id);
        if (!detail) return res.status(404).json({ error: 'Lead not found' });
        res.json(detail);
    } catch (err: any) {
        console.error('Sales get lead error:', err);
        res.status(500).json({ error: err.message || 'Failed to load lead' });
    }
});

router.post('/leads/:id/calls', async (req: Request, res: Response) => {
    try {
        const outcome = String(req.body?.outcome || '').trim() as CallOutcome;
        if (!CALL_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ error: 'Valid call outcome is required.' });
        }
        const status = req.body?.status ? (String(req.body.status) as LeadStatus) : null;
        const nextFollowUpAt =
            req.body?.nextFollowUpAt != null && String(req.body.nextFollowUpAt).trim()
                ? String(req.body.nextFollowUpAt).trim()
                : req.body?.nextFollowUpAt === null || req.body?.nextFollowUpAt === ''
                  ? null
                  : undefined;

        const result = await logCall({
            leadId: String(req.params.id),
            agentId: (req as any).user.id,
            outcome,
            notes: req.body?.notes,
            status,
            nextFollowUpAt
        });
        res.status(201).json(result);
    } catch (err: any) {
        console.error('Sales log call error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to log call' });
    }
});

router.patch('/leads/:id', async (req: Request, res: Response) => {
    try {
        const patch: { status?: string; notes?: string; nextFollowUpAt?: string | null } = {};
        if (req.body?.status != null) patch.status = String(req.body.status);
        if (req.body?.notes != null) patch.notes = String(req.body.notes);
        if (req.body?.nextFollowUpAt !== undefined) {
            patch.nextFollowUpAt =
                req.body.nextFollowUpAt == null || req.body.nextFollowUpAt === ''
                    ? null
                    : String(req.body.nextFollowUpAt);
        }

        const lead = await updateAssignedLead(String(req.params.id), (req as any).user.id, patch);
        res.json({ lead });
    } catch (err: any) {
        console.error('Sales update lead error:', err);
        res.status(err.status || 500).json({ error: err.message || 'Failed to update lead' });
    }
});

export default router;
