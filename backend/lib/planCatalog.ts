
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

const DEFAULT_LLM_TRACKER_PROMPT_LIMIT = 5;
/** LLM Tracking prompts per business. Same numbers as the shared keyword list. */
const LLM_TRACKER_PROMPT_LIMITS: Record<string, number> = {
    'local-presence': 5,
    'local-growth': 10,
    'complete-growth-system': 10
};

function getLlmTrackerPromptLimit(planId: string | null | undefined) {
    return LLM_TRACKER_PROMPT_LIMITS[String(planId || '')] ?? DEFAULT_LLM_TRACKER_PROMPT_LIMIT;
}

/**
 * Usage credits. 1 credit = 1 DataForSEO call or 1 Gemini text answer (a Gemini image costs 2). The pool resets with the subscription billing period.
 */
const CREDIT_COSTS = {
    rankScan: 9,
    trackerKeyword: 1,
    keywordSuggest: 1,
    aiInsights: 6,
    llmVisibility: 20,
    llmTrackerAnswer: 1,
    citations: 4,
    reviewSync: 1,
    /** Gemini text actions: AI audit, post copy, review reply, Q&A answer. */
    aiText: 1,
    /** Gemini image actions: post image, media photo. */
    aiImage: 2
} as const;

type CreditFeature = keyof typeof CREDIT_COSTS;

const CREDIT_ALLOWANCES: Record<string, number> = {
    'local-presence': 100,
    'local-growth': 1000,
    'complete-growth-system': 2000
};

const LOCATION_LIMITS: Record<string, number> = {
    'local-presence': 1,
    'local-growth': 3,
    'complete-growth-system': 10
};


/** Keywords a business can track in the Visibility Tracker, by plan. TRACKED_KEYWORD_LIMIT is the highest of these. */
const TRACKED_KEYWORD_LIMITS: Record<string, number> = {
    'local-presence': 5,
    'local-growth': 10,
    'complete-growth-system': 10
};
const DEFAULT_TRACKED_KEYWORD_LIMIT = 5;
const TRACKED_KEYWORD_LIMIT = 10;

const GRID_SCAN_LIMITS: Record<string, number> = {
    'local-presence': 5,
    'local-growth': 10,
    'complete-growth-system': 10
};

function getGridScanLimit(planId: string | null | undefined) {
    return GRID_SCAN_LIMITS[String(planId || '')] ?? 0;
}

function getTrackedKeywordLimit(planId: string | null | undefined) {
    return TRACKED_KEYWORD_LIMITS[String(planId || '')] ?? DEFAULT_TRACKED_KEYWORD_LIMIT;
}


/** Automatic keyword checks are off for every plan. Add e.g. 'local-growth': 7 to turn them back on. */
const AUTO_CHECK_EVERY_DAYS: Record<string, number> = {};

const SCAN_COOLDOWN_HOURS = 24;

function getCreditAllowance(planId: string | null | undefined) {
    return CREDIT_ALLOWANCES[String(planId || '')] ?? 0;
}

function getLocationLimit(planId: string | null | undefined) {
    return LOCATION_LIMITS[String(planId || '')] ?? 1;
}

function getAutoCheckEveryDays(planId: string | null | undefined) {
    return AUTO_CHECK_EVERY_DAYS[String(planId || '')] ?? 0;
}

const ROUTE_FEATURES: Record<string, string | string[] | null> = {
    '/dashboard': null,
    '/rank-tracker': 'local_presence',
    '/visibility-tracker': 'local_presence',
    '/report': ['local_growth', 'reporting'],
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

/** Member-level Teams schedules: Booking Pro + Complete Growth only (not Solo / Solo Plus). */
function orgHasBookingTeams(planId: string | null | undefined): boolean {
    const id = String(planId || '').trim();
    return id === 'booking-pro' || id === 'complete-growth-system';
}

export type { CreditFeature };
export {
    CREDIT_COSTS,
    CREDIT_ALLOWANCES,
    AUTO_CHECK_EVERY_DAYS,
    LOCATION_LIMITS,
    TRACKED_KEYWORD_LIMIT,
    TRACKED_KEYWORD_LIMITS,
    getTrackedKeywordLimit,
    GRID_SCAN_LIMITS,
    getGridScanLimit,
    SCAN_COOLDOWN_HOURS,
    getCreditAllowance,
    getLocationLimit,
    getAutoCheckEveryDays,
    FEATURE_KEYS,
    FEATURE_LABELS,
    PLANS,
    PLAN_FEATURES,
    ROUTE_FEATURES,
    getFeaturesForPlan,
    getLlmTrackerPromptLimit,
    planIncludesFeature,
    planIncludesAllFeatures,
    getRequiredPlanHint,
    getPlanById,
    isValidPlanId,
    formatPrice,
    orgHasBookingTeams
};
