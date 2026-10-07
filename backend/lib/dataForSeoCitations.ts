export type CitationScanBusiness = {
    name?: string;
    address?: string;
    phone?: string;
    website?: string;
    lat?: number | null;
    lng?: number | null;
    placeId?: string;
};

export type CitationScanRow = {
    directory: string;
    status: 'found' | 'missing' | 'mismatch';
    url: string;
    businessName: string;
    address: string;
    phone: string;
    note: string;
};

type DirectoryRule = {
    id: string;
    label: string;
    hosts: string[];
    checklist: boolean;
};

const DIRECTORIES: DirectoryRule[] = [
    { id: 'google', label: 'Google', hosts: ['google.com', 'google.co.uk'], checklist: true },
    { id: 'bing', label: 'Bing Places', hosts: ['bing.com'], checklist: true },
    { id: 'apple', label: 'Apple Maps', hosts: ['maps.apple.com', 'businessconnect.apple.com'], checklist: true },
    { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'], checklist: true },
    { id: 'yelp', label: 'Yelp', hosts: ['yelp.com', 'yelp.co.uk'], checklist: true },
    { id: 'yell', label: 'Yell', hosts: ['yell.com'], checklist: true },
    { id: 'thomson', label: 'Thomson Local', hosts: ['thomsonlocal.com'], checklist: true },
    { id: '192', label: '192.com', hosts: ['192.com'], checklist: true },
    { id: 'tripadvisor', label: 'TripAdvisor', hosts: ['tripadvisor.com', 'tripadvisor.co.uk'], checklist: true },
    { id: 'trustpilot', label: 'Trustpilot', hosts: ['trustpilot.com'], checklist: true },
    { id: 'foursquare', label: 'Foursquare', hosts: ['foursquare.com'], checklist: true },
    { id: 'checkatrade', label: 'Checkatrade', hosts: ['checkatrade.com'], checklist: true },
    { id: 'bark', label: 'Bark', hosts: ['bark.com'], checklist: true },
    { id: 'freeindex', label: 'FreeIndex', hosts: ['freeindex.co.uk'], checklist: true },
    { id: 'scoot', label: 'Scoot', hosts: ['scoot.co.uk'], checklist: true },
    { id: 'cylex', label: 'Cylex', hosts: ['cylex-uk.co.uk', 'cylex.co.uk'], checklist: true },
    { id: 'hotfrog', label: 'Hotfrog', hosts: ['hotfrog.co.uk', 'hotfrog.com'], checklist: true },
    { id: 'brownbook', label: 'Brownbook', hosts: ['brownbook.net'], checklist: true },
    { id: 'bbb', label: 'BBB', hosts: ['bbb.org'], checklist: true },
    { id: 'yellowpages', label: 'Yellow Pages', hosts: ['yellowpages.com', 'yp.com'], checklist: true }
];

type RawHit = {
    directoryId: string;
    url: string;
    title: string;
    text: string;
    businessName: string;
    address: string;
    phone: string;
    score: number;
};

export class CitationScanError extends Error {
    status: number;
    constructor(message: string, status = 502) {
        super(message);
        this.status = status;
    }
}

function dataForSeoConfigured() {
    return Boolean(
        String(process.env.DATAFORSEO_LOGIN || '').trim() &&
            String(process.env.DATAFORSEO_PASSWORD || '').trim()
    );
}

function authHeader() {
    const login = String(process.env.DATAFORSEO_LOGIN || '').trim();
    const password = String(process.env.DATAFORSEO_PASSWORD || '').trim();
    return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

function hostOf(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return raw
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0]
            .toLowerCase();
    }
}

function pathOf(value: string) {
    try {
        return new URL(value.startsWith('http') ? value : `https://${value}`).pathname.toLowerCase();
    } catch {
        return '';
    }
}

function hostMatches(host: string, ruleHost: string) {
    return host === ruleHost || host.endsWith(`.${ruleHost}`);
}

