import type { AuditFacts } from './auditFacts.js';


type Check = { id: string; label?: string; status?: string; evidence?: string; source?: string; section?: string; [k: string]: unknown };
type Result = { status: 'pass' | 'fail'; evidence: string };

const pass = (evidence: string): Result => ({ status: 'pass', evidence });
const fail = (evidence: string): Result => ({ status: 'fail', evidence });

function noProfile(f: AuditFacts): Result {
  return fail(`No Google Business Profile found for “${f.name}” in ${f.city}`);
}

function napResult(field: AuditFacts['nap']['phone'], label: string, f: AuditFacts): Result {
  if (!f.profile.found) return noProfile(f);
  if (field.status === 'match') return pass(`${label} matches: ${field.google}`);
  if (field.status === 'mismatch') return fail(`Google shows ${field.google}; website shows ${field.website}`);
  return fail(field.google && !/not found|not on maps/i.test(field.google) ? `Google shows ${field.google}; not found on the website` : `${label} is not on the Google listing`);
}

function rankResult(f: AuditFacts): Result {
  if (!f.maps.measured) return fail('Google Maps ranking could not be measured on this run');
  if (!f.profile.found) return fail(`Not in the top ${f.maps.depth} Google Maps results for “${f.maps.query}”`);
  if (f.maps.position != null) return pass(`#${f.maps.position} on Google Maps for “${f.maps.query}”`);
  return fail(`Not in the top ${f.maps.depth} Google Maps results for “${f.maps.query}”`);
}

function boolResult(found: boolean, v: boolean | null, yes: string, no: string, unknown: string, f: AuditFacts): Result {
  if (!found) return noProfile(f);
  if (v === true) return pass(yes);
  if (v === false) return fail(no);
  return fail(unknown);
}

/** Facts for the quick presence checks, keyed by check ID. */
function presenceResults(f: AuditFacts): Record<string, Result> {
  const p = f.profile;
  const reviews = p.reviewCount;
  const rate = f.reviews.replyRate;
  const d = f.gbpDetails;
  return {
    presence_website: f.site.reachable ? pass(`${f.website} loads (${f.site.pageCount} pages read)`) : fail(`${f.website} could not be loaded`),
    presence_https: f.site.https ? pass('The website uses HTTPS') : fail('The website does not load over HTTPS'),
    presence_maps_listed: p.found ? pass(`Listed on Google Maps as “${p.name}”`) : noProfile(f),
    presence_gbp_name: !p.found
      ? noProfile(f)
      : f.nap.name.status === 'match'
        ? pass(`Google name “${p.name}” matches the website`)
        : fail(`Google shows “${p.name}”; the website uses “${f.name}”`),
    presence_nap_name: !p.found
      ? noProfile(f)
      : f.nap.name.status === 'match'
        ? pass(`“${p.name}” on Google and the website`)
        : fail(`Google shows “${p.name}”; the website uses “${f.name}”`),
    presence_nap_phone: napResult(f.nap.phone, 'Phone', f),
    presence_nap_address: !p.found ? noProfile(f) : p.address ? pass(p.address) : fail('No address or service area on the Google listing'),
    presence_nap_website: napResult(f.nap.website, 'Website', f),
    presence_reviews_count: !p.found
      ? noProfile(f)
      : reviews != null && reviews > 0
        ? pass(`${reviews} Google reviews`)
        : fail('No Google reviews on the listing'),
    presence_rating: !p.found
      ? noProfile(f)
      : p.rating != null && p.rating >= 4
        ? pass(`Rated ${p.rating} from ${reviews ?? 0} reviews`)
        : fail(p.rating != null ? `Rated ${p.rating}, below 4.0` : 'No Google rating yet'),
    presence_reviews_recent: boolResult(p.found, f.reviews.recent, 'Recent Google reviews found', 'No reviews in the last 90 days', 'Recent reviews could not be confirmed', f),
    presence_review_replies: !p.found
      ? noProfile(f)
      : rate != null
        ? rate >= 50
          ? pass(`Owner replied to ${rate}% of the reviews sampled`)
          : fail(`Owner replied to ${rate}% of the reviews sampled`)
        : fail('Owner replies could not be confirmed'),
    presence_near_me: rankResult(f),
    presence_hours: boolResult(p.found, d.hasHours, 'Opening hours on the Google listing', 'No opening hours on the Google listing', 'Opening hours could not be confirmed', f),
    presence_categories: !p.found
      ? noProfile(f)
      : p.category
        ? d.hasSecondaryCategories === true
          ? pass(`Primary category “${p.category}” plus secondary categories`)
          : fail(`Primary category “${p.category}”, but no secondary categories`)
        : fail('No category on the Google listing'),
    presence_photos: boolResult(p.found, d.photosPresent, 'Photos on the Google listing', 'No photos on the Google listing', 'Photos could not be confirmed', f),
    presence_services: boolResult(p.found, d.hasServices, 'Services listed on the Google listing', 'No services listed on the Google listing', 'Services could not be confirmed', f),
    presence_description: boolResult(p.found, d.hasDescription, 'Business description on the Google listing', 'No business description on the Google listing', 'Description could not be confirmed', f),
    presence_posts: !p.found
      ? noProfile(f)
      : d.hasRecentPosts === true
        ? pass('Google Posts published in the last 60 days')
        : d.postsTotal != null && d.postsTotal > 0
          ? fail(`${d.postsTotal} Google Post(s), none in the last 60 days`)
          : d.postsTotal === 0
            ? fail('No Google Posts on the listing')
            : fail('Google Posts could not be confirmed'),
    presence_maps_url: !p.found ? noProfile(f) : p.mapsUrl ? pass(p.mapsUrl) : fail('No public Maps link for the listing')
  };
}

