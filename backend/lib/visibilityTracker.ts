import { logDfsCost } from './dfsCost';
import { cityFromAddress } from './aiInsights';
import { dataForSeoConfigured } from './dataForSeoCitations';
import { locationCodeFor, type GeoHint } from './geo';
import { TRACKED_KEYWORD_LIMIT } from './planCatalog';
import { NOT_RANKED, rankAtPoint, type GridBusiness } from './dataForSeoGrid';

/** Cap on tracked keywords: see TRACKED_KEYWORD_LIMIT in planCatalog.ts. */
export const MAX_TRACKED_KEYWORDS = TRACKED_KEYWORD_LIMIT;
export const MAX_HISTORY_POINTS = 120;

export type TrackerPoint = { date: string; rank: number };

export type TrackerKeyword = {
    keyword: string;
    volume: number | null;
    volumeUpdatedAt?: string;
    history: TrackerPoint[];
    top: string[];
    addedAt: string;
    checkedAt?: string;
};

export function trackerConfigured() {
    return dataForSeoConfigured();
}

export function cleanKeyword(value: unknown) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

/** Monthly Google search volume for up to 100 keywords in one call. Returns {} on any failure (volume is optional). */
export async function fetchSearchVolumes(keywords: string[], geo: GeoHint | string): Promise<Record<string, number>> {
    const list = Array.from(new Set(keywords.map(cleanKeyword).filter(Boolean))).slice(0, 100);
    if (!list.length || !dataForSeoConfigured()) return {};
    const login = String(process.env.DATAFORSEO_LOGIN || '').trim();
    const password = String(process.env.DATAFORSEO_PASSWORD || '').trim();
    try {
        const res = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ keywords: list, location_code: locationCodeFor(geo), language_code: 'en' }]),
            signal: AbortSignal.timeout(20000)
        });
        const data: any = await res.json().catch(() => ({}));
        logDfsCost('search_volume', data);
        const task = Array.isArray(data?.tasks) ? data.tasks[0] : null;
        if (!res.ok || !task || task.status_code !== 20000) {
            console.warn('[visibility-tracker] volume lookup failed:', task?.status_message || res.status);
            return {};
        }
        const out: Record<string, number> = {};
        for (const item of Array.isArray(task.result) ? task.result : []) {
            const key = cleanKeyword(item?.keyword);
            const vol = Number(item?.search_volume);
            if (key && Number.isFinite(vol)) out[key] = vol;
        }
        return out;
    } catch (err: any) {
        console.warn('[visibility-tracker] volume lookup error:', err?.message || err);
        return {};
    }
}

/** Real related searches for the industry/services (Google Ads keyword ideas), with monthly volume. */
export async function fetchRelatedKeywords(seeds: string[], geo: GeoHint | string): Promise<Record<string, number>> {
    const list = Array.from(new Set(seeds.map(cleanKeyword).filter(Boolean))).slice(0, 20);
    if (!list.length || !dataForSeoConfigured()) return {};
    const login = String(process.env.DATAFORSEO_LOGIN || '').trim();
    const password = String(process.env.DATAFORSEO_PASSWORD || '').trim();
    try {
        const res = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([
                { keywords: list, location_code: locationCodeFor(geo), language_code: 'en', sort_by: 'search_volume' }
            ]),
            signal: AbortSignal.timeout(25000)
        });
        const data: any = await res.json().catch(() => ({}));
        logDfsCost('keywords_for_keywords', data);
        const task = Array.isArray(data?.tasks) ? data.tasks[0] : null;
        if (!res.ok || !task || task.status_code !== 20000) {
            console.warn('[visibility-tracker] related keywords failed:', task?.status_message || res.status);
            return {};
        }
        const out: Record<string, number> = {};
        for (const item of Array.isArray(task.result) ? task.result : []) {
            const key = cleanKeyword(item?.keyword);
            const vol = Number(item?.search_volume);
            if (key && Number.isFinite(vol) && vol > 0 && key.split(' ').length <= 6) out[key] = vol;
        }
        return out;
    } catch (err: any) {
        console.warn('[visibility-tracker] related keywords error:', err?.message || err);
        return {};
    }
}

/** "Dental & Aesthetics" -> ["dental & aesthetics", "dental", "aesthetics"] */
export function industryTerms(category: string) {
    const full = cleanKeyword(category);
    const parts = full
        .split(/\s*(?:&|\/|,|\band\b)\s*/)
        .map((x) => x.trim())
        .filter((x) => x.length > 2);
    return Array.from(new Set([full, ...parts].filter(Boolean)));
}

const FILLER_WORDS = new Set(['and', 'the', 'for', 'near', 'me', 'in', 'of', 'a', 'best', 'services', 'service', 'local', 'top']);
const OFF_INTENT = /\b(jobs?|careers?|salary|salaries|courses?|training|school|schools|university|degree|diploma|qualification|wikipedia|definition|meaning|what is|diy|free|nhs jobs|vacanc\w*|apprentice\w*)\b/i;

/**
 * Keeps only suggestions that match the business: the keyword must share a word stem with the category
 * (dent → dentist/dental) or contain a listed service phrase, and must not be job/course/DIY style searches.
 */
export function makeRelevanceFilter(category: string, services: string[]) {
    const stems = new Set<string>();
    for (const word of industryTerms(category).flatMap((t) => t.split(/[^a-z0-9]+/))) {
        if (word.length < 3 || FILLER_WORDS.has(word)) continue;
        stems.add(word.length >= 5 ? word.slice(0, 4) : word);
    }
    const phrases = services.map(cleanKeyword).filter((x) => x.length > 2);
    return (keyword: string) => {
        if (OFF_INTENT.test(keyword)) return false;
        if (!stems.size && !phrases.length) return true;
        const words = keyword.split(/[^a-z0-9]+/).filter(Boolean);
        if (words.some((w) => Array.from(stems).some((st) => (st.length === 4 ? w.startsWith(st) : w === st)))) return true;
        return phrases.some((ph) => keyword.includes(ph));
    };
}

type SuggestBusiness = { category?: string; address?: string; attributes?: string };

/** Keyword ideas built from the business industry, services and city. */
export function industryKeywordIdeas(business: SuggestBusiness): string[] {
    const terms = industryTerms(String(business.category || ''));
    const city = cleanKeyword(cityFromAddress(String(business.address || '')));
    const services = String(business.attributes || '')
        .split(/[,;\n]/)
        .map(cleanKeyword)
        .filter((x) => x.length > 2 && x.length < 50 && !terms.includes(x))
        .slice(0, 8);

    const ideas: string[] = [];
    for (const t of [...terms, ...services]) {
        ideas.push(`${t} near me`, `best ${t} near me`, `${t} open now`, `${t} services`, `top rated ${t}`, `${t} cost`, `${t} reviews`);
        if (city) ideas.push(`${t} ${city}`, `best ${t} in ${city}`, `affordable ${t} ${city}`);
        ideas.push(`emergency ${t}`, `cheap ${t} near me`, `private ${t}`, `${t} appointment`);
    }
    const seen = new Set<string>();
    return ideas.filter((k) => {
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/** One live Google Maps rank check for a keyword at a location (1 DataForSEO call). History is saved by the caller. */
export async function checkRank(
    keyword: string,
    center: { lat: number; lng: number },
    business: GridBusiness
): Promise<{ rank: number; top3: string[] }> {
    const { rank, top3 } = await rankAtPoint(keyword, center.lat, center.lng, business);
    return { rank: Math.min(NOT_RANKED, rank), top3 };
}
