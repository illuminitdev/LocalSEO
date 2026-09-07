/**
 * Google Places helpers (Places API New, with legacy fallback).
 * Set GOOGLE_PLACES_API_KEY in backend/.env
 */

function placesKey() {
    return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

function requirePlacesConfigured() {
    return Boolean(placesKey());
}

function typeToCategory(types: any[] = []) {
    const skip = new Set([
        'establishment',
        'point_of_interest',
        'premise',
        'geocode',
        'political',
        'route',
        'street_address'
    ]);
    const first = (types || []).find((t) => !skip.has(t));
    if (!first) return '';
    return first.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function formatHoursNew(regularOpeningHours: any) {
    const lines = regularOpeningHours?.weekdayDescriptions;
    if (Array.isArray(lines) && lines.length) return lines.join('; ');
    return '';
}

function formatHoursLegacy(openingHours: any) {
    const lines = openingHours?.weekday_text;
    if (Array.isArray(lines) && lines.length) return lines.join('; ');
    return '';
}

function mapReviewsNew(reviews: any[] = []) {
    return reviews.slice(0, 5).map((r) => ({
        author: r.authorAttribution?.displayName || 'Reviewer',
        rating: r.rating ?? 0,
        date: r.relativePublishTimeDescription || '',
        text: r.text?.text || r.originalText?.text || ''
    }));
}

function mapReviewsLegacy(reviews: any[] = []) {
    return reviews.slice(0, 5).map((r) => ({
        author: r.author_name || 'Reviewer',
        rating: r.rating ?? 0,
        date: r.relative_time_description || '',
        text: r.text || ''
    }));
}

function normalizeNewPlace(place: any) {
    if (!place) return null;
    const photoCount = Array.isArray(place.photos) ? place.photos.length : 0;
    const categories = Array.isArray(place.types)
        ? place.types.filter((t: string) => !['establishment', 'point_of_interest', 'premise'].includes(t))
        : [];
    return {
        placeId: place.id || '',
        name: place.displayName?.text || '',
        rating: place.rating ?? null,
        reviewsCount: place.userRatingCount ?? 0,
        address: place.formattedAddress || '',
        category: typeToCategory(place.types),
        categories,
        phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
        website: place.websiteUri || '',
        hours: formatHoursNew(place.regularOpeningHours),
        hasHours: Boolean(place.regularOpeningHours?.weekdayDescriptions?.length),
        description: place.editorialSummary?.text || '',
        attributes: Array.isArray(place.types) ? place.types.slice(0, 6).join(', ') : '',
        reviews: mapReviewsNew(place.reviews || []),
        photoCount,
        hasPhotos: photoCount > 0,
        // Places public API does not expose GBP posts / services list reliably
        hasServices: false,
        hasPosts: false,
        hasDescription: Boolean(place.editorialSummary?.text),
        lat: place.location?.latitude ?? null,
        lng: place.location?.longitude ?? null,
        mapsUrl: place.googleMapsUri || ''
    };
}

function normalizeLegacyDetails(details: any) {
    if (!details) return null;
    const photoCount = Array.isArray(details.photos) ? details.photos.length : 0;
    const categories = Array.isArray(details.types)
        ? details.types.filter((t: string) => !['establishment', 'point_of_interest', 'premise'].includes(t))
        : [];
    return {
        placeId: details.place_id || '',
        name: details.name || '',
        rating: details.rating ?? null,
        reviewsCount: details.user_ratings_total ?? 0,
        address: details.formatted_address || '',
        category: typeToCategory(details.types),
        categories,
        phone: details.formatted_phone_number || details.international_phone_number || '',
        website: details.website || '',
        hours: formatHoursLegacy(details.opening_hours),
        hasHours: Boolean(details.opening_hours?.weekday_text?.length),
        description: details.editorial_summary?.overview || '',
        attributes: Array.isArray(details.types) ? details.types.slice(0, 6).join(', ') : '',
        reviews: mapReviewsLegacy(details.reviews || []),
        photoCount,
        hasPhotos: photoCount > 0,
        hasServices: false,
        hasPosts: false,
        hasDescription: Boolean(details.editorial_summary?.overview),
        lat: details.geometry?.location?.lat ?? null,
        lng: details.geometry?.location?.lng ?? null,
        mapsUrl: details.url || ''
    };
}

async function searchPlacesNew(query: string) {
    const key = placesKey();
    const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.rating',
        'places.userRatingCount',
        'places.types',
        'places.nationalPhoneNumber',
        'places.internationalPhoneNumber',
        'places.websiteUri',
        'places.regularOpeningHours',
        'places.reviews',
        'places.location',
        'places.editorialSummary',
        'places.googleMapsUri',
        'places.photos'
    ].join(',');

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': fieldMask
        },
        body: JSON.stringify({ textQuery: query, languageCode: 'en', maxResultCount: 5 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error?.message || data?.message || `Places New API HTTP ${res.status}`;
        const err = new Error(msg);
        (err as any).status = res.status;
        (err as any).code = data?.error?.status || 'PLACES_NEW_ERROR';
        throw err;
    }
    const places = Array.isArray(data.places) ? data.places : [];
    return places.map(normalizeNewPlace).filter((p: any) => p?.name);
}

async function searchPlacesLegacy(query: string) {
    const key = placesKey();
    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('key', key);

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
        const err = new Error(searchData.error_message || `Places Text Search: ${searchData.status}`);
        (err as any).code = searchData.status;
        throw err;
    }
    if (!searchData.results?.length) return [];

    const top = searchData.results[0];
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', top.place_id);
    detailsUrl.searchParams.set(
        'fields',
        'place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,opening_hours,editorial_summary,reviews,geometry,url'
    );
    detailsUrl.searchParams.set('key', key);

    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    if (detailsData.status !== 'OK') {
        // Fall back to text-search row only
        return [
            {
                placeId: top.place_id,
                name: top.name,
                rating: top.rating ?? null,
                reviewsCount: top.user_ratings_total ?? 0,
                address: top.formatted_address || '',
                category: typeToCategory(top.types),
                phone: '',
                website: '',
                hours: '',
                description: '',
                attributes: Array.isArray(top.types) ? top.types.slice(0, 6).join(', ') : '',
                reviews: [],
                lat: top.geometry?.location?.lat ?? null,
                lng: top.geometry?.location?.lng ?? null,
                mapsUrl: ''
            }
        ];
    }
    return [normalizeLegacyDetails(detailsData.result)].filter(Boolean);
}

