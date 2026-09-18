




export type DataForSeoMapsItem = {
  position: number;
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewsCount: number;
  lat: number | null;
  lng: number | null;
  mapsUrl: string;
  website: string;
  phone: string;
  mainImage: string;
  totalPhotos: number;
  isThisBusiness: boolean;
};

/** Real Google SERP / Maps screenshot stored on the audit (JPEG data URL). */
export type SerpScreenshotResult = {
  dataUrl?: string;
  query: string;
  skipped?: boolean;
  reason?: string;
  capturedAt?: string;
};

export type MapsLocalPackResult = {
  items: DataForSeoMapsItem[];
  taskId: string | null;
};

export function requireDataForSeoConfigured(): boolean {
  return Boolean(
    String(process.env.DATAFORSEO_LOGIN || '').trim() &&
      String(process.env.DATAFORSEO_PASSWORD || '').trim()
  );
}

function basicAuthHeader(): string {
  const login = String(process.env.DATAFORSEO_LOGIN || '').trim();
  const password = String(process.env.DATAFORSEO_PASSWORD || '').trim();
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

function applyLocalLocation(
  task: Record<string, unknown>,
  opts: {
    lat?: number | null;
    lng?: number | null;
    locationName?: string;
  }
) {
  const lat = opts.lat;
  const lng = opts.lng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    task.location_coordinate = `${lat},${lng},14z`;
    return;
  }
  if (opts.locationName && String(opts.locationName).trim()) {
    task.location_name = String(opts.locationName).trim();
    return;
  }
  // UK default — never worldwide; only used when city/coords are missing
  task.location_code = 2826;
}

async function downloadImageAsDataUrl(url: string, maxBytes = 1_200_000): Promise<string | null> {
  const u = String(url || '').trim();
  if (!u) return null;
  if (u.startsWith('data:image/')) return u;
  try {
    const res = await fetch(u, {
      headers: { Accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > maxBytes) return null;
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!/^image\//i.test(ct)) return null;
    const b64 = buf.toString('base64');
    // Cap payload size for Lambda / PDF embeds
    if (b64.length > 900_000) return null;
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

/** Capture a desktop screenshot for an existing DataForSEO SERP task id. */
export async function captureSerpScreenshotDataUrl(
  taskId: string,
  opts?: { timeoutMs?: number }
): Promise<string | null> {
  const id = String(taskId || '').trim();
  if (!id || !requireDataForSeoConfigured()) return null;

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 45000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.dataforseo.com/v3/serp/screenshot', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        {
          task_id: id,
          browser_preset: 'desktop',
          browser_screen_width: 1280,
          browser_screen_height: 900,
          page: 1
        }
      ]),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[dataForSeo] screenshot HTTP', res.status, data?.status_message || '');
      return null;
    }
    const taskResult = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!taskResult || taskResult.status_code !== 20000) {
      console.warn(
        '[dataForSeo] screenshot status:',
        taskResult?.status_code,
        taskResult?.status_message || data?.status_message
      );
      return null;
    }
    const imageUrl =
      taskResult?.result?.[0]?.items?.[0]?.image ||
      taskResult?.result?.[0]?.items?.[0]?.image_url ||
      null;
    if (!imageUrl) return null;
    return downloadImageAsDataUrl(String(imageUrl));
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err?.message;
    console.warn('[dataForSeo] screenshot failed:', msg);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Crop a full SERP screenshot to the top Local Pack / map area (not the whole organic page).
 * Uses Puppeteer already available in the audit worker.
 */
