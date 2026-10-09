import {
  auditContext,
  failedChecks,
  inPackFromAudit,
  mapsResultsFromAudit,
  measuredQueryFromAudit,
  toActions
} from './deckShared.js';

export function buildGeoFixes(audit) {
  const { name, city, service } = auditContext(audit);
  const failed = failedChecks(audit);
  const geoFails = failed
    .filter(
      (c) =>
        String(c.id).startsWith('geo_') ||
        ['tech_12', 'tech_13', 'tech_14', 'tech_15'].includes(c.id)
    )
    .slice(0, 4);
  const mapsResults = mapsResultsFromAudit(audit);
  const inPack = inPackFromAudit(audit);
  const measuredQuery = measuredQueryFromAudit(audit, service, city);
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
      : `“${service} near me, ${city}”, “best ${service}, ${city}”, “top rated ${service} in ${city}”`;
  const areaName = city && city !== 'the local area' ? city : 'the city or area';
  const areaNote = `Searched for ${areaName}, not a street or road.`;

  const geoActions = toActions(geoFails, 'Medium');

  return {
    title: 'GEO: AI mentions and citations',
    visualIntro: `Whether ChatGPT, Claude, and Perplexity name ${name} in the top 5 for ${geoPromptSummary}. ${areaNote}`,
    goalLine: `Get ${name} named in the top 5 on ChatGPT, Claude, and Perplexity for ${geoPromptSummary}. ${areaNote}`,
    verifyHint: `Ask ChatGPT, Claude, and Perplexity: ${geoPromptSummary}. ${areaNote}`,
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
          aiEngineChecks
            .filter((e) => e && e.mentioned === true)
            .map((e) => e.label)
            .filter(Boolean)
        )
      ];
      const missed = [
        ...new Set(
          aiEngineChecks
            .filter((e) => e && e.mentioned === false)
            .map((e) => e.label)
            .filter(Boolean)
        )
      ];
      const aiBit = mentioned.length
        ? `${name} is mentioned in ${mentioned.join(' / ')} across measured GEO prompts.`
        : missed.length
          ? `${name} is not mentioned in ${missed.join(' / ')} across measured GEO prompts.`
          : 'AI engine checks were unavailable for this run.';
      const mapsBit = inPack
        ? ` Local SEO note: ${name} is in the Google Maps results for “${measuredQuery}”.`
        : mapsResults.length
          ? ` Local SEO note: ${name} is not in the Google Maps results for “${measuredQuery}”.`
          : measuredQuery
            ? ` Local SEO note: ${name} is not in the Google Maps results for “${measuredQuery}”.`
            : '';
      return `${aiBit}${mapsBit}`;
    })(),
    actions:
      geoActions.length > 0
        ? geoActions.map(
            ({ title, detail, howTo, priority, issue, evidence, impact, recommendation }) => ({
              title,
              detail,
              howTo,
              priority,
              issue,
              evidence,
              impact,
              recommendation
            })
          )
        : [
            {
              title: 'Standardise brand name',
              detail: `Use “${name}” consistently everywhere — no variations.`,
              howTo: 'Align GBP, website title, schema and directories to the same legal/trading name.',
              priority: 'High',
              issue: 'Inconsistent entity naming',
              evidence: `Brand must appear consistently as “${name}” for Google and AI citation.`,
              impact:
                'Google Local Pack and ChatGPT / Claude may prefer clearer competitor entities.',
              recommendation: 'Standardise the trading name across GBP, site, schema and directories.'
            },
            {
              title: 'Entity & schema signals',
              detail: 'Add Organisation / LocalBusiness schema with NAP and sameAs links.',
              howTo:
                'Publish JSON-LD LocalBusiness on the homepage with address, phone, and social sameAs.',
              priority: 'High',
              issue: 'Weak entity / schema signals',
              evidence: 'LocalBusiness / sameAs signals need strengthening for GEO.',
              impact:
                'Lower chance of appearing in Local Pack and being recommended by AI assistants.',
              recommendation: 'Publish LocalBusiness JSON-LD with NAP and sameAs links.'
            }
          ]
  };
}
