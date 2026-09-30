import { GoogleGenerativeAI } from '@google/generative-ai';
import { fallbackPillarDecks } from './pillarFixDecks.js';
import { buildLocalSeoInconsistencies } from './localSeoDeck.js';

function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Gemini did not return JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

const FALSE_PHONE_ABSENCE =
  /lack of visible phone[^.?!]*[.?!]?|missing phone (details|number)?[^.?!]*(website|crawl)[^.?!]*[.?!]?|no (visible )?phone[^.?!]*(website|crawl|site)[^.?!]*[.?!]?|phone details on the website crawl[^.?!]*[.?!]?/gi;

function scrubFalsePhoneClaims(text) {
  if (!text) return text;
  return String(text)
    .replace(FALSE_PHONE_ABSENCE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function stripEmojiText(text) {
  if (text == null) return text;
  if (typeof text !== 'string') return text;
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const VENDOR_SENTENCE =
  /[^.!?\n]*(?:dataforseo|llm scraper|consumer ui|top 5|llm responses|scraped ui|claude \(api\))[^.!?\n]*[.!?]?/gi;

function scrubVendorText(text) {
  if (!text || typeof text !== 'string') return text;
  if (text.startsWith('data:image/')) return text;
  return text
    .replace(VENDOR_SENTENCE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function scrubVendorDeep(value) {
  if (value == null) return value;
  if (typeof value === 'string') return scrubVendorText(value);
  if (Array.isArray(value)) return value.map((item) => scrubVendorDeep(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = scrubVendorDeep(item);
    return out;
  }
  return value;
}

function buildMeasuredRoadmap(audit) {
  const business = audit?.business || {};
  const name = String(business.businessName || 'this business').trim();
  const service = String(business.serviceLabel || business.service || 'the service').trim();
  const city = String(business.searchAreaLabel || business.city || 'the local area').trim();
  const failed = (audit?.checklist?.checks || []).filter((c) => c?.status === 'fail');
  const pick = (pred, fallbacks) => {
    const items = failed
      .filter(pred)
      .slice(0, 4)
      .map((c) => `Fix “${c.label}” for ${name}: ${String(c.evidence || 'measured gap on this audit').slice(0, 140)}`);
    for (const fallback of fallbacks) {
      if (items.length >= 4) break;
      items.push(fallback);
    }
    return items.slice(0, 4);
  };
  return [
    {
      month: 1,
      title: 'Foundation',
      items: pick(
        (c) => /gbp|nap|web|onpage|conv|maps|local/i.test(`${c.section || ''} ${c.id || ''}`),
        [
          `Make the Google listing for ${name} match the website name, phone, and address in ${city}`,
          `Publish Google Posts about ${service} in ${city} and reply to recent reviews`,
          `Add a ${service} page that names the areas covered around ${city}`,
          `Check photos, hours, and services on the Google listing for ${name}`
        ]
      )
    },
    {
      month: 2,
      title: 'Answers',
      items: pick(
        (c) => /^(aeo_|ai_)/.test(String(c.id || '')) || /faq/i.test(String(c.label || '')),
        [
          `Add short FAQ answers for the ${service} questions customers ask in ${city}`,
          `Put the service and the city in the first paragraph of the ${service} page`,
          `Mark the FAQ with FAQ schema on the ${service} pages`,
          `Add a clear quote or contact path on the ${service} page`
        ]
      )
    },
    {
      month: 3,
      title: 'AI visibility',
      items: pick(
        (c) => String(c.id || '').startsWith('geo_'),
        [
          `Use the same name, ${service}, and ${city} on the website, Google listing, and citations`,
          `Ask ChatGPT, Claude, and Gemini who they recommend for ${service} in ${city} and record whether ${name} is named`,
          `Add ${name} to local directories that already list ${service} businesses in ${city}`,
          `Publish one page that answers a real ${service} problem for customers in ${city}`
        ]
      )
    }
  ];
}

function roadmapIsWeak(roadmap) {
  if (!Array.isArray(roadmap) || roadmap.length < 3) return true;
  return roadmap.some(
    (month) =>
      !Array.isArray(month?.items) ||
      month.items.filter((item) => String(item || '').trim().length > 24).length < 3
  );
}

function stripEmojiDeep(value) {
  if (value == null) return value;
  if (typeof value === 'string') return stripEmojiText(value);
  if (Array.isArray(value)) return value.map(stripEmojiDeep);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = stripEmojiDeep(v);
    }
    return out;
  }
  return value;
}

/** Positive completeness phrasing that must never appear as a critical issue title. */
const POSITIVE_AS_ISSUE =
  /^(photos present|business description present|description present|opening hours present|categories present|services listed|gbp posts being used|appears for\b)/i;

function isPositiveAsIssueTitle(title) {
  return POSITIVE_AS_ISSUE.test(String(title || '').trim());
}

function collectAuditChecks(audit) {
  const presence = audit?.presence?.checks;
  if (Array.isArray(presence) && presence.length) return presence;
  return audit?.checklist?.checks || [];
}

function areaFromCheck(c) {
  return c?.pillar || c?.sectionTitle || c?.section || 'Local SEO';
}

/** Build fail-oriented critical issues from measured failed checks (never pass-worded labels). */
export function buildDeterministicCriticalIssues(audit, limit = 4) {
  const failed = collectAuditChecks(audit).filter((c) => c.status === 'fail');
  return failed.slice(0, limit).map((c) => ({
    title: String(c.label || 'Visibility gap'),
    detail: String(c.evidence || ''),
    impact: 'High',
    area: areaFromCheck(c),
    evidence: String(c.evidence || ''),
    recommendation: '',
    priority: 'High'
  }));
}

export function buildDeterministicStrengths(audit, limit = 4) {
  return collectAuditChecks(audit)
    .filter((c) => c.status === 'pass')
    .slice(0, limit)
    .map((c) => String(c.label || ''))
    .filter(Boolean);
}

export function buildDeterministicPriorityFixes(audit, limit = 3) {
  const failed = collectAuditChecks(audit).filter((c) => c.status === 'fail');
  return failed.slice(0, limit).map((c) => ({
    title: String(c.label || 'Fix visibility gap'),
    why: String(c.evidence || 'This check failed in the measured audit.'),
    action: 'Update the matching GBP / website signal, then re-run the audit to confirm.',
    suggestedPackage: 'Local Presence',
    issue: String(c.label || ''),
    evidence: String(c.evidence || ''),
    impact: 'High',
    recommendation: 'Update the matching GBP / website signal, then re-run the audit to confirm.',
    priority: 'High'
  }));
}

const DEFAULT_CLOSING =
  'Share this report with the owner, agree the first three priority fixes, then re-run the audit to track progress.';

function filterPositiveAsIssues(list) {
  return (Array.isArray(list) ? list : []).filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (isPositiveAsIssueTitle(item.title)) return false;
    return true;
  });
}

function scrubPositiveContradictions(list, { photosPresent, descriptionPresent, hasHours, passedLabels }) {
  const passed = new Set((passedLabels || []).map((l) => String(l || '').toLowerCase().trim()).filter(Boolean));
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return item;
      const title = String(item.title || '').trim();
      const blob = `${title} ${item.detail || ''} ${item.why || ''} ${item.action || ''}`.toLowerCase();
      if (isPositiveAsIssueTitle(title)) return null;
      if (passed.has(title.toLowerCase())) return null;
      if (photosPresent === true && /no photos|missing photos|photos (missing|absent)|lack of photos/i.test(blob)) {
        return null;
      }
      if (
        descriptionPresent === true &&
        /no (business )?description|missing (business )?description|description (missing|absent)/i.test(blob)
      ) {
        return null;
      }
      if (hasHours === true && /no (opening )?hours|missing (opening )?hours|hours (missing|absent)/i.test(blob)) {
        return null;
      }
      return item;
    })
    .filter(Boolean);
}

