import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { GoogleGenAI } from '@google/genai';
import * as store from './lib/store';
import { requirePlacesConfigured, searchBusiness, nearbyCompetitors, geocodeAddress } from './lib/googlePlaces';
import { runVisibilityAudit } from './lib/visibilityAudit';
import { createStripeWebhookHandler } from './routes/webhooks';
import { requireAuth } from './middleware/auth';
import { requireFeature, requireAllFeatures } from './middleware/entitlements';
import { authRateLimit, corsOptions, globalRateLimit, parseJsonBodyFallback, securityHeaders } from './middleware/security';
import createHostRouter from './routes/host';
import createPublicRouter from './routes/public';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import salesRouter from './routes/sales';
import integrationsRouter from './routes/integrations';
import { migrate } from './lib/db';
import { loadOrgAppState, saveOrgAppState } from './lib/orgAppState';

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

if (requirePlacesConfigured()) {
    console.log('Google Places ready.');
} else {
    console.warn('GOOGLE_PLACES_API_KEY is missing. Add location search will fall back to Gemini if available.');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Behind API Gateway / proxies — needed for accurate rate-limit client IP
app.set('trust proxy', 1);

app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), createStripeWebhookHandler(stripeClient));

app.use(securityHeaders());
app.use(cors(corsOptions()));
app.use(globalRateLimit());
// JSON body — also accept text/plain so API Gateway odd Content-Types still parse
app.use(
    express.json({
        limit: process.env.JSON_BODY_LIMIT || '1mb',
        type: (req) => {
            const ct = String(req.headers['content-type'] || '').toLowerCase();
            // Empty Content-Type still try JSON (common behind some proxies)
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
        if (res.statusCode < 500) {
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
    activities: []
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
        const state = await loadOrgAppState(req.orgId);
        connectedBusiness = state.business;
        dashboardState = state.dashboard;
        req.connectedBusiness = state.business;
        req.dashboardState = state.dashboard;
        next();
    } catch (err: any) {
        console.error('hydrateOrgFromDb error:', err.message);
        res.status(500).json({ error: 'Could not load workspace state.' });
    }
}

async function saveOrgToDb(req: any) {
    if (!req.orgId) return;
    await saveOrgAppState(req.orgId, {
        business: connectedBusiness,
        dashboard: dashboardState
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

/** Deterministic gap analysis when Gemini is down / quota-exhausted (no googleSearch grounding). */
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
            trend: 'up'
        },
        ...liveCompetitors.slice(0, 2).map((c: any) => ({
            name: c.name,
            reviews: c.reviews || c.user_ratings_total || 0,
            rating: c.rating || 0,
            posts: c.posts || 0,
            photos: c.photos || 0,
            trend: c.trend || 'flat'
        }))
    ];

    const competitorNames = competitors
        .slice(1)
        .map((c) => c.name)
        .filter(Boolean);
    const competitorLine = competitorNames.length
        ? `Nearby Places competitors in view: ${competitorNames.join(', ')}.`
        : 'No live competitor list from Places yet — connect lat/lng on the business profile and ensure Places API is enabled.';

    const gapAnalysis = `${business.name} for "${keyword}": estimated GeoGrid average rank ~${avg.toFixed(1)} with ~${top3}% of cells in the Local 3-Pack (model fallback — Gemini quota unavailable). Profile shows ${rating || 'n/a'}★ from ${reviews} reviews. ${competitorLine} Prioritize GBP completeness, fresh posts/photos, and review reply rate to pull neighborhood cells toward ranks 1–3.`;

    return { gapAnalysis, grid, competitors };
}

function fallbackStrategyReport(business: any, stats: any) {
    const completeness = Number(stats.completenessScore) || 0;
    const rank = Number(stats.visibilityRank) || 0;
    const top3 = Number(stats.top3Percentage) || 0;
    const replyRate = Number(stats.reviewResponseRate) || 0;
    const posts = Number(stats.weeklyPosts) || 0;
    const photos = Number(stats.photoCount) || 0;

    let grade = 'C';
    const score = Math.round(
        completeness * 0.35 +
            Math.max(0, 100 - rank * 8) * 0.25 +
            top3 * 0.2 +
            replyRate * 0.1 +
            Math.min(100, posts * 20 + photos * 5) * 0.1
    );
    if (score >= 90) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 80) grade = 'A-';
    else if (score >= 75) grade = 'B+';
    else if (score >= 70) grade = 'B';
    else if (score >= 65) grade = 'B-';
    else if (score >= 55) grade = 'C+';

    const name = business?.name || 'Your business';
    const category = business?.category || 'local business';

    return {
        grade,
        positioningText: `${name} (${category}) currently shows ${completeness}% profile completeness, GeoGrid average rank ${rank || 'n/a'}, and ${top3}% Local 3-Pack coverage. Focus this week on the gaps below — listing completeness, reviews replies, and consistent GBP posts move local visibility fastest.`,
        roadmap: [
            {
                id: 1,
                title: completeness < 90 ? 'Complete the GBP profile' : 'Keep NAP consistent',
                desc:
                    completeness < 90
                        ? 'Fill missing hours, categories, description, and website on Business profile so Google trusts the listing.'
                        : 'Re-check name, address, phone, and website match Google Maps exactly.'
            },
            {
                id: 2,
                title: replyRate < 80 ? 'Reply to recent reviews' : 'Ask for fresh reviews',
                desc:
                    replyRate < 80
                        ? 'Use Reputation Agent to draft owner replies — response rate is a clear local ranking signal.'
                        : 'Request short, specific reviews from recent customers mentioning your town and service.'
            },
            {
                id: 3,
                title: posts < 2 || photos < 5 ? 'Publish posts and photos' : 'Run a Local Search Grid scan',
                desc:
                    posts < 2 || photos < 5
                        ? 'Add weekly GBP posts and more photos (exterior, team, work) via Posts and Media tools.'
                        : 'Run Local Search Grid for your main service keyword and close the weakest geo cells.'
            }
        ],
        metrics: {
            localPackRank: rank,
            completeness,
            reviewResponseRate: replyRate,
            missingMedia: photos ? `${photos} photos` : 'No photos yet'
        }
    };
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
        places: requirePlacesConfigured(),
        textModel: TEXT_MODEL,
        imageModel: IMAGE_MODEL
    });
});

