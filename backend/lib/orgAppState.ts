import { query } from './db';
import { planIncludesFeature } from './planCatalog';

export function emptyBusinessProfile() {
    return {
        name: '',
        category: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        hours: '',
        attributes: '',
        description: '',
        rating: null,
        reviewsCount: 0,
        connected: false,
        reviews: [] as any[],
        lat: null,
        lng: null,
        placeId: '',
        mapsUrl: ''
    };
}

export function emptyDashboardState() {
    return {
        completenessScore: 0,
        visibilityRank: 0,
        top3Percentage: 0,
        searchViewsIncrease: 0,
        reviewResponseRate: 0,
        weeklyPosts: 0,
        photoCount: 0,
        activities: [] as any[],
        lastVisibilityAudit: null as null | {
            total: number;
            bandLabel: string;
            createdAt: string;
            query: string;
        },
        trackedKeywords: [] as Array<{
            keyword: string;
            avgRank: number;
            top3Percentage: number;
            updatedAt: string;
        }>,
        gapAnalyses: [] as Array<{
            keyword: string;
            gapAnalysis: string;
            grid: number[][];
            competitors: any[];
            center: { lat: number; lng: number } | null;
            avgRank: number;
            top3Percentage: number;
            updatedAt: string;
        }>,
        localSeoUpgradeChoice: null as 'pending' | 'booking' | 'new' | null,
        citationAudit: null as null | Record<string, any>,
        citationHistory: [] as Record<string, any>[],
        citationPending: null as null | {
            mapsTaskId: string;
            organicTaskId: string;
            bingTaskId: string;
            startedAt: string;
        },
        gbpDrafts: [] as Record<string, any>[],
        strategyReport: null as null | Record<string, any>,
        strategyReportHistory: [] as Record<string, any>[]
    };
}

const BOOKING_ONLY_PLAN_IDS = new Set(['booking-solo', 'booking-solo-plus', 'booking-pro']);

export function isBookingOnlyPlan(planId: string | null | undefined) {
    return BOOKING_ONLY_PLAN_IDS.has(String(planId || '').trim());
}

