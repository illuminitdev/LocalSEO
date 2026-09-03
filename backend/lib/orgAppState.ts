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
        activities: [] as any[]
    };
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
