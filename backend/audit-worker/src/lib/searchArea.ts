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

/** Prefer suburb/town segment from a UK-style comma address (before postcode / country). */
function suburbFromAddress(address: string): string | undefined {
  const parts = String(address || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;

  const withoutPostcode = parts.filter((p) => !UK_POSTCODE_RE.test(p) && !/^uk$|^united kingdom$/i.test(p));
  if (!withoutPostcode.length) return undefined;

  
  if (withoutPostcode.length >= 2) {
    const candidate = withoutPostcode[withoutPostcode.length - 2] || withoutPostcode[withoutPostcode.length - 1];
    if (candidate && looksLikeTownOrSuburb(candidate)) return candidate;
  }
  const last = withoutPostcode[withoutPostcode.length - 1];
  if (last && looksLikeTownOrSuburb(last)) return last;
  return undefined;
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

  if (cityRaw && looksLikeTownOrSuburb(cityRaw)) {
    const fromAddress = suburbFromAddress(addressRaw);
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
    if (shortened) return { label: shortened, postcode };
  }

  if (addressRaw) {
    const first = addressRaw.split(',')[0]?.trim();
    if (first) return { label: first, postcode };
  }

  return { label: 'the local area' };
}

export function isBigCityLabel(label: string): boolean {
  return BIG_CITY_DEFAULTS.has(String(label || '').trim().toLowerCase());
}