/** Facts for the full-audit Google Business Profile checks (gbp_1 … gbp_19). */
function gbpResults(f: AuditFacts): Record<string, Result> {
  const r = presenceResults(f);
  const p = f.profile;
  return {
    gbp_1: r.presence_maps_listed,
    gbp_2: r.presence_gbp_name,
    gbp_3: r.presence_nap_phone,
    gbp_4: r.presence_nap_website,
    gbp_5: r.presence_nap_address,
    gbp_6: !p.found ? noProfile(f) : p.category ? pass(`Primary category: ${p.category}`) : fail('No primary category'),
    gbp_7: !p.found
      ? noProfile(f)
      : f.gbpDetails.hasSecondaryCategories === true
        ? pass('Secondary categories set')
        : fail('No secondary categories'),
    gbp_8: r.presence_reviews_count,
    gbp_9: r.presence_rating,
    gbp_10: r.presence_reviews_recent,
    gbp_11: r.presence_review_replies,
    gbp_13: r.presence_photos,
    gbp_14: r.presence_services,
    gbp_15: r.presence_description,
    gbp_16: r.presence_hours,
    gbp_18: r.presence_posts,
    gbp_19: f.profile.found && f.maps.position != null && f.maps.position <= 3
      ? pass(`In the local 3-pack at #${f.maps.position} for “${f.maps.query}”`)
      : fail(
          f.profile.found && f.maps.position != null
            ? `#${f.maps.position} for “${f.maps.query}”, outside the 3-pack`
            : rankResult(f).evidence
        )
  };
}

function apply(checks: Check[] | undefined, results: Record<string, Result>) {
  for (const c of checks || []) {
    const r = results[c.id];
    if (!r) continue;
    c.status = r.status;
    c.evidence = r.evidence;
  }
}

/** Only location checks for the audited town (or its postcode) stay; other towns never appear in the report. */
function keepCanonicalLocations(audit: any, f: AuditFacts) {
  const checks: Check[] = audit?.checklist?.checks || [];
  const squash = (v: unknown) => String(v || '').toLowerCase().replace(/\s+/g, '');
  // The audited town, its postcode, and the other areas the business said it covers.
  const allowed = new Set([f.city, ...f.otherAreas, audit?.business?.postcode].map(squash).filter(Boolean));
  audit.checklist.checks = checks.filter((c) => {
    const id = String(c.id || '');
    if (!id.startsWith('loc_') || id.startsWith('loc_qual_')) return true;
    const terms = (Array.isArray(c.matchTerms) ? c.matchTerms : []).map(squash);
    return terms.some((t: string) => allowed.has(t));
  });
  if (Array.isArray(audit.checklist.locations)) {
    audit.checklist.locations = audit.checklist.locations.filter((l: unknown) => allowed.has(squash(l)));
  }
}

/** Measured checks never stay "unknown": they show No with the reason. Operator-only rows are left alone. */
function unknownToNo(checks: Check[] | undefined) {
  for (const c of checks || []) {
    if (c.source === 'operator') continue;
    if (c.status === 'pass' || c.status === 'fail') continue;
    c.status = 'fail';
    c.evidence = String(c.evidence || '').trim() || 'Could not be confirmed on this run';
  }
}

