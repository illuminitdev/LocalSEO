/**
 * DataForSEO Google Maps SERP — Full Audit local-pack / Maps rankings (admin worker).
 * Docs: POST https://api.dataforseo.com/v3/serp/google/maps/live/advanced
 */

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
  isThisBusiness: boolean;
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
    address: String(raw?.address || raw?.snippet || '').trim(),
    rating: typeof ratingVal === 'number' ? ratingVal : ratingVal != null ? Number(ratingVal) : null,
    reviewsCount: Number(reviews) || 0,
    lat,
    lng,
    mapsUrl: String(raw?.url || raw?.book_online_url || '').trim(),
    website: String(raw?.domain ? `https://${raw.domain}` : raw?.website || '').trim(),
    phone: String(raw?.phone || '').trim(),
    isThisBusiness: false
  };
}

/** Live Google Maps local pack. Returns [] on soft failure. */
export async function fetchMapsLocalPack(opts: {
  keyword: string;
  lat?: number | null;
  lng?: number | null;
  locationName?: string;
  languageCode?: string;
  depth?: number;
  timeoutMs?: number;
}): Promise<DataForSeoMapsItem[]> {
  if (!requireDataForSeoConfigured()) return [];

  const keyword = String(opts.keyword || '').trim();
  if (!keyword) return [];

  const task: Record<string, unknown> = {
    language_code: opts.languageCode || 'en',
    keyword,
    depth: Math.min(Math.max(opts.depth ?? 10, 10), 20),
    device: 'desktop',
    os: 'windows'
  };

  const lat = opts.lat;
  const lng = opts.lng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    task.location_coordinate = `${lat},${lng},12z`;
    task.search_this_area = true;
  } else if (opts.locationName && String(opts.locationName).trim()) {
    task.location_name = String(opts.locationName).trim();
  } else {
    task.location_code = 2826; // United Kingdom
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

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[dataForSeo] maps live HTTP', res.status, data?.status_message || '');
      return [];
    }

    const taskResult = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!taskResult || taskResult.status_code !== 20000) {
      console.warn(
        '[dataForSeo] maps task status:',
        taskResult?.status_code,
        taskResult?.status_message || data?.status_message
      );
      return [];
    }

    const result = Array.isArray(taskResult.result) ? taskResult.result[0] : null;
    const items = Array.isArray(result?.items) ? result.items : [];
    const mapped = items
      .map((item: any, idx: number) => normalizeItem(item, idx))
      .filter(Boolean) as DataForSeoMapsItem[];

    return mapped.slice(0, opts.depth ?? 10).map((row, idx) => ({
      ...row,
      position: idx + 1
    }));
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err?.message;
    console.warn('[dataForSeo] maps live failed:', msg);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Build Full Audit gbpLookup.localRank shape from DataForSEO Maps results. */
export function buildDeepLocalRank(opts: {
  query: string;
  items: DataForSeoMapsItem[];
  businessName?: string;
  placeId?: string;
}) {
  const nameNorm = String(opts.businessName || '')
    .toLowerCase()
    .trim();
  const normalizedId = String(opts.placeId || '').replace(/^places\//, '');

  const topResults = opts.items.map((r) => {
    const idMatch =
      normalizedId &&
      r.placeId &&
      (r.placeId === normalizedId ||
        r.placeId.endsWith(normalizedId) ||
        normalizedId.endsWith(r.placeId));
    const nameMatch = nameNorm && r.name.toLowerCase().includes(nameNorm);
    return {
      position: r.position,
      name: r.name,
      address: r.address,
      rating: r.rating,
      reviewCount: r.reviewsCount,
      isProspect: Boolean(idMatch || nameMatch)
    };
  });

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