/** Fill missing narrative fields from measured checks so the report never shows empty/wrong sections. */
export function ensureNarrativeSections(aiReport, audit) {
  const out = { ...(aiReport || {}) };
  const gbp = audit?.gbpLookup || {};
  const passedLabels = buildDeterministicStrengths(audit, 20);
  const detCritical = buildDeterministicCriticalIssues(audit, 4);
  const detStrengths = buildDeterministicStrengths(audit, 4);
  const detFixes = buildDeterministicPriorityFixes(audit, 3);

  let critical = filterPositiveAsIssues(out.criticalIssues);
  critical = scrubPositiveContradictions(critical, {
    photosPresent: gbp.photosPresent,
    descriptionPresent: gbp.descriptionPresent ?? gbp.hasDescription,
    hasHours: gbp.hasHours,
    passedLabels
  });
  if (!critical.length) critical = detCritical;
  out.criticalIssues = critical.slice(0, 4);

  if (!Array.isArray(out.strengths) || !out.strengths.length) {
    out.strengths = detStrengths;
  } else {
    out.strengths = out.strengths.map(String).slice(0, 4);
  }

  let fixes = filterPositiveAsIssues(out.priorityFixes);
  fixes = scrubPositiveContradictions(fixes, {
    photosPresent: gbp.photosPresent,
    descriptionPresent: gbp.descriptionPresent ?? gbp.hasDescription,
    hasHours: gbp.hasHours,
    passedLabels
  });
  if (!fixes.length) fixes = detFixes;
  out.priorityFixes = fixes.slice(0, 3);

  if (!String(out.closingLine || '').trim()) {
    out.closingLine = DEFAULT_CLOSING;
  }
  if (!String(out.offerLine || '').trim()) {
    out.offerLine =
      'We can help close these gaps with managed Local Presence or Local Growth at clear monthly pricing.';
  }
  return out;
}