/** Free Local Visibility Audit — feature only (no plan gate / no DB persistence in v1). */
app.post('/api/visibility-audit', requireAuth, hydrateOrgFromDb, async (req, res) => {
    const started = Date.now();
    try {
        const body = req.body || {};
        const result = await runVisibilityAudit(
            {
                businessName: body.businessName || connectedBusiness.name,
                address: body.address || connectedBusiness.address,
                city: body.city,
                service: body.service || body.serviceId || connectedBusiness.category,
                website: body.website ?? connectedBusiness.website,
                phone: body.phone ?? connectedBusiness.phone,
                contactName: body.contactName,
                email: body.email,
                notes: body.notes,
                placeId: body.placeId || connectedBusiness.placeId,
                lat: body.lat ?? connectedBusiness.lat,
                lng: body.lng ?? connectedBusiness.lng
            },
            {
                generateText: aiClient ? (prompt) => generateText(prompt) : undefined
            }
        );
        console.log(`[visibility-audit] ok in ${Date.now() - started}ms score=${result.score?.total}`);
        res.json(result);
    } catch (err: any) {
        const status = err?.status || 502;
        console.error(`[visibility-audit] failed in ${Date.now() - started}ms:`, err);
        res.status(status).json({ error: errMessage(err) || 'Visibility audit failed' });
    }
});

app.get('/api/business', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), (_req, res) => {
    res.json(connectedBusiness);
});

