import { query } from './db';
import { uniqueOrgSlug, uniqueEventSlug } from './slug';

async function seedDefaultAvailability(_orgId: any) {
    // Engineers configure their own hours in booking settings — no default slots.
}

async function seedDefaultEventTypes(orgId: any, { standardDepositCents = 4500, emergencyDepositCents = 6000, acceptingEmergencies = true }: any = {}) {
    const standardSlug = await uniqueEventSlug(orgId, 'standard-visit', query);
    await query(
        `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, sort_order)
         VALUES ($1, $2, 'Standard Visit', 'Regular scheduled appointment', 60, $3, $4, 0)`,
        [orgId, standardSlug, standardDepositCents, standardDepositCents]
    );
    if (acceptingEmergencies) {
        const emergencySlug = await uniqueEventSlug(orgId, 'emergency-callout', query);
        await query(
            `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, sort_order)
             VALUES ($1, $2, 'Emergency Callout', 'Urgent same-day service', 90, $3, $4, 1)`,
            [orgId, emergencySlug, emergencyDepositCents, emergencyDepositCents]
        );
    }
}

async function createBookingOrg({
    hostName,
    businessName,
    tradeType,
    phone,
    serviceArea,
    standardDeposit = 45,
    emergencyDeposit = 60,
    currency = 'GBP',
    acceptingEmergencies = true,
    emergencyNote = '',
    email = '',
    orgId = null
}: any) {
    const standardDepositCents = Math.round(Number(standardDeposit) * 100) || 4500;
    const emergencyDepositCents = Math.round(Number(emergencyDeposit) * 100) || 6000;
    const currencyCode = currency === '£' || currency === 'GBP' ? 'GBP' : currency === '€' || currency === 'EUR' ? 'EUR' : 'USD';

    let org: any;
    if (orgId) {
        const orgRes = await query(
            `UPDATE organizations SET
              name = $1, host_name = $2, trade_type = $3, phone = $4, service_area = $5,
              email = COALESCE(NULLIF($6, ''), email), currency = $7,
              accepting_emergencies = $8, emergency_note = $9, setup_complete = TRUE,
              slug = CASE WHEN slug LIKE 'my-business%' OR name = 'My business' THEN $10 ELSE slug END
             WHERE id = $11 RETURNING *`,
            [
                String(businessName).trim(),
                String(hostName).trim(),
                String(tradeType).trim(),
                String(phone || '').trim(),
                String(serviceArea || '').trim(),
                String(email || '').trim(),
                currencyCode,
                acceptingEmergencies !== false,
                String(emergencyNote || '').trim(),
                await uniqueOrgSlug(businessName, query),
                orgId
            ]
        );
        org = orgRes.rows[0];
        if (!org) throw new Error('Organization not found');
        const { rows: existingTypes } = await query('SELECT id FROM event_types WHERE org_id = $1 LIMIT 1', [org.id]);
        if (!existingTypes.length) {
            await seedDefaultEventTypes(org.id, {
                standardDepositCents,
                emergencyDepositCents,
                acceptingEmergencies: acceptingEmergencies !== false
            });
        }
        return org;
    }

    const orgSlug = await uniqueOrgSlug(businessName, query);
    const orgRes = await query(
        `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, currency,
          accepting_emergencies, emergency_note, setup_complete)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE) RETURNING *`,
        [
            orgSlug,
            String(businessName).trim(),
            String(hostName).trim(),
            String(tradeType).trim(),
            String(phone || '').trim(),
            String(serviceArea || '').trim(),
            String(email || '').trim(),
            currencyCode,
            acceptingEmergencies !== false,
            String(emergencyNote || '').trim()
        ]
    );
    org = orgRes.rows[0];
    await seedDefaultEventTypes(org.id, {
        standardDepositCents,
        emergencyDepositCents,
        acceptingEmergencies: acceptingEmergencies !== false
    });
    return org;
}

export {
    seedDefaultAvailability,
    seedDefaultEventTypes,
    createBookingOrg
};
