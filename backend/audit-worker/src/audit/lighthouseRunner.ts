/**
 * Optional Lighthouse runner. Returns null metrics if Chrome is unavailable.
 */

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
      return {
        fetchedAt: new Date().toISOString(),
        performance: lhr.categories?.performance?.score ?? null,
        accessibility: lhr.categories?.accessibility?.score ?? null,
        lcp: audits['largest-contentful-paint']?.numericValue ?? null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        tbt: audits['total-blocking-time']?.numericValue ?? null,
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
