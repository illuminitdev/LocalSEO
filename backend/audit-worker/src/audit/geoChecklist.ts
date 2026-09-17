export type GeoCheckStatus = 'yes' | 'no' | 'unknown';

export type GeoChecklistItem = {
  id: string;
  label: string;
  status: GeoCheckStatus;
  evidence: string;
};

export type GeoChecklistGroup = {
  id: string;
  title: string;
  items: GeoChecklistItem[];
};

export type GeoChecklist = {
  groups: GeoChecklistGroup[];
  builtAt?: string;
};

type AiEngine = {
  engine?: string;
  label?: string;
  mentioned?: boolean | null;
  answerExcerpt?: string;
  skipped?: boolean;
  prompt?: string;
};

type LocalRank = {
  query?: string;
  position?: number | null;
  topResults?: Array<{ name?: string; isProspect?: boolean; position?: number }>;
};

function hostOf(u: string): string {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(u || '')
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();
  }
}

function extractHosts(text: string): string[] {
  const out = new Set<string>();
  const re = /https?:\/\/[^\s)\]>"']+/gi;
  const matches = String(text || '').match(re) || [];
  for (const m of matches) {
    const h = hostOf(m);
    if (h) out.add(h);
  }
  // bare domains
  const bare = String(text || '').match(/\b(?:[a-z0-9-]+\.)+(?:co\.uk|com|uk|org|net)\b/gi) || [];
  for (const m of bare) out.add(m.replace(/^www\./i, '').toLowerCase());
  return [...out];
}

function recommendedLikely(text: string, mentioned: boolean): boolean {
  if (!mentioned) return false;
  return /\b(recommend|recommended|top pick|best (choice|option)|highly rated|go with|consider)\b/i.test(
    text || ''
  );
}

function statusFromBool(v: boolean | null | undefined, yesEv: string, noEv: string, unkEv: string) {
  if (v === true) return { status: 'yes' as const, evidence: yesEv };
  if (v === false) return { status: 'no' as const, evidence: noEv };
  return { status: 'unknown' as const, evidence: unkEv };
}

export const GEO_CHECKLIST_DEFS: Array<{
  groupId: string;
  groupTitle: string;
  items: Array<{ id: string; label: string }>;
}> = [
  {
    groupId: 'ai_visibility',
    groupTitle: 'AI Visibility',
    items: [
      { id: 'geo_ai_1', label: 'Business mentioned in AI answers' },
      { id: 'geo_ai_2', label: 'Business recommended for local searches' },
      { id: 'geo_ai_3', label: 'Service + location visibility' },
      { id: 'geo_ai_4', label: '"Best" query visibility' },
      { id: 'geo_ai_5', label: '"Near me" query visibility' },
      { id: 'geo_ai_6', label: 'Problem/solution query visibility' },
      { id: 'geo_ai_7', label: 'Competitor mentions in AI answers' },
      { id: 'geo_ai_8', label: 'AI recommendation position/order' }
    ]
  },
  {
    groupId: 'entity_strength',
    groupTitle: 'Entity Strength',
    items: [
      { id: 'geo_ent_1', label: 'Business entity correctly identified' },
      { id: 'geo_ent_2', label: 'Business category correctly identified' },
      { id: 'geo_ent_3', label: 'Location correctly identified' },
      { id: 'geo_ent_4', label: 'Services correctly identified' },
      { id: 'geo_ent_5', label: 'Website correctly associated' },
      { id: 'geo_ent_6', label: 'Business information consistency' },
      { id: 'geo_ent_7', label: 'SameAs / entity connections' }
    ]
  },
  {
    groupId: 'external_ai_signals',
    groupTitle: 'External AI Signals',
    items: [
      { id: 'geo_ext_1', label: 'Review-platform presence' },
      { id: 'geo_ext_2', label: 'Directory presence' },
      { id: 'geo_ext_3', label: 'Industry mentions' },
      { id: 'geo_ext_4', label: 'Local publication mentions' },
      { id: 'geo_ext_5', label: 'Local backlinks' },
      { id: 'geo_ext_6', label: 'Brand mentions' }
    ]
  },
  {
    groupId: 'ai_citation',
    groupTitle: 'AI Citation / Source Monitoring',
    items: [
      { id: 'geo_cite_1', label: 'Sources cited by AI' },
      { id: 'geo_cite_2', label: 'Website cited' },
      { id: 'geo_cite_3', label: 'GBP / business data referenced' },
      { id: 'geo_cite_4', label: 'Third-party sources referenced' },
      { id: 'geo_cite_5', label: 'Incorrect information detected' },
      { id: 'geo_cite_6', label: 'Missing information detected' }
    ]
  }
];

