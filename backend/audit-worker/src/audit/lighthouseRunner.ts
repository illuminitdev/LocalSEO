
function lighthouseAuditState(audit) {
  if (!audit || audit.score == null || audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'error') {
    return 'unknown';
  }
  return Number(audit.score) >= 1 ? 'pass' : 'fail';
}

function firstAudit(audits, ids) {
  for (const id of ids) {
    if (audits && audits[id]) return audits[id];
  }
  return null;
}

function mobileLayoutFromAudits(audits, live) {
  const viewportAudit = lighthouseAuditState(firstAudit(audits, ['viewport', 'viewport-insight']));
  const contentAudit = lighthouseAuditState(firstAudit(audits, ['content-width']));
  const tapTargets = lighthouseAuditState(firstAudit(audits, ['tap-targets', 'target-size']));
  const fontAudit = lighthouseAuditState(firstAudit(audits, ['font-size']));

  const viewport =
    live && typeof live.viewportSet === 'boolean' ? (live.viewportSet ? 'pass' : 'fail') : viewportAudit;
  const contentWidth =
    live && typeof live.overflows === 'boolean' ? (live.overflows ? 'fail' : 'pass') : contentAudit;
  const fontSize =
    fontAudit !== 'unknown' ? fontAudit : live && live.smallText === true ? 'fail' : live && live.smallText === false ? 'pass' : 'unknown';

  const pass =
    viewport === 'fail' || contentWidth === 'fail'
      ? false
      : viewport === 'pass' && contentWidth === 'pass'
        ? true
        : null;
  const widthNote =
    live && Number.isFinite(live.docWidth) && Number.isFinite(live.innerWidth)
      ? ` (${live.docWidth}px content, ${live.innerWidth}px screen)`
      : '';
  const evidence = [
    `Viewport: ${viewport}`,
    `Content width: ${contentWidth}${widthNote}`,
    `Tap targets: ${tapTargets}`,
    `Font size: ${fontSize}`
  ].join('. ');
  return { pass, viewport, contentWidth, tapTargets, fontSize, evidence };
}

async function readPhoneLayout(port, url) {
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${port}`,
      defaultViewport: null
    });
    try {
      const pages = await browser.pages();
      const page = pages.find((p) => /^https?:/i.test(p.url())) || pages[0] || (await browser.newPage());
      await page.setViewport({
        width: 412,
        height: 915,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625
      });
      const current = page.url();
      if (!current || current === 'about:blank') {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      const readLayout = new Function(`
        const meta = document.querySelector('meta[name="viewport" i]');
        const content = (meta && meta.getAttribute('content')) || '';
        const viewportSet = /width\\s*=\\s*device-width/i.test(content);
        const innerWidth = window.innerWidth || 0;
        const docWidth = Math.max(
          document.documentElement ? document.documentElement.scrollWidth : 0,
          document.body ? document.body.scrollWidth : 0
        );
        let smallText = false;
        let seen = 0;
        const nodes = document.querySelectorAll('p, li, a, span, h1, h2, h3, button, td');
        for (const el of nodes) {
          if (seen >= 80) break;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const size = parseFloat(style.fontSize);
          if (!Number.isFinite(size) || size <= 0) continue;
          seen += 1;
          if (size < 12) {
            smallText = true;
            break;
          }
        }
        return { viewportSet, overflows: docWidth > innerWidth + 1, docWidth, innerWidth, smallText };
      `);
      return await page.evaluate(readLayout as () => {
        viewportSet: boolean;
        overflows: boolean;
        docWidth: number;
        innerWidth: number;
        smallText: boolean;
      });
    } finally {
      await browser.disconnect();
    }
  } catch {
    return null;
  }
}

export async function runLighthouse(url) {
  try {
    const chromeLauncher = await import('chrome-launcher');
    const lighthouse = (await import('lighthouse')).default;

    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        onlyCategories: ['performance', 'accessibility'],
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 412, height: 915, deviceScaleFactor: 2.625, disabled: false },
        throttlingMethod: 'simulate'
      });

      const lhr = result.lhr;
      const audits = lhr.audits || {};
      const live = await readPhoneLayout(chrome.port, lhr.finalDisplayedUrl || url);
      return {
        fetchedAt: new Date().toISOString(),
        performance: lhr.categories?.performance?.score ?? null,
        accessibility: lhr.categories?.accessibility?.score ?? null,
        lcp: audits['largest-contentful-paint']?.numericValue ?? null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        tbt: audits['total-blocking-time']?.numericValue ?? null,
        mobileLayout: mobileLayoutFromAudits(audits, live),
        url: lhr.finalDisplayedUrl || url
      };
    } finally {
      await chrome.kill();
    }
  } catch (err) {
    return {
      skipped: true,
      reason: err?.message || String(err),
      fetchedAt: new Date().toISOString()
    };
  }
}
