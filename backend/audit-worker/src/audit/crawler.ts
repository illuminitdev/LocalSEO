import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (compatible; ZappSitesAuditBot/1.0; +https://zappsites.local/audit) AppleWebKit/537.36';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const BOT_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const BROWSER_HEADERS = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9'
};

function normalizeUrl(input) {
  let url = String(input || '').trim();
  if (!url) throw new Error('Website URL is required');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return new URL(url);
}

function blockedOrEmpty(res) {
  if (!res) return true;
  if (res.status === 401 || res.status === 403 || res.status === 429) return true;
  return !String(res.text || '').trim();
}

async function fetchText(url, timeoutMs = 20000, headers = BOT_HEADERS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtmlPage(url, preferBrowser = false) {
  let usedBrowser = preferBrowser;
  const failed = (err) => ({
    ok: false,
    status: 0,
    url,
    text: '',
    headers: new Headers(),
    message: err?.message || 'fetch failed'
  });
  let res = await fetchText(url, 20000, preferBrowser ? BROWSER_HEADERS : BOT_HEADERS).catch(failed);
  const retries = preferBrowser ? 1 : 2;
  if (blockedOrEmpty(res)) {
    usedBrowser = true;
    for (let attempt = 0; attempt < retries && blockedOrEmpty(res); attempt++) {
      try {
        res = await fetchText(url, 45000, BROWSER_HEADERS);
      } catch (err) {
        res = { ok: false, status: 0, url, text: '', headers: new Headers(), message: err.message };
      }
    }
  }
  if (blockedOrEmpty(res)) {
    try {
      const httpUrl = new URL(url);
      if (httpUrl.protocol === 'https:') {
        httpUrl.protocol = 'http:';
        const httpRes = await fetchText(httpUrl.href, 45000, BROWSER_HEADERS);
        if (httpRes.ok && String(httpRes.text || '').trim()) {
          return { res: httpRes, usedBrowser: true };
        }
      }
    } catch {
      /* keep the https result */
    }
  }
  return { res, usedBrowser };
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function absolutize(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function dayLabel(value) {
  const raw = String(value || '');
  const name = raw.split('/').pop() || raw;
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function pushHourLine(lines, value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || lines.includes(text)) return;
  lines.push(text);
}

function walkOpeningHours(node, lines, seen = new Set()) {
  if (!node || seen.has(node)) return;
  if (typeof node !== 'object') return;
  seen.add(node);
  if (Array.isArray(node)) {
    node.forEach((item) => walkOpeningHours(item, lines, seen));
    return;
  }
  if (node.openingHours) {
    const value = node.openingHours;
    if (Array.isArray(value)) value.forEach((item) => pushHourLine(lines, item));
    else pushHourLine(lines, value);
  }
  if (node.openingHoursSpecification) {
    const specs = Array.isArray(node.openingHoursSpecification)
      ? node.openingHoursSpecification
      : [node.openingHoursSpecification];
    for (const spec of specs) {
      if (!spec || typeof spec !== 'object') continue;
      const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
      const dayText = days.map(dayLabel).filter(Boolean).join(', ');
      const opens = String(spec.opens || '').trim();
      const closes = String(spec.closes || '').trim();
      if (dayText && (opens || closes)) pushHourLine(lines, `${dayText} ${opens}-${closes}`);
    }
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkOpeningHours(value, lines, seen);
  }
}

function visibleHourLines(bodyText) {
  const text = String(bodyText || '');
  const lines = [];
  const ranged =
    /\b((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?(?:\s*(?:-|–|—|to)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?)?)\b[^.\n]{0,80}?(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/gi;
  let match;
  while ((match = ranged.exec(text))) {
    pushHourLine(lines, match[0]);
    if (lines.length >= 14) break;
  }
  if (/\bopen\s+24\s*hours\b|\b24\s*\/\s*7\b/i.test(text)) pushHourLine(lines, 'Open 24 hours');
  return lines;
}

function extractJsonLdBlocks(html) {
  const $ = cheerio.load(html);
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      
    }
  });
  return blocks;
}

function flattenSchemaTypes(node, out: Set<string> = new Set()) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenSchemaTypes(n, out));
    return out;
  }
  if (typeof node === 'object') {
    const t = node['@type'];
    if (typeof t === 'string') out.add(t);
    if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.add(x));
    if (node['@graph']) flattenSchemaTypes(node['@graph'], out);
    Object.values(node).forEach((v) => {
      if (v && typeof v === 'object') flattenSchemaTypes(v, out);
    });
  }
  return out;
}

