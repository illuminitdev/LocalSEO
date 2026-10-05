import { PILLARS } from './checklistSchema.js';

function statusWeight(status) {
  if (status === 'pass') return 1;
  if (status === 'fail') return 0;
  if (status === 'na') return null;
  return null;
}


export function scoreChecks(checks) {
  let sum = 0;
  let count = 0;
  for (const c of checks) {
    const w = statusWeight(c.status);
    if (w === null) continue;
    sum += w;
    count += 1;
  }
  if (count === 0) {
    return { score: 0, assessed: 0, max: 10, incomplete: true };
  }
  const raw = (sum / count) * 10;
  return {
    score: Math.round(raw * 10) / 10,
    assessed: count,
    max: 10,
    incomplete: false
  };
}


export function scoreChecks100(checks) {
  let sum = 0;
  let count = 0;
  for (const c of checks) {
    const w = statusWeight(c.status);
    if (w === null) continue;
    sum += w;
    count += 1;
  }
  if (count === 0) {
    return { score: 0, assessed: 0, max: 100, incomplete: true };
  }
  return {
    score: Math.round((sum / count) * 100),
    assessed: count,
    max: 100,
    incomplete: false
  };
}

export function priorityBand(total) {
  if (total >= 70) return { id: 'excellent', label: 'Excellent prospect', range: '70–90' };
  if (total >= 55) return { id: 'good', label: 'Good prospect', range: '55–69' };
  if (total >= 40) return { id: 'average', label: 'Average', range: '40–54' };
  return { id: 'low', label: 'Low priority', range: 'Below 40' };
}

export function deepBand(total) {
  if (total >= 80) return { id: 'strong', label: 'Strong digital presence', range: '80–100' };
  if (total >= 65) return { id: 'good', label: 'Good foundation', range: '65–79' };
  if (total >= 45) return { id: 'gaps', label: 'Clear gaps to fix', range: '45–64' };
  return { id: 'weak', label: 'Weak visibility', range: 'Below 45' };
}

function collectBySection(checks: any[] = []): Record<string, any[]> {
  const bySection: Record<string, any[]> = {};
  for (const c of checks) {
    if (!bySection[c.section]) bySection[c.section] = [];
    bySection[c.section].push(c);
  }
  return bySection;
}


const GEO_MENTION_ROLLUP_IDS = new Set(['geo_ai_1', 'geo_ai_2', 'geo_ai_3', 'geo_ai_4', 'geo_ai_5']);
const AEO_VISIBILITY_IDS = new Set(['aeo_vis_snippet', 'aeo_vis_paa']);
const LOCAL_GBP_DETAIL_IDS = new Set([
  'core_gbp_name',
  'core_gbp_address',
  'core_gbp_phone',
  'core_gbp_website',
  'core_gbp_hours',
  'core_hours_match',
  'core_web_nap'
]);
const LOCAL_MAP_ROW_IDS = new Set(['maps_vis_1', 'geo_5', 'core_vis_maps', 'core_vis_pack']);

type ScoreContext = {
  localRank?: any;
  aiEngineChecks?: any[];
  aeoChecklist?: { groups?: Array<{ items?: any[] }> } | null;
  aeoQueries?: any[] | null;
  localSeoChecklist?: { groups?: Array<{ items?: any[] }> } | null;
  geoChecklist?: { groups?: Array<{ items?: any[] }> } | null;
};