function isSearchPage(url: string) {
    if (/\/maps(\/|$|\?)/i.test(url)) return false;
    const path = pathOf(url);
    return /\/(search|results|find)(\/|$)/i.test(path) || /[?&](q|query|find_desc)=/i.test(url);
}

function directoryForUrl(url: string): DirectoryRule | null {
    const host = hostOf(url);
    if (!host || isSearchPage(url)) return null;
    if (hostMatches(host, 'google.com') || hostMatches(host, 'google.co.uk')) {
        if (host.startsWith('maps.') || /\/maps(\/|$)/i.test(url)) return DIRECTORIES[0];
        return null;
    }
    if (hostMatches(host, 'bing.com')) {
        if (/\/(maps|local)(\/|$|\?)/i.test(url) || /local\.bing/.test(host)) {
            return DIRECTORIES.find((d) => d.id === 'bing') || null;
        }
        return null;
    }
    return DIRECTORIES.find((rule) => rule.id !== 'google' && rule.id !== 'bing' && rule.hosts.some((h) => hostMatches(host, h))) || null;
}

function cityFromAddress(address: string) {
    const parts = String(address || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    if (!parts.length) return '';
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && /united kingdom|\buk\b|england|scotland|wales/i.test(last)) {
        return parts[parts.length - 2].replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '').trim();
    }
    if (parts.length >= 2 && /^[A-Z]{1,2}\d/i.test(last)) return parts[parts.length - 2];
    return last.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '').trim();
}

function extractPhone(text: string) {
    const matches = String(text || '').match(/(?:\+44\s?(?:\d[\s().-]?){9,12}\d|0\d(?:[\s().-]?\d){8,12})/g) || [];
    const cleaned = matches.map((value) => value.trim()).filter((value) => value.replace(/\D/g, '').length >= 10);
    return cleaned[0] || '';
}

function extractAddress(text: string) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    const postcode = source.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
    if (!postcode || postcode.index == null) return '';
    const before = source.slice(Math.max(0, postcode.index - 90), postcode.index);
    const street = before.match(/(\d{1,4}\s+[A-Za-z][^.]{0,70})$/);
    const body = (street?.[1] || before.replace(/^.*(?:\.|!|\?)\s*/, '')).replace(/[,\s]+$/, '');
    return `${body} ${postcode[1]}`.replace(/\s+/g, ' ').trim();
}

function nameFromTitle(title: string, label: string) {
    const first = String(title || '')
        .split(/\s[-|–—:|]\s/)[0]
        .replace(new RegExp(label, 'ig'), '')
        .replace(/\s+/g, ' ')
        .trim();
    if (first.length < 3 || /^(home|review|reviews|photos|page)$/i.test(first)) return '';
    return first.slice(0, 140);
}

function slugLooksLikeBusiness(url: string, businessName: string) {
    const name = normName(businessName);
    if (name.length < 5) return false;
    const slug = `${hostOf(url)} ${pathOf(url)}`.replace(/[^a-z0-9]+/g, '');
    return slug.includes(name);
}

function ownHost(website: string) {
    return hostOf(website);
}

function mapsLocation(business: CitationScanBusiness) {
    const lat = business.lat;
    const lng = business.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { location_coordinate: `${lat},${lng},14z` };
    }
    return { location_code: 2826 };
}

async function dfsTask(path: string, task: Record<string, unknown>, timeoutMs: number) {
    const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
        method: 'POST',
        headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(String(data?.status_message || `DataForSEO HTTP ${res.status}`));
    }
    const resultTask = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!resultTask || resultTask.status_code !== 20000) {
        throw new Error(String(resultTask?.status_message || data?.status_message || 'DataForSEO task failed'));
    }
    const result = Array.isArray(resultTask.result) ? resultTask.result[0] : resultTask.result;
    return result || {};
}

