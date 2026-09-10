import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (compatible; ZappSitesAuditBot/1.0; +https://zappsites.local/audit) AppleWebKit/537.36';

function normalizeUrl(input) {
  let url = String(input || '').trim();
  if (!url) throw new Error('Website URL is required');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return new URL(url);
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
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

function extractJsonLdBlocks(html) {
  const $ = cheerio.load(html);
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // ignore invalid JSON-LD
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
    hasFaqSchema,
    hasLocalBusinessSchema,
    hasPersonSchema,
    spaHeuristic,
    scriptTagCount: scriptTags,
    hasCta,
    htmlLength: html.length
  };
}

/**
 * Crawl homepage + a limited set of same-origin internal links.
 */
export async function crawlWebsite(websiteUrl, { maxPages = 12 } = {}) {
  const start = normalizeUrl(websiteUrl);
  const origin = start.origin;
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
      // ignore
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
      const res = await fetchText(next);
      if (!res.ok) {
        errors.push({ url: next, status: res.status });
        continue;
      }
      const ct = res.headers.get('content-type') || '';
      if (ct && !/html|xml|text\/plain/i.test(ct) && !res.text.includes('<html')) {
        continue;
      }
      const page = extractPage(res.text, res.url || next);
      pages.push(page);

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

  // Sample up to 8 internal links for broken-link probe
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
