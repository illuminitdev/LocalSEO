import { randomUUID } from 'crypto';
import {
    getBusinessByPlaceId,
    requirePlacesConfigured,
    searchBusiness,
    searchLocalTop
} from '../googlePlaces';
import { compareNap } from './napCompare';
import { computeVisibilityScore } from './score';
import { generateAiReport } from './aiReport';
import { checkWebsite } from './websiteCheck';
import type { CheckStatus, LocalRankResult, VisibilityAuditResult } from './types';

export type VisibilityAuditInput = {
    businessName: string;
    address?: string;
    city?: string;
    service?: string;
    serviceId?: string;
    website?: string;
    phone?: string;
    contactName?: string;
    email?: string;
    notes?: string;
    placeId?: string;
    lat?: number | null;
    lng?: number | null;
};

const SCORE_NOTE =
    'Score is out of 100 across website reachability, GBP/Maps listing, NAP, reviews/replies, profile optimisation, and local “service near town” visibility. Deep website crawling is not required.';

/** Keep under API Gateway ~30s limit (Lambda in VPC + Places + Gemini). */
const AI_REPORT_BUDGET_MS = 10000;

function extractCity(address: string, city?: string) {
    if (city && String(city).trim()) return String(city).trim();
    const parts = String(address || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2] || parts[parts.length - 1];
    return parts[0] || '';
}

function reviewsLookRecent(reviews: Array<{ date?: string }>): CheckStatus {
    if (!reviews?.length) return 'unknown';
    const recentish = reviews.some((r) => {
        const d = String(r.date || '').toLowerCase();
        return (
            d.includes('day') ||
            d.includes('week') ||
            d.includes('hour') ||
            d.includes('month') ||
            /\b20(2[3-9]|3\d)\b/.test(d)
        );
    });
    return recentish ? 'pass' : 'unknown';
}

function buildLocalRank(
    query: string,
    results: Awaited<ReturnType<typeof searchLocalTop>>,
    placeId: string,
    businessName: string
): LocalRankResult {
    const nameNorm = businessName.toLowerCase().trim();
    const annotated = results.map((r) => {
        const idMatch =
            placeId &&
            r.placeId &&
            (r.placeId === placeId || r.placeId.endsWith(placeId) || placeId.endsWith(r.placeId));
        const nameMatch = nameNorm && r.name.toLowerCase().includes(nameNorm);
        return { ...r, isThisBusiness: Boolean(idMatch || nameMatch) };
    });

    const hit = annotated.find((r) => r.isThisBusiness);
    const position = hit?.position ?? null;
    const inTop10 = position != null;
    const label = position != null ? `Appears at #${position}` : 'Not in the top 10';

    return {
        query,
        measured: true,
        position,
        inTop10,
        label,
        results: annotated,
        top5: annotated.slice(0, 5)
    };
}