export function syncChecksWithFacts(audit: any, facts: AuditFacts) {
  apply(audit?.presence?.checks, presenceResults(facts));
  apply(audit?.checklist?.checks, { ...presenceResults(facts), ...gbpResults(facts) });
  if (audit?.checklist?.checks) keepCanonicalLocations(audit, facts);
  unknownToNo(audit?.presence?.checks);
  unknownToNo(audit?.checklist?.checks);
  // The quick check labelled this row in the negative ("Missing categories"), which reads backwards as a pass.
  for (const c of audit?.presence?.checks || []) {
    if (c.id === 'presence_categories') c.label = 'Categories set on Google Business Profile';
  }
}

type Page = { url?: string; title?: string; h1s?: string[]; links?: Array<{ href?: string; text?: string }> };

function keyWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w))
    .map((w) => w.replace(/(es|s)$/, ''));
}

const GENERIC_WORDS = new Set([
  'and', 'the', 'for', 'with', 'services', 'service', 'installers', 'installer', 'installation', 'suppliers',
  'supplier', 'specialists', 'specialist', 'contractors', 'contractor', 'company', 'shop', 'experts', 'expert',
  'local', 'professional', 'repairs', 'repair'
]);

/** Only phrases that share a word with what the business sells (category, homepage title, heading). */
function relevantServices(services: string[], audit: any, home: Page | undefined): string[] {
  const vocabulary = new Set(
    keyWords(
      `${audit?.business?.serviceLabel || ''} ${audit?.business?.service || ''} ${home?.title || ''} ${(home?.h1s || []).join(' ')}`
    )
  );
  const town = new Set(keyWords(audit?.business?.city || ''));
  const brand = new Set(keyWords(audit?.business?.businessName || ''));
  return services.filter((s) =>
    keyWords(s).some((w) => vocabulary.has(w) && !town.has(w) && !brand.has(w))
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || '');
  }
}

/** Services read from the website, keeping only real offerings (not "customer care" or "ask an expert"). */
export function businessServices(services: string[], audit: any, pages: Page[]): string[] {
  return relevantServices(
    services.map((s) => String(s || '').trim()).filter(Boolean),
    audit,
    Array.isArray(pages) ? pages[0] : undefined
  );
}

/** One "location page exists?" row for each other area the business said it covers. */
export function addAreaChecks(audit: any, areas: string[]) {
  const checks: Check[] = audit?.checklist?.checks;
  if (!Array.isArray(checks)) return;
  const isLoc = (c: Check) => /^loc_\d/.test(String(c.id));
  const covered = new Set(
    checks.filter(isLoc).flatMap((c) => (Array.isArray(c.matchTerms) ? c.matchTerms : [])).map((t) => String(t).toLowerCase().trim())
  );
  let next = checks.filter(isLoc).reduce((n, c) => Math.max(n, Number(String(c.id).slice(4)) || 0), 0);
  const added: Check[] = [];
  for (const raw of areas || []) {
    const area = String(raw || '').trim();
    if (!area || covered.has(area.toLowerCase())) continue;
    covered.add(area.toLowerCase());
    next += 1;
    added.push({
      id: `loc_${next}`,
      section: 'local_seo',
      label: `${area} location page exists?`,
      source: 'crawl',
      status: 'unknown',
      evidence: '',
      notes: '',
      sectionTitle: '5. Local SEO Audit',
      matchTerms: [area.toLowerCase()]
    });
  }
  if (!added.length) return;
  // New rows go straight after the existing location rows, before the location quality checks.
  let at = -1;
  checks.forEach((c, i) => {
    if (isLoc(c)) at = i;
  });
  if (at < 0) at = checks.findIndex((c) => String(c.id).startsWith('loc_qual_')) - 1;
  checks.splice(at < -1 ? checks.length : at + 1, 0, ...added);
  const locations: string[] = Array.isArray(audit.checklist.locations) ? audit.checklist.locations : [];
  audit.checklist.locations = [...locations, ...added.map((c) => String(c.label).replace(/ location page exists\?$/, ''))];
}

