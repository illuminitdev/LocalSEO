/**
 * Deterministic Local SEO NAP / brand inconsistency cards from GBP + crawl + business inputs.
 */
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
    const match = addrGbp && addrBiz && (norm(addrGbp).includes(norm(addrBiz)) || norm(addrBiz).includes(norm(addrGbp)));
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
  const city = audit?.business?.city || 'the local area';
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
    rows.map((c, i) => ({
      priority: i === 0 ? 'Critical' : i === 1 ? 'High' : defaultPri,
      title: c.label,
      detail: c.evidence || 'Failed automated check',
      howTo: `Review and fix “${c.label}” on the live site / Google Business Profile, then re-check.`
    }));

  const mapsResults = (audit?.gbpLookup?.localRank?.topResults || [])
    .filter((r) => r?.name && !r.isProspect)
    .slice(0, 3)
    .map((r) => ({
      position: r.position,
      name: r.name,
      rating: r.rating,
      reviewCount: r.reviewCount
    }));
  const inPack = typeof audit?.gbpLookup?.localRank?.position === 'number';
  const nearQuery = audit?.gbpLookup?.localRank?.query || `${service} near ${city}`;
  const bestNearQuery = `best ${service} near ${city}`;
  const nearMeQuery = `${service} near me`;

  return {
    localSeoFixes: {
      title: 'Local SEO: The Fixes',
      takeaway: `Standardise Name, Address and Phone across Google and the website so ${name} builds trust in ${city}.`,
      inconsistencies: buildLocalSeoInconsistencies(audit),
      actions:
        toActions(localFails, 'Medium').length > 0
          ? toActions(localFails, 'Medium')
          : [
              {
                priority: 'High',
                title: 'Complete Google Business Profile',
                detail: 'Ensure categories, hours, photos and NAP match the website.',
                howTo: 'Open Google Business Profile → Info → align name, address, phone, website and hours.'
              }
            ]
    },
    aeoFixes: {
      title: 'AEO: Answer Engine Optimisation',
      visualIntro: `Question-based searches for ${service} in ${city} — how ready the site is for featured answers and People Also Ask.`,
      priorities:
        toActions(aeoFails, 'Medium').length > 0
          ? toActions(aeoFails, 'Medium')
          : [
              {
                priority: 'Critical',
                title: 'Add FAQ blocks',
                detail: 'Build FAQ sections with 40–60 word direct answers and FAQPage schema.',
                howTo: 'Add an FAQ section on key service pages; mark up with FAQPage JSON-LD.'
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
          query: nearQuery,
          paaQuestions: [
            `Who is the best ${service} near ${city}?`,
            `Which ${service} is open near me?`,
            `How do I book ${service} in ${city}?`
          ],
          mapsResults
        }
      ],
      opportunity: inPack
        ? `${name} appears in the local pack for “${nearQuery}” — strengthen FAQ and schema so answer boxes can follow.`
        : `For “${nearQuery}”, other local options show first — add FAQ blocks and schema so ${name} can compete in answer results.`
    },
    geoFixes: {
      title: 'GEO: AI Search Visibility',
      visualIntro: inPack
        ? `Local pack for “${nearQuery}” — ${name} is listed; competitors shown are other nearby results.`
        : `Local pack for “${nearQuery}” — ${name} is not in the top results; competitors below are who Google shows instead.`,
      goalLine: `Win “best ${service} near me” / “${service} near ${city}” style searches for ${name}.`,
      queryCards: [
        {
          query: nearMeQuery,
          competitorsShown: mapsResults.map((r) => r.name),
          competitorsDetailed: mapsResults,
          aiSummary: mapsResults.length
            ? `For “${nearMeQuery}”-style searches near ${city}, Google / AI answers commonly surface these nearby providers.`
            : `For “${nearMeQuery}”-style searches, answers favour providers with stronger Maps and review signals.`
        },
        {
          query: bestNearQuery,
          competitorsShown: mapsResults.map((r) => r.name),
          competitorsDetailed: mapsResults,
          aiSummary: mapsResults.length
            ? `“${bestNearQuery}” results typically reuse the same strong local names already visible in Maps.`
            : `“Best ${service} near me” answers favour clinics with consistent citations, reviews and schema.`
        }
      ],
      opportunity: inPack
        ? `${name} is in the Maps pack for the measured query — keep entity signals strong so AI answers keep citing you.`
        : `${name} is not listed in the measured Maps pack for “${nearQuery}”; strengthen GBP, reviews and entity signals to appear.`,
      actions:
        toActions(geoFails, 'Medium').length > 0
          ? toActions(geoFails, 'Medium').map(({ title, detail, howTo }) => ({ title, detail, howTo }))
          : [
              {
                title: 'Standardise brand name',
                detail: `Use “${name}” consistently everywhere — no variations.`,
                howTo: 'Align GBP, website title, schema and directories to the same legal/trading name.'
              },
              {
                title: 'Entity & schema signals',
                detail: 'Add Organisation / LocalBusiness schema with NAP and sameAs links.',
                howTo: 'Publish JSON-LD LocalBusiness on the homepage with address, phone, and social sameAs.'
              }
            ]
    }
  };
}