function pushHit(hits: RawHit[], hit: RawHit) {
    if (!hit.directoryId) return;
    if (!hit.url && !hit.businessName && !hit.phone && !hit.address) return;
    hits.push(hit);
}

function hitFromUrl(opts: {
    url: string;
    title?: string;
    text?: string;
    businessName?: string;
    address?: string;
    phone?: string;
    score?: number;
    website?: string;
    expectedName?: string;
}): RawHit | null {
    const url = String(opts.url || '').trim();
    const directory = directoryForUrl(url);
    if (!directory) return null;
    const host = hostOf(url);
    const site = ownHost(opts.website || '');
    if (site && host && (host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`))) return null;
    const text = String(opts.text || '').trim();
    const phone = String(opts.phone || '').trim() || extractPhone(text);
    const address = String(opts.address || '').trim() || extractAddress(text);
    let businessName = nameFromTitle(String(opts.title || opts.businessName || ''), directory.label);
    if (!businessName && slugLooksLikeBusiness(url, String(opts.expectedName || ''))) {
        businessName = String(opts.expectedName || '').trim();
    }
    return {
        directoryId: directory.id,
        url,
        title: String(opts.title || ''),
        text,
        businessName,
        address,
        phone,
        score: (opts.score || 0) + (phone ? 4 : 0) + (address ? 2 : 0)
    };
}

function absorbSerpItems(items: any[], hits: RawHit[], website: string, expectedName: string) {
    for (const item of Array.isArray(items) ? items : []) {
        const type = String(item?.type || '').toLowerCase();
        const nested = Array.isArray(item?.items) ? item.items : [];
        if (nested.length && (type.includes('local') || type.includes('map') || type === 'knowledge_graph')) {
            absorbSerpItems(nested, hits, website, expectedName);
        }
        const url = String(item?.url || item?.domain || '').trim();
        const text = [item?.description, item?.snippet, item?.address, nested.length ? '' : item?.phone]
            .filter(Boolean)
            .join(' ');
        const hit = hitFromUrl({
            url,
            title: item?.title,
            text,
            address: item?.address,
            phone: item?.phone,
            score: type.includes('local') || type.includes('map') ? 3 : 1,
            website,
            expectedName
        });
        if (hit) pushHit(hits, hit);
    }
}

function normName(value: string) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function digits(value: string) {
    return String(value || '').replace(/\D/g, '');
}

function mapsMatchScore(item: any, business: CitationScanBusiness) {
    let score = 0;
    const nameA = normName(business.name || '');
    const nameB = normName(item?.title || item?.name || '');
    const idA = String(business.placeId || '').replace(/^places\//, '');
    const idB = String(item?.place_id || item?.cid || '');
    if (idA && idB && (idA === idB || idB.includes(idA) || idA.includes(idB))) score += 100;
    if (nameA && nameB && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA))) score += 50;
    const phoneA = digits(business.phone || '');
    const phoneB = digits(item?.phone || '');
    if (phoneA.length >= 8 && phoneB.length >= 8 && (phoneA.endsWith(phoneB.slice(-8)) || phoneB.endsWith(phoneA.slice(-8)))) {
        score += 40;
    }
    const hostA = ownHost(business.website || '');
    const hostB = hostOf(String(item?.domain || item?.url || ''));
    if (hostA && hostB && (hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`))) score += 35;
    return score;
}