export function evaluatePageChecks(
  audit: any,
  pages: Page[],
  services: string[],
  city: string,
  siteText = '',
  opts: { trustedServices?: boolean } = {}
) {
  const checks: Check[] = audit?.checklist?.checks || [];
  const list = Array.isArray(pages) ? pages : [];
  const home = list[0];
  const homePath = home?.url ? pathOf(home.url) : '/';
  const urls = new Set<string>();
  for (const p of list) {
    if (p.url) urls.add(p.url);
    for (const l of p.links || []) if (l.href && /^https?:/i.test(l.href)) urls.add(l.href.split('#')[0]);
  }
  // The business name is removed first, so "/about-leeds-windows" is not a "Windows" page.
  const brand = String(audit?.business?.businessName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const withoutBrand = (text: string) => {
    const t = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    return brand ? t.split(brand).join(' ') : t;
  };
  const ownPage = (words: string[]) => {
    if (!words.length) return null;
    const has = (text: string) => {
      const t = keyWords(withoutBrand(text));
      return words.every((w) => t.includes(w));
    };
    const page = list.find((p) => p !== home && (has(pathOf(p.url || '')) || has(p.title || '') || has((p.h1s || [])[0] || '')));
    if (page?.url) return pathOf(page.url);
    for (const u of urls) {
      const pth = pathOf(u);
      if (pth && pth !== homePath && pth !== '/' && has(pth)) return pth;
    }
    return null;
  };
  const corpus = String(siteText || '').toLowerCase();

  // Services the owner named are used as given; crawled ones are filtered to real offerings.
  const cleaned = services.map((s) => String(s || '').trim()).filter(Boolean);
  const relevant = opts.trustedServices ? cleaned : relevantServices(cleaned, audit, home);
  // Without services from the site, the category is split into its offerings ("Windows & Doors" -> Windows, Doors).
  const category = String(audit?.business?.serviceLabel || audit?.business?.service || '');
  const fromCategory = category
    .split(/\s*(?:&|\band\b|,|\/|\+)\s*/i)
    .map((p) => p.replace(/\b(installers?|installation|suppliers?|specialists?|contractors?|services?|company|experts?)\b/gi, '').trim())
    .filter((p) => keyWords(p).length);
  const names = (relevant.length ? relevant : fromCategory.length ? fromCategory : [category])
    .map((s) => s.trim())
    .filter(Boolean);
  const svcRows = checks.filter((c) => c.section === 'service_pages');
  svcRows.forEach((c, i) => {
    const name = names[i];
    if (!name) return;
    c.label = `${name} page`;
    c.matchTerms = [name.toLowerCase()];
    const found = ownPage(keyWords(name));
    c.status = found ? 'pass' : 'fail';
    c.evidence = found
      ? `Own page: ${found}`
      : corpus && corpus.includes(name.toLowerCase())
        ? `“${name}” is mentioned, but has no page of its own`
        : `No page about “${name}”`;
  });
  const keep = new Set(svcRows.slice(0, names.length).map((c) => c.id));
  audit.checklist.checks = checks.filter((c) => c.section !== 'service_pages' || keep.has(c.id));
  audit.checklist.servicePages = names.slice(0, svcRows.length);

  // Each location row is tested against its own town (the audited city or one of the other areas).
  const homeWords = keyWords(`${home?.title || ''} ${(home?.h1s || [])[0] || ''}`);
  for (const c of audit.checklist.checks as Check[]) {
    if (!/^loc_\d/.test(String(c.id))) continue;
    const term = Array.isArray(c.matchTerms) && c.matchTerms[0] ? String(c.matchTerms[0]) : city;
    const town = String(c.label || '').replace(/ location page exists\?$/, '') || term;
    const townWords = keyWords(term);
    const page = ownPage(townWords);
    const homeNames = townWords.length && homeWords.some((w) => townWords.includes(w));
    c.status = page || homeNames ? 'pass' : 'fail';
    c.evidence = page
      ? `Page for ${town}: ${page}`
      : homeNames
        ? `The homepage title or main heading names ${town}`
        : `No page names ${town} in its title, main heading or URL`;
  }
}

/** The "Content answers" checks use the real customer questions of this audit, not a trade template. */
export function relabelQuestionChecks(audit: any, questions: string[]) {
  const checks: Check[] = audit?.checklist?.checks || [];
  const rows = checks.filter((c) => String(c.id).startsWith('ai_q_'));
  rows.forEach((c, i) => {
    const q = questions[i];
    if (q) {
      c.label = `Content answers: ${q}`;
      c.question = q;
    }
  });
  const used = new Set(rows.slice(0, questions.length).map((c) => c.id));
  audit.checklist.checks = checks.filter((c) => !String(c.id).startsWith('ai_q_') || used.has(c.id));
  if (questions.length) audit.checklist.aiQuestions = questions.slice(0, rows.length);
}