function sanitizeDeepReportAgainstFacts(parsed, { phoneVisibleOnCrawl, napCards, localRank, gbpFacts, passedLabels }) {
  const out = { ...parsed };
  if (phoneVisibleOnCrawl) {
    out.executiveSummary = scrubFalsePhoneClaims(out.executiveSummary);
    out.overallVerdict = scrubFalsePhoneClaims(out.overallVerdict);
    out.scoreComment = scrubFalsePhoneClaims(out.scoreComment);
    const scrubList = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((item) => {
          if (!item || typeof item !== 'object') return item;
          const title = scrubFalsePhoneClaims(item.title || '');
          const detail = scrubFalsePhoneClaims(item.detail || '');
          const why = scrubFalsePhoneClaims(item.why || '');
          const action = scrubFalsePhoneClaims(item.action || '');
          const blob = `${title} ${detail} ${why} ${action}`.toLowerCase();
          if (
            /lack of visible phone|missing phone|no phone on (the )?(website|crawl)/i.test(blob) &&
            !scrubFalsePhoneClaims(detail)
          ) {
            return null;
          }
          return { ...item, title, detail, why, action };
        })
        .filter(Boolean);

    out.criticalIssues = scrubList(out.criticalIssues);
    out.findings = scrubList(out.findings);
    out.priorityFixes = scrubList(out.priorityFixes);
    if (out.localSeoFixes?.actions) {
      out.localSeoFixes = {
        ...out.localSeoFixes,
        actions: scrubList(out.localSeoFixes.actions),
        takeaway: scrubFalsePhoneClaims(out.localSeoFixes.takeaway || '')
      };
    }
  }

  const scrubOpts = {
    photosPresent: gbpFacts?.photosPresent,
    descriptionPresent: gbpFacts?.descriptionPresent ?? gbpFacts?.hasDescription,
    hasHours: gbpFacts?.hasHours,
    passedLabels: passedLabels || []
  };
  out.criticalIssues = scrubPositiveContradictions(filterPositiveAsIssues(out.criticalIssues), scrubOpts);
  out.findings = scrubPositiveContradictions(filterPositiveAsIssues(out.findings), scrubOpts);
  out.priorityFixes = scrubPositiveContradictions(filterPositiveAsIssues(out.priorityFixes), scrubOpts);
  
  if (Array.isArray(napCards) && napCards.length) {
    out.localSeoFixes = {
      ...(out.localSeoFixes || {}),
      inconsistencies: napCards
    };
  }

  
  const measuredMaps = (Array.isArray(localRank?.topResults) ? localRank.topResults : [])
    .filter((r) => r?.name)
    .slice(0, 5)
    .map((r) => ({
      position: r.position,
      name: r.name,
      rating: r.rating ?? null,
      reviewCount: r.reviewCount ?? null,
      isProspect: Boolean(r.isProspect)
    }));
  const measuredNames = measuredMaps.map((r) => r.name);
  const measuredQuery = String(localRank?.query || '').trim();
  const inPackMeasured = typeof localRank?.position === 'number';

  // Always attach factual Maps ranking (yes/no + list) — never leave "not measured"
  if (measuredQuery || measuredMaps.length || out.localSeoFixes) {
    out.localSeoFixes = {
      ...(out.localSeoFixes || {}),
      mapsRanking: {
        title: 'Google Map Ranking',
        measured: true,
        query: measuredQuery,
        inPack: inPackMeasured,
        status: inPackMeasured ? 'yes' : 'no',
        evidence: inPackMeasured
          ? `Appears at #${localRank?.position} for “${measuredQuery}”`
          : measuredMaps.length
            ? `Not in Maps results for “${measuredQuery}” — showing ${measuredMaps.length} other listings`
            : measuredQuery
              ? `Not in Maps results for “${measuredQuery}”`
              : 'Not found in Google Maps results for the local query',
        results: measuredMaps,
        mapsResults: measuredMaps
      }
    };
  }

  // AEO Visual queryCards are measured SERP screenshots — drop any Gemini-invented SERP mocks
  if (out.aeoFixes) {
    const { queryCards: _dropCards, ...aeoRest } = out.aeoFixes;
    out.aeoFixes = aeoRest;
  }
  if (out.geoFixes) {
    const q = measuredQuery || restQuery(out.geoFixes);
    const inPack = typeof localRank?.position === 'number';
    out.geoFixes = {
      ...out.geoFixes,
      title: out.geoFixes.title || 'GEO: Google + AI visibility',
      queryCards: [
        {
          query: q,
          competitorsShown: measuredNames.slice(0, 5),
          competitorsDetailed: measuredMaps,
          mapsResults: measuredMaps,
          measured: true,
          inPack,
          prospectFound: inPack
        }
      ],
      aiEngines: Array.isArray(out.geoFixes.aiEngines) ? out.geoFixes.aiEngines : undefined,
      geoChecklist: out.geoFixes.geoChecklist || undefined
    };
  }
  return out;
}

