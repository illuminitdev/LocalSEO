import { randomBytes } from 'crypto';
import { query } from './db';
import { hashPassword } from './authTokens';
import { sendMail } from './bookingEmail';

const SEAT_SOFT_LIMIT = 25;
const INVITE_ROLES = ['admin', 'dispatcher', 'tech'] as const;

function isOwnerRole(role: string) {
    return String(role || '')
        .trim()
        .toLowerCase() === 'owner';
}

/** Free-text role for manual members; owner cannot be assigned this way. */
function sanitizeCustomRole(role: string, fallback = 'Staff') {
    const raw = String(role || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
    const value = raw || fallback;
    if (isOwnerRole(value)) {
        throw Object.assign(new Error('Owner role is fixed and cannot be assigned to new members'), {
            status: 400
        });
    }
    return value;
}

function normalizeInviteRole(role: string) {
    const r = String(role || '')
        .trim()
        .toLowerCase();
    return (INVITE_ROLES as readonly string[]).includes(r) ? r : 'tech';
}

function parseTimeToMinutes(timeStr: string) {
    const [h, m] = String(timeStr || '')
        .slice(0, 5)
        .split(':')
        .map(Number);
    if (Number.isNaN(h)) return 0;
    return h * 60 + (m || 0);
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    return parseTimeToMinutes(aStart) < parseTimeToMinutes(bEnd) && parseTimeToMinutes(bStart) < parseTimeToMinutes(aEnd);
}

function frontendOrigin() {
    return String(process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(
        /\/$/,
        ''
    );
}

export async function listTeamMembers(orgId: string) {
    const { rows } = await query(
        // Prefer live users.name (Account settings) over stale membership display_name
        `SELECT m.user_id AS membership_id, m.user_id, m.role, COALESCE(m.active, TRUE) AS active,
                COALESCE(m.bookable, FALSE) AS bookable,
                COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(m.display_name), ''), u.email) AS display_name,
                COALESCE(NULLIF(TRIM(u.name), ''), '') AS name,
                u.email,
                COALESCE(u.avatar_url, '') AS avatar_url,
                CASE
                  WHEN u.email ILIKE '%@team.localpulse.local' THEN TRUE
                  ELSE FALSE
                END AS is_manual
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1
         ORDER BY
           CASE WHEN LOWER(TRIM(m.role)) = 'owner' THEN 0 ELSE 1 END,
           COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(m.display_name), ''), u.email) ASC`,
        [orgId]
    );
    return rows;
}

export async function listBookableMembers(orgId: string) {
    const { rows } = await query(
        `SELECT m.user_id AS id,
                COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(m.display_name), ''), u.email) AS display_name
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1
           AND COALESCE(m.active, TRUE) = TRUE
           AND COALESCE(m.bookable, FALSE) = TRUE
         ORDER BY display_name ASC`,
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
    const r = normalizeInviteRole(role);
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

export async function updateMemberRole(
    orgId: string,
    membershipId: string,
    role: string,
    active?: boolean,
    extras?: { bookable?: boolean; displayName?: string }
) {
    const { rows: currentRows } = await query(
        `SELECT role, COALESCE(active, TRUE) AS active FROM memberships
         WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
        [membershipId, orgId]
    );
    if (!currentRows.length) throw Object.assign(new Error('Member not found'), { status: 404 });
    const current = currentRows[0];
    const currentIsOwner = isOwnerRole(current.role);

    // Owner account is fixed — cannot demote, deactivate, or retitle.
    let nextRole = String(current.role);
    if (currentIsOwner) {
        if (role != null && String(role).trim() && !isOwnerRole(String(role))) {
            throw Object.assign(new Error('Owner role is fixed and cannot be changed'), { status: 400 });
        }
        if (active === false) {
            throw Object.assign(new Error('Owner account cannot be deactivated'), { status: 400 });
        }
        nextRole = 'owner';
    } else {
        nextRole = sanitizeCustomRole(role || current.role);
    }

    const bookable =
        extras?.bookable === undefined ? null : Boolean(extras.bookable);
    const displayName =
        extras?.displayName === undefined ? null : String(extras.displayName || '').trim();

    const { rows } = await query(
        `UPDATE memberships SET
            role = $1,
            active = COALESCE($2, active),
            bookable = COALESCE($3, bookable),
            display_name = COALESCE($4, display_name)
         WHERE user_id = $5 AND org_id = $6
         RETURNING user_id, org_id, role, active, bookable, display_name`,
        [nextRole, active == null ? null : Boolean(active), bookable, displayName, membershipId, orgId]
    );
    if (!rows.length) throw Object.assign(new Error('Member not found'), { status: 404 });

    if (displayName) {
        await query(`UPDATE users SET name = $1 WHERE id = $2`, [displayName, membershipId]);
    }

    return rows[0];
}

/** Full edit for a team member: name, optional email, role (non-owner), bookable. */
export async function updateTeamMemberDetails({
    orgId,
    userId,
    name,
    email,
    role,
    bookable
}: {
    orgId: string;
    userId: string;
    name?: string;
    email?: string | null;
    role?: string;
    bookable?: boolean;
}) {
    const { rows: memRows } = await query(
        `SELECT m.role, COALESCE(m.active, TRUE) AS active, COALESCE(m.bookable, FALSE) AS bookable,
                COALESCE(m.display_name, '') AS display_name,
                u.name, u.email
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 AND m.user_id = $2::uuid
         LIMIT 1`,
        [orgId, userId]
    );
    if (!memRows.length) throw Object.assign(new Error('Member not found'), { status: 404 });
    const current = memRows[0];
    const owner = isOwnerRole(current.role);

    const nextName = String(name != null ? name : current.name || current.display_name || '')
        .trim();
    if (!nextName) throw Object.assign(new Error('Name is required'), { status: 400 });

    let nextRole = String(current.role);
    if (!owner) {
        if (role != null && String(role).trim()) {
            nextRole = sanitizeCustomRole(role);
        }
    } else if (role != null && String(role).trim() && !isOwnerRole(String(role))) {
        throw Object.assign(new Error('Owner role cannot be changed'), { status: 400 });
    }

    let nextEmail = String(current.email || '').trim().toLowerCase();
    if (email !== undefined && !owner) {
        const em = String(email || '')
            .trim()
            .toLowerCase();
        if (em) {
            const { rows: taken } = await query(
                `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2::uuid LIMIT 1`,
                [em, userId]
            );
            if (taken.length) {
                throw Object.assign(new Error('That email is already in use'), { status: 400 });
            }
            nextEmail = em;
        } else if (String(current.email || '').includes('@team.localpulse.local')) {
            // Keep synthetic placeholder when no real email provided
            nextEmail = String(current.email).trim().toLowerCase();
        }
        // If clearing a real email is requested with '', leave existing email (don't blank unique email)
    }

    const nextBookable = bookable === undefined ? Boolean(current.bookable) : Boolean(bookable);

    await query(`UPDATE users SET name = $1, email = $2 WHERE id = $3::uuid`, [
        nextName,
        nextEmail,
        userId
    ]);

    const { rows } = await query(
        `UPDATE memberships SET
            role = $1,
            bookable = $2,
            display_name = $3
         WHERE org_id = $4 AND user_id = $5::uuid
         RETURNING user_id, org_id, role, active, bookable, display_name`,
        [nextRole, nextBookable, nextName, orgId, userId]
    );

    const { rows: fresh } = await query(
        `SELECT m.user_id AS membership_id, m.user_id, m.role, COALESCE(m.active, TRUE) AS active,
                COALESCE(m.bookable, FALSE) AS bookable,
                COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(m.display_name), ''), u.email) AS display_name,
                COALESCE(NULLIF(TRIM(u.name), ''), '') AS name,
                u.email,
                COALESCE(u.avatar_url, '') AS avatar_url,
                CASE WHEN u.email ILIKE '%@team.localpulse.local' THEN TRUE ELSE FALSE END AS is_manual
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 AND m.user_id = $2::uuid
         LIMIT 1`,
        [orgId, userId]
    );

    return {
        membership: rows[0],
        member: fresh[0] || {
            membership_id: userId,
            user_id: userId,
            role: nextRole,
            active: current.active !== false,
            bookable: nextBookable,
            display_name: nextName,
            name: nextName,
            email: nextEmail,
            avatar_url: '',
            is_manual: nextEmail.includes('@team.localpulse.local')
        }
    };
}

/** Add a team member immediately (no invite email / accept step). Persists user + membership. */
export async function createManualMember({
    orgId,
    name,
    email,
    role,
    bookable = true
}: {
    orgId: string;
    name: string;
    email?: string;
    role?: string;
    bookable?: boolean;
}) {
    const displayName = String(name || '').trim();
    if (!displayName) throw Object.assign(new Error('Name is required'), { status: 400 });

    const members = await listTeamMembers(orgId);
    if (members.filter((m) => m.active !== false).length >= SEAT_SOFT_LIMIT) {
        throw Object.assign(new Error(`Team seat limit (${SEAT_SOFT_LIMIT}) reached`), { status: 400 });
    }

    const r = sanitizeCustomRole(role || 'Staff');
    let em = String(email || '')
        .trim()
        .toLowerCase();

    let userId: string | null = null;
    if (em) {
        const { rows: existing } = await query(`SELECT id, name FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [
            em
        ]);
        if (existing[0]) {
            userId = existing[0].id;
            const { rows: mem } = await query(
                `SELECT user_id FROM memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
                [orgId, userId]
            );
            if (mem.length) {
                throw Object.assign(new Error('This person is already on the team'), { status: 400 });
            }
            if (!String(existing[0].name || '').trim()) {
                await query(`UPDATE users SET name = $1 WHERE id = $2`, [displayName, userId]);
            }
        }
    } else {
        em = `staff-${randomBytes(8).toString('hex')}@team.localpulse.local`;
    }

    if (!userId) {
        const passwordHash = await hashPassword(randomBytes(24).toString('hex'));
        const { rows } = await query(
            `INSERT INTO users (email, password_hash, name)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [em, passwordHash, displayName]
        );
        userId = rows[0].id;
    }

    const { rows: membershipRows } = await query(
        `INSERT INTO memberships (org_id, user_id, role, active, bookable, display_name)
         VALUES ($1, $2, $3, TRUE, $4, $5)
         RETURNING user_id, org_id, role, active, bookable, display_name`,
        [orgId, userId, r, Boolean(bookable), displayName]
    );

    return {
        membership: membershipRows[0],
        member: {
            membership_id: userId,
            user_id: userId,
            role: r,
            active: true,
            bookable: Boolean(bookable),
            display_name: displayName,
            name: displayName,
            email: em,
            avatar_url: ''
        }
    };
}

export async function removeTeamMember(orgId: string, userId: string) {
    const { rows: current } = await query(
        `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2::uuid LIMIT 1`,
        [orgId, userId]
    );
    if (!current.length) throw Object.assign(new Error('Member not found'), { status: 404 });
    if (isOwnerRole(current[0].role)) {
        throw Object.assign(new Error('Owner account cannot be removed from the team'), { status: 400 });
    }

    const { rows } = await query(
        `DELETE FROM memberships WHERE org_id = $1 AND user_id = $2::uuid
         RETURNING user_id`,
        [orgId, userId]
    );
    if (!rows.length) throw Object.assign(new Error('Member not found'), { status: 404 });

    await query(`DELETE FROM availability_rules WHERE org_id = $1 AND user_id = $2::uuid`, [orgId, userId]);
    await query(`DELETE FROM availability_date_rules WHERE org_id = $1 AND user_id = $2::uuid`, [orgId, userId]);
    return { success: true };
}

export type WeeklyRuleInput = {
    dayOfWeek?: number;
    day_of_week?: number;
    startTime?: string;
    start_time?: string;
    endTime?: string;
    end_time?: string;
    enabled?: boolean;
};

export async function listMemberWeeklySchedules(orgId: string) {
    const members = await listTeamMembers(orgId);
    const { rows: rules } = await query(
        `SELECT user_id, day_of_week, start_time, end_time, enabled
         FROM availability_rules
         WHERE org_id = $1 AND user_id IS NOT NULL
         ORDER BY day_of_week, start_time`,
        [orgId]
    );
    const byUser = new Map<string, typeof rules>();
    for (const rule of rules) {
        const uid = String(rule.user_id);
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid)!.push(rule);
    }
    return members.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name || m.name || m.email,
        bookable: Boolean(m.bookable),
        active: m.active !== false,
        weeklyRules: (byUser.get(String(m.user_id)) || []).map((r) => ({
            dayOfWeek: Number(r.day_of_week),
            startTime: String(r.start_time).slice(0, 5),
            endTime: String(r.end_time).slice(0, 5),
            enabled: r.enabled !== false
        }))
    }));
}

