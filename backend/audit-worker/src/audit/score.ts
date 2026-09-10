import { PILLARS } from './checklistSchema.js';

function statusWeight(status) {
  if (status === 'pass') return 1;
  if (status === 'fail') return 0;
  if (status === 'na') return null;
  return null;
}

/**
 * Score a set of checks for a pillar: (passes / assessed) * 10, rounded.
 */
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

/** Pass-rate as 0–100 for triad buckets. */
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

/**
 * PPT-style triad: Local SEO 40% / AEO 30% / GEO 30% → overall /100.
 * Optional localRank caps GEO/AEO when the business is missing from the Maps pack
 * for the measured “near me / best service” query.
 */
export function computeTriadScore(checks = [], context: { localRank?: any } = {}) {
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
    ...id('nap_')
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
    ...(bySection.ai_seo || []).filter((c) => String(c.id).startsWith('geo_')),
    ...id('geo_').filter((c) => c.section !== 'ai_seo')
  ];

  const local = scoreChecks100(localChecks);
  let aeo = scoreChecks100(aeoChecks);
  let geo = scoreChecks100(geoChecks);

  const rank = context.localRank || null;
  const inPack = rank && typeof rank.position === 'number';
  const position = inPack ? Number(rank.position) : null;
  let visibilityNote = '';

  if (rank) {
    if (!inPack) {
      // Not in the measured Maps pack → GEO cannot stay high from on-site checks alone
      geo = { ...geo, score: Math.min(geo.score, 42) };
      aeo = { ...aeo, score: Math.min(aeo.score, 52) };
      visibilityNote =
        ' Maps pack: not listed in the top results for the measured local query — GEO/AEO capped.';
    } else if (position > 7) {
      geo = { ...geo, score: Math.min(geo.score, 55) };
      aeo = { ...aeo, score: Math.min(aeo.score, 62) };
      visibilityNote = ` Maps pack: #${position} — GEO/AEO tempered for weak local pack presence.`;
    } else if (position > 3) {
      geo = { ...geo, score: Math.min(geo.score, 68) };
      visibilityNote = ` Maps pack: #${position} — GEO tempered for mid-pack presence.`;
    }
  }

  const total = Math.round(local.score * 0.4 + aeo.score * 0.3 + geo.score * 0.3);

  const triad = {
    local_seo: {
      id: 'local_seo',
      label: 'Local SEO',
      focus: 'Google, Maps, citations, local signals',
      weight: 40,
      score: local.score,
      max: 100,
      assessed: local.assessed,
      incomplete: local.incomplete
    },
    aeo: {
      id: 'aeo',
      label: 'AEO',
      focus: 'FAQs, answer content, featured-snippet readiness',
      weight: 30,
      score: aeo.score,
      max: 100,
      assessed: aeo.assessed,
      incomplete: aeo.incomplete
    },
    geo: {
      id: 'geo',
      label: 'GEO / AI SEO',
      focus: 'Local pack + AI / entity visibility',
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
      'Overall = Local SEO 40% + AEO 30% + GEO 30% (on-site checks).' +
      (visibilityNote || ' Unknown/N/A checks are excluded.'),
    localPack: inPack
      ? { listed: true, position }
      : rank
        ? { listed: false, position: null, query: rank.query || null }
        : null
  };
}

/**
 * Compute Excel §13 style scores from checklist results, plus PPT triad for deep audits.
 * Pass `{ localRank }` so GEO/AEO reflect Maps pack presence for the measured local query.
 */
export function computeScore(checks = [], context: { localRank?: any } = {}) {
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
