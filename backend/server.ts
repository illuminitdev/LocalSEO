import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { GoogleGenAI } from '@google/genai';
import * as store from './lib/store';
import { requirePlacesConfigured, searchBusiness, nearbyCompetitors, geocodeAddress, getBusinessByPlaceId } from './lib/googlePlaces';
import { createStripeWebhookHandler } from './routes/webhooks';
import { requireAuth } from './middleware/auth';
import { requireFeature, requireAllFeatures } from './middleware/entitlements';
import { authRateLimit, corsOptions, globalRateLimit, parseJsonBodyFallback, securityHeaders } from './middleware/security';
import createHostRouter from './routes/host';
import createPublicRouter from './routes/public';
import authRouter from './routes/auth';
import adminRouter from './admin/routes';
import salesRouter from './sales-agent/routes';
import integrationsRouter from './routes/integrations';
import { migrate } from './lib/db';
import { sendSms } from './lib/inbox';
import { fetchReviewTask, reviewSyncConfigured, startReviewTask } from './lib/googleReviewSync';
import {
    REVIEW_SOURCES,
    createPublicReviewRouter,
    emailReviewReply,
    emailReviewRequest,
    googleReviewUrl,
    listSubmissions,
    markRead,
    orgSlugFor,
    reviewLink,
    saveReply,
    sourceCounts
} from './lib/reviewCollection';
import { createUploadPresign, uploadPostImageDataUrl } from './lib/media';
import {
    competitorShare,
    gridConfigured,
    normalizeGridSize,
    optimizationHealth,
    rankGridCell,
    rankGridRow,
    summarizeGrid
} from './lib/dataForSeoGrid';
import {
    MAX_TRACKED_KEYWORDS,
    checkKeywordRank,
    cleanKeyword,
    fetchRelatedKeywords,
    fetchSearchVolumes,
    industryKeywordIdeas,
    industryTerms,
    makeRelevanceFilter,
    trackerConfigured,
    type TrackerKeyword
} from './lib/visibilityTracker';
import { ensureLocalSeoBusiness, getLocalSeoUpgradeChoice, loadOrgAppState, saveOrgAppState, setLocalSeoUpgradeChoice } from './lib/orgAppState';
import {
    analysisJobs,
    askLlm,
    LLM_PLATFORMS,
    askGoogleOverview,
    computeChanges,
    summarizeTracker,
    buildActions as buildInsightActions,
    buildPrompts,
    cityFromAddress,
    suggestKeywords,
    buildReport as buildVisibilityReport,
    fetchPack,
    fetchTrends,
    planKeywords,
    summarizeMarket,
    dataForSeoReady,
    fallbackRecommendation,
    marketOpportunities,
    marketProblems,
    strategyPrompt,
    weekStart as insightsWeekStart
} from './lib/aiInsights';
import { CitationScanError, collectCitationScan, startCitationScan } from './lib/dataForSeoCitations';

dotenv.config({ override: true });

let stripeClient: any = null;
if (process.env.STRIPE_SECRET_KEY) {
    try {
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
        console.log('Stripe ready (test/live key configured).');
    } catch (e) {
        console.error('Failed to load stripe package', e);
    }
}

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

let aiClient: any = null;
if (process.env.GEMINI_API_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        console.log(`Gemini ready (${TEXT_MODEL}).`);
    } catch (e) {
        console.error('Failed to load @google/genai', e);
    }
} else {
    console.warn('GEMINI_API_KEY is missing. Add it to backend/.env');
}

if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    console.log('DataForSEO ready.');
} else {
    console.warn('DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is missing. Citation audits need both.');
}

if (requirePlacesConfigured()) {
    console.log('Google Places ready.');
} else {
    console.warn('GOOGLE_PLACES_API_KEY is missing. Add location search will fall back to Gemini if available.');
}

const app = express();
const PORT = process.env.PORT || 5000;


app.set('trust proxy', 1);

app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), createStripeWebhookHandler(stripeClient));

app.use(securityHeaders());
app.use(cors(corsOptions()));
app.use(globalRateLimit());

app.use(
    express.json({
        limit: process.env.JSON_BODY_LIMIT || '1mb',
        type: (req) => {
            const ct = String(req.headers['content-type'] || '').toLowerCase();
            
            return !ct || ct.includes('json') || ct.includes('text/plain');
        }
    })
);
app.use(parseJsonBodyFallback());
app.use('/api/auth', authRateLimit());
app.use('/api/admin/login', authRateLimit());

app.use((req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const send = res.json.bind(res);
    (res as any).json = (body: any) => {
        send(body);
        if (res.statusCode < 500 && (req as any).orgStateHydrated) {
            persistAppState();
            saveOrgToDb(req).catch((err: any) => {
                console.error('[orgAppState] Failed to persist:', err.message);
            });
        }
        return res;
    };
    next();
});

const emptyBusiness = () => ({
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
    reviews: [],
    lat: null,
    lng: null,
    placeId: '',
    mapsUrl: ''
});

const emptyDashboard = () => ({
    completenessScore: 0,
    visibilityRank: 0,
    top3Percentage: 0,
    searchViewsIncrease: 0,
    reviewResponseRate: 0,
    weeklyPosts: 0,
    photoCount: 0,
    activities: [] as any[],
    trackedKeywords: [] as Array<{
        keyword: string;
        avgRank: number;
        top3Percentage: number;
        updatedAt: string;
    }>,
    gapAnalyses: [] as Array<Record<string, any>>,
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
    llmVisibility: null as null | Record<string, any>,
    llmVisibilityHistory: [] as Record<string, any>[],
    aiInsights: null as null | Record<string, any>,
    aiInsightsHistory: [] as Record<string, any>[]
});

let connectedBusiness = emptyBusiness();
let dashboardState = emptyDashboard();

function defaultBookingSlots() {
    const slots = [];
    for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
        slots.push(
            { id: `d${dayOfWeek}-am`, dayOfWeek, startTime: '08:00', endTime: '12:00', label: 'Morning (08:00 - 12:00)', isEmergencyOnly: false, enabled: true },
            { id: `d${dayOfWeek}-pm`, dayOfWeek, startTime: '13:00', endTime: '17:00', label: 'Afternoon (13:00 - 17:00)', isEmergencyOnly: false, enabled: true },
            { id: `d${dayOfWeek}-eve`, dayOfWeek, startTime: '17:30', endTime: '20:30', label: 'Evening Callout (17:30 - 20:30)', isEmergencyOnly: true, enabled: true }
        );
    }
    slots.push({
        id: 'd0-am',
        dayOfWeek: 0,
        startTime: '09:00',
        endTime: '13:00',
        label: 'Sunday Morning (09:00 - 13:00)',
        isEmergencyOnly: false,
        enabled: true
    });
    return slots;
}

const BOOKING_DEMOS = {
    heating: {
        demoKey: 'heating',
        slug: 'demo-heating-pro',
        name: 'Mike Reynolds',
        businessName: 'Reynolds Heating & Gas',
        tradeType: 'Heating Engineer',
        phone: '07700 111222',
        email: 'mike@reynoldsheating.demo',
        deposit: 50,
        currency: '£',
        serviceArea: 'Greater Manchester',
        emergencyNote: 'Boiler breakdowns and no-heat callouts prioritised.',
        acceptingEmergencies: true
    },
    plumber: {
        demoKey: 'plumber',
        slug: 'demo-emergency-plumber',
        name: 'James Thornton',
        businessName: 'Thornton Rapid 24/7 Plumbing',
        tradeType: 'Emergency Plumber',
        phone: '07890 554433',
        email: 'james@thorntonplumbing.demo',
        deposit: 60,
        currency: '£',
        serviceArea: 'Central London, North & West Postcodes',
        emergencyNote: 'Burst pipes and active leaks get emergency windows.',
        acceptingEmergencies: true
    },
    electrician: {
        demoKey: 'electrician',
        slug: 'demo-electrician',
        name: 'Priya Shah',
        businessName: 'Shah NICEIC Electrics',
        tradeType: 'Electrician',
        phone: '07711 334455',
        email: 'priya@shahelectrics.demo',
        deposit: 45,
        currency: '£',
        serviceArea: 'Birmingham & West Midlands',
        emergencyNote: 'Power loss and fuse board faults only.',
        acceptingEmergencies: true
    },
    locksmith: {
        demoKey: 'locksmith',
        slug: 'demo-locksmith',
        name: 'Gary Vance',
        businessName: 'Vance Property & Maintenance Services',
        tradeType: 'Locksmith',
        phone: '07700 998877',
        email: 'gary@vancelocks.demo',
        deposit: 35,
        currency: '£',
        serviceArea: 'Southampton & Hampshire',
        emergencyNote: '24/7 lockout and forced-entry secure.',
        acceptingEmergencies: true
    }
};

function emptyBookingState() {
    return {
        active: false,
        demoKey: null,
        source: null,
        slug: 'booking',
        name: '',
        businessName: '',
        tradeType: '',
        phone: '',
        email: '',
        deposit: 45,
        currency: '£',
        serviceArea: '',
        emergencyNote: '',
        acceptingEmergencies: true,
        stripeConnected: false,
        slots: defaultBookingSlots(),
        bookings: []
    };
}

let bookingState = emptyBookingState();
const pendingCheckouts = new Map();
const completedStripeSessions = new Map();

function normalizeBookingState(state: any) {
    const base = emptyBookingState();
    if (!state || typeof state !== 'object') return base;
    const merged = { ...base, ...state };
    if (!Array.isArray(merged.slots) || merged.slots.length === 0) {
        merged.slots = defaultBookingSlots();
    }
    if (!Array.isArray(merged.bookings)) merged.bookings = [];
    return merged;
}

function snapshotAppState() {
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        connectedBusiness,
        dashboardState,
        bookingState,
        pendingCheckouts: [...pendingCheckouts.entries()],
        completedStripeSessions: [...completedStripeSessions.entries()]
    };
}

function persistAppState() {
    store.scheduleSave(snapshotAppState());
}

async function hydrateOrgFromDb(req: any, res: Response, next: NextFunction) {
    if (!req.orgId) return next();
    try {
        const state = await ensureLocalSeoBusiness(req.orgId);
        connectedBusiness = state.business;
        dashboardState = state.dashboard;
        req.connectedBusiness = state.business;
        req.dashboardState = state.dashboard;
        req.orgStateHydrated = true;
        next();
    } catch (err: any) {
        console.error('hydrateOrgFromDb error:', err.message);
        res.status(500).json({ error: 'Could not load workspace state.' });
    }
}

async function saveOrgToDb(req: any) {
    if (!req.orgId || !req.orgStateHydrated) return;
    let business = req.connectedBusiness || connectedBusiness;
    const dashboard = req.dashboardState || dashboardState;
    if (!String(business?.name || '').trim()) {
        const current = await loadOrgAppState(req.orgId);
        if (String(current.business?.name || '').trim()) {
            business = current.business;
            connectedBusiness = { ...emptyBusiness(), ...current.business };
            req.connectedBusiness = connectedBusiness;
        }
    }
    await saveOrgAppState(req.orgId, {
        business,
        dashboard
    });
}

function hydrateAppState(raw: any) {
    if (!raw || typeof raw !== 'object') return;
    if (raw.connectedBusiness) connectedBusiness = { ...emptyBusiness(), ...raw.connectedBusiness };
    if (raw.dashboardState) dashboardState = { ...emptyDashboard(), ...raw.dashboardState };
    if (raw.bookingState) bookingState = normalizeBookingState(raw.bookingState);
    pendingCheckouts.clear();
    completedStripeSessions.clear();
    for (const [key, value] of raw.pendingCheckouts || []) pendingCheckouts.set(key, value);
    for (const [key, value] of raw.completedStripeSessions || []) completedStripeSessions.set(key, value);
}