const MAP_POSITION_POINTS = [0, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

function aeoRowsFromChecklist(checklist: ScoreContext['aeoChecklist']) {
  const groups = Array.isArray(checklist?.groups) ? checklist.groups : [];
  const out: Array<{ id: string; status: string; label: string; evidence: string }> = [];
  for (const group of groups) {
    const items = Array.isArray(group?.items) ? group.items : [];
    for (const item of items) {
      const status = String(item?.status || '');
      if (status !== 'yes' && status !== 'no') continue;
      out.push({
        id: String(item?.id || `aeo_chk_${out.length + 1}`),
        status: status === 'yes' ? 'pass' : 'fail',
        label: String(item?.label || 'AEO check'),
        evidence: String(item?.evidence || '')
      });
    }
  }
  return out;
}

function aeoRowsFromQueries(queries: any[] = []) {
  const out: Array<{ id: string; status: string; label: string; evidence: string }> = [];
  for (const row of queries) {
    if (!row || row.serpMeasured !== true) continue;
    if (typeof row.dataUrl !== 'string' || !row.dataUrl.startsWith('data:image/')) continue;
    if (row.businessNamed !== true && row.businessNamed !== false) continue;
    const query = String(row.query || '').trim();
    const named = row.businessNamed === true;
    out.push({
      id: `aeo_query_${out.length + 1}`,
      status: named ? 'pass' : 'fail',
      label: query ? `Google result for “${query}”` : 'Google result',
      evidence: named
        ? 'The business name appears in the answer box, People Also Ask, or the organic results.'
        : 'This search was measured, and the business name is not in the answer box, People Also Ask, or the organic results.'
    });
  }
  return out;
}

function weightedCheckScore(rows: Array<{ status?: string }> = [], failWeight = 1) {
  let earned = 0;
  let slots = 0;
  let assessed = 0;
  for (const row of rows) {
    if (row?.status === 'pass') {
      earned += 1;
      slots += 1;
      assessed += 1;
    } else if (row?.status === 'fail') {
      slots += failWeight;
      assessed += 1;
    }
  }
  if (!assessed) return { score: 0, assessed: 0, max: 100, incomplete: true };
  return {
    score: Math.round((earned / slots) * 100),
    assessed,
    max: 100,
    incomplete: false
  };
}

function blendWeighted(
  parts: Array<{ score: number; weight: number; assessed: number; incomplete?: boolean }>
) {
  const active = parts.filter((part) => part.assessed > 0);
  if (!active.length) return { score: 0, assessed: 0, max: 100, incomplete: true };
  const weight = active.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(active.reduce((sum, part) => sum + (part.score * part.weight) / weight, 0));
  return {
    score,
    assessed: active.reduce((sum, part) => sum + part.assessed, 0),
    max: 100,
    incomplete: false
  };
}

function mapRankSlice(rank: any) {
  const measured = Boolean(
    rank && (rank.measured === true || rank.query || (Array.isArray(rank.topResults) && rank.topResults.length))
  );
  if (!measured) return { score: 0, assessed: 0, max: 100, incomplete: true };
  const pos = typeof rank.position === 'number' ? Math.round(rank.position) : null;
  const score = pos != null && pos >= 1 && pos <= 10 ? MAP_POSITION_POINTS[pos] : 0;
  return { score, assessed: 1, max: 100, incomplete: false };
}

function mentionChecksFromEngines(rows: any[] = []) {
  const out: Array<{ id: string; status: string; label: string; evidence: string }> = [];
  for (const row of rows) {
    if (!row || row.skipped === true) continue;
    if (row.mentioned !== true && row.mentioned !== false) continue;
    const engine = String(row.label || row.engine || 'AI').trim() || 'AI';
    const prompt = String(row.prompt || '').trim();
    const quoted = prompt ? ` for “${prompt}”` : '';
    const mentioned = row.mentioned === true;
    out.push({
      id: `llm_mention_${out.length + 1}`,
      status: mentioned ? 'pass' : 'fail',
      label: `${engine} mentioned${quoted}`,
      evidence: mentioned
        ? `${engine} named the business${quoted}.`
        : `${engine} did not name the business${quoted}.`
    });
  }
  return out;
}

export function computeTriadScore(checks = [], context: ScoreContext = {}) {
  const bySection = collectBySection(checks);
  const id = (prefix) => checks.filter((c) => String(c.id).startsWith(prefix));

  const localChecks = [
    ...(bySection.gbp || []),
    ...(bySection.reviews || []),
    ...(bySection.website_basic || []),
    ...(bySection.website_homepage || []),
    ...(bySection.local_seo || []),
    ...(bySection.service_pages || []),
    ...(bySection.onpage_seo || []).filter((c) => c.id !== 'onpage_10'),
    ...(bySection.technical_seo || []).filter(
      (c) => !['tech_12', 'tech_13', 'tech_14', 'tech_15'].includes(c.id) && c.source !== 'operator'
    ),
    ...(bySection.citations || []),
    ...(bySection.maps_competitors || []),
    ...(bySection.competitor_gap || []),
    ...(bySection.conversion || []),
    ...id('nap_'),
    ...checks.filter((c) => c.id === 'geo_5')
  ];

  const aeoChecks = [
    ...(bySection.onpage_seo || []).filter((c) => c.id === 'onpage_10'),
    ...(bySection.ai_seo || []).filter(
      (c) => String(c.id).startsWith('ai_') || String(c.id).startsWith('aeo_')
    ),
    ...id('aeo_').filter((c) => c.section !== 'ai_seo')
  ];

  const geoChecks = [
    ...(bySection.technical_seo || []).filter((c) =>
      ['tech_12', 'tech_13', 'tech_14', 'tech_15'].includes(c.id)
    ),
    ...(bySection.ai_seo || []).filter((c) => String(c.id).startsWith('geo_') && c.id !== 'geo_5'),
    ...id('geo_').filter((c) => c.section !== 'ai_seo' && c.id !== 'geo_5')
  ];

  const mentionChecks = mentionChecksFromEngines(
    Array.isArray(context.aiEngineChecks) ? context.aiEngineChecks : []
  );

  const checklistRows = aeoRowsFromChecklist(context.aeoChecklist);
  const queryRows = aeoRowsFromQueries(Array.isArray(context.aeoQueries) ? context.aeoQueries : []);
  const checklistForScore = queryRows.length
    ? checklistRows.filter((row) => !AEO_VISIBILITY_IDS.has(row.id))
    : checklistRows;
  const aeo = context.aeoChecklist
    ? blendWeighted([
        { ...weightedCheckScore(checklistForScore, 2), weight: 80 },
        { ...scoreChecks100(queryRows), weight: 20 }
      ])
    : scoreChecks100(aeoChecks);

  const localChecklistRows = aeoRowsFromChecklist(context.localSeoChecklist);
  const gbpDetailRows = localChecklistRows.filter((row) => LOCAL_GBP_DETAIL_IDS.has(row.id));
  const localChecklistOnly = localChecklistRows.filter(
    (row) => !LOCAL_GBP_DETAIL_IDS.has(row.id) && !LOCAL_MAP_ROW_IDS.has(row.id)
  );
  const local = context.localSeoChecklist
    ? blendWeighted([
        { ...weightedCheckScore(localChecklistOnly, 2), weight: 90 },
        { ...weightedCheckScore(gbpDetailRows, 3), weight: 5 },
        { ...mapRankSlice(context.localRank), weight: 5 }
      ])
    : scoreChecks100(localChecks);

  const geoChecklistRows = aeoRowsFromChecklist(context.geoChecklist);
  const geoChecklistForScore = mentionChecks.length
    ? geoChecklistRows.filter((row) => !GEO_MENTION_ROLLUP_IDS.has(row.id))
    : geoChecklistRows;
  const geoCrawl = mentionChecks.length
    ? geoChecks.filter((c) => !GEO_MENTION_ROLLUP_IDS.has(c.id))
    : geoChecks;
  const geo = context.geoChecklist
    ? scoreChecks100([...geoChecklistForScore, ...mentionChecks])
    : scoreChecks100([...geoCrawl, ...mentionChecks]);

  const rank = context.localRank || null;
  const inPack = rank && typeof rank.position === 'number';
  const position = inPack ? Number(rank.position) : null;

  const total = Math.round(local.score * 0.4 + aeo.score * 0.3 + geo.score * 0.3);

  const triad = {
    local_seo: {
      id: 'local_seo',
      label: 'Local SEO',
      focus: 'GBP + Website + Citations + Maps Visibility',
      weight: 40,
      score: local.score,
      max: 100,
      assessed: local.assessed,
      incomplete: local.incomplete
    },
    aeo: {
      id: 'aeo',
      label: 'AEO',
      focus:
        'Optimising content to appear as answers to user questions — e.g. Google People Also Ask, featured snippets, direct answers, and AI-generated answers.',
      weight: 30,
      score: aeo.score,
      max: 100,
      assessed: aeo.assessed,
      incomplete: aeo.incomplete
    },
    geo: {
      id: 'geo',
      label: 'GEO / AI SEO',
      focus:
        'Optimising a business/entity to be mentioned or recommended in generative AI/search experiences such as Google AI Overviews, ChatGPT, Perplexity, etc.',
      weight: 30,
      score: geo.score,
      max: 100,
      assessed: geo.assessed,
      incomplete: geo.incomplete
    }
  };

  return {
    mode: 'deep-local-aeo-geo',
    total,
    max: 100,
    band: deepBand(total),
    pillars: [triad.local_seo, triad.aeo, triad.geo],
    triad,
    note:
      'Overall = Local SEO 40% + AEO 30% + GEO 30% (on-site checks). Unknown/N/A checks are excluded.',
    localPack: inPack
      ? { listed: true, position }
      : rank
        ? { listed: false, position: null, query: rank.query || null }
        : null
  };
}





export function computeScore(checks = [], context: ScoreContext = {}) {
  const bySection = collectBySection(checks);

  const pillars: Record<string, ReturnType<typeof scoreChecks>> = {};
  pillars.gbp = scoreChecks(bySection.gbp || []);
  pillars.reviews = scoreChecks(bySection.reviews || []);
  pillars.website = scoreChecks([
    ...(bySection.website_basic || []),
    ...(bySection.website_homepage || [])
  ]);

  const localQual = (bySection.local_seo || []).filter((c) => String(c.id).startsWith('loc_qual_'));
  pillars.local_seo = scoreChecks([
    ...localQual,
    ...(bySection.onpage_seo || []),
    ...(bySection.technical_seo || []).filter((c) => c.source !== 'operator')
  ]);

  pillars.service_pages = scoreChecks(bySection.service_pages || []);

  const locPages = (bySection.local_seo || []).filter(
    (c) => String(c.id).startsWith('loc_') && !String(c.id).startsWith('loc_qual_')
  );
  pillars.location_seo = scoreChecks(locPages);
  pillars.ai_seo = scoreChecks(bySection.ai_seo || []);
  pillars.conversion = scoreChecks(bySection.conversion || []);
  pillars.competitor_gap = scoreChecks([
    ...(bySection.maps_competitors || []),
    ...(bySection.competitor_gap || [])
  ]);

  let excelTotal = 0;
  const detailPillars = PILLARS.map((p) => {
    const result = pillars[p.id] || { score: 0, assessed: 0, max: 10, incomplete: true };
    const contribution = Math.min(10, Math.max(0, result.score || 0));
    excelTotal += contribution;
    return {
      id: p.id,
      label: p.label,
      score: contribution,
      max: 10,
      assessed: result.assessed,
      incomplete: result.incomplete
    };
  });

  excelTotal = Math.round(excelTotal * 10) / 10;
  const triadResult = computeTriadScore(checks, context);

  return {
    ...triadResult,
    detailPillars,
    excelTotal,
    excelMax: 90,
    excelBand: priorityBand(excelTotal)
  };
}
