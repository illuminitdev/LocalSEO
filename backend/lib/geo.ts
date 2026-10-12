export type GeoHint = { address?: string; lat?: number | null; lng?: number | null };

const COUNTRY_CODES: Array<[RegExp, number]> = [
    [/\b(india|ind)\b/i, 2356],
    [/\b(united kingdom|uk|england|scotland|wales)\b/i, 2826],
    [/\b(canada)\b/i, 2124],
    [/\b(australia)\b/i, 2036],
    [/\b(ireland)\b/i, 2372],
    [/\b(uae|united arab emirates|dubai)\b/i, 2784],
    [/\b(usa|united states|us)\b/i, 2840]
];

const COUNTRY_NAMES: Record<number, string> = {
    2356: 'India',
    2826: 'UK',
    2124: 'Canada',
    2036: 'Australia',
    2372: 'Ireland',
    2784: 'UAE',
    2840: 'US'
};

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/** Google Ads / DataForSEO location code for the business country. Volumes and rankings are per country. */
export function locationCodeFor(geo: GeoHint | string | null | undefined) {
    const hint: GeoHint = typeof geo === 'string' ? { address: geo } : geo || {};
    const address = String(hint.address || '');
    const hit = COUNTRY_CODES.find(([re]) => re.test(address));
    if (hit) return hit[1];
    if (UK_POSTCODE.test(address)) return 2826;
    const lat = Number(hint.lat);
    const lng = Number(hint.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (lat >= 49.8 && lat <= 61 && lng >= -8.7 && lng <= 2) return 2826; // United Kingdom
        if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98) return 2356; // India
    }
    return 2840;
}

export function countryName(geo: GeoHint | string | null | undefined) {
    return COUNTRY_NAMES[locationCodeFor(geo)] || 'your country';
}
