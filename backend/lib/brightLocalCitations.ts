import { CitationScanError, cityFromAddress, type CitationScanBusiness, type CitationScanRow } from './dataForSeoCitations';

// BrightLocal Local Data API: one "find listing" request per directory, polled until ready.
const BASE = 'https://api.brightlocal.com/data/v1';

// UK directories checked on every scan, in table order. ids are BrightLocal directory ids.
const DIRECTORIES: Array<{ id: string; label: string }> = [
    { id: 'google', label: 'Google' },
    { id: 'bing', label: 'Bing Places' },
    { id: 'apple', label: 'Apple Maps' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'yelp', label: 'Yelp' },
    { id: 'thomsonlocal', label: 'Thomson Local' },
    { id: '192centralindex', label: '192.com (Central Index)' },
    { id: 'tripadvisor', label: 'TripAdvisor' },
    { id: 'trustpilot', label: 'Trustpilot' },
    { id: 'foursquare', label: 'Foursquare' },
    { id: 'nextdoor', label: 'Nextdoor' },
    { id: 'tomtom', label: 'TomTom' },
    { id: 'here', label: 'HERE' },
    { id: 'scoot', label: 'Scoot' },
    { id: 'freeindex', label: 'FreeIndex' },
    { id: 'hotfrog', label: 'Hotfrog' },
    { id: 'brownbook', label: 'Brownbook' },
    { id: 'touchlocal', label: 'TouchLocal' },
    { id: 'yplocal', label: 'YPlocal' },
    { id: 'cybo', label: 'Cybo' },
    { id: 'businessmagnet', label: 'Business Magnet' },
    { id: 'uksmallbusinessdirectory', label: 'UK Small Business Directory' },
    { id: 'thetradefinder', label: 'The Trade Finder' },
    { id: 'misterwhat', label: 'Misterwhat' },
    { id: 'opendi', label: 'Opendi' },
    { id: 'fyple', label: 'Fyple' },
    { id: 'storeboard', label: 'Storeboard' },
    { id: 'tupalo', label: 'Tupalo' },
    { id: 'zipleaf', label: 'Zipleaf' }
];

// Google can take ~2 minutes; anything still running after this is reported as not found.
const MAX_WAIT_MS = 170 * 1000;

export type BrightLocalRow = CitationScanRow & {
    claimed?: boolean | null;
    rating?: number | null;
    reviewCount?: number | null;
};

export type BrightLocalPending = {
    provider: 'brightlocal';
    startedAt: string;
    requests: Array<{ directory: string; id: string }>;
    done: Record<string, BrightLocalRow>;
};

export function brightLocalConfigured() {
    return Boolean(String(process.env.BRIGHTLOCAL_API_KEY || '').trim());
}

async function blFetch(path: string, init: RequestInit = {}) {
    const res = await fetch(`${BASE}/${path}`, {
        ...init,
        headers: {
            'x-api-key': String(process.env.BRIGHTLOCAL_API_KEY || '').trim(),
            'Content-Type': 'application/json',
            ...(init.headers || {})
        },
        signal: AbortSignal.timeout(15000)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detail = data?.message || (data?.errors ? JSON.stringify(data.errors) : '') || `HTTP ${res.status}`;
        throw new Error(`BrightLocal ${path}: ${detail}`);
    }
    return data;
}

function postcodeFromAddress(address: string) {
    return String(address || '').match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i)?.[1]?.toUpperCase() || '';
}

function missingRow(label: string): BrightLocalRow {
    return { directory: label, status: 'missing', url: '', businessName: '', address: '', phone: '', note: 'No public listing found' };
}

function rowFromProfile(label: string, profile: any): BrightLocalRow {
    const nap = profile?.nap || {};
    const address =
        String(profile?.address || '').trim() ||
        [nap.street_address, nap.locality, nap.postcode].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
    const rating = Number(profile?.reviews?.star_rating);
    const reviewCount = Number(profile?.reviews?.num_reviews);
    return {
        directory: label,
        status: 'found',
        url: String(profile?.urls?.profile_url || '').trim(),
        businessName: String(nap.business_name || profile?.title || '').trim(),
        address,
        phone: String(nap.telephone || '').trim(),
        note: '',
        claimed: typeof profile?.is_claimed === 'boolean' ? profile.is_claimed : null,
        rating: Number.isFinite(rating) && rating > 0 ? rating : null,
        reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : null
    };
}

export async function startBrightLocalScan(business: CitationScanBusiness): Promise<BrightLocalPending> {
    const name = String(business.name || '').trim();
    if (!name) throw new CitationScanError('Save the business name before running a citation audit.', 400);
    const payload: Record<string, unknown> = {
        business_names: [name],
        country: 'GBR',
        city: cityFromAddress(String(business.address || '')),
        postcode: postcodeFromAddress(String(business.address || '')),
        telephone: String(business.phone || '').replace(/[^\d+]/g, '')
    };
    for (const key of Object.keys(payload)) if (!payload[key]) delete payload[key];

    const settled = await Promise.allSettled(
        DIRECTORIES.map(async (dir) => {
            const data = await blFetch('listings/find', {
                method: 'POST',
                body: JSON.stringify({ ...payload, directory: dir.id })
            });
            const id = String(data?.request_id || '').trim();
            if (!id) throw new Error(`BrightLocal listings/find returned no request_id for ${dir.id}`);
            return { directory: dir.id, id };
        })
    );
    const requests = settled.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []));
    const failed = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (!requests.length) {
        throw new CitationScanError(String(failed[0]?.reason?.message || 'BrightLocal did not accept the scan'));
    }
    if (failed.length) console.warn('[citations] BrightLocal requests not queued:', failed.map((f) => f.reason?.message).join(' | '));
    return { provider: 'brightlocal', startedAt: new Date().toISOString(), requests, done: {} };
}

/** Polls the unfinished requests once. Returns rows when every directory is done or the wait limit passes. */
export async function collectBrightLocalScan(pending: BrightLocalPending) {
    const done = { ...(pending.done || {}) };
    const open = pending.requests.filter((req) => !done[req.directory]);
    await Promise.all(
        open.map(async (req) => {
            const label = DIRECTORIES.find((d) => d.id === req.directory)?.label || req.directory;
            try {
                const data = await blFetch(`listings/results/${encodeURIComponent(req.id)}`);
                if (!data?.ready) return;
                done[req.directory] = data.success && data.profile?.nap ? rowFromProfile(label, data.profile) : missingRow(label);
            } catch (err: any) {
                console.warn('[citations] BrightLocal result check failed:', err?.message || err);
            }
        })
    );
    const age = Date.now() - new Date(pending.startedAt).getTime();
    const allDone = pending.requests.every((req) => done[req.directory]);
    if (!allDone && age < MAX_WAIT_MS) {
        return { ready: false as const, pending: { ...pending, done } };
    }
    const citations = DIRECTORIES.map((dir) => done[dir.id] || missingRow(dir.label));
    return { ready: true as const, citations, source: 'brightlocal' };
}
