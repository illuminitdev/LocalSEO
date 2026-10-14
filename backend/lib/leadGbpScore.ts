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

const GAP_TEXT: Record<CheckKey, string> = {
    reviewReplies: "Owner isn't replying to customer reviews",
    services: 'No services or products listed on the profile',
    posting: 'Not posting or updating the profile regularly (nothing in the last 30 days)',
    nap: "Name, address or phone on the profile doesn't match their website",
    primaryCategory: 'No primary category set on the profile',
    secondaryCategory: 'No secondary categories added, so they miss related searches'
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

/** Deterministic GBP observation (used when the LLM is unavailable or returns junk). */
export function templateGbpObservation(checks: CheckResult[]): string {
    const gaps = topGaps(checks);
    if (!gaps.length) {
        return 'Profile basics are in good shape: replies, services, posting, NAP and categories all check out.';
    }
    return gaps.map((g, i) => `${i + 1}. ${GAP_TEXT[g.key]}`).join('\n');
}

export function gapLabels(checks: CheckResult[]): Array<{ key: CheckKey; gbp: string; evidence: string }> {
    return topGaps(checks).map((g) => ({ key: g.key, gbp: GAP_TEXT[g.key], evidence: g.evidence }));
}

/* ------------------------- AI visibility questions ------------------------- */

const ACTIVITY_NOUNS: Record<string, string> = {
    plumber: 'plumbing',
    electrician: 'electrical',
    roofer: 'roofing',
    builder: 'building',
    painter: 'painting and decorating',
    carpenter: 'carpentry',
    dentist: 'dental',
    gardener: 'gardening',
    cleaner: 'cleaning',
    'pest controller': 'pest control'
};

const MERGED_WORDS: Record<string, string> = {
    pestcontrol: 'pest control',
    doubleglazing: 'double glazing',
    dogsgrooming: 'dog grooming',
    dentalcare: 'dental care'
};

function cleanService(raw: string): string {
    let s = String(raw || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    s = MERGED_WORDS[s.replace(/\s/g, '')] || s;
    const generic = /\s+(services?|contractors?|companies|company|specialists?|suppliers?|installers?|fitters?|repairers?|manufacturers?|dealers?|centre|center|shop|store|agency|firm)$/;
    while (generic.test(s)) s = s.replace(generic, '');
    s = s.trim();
    if (/^(lead|other|others|general|business|sheet|na|n a)$/.test(s)) return '';
    return ACTIVITY_NOUNS[s] || s;
}

/**
 * The business type searched for on AI. It is the Excel "Business" column ("Windows & Doors" -> "windows and doors"),
 * the same for every row of a sheet; the GBP category is used only when the Excel has none.
 */
export function serviceFromBusiness(industry: string, gbpCategory = ''): string {
    return cleanService(industry) || cleanService(gbpCategory);
}

/** Town/city from a UK-style address: "1 Lightning Way, West Heath, Birmingham B31 3PH" -> "Birmingham". */
export function cityFromGbpAddress(address: string): string {
    const parts = String(address || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    const postcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
    const cleaned = parts
        .filter((p) => !/^(united kingdom|uk|england|scotland|wales|northern ireland)$/i.test(p))
        .map((p) => p.replace(postcode, '').trim())
        .filter(Boolean);
    return cleaned[cleaned.length - 1] || '';
}

const STREET_WORDS =
    /\b(road|rd|street|st|lane|ln|way|avenue|ave|drive|dr|close|grove|court|ct|place|pl|crescent|terrace|gardens|park|hill|row|walk|square|unit|floor|house|estate|works|business|industrial)\b/i;

/**
 * Neighbourhood / district from a UK-style address (never a street):
 * "1 Lightning Way, West Heath, Birmingham B31 3PH" -> "West Heath".
 */
export function areaFromGbpAddress(address: string): string {
    const parts = String(address || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !/^(united kingdom|uk|england|scotland|wales|northern ireland)$/i.test(p));
    const postcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
    const cleaned = parts.map((p) => p.replace(postcode, '').trim()).filter(Boolean);
    const city = cleaned[cleaned.length - 1] || '';
    const candidates = cleaned
        .slice(0, -1)
        .filter((p) => !/\d/.test(p) && !STREET_WORDS.test(p) && p.toLowerCase() !== city.toLowerCase());
    return candidates[candidates.length - 1] || '';
}

/** Local-search questions asked to the AI assistant for one lead (city level, then neighbourhood level). */
export function aiQuestions(service: string, city: string, area = ''): string[] {
    const inCity = city ? ` in ${city}` : ' near me';
    const where = area && city ? `${area}, ${city}` : area || city;
    return [
        `What are the best ${service}${inCity}?`,
        `Who would you recommend for ${service}${inCity}?`,
        where ? `Who are the top rated ${service} in ${where}?` : `Who has the best reviews for ${service}${inCity}?`,
        area ? `Which ${service} near ${area} should I choose?` : `Who is the most trusted choice for ${service}${inCity}?`
    ];
}

const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const compact = (v: string) =>
    String(v || '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/\b(ltd|limited|llp|plc)\b\.?/g, '')
        .replace(/[^a-z0-9]+/g, '');

/**
 * "Not Listed" when the business is not in the AI answer, "2nd position" when it appears as item 2 of a
 * numbered list, otherwise "Listed". Matches the full business name (or its website domain), never a few shared words.
 */
export function aiAnswerResult(answerText: string, businessName: string, website = '', sourceDomains: string[] = []): string {
    const name = compact(businessName);
    const host = String(website || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
    const lines = String(answerText || '').split(/\r?\n/);
    const hit = (t: string) => {
        const c = compact(t);
        return (name.length >= 4 && c.includes(name)) || Boolean(host && t.toLowerCase().includes(host));
    };

    let position = 0;
    for (const line of lines) {
        const m = line.match(/^\s*(?:#+\s*)?(?:\*\*)?(\d{1,2})[.)]\s/);
        if (m) position = Number(m[1]);
        if (hit(line)) return position ? `${ordinal(position)} position` : 'Listed';
    }
    const inSources = Boolean(host && sourceDomains.some((d) => d === host || d.endsWith(`.${host}`)));
    return inSources ? 'Listed' : 'Not Listed';
}

export const MAX_AI_GAPS = 2;
export const AI_NOT_CHECKED = 'Could not be checked';


export function formatAiVisibility(questions: string[], results: string[]): string {
    const checked = results.filter((r) => r && r !== AI_NOT_CHECKED).length;
    if (!checked) return 'AI visibility could not be checked right now.';
    const notListed = questions
        .map((q, i) => ({ q, r: results[i] }))
        .filter((x) => x.r === 'Not Listed')
        .slice(0, MAX_AI_GAPS);
    if (!notListed.length) {
        return `Listed in all ${checked} AI answers checked for local searches in their area.`;
    }
    return notListed.map((x, i) => `${i + 1}. ${x.q} (Not Listed)`).join('\n');
}



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
