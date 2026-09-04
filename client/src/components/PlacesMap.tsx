import { useEffect, useRef, useState } from 'react';

const MAPS_JS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_JS_KEY as string | undefined)?.trim() || '';

let mapsScriptPromise: Promise<void> | null = null;

function loadMapsScript(apiKey: string): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    const g = (window as any).google;
    if (g?.maps?.Map) return Promise.resolve();
    if (mapsScriptPromise) return mapsScriptPromise;

    mapsScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-localpulse-maps]');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Maps script failed')));
            return;
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
        script.async = true;
        script.defer = true;
        script.dataset.localpulseMaps = '1';
        script.onload = () => resolve();
        script.onerror = () => {
            mapsScriptPromise = null;
            reject(new Error('Maps script failed to load'));
        };
        document.head.appendChild(script);
    });
    return mapsScriptPromise;
}

type PlacesMapProps = {
    lat: number | null | undefined;
    lng: number | null | undefined;
    title?: string;
    className?: string;
    height?: number;
};

/** Embedded Google Map — renders nothing unless VITE_GOOGLE_MAPS_JS_KEY is set and coords exist. */
export default function PlacesMap({ lat, lng, title, className = '', height = 180 }: PlacesMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);

    const hasCoords =
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng);

    useEffect(() => {
        if (!MAPS_JS_KEY || !hasCoords || !containerRef.current) return;
        let cancelled = false;
        setFailed(false);

        loadMapsScript(MAPS_JS_KEY)
            .then(() => {
                if (cancelled || !containerRef.current) return;
                const maps = (window as any).google?.maps;
                if (!maps?.Map) {
                    setFailed(true);
                    return;
                }
                const center = { lat: lat as number, lng: lng as number };
                const map = new maps.Map(containerRef.current, {
                    center,
                    zoom: 15,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                });
                new maps.Marker({ position: center, map, title: title || 'Location' });
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
        };
    }, [lat, lng, title, hasCoords]);

    if (!MAPS_JS_KEY || !hasCoords || failed) return null;

    return (
        <div
            ref={containerRef}
            className={`w-full rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#E2E8F0] ${className}`}
            style={{ height }}
            role="img"
            aria-label={title ? `Map of ${title}` : 'Location map'}
        />
    );
}

export function mapsJsConfigured() {
    return Boolean(MAPS_JS_KEY);
}
