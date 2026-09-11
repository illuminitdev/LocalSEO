import { query } from './db';
import { uniqueOrgSlug, uniqueEventSlug } from './slug';
import { getTradeBookingCatalog } from './bookingTradeCatalog';

async function seedDefaultAvailability(_orgId: any) {
    // Engineers configure their own hours in booking settings — no default slots.
}

async function seedDefaultEventTypes(
    orgId: any,
    {
        standardDepositCents = 4500,
        emergencyDepositCents = 6000,
        acceptingEmergencies = true,
        tradeType = '',
        bookingIndustryId = ''
    }: any = {}
) {
    const catalog = getTradeBookingCatalog(tradeType, bookingIndustryId);
    const types = catalog.eventTypes.filter(
        (t) => t.kind !== 'emergency' || acceptingEmergencies !== false
    );

    for (const t of types) {
        const slug = await uniqueEventSlug(orgId, t.slugBase, query);
        const depositCents = t.kind === 'emergency' ? emergencyDepositCents : standardDepositCents;
        await query(
            `INSERT INTO event_types (org_id, slug, name, description, duration_minutes, deposit_cents, total_cents, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                orgId,
                slug,
                t.name,
                t.description,
                t.durationMinutes,
                depositCents,
                depositCents,
                t.sortOrder
            ]
        );
    }
}

async function createBookingOrg({
    hostName,
    businessName,
    tradeType,
    bookingIndustryId,
    phone,
    serviceArea,
    standardDeposit,
    emergencyDeposit,
    currency = 'GBP',
    acceptingEmergencies,
    emergencyNote,
    email = '',
    orgId = null,
    userId = null,
    createNew = false
}: any) {
    const catalog = getTradeBookingCatalog(tradeType, bookingIndustryId);
    const resolvedStandard =
        standardDeposit != null && standardDeposit !== '' ? Number(standardDeposit) : catalog.standardDeposit;
    const resolvedEmergency =
        emergencyDeposit != null && emergencyDeposit !== '' ? Number(emergencyDeposit) : catalog.emergencyDeposit;
    const resolvedAccepting =
        acceptingEmergencies !== undefined && acceptingEmergencies !== null
            ? acceptingEmergencies !== false
            : catalog.acceptingEmergencies;
    const resolvedNote =
        emergencyNote != null && String(emergencyNote).trim()
            ? String(emergencyNote).trim()
            : catalog.emergencyNote;

    const standardDepositCents = Math.round(resolvedStandard * 100) || 4500;
    const emergencyDepositCents = Math.round(resolvedEmergency * 100) || 6000;
    const currencyCode = currency === '£' || currency === 'GBP' ? 'GBP' : currency === '€' || currency === 'EUR' ? 'EUR' : 'USD';
    const resolvedIndustryId = String(bookingIndustryId || catalog.bookingIndustryId || '').trim() || null;
    const resolvedTradeType = String(tradeType || catalog.tradeType || '').trim();

    // Update existing org only when completing first-time setup on that org (not createNew).
    if (orgId && !createNew) {
        const orgRes = await query(
            `UPDATE organizations SET
              name = $1, host_name = $2, trade_type = $3, phone = $4, service_area = $5,
              email = COALESCE(NULLIF($6, ''), email), currency = $7,
              accepting_emergencies = $8, emergency_note = $9, setup_complete = TRUE,
              booking_industry_id = COALESCE($10, booking_industry_id),
              slug = CASE WHEN slug LIKE 'my-business%' OR name = 'My business' THEN $11 ELSE slug END
             WHERE id = $12 RETURNING *`,
            [
                String(businessName).trim(),
                String(hostName).trim(),
                resolvedTradeType,
                String(phone || '').trim(),
                String(serviceArea || '').trim(),
                String(email || '').trim(),
                currencyCode,
                resolvedAccepting,
                resolvedNote,
                resolvedIndustryId,
                await uniqueOrgSlug(businessName, query),
                orgId
            ]
        );
        const org = orgRes.rows[0];
        if (!org) throw new Error('Organization not found');
        const { rows: existingTypes } = await query('SELECT id FROM event_types WHERE org_id = $1 LIMIT 1', [org.id]);
        if (!existingTypes.length) {
            await seedDefaultEventTypes(org.id, {
                standardDepositCents,
                emergencyDepositCents,
                acceptingEmergencies: resolvedAccepting,
                tradeType: resolvedTradeType,
                bookingIndustryId: resolvedIndustryId
            });
        }
        return org;
    }

    const orgSlug = await uniqueOrgSlug(businessName, query);
    const orgRes = await query(
        `INSERT INTO organizations (slug, name, host_name, trade_type, phone, service_area, email, currency,
          accepting_emergencies, emergency_note, setup_complete, booking_industry_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11) RETURNING *`,
        [
            orgSlug,
            String(businessName).trim(),
            String(hostName).trim(),
            resolvedTradeType,
            String(phone || '').trim(),
            String(serviceArea || '').trim(),
            String(email || '').trim(),
            currencyCode,
            resolvedAccepting,
            resolvedNote,
            resolvedIndustryId
        ]
    );
    const org = orgRes.rows[0];
    await seedDefaultEventTypes(org.id, {
        standardDepositCents,
        emergencyDepositCents,
        acceptingEmergencies: resolvedAccepting,
        tradeType: resolvedTradeType,
        bookingIndustryId: resolvedIndustryId
    });

    if (userId) {
        await query(
            `INSERT INTO memberships (user_id, org_id, role)
             VALUES ($1, $2, 'owner')
             ON CONFLICT (user_id, org_id) DO NOTHING`,
            [userId, org.id]
        );
    }

    return org;
}

async function listUserBookingOrgs(userId: string) {
    const { rows } = await query(
        `SELECT o.id, o.slug, o.name, o.host_name, o.trade_type, o.service_area, o.setup_complete,
                EXISTS (
                    SELECT 1 FROM event_types et WHERE et.org_id = o.id LIMIT 1
                ) AS has_events
         FROM memberships m
         JOIN organizations o ON o.id = m.org_id
         WHERE m.user_id = $1
         ORDER BY o.created_at ASC NULLS LAST, o.name ASC`,
        [userId]
    );

    return rows.map((o: any) => {
        const hasBookingData = Boolean(String(o.trade_type || '').trim() && o.has_events);
        return {
            id: o.id,
            slug: o.slug,
            name: o.name,
            host_name: o.host_name,
            trade_type: o.trade_type,
            service_area: o.service_area,
            setup_complete: Boolean(o.setup_complete),
            canResume: hasBookingData,
            ready: Boolean(o.setup_complete && hasBookingData)
        };
    });
}

async function assertUserOrgMembership(userId: string, orgId: string) {
    const { rows } = await query(
        `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.org_id = $2::uuid LIMIT 1`,
        [userId, orgId]
    );
    return rows[0]?.org_id || null;
}

export {
    seedDefaultAvailability,
    seedDefaultEventTypes,
    createBookingOrg,
    listUserBookingOrgs,
    assertUserOrgMembership
};
