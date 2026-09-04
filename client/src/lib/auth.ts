const TOKEN_KEY = 'localpulse_token';
const MUST_CHANGE_KEY = 'localpulse_must_change_password';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(MUST_CHANGE_KEY);
}

export function setMustChangePassword(value: boolean) {
    if (value) localStorage.setItem(MUST_CHANGE_KEY, '1');
    else localStorage.removeItem(MUST_CHANGE_KEY);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('localpulse-auth'));
    }
}

export function getMustChangePassword(): boolean {
    return localStorage.getItem(MUST_CHANGE_KEY) === '1';
}

export function authHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