async function getPlaceDetailsNew(placeId: string) {
    if (!placeId) return null;
    const key = placesKey();
    const id = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
    const fieldMask = [
        'id',
        'displayName',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'types',
        'nationalPhoneNumber',
        'internationalPhoneNumber',
        'websiteUri',
        'regularOpeningHours',
        'reviews',
        'location',
        'editorialSummary',
        'googleMapsUri',
        'photos'
    ].join(',');
    const res = await fetch(`https://places.googleapis.com/v1/${id}`, {
        headers: {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': fieldMask
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return normalizeNewPlace(data);
}

/**
 * Top-N local text search for "{service} near {town}" style queries.
 * Uses locationBias ~20km when lat/lng provided.
 */
async function searchLocalTop({
    query,
    lat,
    lng,
    maxResultCount = 10,
    radiusMeters = 20000
}: {
    query: string;
    lat?: number | null;
    lng?: number | null;
    maxResultCount?: number;
    radiusMeters?: number;
}) {
    if (!requirePlacesConfigured()) {
        const err = new Error('GOOGLE_PLACES_API_KEY is missing. Add it to backend/.env and restart.');
        (err as any).code = 'NO_KEY';
        throw err;
    }

    const key = placesKey();
    const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.rating',
        'places.userRatingCount',
        'places.types',
        'places.location',
        'places.googleMapsUri',
        'places.websiteUri',
        'places.nationalPhoneNumber'
    ].join(',');

    const body: any = {
        textQuery: query,
        languageCode: 'en',
        maxResultCount: Math.min(Math.max(maxResultCount, 1), 20)
    };
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        body.locationBias = {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius: radiusMeters
            }
        };
    }

    try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': fieldMask
            },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.places)) {
            return data.places
                .map(normalizeNewPlace)
                .filter((p: any) => p?.name)
                .map((p: any, idx: number) => ({
                    position: idx + 1,
                    placeId: p.placeId,
                    name: p.name,
                    address: p.address,
                    rating: p.rating,
                    reviewsCount: p.reviewsCount,
                    lat: p.lat,
                    lng: p.lng,
                    mapsUrl: p.mapsUrl,
                    website: p.website,
                    phone: p.phone,
                    isThisBusiness: false
                }));
        }
        if (!res.ok) {
            console.warn('[googlePlaces] searchLocalTop New API:', data?.error?.message || res.status);
        }
    } catch (err: any) {
        console.warn('[googlePlaces] searchLocalTop New API failed:', err.message);
    }

    // Legacy text search fallback
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('key', key);
    if (typeof lat === 'number' && typeof lng === 'number') {
        url.searchParams.set('location', `${lat},${lng}`);
        url.searchParams.set('radius', String(radiusMeters));
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
    return (data.results || []).slice(0, maxResultCount).map((p: any, idx: number) => ({
        position: idx + 1,
        placeId: p.place_id || '',
        name: p.name || '',
        address: p.formatted_address || '',
        rating: p.rating ?? null,
        reviewsCount: p.user_ratings_total ?? 0,
        lat: p.geometry?.location?.lat ?? null,
        lng: p.geometry?.location?.lng ?? null,
        mapsUrl: '',
        website: '',
        phone: '',
        isThisBusiness: false
    }));
}

