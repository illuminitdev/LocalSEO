/**
 * Admin Excel upload: for each lead with a GBP URL, run the 6 GBP checks and write the
 * "GBP observation", "AI visibility" and priority fields (only the cells that are empty).
 * See docs/lead-gbp-enrichment.md.
 */
import { GoogleGenAI } from '@google/genai';
import { query } from './db';
import {
    fetchGbpReviewsSample,
    fetchGbpUpdates,
    requireDataForSeoConfigured
} from '../audit-worker/src/lib/dataForSeo';
import {
    CheckResult,
    gapLabels,
    nameMatches,
    napMismatches,
    parseGbpUrlText,
    priorityFromChecks,
    templateCopy
} from './leadGbpScore';

const POSTING_WINDOW_DAYS = 30;
const CONCURRENCY = 5;
/** Leave headroom under the 15 min Lambda limit before handing the rest to a fresh invocation. */
const SOFT_DEADLINE_MS = 12 * 60 * 1000;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type LeadRow = {
    id: string;
    name: string;
    website: string;
    address: string;
    industry: string;
    gbp_url: string;
    gbp_observation: string;
    ai_visibility_observation: string;
    lead_opportunity: string;
};

type GbpInfo = {
    title: string;
    address: string;
    phone: string;
    website: string;
    category: string;
    additionalCategories: string[];
    hasServices: boolean;
    hasProducts: boolean;
    cid: string | null;
    placeId: string | null;
};

const isEmpty = (v: unknown) => !String(v ?? '').trim();

/* ------------------------------ GBP resolution ----------------------------- */

async function expandUrl(url: string): Promise<string> {
    if (/\/maps\/place\/.+(@|!1s0x)/i.test(url)) return url;
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' },
            signal: AbortSignal.timeout(10000)
        });
        return res.url || url;
    } catch {
        return url;
    }
}

async function fetchGbpInfo(opts: {
    keyword: string;
    lat: number | null;
    lng: number | null;
}): Promise<GbpInfo | null> {
    const task: Record<string, unknown> = { language_code: 'en', keyword: opts.keyword };
    if (typeof opts.lat === 'number' && typeof opts.lng === 'number') {
        task.location_coordinate = `${opts.lat},${opts.lng},200`;
    } else {
        task.location_code = 2826;
    }
    const auth = Buffer.from(
        `${process.env.DATAFORSEO_LOGIN || ''}:${process.env.DATAFORSEO_PASSWORD || ''}`
    ).toString('base64');
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(40000)
    });
    const data: any = await res.json().catch(() => ({}));
    const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!res.ok || !t || t.status_code !== 20000) return null;
    const result = Array.isArray(t.result) ? t.result[0] : t.result;
    const items = Array.isArray(result?.items) ? result.items : [];
    const info = items.find((it: any) => String(it?.type || '').includes('business_info')) || items[0];
    if (!info || !String(info.title || '').trim()) return null;

    const attrs = info.attributes?.available_attributes || info.attributes || {};
    const attrKeys = attrs && typeof attrs === 'object' ? Object.keys(attrs) : [];
    const services = Array.isArray(info.services) ? info.services : [];
    const products = Array.isArray(info.products) ? info.products : [];
    return {
        title: String(info.title || '').trim(),
        address: String(info.address || '').trim(),
        phone: String(info.phone || '').trim(),
        website: String(info.url || info.domain || '').trim(),
        category: String(info.category || '').trim(),
        additionalCategories: (Array.isArray(info.additional_categories) ? info.additional_categories : [])
            .map((c: unknown) => String(c || '').trim())
            .filter(Boolean),
        hasServices: services.length > 0 || attrKeys.some((k) => /service/i.test(k)),
        hasProducts: products.length > 0 || attrKeys.some((k) => /product/i.test(k)),
        cid: info.cid ? String(info.cid) : null,
        placeId: info.place_id ? String(info.place_id) : null
    };
}

const COMPANY_SUFFIX = /(ltd|limited|llp|plc|inc).?$/i;

/** Search keywords for a business we only know by name + address, most specific first. */
function keywordCandidates(name: string, address: string): string[] {
    const n = String(name || '').trim();
    const a = String(address || '').trim();
    const bare = n.replace(COMPANY_SUFFIX, '').trim();
    const postcode = a.match(/[A-Z]{1,2}d[A-Zd]?s*d[A-Z]{2}/i)?.[0] || '';
    const town = a.split(',').map((p) => p.trim()).filter(Boolean).slice(-2)[0] || '';
    const list = Array.from(
        new Set(
            [
                [n, a],
                [n, postcode],
                [bare, postcode],
                [bare, town]
            ]
                .map((parts) => parts.filter(Boolean).join(' ').trim())
                .filter((k) => k && k !== n)
        )
    );
    return list.length ? list : [n].filter(Boolean);
}

