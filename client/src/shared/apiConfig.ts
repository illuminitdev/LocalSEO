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
            '[apiConfig] VITE_API_BASE is missing. Set it in client/.env or Vercel env (Preview/Production).'
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