function addMapsHit(result: any, hits: RawHit[], business: CitationScanBusiness) {
    const rawItems = Array.isArray(result?.items) ? result.items : [];
    const items = rawItems.flatMap((item: any) => (Array.isArray(item?.items) && item.items.length ? item.items : [item]));
    let best: { item: any; score: number } | null = null;
    for (const item of items) {
        const score = mapsMatchScore(item, business);
        if (score >= 40 && (!best || score > best.score)) best = { item, score };
    }
    if (!best) return;
    const item = best.item;
    const placeId = String(item?.place_id || '').trim();
    const cid = String(item?.cid || '').trim();
    const mapsUrl = placeId
        ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
        : cid
          ? `https://www.google.com/maps?cid=${encodeURIComponent(cid)}`
          : '';
    const url = mapsUrl || String(item?.url || '').trim();
    if (!url && !item?.title && !item?.phone && !item?.address) return;
    pushHit(hits, {
        directoryId: 'google',
        url,
        title: String(item?.title || business.name || ''),
        text: '',
        businessName: String(item?.title || ''),
        address: String(item?.address || ''),
        phone: String(item?.phone || ''),
        score: 20 + best.score
    });
}

function addContentHits(result: any, hits: RawHit[], website: string, expectedName: string) {
    const items = Array.isArray(result?.items) ? result.items : [];
    for (const item of items) {
        const info = item?.content_info || {};
        const text = String(info.snippet || info.title || '');
        const hit = hitFromUrl({
            url: item?.url,
            title: info.main_title || info.title,
            text,
            score: 2,
            website,
            expectedName
        });
        if (hit) pushHit(hits, hit);
    }
}

function bestHits(hits: RawHit[]) {
    const byDirectory = new Map<string, RawHit>();
    for (const hit of hits) {
        const current = byDirectory.get(hit.directoryId);
        if (!current || hit.score > current.score) byDirectory.set(hit.directoryId, hit);
    }
    return byDirectory;
}

function rowsFromHits(hits: RawHit[]): CitationScanRow[] {
    const best = bestHits(hits);
    return DIRECTORIES.filter((rule) => rule.checklist).map((rule) => {
        const hit = best.get(rule.id);
        if (!hit) {
            return {
                directory: rule.label,
                status: 'missing' as const,
                url: '',
                businessName: '',
                address: '',
                phone: '',
                note: 'No public listing found'
            };
        }
        return {
            directory: rule.label,
            status: 'found' as const,
            url: hit.url,
            businessName: hit.businessName,
            address: hit.address,
            phone: hit.phone,
            note: ''
        };
    });
}

export type CitationScanPending = {
    mapsTaskId: string;
    organicTaskId: string;
    bingTaskId: string;
    startedAt: string;
};

function scanTasks(business: CitationScanBusiness) {
    const name = String(business.name || '').trim();
    const city = cityFromAddress(String(business.address || ''));
    const keyword = [name, city].filter(Boolean).join(' ');
    const where = mapsLocation(business);
    const mapsTask: Record<string, unknown> = {
        language_code: 'en',
        keyword,
        depth: 20,
        device: 'desktop',
        os: 'windows',
        priority: 2,
        ...where,
        ...('location_coordinate' in where ? { search_this_area: true } : {})
    };
    const organicTask: Record<string, unknown> = {
        language_code: 'en',
        keyword,
        depth: 20,
        device: 'desktop',
        os: 'windows',
        priority: 2,
        location_code: 2826
    };
    const bingTask: Record<string, unknown> = {
        language_code: 'en',
        keyword,
        depth: 10,
        device: 'desktop',
        priority: 2,
        location_code: 2826
    };
    return { name, keyword, mapsTask, organicTask, bingTask, website: String(business.website || '') };
}

async function dfsJson(path: string, init: RequestInit) {
    const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
        ...init,
        headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/json',
            ...(init.headers || {})
        },
        signal: AbortSignal.timeout(12000)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(String(data?.status_message || `DataForSEO HTTP ${res.status}`));
    }
    const resultTask = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!resultTask) throw new Error(String(data?.status_message || 'DataForSEO returned no task'));
    return resultTask;
}

async function postTask(path: string, task: Record<string, unknown>) {
    const resultTask = await dfsJson(path, { method: 'POST', body: JSON.stringify([task]) });
    const code = Number(resultTask.status_code);
    if (code !== 20000 && code !== 20100) {
        throw new Error(String(resultTask.status_message || 'DataForSEO task was not accepted'));
    }
    const id = String(resultTask.id || '').trim();
    if (!id) throw new Error('DataForSEO did not return a task id');
    return id;
}

