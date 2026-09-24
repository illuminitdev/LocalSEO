
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
    
    if (b64.length > 900_000) return null;
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}


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
  
  if (task.location_coordinate) {
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
    lat: typeof r.lat === 'number' ? r.lat : null,
    lng: typeof r.lng === 'number' ? r.lng : null,
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

export type GeoAiPromptKey = 'near' | 'best' | 'near_me';

export type AiEngineCheckResult = {
  engine: 'chatgpt' | 'claude' | 'gemini';
  label: string;
  prompt: string;
  promptKey?: GeoAiPromptKey;
  mentioned: boolean | null;
  recommendedLikely?: boolean | null;
  citedHosts?: string[];
  answerExcerpt: string;
  skipped?: boolean;
  reason?: string;
  capturedAt?: string;
};

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

/** Light cleanup of a few common short forms; otherwise keep the address text as-is. */
const COUNTRY_SHORT_FORMS: Record<string, string> = {
  uk: 'UK',
  'u.k.': 'UK',
  'u.k': 'UK',
  gb: 'UK',
  usa: 'United States',
  us: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'u.s.a': 'United States',
  uae: 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  nz: 'New Zealand'
};

function looksLikePostcodeOnly(segment: string): boolean {
  const s = String(segment || '').trim();
  if (!s) return true;
  if (UK_POSTCODE_RE.test(s) && s.replace(UK_POSTCODE_RE, '').trim().length <= 1) return true;
  if (/^\d{4,6}(-\d{4})?$/.test(s)) return true;
  if (/^[A-Z]{1,2}\d[\s\dA-Z-]{2,10}$/i.test(s) && /\d/.test(s)) return true;
  return false;
}

/**
 * Take whatever country is on the business/GBP address (last comma segment).
 * No country whitelist — address text is the source of truth.
 */
export function countryFromAddress(address?: string | null): string {
  const parts = String(address || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (looksLikePostcodeOnly(part)) continue;
    const cleaned = part
      .replace(UK_POSTCODE_RE, '')
      .replace(/\b\d{4,}\b/g, '')
      .replace(/[./]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Skip street-like bits (numbers) — keep walking left
    if (!cleaned || /\d/.test(cleaned)) continue;
    if (cleaned.length < 2 || cleaned.length > 56) continue;
    if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (COUNTRY_SHORT_FORMS[key]) return COUNTRY_SHORT_FORMS[key];
    // Use the address segment as written (title-case words)
    return cleaned
      .split(/\s+/)
      .map((w) => {
        if (/^(of|and|the)$/i.test(w)) return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }

  if (UK_POSTCODE_RE.test(String(address || ''))) return 'UK';
  return 'UK';
}

/** Three GEO prompts asked of ChatGPT / Claude / Gemini for cross-checkable visibility. */
export function buildGeoAiPrompts(opts: {
  service?: string;
  city?: string;
  address?: string | null;
  country?: string | null;
}): Array<{ key: GeoAiPromptKey; prompt: string }> {
  const service = String(opts.service || 'local business').replace(/\s+/g, ' ').trim() || 'local business';
  const city = String(opts.city || '').replace(/\s+/g, ' ').trim();
  const country =
    String(opts.country || countryFromAddress(opts.address)).replace(/\s+/g, ' ').trim() || 'UK';
  const withCountry = (q: string) => `${q}, ${country}`;

  const nearBase = city ? `${service} near ${city}` : `${service} near me`;
  const bestBase = city ? `best ${service} in ${city}` : `best ${service}`;
  const nearMe = `${service} near me in ${country}`;
  return [
    { key: 'near', prompt: withCountry(nearBase) },
    { key: 'best', prompt: withCountry(bestBase) },
    { key: 'near_me', prompt: nearMe }
  ];
}

function extractCitedHostsFromText(text: string): string[] {
  const out = new Set<string>();
  const re = /https?:\/\/[^\s)\]>"']+/gi;
  for (const m of String(text || '').match(re) || []) {
    try {
      const h = new URL(m).hostname.replace(/^www\./, '').toLowerCase();
      if (h) out.add(h);
    } catch {
      
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
export function sanitizeLlmExcerpt(text: string, maxLen = 420): string {
  let s = String(text || '');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 — $2');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/^[ \t]*[-–—•*][ \t]*$/gm, '');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{2,}/g, '\n');
  s = s.replace(/[ \t]{2,}/g, ' ').trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen).trim()}…`;
  return s;
}

function brandMentionedInText(answer: string, businessName: string): boolean {
  const text = String(answer || '').toLowerCase();
  const name = String(businessName || '').trim().toLowerCase();
  if (!text || !name || name.length < 3) return false;
  if (text.includes(name)) return true;
  
  const tokens = name
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !['ltd', 'limited', 'services', 'service', 'the', 'and'].includes(t));
  if (!tokens.length) return false;
  return tokens.every((t) => text.includes(t));
}

function shortCityForWebSearch(city?: string): string | undefined {
  const raw = String(city || '').trim();
  if (!raw) return undefined;
  
  const first = raw.split(/[·|,]/)[0]?.trim() || raw;
  if (first.length > 48) return first.slice(0, 48).trim();
  
  if (/\d{1,5}\s+\w+/.test(first) && first.length > 28) {
    const parts = first.split(/\s+/);
    return parts.slice(-2).join(' ') || undefined;
  }
  return first || undefined;
}


function geoLlmSystemMessage(city?: string): string {
  const place = shortCityForWebSearch(city) || 'the local area in the UK';
  return (
    `UK local search helper. Use web search. Location: ${place} (if query says "near me", use that place). ` +
    `Reply in under 80 words. Numbered list of up to 5 real business names only, one per line. ` +
    `No addresses, ratings, URLs, paragraphs, or blank lines. Do not say you lack maps or location.`
  ).slice(0, 500);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function applyBusinessDataLocation(
  task: Record<string, unknown>,
  opts: { lat?: number | null; lng?: number | null; locationName?: string }
) {
  const lat = opts.lat;
  const lng = opts.lng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    task.location_coordinate = `${lat},${lng},200`;
    return;
  }
  if (opts.locationName && String(opts.locationName).trim()) {
    task.location_name = String(opts.locationName).trim();
    return;
  }
  task.location_code = 2826;
}

function businessDataKeyword(opts: {
  keyword?: string;
  placeId?: string;
  cid?: string;
}): string {
  const placeId = String(opts.placeId || '').trim();
  if (placeId) return `place_id:${placeId}`;
  const cid = String(opts.cid || '').trim();
  if (cid) return `cid:${cid}`;
  return String(opts.keyword || '').trim();
}

async function postBusinessDataTask(
  path: string,
  task: Record<string, unknown>
): Promise<string | null> {
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(20000)
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
  const id = String(t?.id || '').trim();
  return id || null;
}

async function pollBusinessDataTaskGet(
  getPathPrefix: string,
  taskId: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<any | null> {
  const id = String(taskId || '').trim();
  if (!id) return null;
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const intervalMs = opts?.intervalMs ?? 2000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`https://api.dataforseo.com/v3/${getPathPrefix}/${id}`, {
        method: 'GET',
        headers: { Authorization: basicAuthHeader() },
        signal: AbortSignal.timeout(15000)
      });
      const data: any = await res.json().catch(() => ({}));
      const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
      const code = Number(t?.status_code);
      if (code === 20000) return t;
      
      if (code && code !== 20100 && code !== 40601 && code !== 40602) {
        return null;
      }
    } catch {
      
    }
    await sleepMs(intervalMs);
  }
  return null;
}

