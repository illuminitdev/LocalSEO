import { geminiGenerate } from '../lib/gemini.js';
import { cleanSearchLine, type AeoQueryIntent, type AeoQuerySpec } from './aeoDeck.js';
import { fetchPeopleAlsoAskQuestions, writeAeoQuestionsWithChatGpt } from '../lib/dataForSeo.js';

type CrawlPage = {
  url?: string;
  title?: string;
  h1s?: string[];
  h2s?: string[];
  h3s?: string[];
  bodyText?: string;
  links?: Array<{ href?: string; text?: string }>;
};

export type AeoQuestionsResult = {
  services: string[];
  specs: AeoQuerySpec[];
  source: 'site' | 'search' | 'dataforseo';
};

const SERVICE_PATH = /\/(services?|our-services|what-we-do|treatments?|prices?|pricing)(\/|$)/i;
const MAX_TEXT = 12_000;
/** Below this much text the site is almost certainly built by JavaScript (or blocked), so it cannot be read. */
const MIN_READABLE_CHARS = 400;
const INTENTS: AeoQueryIntent[] = ['service_cost', 'service_best', 'service_howto', 'brand_trust'];

/* ---------------- Services named on the website (free, from the audit crawl) ---------------- */

// Menu items and page names that are never a service a customer books.
const NOT_A_SERVICE =
  /\b(home|about|contact|blog|news|gallery|reviews?|testimonials?|faqs?|privacy|terms|cookies?|careers?|jobs|login|log in|sign in|account|cart|basket|checkout|shop|book|booking|quote|enquir|team|meet|areas?|locations?|sitemap|offers?|menu|more|read|click|here|call|email|phone|directions|find us|our story|why|policy|accessibility|portfolio|projects|case stud|partners|links|downloads?|welcome|services|what we do)\b/i;

/** A page inside a services section, e.g. /services/mot/ (not the /services index itself). */
const SERVICE_CHILD_PATH = /\/(services?|our-services|what-we-do|treatments?)\//i;

function clean(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[|•»›>].*$/, '')
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, '')
    .trim();
}