async function lookupGbp(raw: VisibilityAuditInput, businessName: string, address: string, city: string) {
    if (!requirePlacesConfigured()) return null;
    if (raw.placeId) {
        try {
            const byId = await getBusinessByPlaceId(raw.placeId);
            if (byId) return byId;
        } catch (err: any) {
            console.warn('[visibilityAudit] placeId lookup failed:', err.message);
        }
    }
    const q = [businessName, address || city].filter(Boolean).join(' ');
    try {
        return await searchBusiness(q);
    } catch (err: any) {
        console.warn('[visibilityAudit] GBP lookup failed:', err.message);
        return null;
    }
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

export async function runVisibilityAudit(
    raw: VisibilityAuditInput,
    opts: {
        generateText?: (prompt: string) => Promise<string>;
    } = {}
): Promise<VisibilityAuditResult> {
    const businessName = String(raw.businessName || '').trim();
    const address = String(raw.address || '').trim();
    const service = String(raw.service || raw.serviceId || '').trim();
    const website = String(raw.website || '').trim();
    const phone = String(raw.phone || '').trim();
    const city = extractCity(address, raw.city);

    if (!businessName) {
        const err = new Error('businessName is required');
        (err as any).status = 400;
        throw err;
    }
    if (!address && !city) {
        const err = new Error('address or city is required');
        (err as any).status = 400;
        throw err;
    }
    if (!service) {
        const err = new Error('service is required');
        (err as any).status = 400;
        throw err;
    }

    const nearQuery = `${service} near ${city || address}`;
    const biasLatHint = typeof raw.lat === 'number' ? raw.lat : null;
    const biasLngHint = typeof raw.lng === 'number' ? raw.lng : null;

    // Run website + GBP + Top-10 in parallel (Top-10 uses connected lat/lng when present)
    const [websiteCheck, gbp, topResults] = await Promise.all([
        checkWebsite(website),
        lookupGbp(raw, businessName, address, city),
        requirePlacesConfigured()
            ? searchLocalTop({
                  query: nearQuery,
                  lat: biasLatHint,
                  lng: biasLngHint,
                  maxResultCount: 10,
                  radiusMeters: 20000
              }).catch((err: any) => {
                  console.warn('[visibilityAudit] local rank failed:', err.message);
                  return [];
              })
            : Promise.resolve([])
    ]);

    const gbpFound = Boolean(gbp?.name);
    const napCompare = compareNap(
        { name: businessName, phone, address: address || city, website },
        gbpFound
            ? {
                  name: gbp.name,
                  phone: gbp.phone,
                  address: gbp.address,
                  website: gbp.website
              }
            : null
    );

    const biasLat = biasLatHint ?? gbp?.lat ?? null;
    const biasLng = biasLngHint ?? gbp?.lng ?? null;

    let localRank: LocalRankResult = {
        query: nearQuery,
        measured: false,
        position: null,
        inTop10: false,
        label: 'Not measured',
        results: [],
        top5: []
    };

    // If we had no lat hint, retry Top-10 once with GBP coords
    let tops = topResults;
    if (
        requirePlacesConfigured() &&
        (!tops || !tops.length) &&
        biasLatHint == null &&
        typeof gbp?.lat === 'number' &&
        typeof gbp?.lng === 'number'
    ) {
        try {
            tops = await searchLocalTop({
                query: nearQuery,
                lat: gbp.lat,
                lng: gbp.lng,
                maxResultCount: 10,
                radiusMeters: 20000
            });
        } catch (err: any) {
            console.warn('[visibilityAudit] local rank retry failed:', err.message);
        }
    }

    if (Array.isArray(tops) && tops.length) {
        localRank = buildLocalRank(nearQuery, tops, gbp?.placeId || raw.placeId || '', businessName);
    } else if (requirePlacesConfigured()) {
        localRank = {
            ...localRank,
            measured: true,
            label: 'Not in the top 10'
        };
    }

    const reviewsSample = (gbp?.reviews || []).slice(0, 3).map((r: any) => ({
        author: r.author || 'Reviewer',
        rating: r.rating ?? 0,
        date: r.date || '',
        text: r.text || '',
        ownerReplied: 'unknown' as const
    }));

    const score = computeVisibilityScore({
        websiteCheck,
        gbpFound,
        gbpNameMatch: napCompare.name.match,
        nap: napCompare,
        rating: gbp?.rating ?? null,
        reviewCount: gbp?.reviewsCount ?? 0,
        reviewsLookRecent: reviewsLookRecent(gbp?.reviews || []),
        ownerReplies: 'unknown',
        hasHours: Boolean(gbp?.hasHours || gbp?.hours),
        hasCategories: Boolean(gbp?.category || (gbp?.categories && gbp.categories.length)),
        hasPhotos: Boolean(gbp?.hasPhotos || gbp?.photoCount > 0),
        hasServices: Boolean(gbp?.hasServices),
        hasDescription: Boolean(gbp?.hasDescription || gbp?.description),
        hasPosts: Boolean(gbp?.hasPosts),
        mapsListed: gbpFound,
        mapsUrl: gbp?.mapsUrl || '',
        localRank
    });

    const result: VisibilityAuditResult = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        input: {
            businessName,
            address,
            city,
            service,
            website,
            phone,
            contactName: raw.contactName,
            email: raw.email,
            notes: raw.notes
        },
        websiteCheck,
        gbpLookup: {
            found: gbpFound,
            placeId: gbp?.placeId || '',
            name: gbp?.name || '',
            address: gbp?.address || '',
            phone: gbp?.phone || '',
            website: gbp?.website || '',
            mapsUrl: gbp?.mapsUrl || '',
            categories: gbp?.categories || (gbp?.category ? [gbp.category] : []),
            hours: gbp?.hours || '',
            hasHours: Boolean(gbp?.hasHours || gbp?.hours),
            photoCount: gbp?.photoCount || 0,
            hasPhotos: Boolean(gbp?.hasPhotos || gbp?.photoCount > 0),
            description: gbp?.description || '',
            hasDescription: Boolean(gbp?.hasDescription || gbp?.description),
            hasServices: Boolean(gbp?.hasServices),
            hasPosts: Boolean(gbp?.hasPosts),
            rating: gbp?.rating ?? null,
            reviewCount: gbp?.reviewsCount ?? 0,
            reviewsSample,
            ownerRepliesStatus: 'unknown',
            lat: gbp?.lat ?? biasLat,
            lng: gbp?.lng ?? biasLng,
            localRank
        },
        napCompare,
        score,
        aiReport: null,
        scoreNote: SCORE_NOTE
    };

    const gen =
        opts.generateText ||
        (async () => {
            throw new Error('no AI');
        });

    try {
        result.aiReport = await withTimeout(
            generateAiReport(result, gen),
            AI_REPORT_BUDGET_MS,
            'AI report'
        );
    } catch (err: any) {
        console.warn('[visibilityAudit] AI report skipped:', err.message);
        result.aiReport = await generateAiReport(result, async () => {
            throw new Error('fallback');
        });
    }

    return result;
}
