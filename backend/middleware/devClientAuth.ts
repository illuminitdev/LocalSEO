import { query } from '../lib/db';
import { hashPassword, comparePassword } from '../lib/authTokens';
import { uniqueOrgSlug } from '../lib/slug';
import { loadOrgEntitlements, upsertOrgSubscription } from './entitlements';

/** Temporary dev-only portal login for testing plan-gated services (never enabled on prod). */
function resolveDevClientCredentials() {
    const stage = (process.env.STAGE || 'dev').toLowerCase();
    if (stage !== 'dev') {
        return { stage, email: '', password: '', planId: '' };
    }

    return {
        stage,
        email: String(process.env.DEV_CLIENT_EMAIL || 'client@email.com').trim().toLowerCase(),
        password: String(process.env.DEV_CLIENT_PASSWORD || 'client@123'),
        planId: String(process.env.DEV_CLIENT_PLAN_ID || 'complete-growth-system').trim()
    };
}

function devClientConfigured() {
    const { stage, email, password } = resolveDevClientCredentials();
    return stage === 'dev' && Boolean(email && password);
}

function isDevClientLogin(email: string, password: string) {
    if (!devClientConfigured()) return false;
    const creds = resolveDevClientCredentials();
    return email === creds.email && password === creds.password;
}

async function ensureDevClientAccount() {
    const { email, password, planId } = resolveDevClientCredentials();

    let userRes = await query(
        `SELECT id, email, name, password_hash, must_change_password
         FROM users WHERE email = $1`,
        [email]
    );

    let user = userRes.rows[0];
    if (!user) {
        const passwordHash = await hashPassword(password);
        userRes = await query(
            `INSERT INTO users (email, password_hash, name, must_change_password)
             VALUES ($1, $2, $3, FALSE)
             RETURNING id, email, name, password_hash, must_change_password`,
            [email, passwordHash, 'Dev Client']
        );
        user = userRes.rows[0];
    } else {
        const ok = await comparePassword(password, user.password_hash);
        if (!ok) return null;
    }

    let orgRes = await query(
        `SELECT o.id, o.slug, o.name
         FROM memberships m
         JOIN organizations o ON o.id = m.org_id
         WHERE m.user_id = $1
         LIMIT 1`,
        [user.id]
    );

    let org = orgRes.rows[0];
    if (!org) {
        const orgSlug = await uniqueOrgSlug('Dev Client Business', query);
        orgRes = await query(
            `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, setup_complete)
             VALUES ($1, $2, $3, '', '', '', $4, FALSE)
             RETURNING id, slug, name`,
            [orgSlug, 'Dev Client Business', 'Dev Client', email]
        );
        org = orgRes.rows[0];
        await query('INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)', [
            user.id,
            org.id,
            'owner'
        ]);
    } else {
        // Booking board stays on setup until they complete the wizard (service + details).
        const { rows: types } = await query('SELECT id FROM event_types WHERE org_id = $1 LIMIT 1', [org.id]);
        if (!types.length) {
            await query(
                `UPDATE organizations
                 SET setup_complete = FALSE, trade_type = COALESCE(NULLIF(trade_type, ''), '')
                 WHERE id = $1 AND (setup_complete = TRUE OR trade_type = '')`,
                [org.id]
            );
        }
    }

    const entitlements = await loadOrgEntitlements(org.id, email);
    if (entitlements.planId !== planId || !entitlements.features.length) {
        await upsertOrgSubscription(org.id, planId);
    }

    return { user, org };
}

export {
    resolveDevClientCredentials,
    devClientConfigured,
    isDevClientLogin,
    ensureDevClientAccount
};