/** Warn when proposed member hours overlap another teammate on the same weekday. */
export async function findMemberAvailabilityOverlaps(
    orgId: string,
    userId: string,
    weeklyRules: WeeklyRuleInput[]
) {
    const proposed = (weeklyRules || [])
        .map((r) => ({
            dayOfWeek: Number(r.dayOfWeek ?? r.day_of_week),
            startTime: String(r.startTime || r.start_time || '').slice(0, 5),
            endTime: String(r.endTime || r.end_time || '').slice(0, 5),
            enabled: r.enabled !== false
        }))
        .filter(
            (r) =>
                r.enabled &&
                !Number.isNaN(r.dayOfWeek) &&
                r.dayOfWeek >= 0 &&
                r.dayOfWeek <= 6 &&
                r.startTime &&
                r.endTime &&
                parseTimeToMinutes(r.endTime) > parseTimeToMinutes(r.startTime)
        );

    if (!proposed.length) return [];

    const schedules = await listMemberWeeklySchedules(orgId);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const overlaps: Array<{
        memberUserId: string;
        memberName: string;
        dayOfWeek: number;
        dayName: string;
        theirStart: string;
        theirEnd: string;
        yourStart: string;
        yourEnd: string;
        message: string;
    }> = [];

    for (const other of schedules) {
        if (String(other.userId) === String(userId) || !other.active) continue;
        for (const theirs of other.weeklyRules) {
            if (!theirs.enabled) continue;
            for (const yours of proposed) {
                if (yours.dayOfWeek !== theirs.dayOfWeek) continue;
                if (!timesOverlap(yours.startTime, yours.endTime, theirs.startTime, theirs.endTime)) continue;
                const dayName = dayNames[yours.dayOfWeek] || `Day ${yours.dayOfWeek}`;
                overlaps.push({
                    memberUserId: String(other.userId),
                    memberName: other.displayName,
                    dayOfWeek: yours.dayOfWeek,
                    dayName,
                    theirStart: theirs.startTime,
                    theirEnd: theirs.endTime,
                    yourStart: yours.startTime,
                    yourEnd: yours.endTime,
                    message: `${dayName} ${yours.startTime}–${yours.endTime} overlaps with ${other.displayName} (${theirs.startTime}–${theirs.endTime}).`
                });
            }
        }
    }
    return overlaps;
}

export async function getMembershipRole(orgId: string, userId: string) {
    const { rows } = await query(
        `SELECT role, COALESCE(active, TRUE) AS active FROM memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
        [orgId, userId]
    );
    return rows[0] || null;
}
