import { useEffect, useRef } from 'react';
import { apiPost } from './utils';

// One detection per page session, shared by every page that asks.
let running: Promise<boolean> | null = null;


export function useServiceDetection(pending: boolean | undefined, onUpdated: () => void) {
    const latest = useRef(onUpdated);
    latest.current = onUpdated;
    useEffect(() => {
        if (!pending) return;
        let cancelled = false;
        running =
            running ||
            apiPost('/api/business/detect-services', {})
                .then((d: any) => Boolean(d?.updated))
                .catch(() => false)
                .finally(() => {
                    running = null;
                });
        running.then((updated) => {
            if (updated && !cancelled) latest.current();
        });
        return () => {
            cancelled = true;
        };
    }, [pending]);
}