/** NAP and entity details from the first LocalBusiness-style JSON-LD node. */
function schemaEntityFrom(jsonLd) {
  const nodes = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const type = [].concat(node['@type'] || []).join(' ');
    if (/LocalBusiness|Organization|ProfessionalService|HomeAndConstructionBusiness|Store|Contractor|Service/i.test(type)) {
      nodes.push(node);
    }
    if (node['@graph']) walk(node['@graph']);
  };
  walk(jsonLd);
  const node = nodes.find((n) => n.telephone || n.address) || nodes[0];
  if (!node) return null;
  const addr = node.address;
  const address =
    typeof addr === 'string'
      ? addr
      : addr && typeof addr === 'object'
        ? [addr.streetAddress, addr.addressLocality, addr.postalCode].filter(Boolean).join(', ')
        : '';
  return {
    type: [].concat(node['@type'] || []).join(', '),
    name: String(node.name || '').trim(),
    telephone: String(node.telephone || '').trim(),
    address: String(address || '').trim(),
    sameAs: [].concat(node.sameAs || []).map(String).slice(0, 12),
    hasOpeningHours: Boolean(node.openingHours || node.openingHoursSpecification),
    hasGeo: Boolean(node.geo || node.hasMap),
    hasAreaServed: Boolean(node.areaServed)
  };
}

