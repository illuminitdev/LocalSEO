/**
 * Pure logic for admin lead GBP enrichment: the 6 checks, priority rule, copy templates,
 * Maps-URL parsing and NAP matching. No network / DB access here so it can be unit tested.
 */

export type CheckKey =
    | 'reviewReplies'
    | 'services'
    | 'posting'
    | 'nap'
    | 'primaryCategory'
    | 'secondaryCategory';

/** pass: true = ok, false = confirmed gap, null = could not be measured (never reported as a gap). */
export type CheckResult = { key: CheckKey; pass: boolean | null; evidence: string };

export type Priority = 'High' | 'Medium' | 'Low';

export const CHECK_KEYS: CheckKey[] = [
    'reviewReplies',
    'services',
    'posting',
    'nap',
    'primaryCategory',
    'secondaryCategory'
];

/** Which gaps to mention first when more than MAX_GAPS fail (most sellable first). */
const GAP_ORDER: CheckKey[] = [
    'primaryCategory',
    'nap',
    'reviewReplies',
    'posting',
    'services',
    'secondaryCategory'
];

export const MAX_GAPS = 3;

const GAP_TEXT: Record<CheckKey, { gbp: string; ai: string }> = {
    reviewReplies: {
        gbp: "Owner isn't replying to customer reviews",
        ai: 'Unanswered reviews weaken the trust signals AI assistants use when deciding who to recommend'
    },
    services: {
        gbp: 'No services or products listed on the profile',
        ai: "AI tools can't tell exactly what they offer, so they rarely suggest them for specific service searches"
    },
    posting: {
        gbp: 'Not posting or updating the profile regularly (nothing in the last 30 days)',
        ai: 'A stale profile looks inactive, and AI engines favour businesses with fresh, recent activity'
    },
    nap: {
        gbp: "Name, address or phone on the profile doesn't match their website",
        ai: 'Inconsistent business details make AI and search engines unsure which information is correct'
    },
    primaryCategory: {
        gbp: 'No primary category set on the profile',
        ai: "Without a clear category AI assistants can't place them in the right 'best [service] near me' answers"
    },
    secondaryCategory: {
        gbp: 'No secondary categories added, so they miss related searches',
        ai: 'Fewer category signals means fewer topics AI can connect them to'
    }
};

export function failedChecks(checks: CheckResult[]): CheckResult[] {
    return checks.filter((c) => c.pass === false);
}

/**
 * Priority from the number of confirmed gaps out of 6 (unmeasured checks are not counted as gaps):
 * passed 0-3 (3+ gaps) -> High, passed 4 (2 gaps) -> Medium, passed 5-6 (0-1 gaps) -> Low.
 */
export function priorityFromChecks(checks: CheckResult[]): Priority {
    const fails = failedChecks(checks).length;
    const passed = CHECK_KEYS.length - fails;
    if (passed <= 3) return 'High';
    if (passed === 4) return 'Medium';
    return 'Low';
}

/** Failed checks, ordered by sales relevance and capped. */
export function topGaps(checks: CheckResult[], max = MAX_GAPS): CheckResult[] {
    const failed = failedChecks(checks);
    return GAP_ORDER.map((k) => failed.find((c) => c.key === k)).filter(Boolean).slice(0, max) as CheckResult[];
}

/** Deterministic fallback copy (used when the LLM is unavailable or returns junk). */
export function templateCopy(checks: CheckResult[]): { gbpObservation: string; aiVisibilityObservation: string } {
    const gaps = topGaps(checks);
    if (!gaps.length) {
        return {
            gbpObservation: 'Profile basics are in good shape: replies, services, posting, NAP and categories all check out.',
            aiVisibilityObservation:
                'Strong foundations for AI recommendations; focus the pitch on website and local AI SEO instead.'
        };
    }
    const join = (arr: string[]) => arr.map((s, i) => `${i + 1}. ${s}`).join('\n');
    return {
        gbpObservation: join(gaps.map((g) => GAP_TEXT[g.key].gbp)),
        aiVisibilityObservation: join(gaps.map((g) => GAP_TEXT[g.key].ai))
    };
}

export function gapLabels(checks: CheckResult[]): Array<{ key: CheckKey; gbp: string; ai: string; evidence: string }> {
    return topGaps(checks).map((g) => ({ key: g.key, ...GAP_TEXT[g.key], evidence: g.evidence }));
}