const persisted = store.loadState();
if (persisted) {
    hydrateAppState(persisted);
    console.log(`[store] Restored app state from ${store.STATE_FILE}`);
} else {
    console.log(`[store] No saved state yet — will write to ${store.STATE_FILE}`);
}

function currencySymbolToIso(symbol: any) {
    const map = { '£': 'gbp', '$': 'usd', '€': 'eur', GBP: 'gbp', USD: 'usd', EUR: 'eur' };
    const key = String(symbol || '£').trim();
    return map[key] || map[key.toUpperCase()] || 'gbp';
}

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function createBookingFromPending(pending: any, paymentMeta: any) {
    return {
        id: bookingId(),
        customerName: pending.customerName,
        email: pending.email,
        phone: pending.phone,
        address: pending.address,
        description: pending.description || '',
        date: pending.date,
        slotId: pending.slotId,
        slotLabel: pending.slotLabel || '',
        startTime: pending.startTime || '',
        endTime: pending.endTime || '',
        isEmergency: Boolean(pending.isEmergency),
        notifyVia: pending.notifyVia || 'both',
        depositAmount: bookingState.deposit,
        currency: bookingState.currency,
        depositPaid: true,
        paymentId: paymentMeta.paymentId || null,
        stripeSessionId: paymentMeta.stripeSessionId || null,
        status: 'pending',
        reminderSent: false,
        confirmationEmailSent: false,
        createdAt: new Date().toISOString()
    };
}

function bookingId() {
    return `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function bookingSlug(name: any) {
    return String(name || 'booking')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'booking';
}

function bookingPublicProfile() {
    return {
        slug: bookingState.slug,
        name: bookingState.name,
        businessName: bookingState.businessName,
        tradeType: bookingState.tradeType,
        phone: bookingState.phone,
        email: bookingState.email,
        deposit: bookingState.deposit,
        currency: bookingState.currency,
        serviceArea: bookingState.serviceArea,
        emergencyNote: bookingState.emergencyNote,
        acceptingEmergencies: bookingState.acceptingEmergencies,
        stripeConnected: bookingState.stripeConnected,
        source: bookingState.source,
        demoKey: bookingState.demoKey
    };
}

function syncBookingFromBusiness() {
    if (!connectedBusiness.connected || !connectedBusiness.name) return false;
    if (bookingState.demoKey) return false;
    const keepBookings = bookingState.source === 'business';
    bookingState = {
        ...bookingState,
        active: true,
        source: 'business',
        demoKey: null,
        businessName: connectedBusiness.name,
        tradeType: connectedBusiness.category || 'Local Business',
        phone: connectedBusiness.phone || bookingState.phone,
        serviceArea: connectedBusiness.address || bookingState.serviceArea,
        name: keepBookings && bookingState.name ? bookingState.name : 'Business Owner',
        slug: bookingSlug(connectedBusiness.name),
        slots: bookingState.slots?.length ? bookingState.slots : defaultBookingSlots(),
        bookings: keepBookings ? bookingState.bookings : []
    };
    return true;
}

function bookingDemosList() {
    return Object.values(BOOKING_DEMOS).map((d) => ({
        demoKey: d.demoKey,
        title: d.tradeType.includes('Heating')
            ? 'Heating Pro'
            : d.tradeType.includes('Plumber')
              ? 'Plumber'
              : d.tradeType.includes('Electric')
                ? 'Electrician'
                : 'Locksmith',
        subtitle: d.tradeType.includes('Heating')
            ? 'Gas & Boilers'
            : d.tradeType.includes('Plumber')
              ? 'Leaks & Pipes'
              : d.tradeType.includes('Electric')
                ? 'NICEIC Spark'
                : '24/7 Lockout',
        businessName: d.businessName
    }));
}

function isBookingConfigured() {
    return Boolean(
        bookingState.source &&
        String(bookingState.businessName || '').trim() &&
        String(bookingState.name || '').trim() &&
        String(bookingState.tradeType || '').trim()
    );
}

function bookingPayload() {
    const linked = Boolean(connectedBusiness.connected && connectedBusiness.name);
    const ready = isBookingConfigured();
    return {
        ready,
        linked,
        demoKey: bookingState.demoKey,
        source: bookingState.source,
        ...bookingState,
        profile: ready ? bookingPublicProfile() : null,
        business: {
            name: connectedBusiness.name,
            connected: linked,
            address: connectedBusiness.address,
            category: connectedBusiness.category,
            phone: connectedBusiness.phone
        },
        paymentsMode: stripeClient ? 'stripe' : 'simulated',
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null
    };
}

function requireBookingReady(res: Response) {
    if (!isBookingConfigured()) {
        res.status(400).json({ error: 'Complete Booking Plots setup first (service, your details, deposit).' });
        return false;
    }
    return true;
}

function parseJsonFromText(text) {
    if (!text) return null;
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

function requireGemini(res: Response) {
    if (aiClient) return true;
    res.status(503).json({ error: 'Gemini API key is missing. Add GEMINI_API_KEY to backend/.env and restart.' });
    return false;
}

function requireBusiness(res: Response) {
    if (connectedBusiness.connected && connectedBusiness.name) return true;
    res.status(400).json({
        error: 'Save your business profile first (Business profile page — required fields).'
    });
    return false;
}

function errMessage(err: any) {
    return err?.message || err?.error?.message || String(err);
}

async function generateText(prompt: string, extraConfig: any = {}) {
    const response = await aiClient.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: extraConfig
    });
    return (response.text || '').trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function isGeminiQuotaError(err: any) {
    const raw = errMessage(err);
    return (
        /\b429\b/.test(raw) ||
        /RESOURCE_EXHAUSTED/i.test(raw) ||
        /exceeded your current quota/i.test(raw) ||
        /rate.?limit/i.test(raw)
    );
}


function fallbackGapAnalysis(business: any, keyword: string, liveCompetitors: any[] = []) {
    const rating = Number(business.rating) || 0;
    const reviews = Number(business.reviewsCount) || 0;
    const baseRank =
        rating >= 4.5 && reviews >= 80 ? 3 : rating >= 4.2 && reviews >= 30 ? 5 : rating >= 4 ? 8 : 12;
    const jitter = (n: number, d: number) => Math.min(20, Math.max(1, n + d));
    const grid = [
        [jitter(baseRank, 1), jitter(baseRank, 0), jitter(baseRank, 2)],
        [jitter(baseRank, 0), jitter(baseRank, -1), jitter(baseRank, 1)],
        [jitter(baseRank, 2), jitter(baseRank, 1), jitter(baseRank, 0)]
    ];
    const ranks = grid.flat();
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const top3 = Math.round((ranks.filter((r) => r <= 3).length / ranks.length) * 100);

    const competitors = [
        {
            name: `${business.name} (You)`,
            reviews,
            rating,
            posts: dashboardState.weeklyPosts || 0,
            photos: dashboardState.photoCount || 0,
            trend: 'up',
            lat: business.lat ?? null,
            lng: business.lng ?? null,
            address: business.address || '',
            placeId: business.placeId || ''
        },
        ...liveCompetitors.slice(0, 5).map((c: any) => ({
            name: c.name,
            reviews: c.reviews || c.user_ratings_total || 0,
            rating: c.rating || 0,
            posts: c.posts || 0,
            photos: c.photos || 0,
            trend: c.trend || 'flat',
            lat: c.lat ?? null,
            lng: c.lng ?? null,
            address: c.address || '',
            placeId: c.placeId || ''
        }))
    ];

    const competitorNames = competitors
        .slice(1)
        .map((c) => c.name)
        .filter(Boolean);
    const competitorLine = competitorNames.length
        ? `Same-service competitors in view: ${competitorNames.join(', ')}.`
        : 'No live same-service competitor list from Places yet — connect lat/lng on the business profile and ensure Places API is enabled.';

    const gapAnalysis = `${business.name} for "${keyword}": estimated GeoGrid average rank ~${avg.toFixed(1)} with ~${top3}% of cells in the Local 3-Pack (model fallback — Gemini quota unavailable). Profile shows ${rating || 'n/a'}★ from ${reviews} reviews. ${competitorLine} Prioritize GBP completeness, fresh posts/photos, and review reply rate to pull neighborhood cells toward ranks 1–3.`;

    return { gapAnalysis, grid, competitors };
}

function extractImage(response: any) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        const inline = part.inlineData;
        if (inline?.data) {
            return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`;
        }
    }
    return null;
}

function scoreProfile(profile: any) {
    const fields = ['name', 'category', 'address', 'phone', 'website', 'hours', 'attributes', 'description'];
    const filled = fields.filter((key) => String(profile[key] || '').trim()).length;
    return Math.round((filled / fields.length) * 100);
}

function pushActivity({ type, message, icon, color }: any) {
    const newActivity = {
        id: Date.now(),
        type,
        message,
        time: 'Just now',
        icon: icon || 'CheckCircle',
        color: color || 'text-[#F59E0B]'
    };
    dashboardState.activities = [newActivity, ...dashboardState.activities].slice(0, 12);
    persistAppState();
    return newActivity;
}

app.get('/api/status', (_req, res) => {
    res.json({
        gemini: Boolean(aiClient),
        dataForSeo: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
        places: requirePlacesConfigured(),
        textModel: TEXT_MODEL,
        imageModel: IMAGE_MODEL
    });
});


app.get('/api/business/upgrade-choice', requireAuth, requireFeature('local_presence'), async (req, res) => {
    try {
        const payload = await getLocalSeoUpgradeChoice(String((req as any).orgId || ''));
        res.json(payload);
    } catch (err: any) {
        console.error('upgrade-choice read error:', err);
        res.status(500).json({ error: err.message || 'Could not load local SEO setup choice.' });
    }
});

app.post('/api/business/upgrade-choice', requireAuth, requireFeature('local_presence'), async (req, res) => {
    const choice = String(req.body?.choice || '');
    if (choice !== 'booking' && choice !== 'new') {
        return res.status(400).json({ error: 'choice must be booking or new' });
    }
    try {
        const payload = await setLocalSeoUpgradeChoice(String((req as any).orgId || ''), choice);
        res.json(payload);
    } catch (err: any) {
        console.error('upgrade-choice write error:', err);
        res.status(500).json({ error: err.message || 'Could not save local SEO setup choice.' });
    }
});

app.get('/api/business', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    // If connectedBusiness has a placeId or name+address but rating/reviews are missing, refresh from Google Places
    if (connectedBusiness.connected && (connectedBusiness.rating == null || !connectedBusiness.reviews?.length) && requirePlacesConfigured()) {
        try {
            let placeDetails: any = null;
            if (connectedBusiness.placeId) {
                placeDetails = await getBusinessByPlaceId(connectedBusiness.placeId);
            }
            if (!placeDetails && connectedBusiness.name) {
                const searchQ = [connectedBusiness.name, connectedBusiness.address].filter(Boolean).join(', ');
                placeDetails = await searchBusiness(searchQ);
            }
            if (placeDetails) {
                if (placeDetails.rating != null && connectedBusiness.rating == null) {
                    connectedBusiness.rating = placeDetails.rating;
                }
                if (placeDetails.reviewsCount && !connectedBusiness.reviewsCount) {
                    connectedBusiness.reviewsCount = placeDetails.reviewsCount;
                }
                if (Array.isArray(placeDetails.reviews) && placeDetails.reviews.length && (!connectedBusiness.reviews || !connectedBusiness.reviews.length)) {
                    connectedBusiness.reviews = placeDetails.reviews;
                }
                if (!connectedBusiness.placeId && placeDetails.placeId) {
                    connectedBusiness.placeId = placeDetails.placeId;
                }
                if (connectedBusiness.lat == null && placeDetails.lat != null) {
                    connectedBusiness.lat = placeDetails.lat;
                    connectedBusiness.lng = placeDetails.lng;
                }
                await saveOrgToDb(req).catch(() => {});
            }
        } catch (err: any) {
            console.warn('[api/business] auto-enrich places failed:', err?.message || err);
        }
    }
    res.json(connectedBusiness);
});