function titleLooksLikeLead(title: string, leadName: string, urlName: string): boolean {
    return [leadName, urlName]
        .filter(Boolean)
        .some((n) => nameMatches(n, title) || nameMatches(title, n));
}

/* -------------------------------- Website NAP ------------------------------ */

function htmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ');
}

async function fetchPage(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'User-Agent': UA, Accept: 'text/html' },
            signal: AbortSignal.timeout(9000)
        });
        if (!res.ok) return null;
        const html = (await res.text()).slice(0, 600_000);
        // tel: links often carry the phone number even when the visible text is formatted oddly
        const tel = (html.match(/href=["']tel:([^"']+)["']/gi) || []).join(' ');
        return `${htmlToText(html)} ${tel}`;
    } catch {
        return null;
    }
}

/** Homepage + a few likely contact pages. null when the site can't be reached at all. */
async function fetchSiteText(website: string): Promise<string | null> {
    let base = String(website || '').trim();
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    let origin: string;
    try {
        origin = new URL(base).origin;
    } catch {
        return null;
    }
    const home = await fetchPage(base);
    if (home === null) return null;
    const extra = await Promise.all(
        ['/contact', '/contact-us', '/about'].map((p) => fetchPage(origin + p))
    );
    return [home, ...extra.filter((x): x is string => Boolean(x))].join(' ');
}

/* ----------------------------------- Checks -------------------------------- */

export async function runChecks(lead: LeadRow): Promise<{ checks: CheckResult[]; gbpName: string; notes: string[] }> {
    const notes: string[] = [];
    const expanded = await expandUrl(lead.gbp_url);
    const parsed = parseGbpUrlText(expanded);

    const byId = parsed.placeId ? `place_id:${parsed.placeId}` : parsed.cid ? `cid:${parsed.cid}` : '';
    // Links we can't resolve to an id (e.g. share.google, which needs JavaScript) fall back to a name + address search.
    const candidates = byId ? [byId] : keywordCandidates(parsed.name || lead.name, lead.address);
    let keyword = candidates[0] || '';
    let info: GbpInfo | null = null;
    for (const kw of candidates) {
        // The live endpoint occasionally returns an empty/failed task; retry once per keyword.
        let found = await fetchGbpInfo({ keyword: kw, lat: parsed.lat, lng: parsed.lng }).catch(() => null);
        if (!found) found = await fetchGbpInfo({ keyword: kw, lat: parsed.lat, lng: parsed.lng }).catch(() => null);
        // A name search can return a different business: only accept a result that looks like this lead.
        if (found && (byId || titleLooksLikeLead(found.title, lead.name, parsed.name))) {
            info = found;
            keyword = kw;
            break;
        }
    }
    if (!info) {
        throw new Error(
            byId
                ? 'GBP not found for this URL'
                : 'GBP not found. Short links like share.google cannot be opened by the server - paste the full Google Maps link (or use Share > Copy link from Maps).'
        );
    }

    const ref = {
        placeId: info.placeId || parsed.placeId || undefined,
        cid: info.cid || parsed.cid || undefined,
        keyword,
        lat: parsed.lat,
        lng: parsed.lng
    };

    const websiteUrl = lead.website || info.website;
    const [reviews, updates, siteText] = await Promise.all([
        fetchGbpReviewsSample({ ...ref, depth: 20, timeoutMs: 45000 }).catch(() => null),
        fetchGbpUpdates({ ...ref, recentDays: POSTING_WINDOW_DAYS, timeoutMs: 30000 }).catch(() => null),
        fetchSiteText(websiteUrl)
    ]);

    const checks: CheckResult[] = [];

    // 1. Review replies
    if (reviews?.ok && reviews.reviewCount > 0) {
        checks.push({
            key: 'reviewReplies',
            pass: reviews.repliedCount > 0 && reviews.ownerRepliesLikely !== false,
            evidence: `${reviews.repliedCount}/${reviews.reviewCount} sampled reviews have an owner reply`
        });
    } else {
        checks.push({ key: 'reviewReplies', pass: null, evidence: reviews?.evidence || 'Reviews not measured' });
    }

    // 2. Services / products
    checks.push({
        key: 'services',
        pass: info.hasServices || info.hasProducts,
        evidence: info.hasServices || info.hasProducts ? 'Services/products present' : 'No services or products listed'
    });

    // 3. Regular posting
    if (updates?.ok && updates.hasRecentPosts !== null) {
        checks.push({
            key: 'posting',
            pass: Boolean(updates.hasRecentPosts),
            evidence: updates.evidence
        });
    } else {
        checks.push({ key: 'posting', pass: null, evidence: updates?.evidence || 'Posts not measured' });
    }

    // 4. NAP vs website
    if (siteText) {
        const bad = napMismatches({ name: info.title, address: info.address, phone: info.phone }, siteText);
        checks.push({
            key: 'nap',
            pass: bad.length === 0,
            evidence: bad.length ? `GBP ${bad.join(', ')} not found on website` : 'Name, address and phone match website'
        });
    } else {
        checks.push({
            key: 'nap',
            pass: null,
            evidence: websiteUrl ? 'Website could not be reached' : 'No website to compare against'
        });
    }

    // 5 & 6. Categories
    checks.push({
        key: 'primaryCategory',
        pass: Boolean(info.category),
        evidence: info.category ? `Primary: ${info.category}` : 'No primary category'
    });
    checks.push({
        key: 'secondaryCategory',
        pass: info.additionalCategories.length > 0,
        evidence: info.additionalCategories.length
            ? `Secondary: ${info.additionalCategories.slice(0, 3).join(', ')}`
            : 'No secondary categories'
    });

    const unknown = checks.filter((c) => c.pass === null).map((c) => c.key);
    if (unknown.length) notes.push(`Not measured: ${unknown.join(', ')}`);
    return { checks, gbpName: info.title, notes };
}

