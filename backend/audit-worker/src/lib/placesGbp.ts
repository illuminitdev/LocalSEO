/**
 * Google Places (New) helpers for Full Audit worker — fill GBP NAP + photos
 * when the upstream ZappSites Places search missed the listing.
 */

function placesKey(): string {
  return String(process.env.GOOGLE_PLACES_API_KEY || '').trim();
}

export async function fetchPlaceDetailsById(placeId: string): Promise<Record<string, unknown> | null> {
  const key = placesKey();
  const id = String(placeId || '')
    .replace(/^places\//, '')
    .trim();
  if (!key || !id) return null;

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': [
          'id',
          'displayName',
          'formattedAddress',
          'nationalPhoneNumber',
          'internationalPhoneNumber',
          'websiteUri',
          'googleMapsUri',
          'rating',
          'userRatingCount',
          'photos',
          'location',
          'primaryTypeDisplayName'
        ].join(',')
      }
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || data?.error) {
      console.warn('[places] get place failed', data?.error?.message || res.status);
      return null;
    }
    return data;
  } catch (err: any) {
    console.warn('[places] get place error', err?.message);
    return null;
  }
}

async function resolvePhotoDataUrl(photoName: string, maxPx = 800): Promise<string | null> {
  const key = placesKey();
  const name = String(photoName || '').replace(/^\//, '');
  if (!key || !name) return null;
  try {
    const metaUrl = `https://places.googleapis.com/v1/${name}/media?maxHeightPx=${maxPx}&maxWidthPx=${maxPx}&skipHttpRedirect=true`;
    const metaRes = await fetch(metaUrl, { headers: { 'X-Goog-Api-Key': key } });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { photoUri?: string };
      if (meta.photoUri) {
        const imgRes = await fetch(meta.photoUri);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const ct = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
          if (buf.length && /^image\//i.test(ct)) {
            return `data:${ct};base64,${buf.toString('base64')}`;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function photoUrlsFromPlace(place: Record<string, unknown>, limit = 2): Promise<string[]> {
  const photos = Array.isArray(place.photos) ? place.photos : [];
  const out: string[] = [];
  for (const p of photos.slice(0, limit)) {
    const name = String((p as any)?.name || '');
    if (!name) continue;
    const dataUrl = await resolvePhotoDataUrl(name);
    if (dataUrl) out.push(dataUrl);
  }
  return out;
}

export function gbpFieldsFromPlaceDetails(place: Record<string, unknown>) {
  const displayName = (place.displayName as { text?: string } | undefined)?.text || '';
  const primary =
    (place.primaryTypeDisplayName as { text?: string } | undefined)?.text ||
    String(place.primaryTypeDisplayName || '');
  const lat =
    typeof (place.location as any)?.latitude === 'number'
      ? (place.location as any).latitude
      : null;
  const lng =
    typeof (place.location as any)?.longitude === 'number'
      ? (place.location as any).longitude
      : null;
  return {
    gbpName: displayName,
    address: String(place.formattedAddress || ''),
    phone: String(place.internationalPhoneNumber || place.nationalPhoneNumber || ''),
    websiteOnGbp: String(place.websiteUri || ''),
    mapsUrl: String(place.googleMapsUri || ''),
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    placeId: String(place.id || ''),
    latitude: lat,
    longitude: lng,
    primaryTypeDisplayName: primary,
    photosPresent: Array.isArray(place.photos) && place.photos.length > 0,
    photoNames: (Array.isArray(place.photos) ? place.photos : [])
      .map((p: any) => String(p?.name || ''))
      .filter(Boolean)
      .slice(0, 3)
  };
}