/** Schema rows for checklistSchema (section ai_seo). */
export function geoChecklistSchemaRows(): Array<{ id: string; label: string; groupTitle: string }> {
  const rows: Array<{ id: string; label: string; groupTitle: string }> = [];
  for (const g of GEO_CHECKLIST_DEFS) {
    for (const item of g.items) {
      rows.push({ id: item.id, label: item.label, groupTitle: `GEO — ${g.groupTitle}` });
    }
  }
  return rows;
}

export function buildGeoChecklist(opts: {
  businessName?: string;
  website?: string;
  service?: string;
  city?: string;
  localRank?: LocalRank | null;
  aiEngines?: AiEngine[] | null;
  crawl?: {
    hasLocalBusinessSchema?: boolean;
    hasPersonSchema?: boolean;
    schemaTypes?: string[];
    llmsTxtFound?: boolean;
    spaHeuristic?: { likelySpa?: boolean };
    corpusText?: string;
  } | null;
  gbp?: {
    listedOnMaps?: boolean;
    gbpName?: string;
    address?: string;
    websiteOnGbp?: string;
    primaryTypeDisplayName?: string;
  } | null;
  napPhonePass?: boolean | null;
  napAddressPass?: boolean | null;
}): GeoChecklist {
  const name = String(opts.businessName || '').trim();
  const city = String(opts.city || '').trim();
  const service = String(opts.service || '').trim();
  const websiteHost = hostOf(opts.website || '');
  const engines = Array.isArray(opts.aiEngines) ? opts.aiEngines : [];
  const measured = engines.filter((e) => !e.skipped && e.answerExcerpt);
  const anyMentioned = engines.some((e) => e.mentioned === true);
  const anyMeasured = engines.some((e) => !e.skipped && e.mentioned != null);
  const combinedText = measured.map((e) => e.answerExcerpt || '').join('\n');
  const recommended = measured.some((e) => recommendedLikely(e.answerExcerpt || '', e.mentioned === true));
  const query = String(opts.localRank?.query || measured[0]?.prompt || '').trim();
  const inPack = typeof opts.localRank?.position === 'number';
  const isBestQuery = /\bbest\b/i.test(query);
  const isNearQuery = /\bnear\b|\bnear me\b/i.test(query);
  const competitors = (opts.localRank?.topResults || [])
    .filter((r) => r?.name && !r.isProspect)
    .map((r) => String(r.name));
  const competitorInAi =
    combinedText &&
    competitors.some((c) => {
      const n = c.toLowerCase();
      return n.length >= 4 && combinedText.toLowerCase().includes(n);
    });
  const citedHosts = extractHosts(combinedText);
  const websiteCited = Boolean(websiteHost && citedHosts.some((h) => h.includes(websiteHost) || websiteHost.includes(h)));
  const gbpReferenced = /google (maps|business)|maps\.google|gbp|business profile/i.test(combinedText);
  const thirdParty = citedHosts.some((h) => h && h !== websiteHost);
  const corpus = String(opts.crawl?.corpusText || '');
  const hasEntitySchema = Boolean(opts.crawl?.hasLocalBusinessSchema || opts.crawl?.hasPersonSchema);
  const hasAbout = /about|team|our (story|mission)|founded|years experience/i.test(corpus);
  const hasSameAs = /"sameAs"|sameas/i.test(corpus) || /linkedin\.com|facebook\.com|instagram\.com/i.test(corpus);
  const reviewPlatform = /tripadvisor|trustpilot|yelp|checkatrade|rated people|google reviews|reviews\.io/i.test(
    corpus
  );
  const directory = /yell\.com|thomsonlocal|touchlocal|192\.com|hotfrog|cylex|bing places/i.test(corpus);
  const industryMention = /association|accredited|member of|certified|bpca|gas safe|niceic/i.test(corpus);
  const problemSolution =
    /how to|what (causes|to do)|signs of|get rid of|problem|solution|faq/i.test(corpus) &&
    (opts.crawl as any)?.hasFaq !== false;

  const item = (id: string, label: string, status: GeoCheckStatus, evidence: string): GeoChecklistItem => ({
    id,
    label,
    status,
    evidence
  });

  const aiVis: GeoChecklistItem[] = [
    (() => {
      const s = statusFromBool(
        anyMeasured ? anyMentioned : null,
        `Mentioned in ${engines.filter((e) => e.mentioned).map((e) => e.label || e.engine).join(' / ') || 'AI'}`,
        'Not mentioned in measured ChatGPT / Claude answers',
        'AI answers not measured yet'
      );
      return item('geo_ai_1', 'Business mentioned in AI answers', s.status, s.evidence);
    })(),
    (() => {
      const s = statusFromBool(
        anyMeasured ? recommended : null,
        'AI answer uses recommendation language with the brand',
        'No clear recommendation language with the brand in measured answers',
        'AI answers not measured yet'
      );
      return item('geo_ai_2', 'Business recommended for local searches', s.status, s.evidence);
    })(),
    (() => {
      const hasServiceLoc = Boolean(service && city && (anyMentioned || inPack));
      const s = statusFromBool(
        service && city ? hasServiceLoc : null,
        inPack || anyMentioned
          ? `Service/location signals present for “${query || `${service} near ${city}`}”`
          : 'Service + location not visible in measured AI / Maps',
        'Not visible for service + location in measured AI / Maps',
        'Service or location not provided'
      );
      return item('geo_ai_3', 'Service + location visibility', s.status, s.evidence);
    })(),
    (() => {
      if (!isBestQuery && !/best/i.test(query)) {
        return item(
          'geo_ai_4',
          '"Best" query visibility',
          'unknown',
          'Measured query is not a “best …” query'
        );
      }
      const s = statusFromBool(
        anyMentioned || inPack,
        anyMentioned || inPack ? 'Visible for measured “best” style query' : 'Not visible',
        'Not visible for measured “best” style query',
        'Not measured'
      );
      return item('geo_ai_4', '"Best" query visibility', s.status, s.evidence);
    })(),
    (() => {
      if (!isNearQuery) {
        return item(
          'geo_ai_5',
          '"Near me" query visibility',
          inPack ? 'yes' : anyMeasured ? (anyMentioned ? 'yes' : 'no') : 'unknown',
          inPack
            ? `In Local Pack for “${query}”`
            : anyMeasured
              ? anyMentioned
                ? 'Mentioned for near-style prompt'
                : 'Not mentioned for near-style prompt'
              : 'Near-me visibility not measured'
        );
      }
      const s = statusFromBool(
        inPack || anyMentioned,
        inPack ? `Local Pack #${opts.localRank?.position}` : 'Mentioned in AI for near-me style prompt',
        'Not in Local Pack / AI for near-me style query',
        'Not measured'
      );
      return item('geo_ai_5', '"Near me" query visibility', s.status, s.evidence);
    })(),
    item(
      'geo_ai_6',
      'Problem/solution query visibility',
      /how to|faq|what (causes|to do)|get rid of/i.test(corpus) ? 'yes' : 'unknown',
      /how to|faq|what (causes|to do)|get rid of/i.test(corpus)
        ? 'Problem/solution or FAQ language found on site'
        : 'Not assessed against a dedicated problem/solution AI prompt'
    ),
    (() => {
      const s = statusFromBool(
        anyMeasured && competitors.length ? Boolean(competitorInAi) : null,
        'Competitors from Local Pack also appear in AI answers',
        'Local Pack competitors not detected in AI answer text',
        competitors.length ? 'AI answers not measured yet' : 'No Local Pack competitors to compare'
      );
      return item('geo_ai_7', 'Competitor mentions in AI answers', s.status, s.evidence);
    })(),
    item(
      'geo_ai_8',
      'AI recommendation position/order',
      anyMentioned ? 'unknown' : anyMeasured ? 'no' : 'unknown',
      anyMentioned
        ? 'Brand mentioned, but AI answers do not provide a stable ranked order'
        : anyMeasured
          ? 'Brand not mentioned — no recommendation position'
          : 'AI answers not measured yet'
    )
  ];

  const napOk =
    opts.napPhonePass === true || opts.napAddressPass === true
      ? true
      : opts.napPhonePass === false && opts.napAddressPass === false
        ? false
        : opts.gbp?.listedOnMaps && opts.gbp?.gbpName
          ? true
          : null;

  const entity: GeoChecklistItem[] = [
    item(
      'geo_ent_1',
      'Business entity correctly identified',
      hasEntitySchema || opts.gbp?.listedOnMaps ? 'yes' : 'no',
      hasEntitySchema
        ? `Schema: ${(opts.crawl?.schemaTypes || []).slice(0, 6).join(', ') || 'LocalBusiness/Person'}`
        : opts.gbp?.listedOnMaps
          ? `GBP listing: ${opts.gbp.gbpName || name}`
          : 'No LocalBusiness/Person schema and no Maps listing match'
    ),
    item(
      'geo_ent_2',
      'Business category correctly identified',
      opts.gbp?.primaryTypeDisplayName || service ? 'yes' : 'unknown',
      opts.gbp?.primaryTypeDisplayName
        ? `GBP category: ${opts.gbp.primaryTypeDisplayName}`
        : service
          ? `Service label: ${service}`
          : 'Category not confirmed'
    ),
    item(
      'geo_ent_3',
      'Location correctly identified',
      opts.gbp?.address || city ? 'yes' : 'unknown',
      opts.gbp?.address || city || 'Location not confirmed'
    ),
    item(
      'geo_ent_4',
      'Services correctly identified',
      service && corpus.toLowerCase().includes(service.toLowerCase().slice(0, 12))
        ? 'yes'
        : service
          ? 'unknown'
          : 'no',
      service ? `Looking for “${service}” on crawl` : 'No primary service provided'
    ),
    item(
      'geo_ent_5',
      'Website correctly associated',
      opts.gbp?.websiteOnGbp || opts.website ? 'yes' : 'no',
      opts.gbp?.websiteOnGbp
        ? `Website on GBP: ${opts.gbp.websiteOnGbp}`
        : opts.website
          ? `Intake website: ${opts.website}`
          : 'No website association found'
    ),
    (() => {
      const s = statusFromBool(
        napOk,
        'NAP / GBP signals look consistent enough for entity trust',
        'NAP inconsistencies weaken entity trust',
        'NAP consistency not fully assessed'
      );
      return item('geo_ent_6', 'Business information consistency', s.status, s.evidence);
    })(),
    item(
      'geo_ent_7',
      'SameAs / entity connections',
      hasSameAs ? 'yes' : 'no',
      hasSameAs ? 'sameAs or social entity links detected on site' : 'No sameAs / social entity links detected'
    )
  ];

  const external: GeoChecklistItem[] = [
    item(
      'geo_ext_1',
      'Review-platform presence',
      reviewPlatform ? 'yes' : 'unknown',
      reviewPlatform ? 'Review-platform references found on site' : 'Not confirmed from crawl'
    ),
    item(
      'geo_ext_2',
      'Directory presence',
      directory ? 'yes' : 'unknown',
      directory ? 'Directory references found on site' : 'Not confirmed from crawl'
    ),
    item(
      'geo_ext_3',
      'Industry mentions',
      industryMention ? 'yes' : 'unknown',
      industryMention ? 'Accreditation / industry language found' : 'Not confirmed from crawl'
    ),
    item(
      'geo_ext_4',
      'Local publication mentions',
      'unknown',
      'Local publication mentions not measured automatically'
    ),
    item('geo_ext_5', 'Local backlinks', 'unknown', 'Local backlinks not measured in this audit'),
    item(
      'geo_ext_6',
      'Brand mentions',
      anyMentioned || (name && corpus.toLowerCase().includes(name.toLowerCase())) ? 'yes' : 'unknown',
      anyMentioned
        ? 'Brand mentioned in measured AI answers'
        : name && corpus.toLowerCase().includes(name.toLowerCase())
          ? 'Brand name appears on crawled pages'
          : 'Brand mention strength not confirmed'
    )
  ];

  const citation: GeoChecklistItem[] = [
    item(
      'geo_cite_1',
      'Sources cited by AI',
      anyMeasured ? (citedHosts.length ? 'yes' : 'no') : 'unknown',
      citedHosts.length
        ? `Cited hosts: ${citedHosts.slice(0, 5).join(', ')}`
        : anyMeasured
          ? 'No clear source URLs in measured AI answers'
          : 'AI answers not measured yet'
    ),
    item(
      'geo_cite_2',
      'Website cited',
      anyMeasured ? (websiteCited ? 'yes' : 'no') : 'unknown',
      websiteCited
        ? `Website host cited: ${websiteHost}`
        : anyMeasured
          ? 'Website host not found in AI citations'
          : 'AI answers not measured yet'
    ),
    item(
      'geo_cite_3',
      'GBP / business data referenced',
      anyMeasured ? (gbpReferenced || inPack ? 'yes' : 'no') : inPack ? 'yes' : 'unknown',
      gbpReferenced
        ? 'AI answer references Google Maps / Business Profile style data'
        : inPack
          ? 'Business appears in measured Local Pack (GBP/Maps signal)'
          : anyMeasured
            ? 'No GBP/Maps reference detected in AI answers'
            : 'Not measured'
    ),
    item(
      'geo_cite_4',
      'Third-party sources referenced',
      anyMeasured ? (thirdParty ? 'yes' : 'no') : 'unknown',
      thirdParty
        ? `Third-party hosts: ${citedHosts.filter((h) => h !== websiteHost).slice(0, 5).join(', ')}`
        : anyMeasured
          ? 'No third-party hosts detected in AI answers'
          : 'AI answers not measured yet'
    ),
    item(
      'geo_cite_5',
      'Incorrect information detected',
      'unknown',
      'Incorrect AI facts are not auto-verified in this audit'
    ),
    item(
      'geo_cite_6',
      'Missing information detected',
      anyMeasured ? (anyMentioned ? 'no' : 'yes') : 'unknown',
      anyMeasured
        ? anyMentioned
          ? 'Brand present in measured AI answers'
          : 'Brand missing from measured AI answers'
        : 'AI answers not measured yet'
    )
  ];

  return {
    builtAt: new Date().toISOString(),
    groups: [
      { id: 'ai_visibility', title: 'AI Visibility', items: aiVis },
      { id: 'entity_strength', title: 'Entity Strength', items: entity },
      { id: 'external_ai_signals', title: 'External AI Signals', items: external },
      { id: 'ai_citation', title: 'AI Citation / Source Monitoring', items: citation }
    ]
  };
}

/** Map geoChecklist yes/no/unknown → checklist pass/fail/unknown */
export function applyGeoChecklistToChecks(
  checks: Array<{ id: string; status?: string; evidence?: string }>,
  geoChecklist: GeoChecklist | null | undefined
) {
  if (!geoChecklist?.groups?.length || !Array.isArray(checks)) return;
  const byId = new Map(checks.map((c) => [c.id, c]));
  for (const g of geoChecklist.groups) {
    for (const item of g.items) {
      const row = byId.get(item.id);
      if (!row) continue;
      row.status =
        item.status === 'yes' ? 'pass' : item.status === 'no' ? 'fail' : 'unknown';
      row.evidence = item.evidence || row.evidence || '';
    }
  }
}