app.post('/api/business/connect', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    const incoming = req.body || {};
    // Retain existing reviews, rating, reviewsCount, and placeId if not in incoming
    const existing = (connectedBusiness || {}) as any;
    connectedBusiness = {
        ...emptyBusiness(),
        ...existing,
        ...incoming,
        connected: true,
        rating: incoming.rating !== undefined ? incoming.rating : existing.rating,
        reviewsCount: incoming.reviewsCount !== undefined ? incoming.reviewsCount : (existing.reviewsCount || 0),
        reviews: Array.isArray(incoming.reviews) && incoming.reviews.length ? incoming.reviews : (Array.isArray(existing.reviews) ? existing.reviews : [])
    };
    (req as any).connectedBusiness = connectedBusiness;

    // If rating/reviews are still missing, try looking up via Places API
    if ((connectedBusiness.rating == null || !connectedBusiness.reviews?.length) && requirePlacesConfigured()) {
        try {
            let placeDetails: any = null;
            if (connectedBusiness.placeId) {
                placeDetails = await getBusinessByPlaceId(connectedBusiness.placeId);
            }
            if (!placeDetails && connectedBusiness.name) {
                const searchQ = [connectedBusiness.name, connectedBusiness.address].filter(Boolean).join(', ');
                placeDetails = await searchBusiness(searchQ);
            }
            if (placeDetails) {
                if (placeDetails.rating != null) connectedBusiness.rating = placeDetails.rating;
                if (placeDetails.reviewsCount) connectedBusiness.reviewsCount = placeDetails.reviewsCount;
                if (Array.isArray(placeDetails.reviews) && placeDetails.reviews.length) connectedBusiness.reviews = placeDetails.reviews;
                if (!connectedBusiness.placeId && placeDetails.placeId) connectedBusiness.placeId = placeDetails.placeId;
                if (connectedBusiness.lat == null && placeDetails.lat != null) {
                    connectedBusiness.lat = placeDetails.lat;
                    connectedBusiness.lng = placeDetails.lng;
                }
            }
        } catch (err: any) {
            console.warn('[business/connect] places enrich failed:', err?.message || err);
        }
    }

    const hasCoords =
        typeof connectedBusiness.lat === 'number' &&
        typeof connectedBusiness.lng === 'number' &&
        Number.isFinite(connectedBusiness.lat) &&
        Number.isFinite(connectedBusiness.lng);
    if (!hasCoords && connectedBusiness.address && requirePlacesConfigured()) {
        try {
            const query = [connectedBusiness.name, connectedBusiness.address].filter(Boolean).join(', ');
            const geo = await geocodeAddress(query || connectedBusiness.address);
            if (geo) {
                connectedBusiness.lat = geo.lat;
                connectedBusiness.lng = geo.lng;
            }
        } catch (err: any) {
            console.warn('Business geocode failed:', err?.message || err);
        }
    }

    dashboardState.completenessScore = scoreProfile(connectedBusiness);
    dashboardState.photoCount = 0;
    dashboardState.weeklyPosts = 0;
    dashboardState.reviewResponseRate = 0;
    pushActivity({
        type: 'places',
        message: `Connected "${connectedBusiness.name}" from Google Places.`,
        icon: 'CheckCircle',
        color: 'text-[#F59E0B]'
    });
    await saveOrgToDb(req);
    res.json({ success: true, business: connectedBusiness, stats: dashboardState });
});

app.post('/api/places/search', requireAuth, requireFeature('local_presence'), async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    
    if (requirePlacesConfigured()) {
        try {
            const place = await searchBusiness(String(query).trim());
            if (!place) {
                return res.status(404).json({ error: 'No matching listing found.' });
            }
            return res.json(place);
        } catch (err: any) {
            console.error('Places API search error:', err);
            
            if (!aiClient) {
                return res.status(502).json({
                    error: `Google Places failed: ${errMessage(err)}. Check the key has Places API enabled.`
                });
            }
            console.warn('Falling back to Gemini Places search…');
        }
    }

    if (!requireGemini(res)) return;

    try {
        const text = await generateText(
            `Find the real Google Business Profile that best matches: "${query}".
Use only live public information. Do not invent a business, address, phone, people, or reviews.
If nothing matches, return {"found": false, "error": "No matching listing found"}.
If found, return JSON only:
{"found": true, "name": "", "rating": 0, "reviewsCount": 0, "address": "", "category": "", "phone": "", "website": "", "hours": "", "description": "", "attributes": "", "reviews": [{"author": "", "rating": 0, "date": "", "text": ""}]}
reviews must be real public snippets only. If you cannot verify reviews, use [].`,
            { tools: [{ googleSearch: {} }] }
        );
        const data = parseJsonFromText(text);
        if (!data || data.found === false) {
            return res.status(404).json({ error: data?.error || 'No matching listing found.' });
        }
        if (!data.name) {
            return res.status(404).json({ error: 'Search did not return a verified listing.' });
        }
        res.json({
            name: data.name,
            rating: data.rating ?? null,
            reviewsCount: data.reviewsCount ?? 0,
            address: data.address || '',
            category: data.category || '',
            phone: data.phone || '',
            website: data.website || '',
            hours: data.hours || '',
            description: data.description || '',
            attributes: data.attributes || '',
            reviews: Array.isArray(data.reviews) ? data.reviews : []
        });
    } catch (err: any) {
        console.error('Places search error:', err);
        res.status(502).json({ error: `Listing search failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/audit', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    const incoming = req.body || {};
    if (incoming.name) {
        connectedBusiness = {
            ...connectedBusiness,
            ...incoming,
            connected: true,
            reviews: Array.isArray(incoming.reviews) ? incoming.reviews : connectedBusiness.reviews
        };
        (req as any).connectedBusiness = connectedBusiness;
        dashboardState.completenessScore = scoreProfile(connectedBusiness);
        await saveOrgToDb(req);
    }
    if (!requireBusiness(res)) return;
    const profile = { ...connectedBusiness, ...req.body };

    try {
        const text = await generateText(
            `Audit this Google Business Profile for Local 3-Pack ranking. Use only the provided fields. Do not invent extra facts.
Name: ${profile.name}
Category: ${profile.category}
Address: ${profile.address}
Phone: ${profile.phone}
Website: ${profile.website}
Description: ${profile.description}
Hours: ${profile.hours}
Attributes: ${profile.attributes}
Return JSON only: score (0-100), optimizedDescription, recommendations (array of specific actions).`
        );
        const data = parseJsonFromText(text);
        if (!data || data.score == null) {
            return res.status(502).json({ error: 'Gemini returned an unusable audit.' });
        }
        dashboardState.completenessScore = data.score;
        res.json(data);
    } catch (err: any) {
        console.error('Audit error:', err);
        res.status(502).json({ error: `Gemini audit failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/post-copy', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const { postType, tone, businessName, topic, details, eventTitle, date, time } = req.body || {};
    const name = businessName || connectedBusiness.name;
    const kind = String(postType || 'update');
    const lines = [
        topic ? `Topic: ${String(topic).slice(0, 200)}` : '',
        kind === 'offer' && details
            ? `Offer details the user provided. Use only these. Do not invent prices or terms: ${String(details).slice(0, 1000)}`
            : '',
        kind === 'event' && eventTitle ? `Event title: ${String(eventTitle).slice(0, 200)}` : '',
        kind === 'event' && details ? `Event details: ${String(details).slice(0, 1000)}` : '',
        date ? `Date: ${String(date).slice(0, 40)}` : '',
        time ? `Time: ${String(time).slice(0, 40)}` : ''
    ].filter(Boolean);

    try {
        const copy = await generateText(
            `Write a Google Business Profile ${kind} post for "${name}" (${connectedBusiness.category}) at ${connectedBusiness.address}.
Tone: ${tone || 'professional'}.
${lines.join('\n')}
Use only real details from this listing and the details above. Do not invent offers, prices, or events.
Keep under 120 words.`
        );
        if (!copy) return res.status(502).json({ error: 'Gemini returned empty post copy.' });
        res.json({ copy });
    } catch (err: any) {
        console.error('Post copy error:', err);
        res.status(502).json({ error: `Gemini post copy failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/post-image', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const body = req.body || {};
    const name = String(body.businessName || connectedBusiness.name || '').trim();
    const category = String(connectedBusiness.category || 'local business').trim();
    const address = String(connectedBusiness.address || '').trim();
    if (!name || !address) {
        return res.status(400).json({
            error: 'Business name and address are required before generating a post image. Save your business profile first.'
        });
    }
    const postType = String(body.postType || 'update').slice(0, 40);
    const topic = String(body.topic || '').slice(0, 200);
    const details = String(body.details || '').slice(0, 1000);
    const eventTitle = String(body.eventTitle || '').slice(0, 200);
    const date = String(body.date || '').slice(0, 40);
    const time = String(body.time || '').slice(0, 40);
    const detailLines = [
        topic ? `Post topic: ${topic}` : '',
        postType === 'offer' && details ? `Offer details (use as scene context only): ${details}` : '',
        postType === 'event' && eventTitle ? `Event title: ${eventTitle}` : '',
        postType === 'event' && details ? `Event details: ${details}` : '',
        details && postType !== 'offer' && postType !== 'event' ? `Post details: ${details}` : '',
        date ? `Date: ${date}` : '',
        time ? `Time: ${time}` : ''
    ]
        .filter(Boolean)
        .join('\n');

    try {
        const response = await aiClient.models.generateContent({
            model: IMAGE_MODEL,
            contents: `Create one photorealistic Google Business Profile promotional photo for this exact local business — not a random stock scene.
Business name: ${name}
Trade / category: ${category}
Real address / area: ${address}
GBP post type: ${postType}
${detailLines ? `${detailLines}\n` : ''}
Requirements:
- The scene must clearly fit this business name, trade, and location (UK-realistic local business look when the address is in the UK).
- Match the post type (${postType}): e.g. offer → service/work context; event → venue/community feel; update → day-to-day business activity.
- Natural light, real-world setting for this trade at this area.
- No text overlays, no logos, no readable storefront lettering, no watermarks, no invented brand names or fake people names.
- Do not invent a different business, city, or unrelated industry.`
        });
        const imageUrl = extractImage(response);
        if (!imageUrl) return res.status(502).json({ error: 'Gemini did not return an image. Free image quota may be exhausted.' });
        let stored: string | null = null;
        try {
            stored = await uploadPostImageDataUrl(imageUrl, String((req as any).orgId || ''));
        } catch (uploadErr) {
            console.error('Post image S3 upload failed:', uploadErr);
        }
        res.json({ imageUrl: stored || imageUrl });
    } catch (err: any) {
        console.error('Post image error:', err);
        if (/RESOURCE_EXHAUSTED|"code":\s*429/.test(errMessage(err))) {
            return res.status(429).json({
                error: 'Image generation quota exhausted for the Gemini key. Make sure billing is active on the key\'s Google project (AI Studio shows Free tier for this key).'
            });
        }
        res.status(502).json({ error: `Gemini image failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/post-image/presign', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    try {
        const data = await createUploadPresign({
            kind: 'post',
            contentType: String(req.body?.contentType || 'image/jpeg'),
            orgId: String((req as any).orgId || '')
        });
        res.json(data);
    } catch (err: any) {
        res.status(err.status || 500).json({ error: err.message || 'Presign failed' });
    }
});

app.get('/api/ai/gbp-drafts', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), (_req, res) => {
    const drafts = Array.isArray(dashboardState.gbpDrafts) ? dashboardState.gbpDrafts : [];
    res.json({ drafts });
});

app.post('/api/ai/gbp-drafts', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    const body = req.body || {};
    const draft = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        postType: String(body.postType || 'update').slice(0, 40),
        tone: String(body.tone || 'professional').slice(0, 40),
        topic: String(body.topic || '').slice(0, 200),
        details: String(body.details || '').slice(0, 1000),
        eventTitle: String(body.eventTitle || '').slice(0, 200),
        cta: String(body.cta || 'Book').slice(0, 40),
        date: String(body.date || '').slice(0, 40),
        time: String(body.time || '').slice(0, 40),
        copy: String(body.copy || '').slice(0, 4000),
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : ''
    };
    const prev = Array.isArray(dashboardState.gbpDrafts) ? dashboardState.gbpDrafts : [];
    dashboardState.gbpDrafts = [draft, ...prev].slice(0, 8);
    await saveOrgToDb(req);
    res.json({ draft, drafts: dashboardState.gbpDrafts });
});

app.post('/api/ai/review-reply', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const { reviewText, rating, author, tone } = req.body;

    try {
        const reply = await generateText(
            `Draft a Google Business Profile review reply for ${connectedBusiness.name} (${connectedBusiness.category}) in ${connectedBusiness.address}.
Author: ${author}. Rating: ${rating}. Review: "${reviewText}".
Tone: ${tone}.
Do not invent policies, discounts, or staff names. Under 80 words.`
        );
        if (!reply) return res.status(502).json({ error: 'Gemini returned an empty reply.' });
        res.json({ reply });
    } catch (err: any) {
        console.error('Review reply error:', err);
        res.status(502).json({ error: `Gemini review reply failed: ${errMessage(err)}` });
    }
});

