const { query } = require('./db');
const { hashPassword } = require('./authTokens');
const { uniqueOrgSlug, uniqueEventSlug } = require('./slug');

async function seedDefaultAvailability(_orgId) {
    // Engineers configure their own hours in booking settings — no default slots.
}

async function seedDefaultEventTypes(orgId, { standardDepositCents = 4500, emergencyDepositCents = 6000, acceptingEmergencies = true } = {}) {
    const standardSlug = await uniqueEventSlug(orgId, 'standard-visit', query);
    await query(
        `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, sort_order)
         VALUES ($1, $2, 'Standard Visit', 'Regular scheduled appointment', 60, $3, $4, 0)`,
        [orgId, standardSlug, standardDepositCents, Math.round(standardDepositCents * 3.33)]
    );
    if (acceptingEmergencies) {
        const emergencySlug = await uniqueEventSlug(orgId, 'emergency-callout', query);
        await query(
            `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, sort_order)
             VALUES ($1, $2, 'Emergency Callout', 'Urgent same-day service', 90, $3, $4, 1)`,
            [orgId, emergencySlug, emergencyDepositCents, Math.round(emergencyDepositCents * 3.33)]
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
    email = ''
}) {
    const orgSlug = await uniqueOrgSlug(businessName, query);
    const standardDepositCents = Math.round(Number(standardDeposit) * 100) || 4500;
    const emergencyDepositCents = Math.round(Number(emergencyDeposit) * 100) || 6000;
    const currencyCode = currency === '£' || currency === 'GBP' ? 'GBP' : currency === '€' || currency === 'EUR' ? 'EUR' : 'USD';

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
    const org = orgRes.rows[0];
    await seedDefaultEventTypes(org.id, {
        standardDepositCents,
        emergencyDepositCents,
        acceptingEmergencies: acceptingEmergencies !== false
    });
    return org;
}

module.exports = {
    seedDefaultAvailability,
    seedDefaultEventTypes,
    createBookingOrg
};
