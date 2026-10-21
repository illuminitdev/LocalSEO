
import { cityFromAddress, normalizePrompts, normalizeServices, type AiPrompt } from './aiInsights';

/* ---------------- Website text (free, no paid APIs; also used by lead enrichment for NAP) ---------------- */

export const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const NAMED_ENTITIES: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    quot: '"',
    apos: "'",
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"',
    ndash: '-',
    mdash: '-',
    hellip: '...',
    pound: '£'
};

/** "Smith&#039;s", "Smith&rsquo;s" and "Smith &amp; Sons" must read like the name on the GBP. */
export function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
    return decodeEntities(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ');
}

/** Text the visible page does not show but that still names the business: <title>, meta tags, JSON-LD (telephone, address). */
export function hiddenBusinessText(html: string): string {
    const parts: string[] = [];
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title) parts.push(title[1]);
    for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:site_name|og:title|application-name|twitter:title)["'][^>]*>/gi)) {
        const c = m[0].match(/content=["']([^"']*)["']/i);
        if (c) parts.push(c[1]);
    }
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        parts.push(m[1].replace(/[{}\[\]",:]/g, ' '));
    }
    // tel: links often carry the phone number even when the visible text is formatted oddly
    parts.push((html.match(/href=["']tel:([^"']+)["']/gi) || []).join(' '));
    return decodeEntities(parts.join(' '));
}

export type Page = { text: string; visibleChars: number };

export async function fetchPage(url: string): Promise<Page | null> {
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-GB,en;q=0.9' },
            signal: AbortSignal.timeout(9000)
        });
        if (!res.ok) return null;
        const html = (await res.text()).slice(0, 800_000);
        const visible = htmlToText(html);
        return { text: `${visible} ${hiddenBusinessText(html)}`, visibleChars: visible.length };
    } catch {
        return null;
    }
}

/** Below this much text the page is almost certainly built by JavaScript (or blocked), so it cannot be judged. */
export const MIN_READABLE_CHARS = 400;

/** "example.com" or "https://example.com/x" -> { base, origin }; null when it is not a usable URL. */
export function siteBase(website: string): { base: string; origin: string } | null {
    let base = String(website || '').trim();
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    try {
        return { base, origin: new URL(base).origin };
    } catch {
        return null;
    }
}


const SERVICE_PATHS = ['/services', '/our-services', '/treatments', '/our-treatments', '/what-we-do', '/pricing', '/prices'];
const MAX_TEXT = 12_000;

export type Generate = (prompt: string, config?: any) => Promise<string>;
export type ServiceBusiness = { name?: string; category?: string; address?: string; website?: string };

/** Home page + likely services pages. null when the site can't be read (blocked, down, JavaScript-only). */
export async function fetchServiceText(website: string): Promise<string | null> {
    const site = siteBase(website);
    if (!site) return null;
    const [home, ...extra] = await Promise.all([site.base, ...SERVICE_PATHS.map((p) => site.origin + p)].map(fetchPage));
    if (home === null) return null;
    // Services pages first: they name the services most clearly; the home page fills the rest.
    const pages = [...extra.filter((x): x is Page => Boolean(x)), home];
    const visible = pages.reduce((n, p) => n + p.visibleChars, 0);
    if (visible < MIN_READABLE_CHARS) return null;
    return pages.map((p) => p.text).join(' ').slice(0, MAX_TEXT);
}

function parseResult(text: string): { services?: unknown; prompts?: unknown } {
    const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    try {
        return JSON.parse(cleaned.slice(start, end + 1)) || {};
    } catch {
        return {};
    }
}

const rules = (where: string) => `Return only JSON:
{"services": ["..."], "prompts": [{"prompt": "...", "topic": "..."}]}

services:
- Up to 10 specific services or treatments a customer can book or buy, most important first.
- Each one is a short name a customer would type into Google, e.g. "laser hair removal", "facials", "skin care",
  "teeth whitening", "invisalign", "botox", "dermal fillers", "boiler repair".
- Never generic words or groups: not "health", "treatments", "services", "aesthetics", "beauty", "wellness",
  "consultation", "products", and never a type of place like "hospital", "clinic" or "salon".
- Only services this business really offers. Do not repeat the main category, and do not add locations, prices or brand names.
- If you cannot find specific services, return "services": [].

prompts:
- 15 questions a real local customer would type into ChatGPT, Claude or Perplexity to FIND a business that provides
  something. Each question must lead the AI to name local businesses, not to explain a treatment or compare treatments.
- About 4 with topic "business": about this kind of business as a whole (e.g. "Who is the best aesthetics clinic ${where}?").
- The rest spread over the services, 1-2 each, with topic set to that exact service name from "services"
  (e.g. "Where can I get skin rejuvenation ${where}?", "How much are dental implants ${where} and who is good?").
- Mix intents: best / recommend, price, reviews and trust, nearby area, first visit, availability or urgent where it fits.
- Natural, correct English, written the way people really ask. Every question mentions the town or area, or says "near me".
- Never use this business's own name or any other business name.`;

/** The words of a service (stem of 4+ letters) must appear in the site text, so names the model made up are dropped. */
function onSite(service: string, siteText: string) {
    const text = siteText.toLowerCase();
    return service
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2)
        .every((w) => text.includes(w.length > 5 ? w.slice(0, w.length - 2) : w));
}

/**
 * One Gemini call: the services this business offers + about 15 customer questions about it and those services
 * (used as its LLM prompts instead of fixed templates).
 */
export async function detectServices(business: ServiceBusiness, generate: Generate): Promise<{ services: string[]; prompts: AiPrompt[] }> {
    const city = cityFromAddress(String(business.address || ''));
    const where = city ? `in ${city}` : 'near me';
    const about = `Business: ${business.name || 'unknown'}
Main category: ${business.category || 'unknown'}
Address: ${business.address || 'unknown'}
Town: ${city || 'unknown'}
Website: ${business.website || 'unknown'}`;
    const siteText = business.website ? await fetchServiceText(business.website) : null;
    const text = siteText
        ? await generate(
              `Find the services this local business offers, using only the website text below, and write customer questions about it.\n\n${about}\n\n${rules(where)}\n\nWebsite text:\n${siteText}`,
              { responseMimeType: 'application/json' }
          )
        : // Site can't be read directly (JavaScript-only or blocked): let Gemini look it up.
          await generate(
              `Find the services this local business offers (use its website and Google Business Profile), and write customer questions about it.\n\n${about}\n\n${rules(where)}`,
              { tools: [{ googleSearch: {} }] }
          );
    const result = parseResult(text);
    const all = normalizeServices(result.services, business.category);
    const services = siteText ? all.filter((s) => onSite(s, siteText)) : all;
    return { services, prompts: normalizePrompts(result.prompts, { name: business.name, services }) };
}