function extractPage(html, pageUrl, headers = null) {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim();
  const metaRobots = [
    $('meta[name="robots"]').attr('content') || '',
    $('meta[name="googlebot"]').attr('content') || ''
  ]
    .join(',')
    .toLowerCase();
  const xRobotsTag = String(headers?.get?.('x-robots-tag') || '').toLowerCase();
  const noindex = /noindex/.test(metaRobots) || /noindex/.test(xRobotsTag);
  const footerText = $('footer').text().replace(/\s+/g, ' ').trim();
  const hasMapsEmbed =
    $('iframe[src*="google.com/maps"], iframe[src*="maps.google"]').length > 0 ||
    $('a[href*="maps.google"], a[href*="google.com/maps"], a[href*="g.page"], a[href*="maps.app.goo.gl"]').length > 0;
  const metaDescription = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  ).trim();
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  const h1s = $('h1')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h2s = $('h2')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h3s = $('h3')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    const abs = absolutize(pageUrl, href);
    if (abs) links.push({ href: abs, text });
  });

  const images = [];
  $('img').each((_, el) => {
    images.push({
      src: $(el).attr('src') || '',
      alt: ($(el).attr('alt') || '').trim()
    });
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const htmlLower = html.toLowerCase();
  const jsonLd = extractJsonLdBlocks(html);
  const openingHourLines = [];
  walkOpeningHours(jsonLd, openingHourLines);
  for (const line of visibleHourLines(bodyText)) pushHourLine(openingHourLines, line);
  const schemaTypes = [...flattenSchemaTypes(jsonLd)];
  const hasFaqSchema = schemaTypes.some((t) => /FAQPage/i.test(t));
  const hasLocalBusinessSchema = schemaTypes.some((t) =>
    /LocalBusiness|MedicalBusiness|Physician|Dentist|ProfessionalService|HomeAndConstructionBusiness/i.test(t)
  );
  const hasPersonSchema = schemaTypes.some((t) => /Person/i.test(t));

  const scriptTags = $('script[src]').length + (htmlLower.match(/<script[\s>]/gi) || []).length;
  const spaHeuristic = {
    thinBody: bodyText.length < 400,
    manyScripts: scriptTags >= 8,
    rootAppShell: /id=["']root["']|id=["']app["']|data-reactroot|ng-version/i.test(html),
    likelySpa: bodyText.length < 400 && scriptTags >= 6
  };

  const telLinks = links.filter((l) => l.href.startsWith('tel:'));
  const phonesInText = (bodyText.match(/(?:\+44|0)\d[\d\s()-]{8,}/g) || []).map((p) =>
    p.replace(/\s+/g, ' ').trim()
  );
  const whatsapp = links.some(
    (l) => /wa\.me|whatsapp\.com|api\.whatsapp/i.test(l.href) || /whatsapp/i.test(l.text)
  );
  const hasForm = $('form').length > 0 || htmlLower.includes('type="email"') || htmlLower.includes("type='email'");
  const hasSchema =
    jsonLd.length > 0 ||
    htmlLower.includes('itemtype=') ||
    htmlLower.includes('schema.org');

  const ctaKeywords = /\b(get a quote|free quote|contact us|call now|book now|request a quote|enquire|emergency)\b/i;
  const hasCta =
    links.some((l) => ctaKeywords.test(l.text)) ||
    ctaKeywords.test(bodyText.slice(0, 2000)) ||
    $('button, .btn, a.button').length > 0;

  return {
    url: pageUrl,
    title,
    noindex,
    metaRobots,
    xRobotsTag,
    footerText: footerText.slice(0, 2000),
    hasMapsEmbed,
    schemaEntity: schemaEntityFrom(jsonLd),
    metaDescription,
    canonical,
    viewport,
    h1s,
    h2s,
    h3s,
    links,
    images,
    bodyText,
    telLinks,
    phonesInText,
    hasWhatsapp: whatsapp,
    hasForm,
    hasSchema,
    schemaTypes,
    openingHourLines: openingHourLines.slice(0, 21),
    hasFaqSchema,
    hasLocalBusinessSchema,
    hasPersonSchema,
    spaHeuristic,
    scriptTagCount: scriptTags,
    hasCta,
    htmlLength: html.length
  };
}




const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Google-Extended', 'PerplexityBot'];

/** Groups of robots.txt rules per user agent ("*" included). */
function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'disallow') current.disallow.push(value);
    if (key === 'allow') current.allow.push(value);
  }
  return { groups, sitemaps };
}

/** True when the rules that apply to this agent block the whole site. */
function robotsBlocksSite(parsed, agent) {
  const name = agent.toLowerCase();
  const own = parsed.groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)));
  const rules = own.length ? own : parsed.groups.filter((g) => g.agents.includes('*'));
  return rules.some((g) => g.disallow.includes('/') && !g.allow.includes('/'));
}

export function analyseRobots(text) {
  if (!text) return null;
  const parsed = parseRobots(text);
  return {
    blocksAll: robotsBlocksSite(parsed, '*'),
    blocksGooglebot: robotsBlocksSite(parsed, 'Googlebot'),
    aiCrawlersBlocked: AI_CRAWLERS.filter((bot) => robotsBlocksSite(parsed, bot)),
    sitemapUrls: parsed.sitemaps.slice(0, 5)
  };
}

/** Sitemap quality: valid XML, URL count, homepage listed, and a small sample of URLs that load. */
async function analyseSitemap(urls, origin) {
  for (const url of urls) {
    try {
      const res = await fetchText(url, 10000);
      if (!res.ok) continue;
      let xml = res.text;
      if (/<sitemapindex/i.test(xml)) {
        const child = (xml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1];
        if (!child) continue;
        const sub = await fetchText(child, 10000);
        if (!sub.ok) continue;
        xml = sub.text;
      }
      if (!/<urlset/i.test(xml)) continue;
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      const home = origin.replace(/\/$/, '');
      const hasHomepage = locs.some((l) => l.replace(/\/$/, '').replace('://www.', '://') === home.replace('://www.', '://'));
      const broken = [];
      for (const loc of locs.slice(0, 3)) {
        try {
          const r = await fetchText(loc, 10000);
          if (r.status >= 400) broken.push({ url: loc, status: r.status });
        } catch {
          broken.push({ url: loc, status: 0 });
        }
      }
      return { url, valid: true, urlCount: locs.length, hasHomepage, brokenSample: broken };
    } catch {
      /* try the next sitemap location */
    }
  }
  return null;
}