function restQuery(geoFixes: any): string {
  const first = Array.isArray(geoFixes?.queryCards) ? geoFixes.queryCards[0] : null;
  return String(first?.query || '').trim();
}




export async function generateAiReport(audit) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelNames = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

  const business = audit.business || {};
  const score = audit.score || {};
  const presence = audit.presence || {};
  const gbp = audit.gbpLookup || {};
  const websiteCheck = audit.websiteCheck || {};

  const prompt = `You are a UK local-growth consultant writing a concise ZappSites outbound Growth Audit.
Focus on PUBLIC local visibility: website live?, Google Business Profile name, NAP (name/address/phone), reviews & owner replies, GBP optimisation, Google Maps listing, and where they appear for local searches like “{service} near {town}”.
Do NOT invent ratings, review counts, owner replies, or rankings. Use only the measured JSON below.
If owner replies are unknown, say so clearly and tell them to check Maps.
If near-me position is measured, explain it in plain English (e.g. “#2 for pest control near Didsbury” or “not in the top 10 for the measured local area”). Prefer the business town/suburb/search area over a large city name.
British English. Commercial but honest. Soft-sell ZappSites Local Presence (£99/mo) or Local Growth (£199/mo) as ways we can fix gaps — no hard pressure, no fake guarantees.

Business claimed:
${JSON.stringify(business)}

Website check:
${JSON.stringify(websiteCheck)}

Public GBP / Maps lookup:
${JSON.stringify(gbp)}

Presence score:
${JSON.stringify(score)}

Presence checks:
${JSON.stringify(presence.checks || [])}

Return ONLY JSON:
{
  "headline": "short headline",
  "executiveSummary": "2-4 sentences on local visibility gaps/opportunities",
  "overallVerdict": "one sentence",
  "scoreComment": "one sentence on the /100 presence score",
  "strengths": ["up to 4 strengths"],
  "findings": [
    { "title": "", "detail": "", "impact": "High|Medium|Low", "area": "Website|GBP|NAP|Reviews|Maps|Optimisation" }
  ],
  "priorityFixes": [
    { "title": "", "why": "", "action": "", "suggestedPackage": "Local Presence|Local Growth|Website|Booking" }
  ],
  "gbpNote": "short note on data source confidence",
  "offerLine": "one sentence: we can fix these gaps with managed Local AEO / GBP work at clear monthly pricing",
  "closingLine": "soft next-step CTA"
}

Include 4-6 findings and exactly 3 priorityFixes.`;

  let lastError;
  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json'
        }
      });
      const result = await model.generateContent(prompt);
      const parsed = extractJson(result.response.text());

      return ensureNarrativeSections(
        {
          generatedAt: new Date().toISOString(),
          model: modelName,
          headline: parsed.headline || 'Local visibility snapshot',
          executiveSummary: parsed.executiveSummary || '',
          overallVerdict: parsed.overallVerdict || '',
          scoreComment: parsed.scoreComment || '',
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : [],
          findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 6) : [],
          priorityFixes: Array.isArray(parsed.priorityFixes) ? parsed.priorityFixes.slice(0, 3) : [],
          gbpNote: parsed.gbpNote || '',
          offerLine: parsed.offerLine || '',
          closingLine: parsed.closingLine || ''
        },
        audit
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || 'Gemini report generation failed');
}




