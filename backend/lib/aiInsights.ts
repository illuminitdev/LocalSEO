import { logDfsCost } from './dfsCost';
import { countryName, locationCodeFor, type GeoHint } from './geo';


export type VisibilityBusiness = {
    name?: string;
    address?: string;
    category?: string;
    website?: string;
    completenessScore?: number;
};

export type RawAnswer = {
    prompt: string;
    ok: boolean;
    text: string; 
    present: boolean; 
    sources: Array<{ title: string; url: string; domain: string }>;
    /** When the LLM was actually asked (kept when an answer is reused from the shared store). */
    askedAt?: string;
};

export type RowAnalysis = {
    mentioned: boolean;
    position: number; 
    sentiment: 'positive' | 'neutral' | 'negative';
    context: string;
    competitors: string[];
};

const MAX_TEXT = 2500;

export function dataForSeoReady() {
    return Boolean(String(process.env.DATAFORSEO_LOGIN || '').trim() && String(process.env.DATAFORSEO_PASSWORD || '').trim());
}

function authHeader() {
    const login = String(process.env.DATAFORSEO_LOGIN || '').trim();
    const password = String(process.env.DATAFORSEO_PASSWORD || '').trim();
    return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

async function dfs(path: string, task: Record<string, unknown>, timeoutMs: number) {
    const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
        method: 'POST',
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const data: any = await res.json().catch(() => ({}));
    logDfsCost(path, data);
    if (!res.ok) throw new Error(String(data?.status_message || `DataForSEO HTTP ${res.status}`));
    const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!t || t.status_code !== 20000) throw new Error(String(t?.status_message || 'DataForSEO task failed'));
    return (Array.isArray(t.result) ? t.result : []) as any[];
}

export function cityFromAddress(address: string) {
    const parts = String(address || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    if (!parts.length) return '';
    const last = parts[parts.length - 1];
    const strip = (v: string) => v.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '').trim();
    if (parts.length >= 2 && /united kingdom|\buk\b|england|scotland|wales/i.test(last)) return strip(parts[parts.length - 2]);
    if (parts.length >= 2 && /^[A-Z]{1,2}\d/i.test(last)) return parts[parts.length - 2];
    return strip(last);
}

export function buildPrompts(business: VisibilityBusiness): string[] {
    const category = String(business.category || 'local business').trim().toLowerCase();
    const city = cityFromAddress(String(business.address || ''));
    const where = city ? ` in ${city}` : ' near me';
    return [
        `Who is the best ${category}${where}?`,
        `Can you recommend a good ${category}${where}?`,
        `Top rated ${category}${where} with good reviews`,
        `Which ${category}${where} should I choose and why?`,
        `Best local ${category}${where} for first-time customers`
    ].map((p) => p.slice(0, 480));
}

