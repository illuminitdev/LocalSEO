import { adminAuthHeaders } from './adminAuth';

import { API_BASE } from './apiConfig';

export { API_BASE };

async function readAdminError(res: Response, path: string): Promise<Error> {
    try {
        const data = await res.json();
        return new Error(data.error || `Request failed: ${path}`);
    } catch {
        return new Error(`Request failed: ${path}`);
    }
}

export async function adminGet(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { ...adminAuthHeaders() } });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}

export async function adminPost(path: string, body: unknown = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}

export async function adminPatch(path: string, body: unknown = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}