export async function generateDeepAiReport(audit) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelNames = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

  const business = audit.business || {};
  const score = audit.score || {};
  const checks = audit.checklist?.checks || [];
  const failed = checks.filter((c) => c.status === 'fail').slice(0, 20);
  const passed = checks.filter((c) => c.status === 'pass').slice(0, 15);
  const napCards = buildLocalSeoInconsistencies(audit);
  const fallbacks = fallbackPillarDecks(audit);
  const sitePhones = audit.crawlMeta?.sitePhones || audit.crawl?.sitePhones || [];
  const phoneChecks = checks.filter((c) =>
    ['web_basic_6', 'nap_1', 'conv_1', 'presence_nap_phone'].includes(c.id)
  );
  const phoneCard = napCards.find((c) => c.field === 'phone');
  const phoneVisibleOnCrawl =
    (Array.isArray(sitePhones) && sitePhones.length > 0) ||
    phoneCard?.status === 'match' ||
    phoneChecks.some((c) => c.status === 'pass');

  const prompt = `You are a UK Local SEO + AEO + GEO consultant writing an internal ZappSites Deep Audit report.
Tone: clear, commercial, British English. Do NOT invent ratings, rankings, credentials, phones, or crawl facts.
Use only the measured JSON. Structure the narrative like a client deck: overall visibility, Local SEO / AEO / GEO, four critical issues, strengths, 90-day roadmap, plus three fix decks.
For every issue use Issue → Evidence → Impact → Recommendation → Priority (fill evidence/recommendation/priority fields; keep title/detail/impact too).
GEO visuals must describe Google Local Pack / Maps results only — never invent or request an AI Overview block.

CRITICAL ISSUES RULES (must follow):
- criticalIssues must be REAL gaps from Failed checks only — never invent issues.
- NEVER list a Passed check (or positive GBP fact) as a critical issue. Forbidden titles include: "Photos present", "Business description present", "Opening hours present", "Categories present", "Services listed".
- If photos/description/hours are present on GBP, do not claim they are missing.
- strengths must come from Passed checks / positive measured facts only.
- priorityFixes must address Failed checks only.

EMOJI RULE (must follow):
- Never use emojis, emoticons, or pictographs in any JSON string field (headlines, summaries, titles, details, decks, roadmap, next steps).
- Use plain professional text only. Icons are added by the report UI separately.

SOURCE RULE (must follow):
- Never name DataForSEO, scrapers, consumer UI, Top 5, LLM Responses, scraped UI, or any API used to measure results.
- Say ChatGPT, Claude, and Gemini only. Do not say how the answers were collected.

ROADMAP RULES (must follow):
- Exactly 3 months, and each month has 4 concrete tasks for this business.
- Month 1 fixes Google Business Profile and website gaps taken from the failed checks.
- Month 2 adds the FAQ and on-page answers the failed AEO checks need.
- Month 3 makes ChatGPT, Claude, and Gemini more likely to name this business for this service and city.
- Name the business, the service, and the city in the tasks. Do not write generic tasks such as "monitor rankings" or "improve SEO".

CRITICAL PHONE RULES (must follow):
- Measured crawl phones: ${JSON.stringify(sitePhones)}
- Phone NAP card: ${JSON.stringify(phoneCard || null)}
- Phone-related checks: ${JSON.stringify(phoneChecks.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence })))}
- homepageHasTel: ${JSON.stringify(audit.crawlMeta?.homepageHasTel ?? null)}
- If crawl phones are non-empty OR phone card status is "match" OR any of web_basic_6 / nap_1 / conv_1 passed: you MUST NOT say the website lacks a phone, missing phone on crawl, or that search engines cannot validate the entity due to missing phone.
- phoneVisibleOnCrawl=${phoneVisibleOnCrawl}. When true, never invent "lack of visible phone details on the website crawl".
- Empty intake business.phone alone is NOT proof the website has no phone — use sitePhones and phone checks.
- Schema / structured data gaps may only be mentioned if schema-related checks actually failed.

Business:
${JSON.stringify(business)}

Score (Local SEO 40% / AEO 30% / GEO 30%):
${JSON.stringify({
    total: score.total,
    max: score.max,
    band: score.band,
    triad: score.triad || score.pillars,
    note: score.note
  })}

Crawl meta:
${JSON.stringify({
    ...(audit.crawlMeta || {}),
    sitePhones,
    homepageHasTel: audit.crawlMeta?.homepageHasTel ?? null
  })}

GBP / NAP inconsistency cards (use these facts; do not invent phones/addresses):
${JSON.stringify(napCards)}

Failed checks (sample):
${JSON.stringify(failed)}

Passed checks (sample):
${JSON.stringify(passed)}

Return ONLY JSON:
{
  "headline": "short deck-style headline",
  "executiveSummary": "2-4 sentences on digital presence gaps/opportunities across Local SEO, AEO, GEO",
  "overallVerdict": "one sentence",
  "scoreComment": "one sentence on the /100 weighted score",
  "pillarComments": {
    "local_seo": "one sentence",
    "aeo": "one sentence",
    "geo": "one sentence"
  },
  "strengths": ["up to 4 strengths"],
  "criticalIssues": [
    { "title": "", "detail": "", "impact": "Critical|High|Medium", "area": "Local SEO|AEO|GEO", "evidence": "", "recommendation": "", "priority": "Critical|High|Medium" }
  ],
  "findings": [
    { "title": "", "detail": "", "impact": "High|Medium|Low", "area": "Local SEO|AEO|GEO|Technical", "evidence": "", "recommendation": "", "priority": "High|Medium|Low" }
  ],
  "priorityFixes": [
    { "title": "", "why": "", "action": "", "suggestedPackage": "Local Presence|Local Growth|Website|Booking", "issue": "", "evidence": "", "impact": "High|Medium|Low", "recommendation": "", "priority": "Critical|High|Medium" }
  ],
  "roadmap": [
    { "month": 1, "title": "Foundation", "items": ["3-5 concrete tasks"] },
    { "month": 2, "title": "Authority & answers", "items": ["3-5 concrete tasks"] },
    { "month": 3, "title": "AI visibility", "items": ["3-5 concrete tasks"] }
  ],
  "localSeoFixes": {
    "title": "Local SEO: The Fixes",
    "takeaway": "one sentence why NAP consistency matters",
    "inconsistencies": [
      { "field": "address|phone|hours|brand|website", "title": "", "gbpShows": "", "websiteShows": "", "status": "match|mismatch|unknown", "tone": "green|amber|purple|teal" }
    ],
    "actions": [
      { "priority": "Critical|High|Medium|Tracking", "title": "", "detail": "", "howTo": "concrete how-to steps", "issue": "", "evidence": "", "impact": "", "recommendation": "" }
    ]
  },
  "aeoFixes": {
    "title": "AEO: Answer Engine Optimisation",
    "visualIntro": "one sentence about question / FAQ search readiness for this service and city — AEO Visual uses measured Google SERP screenshots (do not invent SERP cards)",
    "priorities": [
      { "priority": "Critical|High|Medium", "title": "", "detail": "", "howTo": "concrete how-to steps", "issue": "", "evidence": "", "impact": "", "recommendation": "" }
    ],
    "opportunity": "one sentence opportunity — do NOT invent 'Brand is not mentioned' red-tag style notes"
  },
  "geoFixes": {
    "title": "GEO: Google + AI visibility",
    "visualIntro": "one sentence about the MEASURED Google Local Pack query from localRank — tell the user to re-type that exact query to verify; do NOT invent other queries or AI Overview",
    "verifyHint": "Search the measured Google query, then ask ChatGPT, Claude, and Gemini the same local questions.",
    "queryCards": [
      {
        "query": "MUST equal gbpLookup.localRank.query exactly",
        "competitorsShown": ["names from localRank topResults only — never invent"],
        "competitorsDetailed": [
          { "position": 1, "name": "from localRank only", "rating": 4.8, "reviewCount": 100, "isProspect": false }
        ],
        "mapsResults": [
          { "position": 1, "name": "from localRank only", "rating": 4.8, "reviewCount": 100, "isProspect": false }
        ],
        "measured": true
      }
    ],
    "goalLine": "win the measured Google query and get cited in ChatGPT / Claude",
    "opportunity": "one sentence based on localRank + whether brand is mentioned in AI engines — never invent AI Overview",
    "actions": [
      { "title": "", "detail": "", "howTo": "concrete how-to steps", "priority": "High|Medium", "issue": "", "evidence": "", "impact": "", "recommendation": "" }
    ]
  },
  "nextSteps": ["4 short next steps for the team"],
  "gbpNote": "optional data confidence note",
  "offerLine": "one sentence soft offer",
  "closingLine": "soft next-step CTA"
}

For every criticalIssue, finding, priorityFix, and deck action/priority use Issue → Evidence → Impact → Recommendation → Priority (map title/detail/why/action into those fields; keep existing keys too).
Include exactly 4 criticalIssues, 4-6 findings, exactly 3 priorityFixes, roadmap months 1–3,
do NOT generate aeoFixes.queryCards / featuredSnippet / paaQuestions (AEO Visual uses measured Google SERP screenshots), 2 geoFixes.queryCards, 3-4 actions per Local SEO and GEO decks, 3-4 AEO priorities.
Prefer the provided NAP inconsistency cards for localSeoFixes.inconsistencies (you may refine titles only — never change phone/address facts or invent missing phones).`;

  let lastError;
  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json'
        }
      });
      const result = await model.generateContent(prompt);
      const parsedRaw = extractJson(result.response.text());
      const gbp = audit.gbpLookup || {};
      const passedLabels = passed.map((c) => c.label).filter(Boolean);
      const parsed = sanitizeDeepReportAgainstFacts(parsedRaw, {
        phoneVisibleOnCrawl,
        napCards,
        localRank: gbp.localRank || null,
        gbpFacts: {
          photosPresent: gbp.photosPresent,
          descriptionPresent: gbp.descriptionPresent ?? gbp.hasDescription,
          hasHours: gbp.hasHours
        },
        passedLabels
      });

      const localSeoFixes = {
        ...fallbacks.localSeoFixes,
        ...(parsed.localSeoFixes || {}),
        
        inconsistencies: napCards.length
          ? napCards
          : Array.isArray(parsed.localSeoFixes?.inconsistencies) &&
              parsed.localSeoFixes.inconsistencies.length
            ? parsed.localSeoFixes.inconsistencies.slice(0, 5)
            : fallbacks.localSeoFixes.inconsistencies,
        coreChecklist:
          fallbacks.localSeoFixes.coreChecklist || parsed.localSeoFixes?.coreChecklist || null,
        actions: Array.isArray(parsed.localSeoFixes?.actions)
          ? parsed.localSeoFixes.actions.slice(0, 4)
          : fallbacks.localSeoFixes.actions
      };

      const aeoFixes = {
        ...fallbacks.aeoFixes,
        ...(parsed.aeoFixes || {}),
        aeoChecklist: fallbacks.aeoFixes.aeoChecklist || parsed.aeoFixes?.aeoChecklist || null,
        priorities: Array.isArray(parsed.aeoFixes?.priorities)
          ? parsed.aeoFixes.priorities.slice(0, 4)
          : fallbacks.aeoFixes.priorities,
        // Measured Google SERP screenshots only — never Gemini-invented snippet/PAA cards
        queryCards: Array.isArray(fallbacks.aeoFixes.queryCards)
          ? fallbacks.aeoFixes.queryCards
          : []
      };

      const geoFixes = {
        ...fallbacks.geoFixes,
        ...(parsed.geoFixes || {}),
        // Always prefer measured Google query cards from fallbacks (cross-checkable)
        queryCards: Array.isArray(fallbacks.geoFixes.queryCards)
          ? fallbacks.geoFixes.queryCards
          : [],
        aiEngines: Array.isArray(fallbacks.geoFixes.aiEngines)
          ? fallbacks.geoFixes.aiEngines
          : Array.isArray(parsed.geoFixes?.aiEngines)
            ? parsed.geoFixes.aiEngines
            : [],
        geoChecklist: fallbacks.geoFixes.geoChecklist || parsed.geoFixes?.geoChecklist || null,
        verifyHint: fallbacks.geoFixes.verifyHint || parsed.geoFixes?.verifyHint || '',
        visualIntro: fallbacks.geoFixes.visualIntro || parsed.geoFixes?.visualIntro || '',
        actions: Array.isArray(parsed.geoFixes?.actions)
          ? parsed.geoFixes.actions.slice(0, 4)
          : fallbacks.geoFixes.actions
      };

      return scrubVendorDeep(stripEmojiDeep(
        ensureNarrativeSections(
          {
            generatedAt: new Date().toISOString(),
            model: modelName,
            kind: 'deep-local-aeo-geo',
            headline: parsed.headline || 'Digital presence audit',
            executiveSummary: parsed.executiveSummary || '',
            overallVerdict: parsed.overallVerdict || '',
            scoreComment: parsed.scoreComment || '',
            pillarComments: parsed.pillarComments || {},
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : [],
            criticalIssues: Array.isArray(parsed.criticalIssues) ? parsed.criticalIssues.slice(0, 4) : [],
            findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 6) : [],
            priorityFixes: Array.isArray(parsed.priorityFixes) ? parsed.priorityFixes.slice(0, 3) : [],
            roadmap: roadmapIsWeak(parsed.roadmap) ? buildMeasuredRoadmap(audit) : parsed.roadmap.slice(0, 3),
            localSeoFixes,
            aeoFixes,
            geoFixes,
            nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 4) : [],
            gbpNote: parsed.gbpNote || '',
            offerLine: parsed.offerLine || '',
            closingLine: parsed.closingLine || ''
          },
          audit
        )
      )
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || 'Deep Gemini report generation failed');
}
