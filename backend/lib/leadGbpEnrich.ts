/**
 * Admin Excel upload: for each lead with a GBP URL, run the 6 GBP checks and write the
 * "GBP observation", "AI visibility" and priority fields (only the cells that are empty).
 * See docs/lead-gbp-enrichment.md.
 */
import { query } from './db';
import {
    fetchGbpReviewsSample,
    fetchGbpUpdates,
    requireDataForSeoConfigured
} from '../audit-worker/src/lib/dataForSeo';
import { askLlm } from './aiInsights';
import {
    CheckResult,
    AI_NOT_CHECKED,
    aiAnswerResult,
    aiQuestions,
    areaFromGbpAddress,
    cityFromGbpAddress,
    formatAiVisibility,
    nameMatches,
    napGapLines,
    napMissing,
    parseGbpUrlText,
    priorityFromChecks,
    serviceFromBusiness,
    templateGbpObservation
} from './leadGbpScore';
import { MIN_READABLE_CHARS, UA, fetchPage, type Page } from './serviceDetect';

const POSTING_WINDOW_DAYS = 30;
const CONCURRENCY = 5;
/** Leave headroom under the 15 min Lambda limit before handing the rest to a fresh invocation. */
const SOFT_DEADLINE_MS = 12 * 60 * 1000;

/**
 * share.google links only redirect to the business when the client is NOT a browser (a browser UA is sent to a
 * JavaScript-only page), so those links are opened with a plain UA.
 */
const SHARE_LINK_UA = 'curl/8.0';

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
        const isShare = /(^|\/\/)share\.google\//i.test(url);
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'User-Agent': isShare ? SHARE_LINK_UA : UA, 'Accept-Language': 'en-GB,en;q=0.9' },
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

const COMPANY_SUFFIX = /\s+(ltd|limited|llp|plc|inc)\.?$/i;

/** Search keywords for a business we only know by name + address, most specific first. */
function keywordCandidates(name: string, address: string): string[] {
    const n = String(name || '').trim();
    const a = String(address || '').trim();
    const bare = n.replace(COMPANY_SUFFIX, '').trim();
    const postcode = a.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0] || '';
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

const CONTACT_PATHS = ['/contact', '/contact-us', '/contact-us/', '/contact.html', '/about', '/about-us', '/about-us/'];

/**
 * Homepage + likely contact/about pages. null when the site can't be reached or its content can't be read, so that
 * a JavaScript-only site is reported as "not measured" instead of wrongly as "missing".
 */
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
    const [home, ...extra] = await Promise.all([base, ...CONTACT_PATHS.map((p) => origin + p)].map(fetchPage));
    if (home === null) return null;
    const pages = [home, ...extra.filter((x): x is Page => Boolean(x))];
    const visible = pages.reduce((n, p) => n + p.visibleChars, 0);
    return visible >= MIN_READABLE_CHARS ? pages.map((p) => p.text).join(' ') : null;
}

/* ----------------------------------- Checks -------------------------------- */

export type GbpSummary = { title: string; category: string; address: string; website: string };

