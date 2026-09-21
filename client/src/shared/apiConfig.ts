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

/** ZappSites marketing site origin used for shareable audit reports. */
export function resolveAuditReportOrigin(): string {
    const override = String(import.meta.env.VITE_AUDIT_REPORT_ORIGIN || '')
        .trim()
        .replace(/\/$/, '');
    if (override) return override;

    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        // LocalPulse admin on localhost → open local ZappSites frontend (port 3000)
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:3000';
        }
    }

    return resolveMarketingUrl().replace(/\/$/, '');
}

/**
 * Rewrite API share URLs (often production) so local admin opens the local ZappSites report.
 * Accepts a full URL, `/audit-report/:id`, or a bare audit id.
 */
export function resolveAuditReportUrl(shareUrlOrAuditId: string): string {
    const raw = String(shareUrlOrAuditId || '').trim();
    if (!raw) return '';
    const origin = resolveAuditReportOrigin();

    if (!raw.includes('/') && !raw.includes('://')) {
        return `${origin}/audit-report/${raw}`;
    }

    try {
        const u = new URL(raw, `${origin}/`);
        const match = u.pathname.match(/\/audit-report\/([^/]+)/);
        if (match?.[1]) return `${origin}/audit-report/${match[1]}`;
        if (u.pathname.startsWith('/audit-report')) return `${origin}${u.pathname}`;
    } catch {
        /* fall through */
    }

    if (raw.startsWith('/audit-report/')) return `${origin}${raw}`;
    return raw;
}