function hostOf(url: string) {
    try {
        return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

export type Platform = 'chatgpt' | 'claude' | 'perplexity';
export const LLM_PLATFORMS: Platform[] = ['chatgpt', 'claude', 'perplexity'];
const PLATFORM_LABEL: Record<Platform, string> = { chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity' };
const PLATFORM_ID: Record<Platform, string> = { chatgpt: 'c', claude: 'a', perplexity: 'p' };

function llmTask(platform: Platform, prompt: string, business: VisibilityBusiness, withSearch = true) {
    const city = cityFromAddress(String(business.address || ''));
    if (platform === 'chatgpt') {
        return {
            path: 'ai_optimization/chat_gpt/llm_responses/live',
            task: {
                model_name: process.env.DATAFORSEO_CHATGPT_MODEL || 'gpt-4.1-mini',
                user_prompt: prompt,
                web_search: true,
                web_search_country_iso_code: 'GB',
                ...(city ? { web_search_city: city } : {}),
                max_output_tokens: 900
            }
        };
    }
    if (platform === 'claude') {
        return {
            path: 'ai_optimization/claude/llm_responses/live',
            task: {
                model_name: process.env.DATAFORSEO_CLAUDE_MODEL || 'claude-haiku-4-5',
                user_prompt: prompt,
                ...(withSearch
                    ? { web_search: true, web_search_country_iso_code: 'GB', ...(city ? { web_search_city: city } : {}) }
                    : {}),
                max_output_tokens: 900
            }
        };
    }
    return {
        path: 'ai_optimization/perplexity/llm_responses/live',
        task: {
            model_name: process.env.DATAFORSEO_PERPLEXITY_MODEL || 'sonar',
            user_prompt: prompt,
            web_search_country_iso_code: 'GB',
            max_output_tokens: 900
        }
    };
}

export async function askLlm(platform: Platform, prompt: string, business: VisibilityBusiness): Promise<RawAnswer> {
    let result: any;
    try {
        const { path, task } = llmTask(platform, prompt, business);
        result = (await dfs(path, task, 24000))[0] || {};
    } catch (err) {
        if (platform !== 'claude') throw err;
        // Some Claude models do not support web search: retry without it.
        const { path, task } = llmTask(platform, prompt, business, false);
        result = (await dfs(path, task, 24000))[0] || {};
    }
    let text = '';
    const sources = new Map<string, { title: string; url: string; domain: string }>();
    for (const item of Array.isArray(result.items) ? result.items : []) {
        if (item?.type !== 'message') continue;
        for (const section of Array.isArray(item.sections) ? item.sections : []) {
            if (section?.text) text += section.text;
            for (const a of Array.isArray(section?.annotations) ? section.annotations : []) {
                const url = String(a?.url || '').replace(/[?&]utm_source=(openai|claude|perplexity)/, '');
                if (url) sources.set(url, { title: String(a?.title || ''), url, domain: hostOf(url) });
            }
        }
        text += '\n';
    }
    return {
        prompt,
        ok: true,
        text: text.trim().slice(0, MAX_TEXT),
        present: Boolean(text.trim()),
        sources: [...sources.values()].slice(0, 10)
    };
}

export async function askGoogleOverview(prompt: string, geo?: GeoHint): Promise<RawAnswer> {
    const result: any = (await dfs(
        'serp/google/organic/live/advanced',
        { keyword: prompt, location_code: geo ? locationCodeFor(geo) : 2826, language_code: 'en', depth: 10, load_async_ai_overview: true },
        24000
    ))[0] || {};
    const overview = (Array.isArray(result.items) ? result.items : []).find((i: any) => i?.type === 'ai_overview');
    if (!overview) {
        console.warn('[llm-visibility] no ai_overview for "' + prompt + '"; item types:', [...new Set((result.items || []).map((i: any) => i?.type))].join(', '));
        return { prompt, ok: true, text: '', present: false, sources: [] };
    }

    let text = String(overview.markdown || overview.text || '');
    const refs: any[] = Array.isArray(overview.references) ? [...overview.references] : [];
    for (const el of Array.isArray(overview.items) ? overview.items : []) {
        if (!text && (el?.markdown || el?.text)) text += `${el.markdown || el.text}\n`;
        if (Array.isArray(el?.references)) refs.push(...el.references);
    }
    const sources = new Map<string, { title: string; url: string; domain: string }>();
    for (const r of refs) {
        const url = String(r?.url || '');
        if (url) sources.set(url, { title: String(r?.title || ''), url, domain: String(r?.domain || hostOf(url)).replace(/^www\./, '') });
    }
    return { prompt, ok: true, text: text.trim().slice(0, MAX_TEXT), present: true, sources: [...sources.values()].slice(0, 10) };
}

export const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function nameMentioned(answer: RawAnswer, business: VisibilityBusiness) {
    const name = norm(business.name || '');
    const host = hostOf(String(business.website || ''));
    const text = norm(answer.text);
    if (name.length >= 4 && text.includes(name)) return true;
    return Boolean(host && answer.sources.some((s) => s.domain === host || s.domain.endsWith(`.${host}`)));
}

function sanitizeAnswers(list: any): RawAnswer[] {
    return (Array.isArray(list) ? list : []).slice(0, 8).map((a: any) => ({
        prompt: String(a?.prompt || '').slice(0, 500),
        ok: a?.ok !== false,
        askedAt: a?.askedAt ? String(a.askedAt).slice(0, 40) : undefined,
        text: String(a?.text || '').slice(0, MAX_TEXT),
        present: Boolean(a?.present),
        sources: (Array.isArray(a?.sources) ? a.sources : []).slice(0, 10).map((s: any) => ({
            title: String(s?.title || '').slice(0, 200),
            url: String(s?.url || '').slice(0, 500),
            domain: String(s?.domain || '').slice(0, 120)
        }))
    }));
}

function pct(n: number, d: number) {
    return d > 0 ? Math.round((n / d) * 100) : 0;
}

function gradeFor(score: number) {
    const table: Array<[number, string]> = [
        [90, 'A+'], [85, 'A'], [80, 'A-'], [75, 'B+'], [70, 'B'], [65, 'B-'], [60, 'C+'], [50, 'C'], [40, 'C-'], [30, 'D']
    ];
    return table.find(([min]) => score >= min)?.[1] || 'E';
}

type AnswerSet = Record<Platform | 'google', RawAnswer[]>;

// One small analysis call per platform (parallel) so a single slow/failed call cannot lose everything.
export function analysisJobs(business: VisibilityBusiness, input: Partial<Record<Platform | 'google', any>>) {
    const groups: Array<{ label: string; rows: Array<{ id: string; platform: string; question: string; answer: string }> }> = [];
    for (const p of LLM_PLATFORMS) {
        const rows = sanitizeAnswers(input[p]).map((a, i) => ({ id: `${PLATFORM_ID[p]}${i}`, platform: PLATFORM_LABEL[p], question: a.prompt, answer: a.text.slice(0, 1100) }));
        groups.push({ label: PLATFORM_LABEL[p], rows: rows.filter((r) => r.answer) });
    }
    const g = sanitizeAnswers(input.google).map((a, i) => ({ id: `g${i}`, platform: 'Google AI Overview', question: a.prompt, answer: a.text.slice(0, 900) }));
    groups.push({ label: 'Google AI Overview', rows: g.filter((r) => r.answer) });

    let oppsAsked = false;
    return groups
        .filter((g2) => g2.rows.length)
        .map((g2) => {
            const withOpps = !oppsAsked;
            oppsAsked = true;
            return {
                rows: g2.rows,
                prompt: `You analyse AI assistant answers for local-business visibility.
Business: "${business.name}" (${business.category || 'local business'}) at ${business.address || 'n/a'}. Website: ${business.website || 'n/a'}.
For each answer decide ONLY from its text (do not invent):
- mentioned: true if this exact business is named or clearly referred to
- position: when mentioned, the order in which this business is named among ALL businesses (clinics, shops, companies) the answer names, 1 = named first (also for answers written as paragraphs, not lists); 0 if not mentioned
- sentiment: how the answer talks about this business: positive | neutral | negative (neutral if not mentioned)
- context: ONE plain-text sentence (max 140 chars, no markdown, no links) saying why it is mentioned; "" if not mentioned
- competitors: names of OTHER real businesses named in the answer (max 6). Never include advice headings or generic phrases.
${withOpps ? 'Also give "opportunities": 3 short, specific actions (max 110 chars each) to get this business mentioned more by AI assistants, based on what the answers reward (e.g. reviews, FAQs, structured data, local citations).\n' : ''}Return JSON only: {"rows":[{"id":"","mentioned":false,"position":0,"sentiment":"neutral","context":"","competitors":[]}]${withOpps ? ',"opportunities":["","",""]' : ''}}
Answers:
${JSON.stringify(g2.rows)}`
            };
        });
}

export function cleanMarkdown(v: string) {
    return String(v || '')
        .replace(/\[([^\]]+)\]\((?:https?:)?[^)\s]*\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_`#>]/g, '')
        .replace(/^\s*(?:\d+[.)]|[-•])\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const BUSINESS_WORDS =
    'Clinic|Clinics|Dental|Dentist|Dentists|Aesthetics|Aesthetic|Practice|Centre|Center|Studio|Surgery|Salon|Ltd|Limited|Care|Laboratory|Group|Hospital|Pharmacy|Spa|Beauty|Medical|Health|Skin|Cosmetic|Orthodontics|Implants|Plumbing|Plumbers|Electrical|Electricians|Roofing|Builders|Garage|Cafe|Restaurant|Gym|Fitness';
const BUSINESS_RE = new RegExp(
    `\\b((?:Dr\\.?\\s+|Mr\\.?\\s+|Ms\\.?\\s+|Mrs\\.?\\s+)?[A-Z][\\w'&.-]*(?:\\s+(?:&|and|of|the|[A-Z][\\w'&.-]*)){0,5}\\s+(?:${BUSINESS_WORDS}))\\b`,
    'g'
);

// Text-only fallback used when the Gemini analysis is missing or incomplete.
// It finds business-like names (links, bold text, list entries, names ending in words like
// "Clinic"/"Dental"/"Aesthetics") in the order they appear. Position = how early this business is named.
export function textAnalysis(answer: RawAnswer, business: VisibilityBusiness) {
    const text = answer.text;
    const ourName = String(business.name || '').trim();
    const ourKey = norm(ourName);
    const host = hostOf(String(business.website || ''));

    const found: Array<{ name: string; idx: number }> = [];
    const qualifies = (raw: string) => {
        const name = cleanMarkdown(raw);
        if (name.length < 4 || name.length > 80 || name.split(' ').length > 8) return '';
        if (/^(source|sources|here|read more|website|reviews?|summary|conclusion|note|tips?)$/i.test(name)) return '';
        BUSINESS_RE.lastIndex = 0;
        if (BUSINESS_RE.test(name) || /^(Dr|Mr|Ms|Mrs)\.?\s+[A-Z]/.test(name)) return name;
        return '';
    };
    const collect = (re: RegExp, group: number) => {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
            const name = qualifies(m[group]);
            if (name) found.push({ name, idx: m.index });
            if (m[0].length === 0) re.lastIndex += 1;
        }
    };
    collect(/\[([^\]]{3,80})\]\([^)]*\)/g, 1); // [Name](url)
    collect(/\*\*([^*]{3,80})\*\*/g, 1); // **Name**
    collect(/^\s*(?:\d+[.)]|[-*•]|#{1,4})\s+([^\n:–—]{3,90})/gm, 1); // list / heading entries
    BUSINESS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BUSINESS_RE.exec(text))) found.push({ name: cleanMarkdown(m[1]), idx: m.index });

    // Where is our own business named?
    let ourIdx = ourName ? text.toLowerCase().indexOf(ourName.toLowerCase()) : -1;
    if (ourIdx < 0 && host) ourIdx = text.toLowerCase().indexOf(host);
    if (ourIdx < 0) {
        const hit = found.find((c) => ourKey && norm(c.name).includes(ourKey));
        if (hit) ourIdx = hit.idx;
    }

    // Merge duplicates (same or contained names), keep the earliest position, then order by position.
    const merged: Array<{ name: string; key: string; idx: number; ours: boolean }> = [];
    const addCandidate = (name: string, idx: number, ours: boolean) => {
        const key = norm(name);
        if (!key) return;
        const hit = merged.find((x) => x.key === key || x.key.includes(key) || key.includes(x.key));
        if (hit) {
            hit.idx = Math.min(hit.idx, idx);
            hit.ours = hit.ours || ours;
            if (key.length > hit.key.length && !hit.ours) {
                hit.name = name;
                hit.key = key;
            }
        } else merged.push({ name, key, idx, ours });
    };
    for (const c of found) addCandidate(c.name, c.idx, Boolean(ourKey) && (norm(c.name).includes(ourKey) || ourKey.includes(norm(c.name))));
    if (ourIdx >= 0) addCandidate(ourName, ourIdx, true);

    merged.sort((x, y) => x.idx - y.idx);
    const ourPos = merged.findIndex((x) => x.ours);
    const sentences = text
        .split(/(?<=[.!?])\s+|\n+/)
        .map(cleanMarkdown)
        .filter((x) => x.length > 15);
    const ctx = ourKey ? sentences.find((x) => norm(x).includes(ourKey)) : '';
    return {
        position: ourPos >= 0 && ourIdx >= 0 ? ourPos + 1 : 0,
        context: (ctx || '').slice(0, 150),
        competitors: merged.filter((x) => !x.ours).map((x) => x.name).slice(0, 6)
    };
}

function fallbackOpportunities(business: VisibilityBusiness, ownCitations: number, mentionRate: number) {
    const out: string[] = [];
    if (!ownCitations) out.push('Publish FAQ-style pages answering local customer questions so AI can cite your website.');
    out.push('Add LocalBusiness structured data (schema) to your website with name, address and services.');
    out.push('Keep your name, address and phone identical on Google, Bing and directories (citations).');
    if (mentionRate < 60) out.push('Collect more recent Google reviews. AI answers favour well-reviewed local businesses.');
    return out.slice(0, 3);
}

/**
 * The one rule for "is this business named in this answer": the Gemini row (when there is one) OR a name/website match,
 * with the position from Gemini else from the text. Used by LLM Visibility and LLM Tracking so they always agree.
 */
export function verdictFor(answer: RawAnswer, business: VisibilityBusiness, geminiRow?: any): RowAnalysis {
    const a = geminiRow || {};
    const fb = textAnalysis(answer, business);
    const sentiment = ['positive', 'neutral', 'negative'].includes(a.sentiment) ? a.sentiment : 'neutral';
    const mentioned = Boolean(a.mentioned) || nameMentioned(answer, business);
    const aiCompetitors = (Array.isArray(a.competitors) ? a.competitors : []).map((c: any) => String(c).slice(0, 80)).filter(Boolean);
    return {
        mentioned,
        position: mentioned ? Math.max(0, Number(a.position) || fb.position) : 0,
        sentiment,
        context: mentioned ? cleanMarkdown(String(a.context || fb.context || '')).slice(0, 160) : '',
        competitors: (aiCompetitors.length ? aiCompetitors : fb.competitors).slice(0, 6)
    };
}

/** Verdict for every answer in a platform -> answers input, using the same ids `analysisJobs` gave the Gemini rows. */
export function answerVerdicts(business: VisibilityBusiness, input: Partial<Record<Platform | 'google', any>>, analysis: any) {
    const byId = new Map<string, any>();
    for (const r of Array.isArray(analysis?.rows) ? analysis.rows : []) byId.set(String(r?.id), r);
    const out: Partial<Record<Platform, Array<{ answer: RawAnswer; verdict: RowAnalysis }>>> = {};
    for (const p of LLM_PLATFORMS) {
        out[p] = sanitizeAnswers(input[p]).map((answer, i) => ({ answer, verdict: verdictFor(answer, business, byId.get(`${PLATFORM_ID[p]}${i}`)) }));
    }
    return out;
}

export function buildReport(business: VisibilityBusiness, input: Partial<Record<Platform | 'google', any>>, analysis: any, previous: any) {
    const answers = {} as AnswerSet;
    for (const p of [...LLM_PLATFORMS, 'google'] as Array<Platform | 'google'>) answers[p] = sanitizeAnswers(input[p]);

    const byId = new Map<string, any>();
    for (const r of Array.isArray(analysis?.rows) ? analysis.rows : []) byId.set(String(r?.id), r);

    const rowFor = (id: string, answer: RawAnswer): RowAnalysis => verdictFor(answer, business, byId.get(id));
    const rowsOf = (p: Platform | 'google') => {
        const prefix = p === 'google' ? 'g' : PLATFORM_ID[p];
        return answers[p].map((a, i) => ({ a, r: rowFor(`${prefix}${i}`, a) }));
    };

    const host = hostOf(String(business.website || ''));
    const citesUs = (a: RawAnswer) => Boolean(host && a.sources.some((s) => s.domain === host || s.domain.endsWith(`.${host}`)));

    // Per-LLM stats
    const platforms: Record<string, any> = {};
    const mentionedRows: Array<{ r: RowAnalysis }> = [];
    const allRows: Array<{ r: RowAnalysis }> = [];
    const rates: number[] = [];
    for (const p of LLM_PLATFORMS) {
        const rows = rowsOf(p);
        const answered = rows.filter((x) => x.a.present);
        if (!answered.length) continue;
        const mentions = answered.filter((x) => x.r.mentioned);
        const positions = mentions.map((x) => x.r.position).filter((n) => n > 0);
        const mentionRate = pct(mentions.length, answered.length);
        rates.push(mentionRate);
        mentionedRows.push(...mentions);
        allRows.push(...rows);
        const comp = Object.entries(
            rows.flatMap((x) => x.r.competitors).reduce<Record<string, number>>((m, c) => {
                m[c] = (m[c] || 0) + 1;
                return m;
            }, {})
        )
            .sort((x, y) => y[1] - x[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));
        platforms[p] = {
            badge: mentionRate >= 60 ? 'High Visibility' : mentionRate >= 30 ? 'Moderate' : 'Low Visibility',
            mentionRate,
            avgPosition: positions.length ? Number((positions.reduce((s, n) => s + n, 0) / positions.length).toFixed(1)) : null,
            answered: answered.length,
            contexts: mentions
                .map((x) => x.r.context)
                .filter(Boolean)
                .filter((c, i, arr) => arr.indexOf(c) === i)
                .slice(0, 3),
            topCompetitors: comp
        };
    }

    // Google AI Overviews
    const googleRows = rowsOf('google');
    const googleIncluded = googleRows.filter((x) => x.a.present && (x.r.mentioned || citesUs(x.a)));
    const overviewPresent = googleRows.filter((x) => x.a.present).length;
    const inclusion = pct(googleIncluded.length, googleRows.length);
    const sourceDomains = new Set(googleRows.flatMap((x) => x.a.sources.map((s) => s.domain)).filter(Boolean));
    const ownCitations = googleRows.filter((x) => citesUs(x.a)).length;
    mentionedRows.push(...googleIncluded);
    allRows.push(...googleRows);

    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    for (const x of mentionedRows) sentimentCounts[x.r.sentiment] += 1;
    const sentimentScore = mentionedRows.length
        ? Math.round(((sentimentCounts.positive + sentimentCounts.neutral * 0.5) / mentionedRows.length) * 100)
        : null;
    const sentimentLabel =
        sentimentScore == null ? 'No mentions yet' : sentimentScore >= 70 ? 'Positive' : sentimentScore >= 45 ? 'Neutral' : 'Negative';

    const competitorMentions = allRows.reduce((s, x) => s + new Set(x.r.competitors.map(norm)).size, 0);
    const ours = mentionedRows.length;
    const shareOfVoice = pct(ours, ours + competitorMentions);

    const avgMentionRate = rates.length ? Math.round(rates.reduce((s, n) => s + n, 0) / rates.length) : 0;
    const completeness = Math.max(0, Math.min(100, Number(business.completenessScore) || 0));
    const score = Math.round(
        avgMentionRate * 0.35 + inclusion * 0.25 + (sentimentScore ?? 0) * 0.2 + shareOfVoice * 0.1 + completeness * 0.1
    );
    const grade = gradeFor(score);
    const gradeNote =
        ours === 0
            ? 'Your business was not named in AI answers yet. Build reviews, citations and structured data.'
            : score >= 75
            ? 'Strong entity signals: AI assistants name and cite your business.'
            : score >= 50
            ? 'Your business is recognised, but not consistently. Strengthen citations and FAQs.'
            : 'Weak AI presence. Focus on reviews, local citations and clear on-site content.';

    const aiOpps = (Array.isArray(analysis?.opportunities) ? analysis.opportunities : [])
        .map((o: any) => String(o).slice(0, 140))
        .filter(Boolean)
        .slice(0, 3);
    const opportunities = aiOpps.length ? aiOpps : fallbackOpportunities(business, ownCitations, avgMentionRate);

    const prev = previous || null;
    const googleBadge =
        prev && typeof prev.google?.inclusion === 'number' && inclusion > prev.google.inclusion
            ? 'Improving'
            : inclusion >= 50
            ? 'Well included'
            : inclusion > 0
            ? 'Partly included'
            : 'Not included';

    const first = LLM_PLATFORMS.find((p) => answers[p].length) || 'chatgpt';
    const questions = answers[first].map((a, i) => {
        const results: Record<string, { mentioned: boolean; position: number }> = {};
        for (const p of LLM_PLATFORMS) {
            const row = rowsOf(p)[i];
            if (row?.a.present) results[p] = { mentioned: row.r.mentioned, position: row.r.position };
        }
        return {
            question: a.prompt,
            mentioned: Object.values(results).some((r) => r.mentioned),
            position: 0,
            results
        };
    });

    return {
        createdAt: new Date().toISOString(),
        businessName: business.name || '',
        questionsAsked: answers[first].length,
        shareOfVoice: { value: shareOfVoice, delta: prev ? shareOfVoice - (prev.shareOfVoice?.value ?? 0) : null },
        sentiment: { score: sentimentScore, label: sentimentLabel, counts: sentimentCounts },
        llm: { grade, score, note: gradeNote },
        analysisUsed: byId.size > 0,
        platforms,
        chatgpt: platforms.chatgpt || null,
        google: {
            badge: googleBadge,
            inclusion,
            overviewShown: pct(overviewPresent, googleRows.length),
            sourcesCited: sourceDomains.size,
            ownCitations,
            opportunities
        },
        questions
    };
}

export type KeywordBusiness = VisibilityBusiness & {
    lat?: number | null;
    lng?: number | null;
    placeId?: string;
};

export function suggestKeywords(business: KeywordBusiness): string[] {
    const category = String(business.category || '').trim().toLowerCase();
    if (!category) return [];
    const city = cityFromAddress(String(business.address || '')).toLowerCase();
    const list = [`${category} near me`];
    if (city) list.push(`${category} ${city}`, `best ${category} ${city}`, `${category} in ${city}`, `${category} services ${city}`);
    else list.push(`best ${category}`, `local ${category}`);
    return list;
}

// ── Overview (actions, strategy, competitors) ───────────────────────────────

export type InsightAction = {
    id: string;
    title: string;
    desc: string;
    cta: string;
    to: string;
    icon: 'review' | 'clock' | 'photo' | 'post' | 'profile' | 'rank' | 'gap';
    weight: number;
};

// UK-only movable bank holidays (extend yearly). Fixed-date holidays are generated for every country.
const UK_MOVABLE_HOLIDAYS: Array<[string, string]> = [
    ['2026-12-28', 'Boxing Day (substitute)'],
    ['2027-03-26', 'Good Friday'],
    ['2027-03-29', 'Easter Monday'],
    ['2027-05-03', 'Early May bank holiday'],
    ['2027-05-31', 'Spring bank holiday'],
    ['2027-08-30', 'Summer bank holiday'],
    ['2027-12-27', 'Christmas Day (substitute)'],
    ['2027-12-28', 'Boxing Day (substitute)']
];

function holidaysFor(business: any, now: Date): Array<[string, string]> {
    const y = now.getUTCFullYear();
    const fixed: Array<[string, string]> = [];
    for (const year of [y, y + 1]) {
        fixed.push([`${year}-01-01`, "New Year's Day"], [`${year}-12-25`, 'Christmas Day']);
        if (locationCodeFor(business) === 2826) fixed.push([`${year}-12-26`, 'Boxing Day']);
    }
    return locationCodeFor(business) === 2826 ? [...fixed, ...UK_MOVABLE_HOLIDAYS] : fixed;
}

type TrackerKw = { keyword: string; volume?: number | null; history?: Array<{ date: string; rank: number }> };

export type TrackerSummary = {
    total: number;
    checked: number;
    rows: Array<{ keyword: string; rank: number; previous: number | null; volume: number | null }>;
    drops: Array<{ keyword: string; from: number; to: number }>;
    gains: Array<{ keyword: string; from: number; to: number }>;
    weak: Array<{ keyword: string; rank: number; volume: number | null }>;
    moves: { up: number; down: number; total: number };
};

/** Condenses the Visibility Tracker keywords into movers and weak spots for actions, changes and the AI tip. */
export function summarizeTracker(keywords: TrackerKw[] | null | undefined): TrackerSummary {
    const list = Array.isArray(keywords) ? keywords : [];
    const rows: TrackerSummary['rows'] = [];
    for (const k of list) {
        const h = Array.isArray(k?.history) ? k.history : [];
        if (!h.length) continue;
        rows.push({
            keyword: String(k.keyword),
            rank: h[h.length - 1].rank,
            previous: h.length > 1 ? h[h.length - 2].rank : null,
            volume: k.volume == null ? null : Number(k.volume)
        });
    }
    const moved = rows.filter((r) => r.previous != null && r.previous !== r.rank);
    const drops = moved.filter((r) => r.rank > (r.previous as number)).sort((a, b) => b.rank - (b.previous as number) - (a.rank - (a.previous as number)));
    const gains = moved.filter((r) => r.rank < (r.previous as number)).sort((a, b) => (b.previous as number) - b.rank - ((a.previous as number) - a.rank));
    const weak = rows.filter((r) => r.rank > 3).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    return {
        total: list.length,
        checked: rows.length,
        rows,
        drops: drops.map((r) => ({ keyword: r.keyword, from: r.previous as number, to: r.rank })),
        gains: gains.map((r) => ({ keyword: r.keyword, from: r.previous as number, to: r.rank })),
        weak: weak.map((r) => ({ keyword: r.keyword, rank: r.rank, volume: r.volume })),
        moves: { up: gains.length, down: drops.length, total: rows.length }
    };
}

const rankText = (n: number) => (n > 20 ? '20+' : String(n));

export type InsightChange = { label: string; from: number; to: number; delta: number; unit: string; goodWhenUp: boolean };

/** Latest saved Map Pack check vs the one before it. */
export function computeChanges(history: any[]): { changes: InsightChange[]; since: string | null } {
    const checks = (Array.isArray(history) ? history : []).filter((h) => h?.share);
    const [cur, prev] = [checks[0], checks[1]];
    if (!cur || !prev) return { changes: [], since: null };
    const topReviews = (h: any) =>
        Math.max(0, ...(Array.isArray(h?.packs) ? h.packs : []).flatMap((p: any) => (p?.top3 || []).filter((r: any) => !r?.isYou).map((r: any) => Number(r?.reviews) || 0)));
    const item = (label: string, from: number, to: number, unit: string, goodWhenUp: boolean): InsightChange => ({ label, from, to, delta: to - from, unit, goodWhenUp });
    return {
        since: prev.createdAt || null,
        changes: [
            item('Map Pack spots you hold', Number(prev.youSlots) || 0, Number(cur.youSlots) || 0, '', true),
            item('Your Map Pack share', Number(prev.share?.you) || 0, Number(cur.share?.you) || 0, '%', true),
            item('Top competitor reviews', topReviews(prev), topReviews(cur), '', false)
        ]
    };
}

export function buildActions(business: any, stats: any, now = new Date()): InsightAction[] {
    const out: InsightAction[] = [];
    const reviews: any[] = Array.isArray(business?.reviews) ? business.reviews : [];
    const low = reviews.filter((r) => Number(r?.rating) > 0 && Number(r.rating) <= 3).length;
    const replyRate = Number(stats?.reviewResponseRate) || 0;
    if (low > 0) {
        out.push({
            id: 'low-reviews',
            title: `Respond to ${low} low-rated review${low === 1 ? '' : 's'}`,
            desc: 'Timely, polite replies limit the damage to your local ranking. AI drafted responses are ready.',
            cta: 'Review Drafts',
            to: '/reviews',
            icon: 'review',
            weight: 100
        });
    } else if (replyRate < 80) {
        out.push({
            id: 'reply-rate',
            title: 'Reply to your recent reviews',
            desc: `Your review response rate is ${replyRate}%. Replying to every review signals an active business to Google.`,
            cta: 'Reply to Reviews',
            to: '/reviews',
            icon: 'review',
            weight: 70
        });
    }

    const upcoming = holidaysFor(business, now).map(([date, name]) => ({ date, name, days: Math.ceil((new Date(`${date}T12:00:00Z`).getTime() - now.getTime()) / 86400000) }))
        .filter((h) => h.days >= 0 && h.days <= 30)
        .sort((a, b) => a.days - b.days)[0];
    if (!String(business?.hours || '').trim()) {
        out.push({
            id: 'hours',
            title: 'Add your business hours',
            desc: 'No opening hours are saved. Missing hours hurt local rankings and customer trust.',
            cta: 'Add Hours',
            to: '/profile',
            icon: 'clock',
            weight: 95
        });
    } else if (upcoming) {
        out.push({
            id: 'holiday-hours',
            title: 'Update holiday business hours',
            desc: `${upcoming.name} is in ${upcoming.days} day${upcoming.days === 1 ? '' : 's'}. Set special hours so Google shows the right times.`,
            cta: 'Sync Hours',
            to: '/profile',
            icon: 'clock',
            weight: 80
        });
    }

    const photos = Number(stats?.photoCount) || 0;
    if (photos < 20) {
        out.push({
            id: 'photos',
            title: 'Upload recent project photos',
            desc: photos
                ? `You have ${photos} photo${photos === 1 ? '' : 's'}. Profiles with regular photo updates get far more engagement.`
                : 'No photos uploaded yet. Profiles with photos get far more engagement.',
            cta: 'Add Photos',
            to: '/media',
            icon: 'photo',
            weight: photos < 5 ? 90 : 60
        });
    }

    if (!(Number(stats?.weeklyPosts) > 0)) {
        out.push({
            id: 'posts',
            title: 'Publish a Google Business post',
            desc: 'No posts this week. Regular posts keep your profile fresh and active.',
            cta: 'Create Post',
            to: '/posts',
            icon: 'post',
            weight: 65
        });
    }

    const completeness = Number(stats?.completenessScore) || 0;
    if (completeness < 90) {
        out.push({
            id: 'profile',
            title: 'Complete your business profile',
            desc: `Profile is ${completeness}% complete. Fill the missing fields so Google trusts the listing.`,
            cta: 'Open Profile',
            to: '/profile',
            icon: 'profile',
            weight: 75
        });
    }
    // Visibility Tracker: real rank movement for the keywords the business tracks.
    const tracker = summarizeTracker(stats?.visibilityTracker?.keywords);
    const drop = tracker.drops[0];
    if (drop) {
        out.push({
            id: 'rank-drop',
            title: `Rank dropped for "${drop.keyword}" (${rankText(drop.from)} → ${rankText(drop.to)})`,
            desc: 'Check recent reviews, hours and posts for this service, and make sure it is listed in your profile.',
            cta: 'Open Visibility Tracker',
            to: '/visibility-tracker',
            icon: 'rank',
            weight: 98
        });
    }
    const weak = tracker.weak.find((w) => w.keyword !== drop?.keyword);
    if (weak) {
        out.push({
            id: 'rank-weak',
            title: `Not in the top 3 for "${weak.keyword}"${weak.volume ? ` (${weak.volume.toLocaleString()} searches/mo)` : ''}`,
            desc: `You currently rank ${rankText(weak.rank)}. Add this term to your services and publish a post about it.`,
            cta: 'Create Post',
            to: '/posts',
            icon: 'rank',
            weight: 85
        });
    }

    // Review gap to the strongest competitor in the latest Map Pack check.
    const rivals = (Array.isArray(stats?.aiInsights?.packs) ? stats.aiInsights.packs : []).flatMap((p: any) => (p?.top3 || []).filter((r: any) => !r?.isYou));
    const rival = rivals.sort((a: any, b: any) => (Number(b?.reviews) || 0) - (Number(a?.reviews) || 0))[0];
    const myReviews = Number(business?.reviewsCount) || 0;
    const gap = rival ? (Number(rival.reviews) || 0) - myReviews : 0;
    if (gap > 0) {
        out.push({
            id: 'review-gap',
            title: `Close the review gap with ${rival.name}`,
            desc: `${rival.name} has ${gap.toLocaleString()} more Google reviews than you. About ${Math.max(1, Math.ceil(gap / 12))} new reviews a week would close it in roughly 3 months.`,
            cta: 'Get More Reviews',
            to: '/reviews',
            icon: 'gap',
            weight: 88
        });
    }
    return out.sort((a, b) => b.weight - a.weight).slice(0, 8);
}

export type PackRow = { title: string; reviews: number; rating: number };

export async function fetchPack(keyword: string, business: KeywordBusiness): Promise<PackRow[]> {
    const where =
        typeof business.lat === 'number' && typeof business.lng === 'number'
            ? { location_coordinate: `${business.lat},${business.lng},14z` }
            : { location_code: locationCodeFor(business as any) };
    const result: any = (await dfs(
        'serp/google/maps/live/advanced',
        { keyword, language_code: 'en', depth: 10, device: 'desktop', os: 'windows', ...where },
        26000
    ))[0];
    const items = (Array.isArray(result?.items) ? result.items : []).filter((i: any) => i?.title);
    return items.slice(0, 3).map((i: any) => ({
        title: String(i.title),
        reviews: Number(i?.rating?.votes_count) || 0,
        rating: Number(i?.rating?.value) || 0
    }));
}

export async function fetchTrends(keywords: string[], geo?: GeoHint) {
    const out: Array<{ keyword: string; volume: number; trendPct: number | null }> = [];
    try {
        const result: any = await dfs(
            'keywords_data/google_ads/search_volume/live',
            { keywords, location_code: geo ? locationCodeFor(geo) : 2826, language_code: 'en' },
            22000
        );
        const rows = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [result];
        for (const r of rows) {
            if (!r?.keyword) continue;
            const months = (Array.isArray(r.monthly_searches) ? r.monthly_searches : [])
                .map((m: any) => ({ k: Number(m.year) * 100 + Number(m.month), v: Number(m.search_volume) || 0 }))
                .sort((a: any, b: any) => b.k - a.k);
            let trendPct: number | null = null;
            if (months.length >= 4) {
                const latest = months[0].v;
                const prior = months.slice(1, 4).reduce((s: number, m: any) => s + m.v, 0) / 3;
                if (prior > 0) trendPct = Math.round(((latest - prior) / prior) * 100);
            }
            out.push({ keyword: String(r.keyword), volume: Number(r.search_volume) || 0, trendPct });
        }
    } catch (err: any) {
        console.warn('[ai-insights] trends failed:', err?.message || err);
    }
    return out;
}

export function planKeywords(business: KeywordBusiness, trackedKeywords: string[]): string[] {
    return [...trackedKeywords, ...suggestKeywords(business)]
        .filter((k, i, a) => k && a.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i)
        .slice(0, 5);
}

export function summarizeMarket(
    business: KeywordBusiness,
    keywords: string[],
    packs: PackRow[][],
    trendRows: Array<{ keyword: string; volume: number; trendPct: number | null }>,
    errors: string[] = []
) {
    const slotsChecked = packs.reduce((s, p) => s + p.length, 0);
    if (!slotsChecked) {
        throw new Error(
            errors[0]
                ? `Google Maps lookup failed: ${errors[0]}`
                : 'Google Maps returned no results for your keywords near your address. Check your business address and category.'
        );
    }

    const me = norm(business.name || '');
    const isMe = (title: string) => {
        const t = norm(title);
        return Boolean(me && t && (t === me || t.includes(me) || me.includes(t)));
    };
    let you = 0;
    const comps = new Map<string, { name: string; slots: number; reviews: number }>();
    for (const pack of packs) {
        for (const row of pack) {
            if (isMe(row.title)) {
                you += 1;
                continue;
            }
            const cur = comps.get(norm(row.title)) || { name: row.title, slots: 0, reviews: 0 };
            cur.slots += 1;
            cur.reviews = Math.max(cur.reviews, row.reviews);
            comps.set(norm(row.title), cur);
        }
    }
    const ranked = [...comps.values()].sort((a, b) => b.slots - a.slots);
    const [a, b] = [ranked[0], ranked[1]];
    const total = you + (a?.slots || 0) + (b?.slots || 0);
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const share = total
        ? {
              you: pct(you),
              compA: { name: a?.name || '', pct: pct(a?.slots || 0) },
              compB: { name: b?.name || '', pct: pct(b?.slots || 0) }
          }
        : null;

    const packView = keywords.map((keyword, i) => ({
        keyword,
        top3: packs[i].map((r) => ({ name: r.title, reviews: r.reviews, rating: r.rating, isYou: isMe(r.title) }))
    }));

    return {
        keywords,
        trendRows,
        share,
        topCompetitors: ranked.slice(0, 3),
        packSlotsChecked: slotsChecked,
        youSlots: you,
        packs: packView
    };
}

export type Market = ReturnType<typeof summarizeMarket>;

// Plain-English problems a business owner can act on, from the real Map Pack data.
export function marketProblems(business: any, market: Market): string[] {
    const out: string[] = [];
    const total = market.packSlotsChecked;
    const keywordsWithYou = market.packs.filter((p) => p.top3.some((r) => r.isYou)).length;
    if (market.youSlots === 0) {
        out.push(`You are not in the Google Map Pack (top 3) for any of the ${market.packs.length} keywords checked, so nearby customers see competitors first.`);
    } else {
        out.push(`You appear in the Map Pack for ${keywordsWithYou} of ${market.packs.length} keywords (${market.youSlots} of ${total} spots).`);
    }
    const missing = market.packs.filter((p) => !p.top3.some((r) => r.isYou)).map((p) => p.keyword);
    if (market.youSlots > 0 && missing.length) out.push(`Not in the top 3 for: ${missing.slice(0, 3).map((k) => `"${k}"`).join(', ')}.`);
    const top = market.topCompetitors[0];
    const mine = Number(business?.reviewsCount) || 0;
    if (top && top.reviews > mine) out.push(`${top.name} has ${(top.reviews - mine).toLocaleString()} more Google reviews than you (${top.reviews.toLocaleString()} vs ${mine.toLocaleString()}). Reviews are a major ranking factor.`);
    return out.slice(0, 3);
}

export function marketOpportunities(business: any, market: Market) {
    const out: string[] = [];
    const rising = [...market.trendRows].filter((t) => t.trendPct != null && t.trendPct >= 10 && t.volume > 0).sort((x, y) => (y.trendPct || 0) - (x.trendPct || 0))[0];
    const biggest = [...market.trendRows].sort((x, y) => y.volume - x.volume)[0];
    if (rising) out.push(`"${rising.keyword}" searches up ${rising.trendPct}% recently (${countryName(business as any)}, ${rising.volume.toLocaleString()}/mo).`);
    else if (biggest && biggest.volume > 0) out.push(`"${biggest.keyword}" gets about ${biggest.volume.toLocaleString()} searches a month in ${countryName(business as any)}.`);

    const top = market.topCompetitors[0];
    const mine = Number(business?.reviewsCount) || 0;
    if (top && top.reviews > mine) out.push(`${top.name} holds ${top.slots} Map Pack spots and has ${(top.reviews - mine).toLocaleString()} more reviews than you.`);
    else if (top) out.push(`${top.name} appears in ${top.slots} Map Pack spots across your keywords.`);
    return out.slice(0, 2);
}

export function strategyPrompt(business: any, market: Market, stats: any, tracker?: TrackerSummary) {
    return `You are a local SEO strategist. Business: "${business.name}" (${business.category || 'local business'}) at ${business.address || 'n/a'}.
Real data (do not invent other numbers):
- Keyword volumes/trend (${countryName(business)}): ${JSON.stringify(market.trendRows)}
- Map Pack share across these keywords: ${JSON.stringify(market.share)}
${tracker && tracker.checked ? `- Tracked keyword ranks (Google Maps, 1 = best, >20 = not found): ${JSON.stringify(tracker.rows.slice(0, 8))}\n` : ''}- Rating ${business.rating ?? 'n/a'} from ${business.reviewsCount || 0} reviews; review reply rate ${stats.reviewResponseRate || 0}%; photos ${stats.photoCount || 0}; weekly posts ${stats.weeklyPosts || 0}.
Write ONE concrete growth recommendation (max 230 characters) the owner can apply to their Google Business Profile this week, naming a specific keyword from the data. Only cite numbers present above.
Return JSON only: {"recommendation":"","keyword":""}`;
}

export function fallbackRecommendation(market: Market) {
    const best = [...market.trendRows].sort((x, y) => y.volume - x.volume)[0];
    const kw = best?.keyword || market.keywords[0];
    return {
        recommendation: `Add "${kw}" to your Google Business Profile services and description, and publish a post about it this week.`,
        keyword: kw
    };
}

export function weekStart(d: Date) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() - day + 1);
    return x.toISOString().slice(0, 10);
}
