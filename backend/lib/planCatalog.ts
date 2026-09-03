/** Plan catalog — keep in sync with client/src/lib/planCatalog.ts */

const FEATURE_KEYS = ['bookings', 'local_presence', 'local_growth', 'reporting'];

const FEATURE_LABELS: Record<string, string> = {
    bookings: 'Online bookings',
    local_presence: 'Local presence (GBP, reviews, posts)',
    local_growth: 'Local growth (search grid, insights)',
    reporting: 'Reporting & dashboard insights'
};

const PLANS = [
    { id: 'website-essential', name: 'Website Essential', priceCents: 3900, currency: 'GBP', minTermMonths: 6 },
    { id: 'booking-solo', name: 'Booking Solo', priceCents: 2900, currency: 'GBP', minTermMonths: 6 },
    { id: 'booking-solo-plus', name: 'Booking Solo Plus', priceCents: 4900, currency: 'GBP', minTermMonths: 6 },
    { id: 'booking-pro', name: 'Booking Pro', priceCents: 7900, currency: 'GBP', minTermMonths: 6 },
    { id: 'local-presence', name: 'Local Presence', priceCents: 9900, currency: 'GBP', minTermMonths: 6 },
    { id: 'local-growth', name: 'Local Growth', priceCents: 19900, currency: 'GBP', minTermMonths: 6 },
    { id: 'complete-growth-system', name: 'Complete Growth System', priceCents: 24900, currency: 'GBP', minTermMonths: 6 }
];

const PLAN_FEATURES: Record<string, string[]> = {
    'website-essential': [],
    'booking-solo': ['bookings'],
    'booking-solo-plus': ['bookings'],
    'booking-pro': ['bookings'],
    'local-presence': ['local_presence'],
    'local-growth': ['local_presence', 'local_growth', 'reporting'],
    'complete-growth-system': ['local_presence', 'local_growth', 'reporting', 'bookings']
};

/** Route path → single feature key, or array for multi-feature gates */
const ROUTE_FEATURES: Record<string, string | string[] | null> = {
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

function getFeaturesForPlan(planId: string) {
    return PLAN_FEATURES[planId] ? [...PLAN_FEATURES[planId]] : [];
}

function planIncludesFeature(planId: string, featureKey: string) {
    return getFeaturesForPlan(planId).includes(featureKey);
}

function planIncludesAllFeatures(planId: string, featureKeys: string[]) {
    const features = getFeaturesForPlan(planId);
    return featureKeys.every((k) => features.includes(k));
}

/** Lowest-priced plan that includes the feature (for upgrade hints). */
function getRequiredPlanHint(featureKey: string) {
    const candidates = PLANS.filter((p) => planIncludesFeature(p.id, featureKey));
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.priceCents - b.priceCents);
    return { planId: candidates[0].id, planName: candidates[0].name };
}

function getPlanById(planId: string) {
    return PLAN_BY_ID[planId] || null;
}

function isValidPlanId(planId: string) {
    return Boolean(PLAN_BY_ID[planId]);
}

function formatPrice(plan: any) {
    if (!plan) return '';
    return `£${(plan.priceCents / 100).toFixed(0)}/mo`;
}

export {
    FEATURE_KEYS,
    FEATURE_LABELS,
    PLANS,
    PLAN_FEATURES,
    ROUTE_FEATURES,
    getFeaturesForPlan,
    planIncludesFeature,
    planIncludesAllFeatures,
    getRequiredPlanHint,
    getPlanById,
    isValidPlanId,
    formatPrice
};