export async function markLocalSeoUpgradePending(orgId: string) {
    const state = await loadOrgAppState(orgId);
    if (state.business?.connected) return;
    await saveOrgAppState(orgId, {
        dashboard: { ...state.dashboard, localSeoUpgradeChoice: 'pending' }
    });
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function clock(value: unknown) {
    return String(value || '').slice(0, 5);
}

function formatOpeningHours(rules: Array<{ day_of_week: number; start_time: unknown; end_time: unknown }>) {
    const byDay = new Map<string, string[]>();
    for (const rule of rules) {
        const day = WEEKDAYS[Number(rule.day_of_week)];
        const start = clock(rule.start_time);
        const end = clock(rule.end_time);
        if (!day || !start || !end) continue;
        const windows = byDay.get(day) || [];
        windows.push(`${start}–${end}`);
        byDay.set(day, windows);
    }
    return WEEKDAYS.filter((day) => byDay.has(day))
        .map((day) => `${day} ${byDay.get(day)!.join(', ')}`)
        .join('\n');
}

async function orgHasBookingPlan(orgId: string) {
    const { rows } = await query(
        `SELECT plan_id FROM subscriptions
         WHERE org_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [orgId]
    );
    return planIncludesFeature(String(rows[0]?.plan_id || ''), 'bookings');
}

export async function loadBookingBusiness(orgId: string) {
    const { rows } = await query(
        `SELECT name, email, phone, service_area, trade_type, site_blurb, site_services, setup_complete
         FROM organizations WHERE id = $1`,
        [orgId]
    );
    const org = rows[0] || {};
    const { rows: rules } = await query(
        `SELECT day_of_week, start_time, end_time
         FROM availability_rules
         WHERE org_id = $1 AND user_id IS NULL AND enabled = TRUE
         ORDER BY day_of_week, start_time`,
        [orgId]
    );
    const { rows: events } = await query(
        `SELECT name FROM event_types
         WHERE org_id = $1 AND active = TRUE
         ORDER BY sort_order, created_at`,
        [orgId]
    );
    const services = events.map((row: any) => String(row.name || '').trim()).filter(Boolean);
    return {
        name: String(org.name || '').trim(),
        email: String(org.email || '').trim(),
        phone: String(org.phone || '').trim(),
        address: String(org.service_area || '').trim(),
        category: String(org.trade_type || '').trim(),
        hours: formatOpeningHours(rules),
        attributes: String(org.site_services || '').trim() || services.join(', '),
        description: String(org.site_blurb || '').trim(),
        setupComplete: Boolean(org.setup_complete)
    };
}

function fillFromBooking(
    current: any,
    booking: Awaited<ReturnType<typeof loadBookingBusiness>>,
    overwrite: boolean
) {
    const pick = (key: string, incoming: string) => {
        const existing = String(current?.[key] || '').trim();
        const next = String(incoming || '').trim();
        if (overwrite) return next || existing;
        return existing || next;
    };
    const name = pick('name', booking.name);
    return {
        ...emptyBusinessProfile(),
        ...(current || {}),
        name,
        category: pick('category', booking.category),
        address: pick('address', booking.address),
        phone: pick('phone', booking.phone),
        email: pick('email', booking.email),
        hours: pick('hours', booking.hours),
        attributes: pick('attributes', booking.attributes),
        description: pick('description', booking.description),
        connected: Boolean(name)
    };
}

function profileChanged(current: any, next: any) {
    const keys = ['name', 'category', 'address', 'phone', 'email', 'hours', 'attributes', 'description', 'website'];
    return keys.some((key) => String(current?.[key] || '').trim() !== String(next?.[key] || '').trim());
}

export async function ensureLocalSeoBusiness(orgId: string) {
    const state = await loadOrgAppState(orgId);
    const choice = state.dashboard?.localSeoUpgradeChoice;
    if (choice === 'new') return state;
    if (choice === 'pending' && !String(state.business?.name || '').trim()) return state;
    if (!(await orgHasBookingPlan(orgId))) return state;
    const booking = await loadBookingBusiness(orgId);
    if (!booking.name || !booking.category) return state;
    const business = fillFromBooking(state.business, booking, false);
    if (!profileChanged(state.business, business)) return state;
    const dashboard = {
        ...state.dashboard,
        localSeoUpgradeChoice: choice || 'booking'
    };
    await saveOrgAppState(orgId, { business, dashboard });
    return { business, dashboard };
}

export async function getLocalSeoUpgradeChoice(orgId: string) {
    const state = await loadOrgAppState(orgId);
    const raw = state.dashboard?.localSeoUpgradeChoice;
    const choice = raw === 'pending' || raw === 'booking' || raw === 'new' ? raw : null;
    const booking = await loadBookingBusiness(orgId);
    return {
        pending: choice === 'pending' && !String(state.business?.name || '').trim(),
        choice,
        booking
    };
}

export async function setLocalSeoUpgradeChoice(orgId: string, choice: 'booking' | 'new') {
    const state = await loadOrgAppState(orgId);
    const booking = await loadBookingBusiness(orgId);
    if (choice === 'booking' && booking.name) {
        await saveOrgAppState(orgId, {
            business: fillFromBooking(state.business, booking, true),
            dashboard: { ...state.dashboard, localSeoUpgradeChoice: 'booking' }
        });
    } else {
        const keepGoogleListing = Boolean(String(state.business?.placeId || '').trim());
        await saveOrgAppState(orgId, {
            business: keepGoogleListing
                ? state.business
                : { ...emptyBusinessProfile(), connected: false },
            dashboard: { ...state.dashboard, localSeoUpgradeChoice: 'new' }
        });
    }
    return getLocalSeoUpgradeChoice(orgId);
}

export async function loadOrgAppState(orgId: string) {
    const { rows } = await query(
        `SELECT profile, dashboard FROM org_app_state WHERE org_id = $1`,
        [orgId]
    );
    if (!rows.length) {
        return {
            business: emptyBusinessProfile(),
            dashboard: emptyDashboardState()
        };
    }
    const row = rows[0];
    return {
        business: { ...emptyBusinessProfile(), ...(row.profile || {}) },
        dashboard: { ...emptyDashboardState(), ...(row.dashboard || {}) }
    };
}

export async function saveOrgAppState(
    orgId: string,
    data: { business?: any; dashboard?: any }
) {
    const current = await loadOrgAppState(orgId);
    const profile = data.business != null ? data.business : current.business;
    const dashboard = data.dashboard != null ? data.dashboard : current.dashboard;

    await query(
        `INSERT INTO org_app_state (org_id, profile, dashboard, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, NOW())
         ON CONFLICT (org_id) DO UPDATE
         SET profile = EXCLUDED.profile,
             dashboard = EXCLUDED.dashboard,
             updated_at = NOW()`,
        [orgId, JSON.stringify(profile), JSON.stringify(dashboard)]
    );
}
