export type WebsiteCheckResult = {
    provided: boolean;
    url: string;
    reachable: boolean;
    https: boolean;
    finalUrl: string | null;
    status: 'pass' | 'fail' | 'unknown';
    note: string;
};

function normalizeUrl(raw: string): string | null {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    try {
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const u = new URL(withProtocol);
        if (!u.hostname) return null;
        return u.toString();
    } catch {
        return null;
    }
}

/**
 * Light reachability check only — no deep crawl / Lighthouse.
 */
export async function checkWebsite(rawUrl?: string | null): Promise<WebsiteCheckResult> {
    const normalized = normalizeUrl(rawUrl || '');
    if (!normalized) {
        return {
            provided: false,
            url: '',
            reachable: false,
            https: false,
            finalUrl: null,
            status: 'fail',
            note: 'Needs a website'
        };
    }

    const https = normalized.startsWith('https://');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
        let res = await fetch(normalized, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'LocalPulseVisibilityAudit/1.0' }
        }).catch(() => null);

        // Some hosts reject HEAD — retry GET
        if (!res || res.status === 405 || res.status === 501) {
            res = await fetch(normalized, {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal,
                headers: { 'User-Agent': 'LocalPulseVisibilityAudit/1.0' }
            });
        }

        const finalUrl = res.url || normalized;
        const reachable = res.ok || (res.status >= 200 && res.status < 400);
        const finalHttps = finalUrl.startsWith('https://');

        return {
            provided: true,
            url: normalized,
            reachable,
            https: finalHttps || https,
            finalUrl,
            status: reachable && (finalHttps || https) ? 'pass' : reachable ? 'fail' : 'fail',
            note: !reachable
                ? 'Website did not respond'
                : !(finalHttps || https)
                  ? 'Website reachable but not on HTTPS'
                  : 'Website is live on HTTPS'
        };
    } catch (err: any) {
        return {
            provided: true,
            url: normalized,
            reachable: false,
            https,
            finalUrl: null,
            status: 'fail',
            note: err?.name === 'AbortError' ? 'Website check timed out' : 'Website did not respond'
        };
    } finally {
        clearTimeout(timer);
    }
}
