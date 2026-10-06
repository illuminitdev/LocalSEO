import { query } from './db';

export function emptyBusinessProfile() {
    return {
        name: '',
        category: '',
        address: '',
        phone: '',
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
        gbpDrafts: [] as Record<string, any>[]
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

export async function getLocalSeoUpgradeChoice(orgId: string) {
    const state = await loadOrgAppState(orgId);
    const raw = state.dashboard?.localSeoUpgradeChoice;
    const choice = raw === 'pending' || raw === 'booking' || raw === 'new' ? raw : null;
    const { rows } = await query(
        `SELECT name, email, phone, service_area FROM organizations WHERE id = $1`,
        [orgId]
    );
    const org = rows[0] || {};
    return {
        pending: choice === 'pending' && !state.business?.connected,
        choice,
        booking: {
            name: String(org.name || ''),
            email: String(org.email || ''),
            phone: String(org.phone || ''),
            address: String(org.service_area || '')
        }
    };
}

export async function setLocalSeoUpgradeChoice(orgId: string, choice: 'booking' | 'new') {
    const state = await loadOrgAppState(orgId);
    await saveOrgAppState(orgId, {
        dashboard: { ...state.dashboard, localSeoUpgradeChoice: choice }
    });
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
