




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
      body: JSON.stringify([{ task_id: id, browser_preset: 'desktop' }]),
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
    os: 'windows'
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
    const dataUrl = await captureSerpScreenshotDataUrl(taskId, { timeoutMs: 45000 });
    if (!dataUrl) {
      return {
        query,
        skipped: true,
        reason: 'Screenshot unavailable',
        capturedAt: new Date().toISOString()
      };
    }
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
  engine: 'chatgpt' | 'claude';
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

async function fetchLlmResponseLive(opts: {
  platform: 'chat_gpt' | 'claude';
  modelName: string;
  prompt: string;
  city?: string;
  timeoutMs?: number;
}): Promise<{ text: string; error?: string }> {
  if (!requireDataForSeoConfigured()) return { text: '', error: 'DataForSEO not configured' };
  const prompt = String(opts.prompt || '').trim().slice(0, 500);
  if (!prompt) return { text: '', error: 'Empty prompt' };

  const task: Record<string, unknown> = {
    user_prompt: prompt,
    model_name: opts.modelName,
    max_output_tokens: 450,
    temperature: 0.2,
    web_search: true,
    web_search_country_iso_code: 'GB'
  };
  if (opts.city && String(opts.city).trim()) {
    task.web_search_city = String(opts.city).trim();
  }

  const path =
    opts.platform === 'claude'
      ? 'https://api.dataforseo.com/v3/ai_optimization/claude/llm_responses/live'
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
      return { text: '', error: `HTTP ${res.status} ${data?.status_message || ''}` };
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

/**
 * Ask ChatGPT + Claude the same local prompt users will type, so GEO can be cross-checked.
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

  if (!prompt || !businessName) {
    return [
      {
        engine: 'chatgpt',
        label: 'ChatGPT',
        prompt,
        mentioned: null,
        recommendedLikely: null,
        citedHosts: [],
        answerExcerpt: '',
        skipped: true,
        reason: 'Missing prompt or business name',
        capturedAt
      },
      {
        engine: 'claude',
        label: 'Claude',
        prompt,
        mentioned: null,
        recommendedLikely: null,
        citedHosts: [],
        answerExcerpt: '',
        skipped: true,
        reason: 'Missing prompt or business name',
        capturedAt
      }
    ];
  }

  const [gpt, claude] = await Promise.all([
    fetchLlmResponseLive({
      platform: 'chat_gpt',
      modelName: 'gpt-4.1-mini',
      prompt,
      city,
      timeoutMs: 55000
    }),
    fetchLlmResponseLive({
      platform: 'claude',
      modelName: 'claude-sonnet-4-0',
      prompt,
      city,
      timeoutMs: 55000
    })
  ]);

  const toRow = (
    engine: 'chatgpt' | 'claude',
    label: string,
    res: { text: string; error?: string }
  ): AiEngineCheckResult => {
    if (!res.text) {
      return {
        engine,
        label,
        prompt,
        mentioned: null,
        recommendedLikely: null,
        citedHosts: [],
        answerExcerpt: '',
        skipped: true,
        reason: res.error || 'No answer',
        capturedAt
      };
    }
    const excerpt = res.text.length > 700 ? `${res.text.slice(0, 700).trim()}…` : res.text;
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

  return [toRow('chatgpt', 'ChatGPT', gpt), toRow('claude', 'Claude', claude)];
}
