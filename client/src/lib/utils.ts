import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { authHeaders, getToken } from './auth';
import { bookingOrgHeaders } from './bookingHost';

import { API_BASE } from './apiConfig';

export { API_BASE };

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Keep only digits, max 11 (UK mobile). Input stops accepting more once limit is reached. */
export function restrictPhoneInput(value: string, maxDigits = 11): string {
    return value.replace(/\D/g, '').slice(0, maxDigits);
}

async function readError(res: Response, path: string): Promise<Error> {
    try {
        const data = await res.json();
        if (data.error === 'upgrade_required') {
            const err = new Error('Upgrade required') as Error & { code?: string; feature?: string; requiredPlanHint?: unknown };
            err.code = 'upgrade_required';
            err.feature = data.feature;
            err.requiredPlanHint = data.requiredPlanHint;
            return err;
        }
        return new Error(data.error || `Request failed: ${path}`);
    } catch {
        return new Error(`Request failed: ${path}`);
    }
}

function apiHeaders(token?: string | null) {
    return { ...authHeaders(), ...bookingOrgHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function apiGet(path: string, token?: string | null) {
    const headers = apiHeaders(token);
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw await readError(res, path);
    return res.json();
}

export async function apiPost(path: string, body: unknown = {}, token?: string | null) {
    const headers = { 'Content-Type': 'application/json', ...apiHeaders(token) };
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readError(res, path);
    return res.json();
}

export async function apiPut(path: string, body: unknown = {}, token?: string | null) {
    const headers = { 'Content-Type': 'application/json', ...apiHeaders(token) };
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readError(res, path);
    return res.json();
}

export async function apiPatch(path: string, body: unknown = {}, token?: string | null) {
    const headers = { 'Content-Type': 'application/json', ...apiHeaders(token) };
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readError(res, path);
    return res.json();
}

export async function apiDelete(path: string, token?: string | null) {
    const headers = apiHeaders(token);
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers });
    if (!res.ok) throw await readError(res, path);
    return res.json();
}

export function formatCents(cents: number, currency = 'GBP') {
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
}

export { getToken };
