// @ts-nocheck
/**
 * Map crawl (+ optional lighthouse) results onto checklist Pass/Fail.
 */

function setCheck(checksById, id, status, evidence = '', notes = '') {
  const c = checksById.get(id);
  if (!c) return;
  // Do not overwrite operator-edited values if already pass/fail and source is operator
  if (c.source === 'operator' && (c.status === 'pass' || c.status === 'fail') && c.notes) {
    return;
  }
  c.status = status;
  c.evidence = evidence;
  if (notes) c.notes = notes;
}

function passFail(cond, evidencePass, evidenceFail) {
  return cond
    ? { status: 'pass', evidence: evidencePass }
    : { status: 'fail', evidence: evidenceFail };
}

function textHasAny(text, terms) {
  return terms.some((t) => t && text.includes(String(t).toLowerCase()));
}

function pathOrTextHas(corpus, terms) {
  const t = terms.map((x) => String(x).toLowerCase());
  if (textHasAny(corpus.text, t)) return true;
  if (corpus.hrefs.some((h) => t.some((term) => h.includes(term.replace(/\s+/g, '-')) || h.includes(term.replace(/\s+/g, ''))))) {
    return true;
  }
  if (corpus.linkTexts.some((l) => t.some((term) => l.includes(term)))) return true;
  return false;
}

function questionAnswered(corpus, question) {
  const q = String(question || '').toLowerCase();
  const keywords = q
    .replace(/[?]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['does', 'what', 'when', 'where', 'have', 'much', 'long', 'should', 'professional', 'worth'].includes(w));
  const hits = keywords.filter((w) => corpus.text.includes(w)).length;
  return hits >= Math.min(3, Math.max(2, Math.ceil(keywords.length * 0.4)));
}

