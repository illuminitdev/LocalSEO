export type AppStage = 'dev' | 'prod';

function normalizeBase(url: string) {
    return url.replace(/\/$/, '');
}

/**
 * Resolve API base URL for the SPA — URLs come only from env (never hardcoded).
 * - VITE_API_BASE: required for deployed / remote API
 * - VITE_USE_LOCAL_API=true: empty base → Vite proxies /api to localhost:5000
 */
export function resolveApiBase(): string {
    if (import.meta.env.VITE_USE_LOCAL_API === 'true') {
        return '';
    }

    const base = String(import.meta.env.VITE_API_BASE || '').trim();
    if (!base) {
        console.error(
            '[apiConfig] VITE_API_BASE is missing. Set it in client/.env (dev: test.zappsites.com stack / prod: app.zappsites.com).'
        );
        return '';
    }
    return normalizeBase(base);
}

export const APP_STAGE = (String(import.meta.env.VITE_STAGE || 'dev').toLowerCase() === 'prod'
    ? 'prod'
    : 'dev') as AppStage;

export const USE_LOCAL_API = import.meta.env.VITE_USE_LOCAL_API === 'true';

export const API_BASE = resolveApiBase();

/**
 * ZappSites marketing site for “Get started” / plan links.
 * - test.zappsites.com → staging.zappsites.com (always)
 * - app.zappsites.com → www.zappsites.com (prod; unchanged)
 */
export function resolveMarketingUrl(): string {
    if (typeof window !== 'undefined' && window.location.hostname === 'test.zappsites.com') {
        return 'https://staging.zappsites.com/';
    }

    const fromEnv = String(import.meta.env.VITE_MARKETING_URL || '').trim().replace(/\/$/, '');
    if (fromEnv) return `${fromEnv}/`;

    if (APP_STAGE === 'dev') {
        return 'https://staging.zappsites.com/';
    }

    return 'https://www.zappsites.com/';
}

