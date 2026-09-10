/**
 * Server-side proxy to ZappSites Full Audit / ops audit APIs.
 * Keeps AUDIT_OPS_SECRET off the browser.
 */

const PROD_API = 'https://dvj0p5k5d0.execute-api.us-east-1.amazonaws.com';

export function zappSitesApiBase(): string {
    const fromEnv = String(process.env.ZAPP_SITES_API_BASE || '').trim().replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    // Phase 1: deep audits + worker live on ZappSites prod API
    return PROD_API;
}

export function zappSitesOrigin(): string {
    const fromEnv = String(process.env.ZAPP_SITES_ORIGIN || '').trim().replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    return 'https://www.zappsites.com';
}

export function auditOpsSecret(): string {
    return String(process.env.AUDIT_OPS_SECRET || '').trim();
}

export function reportShareUrl(auditId: string): string {
    return `${zappSitesOrigin()}/audit-report/${auditId}`;
}

export function reportPdfUrl(auditId: string): string {
    return `${zappSitesApiBase()}/api/audits/${auditId}/pdf`;
}

type ProxyResult = {
    status: number;
    json?: unknown;
    buffer?: Buffer;
    contentType?: string;
    contentDisposition?: string;
};

export async function proxyZappSitesOps(
    method: string,
    pathWithQuery: string,
    body?: unknown
): Promise<ProxyResult> {
    const secret = auditOpsSecret();
    if (!secret) {
        return {
            status: 503,
            json: { success: false, error: 'AUDIT_OPS_SECRET is not configured on Local SEO API.' }
        };
    }

    const url = `${zappSitesApiBase()}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`;
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'x-ops-secret': secret
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('text/')) {
        const json = await res.json().catch(() => ({
            success: false,
            error: `Upstream returned ${res.status}`
        }));
        return { status: res.status, json, contentType };
    }

    const ab = await res.arrayBuffer();
    return {
        status: res.status,
        buffer: Buffer.from(ab),
        contentType: contentType || 'application/octet-stream',
        contentDisposition: res.headers.get('content-disposition') || undefined
    };
}

/** Public PDF endpoint (no ops secret) — for published reports. */
export async function proxyZappSitesPdf(auditId: string): Promise<ProxyResult> {
    const url = reportPdfUrl(auditId);
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/pdf' } });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/pdf')) {
        const json = await res.json().catch(() => ({
            success: false,
            error: `PDF unavailable (${res.status})`
        }));
        return { status: res.status || 502, json };
    }
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (!buffer.length || buffer.slice(0, 5).toString() !== '%PDF-') {
        return {
            status: 502,
            json: { success: false, error: 'PDF generation produced an invalid file. Please retry.' }
        };
    }
    return {
        status: 200,
        buffer,
        contentType: 'application/pdf',
        contentDisposition:
            res.headers.get('content-disposition') ||
            `attachment; filename="zappsites-audit-${auditId}.pdf"`
    };
}