export function applyWebsiteChecks(
  checks: import('../types.js').ChecklistCheck[],
  crawl: any,
  lighthouse: any = null,
  context: { city?: string; phone?: string; address?: string; gbpLookup?: any } = {}
) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const home = crawl.pages[0];
  const corpus = crawl.corpus;
  const city = String(context.city || '').toLowerCase();

  if (!home) {
    for (const c of checks) {
      if (c.source === 'crawl' || c.source === 'lighthouse') {
        c.status = 'fail';
        c.evidence = 'Website could not be fetched';
      }
    }
    return checks;
  }

  // §3 Basic
  setCheck(byId, 'web_basic_1', 'pass', `Fetched ${crawl.finalUrl} (${crawl.pageCount} pages)`);
  {
    const r = passFail(crawl.https, 'HTTPS enabled', 'Site is not on HTTPS');
    setCheck(byId, 'web_basic_2', r.status, r.evidence);
  }
  {
    const r = passFail(!!home.viewport, `viewport: ${home.viewport}`, 'No mobile viewport meta tag');
    setCheck(byId, 'web_basic_3', r.status, r.evidence);
  }
  if (lighthouse?.performance != null) {
    const ok = lighthouse.performance >= 0.5;
    setCheck(
      byId,
      'web_basic_4',
      ok ? 'pass' : 'fail',
      `Lighthouse performance ${(lighthouse.performance * 100).toFixed(0)}`
    );
  } else {
    setCheck(byId, 'web_basic_4', 'unknown', 'Lighthouse not available on this server');
  }
  {
    const modern =
      home.htmlLength > 5000 && (home.h1s.length > 0 || home.h2s.length > 0) && home.hasCta;
    const r = passFail(modern, 'Clear structure and CTA signals present', 'Weak layout/CTA signals on homepage');
    setCheck(byId, 'web_basic_5', r.status, r.evidence);
  }
  {
    const r = passFail(
      home.telLinks.length > 0 || /(?:\+44|0)\d[\d\s()-]{8,}/.test(home.bodyText),
      home.telLinks[0]?.href || 'Phone pattern found in text',
      'No clear phone number / tel: link'
    );
    setCheck(byId, 'web_basic_6', r.status, r.evidence);
  }
  setCheck(
    byId,
    'web_basic_7',
    home.hasCta ? 'pass' : 'fail',
    home.hasCta ? 'CTA language or buttons found' : 'No clear CTA detected'
  );
  setCheck(
    byId,
    'web_basic_8',
    home.hasForm || crawl.pages.some((p) => p.hasForm) ? 'pass' : 'fail',
    home.hasForm ? 'Form found on homepage' : crawl.pages.some((p) => p.hasForm) ? 'Form found on site' : 'No contact/quote form detected'
  );
  setCheck(
    byId,
    'web_basic_9',
    home.hasWhatsapp || crawl.pages.some((p) => p.hasWhatsapp) ? 'pass' : 'fail',
    'WhatsApp link scan'
  );
  {
    const emergency = /emergency|24\/7|24-7|call.?out/i.test(home.bodyText) || corpus.linkTexts.some((t) => /emergency/.test(t));
    setCheck(byId, 'web_basic_10', emergency ? 'pass' : 'fail', emergency ? 'Emergency language found' : 'No emergency CTA language');
  }

  // Homepage clarity
  setCheck(
    byId,
    'web_home_1',
    home.h1s.length || home.title ? 'pass' : 'fail',
    `H1: ${home.h1s[0] || 'none'}; title: ${home.title || 'none'}`
  );
  {
    const areaOk =
      (city && home.bodyText.toLowerCase().includes(city)) ||
      /area|cover|serving|we (serve|cover)|across/i.test(home.bodyText);
    setCheck(
      byId,
      'web_home_2',
      areaOk ? 'pass' : 'fail',
      city ? `Looking for service area / “${city}” on homepage` : 'Service-area language scan on homepage'
    );
  }
  setCheck(
    byId,
    'web_home_3',
    /why (choose|us)|trusted|insured|years|accredited|guarantee/i.test(home.bodyText) ? 'pass' : 'fail',
    'Trust / why-choose language'
  );
  setCheck(
    byId,
    'web_home_4',
    home.telLinks.length > 0 || home.hasForm || home.hasCta ? 'pass' : 'fail',
    'Contact path present'
  );
  setCheck(
    byId,
    'web_home_5',
    home.title.length > 10 ? 'pass' : 'fail',
    `Title: ${home.title || '(empty)'}`
  );

  // Service pages
  for (const c of checks) {
    if (c.section !== 'service_pages') continue;
    const terms = c.matchTerms || [c.label.replace(/ page$/i, '').toLowerCase()];
    const found = pathOrTextHas(corpus, terms);
    setCheck(byId, c.id, found ? 'pass' : 'fail', found ? `Matched: ${terms.join(', ')}` : `No page/signal for: ${terms.join(', ')}`);
  }

  // Location pages
  for (const c of checks) {
    if (!String(c.id).startsWith('loc_') || String(c.id).startsWith('loc_qual_')) continue;
    const terms = c.matchTerms || [];
    const found = pathOrTextHas(corpus, terms);
    setCheck(byId, c.id, found ? 'pass' : 'fail', found ? `Found ${terms.join(', ')}` : `No location page signal for ${terms.join(', ')}`);
  }

  const uniqueHint = crawl.pageCount >= 3;
  setCheck(byId, 'loc_qual_1', uniqueHint ? 'pass' : 'unknown', `${crawl.pageCount} pages crawled — uniqueness spot-check recommended`);
  setCheck(
    byId,
    'loc_qual_2',
    /location|area|cover|serving|across/i.test(corpus.text) ? 'pass' : 'fail',
    'Natural location language'
  );
  setCheck(
    byId,
    'loc_qual_3',
    /testimonial|review|customer said|what our/i.test(corpus.text) ? 'pass' : 'fail',
    'Testimonials language'
  );
  setCheck(
    byId,
    'loc_qual_4',
    /case study|recent (job|project)|gallery|our work/i.test(corpus.text) ? 'pass' : 'fail',
    'Project / case study signals'
  );
  setCheck(
    byId,
    'loc_qual_5',
    crawl.pageCount > 1 ? 'pass' : 'fail',
    `Internal pages discovered: ${crawl.pageCount}`
  );

  // On-page
  setCheck(byId, 'onpage_1', home.title ? 'pass' : 'fail', home.title || 'Missing title');
  setCheck(
    byId,
    'onpage_2',
    home.metaDescription.length >= 50 ? 'pass' : 'fail',
    home.metaDescription ? home.metaDescription.slice(0, 160) : 'Missing meta description'
  );
  setCheck(byId, 'onpage_3', home.h1s.length === 1 ? 'pass' : home.h1s.length === 0 ? 'fail' : 'fail', `H1 count: ${home.h1s.length}`);
  setCheck(byId, 'onpage_4', home.h2s.length >= 2 ? 'pass' : 'fail', `H2 count: ${home.h2s.length}`);
  setCheck(byId, 'onpage_5', home.title.length > 5 ? 'pass' : 'fail', home.title);
  setCheck(
    byId,
    'onpage_6',
    byId.get('web_home_2')?.status === 'pass' ? 'pass' : 'fail',
    'Location keyword present on site'
  );
  setCheck(byId, 'onpage_7', home.links.filter((l) => l.href.startsWith(crawl.origin)).length > 3 ? 'pass' : 'fail', 'Internal link count on homepage');
  {
    const imgs = crawl.pages.flatMap((p) => p.images);
    const withAlt = imgs.filter((i) => i.alt).length;
    const ratio = imgs.length ? withAlt / imgs.length : 1;
    setCheck(byId, 'onpage_8', ratio >= 0.6 ? 'pass' : 'fail', `${withAlt}/${imgs.length} images have alt`);
  }
  setCheck(byId, 'onpage_9', crawl.pageCount >= 2 ? 'pass' : 'fail', 'Multiple pages suggest service content depth');
  setCheck(
    byId,
    'onpage_10',
    /faq|frequently asked|q&a|questions?/i.test(corpus.text) ? 'pass' : 'fail',
    'FAQ section scan'
  );
  setCheck(byId, 'onpage_11', home.hasCta ? 'pass' : 'fail', 'Strong CTA');

  // AI questions
  for (const c of checks) {
    if (!String(c.id).startsWith('ai_q_')) continue;
    const ok = questionAnswered(corpus, c.question || c.label);
    setCheck(byId, c.id, ok ? 'pass' : 'fail', ok ? 'Keyword overlap with educational content' : 'Little matching educational content found');
  }
  setCheck(
    byId,
    'ai_extra_1',
    /how to|guide|tips|what (is|are)|cost|price/i.test(corpus.text) ? 'pass' : 'fail',
    'Educational content signals'
  );
  setCheck(
    byId,
    'ai_extra_2',
    /faq|frequently asked/i.test(corpus.text) || home.hasSchema ? 'pass' : 'fail',
    'FAQ / structured answers'
  );

  // Technical
  if (lighthouse?.performance != null) {
    setCheck(
      byId,
      'tech_1',
      lighthouse.performance >= 0.5 ? 'pass' : 'fail',
      `Performance ${(lighthouse.performance * 100).toFixed(0)}`
    );
  } else {
    setCheck(byId, 'tech_1', 'unknown', 'Lighthouse not available');
  }
  setCheck(byId, 'tech_2', home.viewport ? 'pass' : 'fail', home.viewport || 'No viewport');
  setCheck(
    byId,
    'tech_3',
    crawl.brokenLinks.length === 0 ? 'pass' : 'fail',
    crawl.brokenLinks.length ? JSON.stringify(crawl.brokenLinks.slice(0, 3)) : 'No broken links in sample'
  );
  setCheck(
    byId,
    'tech_4',
    crawl.errors.some((e) => e.status === 404) ? 'fail' : 'pass',
    '404 scan during crawl'
  );
  setCheck(byId, 'tech_5', 'unknown', 'Indexing requires Search Console — not assessed automatically');
  setCheck(byId, 'tech_6', crawl.sitemapFound ? 'pass' : 'fail', crawl.sitemapFound ? 'Sitemap found' : 'No sitemap detected');
  setCheck(byId, 'tech_7', crawl.robotsTxt ? 'pass' : 'fail', crawl.robotsTxt ? 'robots.txt present' : 'No robots.txt');
  setCheck(byId, 'tech_8', home.canonical ? 'pass' : 'fail', home.canonical || 'No canonical');
  setCheck(byId, 'tech_9', crawl.https ? 'pass' : 'fail', crawl.https ? 'HTTPS' : 'Not HTTPS');
  {
    const imgs = crawl.pages.flatMap((p) => p.images);
    const heavy = imgs.filter((i) => /\.bmp($|\?)/i.test(i.src)).length;
    setCheck(byId, 'tech_10', heavy === 0 ? 'pass' : 'fail', `${imgs.length} images scanned`);
  }
  if (lighthouse?.lcp != null || lighthouse?.cls != null) {
    const ok = (lighthouse.lcp == null || lighthouse.lcp <= 4000) && (lighthouse.cls == null || lighthouse.cls <= 0.25);
    setCheck(
      byId,
      'tech_11',
      ok ? 'pass' : 'fail',
      `LCP=${lighthouse.lcp ?? 'n/a'} CLS=${lighthouse.cls ?? 'n/a'}`
    );
  } else {
    setCheck(byId, 'tech_11', 'unknown', 'Core Web Vitals require Lighthouse');
  }
  setCheck(byId, 'tech_12', home.hasSchema || crawl.pages.some((p) => p.hasSchema) ? 'pass' : 'fail', 'Schema / JSON-LD scan');

  // Extended AEO / GEO crawl checks
  setCheck(
    byId,
    'aeo_1',
    crawl.hasFaqSchema || /FAQPage/i.test((crawl.schemaTypes || []).join(','))
      ? 'pass'
      : 'fail',
    crawl.hasFaqSchema ? 'FAQPage schema found' : 'No FAQPage schema'
  );
  setCheck(
    byId,
    'aeo_2',
    byId.get('onpage_10')?.status === 'pass' && /faq|frequently asked/i.test(corpus.text)
      ? 'pass'
      : 'fail',
    'Visible FAQ / Q&A blocks'
  );
  setCheck(
    byId,
    'aeo_3',
    checks.filter((c) => String(c.id).startsWith('ai_q_') && c.status === 'pass').length >= 2
      ? 'pass'
      : 'fail',
    'Educational answers covering common questions'
  );

  setCheck(
    byId,
    'geo_1',
    crawl.llmsTxtFound ? 'pass' : 'fail',
    crawl.llmsTxtFound ? 'llms.txt present' : 'No llms.txt at site root'
  );
  setCheck(
    byId,
    'geo_2',
    crawl.spaHeuristic?.likelySpa ? 'fail' : 'pass',
    crawl.spaHeuristic?.likelySpa
      ? 'Thin HTML shell — likely SPA; crawlers may miss content'
      : `Body length signals OK (${home.bodyText?.length || 0} chars)`
  );
  setCheck(
    byId,
    'geo_3',
    crawl.hasLocalBusinessSchema || crawl.hasPersonSchema ? 'pass' : 'fail',
    `Schema types: ${(crawl.schemaTypes || []).slice(0, 8).join(', ') || 'none'}`
  );
  setCheck(
    byId,
    'geo_4',
    /about|team|our (story|mission)|founded|years experience/i.test(corpus.text) ? 'pass' : 'fail',
    'Entity / about / authority language'
  );

  // NAP consistency vs claimed / GBP when available
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const claimedPhone = digits(context.phone || '');
  const gbpPhone = digits(context.gbpLookup?.phone || '');
  const sitePhoneDigits = (crawl.sitePhones || [])
    .map(digits)
    .concat((home.telLinks || []).map((l) => digits(l.href)))
    .filter((p) => p.length >= 10);

  if (claimedPhone || gbpPhone) {
    const target = gbpPhone || claimedPhone;
    const match = sitePhoneDigits.some(
      (p) => p.endsWith(target.slice(-10)) || target.endsWith(p.slice(-10))
    );
    setCheck(
      byId,
      'nap_1',
      match ? 'pass' : 'fail',
      match
        ? 'Site phone aligns with claimed/GBP number'
        : `Site phones: ${sitePhoneDigits.slice(0, 3).join(', ') || 'none'}; expected …${target.slice(-4)}`
    );
  } else {
    setCheck(byId, 'nap_1', sitePhoneDigits.length ? 'pass' : 'fail', 'Phone present on site (no GBP compare)');
  }

  const claimedAddr = String(context.address || context.gbpLookup?.address || '').toLowerCase();
  if (claimedAddr.length > 8) {
    const tokens = claimedAddr
      .split(/[\s,]+/)
      .filter((t) => t.length > 3)
      .slice(0, 4);
    const hit = tokens.filter((t) => corpus.text.includes(t)).length;
    setCheck(
      byId,
      'nap_2',
      hit >= Math.min(2, tokens.length) ? 'pass' : 'fail',
      `Address token overlap ${hit}/${tokens.length}`
    );
  } else {
    setCheck(byId, 'nap_2', 'unknown', 'No address provided for NAP compare');
  }

  // tech_13–15 aliases for GEO schema depth (if present in checklist)
  setCheck(
    byId,
    'tech_13',
    crawl.hasFaqSchema ? 'pass' : 'fail',
    crawl.hasFaqSchema ? 'FAQPage schema' : 'Missing FAQPage schema'
  );
  setCheck(
    byId,
    'tech_14',
    crawl.hasLocalBusinessSchema ? 'pass' : 'fail',
    crawl.hasLocalBusinessSchema ? 'LocalBusiness-family schema' : 'No LocalBusiness schema type'
  );
  setCheck(
    byId,
    'tech_15',
    crawl.llmsTxtFound ? 'pass' : 'fail',
    crawl.llmsTxtFound ? 'llms.txt found' : 'llms.txt missing'
  );

  // Conversion
  setCheck(byId, 'conv_1', byId.get('web_basic_6')?.status === 'pass' ? 'pass' : 'fail', 'Phone visibility');
  setCheck(byId, 'conv_2', home.telLinks.length > 0 ? 'pass' : 'fail', 'tel: links');
  setCheck(byId, 'conv_3', byId.get('web_basic_10')?.status === 'pass' ? 'pass' : 'fail', 'Emergency CTA');
  setCheck(
    byId,
    'conv_4',
    /quote|estimate|get a price/i.test(corpus.text) ? 'pass' : 'fail',
    'Quote CTA language'
  );
  setCheck(byId, 'conv_5', byId.get('web_basic_8')?.status === 'pass' ? 'pass' : 'fail', 'Contact form');
  setCheck(byId, 'conv_6', byId.get('web_basic_9')?.status === 'pass' ? 'pass' : 'fail', 'WhatsApp');
  setCheck(
    byId,
    'conv_7',
    /respond|call back|within \d+|same day/i.test(corpus.text) ? 'pass' : 'fail',
    'Response information'
  );
  setCheck(byId, 'conv_8', byId.get('web_home_2')?.status === 'pass' ? 'pass' : 'fail', 'Service areas');
  setCheck(
    byId,
    'conv_9',
    /£|gbp|from \d|pricing|price list|costs?/i.test(corpus.text) ? 'pass' : 'fail',
    'Pricing guidance'
  );
  setCheck(
    byId,
    'conv_10',
    /accredited|insured|gas safe|niceic|trustmark|member/i.test(corpus.text) ? 'pass' : 'fail',
    'Trust badges / accreditations language'
  );
  setCheck(byId, 'conv_11', byId.get('loc_qual_3')?.status === 'pass' ? 'pass' : 'fail', 'Testimonials');
  setCheck(
    byId,
    'conv_12',
    /google review|★★|rated \d|stars?/i.test(corpus.text) ? 'pass' : 'fail',
    'Google reviews mentioned on site'
  );
  setCheck(byId, 'conv_13', byId.get('conv_10')?.status === 'pass' ? 'pass' : 'fail', 'Accreditations');

  // Prospect-side competitor gap crawl fields
  for (const c of checks) {
    if (c.section !== 'competitor_gap' || c.source !== 'crawl') continue;
    if (c.label.includes('Website — Prospect')) {
      setCheck(byId, c.id, crawl.pageCount > 0 ? 'pass' : 'fail', crawl.finalUrl);
    } else if (c.label.includes('Service Pages — Prospect')) {
      const svcPass = checks.filter((x) => x.section === 'service_pages' && x.status === 'pass').length;
      setCheck(byId, c.id, svcPass > 0 ? 'pass' : 'fail', `${svcPass} service signals`);
    } else if (c.label.includes('Location Pages — Prospect')) {
      const locPass = checks.filter((x) => String(x.id).startsWith('loc_') && !String(x.id).startsWith('loc_qual_') && x.status === 'pass').length;
      setCheck(byId, c.id, locPass > 0 ? 'pass' : 'fail', `${locPass} location signals`);
    } else if (c.label.includes('Blog/FAQs — Prospect')) {
      setCheck(byId, c.id, byId.get('onpage_10')?.status === 'pass' ? 'pass' : 'fail', 'FAQ/blog scan');
    } else if (c.label.includes('Mobile Website — Prospect')) {
      setCheck(byId, c.id, home.viewport ? 'pass' : 'fail', home.viewport || 'No viewport');
    } else if (c.label.includes('CTA — Prospect')) {
      setCheck(byId, c.id, home.hasCta ? 'pass' : 'fail', 'CTA scan');
    }
  }

  return checks;
}
