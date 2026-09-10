import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildLocalSeoInconsistencies, fallbackPillarDecks } from './pillarFixDecks.js';

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

/** Drop AI claims that contradict measured crawl / NAP / check facts before publish. */
function sanitizeDeepReportAgainstFacts(parsed, { phoneVisibleOnCrawl, napCards, localRank }) {
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
  // Always force measured NAP cards
  if (Array.isArray(napCards) && napCards.length) {
    out.localSeoFixes = {
      ...(out.localSeoFixes || {}),
      inconsistencies: napCards
    };
  }

  // Force Maps / competitor names from measured localRank only (no invented clinics)
  const measuredMaps = (Array.isArray(localRank?.topResults) ? localRank.topResults : [])
    .filter((r) => r?.name && !r.isProspect)
    .slice(0, 3)
    .map((r) => ({
      position: r.position,
      name: r.name,
      rating: r.rating ?? null,
      reviewCount: r.reviewCount ?? null
    }));
  const measuredNames = measuredMaps.map((r) => r.name);

  if (out.aeoFixes?.queryCards) {
    out.aeoFixes = {
      ...out.aeoFixes,
      queryCards: (out.aeoFixes.queryCards || []).map((card) => {
        const { note: _drop, ...rest } = card || {};
        if (!measuredMaps.length) return rest;
        return {
          ...rest,
          mapsResults: measuredMaps,
          featuredSnippet: card?.featuredSnippet
            ? {
                ...card.featuredSnippet,
                source:
                  measuredNames.includes(card.featuredSnippet.source) ||
                  /nhs|gov\.uk|wikipedia|yell|treatwell|booksy|national/i.test(
                    String(card.featuredSnippet.source || '')
                  )
                    ? card.featuredSnippet.source
                    : measuredNames[0] || 'Local directory / national source'
              }
            : card?.featuredSnippet
        };
      })
    };
  }
  if (out.geoFixes?.queryCards) {
    out.geoFixes = {
      ...out.geoFixes,
      queryCards: (out.geoFixes.queryCards || []).map((card) => {
        const { note: _drop, ...rest } = card || {};
        return {
          ...rest,
          competitorsShown: measuredNames.length ? measuredNames.slice(0, 4) : rest.competitorsShown || [],
          competitorsDetailed: measuredMaps.length ? measuredMaps : rest.competitorsDetailed || [],
          aiSummary: scrubFalsePhoneClaims(card?.aiSummary || '')
        };
      })
    };
  }
  return out;
}

/**
 * Client-facing local presence report (GBP / NAP / reviews / Maps first).
 */
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
If near-me position is measured, explain it in plain English (e.g. “#2 for pest control near Manchester” or “not in the top 10”).
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

      return {
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
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || 'Gemini report generation failed');
}

/**
 * Deep crawl Local SEO / AEO / GEO report (PPT-style narrative).
 */
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
    { "title": "", "detail": "", "impact": "Critical|High|Medium", "area": "Local SEO|AEO|GEO" }
  ],
  "findings": [
    { "title": "", "detail": "", "impact": "High|Medium|Low", "area": "Local SEO|AEO|GEO|Technical" }
  ],
  "priorityFixes": [
    { "title": "", "why": "", "action": "", "suggestedPackage": "Local Presence|Local Growth|Website|Booking" }
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
      { "priority": "Critical|High|Medium|Tracking", "title": "", "detail": "", "howTo": "concrete how-to steps" }
    ]
  },
  "aeoFixes": {
    "title": "AEO: Answer Engine Optimisation",
    "visualIntro": "one sentence about question / FAQ search readiness for this service and city",
    "priorities": [
      { "priority": "Critical|High|Medium", "title": "", "detail": "", "howTo": "concrete how-to steps" }
    ],
    "queryCards": [
      {
        "query": "realistic UK question query for this service+city (cost, referral, or how-to)",
        "featuredSnippet": {
          "source": "real national/directory source or competitor from localRank only",
          "title": "short snippet title",
          "text": "1-2 sentences — do not invent local clinic names; use national/directory or names from localRank topResults"
        },
        "paaQuestions": ["3 related People Also Ask questions"],
        "mapsResults": [{ "position": 1, "name": "from localRank only", "rating": 4.8, "reviewCount": 100 }]
      }
    ],
    "opportunity": "one sentence opportunity — do NOT invent 'Brand is not mentioned' red-tag style notes"
  },
  "geoFixes": {
    "title": "GEO: AI Search Visibility",
    "visualIntro": "one sentence about Maps / near-me visibility using localRank facts",
    "queryCards": [
      {
        "query": "best {service} near {city} OR {service} near me — must match business service",
        "competitorsShown": ["names from localRank topResults only — never invent"],
        "competitorsDetailed": [
          { "position": 1, "name": "from localRank only", "rating": 4.8, "reviewCount": 100 }
        ],
        "aiSummary": "1 sentence on who appears for that near-me query"
      }
    ],
    "goalLine": "win best {service} near me style searches",
    "opportunity": "one sentence based on whether brand is in localRank — never invent 'Brand is not mentioned in the AI assistant result'",
    "actions": [
      { "title": "", "detail": "", "howTo": "concrete how-to steps" }
    ]
  },
  "nextSteps": ["4 short next steps for the team"],
  "gbpNote": "optional data confidence note",
  "offerLine": "one sentence soft offer",
  "closingLine": "soft next-step CTA"
}