/* ---------------------------- Maps URL parsing ---------------------------- */

export type ParsedGbpUrl = {
    name: string;
    lat: number | null;
    lng: number | null;
    cid: string | null;
    placeId: string | null;
};

export function parseGbpUrlText(rawUrl: string): ParsedGbpUrl {
    let u = String(rawUrl || '').trim();
    const out: ParsedGbpUrl = { name: '', lat: null, lng: null, cid: null, placeId: null };
    if (!u) return out;

    // Consent interstitials wrap the real URL in ?continue=
    try {
        const parsed = new URL(u);
        if (/consent\.google\./i.test(parsed.hostname)) {
            const cont = parsed.searchParams.get('continue');
            if (cont) u = cont;
        }
    } catch {
        return out;
    }

    let decoded = u;
    try {
        decoded = decodeURIComponent(u);
    } catch {
        /* keep raw */
    }

    const nameMatch = decoded.match(/\/maps\/place\/([^/@?]+)/i);
    if (nameMatch) out.name = nameMatch[1].replace(/\+/g, ' ').trim();

    const precise = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const at = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const ll = precise || at;
    if (ll) {
        out.lat = Number(ll[1]);
        out.lng = Number(ll[2]);
    }

    const hex = decoded.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
    if (hex) {
        try {
            out.cid = BigInt('0x' + hex[1]).toString();
        } catch {
            /* ignore */
        }
    }
    const cidParam = decoded.match(/[?&]cid=(\d+)/i);
    if (cidParam) out.cid = cidParam[1];

    const pid = decoded.match(/place_?id[=:]\s*(ChIJ[\w-]+)/i) || decoded.match(/\b(ChIJ[\w-]{10,})\b/);
    if (pid) out.placeId = pid[1];

    // share.google/<id> links carry an opaque id in ?q= (not a business name)
    const q = /share.google/i.test(decoded) ? null : decoded.match(/[?&]q=([^&]+)/i);
    if (!out.name && q) out.name = q[1].replace(/\+/g, ' ').trim();

    return out;
}

/* -------------------------------- NAP match ------------------------------- */

const STOP = new Set(['ltd', 'limited', 'the', 'and', 'co', 'company', 'services', 'service', 'uk', 'llp', 'plc']);

function norm(s: string): string {
    return String(s || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokens(s: string): string[] {
    return norm(s)
        .split(' ')
        .filter((t) => t.length > 1 && !STOP.has(t));
}

export function nameMatches(gbpName: string, pageText: string): boolean {
    const page = norm(pageText);
    const n = norm(gbpName);
    if (!n) return true;
    if (page.includes(n)) return true;
    const t = tokens(gbpName);
    if (!t.length) return true;
    const hit = t.filter((x) => page.includes(x)).length;
    return hit / t.length >= 0.75;
}

export function phoneMatches(gbpPhone: string, pageText: string): boolean {
    const d = String(gbpPhone || '').replace(/\D/g, '');
    if (d.length < 7) return true;
    const tail = d.slice(-9);
    const pageDigits = String(pageText || '').replace(/\D/g, '');
    return pageDigits.includes(tail);
}

export function addressMatches(gbpAddress: string, pageText: string): boolean {
    const page = norm(pageText);
    const pc = String(gbpAddress || '').match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i);
    if (pc) {
        const compact = pc[0].replace(/\s+/g, '').toLowerCase();
        if (String(pageText || '').toLowerCase().replace(/\s+/g, '').includes(compact)) return true;
    }
    const t = tokens(gbpAddress).filter((x) => !/^(street|st|road|rd|avenue|ave|lane|ln|united|kingdom)$/.test(x));
    if (!t.length) return true;
    const hit = t.filter((x) => page.includes(x)).length;
    return hit / t.length >= 0.6;
}

/** Compare GBP name/address/phone with website text. Returns the mismatching parts (empty = match). */
export function napMismatches(
    gbp: { name: string; address: string; phone: string },
    pageText: string
): string[] {
    const bad: string[] = [];
    if (!nameMatches(gbp.name, pageText)) bad.push('name');
    if (!addressMatches(gbp.address, pageText)) bad.push('address');
    if (!phoneMatches(gbp.phone, pageText)) bad.push('phone');
    return bad;
}