export async function runChecks(
    lead: LeadRow
): Promise<{ checks: CheckResult[]; gbpName: string; notes: string[]; gbp: GbpSummary }> {
    const notes: string[] = [];
    const expanded = await expandUrl(lead.gbp_url);
    const parsed = parseGbpUrlText(expanded);

    const byId = parsed.placeId ? `place_id:${parsed.placeId}` : parsed.cid ? `cid:${parsed.cid}` : '';
    // Links we can't resolve to an id (e.g. share.google, which needs JavaScript) fall back to a name + address search.
    // The name in the resolved link is Google's own listing name, so it is searched first, then the Excel name.
    const candidates = byId
        ? [byId]
        : Array.from(
              new Set([parsed.name, lead.name].flatMap((n) => (n ? keywordCandidates(n, lead.address) : [])))
          );
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
        const deadShare = /share\.google\/error/i.test(expanded);
        throw new Error(
            deadShare
                ? 'This share.google link is invalid or expired - copy the GBP link again from Google Maps / Search.'
                : byId
                  ? 'GBP not found for this URL'
                  : 'GBP not found for this link or the business name + address in the Excel - check the GBP URL and Town/postcode.'
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
            evidence: `${reviews.repliedCount}/${reviews.reviewCount} sampled reviews have an owner reply`,
            gaps: [
                `Owner isn't replying to customer reviews (${reviews.repliedCount} of ${reviews.reviewCount} recent reviews have a reply)`
            ]
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
        const lastPost = updates.recentPostAt
            ? new Date(updates.recentPostAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
        checks.push({
            key: 'posting',
            pass: Boolean(updates.hasRecentPosts),
            evidence: updates.evidence,
            gaps: [
                updates.totalPosts > 0
                    ? `Not posting regularly on the profile: no Google posts in the last ${POSTING_WINDOW_DAYS} days${lastPost ? ` (last post ${lastPost})` : ''}`
                    : 'No Google posts on the profile (not posting at all)'
            ]
        });
    } else {
        checks.push({ key: 'posting', pass: null, evidence: updates?.evidence || 'Posts not measured' });
    }

    // 4. NAP vs website
    if (siteText) {
        const gbpNap = { name: info.title, address: info.address, phone: info.phone };
        const missing = napMissing(gbpNap, siteText);
        checks.push({
            key: 'nap',
            pass: missing.length === 0,
            evidence: missing.length ? `Not found on website: ${missing.join(', ')}` : 'Name, address and phone found on website',
            gaps: napGapLines(missing, gbpNap)
        });
    } else {
        checks.push({
            key: 'nap',
            pass: null,
            evidence: websiteUrl
                ? 'Website could not be read (blocked, down, or built with JavaScript) - NAP not judged'
                : 'No website to compare against'
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
    return {
        checks,
        gbpName: info.title,
        notes,
        gbp: { title: info.title, category: info.category, address: info.address, website: info.website }
    };
}

/* --------------------------------- AI visibility --------------------------- */

const AI_PLATFORM = (process.env.LEAD_AI_PLATFORM as 'chatgpt' | 'claude' | 'perplexity') || 'chatgpt';

/**
 * Ask the AI assistant 4 local-search questions (the Excel business type + city / neighbourhood from the GBP) and report
 * whether the business is named. Only the "Not Listed" questions (max 2) are written to the column.
 */
export async function runAiVisibility(lead: LeadRow, gbp: GbpSummary): Promise<string> {
    const service = serviceFromBusiness(lead.industry, gbp.category);
    if (!service) return 'AI visibility not checked: add the Business type (e.g. Windows & Doors) to the Excel row.';
    const city = cityFromGbpAddress(gbp.address) || cityFromGbpAddress(lead.address);
    const area = areaFromGbpAddress(gbp.address) || areaFromGbpAddress(lead.address);
    const questions = aiQuestions(service, city, area);
    const name = gbp.title || lead.name;
    const website = lead.website || gbp.website;
    const results = await Promise.all(
        questions.map(async (q) => {
            try {
                const ans = await askLlm(AI_PLATFORM, q, {
                    name,
                    address: gbp.address || lead.address,
                    category: gbp.category,
                    website
                });
                // Check both the Google listing name and the Excel name; any of them named counts as listed.
                const domains = ans.sources.map((x) => x.domain);
                const verdicts = [...new Set([name, lead.name].filter(Boolean))].map((n) =>
                    aiAnswerResult(ans.text, n, website, domains)
                );
                return verdicts.find((v) => v !== 'Not Listed') || 'Not Listed';
            } catch (err) {
                console.warn('[lead-enrich] AI question failed:', (err as Error)?.message);
                return AI_NOT_CHECKED;
            }
        })
    );
    return formatAiVisibility(questions, results);
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

        const { checks, gbpName, notes, gbp } = await runChecks(lead);
        const [gbpObservation, aiVisibility] = await Promise.all([
            Promise.resolve(templateGbpObservation(checks)),
            isEmpty(lead.ai_visibility_observation) ? runAiVisibility(lead, gbp) : Promise.resolve('')
        ]);
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
                gbpObservation,
                aiVisibility,
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

/**
 * Kick off enrichment without blocking the HTTP request (own Lambda in AWS, in-process locally).
 * Returns false when the Lambda could not be invoked.
 */
export async function triggerLeadEnrichment(batchId: string | null): Promise<boolean> {
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
            return true;
        } catch (err) {
            console.error('[lead-enrich] async invoke failed:', (err as Error)?.message);
            return false;
        }
    }
    setImmediate(() => {
        runEnrichment(batchId).catch((e) => console.error('[lead-enrich] run failed:', e?.message || e));
    });
    return true;
}

/** Leads waiting for analysis: pending, or running with no progress for 20+ min (worker died). */
export async function countStuckEnrichment(batchId: string | null): Promise<number> {
    const { rows } = await query(
        `SELECT COUNT(*)::int AS n FROM sales_leads
         WHERE (enrich_status = 'pending'
                OR (enrich_status = 'running' AND updated_at < NOW() - INTERVAL '20 minutes'))
           AND ($1::uuid IS NULL OR import_batch_id = $1::uuid)`,
        [batchId]
    );
    return rows[0]?.n || 0;
}

/**
 * Re-run AI visibility for leads whose generated text still says "(Listed)" without a rank (older format; new text
 * never contains it - see salesAiResult). Only auto-generated text is replaced, and a lead keeps its old text if the re-check fails.
 */
export async function rerunUnrankedAiVisibility(): Promise<{ checked: number; updated: number }> {
    const { rows } = await query(
        `SELECT id, name, website, address, industry, gbp_url, gbp_observation, ai_visibility_observation, lead_opportunity
         FROM sales_leads
         WHERE ai_visibility_observation LIKE '%(Listed)%'
         ORDER BY created_at`
    );
    let updated = 0;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
            (rows.slice(i, i + CONCURRENCY) as LeadRow[]).map(async (lead) => {
                try {
                    const gbp: GbpSummary = { title: lead.name, category: '', address: lead.address, website: lead.website };
                    const text = await runAiVisibility(lead, gbp);
                    if (!text.includes('(') || text.startsWith('AI visibility')) return;
                    await query(`UPDATE sales_leads SET ai_visibility_observation = $2, updated_at = NOW() WHERE id = $1`, [lead.id, text]);
                    updated += 1;
                } catch (err: any) {
                    console.warn('[lead-enrich] rerun failed', lead.id, err?.message || err);
                }
            })
        );
    }
    return { checked: rows.length, updated };
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
