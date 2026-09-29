import { buildLocalSeoCoreChecklist } from './localSeoCoreChecklist.js';
import {
  auditContext,
  failedChecks,
  inPackFromAudit,
  mapsResultsFromAudit,
  measuredQueryFromAudit,
  toActions
} from './deckShared.js';

const COUNTRY_SUFFIX_ALIASES = [
  {
    canon: 'unitedkingdom',
    keys: [
      'united kingdom of great britain and northern ireland',
      'united kingdom',
      'great britain',
      'u k',
      'uk',
      'g b',
      'gb'
    ]
  },
  {
    canon: 'unitedstates',
    keys: ['united states of america', 'united states', 'u s a', 'u s', 'usa', 'us']
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
    return (
      da.endsWith(db.slice(-8)) ||
      db.endsWith(da.slice(-8)) ||
      da.endsWith(db.slice(-10)) ||
      db.endsWith(da.slice(-10))
    );
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
      title: match
        ? 'Phone Number Consistent'
        : websitePhone
          ? 'Phone Number Mismatch'
          : 'Phone Listed on Google',
      gbpShows: phoneGbp || 'Not found on Maps',
      websiteShows: websitePhone || 'Not found on crawl',
      status: match ? 'match' : phoneGbp && websitePhone ? 'mismatch' : 'unknown',
      tone: match || (phoneGbp && !websitePhone) ? 'green' : 'amber'
    });
  }

  const nameGbp = g.gbpName || '';
  const nameBiz = b.businessName || '';
  if (nameGbp || nameBiz) {
    const match =
      nameGbp &&
      nameBiz &&
      (norm(nameGbp).includes(norm(nameBiz)) || norm(nameBiz).includes(norm(nameGbp)));
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

export function buildLocalSeoFixes(audit) {
  const { name, city, service } = auditContext(audit);
  const failed = failedChecks(audit);
  const localFails = failed
    .filter((c) =>
      ['gbp', 'reviews', 'citations', 'local_seo', 'maps_competitors', 'website_basic'].includes(
        c.section
      )
    )
    .slice(0, 4);
  const mapsResults = mapsResultsFromAudit(audit);
  const inPack = inPackFromAudit(audit);
  const measuredQuery = measuredQueryFromAudit(audit, service, city);
  const actions = toActions(localFails, 'Medium');

  return {
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
      actions.length > 0
        ? actions
        : [
            {
              priority: 'High',
              title: 'Complete Google Business Profile',
              detail: 'Ensure categories, hours, photos and NAP match the website.',
              howTo:
                'Open Google Business Profile → Info → align name, address, phone, website and hours.',
              issue: 'Incomplete or inconsistent Google Business Profile',
              evidence: 'GBP fields or NAP alignment need strengthening for local trust.',
              impact: 'Weak GBP signals reduce Local Pack and Maps visibility.',
              recommendation:
                'Complete categories, hours, photos and NAP so Google and the website match.'
            }
          ]
  };
}