async function getBusinessByPlaceId(placeId: string) {
    if (!placeId || !requirePlacesConfigured()) return null;
    try {
        const detailed = await getPlaceDetailsNew(placeId);
        if (detailed) return detailed;
    } catch (err: any) {
        console.warn('[googlePlaces] getBusinessByPlaceId failed:', err.message);
    }
    return null;
}

/**
 * Best matching business for a free-text query.
 * Tries Places API (New), then legacy Text Search + Details.
 */
async function searchBusiness(query: string) {
    if (!requirePlacesConfigured()) {
        const err = new Error('GOOGLE_PLACES_API_KEY is missing. Add it to backend/.env and restart.');
        (err as any).code = 'NO_KEY';
        throw err;
    }

    let lastErr: any = null;
    try {
        const results = await searchPlacesNew(query);
        if (results.length) {
            let best = results[0];
            // SearchText sometimes omits reviews — hydrate from Place Details
            if ((!best.reviews || !best.reviews.length) && best.placeId) {
                const detailed = await getPlaceDetailsNew(best.placeId);
                if (detailed) best = { ...best, ...detailed, reviews: detailed.reviews?.length ? detailed.reviews : best.reviews };
            }
            return best;
        }
    } catch (err: any) {
        lastErr = err;
        console.warn('[googlePlaces] New API failed, trying legacy:', err.message);
    }

    try {
        const legacy = await searchPlacesLegacy(query);
        if (legacy.length) return legacy[0];
        return null;
    } catch (err) {
        throw lastErr || err;
    }
}

async function nearbyCompetitors({ lat, lng, keyword, excludeName }: any) {
    if (!requirePlacesConfigured() || lat == null || lng == null) return [];

    const key = placesKey();
    // Prefer New API nearby
    try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask':
                    'places.displayName,places.rating,places.userRatingCount,places.types,places.formattedAddress'
            },
            body: JSON.stringify({
                includedTypes: keyword ? undefined : ['establishment'],
                maxResultCount: 8,
                locationRestriction: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: 2500.0
                    }
                },
                rankPreference: 'POPULARITY'
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.places)) {
            return data.places
                .map((p: any) => ({
                    name: p.displayName?.text || '',
                    reviews: p.userRatingCount || 0,
                    rating: p.rating || 0,
                    posts: 0,
                    photos: 0,
                    trend: 'up'
                }))
                .filter((c: any) => c.name && (!excludeName || c.name.toLowerCase() !== excludeName.toLowerCase()))
                .slice(0, 5);
        }
    } catch (err: any) {
        console.warn('[googlePlaces] nearby New API failed:', err.message);
    }

    // Legacy Nearby Search
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', '2500');
    if (keyword) url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', key);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
    return (data.results || [])
        .map((p: any) => ({
            name: p.name || '',
            reviews: p.user_ratings_total || 0,
            rating: p.rating || 0,
            posts: 0,
            photos: 0,
            trend: 'up'
        }))
        .filter((c: any) => c.name && (!excludeName || c.name.toLowerCase() !== excludeName.toLowerCase()))
        .slice(0, 5);
}

/**
 * Resolve lat/lng from a free-text address (Geocoding API).
 * Used when the user saves a business profile without picking a Places listing.
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
    const key = placesKey();
    const query = String(address || '').trim();
    if (!key || !query) return null;

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('key', key);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
        console.warn('[geocodeAddress]', data.status || 'no result', data.error_message || '');
        return null;
    }
    const loc = data.results[0].geometry.location;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        lat,
        lng,
        formattedAddress: data.results[0].formatted_address || undefined
    };
}

export {
    requirePlacesConfigured,
    searchBusiness,
    nearbyCompetitors,
    searchLocalTop,
    getBusinessByPlaceId,
    geocodeAddress,
    placesKey
};