function parseDfsTimestamp(raw: unknown): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  
  const normalized = s.replace(' ', 'T').replace(' +00:00', 'Z').replace(/ ([+-]\d{2}:\d{2})$/, '$1');
  const d = new Date(normalized);
  return Number.isFinite(d.getTime()) ? d : null;
}

export type GbpUpdatesResult = {
  ok: boolean;
  totalPosts: number;
  recentPosts: number;
  recentPostAt: string | null;
  hasRecentPosts: boolean | null;
  evidence: string;
};

export async function fetchGbpUpdates(opts: {
  keyword?: string;
  placeId?: string;
  cid?: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  depth?: number;
  timeoutMs?: number;
  recentDays?: number;
}): Promise<GbpUpdatesResult> {
  const unknown = (ev: string): GbpUpdatesResult => ({
    ok: false,
    totalPosts: 0,
    recentPosts: 0,
    recentPostAt: null,
    hasRecentPosts: null,
    evidence: ev
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  const keyword = businessDataKeyword(opts);
  if (!keyword) return unknown('Missing business keyword / place_id');

  try {
    const task: Record<string, unknown> = {
      language_code: opts.languageCode || 'en',
      keyword,
      depth: opts.depth ?? 10
    };
    applyBusinessDataLocation(task, opts);
    const taskId = await postBusinessDataTask(
      'business_data/google/my_business_updates/task_post',
      task
    );
    if (!taskId) return unknown('Updates task_post failed');

    const ready = await pollBusinessDataTaskGet(
      'business_data/google/my_business_updates/task_get',
      taskId,
      { timeoutMs: opts.timeoutMs ?? 20000 }
    );
    if (!ready) return unknown('Updates task timed out or failed');

    const result = Array.isArray(ready.result) ? ready.result[0] : ready.result;
    const items = Array.isArray(result?.items) ? result.items : [];
    const recentDays = opts.recentDays ?? 60;
    const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000;
    let recentPosts = 0;
    let newest: Date | null = null;
    for (const it of items) {
      const ts = parseDfsTimestamp(it?.timestamp) || parseDfsTimestamp(it?.post_date);
      if (ts && (!newest || ts > newest)) newest = ts;
      if (ts && ts.getTime() >= cutoff) recentPosts += 1;
      else if (!ts && items.length) {
        
      }
    }
    const totalPosts = items.length;
    const hasRecentPosts = recentPosts > 0;
    const recentPostAt = newest ? newest.toISOString() : null;
    return {
      ok: true,
      totalPosts,
      recentPosts,
      recentPostAt,
      hasRecentPosts,
      evidence: hasRecentPosts
        ? `${recentPosts} Google Post(s) in last ${recentDays} days` +
          (recentPostAt ? ` (newest ${recentPostAt.slice(0, 10)})` : '')
        : totalPosts
          ? `No posts in last ${recentDays} days (${totalPosts} older post(s) found)`
          : 'No Google Posts found on listing'
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Updates fetch failed');
  }
}

export type GbpReviewsSampleResult = {
  ok: boolean;
  reviewCount: number;
  repliedCount: number;
  replyRate: number | null;
  ownerRepliesLikely: boolean | null;
  reviewsLookRecent: boolean | null;
  newestReviewAt: string | null;
  evidence: string;
  recencyEvidence: string;
  samples: Array<{ rating?: number | null; hasReply: boolean; timeAgo?: string; timestamp?: string | null }>;
};

export async function fetchGbpReviewsSample(opts: {
  keyword?: string;
  placeId?: string;
  cid?: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  depth?: number;
  timeoutMs?: number;
  replyRateYesThreshold?: number;
  recentDays?: number;
}): Promise<GbpReviewsSampleResult> {
  const unknown = (ev: string): GbpReviewsSampleResult => ({
    ok: false,
    reviewCount: 0,
    repliedCount: 0,
    replyRate: null,
    ownerRepliesLikely: null,
    reviewsLookRecent: null,
    newestReviewAt: null,
    evidence: ev,
    recencyEvidence: ev,
    samples: []
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  const keyword = businessDataKeyword(opts);
  if (!keyword) return unknown('Missing business keyword / place_id');

  try {
    const task: Record<string, unknown> = {
      language_code: opts.languageCode || 'en',
      keyword,
      depth: opts.depth ?? 20,
      sort_by: 'newest'
    };
    applyBusinessDataLocation(task, opts);
    const taskId = await postBusinessDataTask('business_data/google/reviews/task_post', task);
    if (!taskId) return unknown('Reviews task_post failed');

    const ready = await pollBusinessDataTaskGet(
      'business_data/google/reviews/task_get',
      taskId,
      { timeoutMs: opts.timeoutMs ?? 20000 }
    );
    if (!ready) return unknown('Reviews task timed out or failed');

    const result = Array.isArray(ready.result) ? ready.result[0] : ready.result;
    const items = Array.isArray(result?.items) ? result.items : [];
    const reviewCount = items.length;
    if (!reviewCount) {
      return {
        ok: true,
        reviewCount: 0,
        repliedCount: 0,
        replyRate: null,
        ownerRepliesLikely: null,
        reviewsLookRecent: false,
        newestReviewAt: null,
        evidence: 'No reviews returned in sample',
        recencyEvidence: 'No reviews to assess recency',
        samples: []
      };
    }

    const recentDays = opts.recentDays ?? 90;
    const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000;
    let repliedCount = 0;
    let newest: Date | null = null;
    let recentCount = 0;
    const samples: GbpReviewsSampleResult['samples'] = [];
    for (const it of items) {
      const reply = String(it?.owner_answer || it?.original_owner_answer || '').trim();
      const hasReply = Boolean(reply) || Boolean(it?.owner_timestamp);
      if (hasReply) repliedCount += 1;
      const ts =
        parseDfsTimestamp(it?.timestamp) ||
        parseDfsTimestamp(it?.datetime) ||
        parseDfsTimestamp(it?.time);
      if (ts && (!newest || ts > newest)) newest = ts;
      if (ts && ts.getTime() >= cutoff) recentCount += 1;
      else if (!ts && /\b(day|week|month|hour|minute|just|yesterday|today)\b/i.test(String(it?.time_ago || ''))) {
        
        const ago = String(it.time_ago || '');
        const m = ago.match(/(\d+)\s*(day|week|month)/i);
        if (m) {
          const n = Number(m[1]);
          const unit = m[2].toLowerCase();
          const days = unit.startsWith('day') ? n : unit.startsWith('week') ? n * 7 : n * 30;
          if (days <= recentDays) recentCount += 1;
        } else if (/yesterday|today|hour|minute|just/i.test(ago)) {
          recentCount += 1;
        }
      }
      samples.push({
        rating: it?.rating?.value ?? it?.rating ?? null,
        hasReply,
        timeAgo: it?.time_ago || undefined,
        timestamp: ts ? ts.toISOString() : null
      });
    }
    const replyRate = Math.round((repliedCount / reviewCount) * 100);
    const threshold = opts.replyRateYesThreshold ?? 50;
    const ownerRepliesLikely = replyRate >= threshold;
    const reviewsLookRecent = recentCount > 0;
    const newestReviewAt = newest ? newest.toISOString() : null;
    return {
      ok: true,
      reviewCount,
      repliedCount,
      replyRate,
      ownerRepliesLikely,
      reviewsLookRecent,
      newestReviewAt,
      evidence: `Owner replied to ${repliedCount}/${reviewCount} sampled reviews (${replyRate}%)`,
      recencyEvidence: reviewsLookRecent
        ? `${recentCount} review(s) in last ${recentDays} days` +
          (newestReviewAt ? ` (newest ${newestReviewAt.slice(0, 10)})` : '')
        : `No reviews in last ${recentDays} days among ${reviewCount} sampled`,
      samples: samples.slice(0, 10)
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Reviews fetch failed');
  }
}

export type GbpMyBusinessInfoResult = {
  ok: boolean;
  category: string | null;
  additionalCategories: string[];
  description: string | null;
  hasHours: boolean | null;
  hoursEvidence: string;
  servicesCount: number;
  hasServices: boolean | null;
  hasProducts: boolean | null;
  productsEvidence: string;
  cid: string | null;
  evidence: string;
};

export async function fetchGbpMyBusinessInfo(opts: {
  keyword?: string;
  placeId?: string;
  cid?: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  timeoutMs?: number;
}): Promise<GbpMyBusinessInfoResult> {
  const unknown = (ev: string): GbpMyBusinessInfoResult => ({
    ok: false,
    category: null,
    additionalCategories: [],
    description: null,
    hasHours: null,
    hoursEvidence: ev,
    servicesCount: 0,
    hasServices: null,
    hasProducts: null,
    productsEvidence: ev,
    cid: null,
    evidence: ev
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  const keyword = businessDataKeyword(opts);
  if (!keyword) return unknown('Missing business keyword / place_id');

  try {
    const task: Record<string, unknown> = {
      language_code: opts.languageCode || 'en',
      keyword
    };
    applyBusinessDataLocation(task, opts);
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 35000)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return unknown(`My Business Info HTTP ${res.status}`);
    const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!t || t.status_code !== 20000) return unknown(String(t?.status_message || 'Info task failed'));
    const result = Array.isArray(t.result) ? t.result[0] : t.result;
    const items = Array.isArray(result?.items) ? result.items : [];
    const info = items.find((it: any) => String(it?.type || '').includes('business_info')) || items[0];
    if (!info) return unknown('No business info item returned');

    const category = String(info.category || '').trim() || null;
    const additionalCategories = (Array.isArray(info.additional_categories) ? info.additional_categories : [])
      .map((c: unknown) => String(c || '').trim())
      .filter(Boolean);
    const description = String(info.description || '').trim() || null;
    const work = info.work_time || {};
    const workDetails = work?.work_hours || work;
    const hasHours = Boolean(
      workDetails?.timetable ||
        workDetails?.current_status ||
        (Array.isArray(workDetails?.timetable) && workDetails.timetable.length) ||
        Object.keys(workDetails?.timetable || {}).length
    );
    const services = Array.isArray(info.services) ? info.services : [];
    const attrs = info.attributes || {};
    const availableAttrs = attrs.available_attributes || attrs;
    const attrKeys = availableAttrs && typeof availableAttrs === 'object' ? Object.keys(availableAttrs) : [];
    const hasServices = services.length > 0 || attrKeys.some((k) => /service/i.test(k));
    const productsArr = Array.isArray(info.products) ? info.products : [];
    const hasProducts =
      productsArr.length > 0 ||
      attrKeys.some((k) => /product/i.test(k)) ||
      (info.place_topics &&
        typeof info.place_topics === 'object' &&
        Object.keys(info.place_topics).some((k) => /product|buy|shop|retail/i.test(k)));

    return {
      ok: true,
      category,
      additionalCategories,
      description,
      hasHours: hasHours || Boolean(work?.work_hours),
      hoursEvidence: hasHours || work?.work_hours ? 'Opening hours present on GBP' : 'No opening hours on GBP',
      servicesCount: services.length,
      hasServices,
      hasProducts: Boolean(hasProducts),
      productsEvidence: hasProducts
        ? `Products signals found (${productsArr.length || 'attributes/topics'})`
        : 'No products listed on GBP',
      cid: info.cid ? String(info.cid) : null,
      evidence: [
        category ? `Category: ${category}` : null,
        additionalCategories.length ? `+${additionalCategories.length} secondary` : 'No secondary categories',
        description ? 'Description present' : 'No description',
        hasServices ? `Services: ${services.length || 'attributes'}` : 'No services'
      ]
        .filter(Boolean)
        .join(' · ')
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'My Business Info failed');
  }
}

export type GbpQaResult = {
  ok: boolean;
  questionCount: number;
  answeredCount: number;
  hasQa: boolean | null;
  evidence: string;
};

export async function fetchGbpQa(opts: {
  keyword?: string;
  placeId?: string;
  cid?: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  depth?: number;
  timeoutMs?: number;
}): Promise<GbpQaResult> {
  const unknown = (ev: string): GbpQaResult => ({
    ok: false,
    questionCount: 0,
    answeredCount: 0,
    hasQa: null,
    evidence: ev
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  const keyword = businessDataKeyword(opts);
  if (!keyword) return unknown('Missing business keyword / place_id');

  try {
    const task: Record<string, unknown> = {
      language_code: opts.languageCode || 'en',
      keyword,
      depth: opts.depth ?? 20
    };
    applyBusinessDataLocation(task, opts);
    const res = await fetch(
      'https://api.dataforseo.com/v3/business_data/google/questions_and_answers/live',
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 35000)
      }
    );
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return unknown(`Q&A HTTP ${res.status}`);
    const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!t || t.status_code !== 20000) return unknown(String(t?.status_message || 'Q&A failed'));
    const result = Array.isArray(t.result) ? t.result[0] : t.result;
    const withAnswers = Array.isArray(result?.items) ? result.items : [];
    const without = Array.isArray(result?.items_without_answers) ? result.items_without_answers : [];
    const questionCount = withAnswers.length + without.length;
    const answeredCount = withAnswers.length;
    return {
      ok: true,
      questionCount,
      answeredCount,
      hasQa: questionCount > 0,
      evidence:
        questionCount > 0
          ? `${questionCount} Q&A item(s), ${answeredCount} with answers`
          : 'No GBP Q&A found'
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Q&A fetch failed');
  }
}

export type BacklinksSummaryResult = {
  ok: boolean;
  backlinks: number | null;
  referringDomains: number | null;
  hasBacklinks: boolean | null;
  evidence: string;
};

export async function fetchBacklinksSummary(opts: {
  website?: string;
  timeoutMs?: number;
}): Promise<BacklinksSummaryResult> {
  const unknown = (ev: string): BacklinksSummaryResult => ({
    ok: false,
    backlinks: null,
    referringDomains: null,
    hasBacklinks: null,
    evidence: ev
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  let target = String(opts.website || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
  if (!target) return unknown('Missing website host');

  try {
    const res = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        {
          target,
          include_subdomains: true,
          backlinks_status_type: 'live'
        }
      ]),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return unknown(`Backlinks HTTP ${res.status}`);
    const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!t || t.status_code !== 20000) return unknown(String(t?.status_message || 'Backlinks failed'));
    const result = Array.isArray(t.result) ? t.result[0] : t.result;
    const backlinks = Number(result?.backlinks ?? 0);
    const referringDomains = Number(result?.referring_domains ?? 0);
    const hasBacklinks = backlinks > 0 || referringDomains > 0;
    return {
      ok: true,
      backlinks,
      referringDomains,
      hasBacklinks,
      evidence: hasBacklinks
        ? `${backlinks} backlinks from ${referringDomains} referring domains`
        : 'No backlinks detected for domain'
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Backlinks fetch failed');
  }
}

export type OrganicLocalRankResult = {
  ok: boolean;
  inOrganic: boolean | null;
  position: number | null;
  evidence: string;
};

export async function fetchOrganicLocalRank(opts: {
  keyword: string;
  website?: string;
  businessName?: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  timeoutMs?: number;
}): Promise<OrganicLocalRankResult> {
  const unknown = (ev: string): OrganicLocalRankResult => ({
    ok: false,
    inOrganic: null,
    position: null,
    evidence: ev
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  const keyword = String(opts.keyword || '').trim();
  if (!keyword) return unknown('Missing organic keyword');

  const hostOf = (u: string) => {
    try {
      return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return String(u || '')
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .toLowerCase();
    }
  };
  const targetHost = opts.website ? hostOf(opts.website) : '';
  const brand = String(opts.businessName || '').toLowerCase().trim();

  try {
    const task: Record<string, unknown> = {
      language_code: opts.languageCode || 'en',
      keyword,
      depth: 20,
      device: 'desktop',
      os: 'windows'
    };
    applyLocalLocation(task, opts);
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return unknown(`Organic HTTP ${res.status}`);
    const t = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!t || t.status_code !== 20000) return unknown(String(t?.status_message || 'Organic failed'));
    const result = Array.isArray(t.result) ? t.result[0] : t.result;
    const items = Array.isArray(result?.items) ? result.items : [];
    let position: number | null = null;
    for (const it of items) {
      if (String(it?.type || '') !== 'organic') continue;
      const h = hostOf(String(it?.url || it?.domain || ''));
      const title = String(it?.title || '').toLowerCase();
      const rank = Number(it?.rank_absolute ?? it?.rank_group);
      const hostHit = targetHost && h && (h === targetHost || h.endsWith(`.${targetHost}`));
      const brandHit = brand && title.includes(brand.slice(0, Math.min(brand.length, 24)));
      if (hostHit || brandHit) {
        position = Number.isFinite(rank) ? rank : null;
        break;
      }
    }
    const inOrganic = position != null;
    return {
      ok: true,
      inOrganic,
      position,
      evidence: inOrganic
        ? `In organic results at #${position} for “${keyword}”`
        : `Not in top organic results for “${keyword}”`
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Organic rank failed');
  }
}

export type GeoGridResult = {
  ok: boolean;
  cellsMeasured: number;
  cellsVisible: number;
  visibilityPct: number | null;
  inGrid: boolean | null;
  evidence: string;
};

export async function measureGeoGridVisibility(opts: {
  keyword: string;
  placeId?: string;
  businessName?: string;
  lat: number;
  lng: number;
  locationName?: string;
  timeoutMs?: number;
}): Promise<GeoGridResult> {
  const unknown = (ev: string): GeoGridResult => ({
    ok: false,
    cellsMeasured: 0,
    cellsVisible: 0,
    visibilityPct: null,
    inGrid: null,
    evidence: ev
  });
  if (!requireDataForSeoConfigured()) return unknown('DataForSEO not configured');
  const keyword = String(opts.keyword || '').trim();
  if (!keyword || !Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) {
    return unknown('Missing keyword or coordinates for geo-grid');
  }

  
  const dLat = 0.014;
  const dLng = 0.018;
  const points = [
    { lat: opts.lat, lng: opts.lng },
    { lat: opts.lat + dLat, lng: opts.lng },
    { lat: opts.lat - dLat, lng: opts.lng },
    { lat: opts.lat, lng: opts.lng + dLng },
    { lat: opts.lat, lng: opts.lng - dLng }
  ];

  try {
    let cellsVisible = 0;
    let cellsMeasured = 0;
    for (const p of points) {
      const pack = await fetchMapsLocalPack({
        keyword,
        lat: p.lat,
        lng: p.lng,
        locationName: opts.locationName,
        depth: 10,
        timeoutMs: opts.timeoutMs ?? 18000
      });
      if (!pack.items.length) continue;
      cellsMeasured += 1;
      const hit = findMatchingMapsItem(pack.items, {
        businessName: opts.businessName,
        placeId: opts.placeId
      });
      if (hit) cellsVisible += 1;
      await sleepMs(400);
    }
    if (!cellsMeasured) return unknown('Geo-grid probes returned no Maps results');
    const visibilityPct = Math.round((cellsVisible / cellsMeasured) * 100);
    const inGrid = visibilityPct >= 40;
    return {
      ok: true,
      cellsMeasured,
      cellsVisible,
      visibilityPct,
      inGrid,
      evidence: `Visible in ${cellsVisible}/${cellsMeasured} grid cells (${visibilityPct}%) for “${keyword}”`
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Geo-grid failed');
  }
}

export type DuplicateListingsResult = {
  ok: boolean;
  duplicateLikely: boolean | null;
  matchCount: number;
  evidence: string;
};

export async function detectDuplicateListings(opts: {
  businessName: string;
  placeId?: string;
  phone?: string;
  website?: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
}): Promise<DuplicateListingsResult> {
  const unknown = (ev: string): DuplicateListingsResult => ({
    ok: false,
    duplicateLikely: null,
    matchCount: 0,
    evidence: ev
  });
  const name = String(opts.businessName || '').trim();
  if (!name || !requireDataForSeoConfigured()) return unknown('Duplicate check unavailable');
  try {
    const pack = await fetchMapsLocalPack({
      keyword: name,
      lat: opts.lat,
      lng: opts.lng,
      locationName: opts.locationName,
      depth: 10,
      timeoutMs: 20000
    });
    const norm = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const target = norm(name);
    const matches = pack.items.filter((it) => {
      const n = norm(it.name);
      return n && (n.includes(target.slice(0, 20)) || target.includes(n.slice(0, 20)));
    });
    const uniquePlaceIds = new Set(matches.map((m) => m.placeId).filter(Boolean));
    const duplicateLikely = uniquePlaceIds.size > 1;
    return {
      ok: true,
      duplicateLikely,
      matchCount: uniquePlaceIds.size,
      evidence: duplicateLikely
        ? `${uniquePlaceIds.size} similar Google listings found for “${name}”`
        : uniquePlaceIds.size
          ? 'Single matching Google listing found'
          : 'No duplicate listings detected'
    };
  } catch (err) {
    return unknown((err as Error)?.message || 'Duplicate check failed');
  }
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
    max_output_tokens: opts.platform === 'claude' ? 320 : 280,
    web_search: true,
    system_message: geoLlmSystemMessage(opts.city)
  };
  if (opts.withTemperature !== false && opts.platform !== 'claude') {
    task.temperature = 0.2;
  }
  
  if (opts.platform !== 'gemini') {
    task.web_search_country_iso_code = 'GB';
    task.force_web_search = true;
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
    const err = last.error || '';
    // Rate limit — wait once and retry same model
    if (/rate_limit/i.test(err)) {
      await sleepMs(4000);
      last = await fetchLlmResponseLive({
        platform: opts.platform,
        modelName,
        prompt: opts.prompt,
        city: opts.city,
        timeoutMs: opts.timeoutMs
      });
      if (last.text) return last;
    }
    if (/invalid field.*model_name/i.test(err)) continue;
    if (/invalid field/i.test(err) && opts.city) {
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


export async function checkAiEngineMentions(opts: {
  prompt: string;
  businessName: string;
  city?: string;
  promptKey?: GeoAiPromptKey;
}): Promise<AiEngineCheckResult[]> {
  const prompt = String(opts.prompt || '').trim();
  const businessName = String(opts.businessName || '').trim();
  const city = String(opts.city || '').trim() || undefined;
  const promptKey = opts.promptKey;
  const capturedAt = new Date().toISOString();

  const skippedRow = (
    engine: AiEngineCheckResult['engine'],
    label: string,
    reason: string
  ): AiEngineCheckResult => ({
    engine,
    label,
    prompt,
    promptKey,
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

  
  const [gpt, claude] = await Promise.all([
    fetchLlmWithModelFallback({
      platform: 'chat_gpt',
      models: ['gpt-4.1-mini', 'gpt-4o-mini'],
      prompt,
      city,
      timeoutMs: 55000
    }),
    fetchLlmWithModelFallback({
      platform: 'claude',
      models: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-sonnet-4-6'],
      prompt,
      city,
      timeoutMs: 55000
    })
  ]);
  const gemini = await fetchLlmWithModelFallback({
    platform: 'gemini',
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'],
    prompt,
    city,
    timeoutMs: 55000
  });

  const toRow = (
    engine: AiEngineCheckResult['engine'],
    label: string,
    res: { text: string; error?: string }
  ): AiEngineCheckResult => {
    if (!res.text) {
      return skippedRow(engine, label, res.error || 'No answer');
    }
    const excerpt = sanitizeLlmExcerpt(res.text, 420);
    const mentioned = brandMentionedInText(res.text, businessName);
    return {
      engine,
      label,
      prompt,
      promptKey,
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

export async function checkAiEngineMentionsMulti(opts: {
  service?: string;
  city?: string;
  address?: string | null;
  businessName: string;
}): Promise<AiEngineCheckResult[]> {
  const businessName = String(opts.businessName || '').trim();
  const city = String(opts.city || '').trim() || undefined;
  const prompts = buildGeoAiPrompts({
    service: opts.service,
    city,
    address: opts.address
  });
  const out: AiEngineCheckResult[] = [];
  for (let i = 0; i < prompts.length; i++) {
    if (i > 0) await sleepMs(2000);
    const { key, prompt } = prompts[i];
    const batch = await checkAiEngineMentions({
      prompt,
      businessName,
      city,
      promptKey: key
    });
    out.push(...batch);
  }
  return out;
}
