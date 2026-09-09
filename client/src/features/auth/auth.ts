const TOKEN_KEY = 'localpulse_token';
const MUST_CHANGE_KEY = 'localpulse_must_change_password';
const PLATFORM_ROLE_KEY = 'localpulse_platform_role';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(MUST_CHANGE_KEY);
    localStorage.removeItem(PLATFORM_ROLE_KEY);
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

export function setPlatformRole(role: string | null | undefined) {
    if (role) localStorage.setItem(PLATFORM_ROLE_KEY, role);
    else localStorage.removeItem(PLATFORM_ROLE_KEY);
}

export function getPlatformRole(): string | null {
    return localStorage.getItem(PLATFORM_ROLE_KEY);
}

export function isSalesAgent(): boolean {
    return getPlatformRole() === 'sales_agent';
}

export function authHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
