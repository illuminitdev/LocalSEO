import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:5000' : '');

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Keep only digits, max 11 (UK mobile). Input stops accepting more once limit is reached. */
export function restrictPhoneInput(value: string, maxDigits = 11): string {
    return value.replace(/\D/g, '').slice(0, maxDigits);
}

async function readError(res: Response, path: string) {
    try {
        const data = await res.json();
        return data.error || `Request failed: ${path}`;
    } catch {
        return `Request failed: ${path}`;
    }
}

export async function apiGet(path: string, token?: string | null) {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw new Error(await readError(res, path));
    return res.json();
}

export async function apiPost(path: string, body: unknown = {}, token?: string | null) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await readError(res, path));
    return res.json();
}

export async function apiPut(path: string, body: unknown = {}, token?: string | null) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await readError(res, path));
    return res.json();
}

export async function apiPatch(path: string, body: unknown = {}, token?: string | null) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await readError(res, path));
    return res.json();
}
