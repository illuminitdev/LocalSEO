/** Deployed Local SEO API Gateway URLs — keep in sync with backend/infra and docs */
const STAGE_API_URLS = {
    dev: 'https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com',
    prod: 'https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com'
} as const;

export type AppStage = keyof typeof STAGE_API_URLS;

function normalizeBase(url: string) {
    return url.replace(/\/$/, '');
}

/**
 * Resolve API base URL for the SPA.
 * - Default: remote API from VITE_STAGE (dev | prod) — no local backend required.
 * - VITE_USE_LOCAL_API=true: empty base → Vite proxies /api to localhost:5000.
 * - VITE_API_BASE: explicit override.
 */
export function resolveApiBase(): string {
    if (import.meta.env.VITE_USE_LOCAL_API === 'true') {
        return '';
    }

    const explicit = String(import.meta.env.VITE_API_BASE || '').trim();
    if (explicit) {
        return normalizeBase(explicit);
    }

    const stage = String(import.meta.env.VITE_STAGE || 'dev').toLowerCase();
    if (stage === 'prod') {
        return STAGE_API_URLS.prod;
    }
    return STAGE_API_URLS.dev;
}

export const APP_STAGE = (String(import.meta.env.VITE_STAGE || 'dev').toLowerCase() === 'prod'
    ? 'prod'
    : 'dev') as AppStage;

export const USE_LOCAL_API = import.meta.env.VITE_USE_LOCAL_API === 'true';

export const API_BASE = resolveApiBase();
