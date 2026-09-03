/** Keep in sync with backend/lib/planCatalog.js */

export const FEATURE_KEYS = ['bookings', 'local_presence', 'local_growth', 'reporting'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
    bookings: 'Online bookings',
    local_presence: 'Local presence (GBP, reviews, posts)',
    local_growth: 'Local growth (search grid, insights)',
    reporting: 'Reporting & dashboard insights'
};

export type Plan = {
    id: string;
    name: string;
    priceCents: number;
    currency: string;
    minTermMonths: number;
};

export const PLANS: Plan[] = [
    { id: 'website-essential', name: 'Website Essential', priceCents: 3900, currency: 'GBP', minTermMonths: 6 },
    { id: 'booking-solo', name: 'Booking Solo', priceCents: 2900, currency: 'GBP', minTermMonths: 6 },
    { id: 'booking-solo-plus', name: 'Booking Solo Plus', priceCents: 4900, currency: 'GBP', minTermMonths: 6 },
    { id: 'booking-pro', name: 'Booking Pro', priceCents: 7900, currency: 'GBP', minTermMonths: 6 },
    { id: 'local-presence', name: 'Local Presence', priceCents: 9900, currency: 'GBP', minTermMonths: 6 },
    { id: 'local-growth', name: 'Local Growth', priceCents: 19900, currency: 'GBP', minTermMonths: 6 },
    { id: 'complete-growth-system', name: 'Complete Growth System', priceCents: 24900, currency: 'GBP', minTermMonths: 6 }
];

export const PLAN_FEATURES: Record<string, FeatureKey[]> = {
    'website-essential': [],
    'booking-solo': ['bookings'],
    'booking-solo-plus': ['bookings'],
    'booking-pro': ['bookings'],
    'local-presence': ['local_presence'],
    'local-growth': ['local_presence', 'local_growth', 'reporting'],
    'complete-growth-system': ['local_presence', 'local_growth', 'reporting', 'bookings']
};

export type RouteFeature = FeatureKey | FeatureKey[] | null;

export const ROUTE_FEATURES: Record<string, RouteFeature> = {
    '/dashboard': null,
    '/rank-tracker': 'local_growth',
    '/report': ['local_growth', 'reporting'],
    '/profile': 'local_presence',
    '/citations': 'local_presence',
    '/posts': 'local_presence',
    '/media': 'local_presence',
    '/reviews': 'local_presence',
    '/qa': 'local_presence',
    '/booking': 'bookings',
    '/booking/settings': 'bookings',
    '/account': null
};

const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export function getFeaturesForPlan(planId: string | null | undefined): FeatureKey[] {
    if (!planId) return [];
    return PLAN_FEATURES[planId] ? [...PLAN_FEATURES[planId]] : [];
}

export function planIncludesFeature(planId: string | null | undefined, featureKey: FeatureKey): boolean {
    return getFeaturesForPlan(planId).includes(featureKey);
}

export function planIncludesAllFeatures(planId: string | null | undefined, featureKeys: FeatureKey[]): boolean {
    const features = getFeaturesForPlan(planId);
    return featureKeys.every((k) => features.includes(k));
}

export function getRequiredPlanHint(featureKey: FeatureKey): { planId: string; planName: string } | null {
    const candidates = PLANS.filter((p) => planIncludesFeature(p.id, featureKey));
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.priceCents - b.priceCents);
    return { planId: candidates[0].id, planName: candidates[0].name };
}

export function getPlanById(planId: string | null | undefined): Plan | null {
    if (!planId) return null;
    return PLAN_BY_ID[planId] || null;
}

export function formatPlanPrice(plan: Plan | null): string {
    if (!plan) return '';
    return `£${(plan.priceCents / 100).toFixed(0)}/mo`;
}

export function routeRequiresFeatures(path: string): FeatureKey[] {
    const key = ROUTE_FEATURES[path];
    if (!key) return [];
    return Array.isArray(key) ? key : [key];
}

export function hasRouteAccess(features: FeatureKey[], path: string): boolean {
    const required = routeRequiresFeatures(path);
    if (!required.length) return true;
    return required.every((f) => features.includes(f));
}
