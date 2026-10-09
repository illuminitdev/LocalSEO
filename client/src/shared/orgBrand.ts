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

/**
 * Calculates perceived brightness (0-255) using WCAG / ITU-R BT.709 perceived luminance formula.
 * Formula: (r * 299 + g * 587 + b * 114) / 1000
 * Returns true if the color is dark (requiring white text), false if light (requiring dark/black text).
 */
export function isDarkColor(color?: string | null): boolean {
    if (!color) return false;
    const raw = String(color).trim();

    // Check hex color
    if (raw.startsWith('#') || HEX_RE.test(`#${raw}`)) {
        const hex = normalizeBrandHex(raw.startsWith('#') ? raw : `#${raw}`, DEFAULT_BRAND_PRIMARY).replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 155;
    }

    // Check rgb/rgba
    const rgbMatch = raw.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 155;
    }

    return false;
}

export function getContrastTextColor(hexColor?: string | null, darkText = '#0F172A', lightText = '#FFFFFF'): string {
    return isDarkColor(hexColor) ? lightText : darkText;
}

export type OrgBrand = {
    logoUrl?: string | null;
    brandPrimary?: string | null;
    brandSecondary?: string | null;
};


export function orgBrandStyle(brand?: OrgBrand | null): CSSProperties {
    const primary = normalizeBrandHex(brand?.brandPrimary || '', DEFAULT_BRAND_PRIMARY);
    const secondary = normalizeBrandHex(brand?.brandSecondary || '', DEFAULT_BRAND_SECONDARY);
    const primaryForeground = getContrastTextColor(primary);
    return {
        ['--brand-primary' as string]: primary,
        ['--brand-primary-foreground' as string]: primaryForeground,
        ['--brand-secondary' as string]: secondary,
        ['--color-orange' as string]: primary,
        ['--color-orange-dark' as string]: primary
    };
}

export function resolveOrgBrand(brand?: OrgBrand | null) {
    const brandPrimary = normalizeBrandHex(brand?.brandPrimary || '', DEFAULT_BRAND_PRIMARY);
    const brandSecondary = normalizeBrandHex(brand?.brandSecondary || '', DEFAULT_BRAND_SECONDARY);
    return {
        logoUrl: String(brand?.logoUrl || '').trim(),
        brandPrimary,
        brandSecondary,
        brandPrimaryForeground: getContrastTextColor(brandPrimary),
        isPrimaryDark: isDarkColor(brandPrimary)
    };
}

export const ORG_BRAND_CACHE_KEY = 'localpulse_org_brand';

export type CachedOrgBrand = {
    logoUrl: string;
    brandPrimary: string;
    brandSecondary: string;
};

function sessionMark(token: string) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

export function readOrgBrandCache(token: string | null): CachedOrgBrand | null {
    if (!token || typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(ORG_BRAND_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CachedOrgBrand> & { session?: string };
        if (parsed.session !== sessionMark(token)) return null;
        return {
            logoUrl: String(parsed.logoUrl || '').trim(),
            brandPrimary: normalizeBrandHex(parsed.brandPrimary || '', DEFAULT_BRAND_PRIMARY),
            brandSecondary: normalizeBrandHex(parsed.brandSecondary || '', DEFAULT_BRAND_SECONDARY)
        };
    } catch {
        return null;
    }
}

export function writeOrgBrandCache(token: string, brand: CachedOrgBrand) {
    try {
        localStorage.setItem(
            ORG_BRAND_CACHE_KEY,
            JSON.stringify({
                session: sessionMark(token),
                logoUrl: brand.logoUrl,
                brandPrimary: brand.brandPrimary,
                brandSecondary: brand.brandSecondary
            })
        );
    } catch {
        /* private mode or full storage */
    }
}

export function clearOrgBrandCache() {
    try {
        localStorage.removeItem(ORG_BRAND_CACHE_KEY);
    } catch {
        /* ignore */
    }
}

export function applyDocumentBrandVars(brandPrimary: string, brandSecondary: string) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const primaryForeground = getContrastTextColor(brandPrimary);
    root.style.setProperty('--brand-primary', brandPrimary);
    root.style.setProperty('--brand-primary-foreground', primaryForeground);
    root.style.setProperty('--brand-secondary', brandSecondary);
    root.style.setProperty('--color-orange', brandPrimary);
    root.style.setProperty('--color-orange-dark', brandPrimary);
}

export function readBrandPrimaryHex() {
    if (typeof document === 'undefined') return DEFAULT_BRAND_PRIMARY;
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim();
    return isValidBrandHex(raw) ? normalizeBrandHex(raw, DEFAULT_BRAND_PRIMARY) : DEFAULT_BRAND_PRIMARY;
}

export function darkenHex(hex: string, amount = 0.18) {
    const normalized = normalizeBrandHex(hex, DEFAULT_BRAND_PRIMARY).slice(1);
    const n = parseInt(normalized, 16);
    const mix = (channel: number) => Math.max(0, Math.round(channel * (1 - amount)));
    const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
    return `#${toHex(mix((n >> 16) & 255))}${toHex(mix((n >> 8) & 255))}${toHex(mix(n & 255))}`.toUpperCase();
}

export function preloadBrandLogo(logoUrl: string) {
    if (typeof document === 'undefined') return;
    const url = String(logoUrl || '').trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return;
    const id = 'org-brand-logo-preload';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.rel = 'preload';
        link.as = 'image';
        document.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;
}
