import { buildAeoCoreChecklist } from './aeoCoreChecklist.js';
import {
  auditContext,
  failedChecks,
  inPackFromAudit,
  measuredQueryFromAudit,
  toActions
} from './deckShared.js';

export type AeoQueryIntent =
  | 'service_cost'
  | 'service_best'
  | 'service_howto'
  | 'brand_trust'
  | 'brand_compare';

export type AeoQuerySpec = {
  query: string;
  intent: AeoQueryIntent;
  kind: 'service' | 'brand';
};

/** Five measured AEO Visual queries: 3 service + 2 brand. Shared by decks + screenshot capture. */
export function buildAeoQuerySpecs(audit: {
  business?: {
    businessName?: string;
    searchAreaLabel?: string;
    city?: string;
    serviceLabel?: string;
    service?: string;
  };
  gbpLookup?: {
    localRank?: {
      topResults?: Array<{ name?: string; isProspect?: boolean }>;
    };
  };
} | null): AeoQuerySpec[] {
  const { name, city, service } = auditContext(audit);
  const competitor =
    String(
      (audit?.gbpLookup?.localRank?.topResults || []).find((r) => r?.name && !r.isProspect)
        ?.name || ''
    ).trim() || 'competitors';

  return [
    {
      query: `What are the best ${service} services for local residents in ${city}?`,
      intent: 'service_best',
      kind: 'service'
    },
    {
      query: `How to choose a reliable ${service} and what questions should I ask them?`,
      intent: 'service_howto',
      kind: 'service'
    },
    {
      query: `What is the average cost of ${service} and what factors affect the price?`,
      intent: 'service_cost',
      kind: 'service'
    },
    {
      query: `Is ${name} a reputable company for ${service}?`,
      intent: 'brand_trust',
      kind: 'brand'
    },
    {
      query: `${name} vs ${competitor} for ${service}`,
      intent: 'brand_compare',
      kind: 'brand'
    }
  ];
}

export function buildAeoQueryCards(
  audit: Parameters<typeof buildAeoQuerySpecs>[0],
  screenshots?: Array<{
    query?: string;
    dataUrl?: string;
    skipped?: boolean;
    reason?: string;
    capturedAt?: string;
  }> | null
) {
  const shots = Array.isArray(screenshots) ? screenshots : [];
  return buildAeoQuerySpecs(audit).map((spec) => {
    const shot =
      shots.find((s) => String(s?.query || '').trim() === spec.query) ||
      shots.find(
        (s) =>
          String(s?.query || '')
            .trim()
            .toLowerCase() === spec.query.toLowerCase()
      ) ||
      null;
    const screenshot = shot
      ? shot.dataUrl && String(shot.dataUrl).startsWith('data:image/')
        ? {
            dataUrl: shot.dataUrl,
            query: spec.query,
            capturedAt: shot.capturedAt || null
          }
        : {
            skipped: true,
            reason: shot.reason || 'Unavailable',
            query: spec.query,
            capturedAt: shot.capturedAt || null
          }
      : null;
    return {
      query: spec.query,
      intent: spec.intent,
      kind: spec.kind,
      screenshot
    };
  });
}

export function buildAeoFixes(audit) {
  const { name, city, service } = auditContext(audit);
  const failed = failedChecks(audit);
  const aeoFails = failed
    .filter(
      (c) =>
        String(c.id).startsWith('aeo_') || String(c.id).startsWith('ai_') || c.id === 'onpage_10'
    )
    .slice(0, 4);
  const inPack = inPackFromAudit(audit);
  const measuredQuery = measuredQueryFromAudit(audit, service, city);
  const priorities = toActions(aeoFails, 'Medium');

  return {
    title: 'AEO: Answer Engine Optimisation',
    visualIntro:
      'Real Google results for five local question searches (3 service + 2 brand) — use these to see where FAQ and schema can win answer boxes.',
    aeoChecklist: buildAeoCoreChecklist(audit),
    priorities:
      priorities.length > 0
        ? priorities
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
    queryCards: buildAeoQueryCards(audit, audit?.aeoSerpScreenshots || null),
    opportunity: inPack
      ? `${name} appears in the local pack for “${measuredQuery}” — strengthen FAQ and schema so answer boxes can follow.`
      : `For “${measuredQuery}”, other local options show first — add FAQ blocks and schema so ${name} can compete in answer results.`
  };
}
