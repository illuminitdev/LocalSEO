const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const BIG_CITY_DEFAULTS = new Set([
  'manchester',
  'london',
  'birmingham',
  'leeds',
  'liverpool',
  'glasgow',
  'edinburgh',
  'bristol',
  'sheffield',
  'nottingham'
]);

function looksLikeFullAddress(s: string): boolean {
  const t = String(s || '').trim();
  if (!t) return false;
  if (UK_POSTCODE_RE.test(t)) return true;
  if (t.includes(',')) return true;
  if (/\d/.test(t) && t.length > 20) return true;
  return false;
}

/** Street, road, and similar address lines are not a search area. */
export function looksLikeStreet(s: string): boolean {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^\d+\b/.test(t)) return true;
  return /\b(street|st|road|rd|lane|ln|avenue|ave|drive|dr|close|way|terrace|crescent|grove|gardens|mews|parade|park|estate|industrial|trading|retail|centre|center|works|yard|quay|wharf|mill|court|square|place|row|moss)\b/i.test(t);
}

function looksLikeTownOrSuburb(s: string): boolean {
  const t = String(s || '').trim();
  if (!t || looksLikeFullAddress(t)) return false;
  if (t.length > 48) return false;
  if (/,/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s\-']{1,47}$/.test(t);
}

function extractPostcode(text: string): string | undefined {
  const m = String(text || '').match(UK_POSTCODE_RE);
  if (!m) return undefined;
  return m[1].toUpperCase().replace(/\s+/, ' ').trim();
}

const COUNTRY_RE = /^(uk|u\.k\.|united kingdom|great britain|gb|england|scotland|wales|northern ireland)$/i;

const REGIONS = new Set([
  'greater manchester',
  'greater london',
  'merseyside',
  'west yorkshire',
  'south yorkshire',
  'north yorkshire',
  'east riding of yorkshire',
  'west midlands',
  'east midlands',
  'tyne and wear',
  'county durham',
  'cumbria',
  'kent',
  'essex',
  'surrey',
  'east sussex',
  'west sussex',
  'norfolk',
  'suffolk',
  'devon',
  'cornwall',
  'somerset',
  'dorset',
  'middlesex',
  'north west',
  'north east',
  'south west',
  'south east'
]);

/** Counties and regions are too wide to be a search area. */
export function isCountyOrRegion(s: string): boolean {
  const t = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return false;
  return REGIONS.has(t) || /shire$/.test(t) || COUNTRY_RE.test(t);
}

/** Unit, flat and building lines are not a place. */
function looksLikeUnit(s: string): boolean {
  return /^(unit|flat|suite|floor|apartment|apt|building|block|room|office|ground floor|first floor|second floor)\b/i.test(
    String(s || '').trim()
  );
}

/** "St Helens" is a town; "High St" is a street. */
function looksLikeStreetPart(s: string): boolean {
  return looksLikeStreet(String(s || '').trim().replace(/^st\.?\s+/i, ''));
}

/** Town-like comma segments of an address, with the postcode taken out of each one ("Sale M33 7XY" → "Sale"). */
function placeSegments(address: string): Array<{ text: string; hadPostcode: boolean }> {
  const out: Array<{ text: string; hadPostcode: boolean }> = [];
  for (const raw of String(address || '').split(',')) {
    const hadPostcode = UK_POSTCODE_RE.test(raw);
    const text = raw.replace(UK_POSTCODE_RE, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (isCountyOrRegion(text) || looksLikeUnit(text) || looksLikeStreetPart(text)) continue;
    if (!looksLikeTownOrSuburb(text)) continue;
    out.push({ text, hadPostcode });
  }
  return out;
}

/** Post town of a UK address: the segment next to the postcode, else the last town-like segment. */
export function townFromAddress(address: string): string {
  const places = placeSegments(address);
  if (!places.length) return '';
  const withPostcode = places.find((p) => p.hadPostcode);
  return (withPostcode || places[places.length - 1]).text;
}

/** Prefer suburb/town segment from a UK-style comma address (before postcode / country). */
function suburbFromAddress(address: string): string | undefined {
  const places = placeSegments(address).map((p) => p.text);
  if (!places.length) return undefined;
  if (places.length >= 2) return places[places.length - 2];
  return places[places.length - 1];
}

/** True when the place name appears as whole words in the address. */
export function placeInAddress(place: string, address: string): boolean {
  const p = String(place || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const a = String(address || '').toLowerCase().replace(/\s+/g, ' ');
  if (!p || !a) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(a);
}

/**
 * The intake city, unless it is empty, a county, a pasted address, or a place the address never mentions:
 * then the address's post town. Keeps a wrong form city out of Maps queries and the score.
 */
export function trustedCity(city: string | null | undefined, address: string | null | undefined): string {
  const cityRaw = String(city || '').trim();
  const addressRaw = String(address || '').trim();
  const town = townFromAddress(addressRaw);
  if (!town) return cityRaw;
  if (
    !cityRaw ||
    looksLikeFullAddress(cityRaw) ||
    looksLikeStreet(cityRaw) ||
    isCountyOrRegion(cityRaw) ||
    !placeInAddress(cityRaw, addressRaw)
  ) {
    return town;
  }
  return cityRaw;
}

export type SearchArea = {
  label: string;
  postcode?: string;
};

/**
 * Resolve a hyperlocal search label for Maps / checklist / report copy.
 * Prefer explicit town/suburb city; else parse address; never invent Manchester when address yields a better label.
 */
export function resolveSearchArea(input: {
  city?: string | null;
  address?: string | null;
}): SearchArea {
  const cityRaw = String(input.city || '').trim();
  const addressRaw = String(input.address || '').trim();
  const postcode = extractPostcode(addressRaw) || extractPostcode(cityRaw);

  if (cityRaw && looksLikeTownOrSuburb(cityRaw) && !looksLikeStreet(cityRaw)) {
    const fromAddress = suburbFromAddress(addressRaw);
    // A county or a city the address never mentions is a wrong intake value: the address's post town wins.
    const addressTown = townFromAddress(addressRaw);
    if (addressTown && (isCountyOrRegion(cityRaw) || !placeInAddress(cityRaw, addressRaw))) {
      return { label: addressTown, postcode };
    }
    if (
      fromAddress &&
      isBigCityLabel(cityRaw) &&
      !isBigCityLabel(fromAddress) &&
      fromAddress.toLowerCase() !== cityRaw.toLowerCase()
    ) {
      return { label: fromAddress, postcode: postcode || extractPostcode(addressRaw) };
    }
    return { label: cityRaw, postcode };
  }

  
  if (cityRaw && looksLikeFullAddress(cityRaw)) {
    const fromCityAsAddress = suburbFromAddress(cityRaw);
    if (fromCityAsAddress) return { label: fromCityAsAddress, postcode: postcode || extractPostcode(cityRaw) };
    if (postcode) return { label: postcode, postcode };
  }

  const fromAddress = suburbFromAddress(addressRaw);
  if (fromAddress) return { label: fromAddress, postcode };

  if (postcode) return { label: postcode, postcode };

  if (cityRaw) {
    const shortened = cityRaw.split(',')[0]?.trim();
    if (shortened && !looksLikeStreet(shortened) && looksLikeTownOrSuburb(shortened)) {
      return { label: shortened, postcode };
    }
  }

  if (addressRaw) {
    for (const part of addressRaw.split(',')) {
      const piece = part.trim();
      if (piece && looksLikeTownOrSuburb(piece) && !looksLikeStreet(piece)) {
        return { label: piece, postcode };
      }
    }
  }

  return { label: 'the local area' };
}

export function isBigCityLabel(label: string): boolean {
  return BIG_CITY_DEFAULTS.has(String(label || '').trim().toLowerCase());
}