/** Whether http:// and the www / non-www host all redirect to the one site the crawl landed on. */
async function analyseRedirects(finalUrl) {
  let final;
  try {
    final = new URL(finalUrl);
  } catch {
    return null;
  }
  const host = final.hostname;
  const altHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const variants = [`http://${host}/`, `https://${altHost}/`];
  const results = [];
  for (const v of variants) {
    try {
      const r = await fetchText(v, 10000, BROWSER_HEADERS);
      const landed = new URL(r.url || v);
      results.push({ from: v, to: landed.origin, ok: landed.origin === final.origin });
    } catch {
      results.push({ from: v, to: null, ok: null });
    }
  }
  const measured = results.filter((r) => r.ok !== null);
  return {
    finalOrigin: final.origin,
    variants: results,
    consolidated: measured.length ? measured.every((r) => r.ok) : null
  };
}

export async function crawlWebsite(websiteUrl, { maxPages = 12 } = {}) {
  const start = normalizeUrl(websiteUrl);
  let origin = start.origin;
  let preferBrowser = false;
  const visited = new Set();
  const queue = [start.href];
  const pages = [];
  const errors = [];
  let robotsTxt = null;
  let sitemapFound = false;

  try {
    const robots = await fetchText(`${origin}/robots.txt`, 8000);
    if (robots.ok) {
      robotsTxt = robots.text.slice(0, 5000);
      if (/sitemap:\s*\S+/i.test(robotsTxt)) sitemapFound = true;
    }
  } catch (e) {
    errors.push({ url: `${origin}/robots.txt`, message: e.message });
  }

  for (const path of ['/sitemap.xml', '/sitemap_index.xml']) {
    if (sitemapFound) break;
    try {
      const sm = await fetchText(`${origin}${path}`, 8000);
      if (sm.ok && /<urlset|<sitemapindex/i.test(sm.text)) sitemapFound = true;
    } catch {
      
    }
  }

  let llmsTxtFound = false;
  let llmsTxtSnippet = '';
  try {
    const llms = await fetchText(`${origin}/llms.txt`, 8000);
    if (llms.ok && llms.text && llms.text.trim().length > 20) {
      llmsTxtFound = true;
      llmsTxtSnippet = llms.text.slice(0, 500);
    }
  } catch (e) {
    errors.push({ url: `${origin}/llms.txt`, message: e.message });
  }

  while (queue.length && pages.length < maxPages) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);

    try {
      const fetched = await fetchHtmlPage(next, preferBrowser);
      const res = fetched.res;
      if (fetched.usedBrowser) preferBrowser = true;
      if (!res.ok || !String(res.text || '').trim()) {
        errors.push({ url: next, status: res.status || 0 });
        continue;
      }
      const ct = res.headers.get('content-type') || '';
      if (ct && !/html|xml|text\/plain/i.test(ct) && !res.text.includes('<html')) {
        continue;
      }
      const page = extractPage(res.text, res.url || next, res.headers);
      pages.push(page);
      if (pages.length === 1) {
        try {
          origin = new URL(page.url || res.url || next).origin;
        } catch {
          /* keep the requested origin */
        }
      }

      for (const link of page.links) {
        if (!sameOrigin(origin, link.href)) continue;
        const u = new URL(link.href);
        u.hash = '';
        if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|css|js)(\?|$)/i.test(u.pathname)) continue;
        if (!visited.has(u.href) && queue.length + pages.length < maxPages * 3) {
          queue.push(u.href);
        }
      }
    } catch (e) {
      errors.push({ url: next, message: e.message });
    }
  }

  const allText = pages.map((p) => `${p.title} ${p.bodyText}`).join(' ').toLowerCase();
  const allHrefs = pages.flatMap((p) => p.links.map((l) => l.href.toLowerCase()));
  const allLinkText = pages.flatMap((p) => p.links.map((l) => l.text.toLowerCase()));

  
  const sampleLinks = [...new Set(allHrefs.filter((h) => h.startsWith(origin.toLowerCase())))].slice(0, 8);
  const broken = [];
  for (const href of sampleLinks) {
    try {
      const r = await fetchText(href, 10000);
      if (r.status >= 400) broken.push({ url: href, status: r.status });
    } catch (e) {
      broken.push({ url: href, message: e.message });
    }
  }

  const schemaTypes = [...new Set(pages.flatMap((p) => p.schemaTypes || []))];
  const websiteHours = [
    ...new Set(pages.flatMap((p) => (Array.isArray(p.openingHourLines) ? p.openingHourLines : [])))
  ].slice(0, 21);
  const hasFaqSchema = pages.some((p) => p.hasFaqSchema);
  const hasLocalBusinessSchema = pages.some((p) => p.hasLocalBusinessSchema);
  const hasPersonSchema = pages.some((p) => p.hasPersonSchema);
  const spaHeuristic = pages[0]?.spaHeuristic || null;
  const sitePhones = [
    ...new Set(
      pages.flatMap((p) => {
        const fromText = p.phonesInText || [];
        const fromTel = (p.telLinks || [])
          .map((l) => String(l.href || '').replace(/^tel:/i, '').trim())
          .filter(Boolean);
        return [...fromText, ...fromTel];
      })
    )
  ];

  const finalUrl = pages[0]?.url || start.href;
  const robots = analyseRobots(robotsTxt);
  const sitemap = await analyseSitemap(
    [...(robots?.sitemapUrls || []), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`],
    origin
  );
  const redirects = pages.length ? await analyseRedirects(finalUrl) : null;
  let finalHost = '';
  try {
    finalHost = new URL(finalUrl).hostname.replace(/^www\./, '');
  } catch {
    /* keep empty */
  }
  const home = pages[0];
  let canonicalHost = '';
  try {
    canonicalHost = home?.canonical ? new URL(home.canonical, finalUrl).hostname.replace(/^www\./, '') : '';
  } catch {
    /* keep empty */
  }
  // "www.site.com" without https:// is read as a relative path, i.e. a page that does not exist.
  const canonicalRaw = String(home?.canonical || '').trim();
  const canonicalValid = !canonicalRaw || /^https?:\/\//i.test(canonicalRaw) || canonicalRaw.startsWith('/');
  const titleCounts = new Map();
  for (const p of pages) {
    const t = String(p.title || '').trim().toLowerCase();
    if (t) titleCounts.set(t, (titleCounts.get(t) || 0) + 1);
  }
  const duplicateTitles = [...titleCounts.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  const technical = {
    robots,
    sitemap,
    redirects,
    noindexPages: pages.filter((p) => p.noindex).map((p) => p.url).slice(0, 5),
    homepageNoindex: Boolean(home?.noindex),
    canonicalHost,
    canonicalValid,
    canonicalMatchesHost: home?.canonical ? canonicalHost === finalHost : null,
    duplicateTitles: duplicateTitles.slice(0, 5),
    schemaEntity: pages.map((p) => p.schemaEntity).find(Boolean) || null,
    hasMapsEmbed: pages.some((p) => p.hasMapsEmbed),
    footerText: home?.footerText || ''
  };

  return {
    fetchedAt: new Date().toISOString(),
    requestedUrl: start.href,
    finalUrl,
    origin,
    https: /^https:/i.test(finalUrl),
    technical,
    pageCount: pages.length,
    pages,
    robotsTxt,
    sitemapFound: sitemapFound || Boolean(sitemap?.valid),
    llmsTxtFound,
    llmsTxtSnippet,
    schemaTypes,
    websiteHours,
    hasFaqSchema,
    hasLocalBusinessSchema,
    hasPersonSchema,
    spaHeuristic,
    sitePhones,
    brokenLinks: broken,
    errors,
    corpus: {
      text: allText,
      hrefs: allHrefs,
      linkTexts: allLinkText
    }
  };
}