/** "MOT Testing" -> "MOT testing", "Car Servicing" -> "car servicing": keeps acronyms, lowercases the rest. */
function asPhrase(text: string): string {
  return text
    .split(' ')
    .map((w) => (/^[A-Z0-9]{2,5}s?$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

function usable(text: string, name: string, category: string): boolean {
  if (text.length < 3 || text.length > 40) return false;
  const words = text.split(' ');
  if (words.length > 5 || !/[a-z]/i.test(text) || /\d{3,}|@|https?:/i.test(text)) return false;
  if (NOT_A_SERVICE.test(text)) return false;
  const lower = text.toLowerCase();
  return lower !== category && !(name && lower.includes(name));
}

function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.host === y.host && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
}

/**
 * The services the business itself names on its website, most prominent first: page headings and menu links that
 * point to pages under /services/ (or similar) count most, then repeated menu links. Used as a hint for the AI and
 * for the DataForSEO fallback.
 */
export function extractSiteServices(
  pages: CrawlPage[] | null | undefined,
  opts: { businessName?: string; city?: string; category?: string } = {}
): string[] {
  const list = Array.isArray(pages) ? pages : [];
  const name = String(opts.businessName || '').toLowerCase().trim();
  const category = String(opts.category || '').toLowerCase().trim();
  const city = String(opts.city || '').trim();
  // "Car Servicing Maidenhead" / "Car Servicing in Maidenhead" -> "Car Servicing"
  const cityPattern = city
    ? new RegExp(`\\s*\\b(in|near|around)?\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s*`, 'gi')
    : null;
  const scores = new Map<string, { label: string; score: number }>();
  const add = (raw: string, points: number) => {
    const text = clean(cityPattern ? String(raw || '').replace(cityPattern, ' ') : raw);
    if (!usable(text, name, category)) return;
    const key = text.toLowerCase();
    const row = scores.get(key) || { label: text, score: 0 };
    row.score += points;
    scores.set(key, row);
  };

  for (const page of list) {
    const onServicePage = SERVICE_CHILD_PATH.test(String(page.url || ''));
    if (onServicePage) (page.h1s || []).slice(0, 1).forEach((h) => add(h, 4));
    for (const link of page.links || []) {
      const href = String(link.href || '');
      if (SERVICE_CHILD_PATH.test(href)) {
        add(String(link.text || ''), 2);
        continue;
      }
      // A menu link whose text matches the heading of the page it opens: a dedicated page, likely a service.
      const target = list.find((p) => p !== list[0] && samePage(String(p.url || ''), href));
      const heading = clean(target?.h1s?.[0] || '').toLowerCase();
      const text = clean(String(link.text || '')).toLowerCase();
      if (heading && text && (heading.includes(text) || text.includes(heading))) add(String(link.text || ''), 1);
    }
  }

  return [...scores.values()]
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((r) => asPhrase(r.label))
    .filter((s, i, all) => all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, 6);
}

/* ---------------- AI-written questions ---------------- */

function extractJson(text: string): any {
  const raw = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Service pages first (they name the services most clearly), then the home page, then the rest. */
function siteText(pages: CrawlPage[], siteServices: string[]): string {
  const hints = siteServices.map((s) => s.toLowerCase());
  const rank = (p: CrawlPage, i: number) => {
    const url = String(p.url || '');
    const heading = String(p.h1s?.[0] || '').toLowerCase();
    if (SERVICE_PATH.test(url) || hints.some((h) => heading.includes(h))) return 0;
    return i === 0 ? 1 : 2;
  };
  return pages
    .map((p, i) => ({ p, r: rank(p, i), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ p }) =>
      [
        `[Page] ${p.url || ''}`,
        p.title,
        ...(p.h1s || []),
        ...(p.h2s || []).slice(0, 12),
        ...(p.h3s || []).slice(0, 12),
        String(p.bodyText || '').slice(0, 2500)
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n')
    .slice(0, MAX_TEXT);
}

function rules(name: string, category: string, where: string) {
  return `Return only JSON:
{"services": ["..."], "questions": [{"query": "...", "kind": "service|brand", "intent": "service_cost|service_best|service_howto|brand_trust"}]}

services:
- Up to 6 specific services a customer can book or buy from this business, most important first,
  e.g. "car servicing", "MOT", "brake repair", "boiler repair", "teeth whitening".
- Never the business type or category ("${category || 'unknown'}"), never generic words such as "services", "repairs",
  "maintenance", "solutions", and no prices, locations or brand names.
- Only services this business really offers.

questions: exactly 3 questions real customers type into Google that bring up a "People also ask" box.
- 2 with kind "service": each about a DIFFERENT service from "services", with different intents
  (service_cost = price, service_best = where to get it / who is best, service_howto = how long, what is included,
  how often, when it is needed). Each one names the service. Never any business name.
- Add "${where}" ONLY when the answer depends on the place (price, where to get it, who is best). Questions whose
  answer is the same everywhere (what is included, how long, how often, when it is needed) have no town
  (right: "What is included in a full car service?", wrong: "What is included in car servicing in Maidenhead?").
- 1 with kind "brand", intent "brand_trust": the way people really search a business, short, with the exact name
  "${name}", e.g. "${name} reviews" or "Is ${name} any good?". Not a long sentence about its reviews.
- Natural, correct UK English, the wording Google really shows in "People also ask". Never use the category as if it
  were a service (wrong: "How much does ${category || 'garage'} cost").`;
}

function wordsOn(service: string, text: string) {
  const lower = text.toLowerCase();
  return service
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .every((w) => lower.includes(w.length > 5 ? w.slice(0, w.length - 2) : w));
}

function validate(
  parsed: any,
  opts: { name: string; category: string; text: string | null }
): { services: string[]; specs: AeoQuerySpec[] } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const name = opts.name.toLowerCase();
  const category = opts.category.toLowerCase();

  const services = (Array.isArray(parsed.services) ? parsed.services : [])
    .map((s: unknown) => String(s || '').replace(/\s+/g, ' ').trim())
    .filter((s: string) => s.length >= 2 && s.length <= 40 && s.toLowerCase() !== category)
    .filter((s: string) => !opts.text || wordsOn(s, opts.text))
    .slice(0, 6);

  const seen = new Set<string>();
  const specs: AeoQuerySpec[] = [];
  for (const row of Array.isArray(parsed.questions) ? parsed.questions : []) {
    const query = cleanSearchLine(String(row?.query || ''));
    const lower = query.toLowerCase();
    if (query.length < 8 || query.length > 120 || seen.has(lower)) continue;
    if (/https?:\/\/|\b(chatgpt|gemini|claude|dataforseo|api)\b/i.test(query)) continue;
    // "How much does garage cost": the category used as a service.
    if (category && new RegExp(`\\b(does|do|is|for|get|book)\\s+(a\\s+|an\\s+)?${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(cost|take|in|near)\\b`, 'i').test(query)) continue;
    const kind: AeoQuerySpec['kind'] = row?.kind === 'brand' ? 'brand' : 'service';
    const named = Boolean(name) && lower.includes(name);
    if (kind === 'service' && named) continue;
    if (kind === 'brand' && !named) continue;
    const intent: AeoQueryIntent =
      kind === 'brand' ? 'brand_trust' : INTENTS.includes(row?.intent) && row.intent !== 'brand_trust' ? row.intent : 'service_best';
    seen.add(lower);
    specs.push({ query, intent, kind });
  }

  const service = specs.filter((s) => s.kind === 'service').slice(0, 2);
  const brand = specs.filter((s) => s.kind === 'brand').slice(0, 1);
  if (service.length < 2 || brand.length < 1) return null;
  return { services, specs: [...service, ...brand] };
}

/**
 * One Gemini call: the services on the business website + 3 People Also Ask questions about those services, written
 * fresh for each audit (no templates). If the site can't be read, or the answer is unusable, Gemini looks the
 * business up with Google Search instead. null when neither works.
 */
export async function generateAeoQuestions(opts: {
  businessName: string;
  category?: string;
  city?: string;
  address?: string;
  website?: string;
  pages?: CrawlPage[] | null;
  siteServices?: string[];
}): Promise<AeoQuestionsResult | null> {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const name = String(opts.businessName || '').trim();
  if (!name) return null;

  const category = String(opts.category || '').trim();
  const city = String(opts.city || '').trim();
  const where = city && city !== 'the local area' ? `in ${city}` : 'near me';
  const pages = Array.isArray(opts.pages) ? opts.pages : [];
  const visible = pages.reduce((n, p) => n + String(p.bodyText || '').length, 0);
  const text = visible >= MIN_READABLE_CHARS ? siteText(pages, opts.siteServices || []) : null;
  const about = `Business: ${name}
Category: ${category || 'unknown'}
Address: ${opts.address || 'unknown'}
Town: ${city || 'unknown'}
Website: ${opts.website || 'unknown'}`;

  const ask = async (prompt: string, search: boolean) => {
    if (!apiKey) return null;
    try {
      return (
        await geminiGenerate(search ? 'questions-search' : 'questions', {
          prompt,
          // Google Search grounding does not allow a JSON response type.
          generationConfig: search ? { temperature: 0.7 } : { temperature: 0.7, responseMimeType: 'application/json' },
          ...(search ? { tools: [{ googleSearch: {} }] } : {}),
          parse: (text) => extractJson(text) || null
        })
      ).value;
    } catch {
      return null;
    }
  };

  if (text) {
    const parsed = await ask(
      `Find the services this local business offers, using only its website text below, and write People Also Ask questions about them.\n\n${about}\n\n${rules(name, category, where)}\n\nWebsite text:\n${text}`,
      false
    );
    const ok = validate(parsed, { name, category, text });
    if (ok) return { ...ok, source: 'site' };
  }

  const parsed = await ask(
    `Find the services this local business offers (look up its website and Google Business Profile), and write People Also Ask questions about them.\n\n${about}\n\n${rules(name, category, where)}`,
    true
  );
  const ok = validate(parsed, { name, category, text: null });
  if (ok) return { ...ok, source: 'search' };

  // Gemini unavailable (quota, outage): DataForSEO instead.
  const viaDataForSeo = await dataForSeoQuestions({
    name,
    category,
    city: city && city !== 'the local area' ? city : '',
    services: opts.siteServices || []
  });
  return viaDataForSeo ? { ...viaDataForSeo, source: 'dataforseo' } : null;
}

function guessIntent(query: string): AeoQueryIntent {
  if (/\b(cost|price|prices|how much|cheap|charge)\b/i.test(query)) return 'service_cost';
  if (/\b(where|best|who|near me|recommend)\b/i.test(query)) return 'service_best';
  return 'service_howto';
}

/**
 * Service questions from Google's real "People also ask" box for "<service> <town>" (one per service, first two
 * services that have one), topped up with ChatGPT-written questions; the business question comes from ChatGPT.
 */
async function dataForSeoQuestions(opts: {
  name: string;
  category: string;
  city: string;
  services: string[];
}): Promise<{ services: string[]; specs: AeoQuerySpec[] } | null> {
  const { name, category, city, services } = opts;
  const paa: Array<{ query: string; kind: 'service'; intent: AeoQueryIntent }> = [];
  const covered: string[] = [];
  for (const service of services.slice(0, 3)) {
    if (paa.length >= 2) break;
    const questions = await fetchPeopleAlsoAskQuestions(`${service} ${city}`.trim());
    const pick = questions.find((q) => !paa.some((p) => p.query.toLowerCase() === q.toLowerCase()));
    if (!pick) continue;
    paa.push({ query: pick, kind: 'service', intent: guessIntent(pick) });
    covered.push(service.toLowerCase());
  }

  // Services Google already gave a question for go last, so ChatGPT's top-up covers a different service.
  const rest = [...services.filter((s) => !covered.includes(s.toLowerCase())), ...services.filter((s) => covered.includes(s.toLowerCase()))];
  const lines = await writeAeoQuestionsWithChatGpt({ businessName: name, city, category, services: rest });
  const mentionsCovered = (q: string) => covered.some((s) => q.toLowerCase().includes(s));
  const repeats = (q: { query: string; kind: string; intent: AeoQueryIntent }) =>
    q.kind !== 'service'
      ? 0
      : Number(mentionsCovered(q.query)) + Number(paa.some((p) => p.intent === q.intent));
  // ChatGPT sometimes adds "... at <business>" to a service question; that part is dropped.
  const atName = new RegExp(`\\s*\\b(at|near|from|by|with)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const written = lines
    .map((query, i) => ({
      query: i === 2 ? query : query.replace(atName, ''),
      kind: (i === 2 ? 'brand' : 'service') as 'brand' | 'service',
      intent: i === 2 ? ('brand_trust' as const) : guessIntent(query)
    }))
    // Prefer a top-up about another service and another intent (not two price questions).
    .sort((a, b) => repeats(a) - repeats(b));
  if (!written.some((q) => q.kind === 'brand') && city) {
    written.push({ query: `${name} reviews ${city}`, kind: 'brand', intent: 'brand_trust' });
  }
  return validate({ services, questions: [...paa, ...written] }, { name, category, text: null });
}