app.post('/api/business/connect', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    const incoming = req.body || {};
    connectedBusiness = {
        ...emptyBusiness(),
        ...incoming,
        connected: true,
        reviews: Array.isArray(incoming.reviews) ? incoming.reviews : []
    };

    // Auto-fill map coords from address when the user didn't pick a Places listing.
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

    // Prefer real Google Places when configured
    if (requirePlacesConfigured()) {
        try {
            const place = await searchBusiness(String(query).trim());
            if (!place) {
                return res.status(404).json({ error: 'No matching listing found.' });
            }
            return res.json(place);
        } catch (err: any) {
            console.error('Places API search error:', err);
            // Fall through to Gemini if available
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
    const { postType, tone, businessName } = req.body;
    const name = businessName || connectedBusiness.name;

    try {
        const copy = await generateText(
            `Write a Google Business Profile ${postType} post for "${name}" (${connectedBusiness.category}) at ${connectedBusiness.address}.
Tone: ${tone}.
Use only real details from this listing. Do not invent offers, prices, or events.
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
    const { postType } = req.body || {};

    try {
        const response = await aiClient.models.generateContent({
            model: IMAGE_MODEL,
            contents: `Photorealistic promotional photo for ${connectedBusiness.name}, a ${connectedBusiness.category} at ${connectedBusiness.address}. Scene type: ${postType || 'update'}. Natural light, no text overlay, no logos, no fake people names.`
        });
        const imageUrl = extractImage(response);
        if (!imageUrl) return res.status(502).json({ error: 'Gemini did not return an image. Free image quota may be exhausted.' });
        res.json({ imageUrl });
    } catch (err: any) {
        console.error('Post image error:', err);
        res.status(502).json({ error: `Gemini image failed: ${errMessage(err)}` });
    }
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
    const keyword = req.body?.keyword || `${connectedBusiness.category} near me`;

    // Ensure map center exists — geocode address if profile has no lat/lng yet.
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
                keyword: connectedBusiness.category || keyword,
                excludeName: connectedBusiness.name
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
    };

    const withCompetitors = (data: any) => {
        if (!Array.isArray(data.competitors) || !data.competitors.length) {
            data.competitors = [
                {
                    name: `${connectedBusiness.name} (You)`,
                    reviews: connectedBusiness.reviewsCount || 0,
                    rating: connectedBusiness.rating || 0,
                    posts: dashboardState.weeklyPosts || 0,
                    photos: dashboardState.photoCount || 0,
                    trend: 'up'
                },
                ...liveCompetitors.slice(0, 2)
            ];
        }
        return data;
    };

    const withCenter = (data: any) => {
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

    // Never use Gemini googleSearch here — grounding quota is separate and often 429 on free/test keys.
    // Places supplies competitors; plain generateContent still works when grounding does not.
    if (!aiClient) {
        const data = withCenter(withCompetitors(fallbackGapAnalysis(connectedBusiness, keyword, liveCompetitors)));
        applyGridStats(data);
        return res.json(data);
    }

    try {
        const competitorBlock = liveCompetitors.length
            ? `Live nearby competitors from Google Places (use these names/ratings; do not invent others):\n${JSON.stringify(liveCompetitors)}`
            : 'No live competitor list from Places — do not invent competitor businesses; return only the "You" row if needed.';

        const text = await generateText(
            `Local SEO gap analysis for the real business "${connectedBusiness.name}" at ${connectedBusiness.address}.
Category: ${connectedBusiness.category || 'local business'}
Rating: ${connectedBusiness.rating} (${connectedBusiness.reviewsCount} reviews)
Target query: "${keyword}".
${competitorBlock}
Use the provided Places data only. Do not invent businesses.
Return JSON only:
{"gapAnalysis": "", "grid": [[1,2,3],[4,5,6],[7,8,9]], "competitors": [{"name": "", "reviews": 0, "rating": 0, "posts": 0, "photos": 0, "trend": "up"}]}
grid is a 3x3 of estimated Local Pack ranks 1-20 for neighborhood cells around the business.
First competitors item must be "${connectedBusiness.name} (You)" with reviews=${connectedBusiness.reviewsCount || 0} and rating=${connectedBusiness.rating || 0}. Include up to 2 real nearby competitors from the Places list when available.`
        );
        const data = parseJsonFromText(text);
        if (!data?.gapAnalysis) {
            console.warn('[gap-analysis] unusable Gemini JSON — using fallback');
            const fallback = withCenter(withCompetitors(fallbackGapAnalysis(connectedBusiness, keyword, liveCompetitors)));
            applyGridStats(fallback);
            return res.json(fallback);
        }

        withCompetitors(data);
        withCenter(data);
        applyGridStats(data);
        res.json(data);
    } catch (err: any) {
        console.error('Gap analysis error (serving fallback):', errMessage(err));
        if (isGeminiQuotaError(err)) {
            console.warn('[gap-analysis] Gemini quota/rate limit — using Places/fallback path');
        }
        const fallback = withCenter(withCompetitors(fallbackGapAnalysis(connectedBusiness, keyword, liveCompetitors)));
        applyGridStats(fallback);
        res.json(fallback);
    }
});

app.post('/api/ai/citations', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;

    try {
        const text = await generateText(
            `Citation audit for this real business. Use live public web results only. Do not invent listings.
Name: ${connectedBusiness.name}
Address: ${connectedBusiness.address}
Phone: ${connectedBusiness.phone}
Website: ${connectedBusiness.website}
Check these directories if possible: Google, Apple Maps, Bing Places, Yelp, Facebook, Yellow Pages, BBB, TripAdvisor, Foursquare.
Return JSON only:
{"score": 0, "found": 0, "missing": 0, "citations": [{"directory": "", "status": "found"|"missing"|"mismatch", "url": "", "note": ""}]}
score is 0-100. status mismatch means NAP does not match.`,
            { tools: [{ googleSearch: {} }] }
        );
        const data = parseJsonFromText(text);
        if (!data?.citations) {
            return res.status(502).json({ error: 'Gemini returned an unusable citation audit.' });
        }
        res.json(data);
    } catch (err: any) {
        console.error('Citation audit error:', err);
        res.status(502).json({ error: `Gemini citation audit failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/media-generate', requireAuth, hydrateOrgFromDb, requireFeature('local_presence'), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const { category } = req.body;

    try {
        const response = await aiClient.models.generateContent({
            model: IMAGE_MODEL,
            contents: `Photorealistic ${category} photo for ${connectedBusiness.name}, a ${connectedBusiness.category} at ${connectedBusiness.address}. Natural tones, no text, no watermarks.`
        });
        const url = extractImage(response);
        if (!url) return res.status(502).json({ error: 'Gemini did not return an image. Free image quota may be exhausted.' });

        let altText = `${category} photo of ${connectedBusiness.name} in ${connectedBusiness.address}`;
        try {
            const generatedAlt = await generateText(
                `Write one SEO alt-text under 25 words for a ${category} photo of ${connectedBusiness.name} (${connectedBusiness.category}) in ${connectedBusiness.address}. No quotes. Do not invent landmarks.`
            );
            if (generatedAlt) altText = generatedAlt.replace(/^"|"$/g, '');
        } catch {
            /* keep simple alt */
        }

        dashboardState.photoCount += 1;
        dashboardState.completenessScore = Math.min(100, dashboardState.completenessScore + 2);
        res.json({
            photo: {
                id: Date.now(),
                category,
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

app.post('/api/ai/strategy-report', requireAuth, hydrateOrgFromDb, requireAllFeatures(['local_growth', 'reporting']), async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const stats = { ...dashboardState, ...req.body };
    const fallback = fallbackStrategyReport(connectedBusiness, stats);

    try {
        const text = await withTimeout(
            generateText(
                `Create an executive local SEO report for ${connectedBusiness.name} (${connectedBusiness.category || 'local business'}) at ${connectedBusiness.address}.
Phone: ${connectedBusiness.phone || 'n/a'}
Website: ${connectedBusiness.website || 'n/a'}
Public rating: ${connectedBusiness.rating ?? 'n/a'} from ${connectedBusiness.reviewsCount || 0} reviews
Use only these live metrics. Do not invent extra numbers.
- Profile completeness: ${stats.completenessScore}%
- Average GeoGrid rank: ${stats.visibilityRank}
- Local 3-Pack coverage: ${stats.top3Percentage}%
- Review response rate: ${stats.reviewResponseRate}%
- Weekly posts: ${stats.weeklyPosts}
- Photo count: ${stats.photoCount}
Write a practical report a trade-business owner can act on this week. Keep it concise.
Return JSON only:
{"grade":"A+|A|A-|B+|B|B-|C+|C","positioningText":"2-3 sentences","roadmap":[{"id":1,"title":"","desc":""},{"id":2,"title":"","desc":""},{"id":3,"title":"","desc":""}],"metrics":{"localPackRank":${stats.visibilityRank},"completeness":${stats.completenessScore},"reviewResponseRate":${stats.reviewResponseRate},"missingMedia":"${stats.photoCount ? `${stats.photoCount} photos` : 'No photos yet'}"}}`
            ),
            18000,
            'strategy-report'
        );
        const data = parseJsonFromText(text);
        if (!data?.grade) {
            console.warn('[strategy-report] unusable Gemini JSON — using fallback');
            return res.json(fallback);
        }
        res.json({
            ...data,
            metrics: data.metrics || fallback.metrics
        });
    } catch (err: any) {
        console.error('Strategy report error (serving fallback):', errMessage(err));
        // Never 503 the SPA — API Gateway cuts at ~30s; return usable report instead
        res.json(fallback);
    }
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

app.post('/api/dashboard/update-stats', requireAuth, hydrateOrgFromDb, requireFeature('reporting'), (req, res) => {
    const allowed = ['completenessScore', 'visibilityRank', 'top3Percentage', 'searchViewsIncrease', 'reviewResponseRate', 'weeklyPosts', 'photoCount'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) dashboardState[key] = req.body[key];
    }
    res.json({ success: true, stats: dashboardState });
});


// --- Calendly-style booking (Postgres) ---

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/sales', salesRouter);
app.use('/api/host', createHostRouter({ stripeClient }));
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

// Legacy booking API shim — redirects clients to new endpoints
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
