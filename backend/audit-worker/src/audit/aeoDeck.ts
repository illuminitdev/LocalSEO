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
  | 'brand_trust';

export type AeoQuerySpec = {
  query: string;
  intent: AeoQueryIntent;
  kind: 'service' | 'brand';
};


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

  return [
    {
      query: `How much does ${service} cost in ${city}?`,
      intent: 'service_cost',
      kind: 'service'
    },
    {
      query: `How do I choose ${service} in ${city}?`,
      intent: 'service_howto',
      kind: 'service'
    },
    {
      query: `${name} reviews ${city}`,
      intent: 'brand_trust',
      kind: 'brand'
    },
    {
      query: `Is ${name} good for ${service} in ${city}?`,
      intent: 'brand_trust',
      kind: 'brand'
    }
  ];
}

function termWords(term: string): string[] {
  return String(term || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(
      (w) =>
        w.length >= 4 &&
        !['this', 'business', 'local', 'services', 'service', 'limited', 'company'].includes(w)
    );
}

function mentionsAny(query: string, words: string[]): boolean {
  const q = query.toLowerCase();
  return words.some((w) => q.includes(w) || (w.length >= 5 && q.includes(w.slice(0, 5))));
}

function cleanSearchLine(line: string): string {
  return String(line || '')
    .replace(/^(\d+[\).\]]\s*|[-*•]\s*)/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Turn ChatGPT's four lines into AEO cards. Returns null when the lines are not usable. */
export function aeoSpecsFromSearchLines(
  lines: string[],
  audit: Parameters<typeof buildAeoQuerySpecs>[0]
): AeoQuerySpec[] | null {
  const { service } = auditContext(audit);
  const businessName = String(audit?.business?.businessName || '').trim();
  const cleaned = (Array.isArray(lines) ? lines : [])
    .map(cleanSearchLine)
    .filter(
      (line) =>
        line.length >= 8 &&
        line.length <= 120 &&
        !/https?:\/\//i.test(line) &&
        !/\b(chatgpt|gemini|claude|dataforseo|api)\b/i.test(line)
    );
  const unique: string[] = [];
  for (const line of cleaned) {
    if (unique.some((u) => u.toLowerCase() === line.toLowerCase())) continue;
    unique.push(line);
  }
  if (unique.length < 4 || !businessName) return null;

  const serviceWords = termWords(service);
  const nameWords = termWords(businessName).filter(
    (w) => !serviceWords.some((s) => s.includes(w) || w.includes(s) || (w.length >= 5 && s.startsWith(w.slice(0, 5))))
  );
  const serviceLines = unique.filter((line) => mentionsAny(line, serviceWords) && !mentionsAny(line, nameWords));
  const brandLines = unique.filter((line) => mentionsAny(line, nameWords) && mentionsAny(line, serviceWords));
  if (serviceLines.length < 2 || brandLines.length < 2) return null;

  const picked = [...serviceLines.slice(0, 2), ...brandLines.slice(0, 2)];
  const intents: AeoQueryIntent[] = ['service_cost', 'service_howto', 'brand_trust', 'brand_trust'];
  return picked.map((query, i) => ({
    query,
    intent: intents[i],
    kind: i < 2 ? 'service' : 'brand'
  }));
}

function storedAeoQuerySpecs(audit: { aeoQuerySpecs?: unknown } | null): AeoQuerySpec[] | null {
  const raw = Array.isArray(audit?.aeoQuerySpecs) ? audit.aeoQuerySpecs : [];
  const specs = raw
    .map((row) => {
      const query = cleanSearchLine(String((row as AeoQuerySpec)?.query || ''));
      const kind = (row as AeoQuerySpec)?.kind === 'brand' ? 'brand' : 'service';
      const intent = (row as AeoQuerySpec)?.intent;
      const safeIntent: AeoQueryIntent =
        intent === 'service_cost' || intent === 'service_howto' || intent === 'service_best' || intent === 'brand_trust'
          ? intent
          : kind === 'brand'
            ? 'brand_trust'
            : 'service_best';
      return query ? { query, intent: safeIntent, kind } : null;
    })
    .filter((row): row is AeoQuerySpec => Boolean(row));
  return specs.length === 4 ? specs : null;
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
  const specs = storedAeoQuerySpecs(audit as { aeoQuerySpecs?: unknown }) || buildAeoQuerySpecs(audit);
  return specs.map((spec) => {
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
      'Real Google results for four local question searches (2 service + 2 brand) — use these to see where FAQ and schema can win answer boxes.',
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
