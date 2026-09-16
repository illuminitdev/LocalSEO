export type AppStage = 'dev' | 'prod';

function normalizeBase(url: string) {
    return url.replace(/\/$/, '');
}






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