// ── Review Growth Engine: reviews collected via QR/NFC/email/SMS links ───────
const reviewGate = [requireAuth, hydrateOrgFromDb, requireFeature('local_presence')] as const;

app.get('/api/reviews/hub', ...reviewGate, async (req, res) => {
    try {
        const orgId = String((req as any).orgId || '');
        const slug = await orgSlugFor(orgId);
        const links: Record<string, string> = {};
        for (const src of REVIEW_SOURCES) links[src] = slug ? reviewLink(slug, src) : '';
        res.json({
            businessName: connectedBusiness.name || '',
            slug,
            links,
            googleReviewUrl: googleReviewUrl(connectedBusiness.placeId),
            collected: await listSubmissions(orgId),
            sources: await sourceCounts(orgId, 30),
            googleReplies: (dashboardState as any).reviewReplies || {},
            googleReviews: (dashboardState as any).googleReviews?.items || [],
            googleSyncedAt: (dashboardState as any).googleReviews?.syncedAt || null,
            googleTotal: (dashboardState as any).googleReviews?.total || null,
            canSync: reviewSyncConfigured() && Boolean(connectedBusiness.placeId)
        });
    } catch (err: any) {
        res.status(500).json({ error: errMessage(err) });
    }
});

// Pulls the full list of existing Google reviews (async DataForSEO task: start, then poll).
app.post('/api/reviews/sync', ...reviewGate, async (req, res) => {
    if (!reviewSyncConfigured()) return res.status(503).json({ error: 'Google review sync needs DataForSEO.', code: 'not_configured' });
    const placeId = String(connectedBusiness.placeId || '').trim();
    if (!placeId) return res.status(400).json({ error: 'Connect your Google business on the Business profile page first.' });
    const pending = (dashboardState as any).googleReviewSync;
    if (pending?.taskId && Date.now() - new Date(pending.startedAt).getTime() < 10 * 60 * 1000) return res.json({ status: 'pending' });
    try {
        const taskId = await startReviewTask(placeId, { address: connectedBusiness.address, lat: connectedBusiness.lat, lng: connectedBusiness.lng });
        (dashboardState as any).googleReviewSync = { taskId, startedAt: new Date().toISOString() };
        await saveOrgToDb(req);
        res.json({ status: 'pending' });
    } catch (err: any) {
        console.warn('[reviews] sync start failed:', errMessage(err));
        res.status(502).json({ error: `Could not start the Google review sync: ${errMessage(err)}` });
    }
});

app.get('/api/reviews/sync', ...reviewGate, async (req, res) => {
    const pending = (dashboardState as any).googleReviewSync;
    if (!pending?.taskId) return res.json({ status: 'idle' });
    try {
        const result = await fetchReviewTask(String(pending.taskId));
        if (result.status === 'pending') return res.json({ status: 'pending' });
        (dashboardState as any).googleReviews = { items: result.reviews, total: result.total, syncedAt: new Date().toISOString() };
        (dashboardState as any).googleReviewSync = null;
        await saveOrgToDb(req);
        res.json({ status: 'done', count: result.reviews.length });
    } catch (err: any) {
        (dashboardState as any).googleReviewSync = null;
        await saveOrgToDb(req).catch(() => undefined);
        console.warn('[reviews] sync failed:', errMessage(err));
        res.status(502).json({ error: `Google review sync failed: ${errMessage(err)}` });
    }
});

app.post('/api/reviews/hub/:id/read', ...reviewGate, async (req, res) => {
    await markRead(String((req as any).orgId || ''), String(req.params.id));
    res.json({ ok: true });
});

app.post('/api/reviews/hub/:id/reply', ...reviewGate, async (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Write a reply first.' });
    const saved = await saveReply(String((req as any).orgId || ''), String(req.params.id), text);
    if (!saved) return res.status(404).json({ error: 'Review not found.' });
    let emailed = false;
    if (saved.email) {
        try {
            await emailReviewReply(saved.email, connectedBusiness.name || 'Our team', text);
            emailed = true;
        } catch (err: any) {
            console.warn('[reviews] reply email failed:', errMessage(err));
        }
    }
    res.json({ review: saved, emailed });
});

app.post('/api/reviews/google-reply', ...reviewGate, async (req, res) => {
    const key = String(req.body?.key || '').slice(0, 120);
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!key || !text) return res.status(400).json({ error: 'Write a reply first.' });
    const replies = { ...((dashboardState as any).reviewReplies || {}), [key]: { text, at: new Date().toISOString() } };
    (dashboardState as any).reviewReplies = replies;
    await saveOrgToDb(req);
    res.json({ googleReplies: replies });
});

app.post('/api/reviews/campaign', ...reviewGate, async (req, res) => {
    const orgId = String((req as any).orgId || '');
    const slug = await orgSlugFor(orgId);
    if (!slug) return res.status(400).json({ error: 'Your review page is not ready yet.' });
    const split = (v: any) => String(v || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    const emails = Array.from(new Set(split(req.body?.emails).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))).slice(0, 50);
    const phones = Array.from(new Set(split(req.body?.phones).filter((p) => p.replace(/\D/g, '').length >= 9))).slice(0, 50);
    if (!emails.length && !phones.length) return res.status(400).json({ error: 'Add at least one valid email address or phone number.' });
    const name = connectedBusiness.name || 'our business';
    const message = String(req.body?.message || '').slice(0, 500);
    let emailed = 0;
    let texted = 0;
    let failed = 0;
    for (const to of emails) {
        try {
            await emailReviewRequest(to, name, reviewLink(slug, 'email'), message);
            emailed += 1;
        } catch (err: any) {
            failed += 1;
            console.warn('[reviews] campaign email failed:', errMessage(err));
        }
    }
    for (const to of phones) {
        try {
            const r: any = await sendSms(to, `${message || `Thanks for choosing ${name}! Could you leave us a quick review?`} ${reviewLink(slug, 'sms')}`);
            if (r?.sent) texted += 1;
            else failed += 1;
        } catch {
            failed += 1;
        }
    }
    pushActivity({ type: 'review', message: `Sent review requests to ${emailed + texted} customer(s).`, icon: 'Send', color: 'text-[var(--brand-primary)]' });
    await saveOrgToDb(req);
    res.json({ emailed, texted, failed });
});

