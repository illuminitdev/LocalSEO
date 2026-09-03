#!/usr/bin/env node
/**
 * Seed an active subscription for an organisation.
 * Usage: npm run seed:subscription -- --orgSlug=demo --planId=local-presence
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { migrate, query } from '../lib/db';
import { upsertOrgSubscription } from '../middleware/entitlements';
import { isValidPlanId } from '../lib/planCatalog';

function parseArgs(argv: string[]) {
    const out: Record<string, string> = {};
    for (const arg of argv) {
        const m = arg.match(/^--(\w+)=(.+)$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

async function main() {
    const { orgSlug, planId } = parseArgs(process.argv.slice(2));
    if (!orgSlug || !planId) {
        console.error('Usage: npm run seed:subscription -- --orgSlug=SLUG --planId=PLAN_ID');
        process.exit(1);
    }
    if (!isValidPlanId(planId)) {
        console.error(`Invalid planId: ${planId}`);
        process.exit(1);
    }

    await migrate();

    const { rows } = await query('SELECT id, slug, name FROM organizations WHERE slug = $1', [orgSlug]);
    if (!rows.length) {
        console.error(`Organisation not found for slug: ${orgSlug}`);
        process.exit(1);
    }

    const org = rows[0];
    const result = await upsertOrgSubscription(org.id, planId);
    console.log(`Assigned plan "${result.planName}" (${result.planId}) to org "${org.name}" (${org.slug})`);
    console.log('Features:', result.features.join(', ') || '(none)');
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
