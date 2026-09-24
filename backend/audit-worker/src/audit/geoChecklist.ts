export type GeoCheckStatus = 'yes' | 'no' | 'unknown';

export type GeoChecklistItem = {
  id: string;
  label: string;
  definition?: string;
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
  promptKey?: 'near' | 'best' | 'near_me' | string | null;
  recommendedLikely?: boolean | null;
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

function statusFromBool(v: boolean | null | undefined, yesEv: string, noEv: string, _unkEv?: string) {
  if (v === true) return { status: 'yes' as const, evidence: yesEv };
  return { status: 'no' as const, evidence: noEv };
}

function enginesForPromptKey(engines: AiEngine[], key: 'near' | 'best' | 'near_me'): AiEngine[] {
  const keyed = engines.filter((e) => e.promptKey === key);
  if (keyed.length) return keyed;
  // Legacy single-prompt audits: infer from prompt text
  if (key === 'best') return engines.filter((e) => /\bbest\b/i.test(String(e.prompt || '')));
  if (key === 'near_me') return engines.filter((e) => /\bnear me\b/i.test(String(e.prompt || '')));
  if (key === 'near') {
    const nearish = engines.filter(
      (e) => /\bnear\b/i.test(String(e.prompt || '')) && !/\bnear me\b/i.test(String(e.prompt || ''))
    );
    if (nearish.length) return nearish;
    // Fall back to all rows when no promptKey (old audits)
    if (!engines.some((e) => e.promptKey)) return engines;
  }
  return [];
}

function promptSliceStats(slice: AiEngine[]) {
  const anyMeasured = slice.some((e) => !e.skipped && e.mentioned != null);
  const anyMentioned = slice.some((e) => e.mentioned === true);
  return { anyMeasured, anyMentioned };
}

export const GEO_CHECKLIST_DEFS: Array<{
  groupId: string;
  groupTitle: string;
  items: Array<{ id: string; label: string; definition: string }>;
}> = [
  {
    groupId: 'ai_visibility',
    groupTitle: 'AI Visibility',
    items: [
      {
        id: 'geo_ai_1',
        label: 'Business mentioned in AI answers',
        definition: 'Whether ChatGPT, Claude, or Gemini name this business in their replies.'
      },
      {
        id: 'geo_ai_2',
        label: 'Business recommended for local searches',
        definition: 'Whether an AI answer uses recommendation language alongside the brand.'
      },
      {
        id: 'geo_ai_3',
        label: 'Service + location visibility',
        definition: 'Whether the business appears for a service-near-location style prompt.'
      },
      {
        id: 'geo_ai_4',
        label: '"Best" query visibility',
        definition: 'Whether the business appears when users ask for the best provider in the area.'
      },
      {
        id: 'geo_ai_5',
        label: '"Near me" query visibility',
        definition: 'Whether the business appears for near-me style prompts.'
      },
      {
        id: 'geo_ai_6',
        label: 'Problem/solution query visibility',
        definition: 'Whether the site supports how-to or problem/solution intent that AI may cite.'
      },
      {
        id: 'geo_ai_7',
        label: 'Competitor mentions in AI answers',
        definition: 'Whether Local Pack competitors also show up in measured AI answers.'
      },
      {
        id: 'geo_ai_8',
        label: 'AI recommendation position/order',
        definition: 'Whether AI answers give a clear ranked order for this brand versus others.'
      }
    ]
  },
  {
    groupId: 'entity_strength',
    groupTitle: 'Entity Strength',
    items: [
      {
        id: 'geo_ent_1',
        label: 'Business entity correctly identified',
        definition: 'Whether schema or Maps listing clearly identifies this business as an entity.'
      },
      {
        id: 'geo_ent_2',
        label: 'Business category correctly identified',
        definition: 'Whether the category or service type matches what the business offers.'
      },
      {
        id: 'geo_ent_3',
        label: 'Location correctly identified',
        definition: 'Whether the business location is correctly associated in Maps or site data.'
      },
      {
        id: 'geo_ent_4',
        label: 'Services correctly identified',
        definition: 'Whether services are clearly stated and match what AI/Maps can attribute.'
      },
      {
        id: 'geo_ent_5',
        label: 'Website correctly associated',
        definition: 'Whether the official website is linked from GBP or entity signals.'
      },
      {
        id: 'geo_ent_6',
        label: 'Business information consistency',
        definition: 'Whether name, phone, and address stay consistent across key sources.'
      },
      {
        id: 'geo_ent_7',
        label: 'SameAs / entity connections',
        definition: 'Whether sameAs or social/profile links strengthen the entity graph.'
      }
    ]
  },
  {
    groupId: 'external_ai_signals',
    groupTitle: 'External AI Signals',
    items: [
      {
        id: 'geo_ext_1',
        label: 'Review-platform presence',
        definition: 'Whether review platforms that AI often cites are present for this brand.'
      },
      {
        id: 'geo_ext_2',
        label: 'Directory presence',
        definition: 'Whether local directories list the business as a corroborating source.'
      },
      {
        id: 'geo_ext_3',
        label: 'Industry mentions',
        definition: 'Whether industry accreditation or association signals are findable.'
      },
      {
        id: 'geo_ext_4',
        label: 'Local publication mentions',
        definition: 'Whether local press or publications mention the business.'
      },
      {
        id: 'geo_ext_5',
        label: 'Local backlinks',
        definition: 'Whether local sites link to the business as a trust signal.'
      },
      {
        id: 'geo_ext_6',
        label: 'Brand mentions',
        definition: 'Whether the brand name appears in AI answers or crawled pages.'
      }
    ]
  },
  {
    groupId: 'ai_citation',
    groupTitle: 'AI Citation / Source Monitoring',
    items: [
      {
        id: 'geo_cite_1',
        label: 'Sources cited by AI',
        definition: 'Whether measured AI answers include clear source URLs or hosts.'
      },
      {
        id: 'geo_cite_2',
        label: 'Website cited',
        definition: 'Whether the business website host appears among AI citations.'
      },
      {
        id: 'geo_cite_3',
        label: 'GBP / business data referenced',
        definition: 'Whether AI answers or Maps pack reference Google Business Profile data.'
      },
      {
        id: 'geo_cite_4',
        label: 'Third-party sources referenced',
        definition: 'Whether AI answers cite third-party hosts beyond the business site.'
      },
      {
        id: 'geo_cite_5',
        label: 'Incorrect information detected',
        definition: 'Whether AI answers contain facts that disagree with known business data.'
      },
      {
        id: 'geo_cite_6',
        label: 'Missing information detected',
        definition: 'Whether AI answers omit the business when it should reasonably appear.'
      }
    ]
  }
];

const DEF_BY_ID = new Map(
  GEO_CHECKLIST_DEFS.flatMap((g) => g.items.map((it) => [it.id, it.definition] as const))
);

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
  const recommended = measured.some(
    (e) =>
      e.recommendedLikely === true ||
      recommendedLikely(e.answerExcerpt || '', e.mentioned === true)
  );
  const nearSlice = enginesForPromptKey(engines, 'near');
  const bestSlice = enginesForPromptKey(engines, 'best');
  const nearMeSlice = enginesForPromptKey(engines, 'near_me');
  const nearStats = promptSliceStats(nearSlice.length ? nearSlice : engines);
  const bestStats = promptSliceStats(bestSlice);
  const nearMeStats = promptSliceStats(nearMeSlice.length ? nearMeSlice : nearSlice.length ? nearSlice : engines);
  const query = String(opts.localRank?.query || nearSlice[0]?.prompt || measured[0]?.prompt || '').trim();
  const inPack = typeof opts.localRank?.position === 'number';
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

  const item = (
    id: string,
    label: string,
    status: GeoCheckStatus,
    evidence: string
  ): GeoChecklistItem => ({
    id,
    label,
    definition: DEF_BY_ID.get(id),
    status,
    evidence
  });

  const aiVis: GeoChecklistItem[] = [
    (() => {
      const s = statusFromBool(
        anyMeasured ? anyMentioned : null,
        `Mentioned in ${engines.filter((e) => e.mentioned).map((e) => e.label || e.engine).join(' / ') || 'AI'}`,
        'Not mentioned in measured ChatGPT / Claude / Gemini answers',
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
      const hasServiceLoc = Boolean(service && city && (nearStats.anyMentioned || inPack));
      const s = statusFromBool(
        service && city ? (nearStats.anyMeasured || inPack ? hasServiceLoc : null) : null,
        inPack || nearStats.anyMentioned
          ? `Service/location signals present for “${nearSlice[0]?.prompt || query || `${service} near ${city}`}”`
          : 'Service + location not visible in measured AI / Maps',
        'Not visible for service + location in measured AI / Maps',
        'Service or location not provided'
      );
      return item('geo_ai_3', 'Service + location visibility', s.status, s.evidence);
    })(),
    (() => {
      if (!bestSlice.length && !bestStats.anyMeasured) {
        return item(
          'geo_ai_4',
          '"Best" query visibility',
          'no',
          'Not mentioned for “best” style local query'
        );
      }
      const s = statusFromBool(
        bestStats.anyMeasured ? bestStats.anyMentioned : null,
        bestStats.anyMentioned
          ? `Mentioned for “${bestSlice[0]?.prompt || 'best …'}”`
          : 'Visible for measured “best” style query',
        `Not mentioned for “${bestSlice[0]?.prompt || 'best …'}”`,
        '“Best” style prompt not measured yet'
      );
      return item('geo_ai_4', '"Best" query visibility', s.status, s.evidence);
    })(),
    (() => {
      const slice = nearMeSlice.length ? nearMeSlice : nearSlice;
      const stats = nearMeSlice.length ? nearMeStats : nearStats;
      if (!slice.length && !stats.anyMeasured && !inPack) {
        return item(
          'geo_ai_5',
          '"Near me" query visibility',
          'no',
          'Not found for near-me style local query'
        );
      }
      const s = statusFromBool(
        inPack || stats.anyMeasured ? Boolean(inPack || stats.anyMentioned) : null,
        inPack
          ? `In Local Pack for “${query}”`
          : stats.anyMentioned
            ? `Mentioned for “${slice[0]?.prompt || 'near me'}”`
            : 'Mentioned for near-me style prompt',
        `Not mentioned for “${slice[0]?.prompt || 'near me'}”`,
        'Near-me visibility not measured'
      );
      return item('geo_ai_5', '"Near me" query visibility', s.status, s.evidence);
    })(),
    item(
      'geo_ai_6',
      'Problem/solution query visibility',
      /how to|faq|what (causes|to do)|get rid of/i.test(corpus) ? 'yes' : 'no',
      /how to|faq|what (causes|to do)|get rid of/i.test(corpus)
        ? 'Problem/solution or FAQ language found on site'
        : 'No problem/solution or FAQ language found on site'
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
      'no',
      anyMentioned
        ? 'Brand mentioned, but AI answers do not provide a stable ranked order'
        : anyMeasured
          ? 'Brand not mentioned — no recommendation position'
          : 'No clear AI recommendation position found'
    )
  ];

  const napOk =
    opts.napPhonePass === true || opts.napAddressPass === true
      ? true
      : opts.napPhonePass === false && opts.napAddressPass === false
        ? false
        : opts.gbp?.listedOnMaps && opts.gbp?.gbpName
          ? true
          : false;

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
      opts.gbp?.primaryTypeDisplayName || service ? 'yes' : 'no',
      opts.gbp?.primaryTypeDisplayName
        ? `GBP category: ${opts.gbp.primaryTypeDisplayName}`
        : service
          ? `Service label: ${service}`
          : 'Category not confirmed'
    ),
    item(
      'geo_ent_3',
      'Location correctly identified',
      opts.gbp?.address || city ? 'yes' : 'no',
      opts.gbp?.address || city || 'Location not confirmed'
    ),
    item(
      'geo_ent_4',
      'Services correctly identified',
      service && corpus.toLowerCase().includes(service.toLowerCase().slice(0, 12))
        ? 'yes'
        : 'no',
      service && corpus.toLowerCase().includes(service.toLowerCase().slice(0, 12))
        ? `Service “${service}” found on site`
        : service
          ? `Service “${service}” not clearly found on site`
          : 'No primary service provided'
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
        'NAP consistency not confirmed',
        'NAP consistency not confirmed'
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
      reviewPlatform ? 'yes' : 'no',
      reviewPlatform ? 'Review-platform references found on site' : 'No review-platform references found on site'
    ),
    item(
      'geo_ext_2',
      'Directory presence',
      directory ? 'yes' : 'no',
      directory ? 'Directory references found on site' : 'No directory references found on site'
    ),
    item(
      'geo_ext_3',
      'Industry mentions',
      industryMention ? 'yes' : 'no',
      industryMention ? 'Accreditation / industry language found' : 'No industry / accreditation language found'
    ),
    item(
      'geo_ext_4',
      'Local publication mentions',
      'no',
      'No local publication mentions found'
    ),
    item('geo_ext_5', 'Local backlinks', 'no', 'No local backlinks confirmed'),
    item(
      'geo_ext_6',
      'Brand mentions',
      anyMentioned || (name && corpus.toLowerCase().includes(name.toLowerCase())) ? 'yes' : 'no',
      anyMentioned
        ? 'Brand mentioned in measured AI answers'
        : name && corpus.toLowerCase().includes(name.toLowerCase())
          ? 'Brand name appears on crawled pages'
          : 'No brand mentions confirmed'
    )
  ];

  const citation: GeoChecklistItem[] = [
    item(
      'geo_cite_1',
      'Sources cited by AI',
      citedHosts.length ? 'yes' : 'no',
      citedHosts.length
        ? `Cited hosts: ${citedHosts.slice(0, 5).join(', ')}`
        : 'No clear source URLs in measured AI answers'
    ),
    item(
      'geo_cite_2',
      'Website cited',
      websiteCited ? 'yes' : 'no',
      websiteCited
        ? `Website host cited: ${websiteHost}`
        : 'Website host not found in AI citations'
    ),
    item(
      'geo_cite_3',
      'GBP / business data referenced',
      gbpReferenced || inPack ? 'yes' : 'no',
      gbpReferenced
        ? 'AI answer references Google Maps / Business Profile style data'
        : inPack
          ? 'Business appears in measured Local Pack (GBP/Maps signal)'
          : 'No GBP/Maps reference detected in AI answers'
    ),
    item(
      'geo_cite_4',
      'Third-party sources referenced',
      thirdParty ? 'yes' : 'no',
      thirdParty
        ? `Third-party hosts: ${citedHosts.filter((h) => h !== websiteHost).slice(0, 5).join(', ')}`
        : 'No third-party hosts detected in AI answers'
    ),
    item(
      'geo_cite_5',
      'Incorrect information detected',
      'no',
      'No incorrect AI facts confirmed'
    ),
    item(
      'geo_cite_6',
      'Missing information detected',
      anyMentioned ? 'no' : 'yes',
      anyMentioned
        ? 'Brand present in measured AI answers'
        : 'Brand missing from measured AI answers'
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
