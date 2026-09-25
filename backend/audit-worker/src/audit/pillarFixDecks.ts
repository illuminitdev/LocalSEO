
import { buildLocalSeoCoreChecklist } from './localSeoCoreChecklist.js';
import { buildAeoCoreChecklist } from './aeoCoreChecklist.js';

/** Country aliases → canonical token (applied only as address suffix). */
const COUNTRY_SUFFIX_ALIASES = [
  {
    canon: 'unitedkingdom',
    keys: [
      'united kingdom of great britain and northern ireland',
      'unitedkingdom',
      'united kingdom',
      'great britain',
      'greatbritain',
      'u k',
      'uk',
      'g b',
      'gb'
    ]
  },
  {
    canon: 'unitedstates',
    keys: [
      'united states of america',
      'unitedstatesofamerica',
      'united states',
      'unitedstates',
      'u s a',
      'u s',
      'usa',
      'us'
    ]
  },
  { canon: 'australia', keys: ['australia', 'au'] },
  { canon: 'canada', keys: ['canada', 'ca'] },
  { canon: 'ireland', keys: ['republic of ireland', 'ireland', 'ie'] },
  { canon: 'newzealand', keys: ['new zealand', 'newzealand', 'nz'] },
  { canon: 'germany', keys: ['germany', 'de'] },
  { canon: 'france', keys: ['france', 'fr'] },
  { canon: 'india', keys: ['india', 'in'] },
  { canon: 'netherlands', keys: ['netherlands', 'the netherlands', 'thenetherlands', 'nl'] },
  { canon: 'southafrica', keys: ['south africa', 'southafrica', 'za'] }
];

/** Street type abbreviations → full forms (Rd ≈ Road, etc.). */
const STREET_ABBREV: Array<[RegExp, string]> = [
  [/\brd\b/g, 'road'],
  [/\bstreet\b/g, 'street'],
  [/\bst\b/g, 'street'],
  [/\bave\b/g, 'avenue'],
  [/\bav\b/g, 'avenue'],
  [/\bblvd\b/g, 'boulevard'],
  [/\bln\b/g, 'lane'],
  [/\bdr\b/g, 'drive'],
  [/\bct\b/g, 'court'],
  [/\bpl\b/g, 'place'],
  [/\bsq\b/g, 'square'],
  [/\bter\b/g, 'terrace'],
  [/\bcres\b/g, 'crescent'],
  [/\bcl\b/g, 'close'],
  [/\bhwy\b/g, 'highway'],
  [/\bpkwy\b/g, 'parkway'],
  [/\bcir\b/g, 'circle']
];

const COUNTRY_CANONS = new Set(COUNTRY_SUFFIX_ALIASES.map((c) => c.canon));

/** Normalize address text; UK ≈ United Kingdom; Rd ≈ Road. */
function normAddress(s) {
  let t = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  for (const [re, full] of STREET_ABBREV) {
    t = t.replace(re, full);
  }
  t = t.replace(/\s+/g, ' ').trim();
  for (const { canon, keys } of COUNTRY_SUFFIX_ALIASES) {
    const sorted = [...keys].sort((a, b) => b.length - a.length);
    for (const key of sorted) {
      if (t === key) return canon;
      if (t.endsWith(` ${key}`)) {
        return `${t.slice(0, t.length - key.length - 1).trim()} ${canon}`.trim();
      }
    }
  }
  return t;
}

/** Drop trailing country so UK vs United Kingdom never blocks a match. */
function stripTrailingCountry(normalized) {
  const t = String(normalized || '').trim();
  if (!t) return '';
  for (const canon of COUNTRY_CANONS) {
    if (t === canon) return '';
    if (t.endsWith(` ${canon}`)) {
      return t.slice(0, t.length - canon.length - 1).trim();
    }
  }
  return t;
}

function addressesMatch(a, b) {
  const na = stripTrailingCountry(normAddress(a));
  const nb = stripTrailingCountry(normAddress(b));
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  // Token overlap for minor word-order / extra-locality differences
  const ta = new Set(na.split(' ').filter((w) => w.length > 1));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared += 1;
  const minSize = Math.min(ta.size, tb.size);
  return shared >= Math.max(3, Math.ceil(minSize * 0.85));
}