/* ------------------------------------ Copy --------------------------------- */

let aiClient: GoogleGenAI | null = null;

export async function writeCopy(
    lead: LeadRow,
    gbpName: string,
    checks: CheckResult[]
): Promise<{ gbpObservation: string; aiVisibilityObservation: string }> {
    const fallback = templateCopy(checks);
    const gaps = gapLabels(checks);
    if (!gaps.length || !process.env.GEMINI_API_KEY) return fallback;

    try {
        if (!aiClient) aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = [
            'You are a UK local-SEO sales agent writing short call-prep notes about a prospect\'s Google Business Profile.',
            `Business: ${gbpName || lead.name}${lead.industry ? ` (${lead.industry})` : ''}`,
            'Gaps found (mention ONLY these, nothing else):',
            ...gaps.map((g, i) => `${i + 1}. ${g.gbp} [evidence: ${g.evidence}]`),
            '',
            'Write two fields, each a numbered list with one short line per gap (max 20 words per line, plain text, no markdown):',
            '- gbpObservation: the gap as a sales agent would state it to a colleague, mentioning the evidence where useful.',
            '- aiVisibilityObservation: the same gaps, explaining how each makes ChatGPT/Gemini less likely to recommend the business.',
            'Do not invent facts. Do not mention passing checks. Reply with JSON only: {"gbpObservation":"...","aiVisibilityObservation":"..."}'
        ].join('\n');

        // Primary model first, then a fallback model (each tried once; 503s are common under load).
        const models = [process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash', 'gemini-flash-latest'];
        let response: any = null;
        let lastErr: unknown = null;
        for (const model of models) {
            try {
                response = await Promise.race([
                    aiClient.models.generateContent({
                        model,
                        contents: prompt,
                        config: { responseMimeType: 'application/json' }
                    }),
                    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Gemini timeout')), 20000))
                ]);
                break;
            } catch (e) {
                lastErr = e;
            }
        }
        if (!response) throw lastErr || new Error('Gemini unavailable');
        const raw = String((response as any).text || '')
            .replace(/^```(?:json)?/i, '')
            .replace(/```$/, '')
            .trim();
        const json = JSON.parse(raw);
        const gbp = String(json.gbpObservation || '').trim();
        const ai = String(json.aiVisibilityObservation || '').trim();
        if (gbp && ai) return { gbpObservation: gbp, aiVisibilityObservation: ai };
    } catch (err) {
        console.warn('[lead-enrich] Gemini copy failed, using template:', (err as Error)?.message);
    }
    return fallback;
}

/* ------------------------------- Orchestration ----------------------------- */

async function processLead(lead: LeadRow) {
    try {
        if (!requireDataForSeoConfigured()) throw new Error('DataForSEO is not configured');
        if (isEmpty(lead.gbp_url)) throw new Error('No GBP URL');

        // Nothing to fill: all three cells already provided in the Excel.
        if (!isEmpty(lead.gbp_observation) && !isEmpty(lead.ai_visibility_observation) && !isEmpty(lead.lead_opportunity)) {
            await query(`UPDATE sales_leads SET enrich_status = 'done', updated_at = NOW() WHERE id = $1`, [lead.id]);
            return;
        }

        const { checks, gbpName, notes } = await runChecks(lead);
        const copy = await writeCopy(lead, gbpName, checks);
        const priority = priorityFromChecks(checks);

        await query(
            `UPDATE sales_leads SET
                gbp_observation = CASE WHEN COALESCE(TRIM(gbp_observation), '') = '' THEN $2 ELSE gbp_observation END,
                ai_visibility_observation = CASE WHEN COALESCE(TRIM(ai_visibility_observation), '') = '' THEN $3 ELSE ai_visibility_observation END,
                opportunity_level = CASE WHEN COALESCE(TRIM(lead_opportunity), '') = '' THEN $5 ELSE opportunity_level END,
                lead_opportunity = CASE WHEN COALESCE(TRIM(lead_opportunity), '') = '' THEN $4 ELSE lead_opportunity END,
                enrich_status = 'done',
                enrich_error = $6,
                enrich_checks = $7::jsonb,
                enriched_at = NOW(),
                updated_at = NOW()
             WHERE id = $1`,
            [
                lead.id,
                copy.gbpObservation,
                copy.aiVisibilityObservation,
                priority,
                priority.toLowerCase(),
                notes.join('; '),
                JSON.stringify({ priority, checks })
            ]
        );
    } catch (err: any) {
        console.error('[lead-enrich] failed', lead.id, err?.message || err);
        await query(
            `UPDATE sales_leads SET enrich_status = 'failed', enrich_error = $2, updated_at = NOW() WHERE id = $1`,
            [lead.id, String(err?.message || 'Enrichment failed').slice(0, 300)]
        ).catch(() => {});
    }
}

async function claimPending(batchId: string | null, limit: number): Promise<LeadRow[]> {
    const { rows } = await query(
        `UPDATE sales_leads SET enrich_status = 'running', updated_at = NOW()
         WHERE id IN (
            SELECT id FROM sales_leads
            WHERE (enrich_status = 'pending'
                   OR (enrich_status = 'running' AND updated_at < NOW() - INTERVAL '20 minutes'))
              AND ($1::uuid IS NULL OR import_batch_id = $1::uuid)
            ORDER BY created_at
            LIMIT $2
            FOR UPDATE SKIP LOCKED
         )
         RETURNING id, name, website, address, industry, gbp_url,
                   gbp_observation, ai_visibility_observation, lead_opportunity`,
        [batchId, limit]
    );
    return rows as LeadRow[];
}

/** Process pending leads (optionally one upload batch) until none are left or time runs low. */
export async function runEnrichment(batchId: string | null = null): Promise<{ processed: number; more: boolean }> {
    const started = Date.now();
    let processed = 0;
    for (;;) {
        if (Date.now() - started > SOFT_DEADLINE_MS) return { processed, more: true };
        const rows = await claimPending(batchId, CONCURRENCY);
        if (!rows.length) return { processed, more: false };
        await Promise.all(rows.map(processLead));
        processed += rows.length;
    }
}

/** Kick off enrichment without blocking the HTTP request (own Lambda in AWS, in-process locally). */
export async function triggerLeadEnrichment(batchId: string | null): Promise<void> {
    const fn = process.env.LEAD_ENRICH_FN;
    if (fn) {
        try {
            const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
            await new LambdaClient({}).send(
                new InvokeCommand({
                    FunctionName: fn,
                    InvocationType: 'Event',
                    Payload: Buffer.from(JSON.stringify({ batchId }))
                })
            );
            return;
        } catch (err) {
            console.error('[lead-enrich] async invoke failed:', (err as Error)?.message);
            return;
        }
    }
    setImmediate(() => {
        runEnrichment(batchId).catch((e) => console.error('[lead-enrich] run failed:', e?.message || e));
    });
}

export async function enrichStatusForBatch(batchId: string) {
    const { rows } = await query(
        `SELECT enrich_status, COUNT(*)::int AS n FROM sales_leads
         WHERE import_batch_id = $1::uuid AND enrich_status <> ''
         GROUP BY enrich_status`,
        [batchId]
    );
    const out = { pending: 0, running: 0, done: 0, failed: 0 };
    for (const r of rows) (out as any)[r.enrich_status] = r.n;
    return out;
}
