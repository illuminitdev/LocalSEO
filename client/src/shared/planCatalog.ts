

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

/** One-line pitch shown on plan cards in Account → Plan. */
export const PLAN_DESCRIPTIONS: Record<string, string> = {
    'website-essential': 'A professional website for your business, hosted and maintained for you.',
    'booking-solo': 'Online bookings for a solo business, with your own booking page.',
    'booking-solo-plus': 'Everything in Booking Solo with more room to grow your bookings.',
    'booking-pro': 'Bookings for growing teams, with member-level schedules.',
    'local-presence': 'Manage your Google Business Profile, reviews and posts in one place.',
    'local-growth': 'Local presence plus search-grid rank tracking, insights and reporting.',
    'complete-growth-system': 'Every ZappSites tool: local presence, growth, reporting and bookings.'
};

/** Credit cost of each paid action. The API sends the live values; these are the fallback. Keep in sync with backend/lib/planCatalog.ts. */
export const CREDIT_COSTS = {
    rankScan: 9,
    trackerKeyword: 1,
    keywordSuggest: 1,
    aiInsights: 6,
    llmVisibility: 20,
    llmTrackerAnswer: 1,
    citations: 4,
    reviewSync: 1,
    aiText: 1,
    aiImage: 2
} as const;

export type CreditFeature = keyof typeof CREDIT_COSTS;

export const CREDIT_FEATURE_LABELS: Record<CreditFeature, string> = {
    rankScan: 'Rank Tracker scans',
    trackerKeyword: 'Keyword rank checks',
    keywordSuggest: 'Keyword suggestions',
    aiInsights: 'AI Insights',
    llmVisibility: 'LLM Visibility',
    llmTrackerAnswer: 'LLM Tracking',
    citations: 'Citations scans',
    reviewSync: 'Google review sync',
    aiText: 'AI writing (audit, posts, replies, Q&A)',
    aiImage: 'AI images'
};

/** Keywords a business can track in the Visibility Tracker. */
export const TRACKED_KEYWORD_LIMIT = 10;

/** Per-plan keyword limit. Keep in sync with TRACKED_KEYWORD_LIMITS in backend/lib/planCatalog.ts. */
export const TRACKED_KEYWORD_LIMITS: Record<string, number> = {
    'local-presence': 5,
    'local-growth': 10,
    'complete-growth-system': 10
};

/** Local Search Grid scans per billing month. Keep in sync with GRID_SCAN_LIMITS in backend/lib/planCatalog.ts. */
export const GRID_SCAN_LIMITS: Record<string, number> = {
    'local-presence': 5,
    'local-growth': 10,
    'complete-growth-system': 10
};

export function getTrackedKeywordLimit(planId: string | null | undefined) {
    return TRACKED_KEYWORD_LIMITS[String(planId || '')] ?? 5;
}

export type RouteFeature = FeatureKey | FeatureKey[] | null;

export const ROUTE_FEATURES: Record<string, RouteFeature> = {
    '/dashboard': null,
    '/rank-tracker': 'local_presence',
    '/visibility-tracker': 'local_presence',
    '/report': ['local_growth', 'reporting'],
    '/llm-visibility': 'local_presence',
    '/profile': 'local_presence',
    '/citations': 'local_presence',
    '/posts': 'local_presence',
    '/media': 'local_presence',
    '/reviews': 'local_presence',
    '/qa': 'local_presence',
    '/booking': 'bookings',
    '/booking/settings': 'bookings',
    '/clients': 'bookings',
    '/quotes': 'bookings',
    '/inbox': 'bookings',
    '/team': 'bookings',
    '/dispatch': 'bookings',
    '/money': 'bookings',
    '/marketing': 'bookings',
    '/field': 'bookings',
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

/** Member-level Teams schedules: Booking Pro + Complete Growth only (not Solo / Solo Plus). */
export function orgHasBookingTeams(planId: string | null | undefined): boolean {
    const id = String(planId || '').trim();
    return id === 'booking-pro' || id === 'complete-growth-system';
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
