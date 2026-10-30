import { useCallback, useEffect, useRef, useState } from 'react';

/** One bell item as returned by /api/{admin,sales}/notifications and /api/notifications. */
export interface FeedNotification {
    id: string;
    type: string;
    title: string;
    body: string;
    time: string;
    link: string;
    read: boolean;
}

type NotificationAction =
    | { type: 'clear_all'; ids: string[] }
    | { type: 'read'; ids: string[] }
    | { type: 'read_all'; ids: string[] };

interface Options {
    /** Fetch the feed JSON ({ notifications }). */
    fetchFeed: () => Promise<any>;
    /** Persist a cleared/read action on the server. */
    postState: (action: NotificationAction) => Promise<unknown>;
    /** Extra value that triggers a refresh when it changes (e.g. route path). */
    refreshKey?: unknown;
    pollMs?: number;
    enabled?: boolean;
}

export function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (!Number.isFinite(diff) || diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function normalize(list: unknown): FeedNotification[] {
    if (!Array.isArray(list)) return [];
    return list.map((n: any) => ({
        id: String(n.id),
        type: String(n.type || 'system'),
        title: String(n.title || 'Update'),
        body: String(n.body || ''),
        time: String(n.time || new Date().toISOString()),
        link: String(n.link || ''),
        read: Boolean(n.read)
    }));
}

/**
 * Live notification bell state backed by the server (cleared/read survives reloads and devices).
 * Polls, refreshes on focus, and applies actions optimistically.
 */
export function useNotificationFeed({ fetchFeed, postState, refreshKey, pollMs = 30000, enabled = true }: Options) {
    const [items, setItems] = useState<FeedNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Bumped on every local action so responses fetched before it can't resurrect cleared items.
    const actionVersion = useRef(0);
    // Saves still in flight; feed responses are ignored until the server has the latest action.
    const pendingSaves = useRef(0);
    const fetchRef = useRef(fetchFeed);
    const postRef = useRef(postState);
    fetchRef.current = fetchFeed;
    postRef.current = postState;

    const refresh = useCallback(async () => {
        if (!enabled) return;
        const versionAtStart = actionVersion.current;
        setLoading(true);
        try {
            const data = await fetchRef.current();
            if (versionAtStart !== actionVersion.current || pendingSaves.current > 0) return;
            setItems(normalize(data?.notifications));
            setLoaded(true);
        } catch {
            /* keep prior list */
        } finally {
            setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        refresh();
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, pollMs);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refresh, pollMs, enabled, refreshKey]);

    const send = useCallback(
        (action: NotificationAction) => {
            actionVersion.current += 1;
            pendingSaves.current += 1;
            postRef
                .current(action)
                .catch(() => {
                    /* server state wins on next refresh */
                })
                .finally(() => {
                    pendingSaves.current -= 1;
                    if (pendingSaves.current === 0) refresh();
                });
        },
        [refresh]
    );

    const markRead = useCallback(
        (id: string) => {
            setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
            send({ type: 'read', ids: [id] });
        },
        [send]
    );

    const markAllRead = useCallback(() => {
        const ids = items.map((n) => n.id);
        if (!ids.length) return;
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        send({ type: 'read_all', ids });
    }, [items, send]);

    const clearAll = useCallback(() => {
        const ids = items.map((n) => n.id);
        setItems([]);
        send({ type: 'clear_all', ids });
    }, [items, send]);

    const unreadCount = items.filter((n) => !n.read).length;

    return { items, unreadCount, loading, loaded, refresh, markRead, markAllRead, clearAll };
}