async function cropSerpScreenshotToLocalPack(
  dataUrl: string,
  cropBottomPx?: number | null
): Promise<string> {
  const src = String(dataUrl || '');
  if (!src.startsWith('data:image/')) return src;

  let browser: any;
  try {
    const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
    if (isLambda) {
      const chromium = await import('@sparticuz/chromium');
      const puppeteer = await import('puppeteer-core');
      (chromium as any).default.setGraphicsMode = false;
      browser = await puppeteer.default.launch({
        args: (chromium as any).default.args,
        defaultViewport: null,
        executablePath: await (chromium as any).default.executablePath(),
        headless: (chromium as any).default.headless
      });
    } else {
      const puppeteer = await import('puppeteer');
      browser = await puppeteer.default.launch({
        headless: true,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }

    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.evaluate((url: string) => {
      // Runs in browser context
      const doc = (globalThis as any).document;
      doc.body.style.margin = '0';
      doc.body.style.background = '#fff';
      const img = doc.createElement('img');
      img.id = 'serp';
      img.style.display = 'block';
      img.src = url;
      doc.body.appendChild(img);
    }, src);
    await page.waitForFunction(() => {
      const doc = (globalThis as any).document;
      const img = doc.getElementById('serp');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, { timeout: 15000 });

    const dims = (await page.$eval('#serp', (el: any) => ({
      w: el.naturalWidth || el.width,
      h: el.naturalHeight || el.height
    }))) as { w: number; h: number };
    if (!dims?.w || !dims?.h) return src;

    // Prefer measured Local Pack bottom; else keep ~top 48% (maps + pack, not full SERP)
    const fallbackH = Math.round(Math.min(dims.h * 0.48, 1100));
    const targetH = Math.max(
      420,
      Math.min(dims.h, Math.round(cropBottomPx && cropBottomPx > 200 ? cropBottomPx + 56 : fallbackH))
    );
    const clipH = Math.min(dims.h, targetH);
    await page.setViewport({ width: dims.w, height: clipH, deviceScaleFactor: 1 });
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 62,
      encoding: 'binary',
      clip: { x: 0, y: 0, width: dims.w, height: clipH }
    });
    const b64 = Buffer.from(buffer).toString('base64');
    if (!b64 || b64.length > 900_000) return src;
    return `data:image/jpeg;base64,${b64}`;
  } catch (err: any) {
    console.warn('[dataForSeo] SERP crop failed:', err?.message || err);
    return src;
  } finally {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
  }
}

function localPackCropBottomFromItems(items: any[]): number | null {
  let bottom = 0;
  for (const item of items) {
    const type = String(item?.type || '').toLowerCase();
    if (type !== 'local_pack' && type !== 'map' && type !== 'local_services') continue;
    const rect = item?.rectangle;
    const y = Number(rect?.y);
    const h = Number(rect?.height);
    if (Number.isFinite(y) && Number.isFinite(h)) {
      bottom = Math.max(bottom, y + h);
    }
    const kids = Array.isArray(item?.items) ? item.items : [];
    for (const sub of kids) {
      const sy = Number(sub?.rectangle?.y);
      const sh = Number(sub?.rectangle?.height);
      if (Number.isFinite(sy) && Number.isFinite(sh)) {
        bottom = Math.max(bottom, sy + sh);
      }
    }
  }
  return bottom > 200 ? bottom : null;
}

/**
 * Pull Knowledge Graph / SERP thumbnail images from Google Search for a business-name query.
 * Prefer these over Places / Maps photos for the Knowledge Panel collage.
 */
export async function fetchOrganicBrandImages(opts: {
  keyword: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<string[]> {
  const keyword = String(opts.keyword || '').trim();
  if (!keyword || !requireDataForSeoConfigured()) return [];

  const task: Record<string, unknown> = {
    language_code: opts.languageCode || 'en',
    keyword,
    depth: 10,
    device: 'desktop',
    os: 'windows'
  };
  applyLocalLocation(task, opts);

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    const taskResult = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!taskResult || taskResult.status_code !== 20000) return [];
    const result = Array.isArray(taskResult.result) ? taskResult.result[0] : taskResult.result;
    const items = Array.isArray(result?.items) ? result.items : [];

    const rawUrls: string[] = [];
    const pushUrl = (u: unknown) => {
      const s = String(u || '').trim();
      if (!s || !/^https?:\/\//i.test(s)) return;
      if (rawUrls.includes(s)) return;
      rawUrls.push(s);
    };

    for (const item of items) {
      const type = String(item?.type || '').toLowerCase();
      if (type === 'knowledge_graph' || type === 'local_pack' || type === 'images') {
        pushUrl(item?.image);
        pushUrl(item?.image_url);
        pushUrl(item?.thumbnail);
        pushUrl(item?.logo);
        const rect = item?.rectangle;
        if (rect?.image) pushUrl(rect.image);
        const imgs = Array.isArray(item?.items) ? item.items : [];
        for (const sub of imgs) {
          pushUrl(sub?.image);
          pushUrl(sub?.image_url);
          pushUrl(sub?.thumbnail);
          pushUrl(sub?.source_url);
        }
      }
      if (type === 'organic') {
        pushUrl(item?.image);
        pushUrl(item?.thumbnail);
      }
      if (rawUrls.length >= (opts.limit ?? 4) * 2) break;
    }

    const limit = Math.min(Math.max(opts.limit ?? 2, 1), 4);
    const out: string[] = [];
    for (const u of rawUrls.slice(0, limit * 2)) {
      const dataUrl = await downloadImageAsDataUrl(u);
      if (dataUrl) out.push(dataUrl);
      if (out.length >= limit) break;
    }
    return out;
  } catch (err: any) {
    console.warn('[dataForSeo] organic brand images failed:', err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google Search (organic) live task for a local keyword → real Local Pack screenshot.
 * Uses city / coords only (not worldwide).
 */
export async function captureOrganicLocalPackScreenshot(opts: {
  keyword: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  timeoutMs?: number;
}): Promise<SerpScreenshotResult> {
  const keyword = String(opts.keyword || '').trim();
  const query = keyword;
  if (!keyword) {
    return { query: '', skipped: true, reason: 'No keyword', capturedAt: new Date().toISOString() };
  }
  if (!requireDataForSeoConfigured()) {
    return {
      query,
      skipped: true,
      reason: 'DataForSEO not configured',
      capturedAt: new Date().toISOString()
    };
  }

  const task: Record<string, unknown> = {
    language_code: opts.languageCode || 'en',
    keyword,
    depth: 10,
    device: 'desktop',
    os: 'windows',
    calculate_rectangles: true,
    browser_screen_width: 1280,
    browser_screen_height: 900
  };
  applyLocalLocation(task, opts);
  // Organic uses location_coordinate without search_this_area
  if (task.location_coordinate) {
    // keep as-is
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 35000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        query,
        skipped: true,
        reason: `organic HTTP ${res.status}`,
        capturedAt: new Date().toISOString()
      };
    }
    const taskResult = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!taskResult || taskResult.status_code !== 20000) {
      return {
        query,
        skipped: true,
        reason: String(taskResult?.status_message || 'organic task failed'),
        capturedAt: new Date().toISOString()
      };
    }
    const taskId = String(taskResult.id || '').trim();
    if (!taskId) {
      return {
        query,
        skipped: true,
        reason: 'No organic task id',
        capturedAt: new Date().toISOString()
      };
    }
    const serpResult = Array.isArray(taskResult.result) ? taskResult.result[0] : taskResult.result;
    const items = Array.isArray(serpResult?.items) ? serpResult.items : [];
    const cropBottom = localPackCropBottomFromItems(items);

    let dataUrl = await captureSerpScreenshotDataUrl(taskId, { timeoutMs: 45000 });
    if (!dataUrl) {
      return {
        query,
        skipped: true,
        reason: 'Screenshot unavailable',
        capturedAt: new Date().toISOString()
      };
    }
    dataUrl = await cropSerpScreenshotToLocalPack(dataUrl, cropBottom);
    return { dataUrl, query, capturedAt: new Date().toISOString() };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err?.message;
    return {
      query,
      skipped: true,
      reason: msg || 'organic screenshot failed',
      capturedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function captureMapsScreenshotFromTask(
  taskId: string | null | undefined,
  query: string
): Promise<SerpScreenshotResult> {
  const q = String(query || '').trim();
  const id = String(taskId || '').trim();
  if (!id) {
    return {
      query: q,
      skipped: true,
      reason: 'No Maps task id',
      capturedAt: new Date().toISOString()
    };
  }
  const dataUrl = await captureSerpScreenshotDataUrl(id, { timeoutMs: 45000 });
  if (!dataUrl) {
    return {
      query: q,
      skipped: true,
      reason: 'Maps screenshot unavailable',
      capturedAt: new Date().toISOString()
    };
  }
  return { dataUrl, query: q, capturedAt: new Date().toISOString() };
}

function normalizeItem(raw: any, index: number): DataForSeoMapsItem | null {
  const name = String(raw?.title || raw?.name || '').trim();
  if (!name) return null;
  const ratingVal = raw?.rating?.value ?? raw?.rating ?? null;
  const reviews = raw?.rating?.votes_count ?? raw?.reviews_count ?? raw?.userRatingCount ?? 0;
  const lat =
    typeof raw?.latitude === 'number'
      ? raw.latitude
      : typeof raw?.gps_coordinates?.latitude === 'number'
        ? raw.gps_coordinates.latitude
        : null;
  const lng =
    typeof raw?.longitude === 'number'
      ? raw.longitude
      : typeof raw?.gps_coordinates?.longitude === 'number'
        ? raw.gps_coordinates.longitude
        : null;
  return {
    position: Number(raw?.rank_absolute || raw?.rank_group || index + 1) || index + 1,
    placeId: String(raw?.place_id || raw?.cid || '').trim(),
    name,
    address: String(raw?.address || raw?.address_info?.address || raw?.snippet || '').trim(),
    rating: typeof ratingVal === 'number' ? ratingVal : ratingVal != null ? Number(ratingVal) : null,
    reviewsCount: Number(reviews) || 0,
    lat,
    lng,
    mapsUrl: String(raw?.url || raw?.book_online_url || '').trim(),
    website: String(raw?.domain ? `https://${raw.domain}` : raw?.website || '').trim(),
    phone: String(raw?.phone || '').trim(),
    mainImage: String(raw?.main_image || raw?.mainImage || '').trim(),
    totalPhotos: Number(raw?.total_photos || raw?.totalPhotos || 0) || 0,
    isThisBusiness: false
  };
}


export async function fetchMapsLocalPack(opts: {
  keyword: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  depth?: number;
  timeoutMs?: number;
}): Promise<MapsLocalPackResult> {
  if (!requireDataForSeoConfigured()) return { items: [], taskId: null };

  const keyword = String(opts.keyword || '').trim();
  if (!keyword) return { items: [], taskId: null };

  const task: Record<string, unknown> = {
    language_code: opts.languageCode || 'en',
    keyword,
    depth: Math.min(Math.max(opts.depth ?? 10, 10), 20),
    device: 'desktop',
    os: 'windows'
  };

  applyLocalLocation(task, opts);
  if (task.location_coordinate) {
    task.search_this_area = true;
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: controller.signal
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[dataForSeo] maps live HTTP', res.status, data?.status_message || '');
      return { items: [], taskId: null };
    }

    const taskResult = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!taskResult || taskResult.status_code !== 20000) {
      console.warn(
        '[dataForSeo] maps task status:',
        taskResult?.status_code,
        taskResult?.status_message || data?.status_message
      );
      return { items: [], taskId: null };
    }

    const taskId = String(taskResult.id || '').trim() || null;
    const result = Array.isArray(taskResult.result) ? taskResult.result[0] : null;
    const items = Array.isArray(result?.items) ? result.items : [];
    const mapped = items
      .map((item: any, idx: number) => normalizeItem(item, idx))
      .filter(Boolean) as DataForSeoMapsItem[];

    return {
      items: mapped.slice(0, opts.depth ?? 10).map((row, idx) => ({
        ...row,
        position: idx + 1
      })),
      taskId
    };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err?.message;
    console.warn('[dataForSeo] maps live failed:', msg);
    return { items: [], taskId: null };
  } finally {
    clearTimeout(timer);
  }
}


function normName(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function digits(s: string) {
  return String(s || '').replace(/\D/g, '');
}

function hostOf(u: string) {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(u || '')
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();
  }
}


export function findMatchingMapsItem(
  items: DataForSeoMapsItem[],
  business: {
    businessName?: string;
    phone?: string;
    website?: string;
    placeId?: string;
  }
): DataForSeoMapsItem | null {
  if (!items?.length) return null;
  const nameA = normName(business.businessName || '');
  const phoneA = digits(business.phone || '');
  const hostA = hostOf(business.website || '');
  const idA = String(business.placeId || '').replace(/^places\//, '');

  let best: { item: DataForSeoMapsItem; score: number } | null = null;
  for (const item of items) {
    let score = 0;
    const nameB = normName(item.name);
    if (idA && item.placeId && (item.placeId === idA || item.placeId.includes(idA) || idA.includes(item.placeId))) {
      score += 100;
    }
    if (nameA && nameB) {
      if (nameA === nameB || nameB.includes(nameA) || nameA.includes(nameB)) score += 50;
      else if (nameA.length >= 5 && nameB.includes(nameA.slice(0, Math.min(8, nameA.length)))) score += 20;
    }
    const phoneB = digits(item.phone);
    if (phoneA.length >= 8 && phoneB.length >= 8) {
      if (phoneA.endsWith(phoneB.slice(-8)) || phoneB.endsWith(phoneA.slice(-8))) score += 40;
    }
    const hostB = hostOf(item.website);
    if (hostA && hostB && (hostA === hostB || hostA.includes(hostB) || hostB.includes(hostA))) score += 35;
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best && best.score >= 20 ? best.item : null;
}

export function buildDeepLocalRank(opts: {
  query: string;
  items: DataForSeoMapsItem[];
  businessName?: string;
  placeId?: string;
  phone?: string;
  website?: string;
}) {
  const match = findMatchingMapsItem(opts.items, {
    businessName: opts.businessName,
    placeId: opts.placeId,
    phone: opts.phone,
    website: opts.website
  });

  const topResults = opts.items.map((r) => ({
    position: r.position,
    name: r.name,
    address: r.address,
    rating: r.rating,
    reviewCount: r.reviewsCount,
    mainImage: r.mainImage || '',
    placeId: r.placeId || '',
    isProspect:
      Boolean(match && match.placeId && r.placeId === match.placeId) ||
      Boolean(match && r.name === match.name)
  }));

  const hit = topResults.find((r) => r.isProspect);
  const position = hit?.position ?? null;

  return {
    query: opts.query,
    position,
    totalChecked: topResults.length,
    topResults,
    evidence:
      position != null
        ? `DataForSEO Maps: appears at #${position} for “${opts.query}”`
        : topResults.length
          ? `DataForSEO Maps: not in top ${topResults.length} for “${opts.query}”`
          : `DataForSEO Maps: no results for “${opts.query}”`,
    source: 'dataforseo-maps'
  };
}

export type AiEngineCheckResult = {
  engine: 'chatgpt' | 'claude' | 'gemini';
  label: string;
  prompt: string;
  mentioned: boolean | null;
  recommendedLikely?: boolean | null;
  citedHosts?: string[];
  answerExcerpt: string;
  skipped?: boolean;
  reason?: string;
  capturedAt?: string;
};

function extractCitedHostsFromText(text: string): string[] {
  const out = new Set<string>();
  const re = /https?:\/\/[^\s)\]>"']+/gi;
  for (const m of String(text || '').match(re) || []) {
    try {
      const h = new URL(m).hostname.replace(/^www\./, '').toLowerCase();
      if (h) out.add(h);
    } catch {
      /* ignore */
    }
  }
  const bare = String(text || '').match(/\b(?:[a-z0-9-]+\.)+(?:co\.uk|com|uk|org|net)\b/gi) || [];
  for (const m of bare) out.add(m.replace(/^www\./i, '').toLowerCase());
  return [...out].slice(0, 12);
}

function recommendedLikelyInText(text: string, mentioned: boolean): boolean {
  if (!mentioned) return false;
  return /\b(recommend|recommended|top pick|best (choice|option)|highly rated|go with|consider)\b/i.test(
    text || ''
  );
}

function extractLlmAnswerText(result: any): string {
  const chunks: string[] = [];
  const items = Array.isArray(result?.items) ? result.items : [];
  for (const item of items) {
    const sections = Array.isArray(item?.sections) ? item.sections : [];
    for (const sec of sections) {
      const t = String(sec?.text || '').trim();
      if (t) chunks.push(t);
    }
    const direct = String(item?.text || '').trim();
    if (direct) chunks.push(direct);
  }
  if (!chunks.length && result?.message) chunks.push(String(result.message));
  return chunks.join('\n\n').trim();
}

/** Strip markdown noise for report/PDF excerpts while keeping readable prose + URLs. */
export function sanitizeLlmExcerpt(text: string, maxLen = 520): string {
  let s = String(text || '');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 — $2');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen).trim()}…`;
  return s;
}

function brandMentionedInText(answer: string, businessName: string): boolean {
  const text = String(answer || '').toLowerCase();
  const name = String(businessName || '').trim().toLowerCase();
  if (!text || !name || name.length < 3) return false;
  if (text.includes(name)) return true;
  // Token overlap for multi-word brands (require main distinctive token >= 4 chars)
  const tokens = name
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !['ltd', 'limited', 'services', 'service', 'the', 'and'].includes(t));
  if (!tokens.length) return false;
  return tokens.every((t) => text.includes(t));
}

function shortCityForWebSearch(city?: string): string | undefined {
  const raw = String(city || '').trim();
  if (!raw) return undefined;
  // Prefer a short place name — long suite/address strings break Claude web_search_city
  const first = raw.split(/[·|,]/)[0]?.trim() || raw;
  if (first.length > 48) return first.slice(0, 48).trim();
  // Skip if it looks like a full street address
  if (/\d{1,5}\s+\w+/.test(first) && first.length > 28) {
    const parts = first.split(/\s+/);
    return parts.slice(-2).join(' ') || undefined;
  }
  return first || undefined;
}

async function fetchLlmResponseLive(opts: {
  platform: 'chat_gpt' | 'claude' | 'gemini';
  modelName: string;
  prompt: string;
  city?: string;
  timeoutMs?: number;
  withTemperature?: boolean;
}): Promise<{ text: string; error?: string }> {
  if (!requireDataForSeoConfigured()) return { text: '', error: 'DataForSEO not configured' };
  const prompt = String(opts.prompt || '').trim().slice(0, 500);
  if (!prompt) return { text: '', error: 'Empty prompt' };

  const task: Record<string, unknown> = {
    user_prompt: prompt,
    model_name: opts.modelName,
    max_output_tokens: opts.platform === 'claude' ? 1025 : 450,
    web_search: true
  };
  if (opts.withTemperature !== false && opts.platform !== 'claude') {
    task.temperature = 0.2;
  }
  // ChatGPT + Claude support country; Gemini live docs omit city/country fields
  if (opts.platform !== 'gemini') {
    task.web_search_country_iso_code = 'GB';
    const city = shortCityForWebSearch(opts.city);
    if (city) task.web_search_city = city;
  }

  const path =
    opts.platform === 'claude'
      ? 'https://api.dataforseo.com/v3/ai_optimization/claude/llm_responses/live'
      : opts.platform === 'gemini'
        ? 'https://api.dataforseo.com/v3/ai_optimization/gemini/llm_responses/live'
        : 'https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_responses/live';

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 55000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { text: '', error: `HTTP ${res.status} ${data?.status_message || ''}`.trim() };
    }
    const taskResult = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!taskResult || taskResult.status_code !== 20000) {
      return {
        text: '',
        error: String(taskResult?.status_message || data?.status_message || 'LLM task failed')
      };
    }
    const result = Array.isArray(taskResult.result) ? taskResult.result[0] : taskResult.result;
    const text = extractLlmAnswerText(result);
    if (!text) return { text: '', error: 'Empty LLM answer' };
    return { text };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err?.message;
    return { text: '', error: msg || 'LLM request failed' };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLlmWithModelFallback(opts: {
  platform: 'chat_gpt' | 'claude' | 'gemini';
  models: string[];
  prompt: string;
  city?: string;
  timeoutMs?: number;
}): Promise<{ text: string; error?: string }> {
  let last: { text: string; error?: string } = { text: '', error: 'No model tried' };
  for (const modelName of opts.models) {
    last = await fetchLlmResponseLive({
      platform: opts.platform,
      modelName,
      prompt: opts.prompt,
      city: opts.city,
      timeoutMs: opts.timeoutMs
    });
    if (last.text) return last;
    // Retry without city if field validation fails
    if (/invalid field/i.test(last.error || '') && opts.city) {
      last = await fetchLlmResponseLive({
        platform: opts.platform,
        modelName,
        prompt: opts.prompt,
        timeoutMs: opts.timeoutMs
      });
      if (last.text) return last;
    }
  }
  return last;
}

/**
 * Ask ChatGPT + Claude + Gemini the same local prompt users will type, so GEO can be cross-checked.
 * Soft-fails per engine if the API is unavailable.
 */
export async function checkAiEngineMentions(opts: {
  prompt: string;
  businessName: string;
  city?: string;
}): Promise<AiEngineCheckResult[]> {
  const prompt = String(opts.prompt || '').trim();
  const businessName = String(opts.businessName || '').trim();
  const city = String(opts.city || '').trim() || undefined;
  const capturedAt = new Date().toISOString();

  const skippedRow = (
    engine: AiEngineCheckResult['engine'],
    label: string,
    reason: string
  ): AiEngineCheckResult => ({
    engine,
    label,
    prompt,
    mentioned: null,
    recommendedLikely: null,
    citedHosts: [],
    answerExcerpt: '',
    skipped: true,
    reason,
    capturedAt
  });

  if (!prompt || !businessName) {
    return [
      skippedRow('chatgpt', 'ChatGPT', 'Missing prompt or business name'),
      skippedRow('claude', 'Claude', 'Missing prompt or business name'),
      skippedRow('gemini', 'Gemini', 'Missing prompt or business name')
    ];
  }

  const [gpt, claude, gemini] = await Promise.all([
    fetchLlmWithModelFallback({
      platform: 'chat_gpt',
      models: ['gpt-4.1-mini', 'gpt-4o-mini'],
      prompt,
      city,
      timeoutMs: 55000
    }),
    fetchLlmWithModelFallback({
      platform: 'claude',
      // Prefer non-fragile dated / haiku models — claude-sonnet-4-0 often returns Invalid Field
      models: ['claude-3-7-sonnet-20250219', 'claude-3-5-haiku-latest', 'claude-sonnet-4-20250514'],
      prompt,
      city,
      timeoutMs: 55000
    }),
    fetchLlmWithModelFallback({
      platform: 'gemini',
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      prompt,
      city,
      timeoutMs: 55000
    })
  ]);

  const toRow = (
    engine: AiEngineCheckResult['engine'],
    label: string,
    res: { text: string; error?: string }
  ): AiEngineCheckResult => {
    if (!res.text) {
      return skippedRow(engine, label, res.error || 'No answer');
    }
    const excerpt = sanitizeLlmExcerpt(res.text, 520);
    const mentioned = brandMentionedInText(res.text, businessName);
    return {
      engine,
      label,
      prompt,
      mentioned,
      recommendedLikely: recommendedLikelyInText(res.text, mentioned),
      citedHosts: extractCitedHostsFromText(res.text),
      answerExcerpt: excerpt,
      capturedAt
    };
  };

  return [
    toRow('chatgpt', 'ChatGPT', gpt),
    toRow('claude', 'Claude', claude),
    toRow('gemini', 'Gemini', gemini)
  ];
}
