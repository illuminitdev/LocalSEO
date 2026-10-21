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
  /** Services read from the business website (see extractSiteServices). */
  siteServices?: string[];
} | null;

/** "tyres" -> plural, "MOT" / "car servicing" / "brake repair" -> singular. */
function isPlural(service: string): boolean {
  const last = service.split(' ').pop() || '';
  return /[a-z]s$/.test(last) && !/(ss|is|us|ics)$/.test(last);
}

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/**
 * Last resort when the AI questions (aeoQuestionsAi.ts) could not be written: questions built around the services
 * read from the website, or, without any, the category as the kind of business ("a garage"), never as a service.
 */
export function buildAeoQuerySpecs(audit: AeoQueryAudit): AeoQuerySpec[] {
  const { name, city } = auditContext(audit);
  const category = String(audit?.business?.serviceLabel || audit?.business?.service || '').trim();
  const services = (Array.isArray(audit?.siteServices) ? audit.siteServices : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  if (services.length) {
    const first = services[0];
    const second = services[1] || first;
    return [
      {
        query: `How much ${isPlural(first) ? 'do' : 'does'} ${first} cost in ${city}?`,
        intent: 'service_cost',
        kind: 'service'
      },
      {
        query: `Where can I get ${second} in ${city}?`,
        intent: 'service_best',
        kind: 'service'
      },
      {
        query: `Is ${name} good for ${first}?`,
        intent: 'brand_trust',
        kind: 'brand'
      }
    ];
  }

  const business =
    category && !/^local (services|business)$/i.test(category) ? category.toLowerCase() : 'local business';
  return [
    {
      query: `How much does ${withArticle(business)} in ${city} charge?`,
      intent: 'service_cost',
      kind: 'service'
    },
    {
      query: `How do I choose a good ${business} in ${city}?`,
      intent: 'service_howto',
      kind: 'service'
    },
    {
      query: `${name} reviews ${city}`,
      intent: 'brand_trust',
      kind: 'brand'
    }
  ];
}

export function cleanSearchLine(line: string): string {
  return String(line || '')
    .replace(/^(\d+[\).\]]\s*|[-*•]\s*)/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  // 3 AI-written questions; audits saved before that have 4.
  return specs.length >= 3 ? specs : null;
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
  const { name } = auditContext(audit);
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
    const named = shot?.businessNamed === true;
    const measured = shot?.businessNamed === true || shot?.businessNamed === false;
    const brand = name || 'The brand';
    return {
      query: spec.query,
      intent: spec.intent,
      kind: spec.kind,
      peopleAlsoAsk: Array.isArray(shot?.peopleAlsoAsk) ? shot.peopleAlsoAsk : [],
      answerBox: shot?.answerBox || null,
      businessNamed: shot?.businessNamed ?? null,
      answerVisibility: !measured
        ? 'Answer visibility was not measured for this question.'
        : named
          ? `${brand} is visible in the answer for this question.`
          : `${brand} is not visible in the answer for this question.`
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
      'People Also Ask: key AEO opportunities for this service and location.',
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