app.post('/api/ai/qa-answer', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const { question, kb } = req.body;

    try {
        const answer = await generateText(
            `Answer this public Google Business Profile question for ${connectedBusiness.name}.
Question: "${question}"
Knowledge base (only source of truth): "${kb || 'empty'}"
If the knowledge base does not contain the answer, say you do not have that detail and ask them to contact the business. Do not invent policies. Under 60 words.`
        );
        if (!answer) return res.status(502).json({ error: 'Gemini returned an empty answer.' });
        res.json({ answer });
    } catch (err: any) {
        console.error('Q&A error:', err);
        res.status(502).json({ error: `Gemini Q&A failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/gap-analysis', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    if (!requireBusiness(res)) return;
    const bodyKeyword = String(req.body?.keyword || '').trim();
    const keyword = bodyKeyword || `${connectedBusiness.category || 'local business'} near me`;

    
    const hasCoords =
        typeof connectedBusiness.lat === 'number' &&
        typeof connectedBusiness.lng === 'number' &&
        Number.isFinite(connectedBusiness.lat) &&
        Number.isFinite(connectedBusiness.lng);
    if (!hasCoords && connectedBusiness.address && requirePlacesConfigured()) {
        try {
            const query = [connectedBusiness.name, connectedBusiness.address].filter(Boolean).join(', ');
            const geo = await geocodeAddress(query || connectedBusiness.address);
            if (geo) {
                connectedBusiness.lat = geo.lat;
                connectedBusiness.lng = geo.lng;
                await saveOrgToDb(req).catch(() => undefined);
            }
        } catch (err: any) {
            console.warn('Gap analysis geocode failed:', err?.message || err);
        }
    }

    let liveCompetitors: any[] = [];
    if (requirePlacesConfigured() && connectedBusiness.lat != null && connectedBusiness.lng != null) {
        try {
            liveCompetitors = await nearbyCompetitors({
                lat: connectedBusiness.lat,
                lng: connectedBusiness.lng,
                keyword,
                category: connectedBusiness.category || '',
                excludeName: connectedBusiness.name,
                excludePlaceId: connectedBusiness.placeId || ''
            });
        } catch (err: any) {
            console.warn('Nearby competitors lookup failed:', err.message);
        }
    }

    const applyGridStats = (data: any) => {
        if (Array.isArray(data.grid) && data.grid.length === 3) {
            const ranks = data.grid.flat().filter((n: any) => typeof n === 'number');
            if (ranks.length) {
                dashboardState.visibilityRank = Number((ranks.reduce((a: number, b: number) => a + b, 0) / ranks.length).toFixed(1));
                dashboardState.top3Percentage = Math.round((ranks.filter((r: number) => r <= 3).length / ranks.length) * 100);
            }
        }
        const entry = {
            keyword,
            avgRank: Number(dashboardState.visibilityRank) || 0,
            top3Percentage: Number(dashboardState.top3Percentage) || 0,
            updatedAt: new Date().toISOString()
        };
        const existing = Array.isArray(dashboardState.trackedKeywords) ? dashboardState.trackedKeywords : [];
        const next = [entry, ...existing.filter((k: any) => String(k?.keyword || '').toLowerCase() !== keyword.toLowerCase())].slice(
            0,
            12
        );
        dashboardState.trackedKeywords = next;
        data.trackedKeywords = next;
        const competitors = (Array.isArray(data.competitors) ? data.competitors : []).slice(0, 6).map((row: any) => ({
            name: String(row?.name || '').slice(0, 160),
            reviews: Number(row?.reviews) || 0,
            rating: Number(row?.rating) || 0,
            posts: Number(row?.posts) || 0,
            photos: Number(row?.photos) || 0,
            trend: row?.trend === 'down' ? 'down' : 'up',
            lat: Number.isFinite(Number(row?.lat)) ? Number(row.lat) : null,
            lng: Number.isFinite(Number(row?.lng)) ? Number(row.lng) : null,
            placeId: String(row?.placeId || '').slice(0, 120),
            address: String(row?.address || '').slice(0, 240)
        }));
        const run = {
            keyword,
            gapAnalysis: String(data.gapAnalysis || '').slice(0, 2500),
            grid: Array.isArray(data.grid) ? data.grid : [],
            competitors,
            center: data.center || null,
            avgRank: entry.avgRank,
            top3Percentage: entry.top3Percentage,
            updatedAt: entry.updatedAt
        };
        const prior = Array.isArray(dashboardState.gapAnalyses) ? dashboardState.gapAnalyses : [];
        dashboardState.gapAnalyses = [
            run,
            ...prior.filter((item: any) => String(item?.keyword || '').toLowerCase() !== keyword.toLowerCase())
        ].slice(0, 12);
        data.gapAnalyses = dashboardState.gapAnalyses;
    };

    const withCompetitors = (data: any) => {
        
        data.competitors = [
            {
                name: `${connectedBusiness.name} (You)`,
                reviews: connectedBusiness.reviewsCount || 0,
                rating: connectedBusiness.rating || 0,
                posts: dashboardState.weeklyPosts || 0,
                photos: dashboardState.photoCount || 0,
                trend: 'up',
                lat: connectedBusiness.lat ?? null,
                lng: connectedBusiness.lng ?? null,
                placeId: connectedBusiness.placeId || '',
                address: connectedBusiness.address || ''
            },
            ...liveCompetitors.slice(0, 5)
        ];
        return data;
    };

    const withMeta = (data: any) => {
        data.keyword = keyword;
        if (
            typeof connectedBusiness.lat === 'number' &&
            typeof connectedBusiness.lng === 'number' &&
            Number.isFinite(connectedBusiness.lat) &&
            Number.isFinite(connectedBusiness.lng)
        ) {
            data.center = { lat: connectedBusiness.lat, lng: connectedBusiness.lng };
        }
        return data;
    };

    
    
    if (!aiClient) {
        const data = withMeta(withCompetitors(fallbackGapAnalysis(connectedBusiness, keyword, liveCompetitors)));
        applyGridStats(data);
        await saveOrgToDb(req);
        return res.json(data);
    }

    try {
        const competitorBlock = liveCompetitors.length
            ? `Live same-service competitors from Google Places text search for "${keyword}" (use these names/ratings; do not invent others):\n${JSON.stringify(liveCompetitors)}`
            : 'No live competitor list from Places — do not invent competitor businesses; return only the "You" row if needed.';

        const text = await generateText(
            `Local SEO gap analysis for the real business "${connectedBusiness.name}" at ${connectedBusiness.address}.
Category: ${connectedBusiness.category || 'local business'}
Rating: ${connectedBusiness.rating} (${connectedBusiness.reviewsCount} reviews)
Target query: "${keyword}".
${competitorBlock}
Use the provided Places data only. Do not invent businesses. Competitors must be the same service type as the business (e.g. other restaurants for a restaurant) — never campuses, grocery chains, or unrelated POIs.
Return JSON only:
{"gapAnalysis": "", "grid": [[1,2,3],[4,5,6],[7,8,9]], "competitors": [{"name": "", "reviews": 0, "rating": 0, "posts": 0, "photos": 0, "trend": "up"}]}
grid is a 3x3 of estimated Local Pack ranks 1-20 for neighborhood cells around the business.
First competitors item must be "${connectedBusiness.name} (You)" with reviews=${connectedBusiness.reviewsCount || 0} and rating=${connectedBusiness.rating || 0}. Include up to 5 real same-service competitors from the Places list when available.`
        );
        const data = parseJsonFromText(text);
        if (!data?.gapAnalysis) {
            console.warn('[gap-analysis] unusable Gemini JSON — using fallback');
            const fallback = withMeta(withCompetitors(fallbackGapAnalysis(connectedBusiness, keyword, liveCompetitors)));
            applyGridStats(fallback);
            await saveOrgToDb(req);
            return res.json(fallback);
        }

        withCompetitors(data);
        withMeta(data);
        applyGridStats(data);
        await saveOrgToDb(req);
        res.json(data);
    } catch (err: any) {
        console.error('Gap analysis error (serving fallback):', errMessage(err));
        if (isGeminiQuotaError(err)) {
            console.warn('[gap-analysis] Gemini quota/rate limit — using Places/fallback path');
        }
        const fallback = withMeta(withCompetitors(fallbackGapAnalysis(connectedBusiness, keyword, liveCompetitors)));
        applyGridStats(fallback);
        await saveOrgToDb(req);
        res.json(fallback);
    }
});

function centerOverride(body: any) {
    const lat = Number(body?.center?.lat);
    const lng = Number(body?.center?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
    }
    return null;
}

async function ensureBusinessCenter(req: any) {
    const hasCoords =
        typeof connectedBusiness.lat === 'number' &&
        typeof connectedBusiness.lng === 'number' &&
        Number.isFinite(connectedBusiness.lat) &&
        Number.isFinite(connectedBusiness.lng);
    if (!hasCoords && connectedBusiness.address && requirePlacesConfigured()) {
        try {
            const query = [connectedBusiness.name, connectedBusiness.address].filter(Boolean).join(', ');
            const geo = await geocodeAddress(query || connectedBusiness.address);
            if (geo) {
                connectedBusiness.lat = geo.lat;
                connectedBusiness.lng = geo.lng;
                await saveOrgToDb(req).catch(() => undefined);
            }
        } catch (err: any) {
            console.warn('Rank scan geocode failed:', err?.message || err);
        }
    }
    if (typeof connectedBusiness.lat === 'number' && typeof connectedBusiness.lng === 'number') {
        return { lat: connectedBusiness.lat, lng: connectedBusiness.lng };
    }
    return null;
}

app.get('/api/rank/state', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), (_req, res) => {
    res.json({
        trackedKeywords: Array.isArray(dashboardState.trackedKeywords) ? dashboardState.trackedKeywords : [],
        gapAnalyses: Array.isArray(dashboardState.gapAnalyses) ? dashboardState.gapAnalyses : [],
        realScansAvailable: gridConfigured()
    });
});

app.get('/api/rank/suggestions', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), (_req, res) => {
    const category = String(connectedBusiness.category || '').trim().toLowerCase();
    const city = cityFromAddress(String(connectedBusiness.address || '')).toLowerCase();
    const services = String(connectedBusiness.attributes || '')
        .split(/[,;\n]/)
        .map((x: string) => x.trim().toLowerCase())
        .filter((x: string) => x.length > 2 && x.length < 50 && x !== category)
        .slice(0, 5);
    const list = [...suggestKeywords(connectedBusiness as any)];
    for (const svc of services) list.push(city ? `${svc} ${city}` : `${svc} near me`);
    if (city) for (const svc of services.slice(0, 3)) list.push(`best ${svc} in ${city}`);
    const seen = new Set<string>();
    const keywords = list.filter((k) => {
        const key = k.toLowerCase();
        if (!k || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    res.json({ keywords: keywords.slice(0, 12) });
});

app.post('/api/rank/scan-row', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    if (!requireBusiness(res)) return;
    if (!gridConfigured()) {
        return res.status(503).json({ error: 'Real rank scans need DataForSEO.', code: 'not_configured' });
    }
    const keyword = String(req.body?.keyword || '').trim().slice(0, 120);
    const size = normalizeGridSize(req.body?.gridSize);
    const row = Number(req.body?.row);
    if (!keyword) return res.status(400).json({ error: 'Keyword is required.' });
    if (!Number.isInteger(row) || row < 0 || row >= size) return res.status(400).json({ error: 'Invalid grid row.' });
    const center = centerOverride(req.body) || (await ensureBusinessCenter(req));
    if (!center) {
        return res.status(400).json({ error: 'Your business needs a full address so we can locate the grid center.' });
    }
    const col = req.body?.col;
    if (col !== undefined) {
        const c = Number(col);
        if (!Number.isInteger(c) || c < 0 || c >= size) return res.status(400).json({ error: 'Invalid grid column.' });
        try {
            const cell = await rankGridCell({
                keyword,
                business: { name: connectedBusiness.name, placeId: connectedBusiness.placeId },
                center,
                size,
                row,
                col: c
            });
            return res.json({ row, col: c, size, center, ...cell });
        } catch (err: any) {
            console.error('Rank scan cell error:', errMessage(err));
            return res.status(502).json({ error: `Rank scan failed: ${errMessage(err)}` });
        }
    }
    try {
        const data = await rankGridRow({
            keyword,
            business: { name: connectedBusiness.name, placeId: connectedBusiness.placeId },
            center,
            size,
            row
        });
        res.json({ row, size, center, ...data });
    } catch (err: any) {
        console.error('Rank scan row error:', errMessage(err));
        res.status(502).json({ error: `Rank scan failed: ${errMessage(err)}` });
    }
});

app.post('/api/rank/scan-finish', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    if (!requireBusiness(res)) return;
    const keyword = String(req.body?.keyword || '').trim().slice(0, 120);
    const size = normalizeGridSize(req.body?.gridSize);
    const rawGrid = Array.isArray(req.body?.grid) ? req.body.grid : [];
    const grid: number[][] = rawGrid.map((r: any) =>
        (Array.isArray(r) ? r : []).map((n: any) => Math.max(1, Math.min(21, Math.round(Number(n)) || 21)))
    );
    if (!keyword || grid.length !== size || grid.some((r) => r.length !== size)) {
        return res.status(400).json({ error: 'Incomplete scan results.' });
    }
    const tally: Record<string, number> = {};
    for (const [name, count] of Object.entries(req.body?.tally || {})) {
        const n = Number(count);
        if (name && Number.isFinite(n) && n > 0) tally[String(name).slice(0, 160)] = Math.min(n, size * size);
    }
    const center = centerOverride(req.body) || (await ensureBusinessCenter(req));
    const nearby = (Array.isArray(req.body?.competitors) ? req.body.competitors : [])
        .slice(0, 12)
        .map((c: any) => ({
            name: String(c?.name || '').slice(0, 160),
            lat: Number.isFinite(Number(c?.lat)) ? Number(c.lat) : null,
            lng: Number.isFinite(Number(c?.lng)) ? Number(c.lng) : null,
            rating: Number(c?.rating) || 0,
            reviews: Number(c?.reviews) || 0
        }))
        .filter((c: any) => c.name && c.lat != null && c.lng != null);
    const { avgRank, top3Percentage } = summarizeGrid(grid);
    const business = { name: connectedBusiness.name, placeId: connectedBusiness.placeId };
    const share = competitorShare(tally, business, size * size);
    const health = optimizationHealth(avgRank, top3Percentage, scoreProfile(connectedBusiness));
    const updatedAt = new Date().toISOString();

    const existing: any[] = Array.isArray(dashboardState.trackedKeywords) ? dashboardState.trackedKeywords : [];
    const prev = existing.find((k: any) => String(k?.keyword || '').toLowerCase() === keyword.toLowerCase());
    const history = [
        ...(Array.isArray(prev?.history) ? prev.history : []),
        { avgRank, top3Percentage, updatedAt }
    ].slice(-10);
    const entry = {
        keyword,
        avgRank,
        top3Percentage,
        updatedAt,
        previousAvgRank: typeof prev?.avgRank === 'number' && prev.avgRank > 0 ? prev.avgRank : null,
        health,
        history
    };
    dashboardState.trackedKeywords = [
        entry,
        ...existing.filter((k: any) => String(k?.keyword || '').toLowerCase() !== keyword.toLowerCase())
    ].slice(0, 12);
    dashboardState.visibilityRank = avgRank;
    dashboardState.top3Percentage = top3Percentage;

    const run = {
        keyword,
        gapAnalysis: '',
        grid,
        gridSize: size,
        competitors: nearby,
        competitorShare: share,
        center,
        avgRank,
        top3Percentage,
        updatedAt
    };
    const prior: any[] = Array.isArray(dashboardState.gapAnalyses) ? dashboardState.gapAnalyses : [];
    dashboardState.gapAnalyses = [
        run,
        ...prior.filter((item: any) => String(item?.keyword || '').toLowerCase() !== keyword.toLowerCase())
    ].slice(0, 12);
    (dashboardState as any).rankInsights = null;
    await saveOrgToDb(req);
    res.json({ run, trackedKeywords: dashboardState.trackedKeywords, gapAnalyses: dashboardState.gapAnalyses });
});

app.post('/api/ai/rank-insights', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    const tracked: any[] = Array.isArray(dashboardState.trackedKeywords) ? dashboardState.trackedKeywords : [];
    const runs: any[] = Array.isArray(dashboardState.gapAnalyses) ? dashboardState.gapAnalyses : [];
    const cached = (dashboardState as any).rankInsights;
    if (cached && !req.body?.refresh) return res.json(cached);
    if (!tracked.length) return res.json({ insights: [], opportunities: [], generatedAt: null });

    const opportunities = tracked
        .filter((k) => k.avgRank >= 4 && k.avgRank <= 10)
        .sort((a, b) => a.avgRank - b.avgRank)
        .slice(0, 3)
        .map((k) => ({
            keyword: k.keyword,
            rank: Math.round(k.avgRank),
            action: { label: k.avgRank <= 6 ? 'Request Review' : 'Add Q&A', to: k.avgRank <= 6 ? '/reviews' : '/qa' }
        }));

    const facts: any[] = [];
    for (const k of tracked) {
        if (typeof k.previousAvgRank === 'number' && k.avgRank - k.previousAvgRank >= 0.5) {
            facts.push({
                type: 'drop',
                keyword: k.keyword,
                from: k.previousAvgRank,
                to: k.avgRank,
                fix: { label: 'Upload project gallery', to: '/media' }
            });
        }
    }
    const lead = runs[0];
    const rival = (lead?.competitorShare || []).find((c: any) => !c.isYou);
    const you = (lead?.competitorShare || []).find((c: any) => c.isYou);
    if (lead && rival) {
        facts.push({
            type: 'competitor',
            keyword: lead.keyword,
            rival: rival.name,
            rivalShare: rival.sharePct,
            yourShare: you?.sharePct || 0,
            fix: { label: 'Generate Counter-Post', to: '/posts' }
        });
    }
    if (!facts.length && lead) {
        facts.push({
            type: 'status',
            keyword: lead.keyword,
            avgRank: lead.avgRank,
            top3Percentage: lead.top3Percentage,
            fix: { label: 'Create a post', to: '/posts' }
        });
    }

    const plain = facts.map((f) => {
        if (f.type === 'drop') {
            return {
                type: 'drop',
                title: `Rank Drop Detected: "${f.keyword}"`,
                body: `Your average pack rank moved from ${f.from} to ${f.to}. Fresh photos, posts and reviews usually recover local visibility.`,
                action: f.fix
            };
        }
        if (f.type === 'competitor') {
            return {
                type: 'competitor',
                title: `Competitor Movement: "${f.keyword}"`,
                body: `${f.rival} holds ${f.rivalShare}% of top-3 spots across your grid versus your ${f.yourShare}%.`,
                action: f.fix
            };
        }
        return {
            type: 'status',
            title: `Current standing: "${f.keyword}"`,
            body: `Average rank ${f.avgRank} with ${f.top3Percentage}% of the grid in the Local 3-Pack.`,
            action: f.fix
        };
    });

    let insights = plain;
    if (aiClient && facts.length) {
        try {
            const text = await generateText(
                `You are a local SEO analyst for "${connectedBusiness.name}" (${connectedBusiness.category || 'local business'}).
Write one short insight (max 35 words, plain, no invented facts) for each fact below, in the same order.
Facts: ${JSON.stringify(facts)}
Return JSON only: {"bodies": ["..."]}`
            );
            const parsed = parseJsonFromText(text);
            if (Array.isArray(parsed?.bodies) && parsed.bodies.length === plain.length) {
                insights = plain.map((p, i) => ({ ...p, body: String(parsed.bodies[i] || p.body).slice(0, 280) }));
            }
        } catch (err: any) {
            console.warn('[rank-insights] Gemini unavailable, using computed text:', errMessage(err));
        }
    }

    const payload = { insights, opportunities, generatedAt: new Date().toISOString() };
    (dashboardState as any).rankInsights = payload;
    await saveOrgToDb(req);
    res.json(payload);
});

// ── Visibility Tracker (keyword rank tracking at the business location) ─────
function trackerList(): TrackerKeyword[] {
    const raw = (dashboardState as any).visibilityTracker;
    return Array.isArray(raw?.keywords) ? raw.keywords : [];
}

function setTrackerList(keywords: TrackerKeyword[]) {
    (dashboardState as any).visibilityTracker = { keywords, updatedAt: new Date().toISOString() };
}

app.get('/api/visibility-tracker', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), (_req, res) => {
    res.json({
        keywords: trackerList(),
        configured: trackerConfigured(),
        business: {
            name: connectedBusiness.name || '',
            category: connectedBusiness.category || '',
            city: cityFromAddress(String(connectedBusiness.address || '')),
            connected: Boolean(connectedBusiness.connected && connectedBusiness.name)
        },
        max: MAX_TRACKED_KEYWORDS
    });
});

app.get('/api/visibility-tracker/suggestions', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    const tracked = new Set(trackerList().map((k) => k.keyword));
    const address = String(connectedBusiness.address || '');
    const city = cleanKeyword(cityFromAddress(address));
    const typed = cleanKeyword(req.query?.q);
    if (typed.length >= 3) {
        // Suggestions for whatever the user is typing (e.g. "facial"), independent of the profile category.
        const geoQ = { address, lat: connectedBusiness.lat, lng: connectedBusiness.lng };
        const related = await fetchRelatedKeywords(city ? [typed, `${typed} ${city}`] : [typed], geoQ);
        const ideas = [typed, `${typed} near me`, `best ${typed} near me`, `${typed} cost`, `${typed} treatment`, ...(city ? [`${typed} ${city}`, `best ${typed} in ${city}`] : [])];
        const missing = ideas.filter((k) => !(k in related));
        const extra = await fetchSearchVolumes(missing, geoQ);
        const all: Record<string, number | null> = { ...related };
        for (const k of ideas) if (!(k in all)) all[k] = k in extra ? extra[k] : null;
        const isRelevant = makeRelevanceFilter(typed, []);
        const list = Object.entries(all)
            .filter(([k]) => !tracked.has(k) && isRelevant(k))
            .map(([keyword, volume]) => ({ keyword, volume }))
            .filter((x) => x.volume == null || x.volume > 0)
            .sort((x, y) => (y.volume ?? -1) - (x.volume ?? -1));
        return res.json({ suggestions: list.slice(0, 16), query: typed });
    }
    const terms = industryTerms(String(connectedBusiness.category || ''));
    const services = String(connectedBusiness.attributes || '')
        .split(/[,;\n]/)
        .map(cleanKeyword)
        .filter((x: string) => x.length > 2 && x.length < 50)
        .slice(0, 6);
    const seeds = [...terms, ...services].flatMap((t) => (city ? [t, `${t} ${city}`] : [t]));

    const geo = { address, lat: connectedBusiness.lat, lng: connectedBusiness.lng };
    const related = await fetchRelatedKeywords(seeds, geo);
    const templates = industryKeywordIdeas(connectedBusiness as any);
    const missing = templates.filter((k) => !(k in related)).slice(0, 100);
    const templateVolumes = await fetchSearchVolumes(missing, geo);
    const all: Record<string, number | null> = { ...related };
    for (const k of templates) if (!(k in all)) all[k] = k in templateVolumes ? templateVolumes[k] : null;

    const isRelevant = makeRelevanceFilter(String(connectedBusiness.category || ''), services);
    const suggestions = Object.entries(all)
        .filter(([k]) => !tracked.has(k) && isRelevant(k))
        .map(([keyword, volume]) => ({ keyword, volume }))
        // real demand first; keywords with zero volume are not worth tracking
        .filter((x) => x.volume == null || x.volume > 0)
        .sort((x, y) => (y.volume ?? -1) - (x.volume ?? -1));
    res.json({ suggestions: suggestions.slice(0, 24) });
});

app.post('/api/visibility-tracker/keywords', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    const incoming: string[] = (Array.isArray(req.body?.keywords) ? req.body.keywords : [req.body?.keyword])
        .map(cleanKeyword)
        .filter((k: string) => k.length >= 2);
    if (!incoming.length) return res.status(400).json({ error: 'Enter at least one keyword.' });
    const current = trackerList();
    const have = new Set(current.map((k) => k.keyword));
    const fresh = Array.from(new Set(incoming)).filter((k) => !have.has(k));
    if (current.length + fresh.length > MAX_TRACKED_KEYWORDS) {
        return res.status(400).json({ error: `You can track up to ${MAX_TRACKED_KEYWORDS} keywords.` });
    }
    const volumes = await fetchSearchVolumes(fresh, { address: String(connectedBusiness.address || ''), lat: connectedBusiness.lat, lng: connectedBusiness.lng });
    const now = new Date().toISOString();
    const added: TrackerKeyword[] = fresh.map((keyword) => ({
        keyword,
        volume: keyword in volumes ? volumes[keyword] : null,
        volumeUpdatedAt: keyword in volumes ? now : undefined,
        history: [],
        top: [],
        addedAt: now
    }));
    setTrackerList([...added, ...current]);
    await saveOrgToDb(req);
    res.json({ keywords: trackerList(), added: added.length });
});

app.post('/api/visibility-tracker/remove', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    const target = cleanKeyword(req.body?.keyword);
    setTrackerList(trackerList().filter((k) => k.keyword !== target));
    await saveOrgToDb(req);
    res.json({ keywords: trackerList() });
});

app.post('/api/visibility-tracker/check', requireAuth, hydrateOrgFromDb, requireFeature('local_growth'), async (req, res) => {
    if (!requireBusiness(res)) return;
    if (!trackerConfigured()) {
        return res.status(503).json({ error: 'Live rank checks need DataForSEO.', code: 'not_configured' });
    }
    const wanted = new Set<string>(
        (Array.isArray(req.body?.keywords) ? req.body.keywords : []).map(cleanKeyword).filter(Boolean).slice(0, 5)
    );
    if (!wanted.size) return res.status(400).json({ error: 'No keywords to check.' });
    const center = await ensureBusinessCenter(req);
    if (!center) {
        return res.status(400).json({ error: 'Your business needs a full address so we can locate it on the map.' });
    }
    const business = { name: connectedBusiness.name, placeId: connectedBusiness.placeId };
    const list = trackerList();
    const failed: string[] = [];
    // Heal volumes that were stored as empty/0 (e.g. looked up for the wrong country earlier).
    const stale = list.filter((k) => wanted.has(k.keyword) && !k.volume).map((k) => k.keyword);
    if (stale.length) {
        const fresh = await fetchSearchVolumes(stale, { address: String(connectedBusiness.address || ''), lat: connectedBusiness.lat, lng: connectedBusiness.lng });
        for (const k of list) {
            if (k.keyword in fresh) {
                k.volume = fresh[k.keyword];
                k.volumeUpdatedAt = new Date().toISOString();
            }
        }
    }
    const updated = await Promise.all(
        list.map(async (entry) => {
            if (!wanted.has(entry.keyword)) return entry;
            try {
                return await checkKeywordRank(entry, center, business);
            } catch (err: any) {
                console.warn('[visibility-tracker] check failed:', entry.keyword, errMessage(err));
                failed.push(entry.keyword);
                return entry;
            }
        })
    );
    setTrackerList(updated);
    await saveOrgToDb(req);
    res.json({ keywords: updated, failed });
});

function citationNorm(value: string) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function citationNameMatches(found: string, expected: string) {
    const left = citationNorm(found);
    const right = citationNorm(expected);
    if (!left || !right) return false;
    if (left.includes(right) || right.includes(left)) return true;
    const words = right.split(' ').filter((word) => word.length > 2);
    if (!words.length) return false;
    const hits = words.filter((word) => left.includes(word));
    return hits.length >= Math.min(2, words.length);
}

function citationPhoneMatches(found: string, expected: string) {
    const left = String(found || '').replace(/\D/g, '');
    const right = String(expected || '').replace(/\D/g, '');
    if (left.length < 7 || right.length < 7) return false;
    return left.slice(-7) === right.slice(-7);
}

function citationAddressMatches(found: string, expected: string) {
    const hay = citationNorm(found);
    const words = citationNorm(expected)
        .split(' ')
        .filter((word) => word.length > 3);
    if (!hay || !words.length) return false;
    return words.filter((word) => hay.includes(word)).length >= 2;
}

function matchCitationRows(citations: any[], business: { name?: string; address?: string; phone?: string }) {
    const expectedName = String(business.name || '').trim();
    const expectedAddress = String(business.address || '').trim();
    const expectedPhone = String(business.phone || '').trim();
    return (Array.isArray(citations) ? citations : []).map((row) => {
        const businessName = String(row?.businessName || '').trim();
        const address = String(row?.address || '').trim();
        const phone = String(row?.phone || '').trim();
        const url = String(row?.url || '').trim();
        const stated = String(row?.status || '').trim();
        if (stated === 'missing' || (!url && !businessName && !address && !phone)) {
            return {
                directory: row?.directory || '',
                status: 'missing',
                url: '',
                businessName: '',
                address: '',
                phone: '',
                note: 'No public listing found'
            };
        }
        const sameName = citationNameMatches(businessName, expectedName);
        const samePhone = citationPhoneMatches(phone, expectedPhone);
        const sameAddress = citationAddressMatches(address, expectedAddress);
        const phoneCompared = Boolean(phone && expectedPhone);
        const addressCompared = Boolean(address && expectedAddress);
        const base = {
            directory: row?.directory || '',
            url,
            businessName,
            address,
            phone
        };
        if (phoneCompared && !samePhone) {
            return { ...base, status: 'mismatch', note: 'Phone on this listing does not match' };
        }
        if (sameName && addressCompared && !sameAddress && !samePhone) {
            return { ...base, status: 'mismatch', note: 'Address on this listing does not match' };
        }
        if (sameName || samePhone) {
            const compared = samePhone || sameAddress;
            return {
                ...base,
                status: 'found',
                note: compared
                    ? 'Matches this business'
                    : 'Listing found. Phone and address were not in the search result.'
            };
        }
        return {
            ...base,
            status: 'mismatch',
            note: 'Different listing or details do not match this business'
        };
    });
}

function summarizeCitations(citations: any[]) {
    const found = citations.filter((row) => row.status === 'found').length;
    const mismatchOnly = citations.filter((row) => row.status === 'mismatch').length;
    const missing = citations.filter((row) => row.status === 'missing').length;
    return {
        score: citations.length ? Math.round((found / citations.length) * 100) : 0,
        found,
        missing,
        mismatch: mismatchOnly + missing,
        total: citations.length,
        citations
    };
}

function citationHistoryList() {
    const history = Array.isArray(dashboardState.citationHistory) ? dashboardState.citationHistory : [];
    if (history.length) return history.slice(0, 20);
    const saved = dashboardState.citationAudit;
    return saved?.scannedAt ? [saved] : [];
}

async function storeCitationAudit(req: any, data: any) {
    const matched = matchCitationRows(data?.citations || [], connectedBusiness);
    const summary = summarizeCitations(matched);
    const saved = {
        ...data,
        ...summary,
        scannedAt: new Date().toISOString()
    };
    const prior = citationHistoryList().filter((item) => item?.scannedAt !== saved.scannedAt);
    dashboardState.citationHistory = [saved, ...prior].slice(0, 20);
    dashboardState.citationAudit = saved;
    await saveOrgToDb(req);
    return { ...saved, history: dashboardState.citationHistory };
}

app.get('/api/ai/citations', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), (_req, res) => {
    const history = citationHistoryList();
    const saved = dashboardState.citationAudit || history[0] || null;
    if (!saved || !Array.isArray(saved.citations)) {
        return res.json({ citations: [], found: 0, missing: 0, mismatch: 0, scannedAt: null, history });
    }
    res.json({ ...saved, history });
});

app.post('/api/ai/citations', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireBusiness(res)) return;

    try {
        const pending = dashboardState.citationPending;
        const pendingAge = pending?.startedAt ? Date.now() - new Date(pending.startedAt).getTime() : 0;
        const pendingFresh = Boolean(pending?.mapsTaskId && pending?.organicTaskId && pendingAge < 3 * 60 * 1000);
        if (!pendingFresh) {
            dashboardState.citationPending = await startCitationScan(connectedBusiness);
            await saveOrgToDb(req);
            return res.json({ retry: true, retryAfterSeconds: 4 });
        }
        const collected = await collectCitationScan(dashboardState.citationPending, connectedBusiness);
        if (!collected.ready) {
            return res.json({ retry: true, retryAfterSeconds: 6 });
        }
        dashboardState.citationPending = null;
        const saved = await storeCitationAudit(req, collected);
        return res.json(saved);
    } catch (err: any) {
        dashboardState.citationPending = null;
        try {
            await saveOrgToDb(req);
        } catch {
            // Keep the error response even if the pending scan could not be cleared.
        }
        const status = err instanceof CitationScanError ? err.status : 502;
        console.warn('[citations] DataForSEO search failed:', errMessage(err));
        return res.status(status).json({
            error: errMessage(err) || 'Citation search did not finish. Run it again.'
        });
    }
});

app.post('/api/ai/media-generate', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const photoCategory = String(req.body?.category || 'storefront').trim().slice(0, 80) || 'storefront';
    const name = String(connectedBusiness.name || '').trim();
    const trade = String(connectedBusiness.category || 'local business').trim();
    const address = String(connectedBusiness.address || '').trim();
    if (!name || !address) {
        return res.status(400).json({
            error: 'Business name and address are required before generating media. Save your business profile first.'
        });
    }

    try {
        const response = await aiClient.models.generateContent({
            model: IMAGE_MODEL,
            contents: `Create one photorealistic ${photoCategory} photo for this exact local business — not a random stock image.
Business name: ${name}
Trade / category: ${trade}
Real address / area: ${address}
Photo category: ${photoCategory}
Requirements:
- Scene must clearly belong to this business, trade, and location (UK-realistic when the address is in the UK).
- Natural tones and lighting appropriate for a Google Business Profile photo.
- No text overlays, no logos, no watermarks, no invented brand names or landmarks.
- Do not invent a different business, city, or unrelated industry.`
        });
        const url = extractImage(response);
        if (!url) return res.status(502).json({ error: 'Gemini did not return an image. Free image quota may be exhausted.' });

        let altText = `${photoCategory} photo of ${name} in ${address}`;
        try {
            const generatedAlt = await generateText(
                `Write one SEO alt-text under 25 words for a ${photoCategory} photo of ${name} (${trade}) in ${address}. No quotes. Do not invent landmarks.`
            );
            if (generatedAlt) altText = generatedAlt.replace(/^"|"$/g, '');
        } catch {
            
        }

        dashboardState.photoCount += 1;
        dashboardState.completenessScore = Math.min(100, dashboardState.completenessScore + 2);
        res.json({
            photo: {
                id: Date.now(),
                category: photoCategory,
                url,
                altText,
                lat: '',
                lng: ''
            }
        });
    } catch (err: any) {
        console.error('Media generate error:', err);
        res.status(502).json({ error: `Gemini media failed: ${errMessage(err)}` });
    }
});

// ── LLM Visibility Tracking ──────────────────────────────────────────────────
// Three short requests (each under the ~30s gateway limit): the client asks ChatGPT and
// Google AI Overviews in parallel, then posts the raw answers to /analyze for scoring.
const growthReportingGate = [requireAuth, hydrateOrgFromDb, requireAllFeatures(['local_growth', 'reporting'])] as const;

function visibilityBusiness() {
    return {
        name: connectedBusiness.name,
        address: connectedBusiness.address,
        category: connectedBusiness.category,
        website: connectedBusiness.website,
        completenessScore: dashboardState.completenessScore
    };
}

function requireDataForSeo(res: Response) {
    if (dataForSeoReady()) return true;
    res.status(503).json({ error: 'DataForSEO login is missing. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to backend/.env and restart.' });
    return false;
}

function llmVisibilityState(dash: any) {
    const history = Array.isArray(dash?.llmVisibilityHistory)
        ? dash.llmVisibilityHistory
        : Array.isArray(dash?.aiVisibilityHistory)
          ? dash.aiVisibilityHistory
          : [];
    const report = dash?.llmVisibility || dash?.aiVisibility || history[0] || null;
    return { report, history };
}

app.get('/api/llm/visibility', ...growthReportingGate, (_req, res) => {
    const dash: any = (_req as any).dashboardState || dashboardState;
    res.json(llmVisibilityState(dash));
});

for (const platform of LLM_PLATFORMS) {
    app.post(`/api/llm/visibility/${platform}`, ...growthReportingGate, async (_req, res) => {
        if (!requireBusiness(res) || !requireDataForSeo(res)) return;
        const business = visibilityBusiness();
        let firstError = '';
        const answers = await Promise.all(
            buildPrompts(business).map((prompt) =>
                askLlm(platform, prompt, business).catch((err: any) => {
                    firstError = firstError || errMessage(err);
                    console.warn(`[llm-visibility] ${platform} failed:`, errMessage(err));
                    return { prompt, ok: false, text: '', present: false, sources: [] };
                })
            )
        );
        if (!answers.some((a) => a.present)) {
            return res.status(502).json({ error: firstError || `${platform} returned no answers.` });
        }
        res.json({ answers });
    });
}

app.post('/api/llm/visibility/google', ...growthReportingGate, async (_req, res) => {
    if (!requireBusiness(res) || !requireDataForSeo(res)) return;
    const business = visibilityBusiness();
    const answers = await Promise.all(
        buildPrompts(business).map((prompt) =>
            askGoogleOverview(prompt, { address: connectedBusiness.address, lat: connectedBusiness.lat, lng: connectedBusiness.lng }).catch((err: any) => {
                console.warn('[llm-visibility] google failed:', err?.message || err);
                return { prompt, ok: false, text: '', present: false, sources: [] };
            })
        )
    );
    res.json({ answers });
});

app.post('/api/llm/visibility/analyze', ...growthReportingGate, async (req, res) => {
    if (!requireBusiness(res)) return;
    const dash: any = (req as any).dashboardState || dashboardState;
    const business = visibilityBusiness();
    const body = req.body || {};
    const input: Record<string, any> = { google: Array.isArray(body.google) ? body.google : [] };
    for (const p of LLM_PLATFORMS) input[p] = Array.isArray(body[p]) ? body[p] : [];
    if (!LLM_PLATFORMS.some((p) => input[p].length)) return res.status(400).json({ error: 'No LLM answers to analyse.' });
    let analysis: any = { rows: [], opportunities: [] };
    if (aiClient) {
        const results = await Promise.all(
            analysisJobs(business, input).map(async (job) => {
                try {
                    return parseJsonFromText(
                        await withTimeout(generateText(job.prompt, { responseMimeType: 'application/json' }), 16000, 'llm-visibility analysis')
                    );
                } catch (err: any) {
                    console.warn('[llm-visibility] analysis group failed (using text matching):', errMessage(err));
                    return null;
                }
            })
        );
        for (const r of results) {
            if (Array.isArray(r?.rows)) analysis.rows.push(...r.rows);
            if (Array.isArray(r?.opportunities) && !analysis.opportunities.length) analysis.opportunities = r.opportunities;
        }
    }
    const { report: previous, history } = llmVisibilityState(dash);
    const report = buildVisibilityReport(business, input, analysis, previous);
    dash.llmVisibility = report;
    dash.llmVisibilityHistory = [report, ...history].slice(0, 20);
    delete dash.aiVisibility;
    delete dash.aiVisibilityHistory;
    await saveOrgToDb(req);
    res.json({ report, history: dash.llmVisibilityHistory });
});

app.delete('/api/llm/visibility/history', ...growthReportingGate, async (req, res) => {
    const id = String(req.query.createdAt || '');
    const dash: any = (req as any).dashboardState || dashboardState;
    const { history: existing } = llmVisibilityState(dash);
    const history = existing.filter((h: any) => h?.createdAt !== id);
    dash.llmVisibilityHistory = history;
    dash.llmVisibility = history[0] || null;
    delete dash.aiVisibility;
    delete dash.aiVisibilityHistory;
    await saveOrgToDb(req);
    res.json({ report: dash.llmVisibility, history });
});

// ── AI Insights overview (prioritized actions, growth strategy, pack share vs competitors) ──
// Everything the AI Insights page needs in one shape; used by every route that returns the page data.
function insightsPayload(dash: any) {
    const state = dash.insightActionState || {};
    const now = Date.now();
    const all = buildInsightActions(connectedBusiness, dash);
    const actions = all.filter((a) => {
        const entry = state[a.id];
        if (!entry) return true;
        const days = entry.status === 'dismissed' ? 14 : 30;
        return now - new Date(entry.at).getTime() > days * 86400000;
    });
    const history = Array.isArray(dash.aiInsightsHistory) ? dash.aiInsightsHistory : [];
    return {
        actions,
        hiddenActions: all.length - actions.length,
        latest: dash.aiInsights || null,
        history,
        ...computeChanges(history),
        trackerMoves: summarizeTracker(dash.visibilityTracker?.keywords).moves
    };
}

app.get('/api/ai/insights', ...growthReportingGate, (_req, res) => {
    res.json(insightsPayload((_req as any).dashboardState || dashboardState));
});

app.post('/api/ai/insights/action', ...growthReportingGate, async (req, res) => {
    const dash: any = (req as any).dashboardState || dashboardState;
    const id = String(req.body?.id || '').slice(0, 40);
    const status = String(req.body?.status || '');
    if (!id || !['done', 'dismissed', 'reset'].includes(status)) return res.status(400).json({ error: 'Invalid action.' });
    const next = { ...(dash.insightActionState || {}) };
    if (status === 'reset') delete next[id];
    else next[id] = { status, at: new Date().toISOString() };
    dash.insightActionState = next;
    await saveOrgToDb(req);
    res.json(insightsPayload(dash));
});

// The Map Pack check is split into short requests (one per keyword) so each stays under the ~30s gateway limit.
function insightsPlan() {
    const tracked = (Array.isArray(dashboardState.trackedKeywords) ? dashboardState.trackedKeywords : [])
        .map((k: any) => String(k?.keyword || '').trim())
        .filter(Boolean)
        .slice(0, 3);
    return planKeywords(connectedBusiness as any, tracked);
}

app.post('/api/ai/insights/plan', ...growthReportingGate, (_req, res) => {
    if (!requireBusiness(res) || !requireDataForSeo(res)) return;
    const keywords = insightsPlan();
    if (!keywords.length) return res.status(400).json({ error: 'Add a business category on the Business profile page first.' });
    res.json({ keywords });
});

app.post('/api/ai/insights/pack', ...growthReportingGate, async (req, res) => {
    if (!requireBusiness(res) || !requireDataForSeo(res)) return;
    const keyword = String(req.body?.keyword || '').trim();
    if (!insightsPlan().some((k) => k.toLowerCase() === keyword.toLowerCase())) {
        return res.status(400).json({ error: 'Unknown keyword.' });
    }
    try {
        res.json({ keyword, top3: await fetchPack(keyword, connectedBusiness as any) });
    } catch (err: any) {
        console.warn('[ai-insights] pack failed:', keyword, errMessage(err));
        res.status(502).json({ error: errMessage(err) });
    }
});

app.post('/api/ai/insights/trends', ...growthReportingGate, async (_req, res) => {
    if (!requireBusiness(res) || !requireDataForSeo(res)) return;
    res.json({ trendRows: await fetchTrends(insightsPlan(), { address: connectedBusiness.address, lat: connectedBusiness.lat, lng: connectedBusiness.lng }) });
});

app.post('/api/ai/insights/finish', ...growthReportingGate, async (req, res) => {
    if (!requireBusiness(res)) return;
    // Other requests replace the global dashboardState while this one awaits Gemini, so keep this request's own object.
    const dash: any = (req as any).dashboardState || dashboardState;
    try {
        const plan = insightsPlan();
        const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
        const packs = plan.map((_, i) =>
            (Array.isArray(req.body?.packs?.[i]) ? req.body.packs[i] : []).slice(0, 3).map((r: any) => ({
                title: String(r?.title || '').slice(0, 160),
                reviews: num(r?.reviews),
                rating: num(r?.rating)
            }))
        );
        const trendRows = (Array.isArray(req.body?.trendRows) ? req.body.trendRows : [])
            .slice(0, 5)
            .map((r: any) => ({
                keyword: String(r?.keyword || '').slice(0, 160),
                volume: num(r?.volume),
                trendPct: r?.trendPct == null ? null : num(r.trendPct)
            }));
        const errors: string[] = Array.isArray(req.body?.errors) ? req.body.errors.map((e: any) => String(e).slice(0, 200)) : [];
        const market = summarizeMarket(connectedBusiness as any, plan, packs, trendRows, errors);

        let strategy = fallbackRecommendation(market);
        if (aiClient) {
            try {
                const data = parseJsonFromText(
                    await withTimeout(generateText(strategyPrompt(connectedBusiness, market, dashboardState, summarizeTracker(dash.visibilityTracker?.keywords))), 12000, 'ai-insights strategy')
                );
                if (data?.recommendation) {
                    strategy = {
                        recommendation: String(data.recommendation).slice(0, 300),
                        keyword: String(data.keyword || strategy.keyword).slice(0, 120)
                    };
                }
            } catch (err: any) {
                console.warn('[ai-insights] strategy fell back:', errMessage(err));
            }
        }

        const now = new Date();
        const latest = {
            createdAt: now.toISOString(),
            weekStart: insightsWeekStart(now),
            recommendation: strategy.recommendation,
            keyword: strategy.keyword,
            opportunities: marketOpportunities(connectedBusiness, market),
            share: market.share,
            packs: market.packs,
            problems: marketProblems(connectedBusiness, market),
            youSlots: market.youSlots,
            totalSlots: market.packSlotsChecked
        };
        const history = Array.isArray(dash.aiInsightsHistory) ? dash.aiInsightsHistory : [];
        dash.aiInsights = latest;
        dash.aiInsightsHistory = [latest, ...history].slice(0, 30);
        await saveOrgToDb(req);
        res.json(insightsPayload(dash));
    } catch (err: any) {
        console.error('AI insights finish error:', errMessage(err));
        res.status(502).json({ error: errMessage(err) });
    }
});

app.delete('/api/ai/insights/history', ...growthReportingGate, async (req, res) => {
    const id = String(req.query.createdAt || '');
    const dash: any = (req as any).dashboardState || dashboardState;
    const history = (Array.isArray(dash.aiInsightsHistory) ? dash.aiInsightsHistory : []).filter((h: any) => h?.createdAt !== id);
    dash.aiInsightsHistory = history;
    dash.aiInsights = history.find((h: any) => h?.share) || null;
    await saveOrgToDb(req);
    res.json(insightsPayload(dash));
});

app.get('/api/dashboard/stats', requireAuth, hydrateOrgFromDb, requireFeature('reporting'), (_req, res) => {
    res.json({ ...dashboardState, businessName: connectedBusiness.name, connected: connectedBusiness.connected });
});

app.post('/api/dashboard/activity', requireAuth, hydrateOrgFromDb, requireFeature('reporting'), (req, res) => {
    const { type, message, icon, color } = req.body;
    pushActivity({ type, message, icon, color });
    if (type === 'review') dashboardState.reviewResponseRate = Math.min(100, dashboardState.reviewResponseRate + 20);
    if (type === 'post') dashboardState.weeklyPosts += 1;
    res.json({ success: true, activities: dashboardState.activities, stats: dashboardState });
});

app.post('/api/dashboard/update-stats', requireAuth, hydrateOrgFromDb, requireFeature('reporting'), async (req, res) => {
    const allowed = [
        'completenessScore',
        'visibilityRank',
        'top3Percentage',
        'searchViewsIncrease',
        'reviewResponseRate',
        'weeklyPosts',
        'photoCount',
        'trackedKeywords'
    ];
    for (const key of allowed) {
        if (req.body[key] !== undefined) (dashboardState as any)[key] = req.body[key];
    }
    await saveOrgToDb(req);
    res.json({ success: true, stats: dashboardState });
});




app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/sales', salesRouter);
app.use('/api/host', createHostRouter({ stripeClient }));
app.use('/api/public/review', createPublicReviewRouter());
app.use('/api/public', createPublicRouter({ stripeClient }));
app.use('/api/integrations', integrationsRouter);

app.post('/api/ops/process-booking-reminders', async (req, res) => {
    const secret = process.env.OPS_SECRET || process.env.ZAPP_OPS_SECRET || 'zappsites-ops-dev';
    if (req.headers['x-ops-secret'] !== secret) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    try {
        const { processDueScheduledMessages } = await import('./lib/bookingReminders');
        const result = await processDueScheduledMessages(100);
        res.json({ ok: true, ...result });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/booking', (_req, res) => {
    res.status(410).json({ error: 'Booking API moved. Use /api/auth/me and /api/host/dashboard. Register or login first.' });
});

app.get('/api/booking/public', (_req, res) => {
    res.status(410).json({ error: 'Use /api/public/:hostSlug/:eventSlug instead.' });
});

export default app;

if (require.main === module) {
    const shutdown = () => {
        store.flushSave();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    (async () => {
        if (process.env.DATABASE_URL) {
            try {
                await migrate();
                console.log('[db] Migrations complete');
            } catch (err: any) {
                console.error('[db] Migration failed:', err.message);
            }
        } else {
            console.warn('[db] DATABASE_URL not set — booking features require Postgres');
        }
        app.listen(PORT, () => {
            console.log('Backend server running on http://localhost:' + PORT);
        });
    })();
}
