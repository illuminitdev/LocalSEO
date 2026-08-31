/**
 * One-time migration from backend/data/app-state.json to Postgres.
 * Run: node scripts/migrate-app-state.js (requires DATABASE_URL + existing user/org)
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { migrate, query } = require('../lib/db');
const { hashPassword } = require('../lib/authTokens');
const { uniqueOrgSlug, uniqueEventSlug } = require('../lib/slug');

async function main() {
    await migrate();
    const file = path.join(__dirname, '..', 'data', 'app-state.json');
    if (!fs.existsSync(file)) {
        console.log('No app-state.json found — nothing to migrate.');
        process.exit(0);
    }
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const bs = state.bookingState;
    if (!bs?.businessName) {
        console.log('No booking state in file.');
        process.exit(0);
    }

    const email = process.env.MIGRATE_EMAIL || 'owner@localpulse.dev';
    const password = process.env.MIGRATE_PASSWORD || 'changeme123';
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
        console.log('User already exists — skip migration or use different MIGRATE_EMAIL');
        process.exit(0);
    }

    const passwordHash = await hashPassword(password);
    const userRes = await query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id',
        [email, passwordHash, bs.name || 'Owner']
    );
    const userId = userRes.rows[0].id;
    const orgSlug = await uniqueOrgSlug(bs.businessName, query);
    const orgRes = await query(
        `INSERT INTO organizations (slug, name, trade_type, phone, service_area, email)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [orgSlug, bs.businessName, bs.tradeType || '', bs.phone || '', bs.serviceArea || '', email]
    );
    const orgId = orgRes.rows[0].id;
    await query('INSERT INTO memberships (user_id, org_id, role) VALUES ($1,$2,$3)', [userId, orgId, 'owner']);

    const eventSlug = await uniqueEventSlug(orgId, bs.tradeType || 'standard-visit', query);
    const etRes = await query(
        `INSERT INTO event_types (org_id, slug, name, duration_minutes, deposit_cents, total_cents)
         VALUES ($1,$2,$3,60,$4,$5) RETURNING id`,
        [orgId, eventSlug, bs.tradeType || 'Standard Visit', Math.round((bs.deposit || 45) * 100), 15000]
    );
    const eventTypeId = etRes.rows[0].id;

    if (Array.isArray(bs.slots)) {
        for (const s of bs.slots) {
            if (!s.enabled) continue;
            await query(
                `INSERT INTO availability_rules (org_id, day_of_week, start_time, end_time, enabled)
                 VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT DO NOTHING`,
                [orgId, s.dayOfWeek, s.startTime, s.endTime]
            );
        }
    }

    console.log(`Migrated to org slug: ${orgSlug}, login: ${email}`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
