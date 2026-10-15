
const cache = new Map<string, unknown>();

export function getPageCache<T>(key: string): T | undefined {
    return cache.get(key) as T | undefined;
}

export function setPageCache(key: string, value: unknown) {
    cache.set(key, value);
}

export function clearPageCache() {
    cache.clear();
}
