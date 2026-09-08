import { randomBytes } from 'crypto';
import { query } from './db';
import { sendMail } from './bookingEmail';

const SEAT_SOFT_LIMIT = 25;

function frontendOrigin() {
    return String(process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(
        /\/$/,
        ''
    );
}

export async function listTeamMembers(orgId: string) {
    // memberships PK is (user_id, org_id) — no surrogate id / created_at columns
    const { rows } = await query(
        `SELECT m.user_id AS membership_id, m.user_id, m.role, COALESCE(m.active, TRUE) AS active,
                u.name, u.email, COALESCE(u.avatar_url, '') AS avatar_url
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1
         ORDER BY u.name ASC, u.email ASC`,
        [orgId]
    );
    return rows;
}

export async function listPendingInvites(orgId: string) {
    const { rows } = await query(
        `SELECT * FROM org_invites WHERE org_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [orgId]
    );
    return rows;
}

export async function createOrgInvite({
    orgId,
    email,
    role,
    invitedBy
}: {
    orgId: string;
    email: string;
    role: string;
    invitedBy: string;
}) {
    const allowed = ['admin', 'dispatcher', 'tech'];
    const r = allowed.includes(role) ? role : 'tech';
    const em = String(email || '')
        .trim()
        .toLowerCase();
    if (!em) throw Object.assign(new Error('Email required'), { status: 400 });

    const members = await listTeamMembers(orgId);
    if (members.filter((m) => m.active !== false).length >= SEAT_SOFT_LIMIT) {
        throw Object.assign(new Error(`Team seat limit (${SEAT_SOFT_LIMIT}) reached`), { status: 400 });
    }

    const token = randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 14 * 86400000);
    const { rows } = await query(
        `INSERT INTO org_invites (org_id, email, role, token, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [orgId, em, r, token, invitedBy, expires.toISOString()]
    );
    const invite = rows[0];
    const link = `${frontendOrigin()}/team/accept?token=${token}`;
    const { rows: orgs } = await query(`SELECT name FROM organizations WHERE id = $1`, [orgId]);
    await sendMail({
        to: em,
        subject: `You're invited to ${orgs[0]?.name || 'the team'}`,
        text: `Join the team: ${link}\n\nThis invite expires in 14 days.`,
        html: `<p>You've been invited as <strong>${r}</strong>.</p><p><a href="${link}">Accept invite</a></p>`
    }).catch(() => null);
    return { invite, link };
}

export async function acceptOrgInvite(token: string, userId: string) {
    const { rows } = await query(
        `SELECT * FROM org_invites WHERE token = $1 AND status = 'pending' LIMIT 1`,
        [token]
    );
    if (!rows.length) throw Object.assign(new Error('Invite not found'), { status: 404 });
    const invite = rows[0];
    if (new Date(invite.expires_at).getTime() < Date.now()) {
        await query(`UPDATE org_invites SET status = 'expired' WHERE id = $1`, [invite.id]);
        throw Object.assign(new Error('Invite expired'), { status: 400 });
    }
    const { rows: users } = await query(`SELECT * FROM users WHERE id = $1`, [userId]);
    if (!users.length) throw Object.assign(new Error('User not found'), { status: 404 });
    if (String(users[0].email).toLowerCase() !== String(invite.email).toLowerCase()) {
        throw Object.assign(new Error('Sign in with the invited email to accept'), { status: 403 });
    }

    const { rows: existing } = await query(
        `SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2`,
        [invite.org_id, userId]
    );
    if (existing[0]) {
        await query(
            `UPDATE memberships SET role = $1, active = TRUE WHERE org_id = $2 AND user_id = $3`,
            [invite.role, invite.org_id, userId]
        );
    } else {
        await query(`INSERT INTO memberships (org_id, user_id, role, active) VALUES ($1, $2, $3, TRUE)`, [
            invite.org_id,
            userId,
            invite.role
        ]);
    }
    await query(`UPDATE org_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`, [invite.id]);
    return { orgId: invite.org_id, role: invite.role };
}

/** membershipId is the member's user_id (memberships has no separate id column). */
export async function updateMemberRole(orgId: string, membershipId: string, role: string, active?: boolean) {
    const allowed = ['owner', 'admin', 'dispatcher', 'tech'];
    if (!allowed.includes(role)) throw Object.assign(new Error('Invalid role'), { status: 400 });
    const { rows } = await query(
        `UPDATE memberships SET role = $1, active = COALESCE($2, active)
         WHERE user_id = $3 AND org_id = $4 RETURNING user_id, org_id, role, active`,
        [role, active == null ? null : Boolean(active), membershipId, orgId]
    );
    if (!rows.length) throw Object.assign(new Error('Member not found'), { status: 404 });
    return rows[0];
}

export async function getMembershipRole(orgId: string, userId: string) {
    const { rows } = await query(
        `SELECT role, COALESCE(active, TRUE) AS active FROM memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
        [orgId, userId]
    );
    return rows[0] || null;
}