export function buildLocalSeoInconsistencies(audit) {
  const b = audit?.business || {};
  const g = audit?.gbpLookup || {};
  const crawlPhones = [
    ...new Set(
      []
        .concat(audit?.crawlMeta?.sitePhones || [])
        .concat(audit?.crawl?.sitePhones || [])
        .map((p) => String(p || '').trim())
        .filter(Boolean)
    )
  ];
  const cards = [];

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const digits = (s) => String(s || '').replace(/\D/g, '');
  const phonesMatch = (a, b) => {
    const da = digits(a);
    const db = digits(b);
    if (!da || !db || da.length < 8 || db.length < 8) return false;
    return da.endsWith(db.slice(-8)) || db.endsWith(da.slice(-8)) || da.endsWith(db.slice(-10)) || db.endsWith(da.slice(-10));
  };

  const addrGbp = g.address || '';
  const addrBiz = b.address || '';
  if (addrGbp || addrBiz) {
    const match = addrGbp && addrBiz && addressesMatch(addrGbp, addrBiz);
    cards.push({
      field: 'address',
      title: match ? 'Address Correct & Consistent' : 'Address Inconsistency',
      gbpShows: addrGbp || 'Not found on Maps',
      websiteShows: addrBiz || 'Not provided',
      status: match ? 'match' : addrGbp && addrBiz ? 'mismatch' : 'unknown',
      tone: match ? 'green' : 'amber'
    });
  }

  const phoneGbp = g.phone || '';
  const phoneIntake = b.phone || '';
  const phoneFromCrawl =
    crawlPhones.find((p) => (phoneGbp ? phonesMatch(p, phoneGbp) : true)) || crawlPhones[0] || '';
  const websitePhone = phoneFromCrawl || phoneIntake;
  if (phoneGbp || websitePhone) {
    const match = phoneGbp && websitePhone && phonesMatch(phoneGbp, websitePhone);
    cards.push({
      field: 'phone',
      title: match ? 'Phone Number Consistent' : websitePhone ? 'Phone Number Mismatch' : 'Phone Listed on Google',
      gbpShows: phoneGbp || 'Not found on Maps',
      websiteShows: websitePhone || 'Not found on crawl',
      status: match ? 'match' : phoneGbp && websitePhone ? 'mismatch' : 'unknown',
      tone: match || (phoneGbp && !websitePhone) ? 'green' : 'amber'
    });
  }

  const nameGbp = g.gbpName || '';
  const nameBiz = b.businessName || '';
  if (nameGbp || nameBiz) {
    const match = nameGbp && nameBiz && (norm(nameGbp).includes(norm(nameBiz)) || norm(nameBiz).includes(norm(nameGbp)));
    cards.push({
      field: 'brand',
      title: match ? 'Brand Name Aligned' : 'Brand Name Variation',
      gbpShows: nameGbp || 'Not found',
      websiteShows: nameBiz || 'Not provided',
      status: match ? 'match' : nameGbp && nameBiz ? 'mismatch' : 'unknown',
      tone: match ? 'teal' : 'purple'
    });
  }

  const webGbp = g.websiteOnGbp || '';
  const webBiz = b.website || '';
  if (webGbp || webBiz) {
    const host = (u) => {
      try {
        return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '');
      } catch {
        return norm(u);
      }
    };
    const match = webGbp && webBiz && host(webGbp) === host(webBiz);
    cards.push({
      field: 'website',
      title: match ? 'Website Link Consistent' : 'Website Link Mismatch',
      gbpShows: webGbp || 'Not on Maps',
      websiteShows: webBiz || 'Not provided',
      status: match ? 'match' : webGbp && webBiz ? 'mismatch' : 'unknown',
      tone: match ? 'teal' : 'amber'
    });
  }

  return cards;
}

