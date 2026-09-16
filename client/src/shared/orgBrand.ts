import type { CSSProperties } from 'react';

export const DEFAULT_BRAND_PRIMARY = '#F59E0B';
export const DEFAULT_BRAND_SECONDARY = '#0F172A';

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isValidBrandHex(value: string) {
    return HEX_RE.test(String(value || '').trim());
}

export function normalizeBrandHex(value: string, fallback: string) {
    const raw = String(value || '').trim();
    if (!HEX_RE.test(raw)) return fallback;
    if (raw.length === 4) {
        const r = raw[1];
        const g = raw[2];
        const b = raw[3];
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return raw.toUpperCase();
}

export type OrgBrand = {
    logoUrl?: string | null;
    brandPrimary?: string | null;
    brandSecondary?: string | null;
};


export function orgBrandStyle(brand?: OrgBrand | null): CSSProperties {
    const primary = normalizeBrandHex(brand?.brandPrimary || '', DEFAULT_BRAND_PRIMARY);
    const secondary = normalizeBrandHex(brand?.brandSecondary || '', DEFAULT_BRAND_SECONDARY);
    return {
        ['--brand-primary' as string]: primary,
        ['--brand-secondary' as string]: secondary,
        ['--color-orange' as string]: primary,
        ['--color-orange-dark' as string]: primary
    };
}

export function resolveOrgBrand(brand?: OrgBrand | null) {
    return {
        logoUrl: String(brand?.logoUrl || '').trim(),
        brandPrimary: normalizeBrandHex(brand?.brandPrimary || '', DEFAULT_BRAND_PRIMARY),
        brandSecondary: normalizeBrandHex(brand?.brandSecondary || '', DEFAULT_BRAND_SECONDARY)
    };
}