Include exactly 4 criticalIssues, 4-6 findings, exactly 3 priorityFixes, roadmap months 1–3,
exactly 3 aeoFixes.queryCards, 2 geoFixes.queryCards, 3-4 actions per Local SEO and GEO decks, 3-4 AEO priorities.
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
      const parsed = sanitizeDeepReportAgainstFacts(parsedRaw, {
        phoneVisibleOnCrawl,
        napCards,
        localRank: audit.gbpLookup?.localRank || null
      });

      const localSeoFixes = {
        ...fallbacks.localSeoFixes,
        ...(parsed.localSeoFixes || {}),
        // Always keep measured NAP cards — AI must not invent phone/address mismatches
        inconsistencies: napCards.length
          ? napCards
          : Array.isArray(parsed.localSeoFixes?.inconsistencies) &&
              parsed.localSeoFixes.inconsistencies.length
            ? parsed.localSeoFixes.inconsistencies.slice(0, 5)
            : fallbacks.localSeoFixes.inconsistencies,
        actions: Array.isArray(parsed.localSeoFixes?.actions)
          ? parsed.localSeoFixes.actions.slice(0, 4)
          : fallbacks.localSeoFixes.actions
      };

      const aeoFixes = {
        ...fallbacks.aeoFixes,
        ...(parsed.aeoFixes || {}),
        priorities: Array.isArray(parsed.aeoFixes?.priorities)
          ? parsed.aeoFixes.priorities.slice(0, 4)
          : fallbacks.aeoFixes.priorities,
        queryCards: (() => {
          const fromAi = Array.isArray(parsed.aeoFixes?.queryCards)
            ? parsed.aeoFixes.queryCards.slice(0, 3)
            : null;
          const base = fromAi || fallbacks.aeoFixes.queryCards;
          return base.map((card: Record<string, unknown>, i: number) => {
            const fb = (fallbacks.aeoFixes.queryCards[i] || {}) as Record<string, unknown>;
            const paa = Array.isArray(card?.paaQuestions) ? card.paaQuestions : [];
            const maps = Array.isArray(card?.mapsResults) ? card.mapsResults : [];
            return {
              ...fb,
              ...card,
              paaQuestions: paa.length ? paa.slice(0, 4) : (fb.paaQuestions as unknown[]) || [],
              featuredSnippet: card?.featuredSnippet || fb.featuredSnippet || null,
              mapsResults: maps.length ? maps.slice(0, 3) : (fb.mapsResults as unknown[]) || []
            };
          });
        })()
      };

      const geoFixes = {
        ...fallbacks.geoFixes,
        ...(parsed.geoFixes || {}),
        queryCards: (() => {
          const fromAi = Array.isArray(parsed.geoFixes?.queryCards)
            ? parsed.geoFixes.queryCards.slice(0, 2)
            : null;
          const base = fromAi || fallbacks.geoFixes.queryCards;
          return base.map((card: Record<string, unknown>, i: number) => {
            const fb = (fallbacks.geoFixes.queryCards[i] || {}) as Record<string, unknown>;
            const shown = Array.isArray(card?.competitorsShown) ? card.competitorsShown : [];
            const detailed = Array.isArray(card?.competitorsDetailed)
              ? card.competitorsDetailed
              : [];
            return {
              ...fb,
              ...card,
              competitorsShown: shown.length
                ? shown.slice(0, 4)
                : (fb.competitorsShown as unknown[]) || [],
              competitorsDetailed: detailed.length
                ? detailed.slice(0, 4)
                : (fb.competitorsDetailed as unknown[]) || [],
              aiSummary: card?.aiSummary || fb.aiSummary || null
            };
          });
        })(),
        actions: Array.isArray(parsed.geoFixes?.actions)
          ? parsed.geoFixes.actions.slice(0, 4)
          : fallbacks.geoFixes.actions
      };

      return {
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
        roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap.slice(0, 3) : [],
        localSeoFixes,
        aeoFixes,
        geoFixes,
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 4) : [],
        gbpNote: parsed.gbpNote || '',
        offerLine: parsed.offerLine || '',
        closingLine: parsed.closingLine || ''
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || 'Deep Gemini report generation failed');
}