async function getTask(path: string, id: string): Promise<'pending' | { error: string } | any> {
    if (!id) return { error: 'Missing task id' };
    const resultTask = await dfsJson(`${path}/${encodeURIComponent(id)}`, { method: 'GET' });
    const code = Number(resultTask.status_code);
    if (code === 40601 || code === 40602) return 'pending';
    if (code !== 20000) return { error: String(resultTask.status_message || 'DataForSEO task failed') };
    const result = Array.isArray(resultTask.result) ? resultTask.result[0] : resultTask.result;
    return result || {};
}

export async function startCitationScan(business: CitationScanBusiness): Promise<CitationScanPending> {
    if (!dataForSeoConfigured()) {
        throw new CitationScanError(
            'DataForSEO login is missing. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to backend/.env and restart.',
            503
        );
    }
    const name = String(business.name || '').trim();
    if (!name) {
        throw new CitationScanError('Save the business name before running a citation audit.', 400);
    }
    const tasks = scanTasks(business);
    const [mapsTaskId, organicTaskId, bingTaskId] = await Promise.all([
        postTask('serp/google/maps/task_post', tasks.mapsTask),
        postTask('serp/google/organic/task_post', tasks.organicTask),
        postTask('serp/bing/organic/task_post', tasks.bingTask).catch((err: any) => {
            console.warn('[citations] Bing task was not queued:', err?.message || err);
            return '';
        })
    ]);
    return {
        mapsTaskId,
        organicTaskId,
        bingTaskId,
        startedAt: new Date().toISOString()
    };
}

export async function collectCitationScan(pending: CitationScanPending, business: CitationScanBusiness) {
    if (!dataForSeoConfigured()) {
        throw new CitationScanError(
            'DataForSEO login is missing. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to backend/.env and restart.',
            503
        );
    }
    const tasks = scanTasks(business);
    const [maps, organic, bing] = await Promise.all([
        getTask('serp/google/maps/task_get/advanced', pending.mapsTaskId),
        getTask('serp/google/organic/task_get/advanced', pending.organicTaskId),
        pending.bingTaskId
            ? getTask('serp/bing/organic/task_get/advanced', pending.bingTaskId)
            : Promise.resolve({ error: 'Bing not queued' })
    ]);
    if (maps === 'pending' || organic === 'pending') {
        return { ready: false as const };
    }
    const bingResult = bing === 'pending' ? { error: 'Bing still queued' } : bing;
    const failures = [maps, organic, bingResult].filter((item) => item && item.error);
    if (failures.length === 3 || (maps?.error && organic?.error)) {
        throw new CitationScanError(failures[0]?.error || 'DataForSEO citation search did not finish. Run it again.');
    }
    const hits: RawHit[] = [];
    if (!maps?.error) addMapsHit(maps, hits, business);
    if (!organic?.error) absorbSerpItems(organic?.items, hits, tasks.website, tasks.name);
    if (bingResult && !bingResult.error) absorbSerpItems(bingResult?.items, hits, tasks.website, tasks.name);
    try {
        const indexed = await dfsTask(
            'content_analysis/search/live',
            {
                keyword: tasks.name,
                search_mode: 'one_per_domain',
                limit: 40,
                filters: ['main_domain', 'in', DIRECTORIES.flatMap((rule) => rule.hosts)]
            },
            4000
        );
        addContentHits(indexed, hits, tasks.website, tasks.name);
    } catch (err: any) {
        console.warn('[citations] directory index search skipped:', err?.message || err);
    }
    if (failures.length) {
        console.warn('[citations] partial DataForSEO results:', failures.map((item) => item.error).join(' | '));
    }
    return { ready: true as const, citations: rowsFromHits(hits), source: 'dataforseo' };
}
