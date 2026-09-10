import { config } from '../config.js';

/**
 * Capture a compressed homepage screenshot for the deep audit report.
 * Returns a data URL (JPEG) or null if Chromium is unavailable.
 */
export async function captureHomepageScreenshot(url) {
  if (!url) return null;
  let target = String(url).trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  let browser;
  try {
    if (config.isLambda) {
      const chromium = await import('@sparticuz/chromium');
      const puppeteer = await import('puppeteer-core');
      chromium.default.setGraphicsMode = false;
      browser = await puppeteer.default.launch({
        args: chromium.default.args,
        defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
        executablePath: await chromium.default.executablePath(),
        headless: chromium.default.headless
      });
    } else {
      const puppeteer = await import('puppeteer');
      browser = await puppeteer.default.launch({
        headless: true,
        defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; ZappSitesAuditBot/1.0; +https://zappsites.com) AppleWebKit/537.36'
    );
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1500));

    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 55,
      fullPage: false,
      encoding: 'binary'
    });
    const b64 = Buffer.from(buffer).toString('base64');
    // Cap ~180KB base64 to keep audit JSON manageable
    if (b64.length > 240_000) {
      return {
        skipped: true,
        reason: 'Screenshot too large',
        capturedAt: new Date().toISOString(),
        url: target
      };
    }
    return {
      dataUrl: `data:image/jpeg;base64,${b64}`,
      capturedAt: new Date().toISOString(),
      url: page.url() || target,
      width: 1280,
      height: 800
    };
  } catch (err) {
    const error = err as Error;
    return {
      skipped: true,
      reason: error.message || String(err),
      capturedAt: new Date().toISOString(),
      url: target
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
