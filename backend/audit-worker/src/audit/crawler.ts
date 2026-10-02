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

function extractPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim();
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
      const page = extractPage(res.text, res.url || next);
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

  return {
    fetchedAt: new Date().toISOString(),
    requestedUrl: start.href,
    finalUrl: pages[0]?.url || start.href,
    origin,
    https: start.protocol === 'https:',
    pageCount: pages.length,
    pages,
    robotsTxt,
    sitemapFound,
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
