import { buildAeoCoreChecklist } from './aeoCoreChecklist.js';
import {
  auditContext,
  failedChecks,
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


export type AeoQueryAudit = {
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
} | null;

/** "plumber" -> "plumbers". Phrases of more than one word stay as written. */
export function serviceInCityQuery(service: string, city: string): string {
  const phrase = String(service || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const place = String(city || '').replace(/\s+/g, ' ').trim() || 'the local area';
  const words = phrase ? phrase.split(' ') : ['local services'];
  let lead = words.join(' ');
  if (words.length === 1) {
    const word = words[0];
    if (!/s$/i.test(word)) {
      lead = /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
    }
  }
  return `${lead} in ${place}`;
}

export function buildAeoQuerySpecs(audit: AeoQueryAudit): AeoQuerySpec[] {
  const { name, city, service } = auditContext(audit);

  return [
    {
      query: serviceInCityQuery(service, city),
      intent: 'service_best',
      kind: 'service'
    },
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

function sameQuery(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function specFromChatLine(line: string, nameWords: string[]): AeoQuerySpec {
  if (mentionsAny(line, nameWords)) {
    return { query: line, intent: 'brand_trust', kind: 'brand' };
  }
  if (/\b(cost|price|prices|how much)\b/i.test(line)) {
    return { query: line, intent: 'service_cost', kind: 'service' };
  }
  if (/\b(how|choose|choosing)\b/i.test(line)) {
    return { query: line, intent: 'service_howto', kind: 'service' };
  }
  return { query: line, intent: 'service_best', kind: 'service' };
}

/** First search is always "{service}s in {city}". The next three come from ChatGPT, padded from the fallback questions. */
export function aeoSpecsFromSearchLines(lines: string[], audit: AeoQueryAudit): AeoQuerySpec[] {
  const fallback = buildAeoQuerySpecs(audit);
  const cityQuery = fallback[0].query;
  const businessName = String(audit?.business?.businessName || '').trim();
  const { service } = auditContext(audit);
  const serviceWords = termWords(service);
  const nameWords = termWords(businessName).filter(
    (w) => !serviceWords.some((s) => s.includes(w) || w.includes(s) || (w.length >= 5 && s.startsWith(w.slice(0, 5))))
  );
  const cleaned = (Array.isArray(lines) ? lines : [])
    .map(cleanSearchLine)
    .filter(
      (line) =>
        line.length >= 8 &&
        line.length <= 120 &&
        !/https?:\/\//i.test(line) &&
        !/\b(chatgpt|gemini|claude|dataforseo|api)\b/i.test(line) &&
        !sameQuery(line, cityQuery)
    );
  const unique: string[] = [];
  for (const line of cleaned) {
    if (unique.some((u) => sameQuery(u, line))) continue;
    unique.push(line);
  }

  const specs: AeoQuerySpec[] = [fallback[0], ...unique.slice(0, 3).map((line) => specFromChatLine(line, nameWords))];
  for (const row of fallback.slice(1)) {
    if (specs.length >= 4) break;
    if (specs.some((s) => sameQuery(s.query, row.query))) continue;
    specs.push(row);
  }
  return specs.length === 4 ? specs : fallback;
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
    peopleAlsoAsk?: Array<{ question?: string; answer?: string }>;
    answerBox?: { title?: string; text?: string; url?: string } | null;
    businessNamed?: boolean | null;
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
      screenshot,
      peopleAlsoAsk: Array.isArray(shot?.peopleAlsoAsk) ? shot.peopleAlsoAsk : [],
      answerBox: shot?.answerBox || null
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
  const priorities = toActions(aeoFails, 'Medium');

  return {
    title: 'AEO: Answer Engine Optimisation',
    visualIntro:
      'Real Google results for one “service in city” search plus three local question searches — use these to see where FAQ and schema can win answer boxes.',
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
    opportunity: `For ${service} in ${city}, add FAQ blocks and 40–60 word answers so ${name} can win the measured question searches.`
  };
}
