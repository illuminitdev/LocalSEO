
const LEGAL_SUFFIX = new Set(['ltd', 'limited', 'llp', 'plc', 'inc', 'co', 'company', 'uk', 'group']);

function words(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Brand tokens without legal suffixes ("Leeds Windows Ltd" -> ["leeds", "windows"]). */
export function brandTokens(name: string): string[] {
  const tokens = words(name);
  while (tokens.length > 1 && LEGAL_SUFFIX.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

/** Same trading name, ignoring case, punctuation, legal suffixes and an optional trailing town. */
export function sameBrandName(a: string, b: string, city = ''): boolean {
  const ta = brandTokens(a);
  const tb = brandTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  const town = words(city);
  const strip = (t: string[]) => {
    const out = [...t];
    if (town.length && out.length > town.length && out.slice(-town.length).join(' ') === town.join(' ')) {
      out.splice(out.length - town.length);
    }
    while (out.length > 1 && LEGAL_SUFFIX.has(out[out.length - 1])) out.pop();
    return out.join(' ');
  };
  return strip(ta) === strip(tb);
}

function hostOf(u: string): string {
  const raw = String(u || '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

const NAME_WORD = /^[A-Z0-9][A-Za-z0-9'’.-]*$/;
const SEPARATOR = /^[\s]*[-–—:|,.;()\n*]/;


export function brandNamedIn(
  text: string,
  brand: string,
  opts: { city?: string; website?: string } = {}
): boolean {
  const raw = String(text || '');
  const tokens = brandTokens(brand);
  if (!raw.trim() || !tokens.length || tokens.join(' ').length < 3) return false;

  const host = hostOf(opts.website || '');
  if (host && host.length >= 5 && raw.toLowerCase().includes(host)) return true;

  const town = new Set(words(opts.city || ''));
  // Brand words are joined by spaces or hyphens only ("Leeds; windows" is prose, not a name).
  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s*[-–]\\s*|\\s+)');
  const re = new RegExp(`(^|[^A-Za-z0-9])(${pattern})(?=$|[^A-Za-z0-9])`, 'gi');
  const brandIsLower = brand.trim() === brand.trim().toLowerCase();

  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    // Written as a name: every word capitalised (or the brand itself is styled in lower case).
    if (!brandIsLower && !match[2].split(/[\s\-–]+/).filter(Boolean).every((w) => !/^[a-z]/.test(w))) continue;
    if (!acceptsBefore(raw.slice(Math.max(0, start - 40), start))) continue;
    if (acceptsAfter(raw.slice(end, end + 60), town)) return true;
  }
  return false;
}

/** A capitalised word right before the brand ("North Leeds Windows") makes it a different name. */
function acceptsBefore(before: string): boolean {
  if (!before || /[\n:;|(*•–—-]\s*$/.test(before) || /\d[.)]\s*$/.test(before)) return true;
  const m = before.match(/([A-Za-z0-9'’]+)\s+$/);
  if (!m) return true;
  const prev = m[1];
  if (
    /^(the|by|at|from|with|try|use|call|is|are|and|or|like|including|such|as|choose|contact|consider|hire|ask|visit|recommend|recommended|top|best|also|for|about|of|to)$/i.test(
      prev
    )
  ) {
    return true;
  }
  return !NAME_WORD.test(prev);
}

/** After the brand: end, punctuation, a legal suffix, the town, or ordinary lowercase prose are fine. */
function acceptsAfter(after: string, town: Set<string>): boolean {
  if (!after || SEPARATOR.test(after)) return true;
  const next = after.match(/^\s+([A-Za-z0-9&'’.]+)/);
  if (!next) return true;
  const word = next[1].replace(/[.'’]+$/, '');
  const lower = word.toLowerCase();
  if (LEGAL_SUFFIX.has(lower)) return acceptsAfter(after.slice(next[0].length), town);
  if (town.has(lower)) return acceptsAfter(after.slice(next[0].length), new Set());
  if (lower === 'and' || lower === '&') {
    const following = after.slice(next[0].length).match(/^\s+([A-Za-z0-9'’]+)/);
    return !(following && NAME_WORD.test(following[1]));
  }
  return !NAME_WORD.test(word);
}
