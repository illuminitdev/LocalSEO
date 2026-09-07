import type { CheckStatus, NapCompareResult } from './types';

function normText(s: string) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normPhone(s: string) {
    const digits = String(s || '').replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
}

function normUrl(s: string) {
    try {
        const raw = String(s || '').trim();
        if (!raw) return '';
        const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const u = new URL(withProto);
        return u.hostname.replace(/^www\./, '').toLowerCase() + u.pathname.replace(/\/$/, '');
    } catch {
        return normText(s);
    }
}

function compareField(
    claimed: string,
    google: string,
    kind: 'text' | 'phone' | 'url'
): { claimed: string; google: string; match: CheckStatus } {
    const c = String(claimed || '').trim();
    const g = String(google || '').trim();
    if (!c && !g) return { claimed: c, google: g, match: 'na' };
    if (!c || !g) return { claimed: c, google: g, match: 'fail' };

    let same = false;
    if (kind === 'phone') same = normPhone(c) === normPhone(g) && normPhone(c).length >= 7;
    else if (kind === 'url') same = normUrl(c) === normUrl(g);
    else {
        const a = normText(c);
        const b = normText(g);
        same = a === b || a.includes(b) || b.includes(a);
    }
    return { claimed: c, google: g, match: same ? 'pass' : 'fail' };
}

export function compareNap(claimed: {
    name?: string;
    phone?: string;
    address?: string;
    website?: string;
}, google: {
    name?: string;
    phone?: string;
    address?: string;
    website?: string;
} | null): NapCompareResult {
    if (!google) {
        return {
            name: { claimed: claimed.name || '', google: '', match: 'fail' },
            phone: { claimed: claimed.phone || '', google: '', match: 'unknown' },
            address: { claimed: claimed.address || '', google: '', match: 'fail' },
            website: { claimed: claimed.website || '', google: '', match: 'unknown' },
            overall: 'fail'
        };
    }

    const name = compareField(claimed.name || '', google.name || '', 'text');
    const phone = compareField(claimed.phone || '', google.phone || '', 'phone');
    const address = compareField(claimed.address || '', google.address || '', 'text');
    const website = compareField(claimed.website || '', google.website || '', 'url');

    const scored = [name, phone, address, website].filter((f) => f.match === 'pass' || f.match === 'fail');
    const fails = scored.filter((f) => f.match === 'fail').length;
    let overall: CheckStatus = 'pass';
    if (!scored.length) overall = 'unknown';
    else if (fails > 0) overall = 'fail';

    return { name, phone, address, website, overall };
}
