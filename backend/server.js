const express = require('express');
const cors = require('cors');
require('dotenv').config({ override: true });

const store = require('./lib/store');

let stripeClient = null;
if (process.env.STRIPE_SECRET_KEY) {
    try {
        const Stripe = require('stripe');
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
        console.log('Stripe ready (test/live key configured).');
    } catch (e) {
        console.error('Failed to load stripe package', e);
    }
}

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

let aiClient = null;
if (process.env.GEMINI_API_KEY) {
    try {
        const { GoogleGenAI } = require('@google/genai');
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        console.log(`Gemini ready (${TEXT_MODEL}).`);
    } catch (e) {
        console.error('Failed to load @google/genai', e);
    }
} else {
    console.warn('GEMINI_API_KEY is missing. Add it to backend/.env');
}

const app = express();
const PORT = process.env.PORT || 5000;

const { createStripeWebhookHandler } = require('./routes/webhooks');
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), createStripeWebhookHandler(stripeClient));

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const send = res.json.bind(res);
    res.json = (body) => {
        send(body);
        if (res.statusCode < 500) persistAppState();
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
    reviews: []
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

function normalizeBookingState(state) {
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

function hydrateAppState(raw) {
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

function currencySymbolToIso(symbol) {
    const map = { '£': 'gbp', '$': 'usd', '€': 'eur', GBP: 'gbp', USD: 'usd', EUR: 'eur' };
    const key = String(symbol || '£').trim();
    return map[key] || map[key.toUpperCase()] || 'gbp';
}

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function createBookingFromPending(pending, paymentMeta) {
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

function bookingSlug(name) {
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

function requireBookingReady(res) {
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

function requireGemini(res) {
    if (aiClient) return true;
    res.status(503).json({ error: 'Gemini API key is missing. Add GEMINI_API_KEY to backend/.env and restart.' });
    return false;
}

function requireBusiness(res) {
    if (connectedBusiness.connected && connectedBusiness.name) return true;
    res.status(400).json({ error: 'Connect a real business first with Ground live Places.' });
    return false;
}

function errMessage(err) {
    return err?.message || err?.error?.message || String(err);
}

async function generateText(prompt, extraConfig = {}) {
    const response = await aiClient.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: extraConfig
    });
    return (response.text || '').trim();
}

function extractImage(response) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        const inline = part.inlineData;
        if (inline?.data) {
            return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`;
        }
    }
    return null;
}

function scoreProfile(profile) {
    const fields = ['name', 'category', 'address', 'phone', 'website', 'hours', 'attributes', 'description'];
    const filled = fields.filter((key) => String(profile[key] || '').trim()).length;
    return Math.round((filled / fields.length) * 100);
}

function pushActivity({ type, message, icon, color }) {
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
        textModel: TEXT_MODEL,
        imageModel: IMAGE_MODEL
    });
});

app.get('/api/business', (_req, res) => {
    res.json(connectedBusiness);
});

app.post('/api/business/connect', (req, res) => {
    const incoming = req.body || {};
    connectedBusiness = {
        ...emptyBusiness(),
        ...incoming,
        connected: true,
        reviews: Array.isArray(incoming.reviews) ? incoming.reviews : []
    };
    dashboardState.completenessScore = scoreProfile(connectedBusiness);
    dashboardState.photoCount = 0;
    dashboardState.weeklyPosts = 0;
    dashboardState.reviewResponseRate = 0;
    pushActivity({
        type: 'places',
        message: `Connected "${connectedBusiness.name}" from live Gemini search.`,
        icon: 'CheckCircle',
        color: 'text-[#F59E0B]'
    });
    res.json({ success: true, business: connectedBusiness, stats: dashboardState });
});

app.post('/api/places/search', async (req, res) => {
    if (!requireGemini(res)) return;
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

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
            return res.status(404).json({ error: 'Gemini did not return a verified listing.' });
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
    } catch (err) {
        console.error('Places search error:', err);
        res.status(502).json({ error: `Gemini search failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/audit', async (req, res) => {
    if (!requireGemini(res)) return;
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
    } catch (err) {
        console.error('Audit error:', err);
        res.status(502).json({ error: `Gemini audit failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/post-copy', async (req, res) => {
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
    } catch (err) {
        console.error('Post copy error:', err);
        res.status(502).json({ error: `Gemini post copy failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/post-image', async (req, res) => {
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
    } catch (err) {
        console.error('Post image error:', err);
        res.status(502).json({ error: `Gemini image failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/review-reply', async (req, res) => {
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
    } catch (err) {
        console.error('Review reply error:', err);
        res.status(502).json({ error: `Gemini review reply failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/qa-answer', async (req, res) => {
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
    } catch (err) {
        console.error('Q&A error:', err);
        res.status(502).json({ error: `Gemini Q&A failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/gap-analysis', async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const keyword = req.body?.keyword || `${connectedBusiness.category} near me`;

    try {
        const text = await generateText(
            `Local SEO gap analysis for the real business "${connectedBusiness.name}" at ${connectedBusiness.address}.
Target query: "${keyword}".
Use live public competitor data only. Do not invent businesses.
Return JSON only:
{"gapAnalysis": "", "grid": [[1,2,3],[4,5,6],[7,8,9]], "competitors": [{"name": "", "reviews": 0, "rating": 0, "posts": 0, "photos": 0, "trend": "up"}]}
grid is a 3x3 of estimated Local Pack ranks 1-20 for neighborhood cells.
First competitors item must be "${connectedBusiness.name} (You)". Include 2 real nearby competitors if publicly known.`,
            { tools: [{ googleSearch: {} }] }
        );
        const data = parseJsonFromText(text);
        if (!data?.gapAnalysis) {
            return res.status(502).json({ error: 'Gemini returned an unusable gap analysis.' });
        }
        if (Array.isArray(data.grid) && data.grid.length === 3) {
            const ranks = data.grid.flat().filter((n) => typeof n === 'number');
            if (ranks.length) {
                dashboardState.visibilityRank = Number((ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1));
                dashboardState.top3Percentage = Math.round((ranks.filter((r) => r <= 3).length / ranks.length) * 100);
            }
        }
        res.json(data);
    } catch (err) {
        console.error('Gap analysis error:', err);
        res.status(502).json({ error: `Gemini gap analysis failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/citations', async (req, res) => {
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
    } catch (err) {
        console.error('Citation audit error:', err);
        res.status(502).json({ error: `Gemini citation audit failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/media-generate', async (req, res) => {
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
    } catch (err) {
        console.error('Media generate error:', err);
        res.status(502).json({ error: `Gemini media failed: ${errMessage(err)}` });
    }
});

app.post('/api/ai/strategy-report', async (req, res) => {
    if (!requireGemini(res)) return;
    if (!requireBusiness(res)) return;
    const stats = { ...dashboardState, ...req.body };

    try {
        const text = await generateText(
            `Create an executive local SEO report for ${connectedBusiness.name} (${connectedBusiness.category}) at ${connectedBusiness.address}.
Use only these live metrics. Do not invent extra numbers.
- Profile completeness: ${stats.completenessScore}%
- Average GeoGrid rank: ${stats.visibilityRank}
- Local 3-Pack coverage: ${stats.top3Percentage}%
- Review response rate: ${stats.reviewResponseRate}%
- Weekly posts: ${stats.weeklyPosts}
- Photo count: ${stats.photoCount}
- Rating: ${connectedBusiness.rating} from ${connectedBusiness.reviewsCount} reviews
Return JSON only: grade (A+ to C), positioningText, roadmap (array of 3 items with id, title, desc), metrics (object with localPackRank, completeness, reviewResponseRate, missingMedia).`
        );
        const data = parseJsonFromText(text);
        if (!data?.grade) return res.status(502).json({ error: 'Gemini returned an unusable report.' });
        res.json({
            ...data,
            metrics: data.metrics || {
                localPackRank: stats.visibilityRank,
                completeness: stats.completenessScore,
                reviewResponseRate: stats.reviewResponseRate,
                missingMedia: stats.photoCount ? `${stats.photoCount} photos` : 'No photos yet'
            }
        });
    } catch (err) {
        console.error('Strategy report error:', err);
        res.status(502).json({ error: `Gemini report failed: ${errMessage(err)}` });
    }
});

app.get('/api/dashboard/stats', (_req, res) => {
    res.json({ ...dashboardState, businessName: connectedBusiness.name, connected: connectedBusiness.connected });
});

app.post('/api/dashboard/activity', (req, res) => {
    const { type, message, icon, color } = req.body;
    pushActivity({ type, message, icon, color });
    if (type === 'review') dashboardState.reviewResponseRate = Math.min(100, dashboardState.reviewResponseRate + 20);
    if (type === 'post') dashboardState.weeklyPosts += 1;
    res.json({ success: true, activities: dashboardState.activities, stats: dashboardState });
});

app.post('/api/dashboard/update-stats', (req, res) => {
    const allowed = ['completenessScore', 'visibilityRank', 'top3Percentage', 'searchViewsIncrease', 'reviewResponseRate', 'weeklyPosts', 'photoCount'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) dashboardState[key] = req.body[key];
    }
    res.json({ success: true, stats: dashboardState });
});


// --- Calendly-style booking (Postgres) ---
const createHostRouter = require('./routes/host');
const createPublicRouter = require('./routes/public');
const authRouter = require('./routes/auth');
const integrationsRouter = require('./routes/integrations');

app.use('/api/auth', authRouter);
app.use('/api/host', createHostRouter({ stripeClient }));
app.use('/api/public', createPublicRouter({ stripeClient }));
app.use('/api/integrations', integrationsRouter);

// Legacy booking API shim — redirects clients to new endpoints
app.get('/api/booking', (_req, res) => {
    res.status(410).json({ error: 'Booking API moved. Use /api/auth/me and /api/host/dashboard. Register or login first.' });
});

app.get('/api/booking/public', (_req, res) => {
    res.status(410).json({ error: 'Use /api/public/:hostSlug/:eventSlug instead.' });
});

module.exports = app;

if (require.main === module) {
    const { migrate } = require('./lib/db');
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
            } catch (err) {
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