export function fallbackPillarDecks(audit) {
  const checks = audit?.checklist?.checks || [];
  const failed = checks.filter((c) => c.status === 'fail');
  const name = audit?.business?.businessName || 'This business';
  const city =
    audit?.business?.searchAreaLabel || audit?.business?.city || 'the local area';
  const service = audit?.business?.serviceLabel || audit?.business?.service || 'local services';

  const localFails = failed
    .filter((c) =>
      ['gbp', 'reviews', 'citations', 'local_seo', 'maps_competitors', 'website_basic'].includes(c.section)
    )
    .slice(0, 4);
  const aeoFails = failed
    .filter((c) => String(c.id).startsWith('aeo_') || String(c.id).startsWith('ai_') || c.id === 'onpage_10')
    .slice(0, 4);
  const geoFails = failed
    .filter((c) => String(c.id).startsWith('geo_') || ['tech_12', 'tech_13', 'tech_14', 'tech_15'].includes(c.id))
    .slice(0, 4);

  const toActions = (rows, defaultPri) =>
    rows.map((c, i) => {
      const priority = i === 0 ? 'Critical' : i === 1 ? 'High' : defaultPri;
      const evidence = c.evidence || 'Failed automated check';
      const impact =
        priority === 'Critical'
          ? 'Blocks local trust and ranking signals'
          : priority === 'High'
            ? 'Weakens Local Pack / answer visibility'
            : 'Limits competitive local presence';
      return {
        priority,
        title: c.label,
        detail: evidence,
        howTo: `Review and fix “${c.label}” on the live site / Google Business Profile, then re-check.`,
        issue: c.label,
        evidence,
        impact,
        recommendation: `Fix “${c.label}” using the measured evidence, then re-audit.`
      };
    });

  const mapsResults = (audit?.gbpLookup?.localRank?.topResults || [])
    .filter((r) => r?.name)
    .slice(0, 5)
    .map((r) => ({
      position: r.position,
      name: r.name,
      rating: r.rating,
      reviewCount: r.reviewCount,
      isProspect: Boolean(r.isProspect)
    }));
  const inPack = typeof audit?.gbpLookup?.localRank?.position === 'number';
  const measuredQuery =
    String(audit?.gbpLookup?.localRank?.query || '').trim() ||
    `${service} near ${city}`;
  const aiEngineChecks = Array.isArray(audit?.gbpLookup?.aiEngineChecks)
    ? audit.gbpLookup.aiEngineChecks
    : [];
  const geoChecklist = audit?.gbpLookup?.geoChecklist || null;
  const geoPromptTexts = Array.from(
    new Set(
      aiEngineChecks
        .map((e: { prompt?: string }) => String(e?.prompt || '').trim())
        .filter(Boolean)
    )
  );
  const geoPromptSummary =
    geoPromptTexts.length > 0
      ? geoPromptTexts.map((p) => `“${p}”`).join(', ')
      : `“${measuredQuery}”, “best ${service} in ${city}”, “${service} near me”`;

  return {
    localSeoFixes: {
      title: 'Local SEO: The Fixes',
      takeaway: `Standardise Name, Address and Phone across Google and the website so ${name} builds trust in ${city}.`,
      inconsistencies: buildLocalSeoInconsistencies(audit),
      coreChecklist: buildLocalSeoCoreChecklist(audit),
      mapsRanking: {
        title: 'Google Map Ranking',
        measured: true,
        query: measuredQuery,
        inPack,
        status: inPack ? 'yes' : 'no',
        evidence: inPack
          ? `Appears at #${audit?.gbpLookup?.localRank?.position} for “${measuredQuery}”`
          : mapsResults.length
            ? `Not in Maps results for “${measuredQuery}” — showing ${mapsResults.length} other listings`
            : `Not in Maps results for “${measuredQuery}”`,
        results: mapsResults,
        mapsResults
      },
      actions:
        toActions(localFails, 'Medium').length > 0
          ? toActions(localFails, 'Medium')
          : [
              {
                priority: 'High',
                title: 'Complete Google Business Profile',
                detail: 'Ensure categories, hours, photos and NAP match the website.',
                howTo: 'Open Google Business Profile → Info → align name, address, phone, website and hours.',
                issue: 'Incomplete or inconsistent Google Business Profile',
                evidence: 'GBP fields or NAP alignment need strengthening for local trust.',
                impact: 'Weak GBP signals reduce Local Pack and Maps visibility.',
                recommendation: 'Complete categories, hours, photos and NAP so Google and the website match.'
              }
            ]
    },
    aeoFixes: {
      title: 'AEO: Answer Engine Optimisation',
      visualIntro:
        'Optimising content to appear as answers to user questions — e.g. Google People Also Ask, featured snippets, direct answers, and AI-generated answers.',
      aeoChecklist: buildAeoCoreChecklist(audit),
      priorities:
        toActions(aeoFails, 'Medium').length > 0
          ? toActions(aeoFails, 'Medium')
          : [
              {
                priority: 'Critical',
                title: 'Add FAQ blocks',
                detail: 'Build FAQ sections with 40–60 word direct answers and FAQPage schema.',
                howTo: 'Add an FAQ section on key service pages; mark up with FAQPage JSON-LD.',
                issue: 'Weak answer readiness for local questions',
                evidence: 'FAQ blocks / FAQPage schema not strong enough for AEO.',
                impact: 'Misses featured answers and People Also Ask for local service questions.',
                recommendation: 'Add concise FAQ answers with FAQPage schema on key service pages.'
              }
            ],
      queryCards: [
        {
          query: `how much does ${service} cost in ${city}`,
          paaQuestions: [
            `How much does ${service} cost privately in ${city}?`,
            `Is ${service} covered by insurance?`,
            `What affects the price of ${service}?`
          ],
          featuredSnippet: {
            source: 'National / directory sites',
            title: `Typical ${service} pricing guidance`,
            text: 'Cost queries are usually answered by large directories or national brands with clear FAQ copy.'
          }
        },
        {
          query: `do I need a referral for ${service} in ${city}`,
          paaQuestions: [
            `Do I need a GP referral for ${service}?`,
            `Can I self-refer for ${service}?`,
            `How quickly can I book ${service} in ${city}?`
          ],
          featuredSnippet: {
            source: 'Authority guidance',
            title: 'Referral requirements',
            text: 'Referral / “do I need” queries favour crawlable FAQ answers from trusted sources.'
          }
        },
        {
          query: measuredQuery,
          paaQuestions: [
            `Who is the best ${service} near ${city}?`,
            `Which ${service} is open near me?`,
            `How do I book ${service} in ${city}?`
          ],
          mapsResults
        }
      ],
      opportunity: inPack
        ? `${name} appears in the local pack for “${measuredQuery}” — strengthen FAQ and schema so answer boxes can follow.`
        : `For “${measuredQuery}”, other local options show first — add FAQ blocks and schema so ${name} can compete in answer results.`
    },
    geoFixes: {
      title: 'GEO: Google + AI visibility',
      visualIntro:
        'ChatGPT and Gemini are measured via DataForSEO LLM Scraper (consumer UI). Claude is measured via the LLM Responses API. Re-check with the same prompts on each product if you want to compare.',
      goalLine: `Win Local Pack for “${measuredQuery}” and get cited in ChatGPT / Claude / Gemini for ${geoPromptSummary}.`,
      verifyHint: `ChatGPT / Gemini = scraped UI Top 5; Claude = API + web search. Re-check yourself: search Google for “${measuredQuery}”, then ask ChatGPT / Claude / Gemini: ${geoPromptSummary}.`,
      queryCards: [
            {
              query: measuredQuery,
              competitorsShown: mapsResults.map((r) => r.name),
              competitorsDetailed: mapsResults,
              mapsResults,
              measured: true,
              inPack,
              prospectFound: inPack
            }
          ],
      aiEngines: aiEngineChecks,
      geoChecklist,
      opportunity: (() => {
        const mentioned = [
          ...new Set(
            aiEngineChecks.filter((e) => e && e.mentioned === true).map((e) => e.label).filter(Boolean)
          )
        ];
        const missed = [
          ...new Set(
            aiEngineChecks.filter((e) => e && e.mentioned === false).map((e) => e.label).filter(Boolean)
          )
        ];
        const googleBit = inPack
          ? `${name} is in the Google Local Pack / Maps results for “${measuredQuery}”.`
          : mapsResults.length
            ? `${name} is not in the Google Maps results for “${measuredQuery}” (showing ${mapsResults.length} other listings).`
            : `${name} is not in the Google Maps results for “${measuredQuery}”.`;
        const aiBit = mentioned.length
          ? ` Mentioned in ${mentioned.join(' / ')} across measured GEO prompts.`
          : missed.length
            ? ` Not mentioned in ${missed.join(' / ')} across measured GEO prompts.`
            : ' AI engine checks were unavailable for this run.';
        return `${googleBit}${aiBit}`;
      })(),
      actions:
        toActions(geoFails, 'Medium').length > 0
          ? toActions(geoFails, 'Medium').map(({ title, detail, howTo, priority, issue, evidence, impact, recommendation }) => ({
              title,
              detail,
              howTo,
              priority,
              issue,
              evidence,
              impact,
              recommendation
            }))
          : [
              {
                title: 'Standardise brand name',
                detail: `Use “${name}” consistently everywhere — no variations.`,
                howTo: 'Align GBP, website title, schema and directories to the same legal/trading name.',
                priority: 'High',
                issue: 'Inconsistent entity naming',
                evidence: `Brand must appear consistently as “${name}” for Google and AI citation.`,
                impact: 'Google Local Pack and ChatGPT / Claude may prefer clearer competitor entities.',
                recommendation: 'Standardise the trading name across GBP, site, schema and directories.'
              },
              {
                title: 'Entity & schema signals',
                detail: 'Add Organisation / LocalBusiness schema with NAP and sameAs links.',
                howTo: 'Publish JSON-LD LocalBusiness on the homepage with address, phone, and social sameAs.',
                priority: 'High',
                issue: 'Weak entity / schema signals',
                evidence: 'LocalBusiness / sameAs signals need strengthening for GEO.',
                impact: 'Lower chance of appearing in Local Pack and being recommended by AI assistants.',
                recommendation: 'Publish LocalBusiness JSON-LD with NAP and sameAs links.'
              }
            ]
    }
  };
}
