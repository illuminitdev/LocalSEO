const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const DEFAULT_BRAND_PRIMARY = '#F59E0B';
export const DEFAULT_BRAND_SECONDARY = '#0F172A';

export function isValidBrandHex(value: unknown): value is string {
    return typeof value === 'string' && HEX_RE.test(value.trim());
}


export function normalizeBrandHex(value: unknown, fallback?: string): string | null {
    const raw = String(value ?? '').trim();
    if (!HEX_RE.test(raw)) {
        return fallback != null && isValidBrandHex(fallback) ? fallback : null;
    }
    if (raw.length === 4) {
        const r = raw[1];
        const g = raw[2];
        const b = raw[3];
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return raw.toUpperCase();
}

export function orgBrandingFields(org: {
    logo_url?: string | null;
    brand_primary?: string | null;
    brand_secondary?: string | null;
}) {
    return {
        logoUrl: org.logo_url || '',
        brandPrimary: normalizeBrandHex(org.brand_primary, DEFAULT_BRAND_PRIMARY) || DEFAULT_BRAND_PRIMARY,
        brandSecondary:
            normalizeBrandHex(org.brand_secondary, DEFAULT_BRAND_SECONDARY) || DEFAULT_BRAND_SECONDARY
    };
}
