import { useEffect, useRef, useState } from 'react';
import { darkenHex, readBrandPrimaryHex } from './orgBrand';


const DEV_DEMO_MAPS_JS_KEY = 'AIzaSyDKn-KGL7tIv0kJpDZOjAjeP_1rQ484CSY';

function resolveMapsJsKey() {
    const fromEnv =
        (import.meta.env.VITE_GOOGLE_MAPS_JS_KEY as string | undefined)?.trim() ||
        (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined)?.trim() ||
        '';
    if (fromEnv) return fromEnv;
    
    if (import.meta.env.DEV) return DEV_DEMO_MAPS_JS_KEY;
    const stage = String(import.meta.env.VITE_STAGE || '').toLowerCase();
    if (stage === 'dev' || stage === 'staging') return DEV_DEMO_MAPS_JS_KEY;
    return '';
}

const MAPS_JS_KEY = resolveMapsJsKey();

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

export type MapMarker = {
    lat: number;
    lng: number;
    label?: string;
    title?: string;
    highlight?: boolean;
    
    color?: string;
    /** Compact rounded-square badge (used for rank grid cells). */
    compact?: boolean;
    textColor?: string;
};

type PlacesMapProps = {
    lat?: number | null;
    lng?: number | null;
    title?: string;
    className?: string;
    height?: number;
    markers?: MapMarker[];
    zoom?: number;
    
    showPlaceholder?: boolean;
    placeholder?: string;
    /** When set, clicking the map reports the clicked coordinates (e.g. to pick a center). */
    onMapClick?: (lat: number, lng: number) => void;
};


export default function PlacesMap({
    lat,
    lng,
    title,
    className = '',
    height = 180,
    markers,
    zoom,
    showPlaceholder = false,
    placeholder = 'Map unavailable right now.',
    onMapClick
}: PlacesMapProps) {
    const clickRef = useRef(onMapClick);
    clickRef.current = onMapClick;
    const containerRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);

    const pointList: MapMarker[] =
        markers && markers.length
            ? markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
            : typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
              ? [{ lat, lng, title: title || 'Location', highlight: true }]
              : [];

    const hasPoints = pointList.length > 0;
    const canRender = Boolean(MAPS_JS_KEY) && hasPoints && !failed;

    useEffect(() => {
        if (!MAPS_JS_KEY || !hasPoints || !containerRef.current) return;
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
                const center = { lat: pointList[0].lat, lng: pointList[0].lng };
                const map = new maps.Map(containerRef.current, {
                    center,
                    zoom: zoom ?? (pointList.length > 1 ? 13 : 15),
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                    zoomControl: true,
                    styles: [
                        {
                            featureType: 'poi',
                            elementType: 'labels',
                            stylers: [{ visibility: 'on' }]
                        }
                    ]
                });

                map.addListener('click', (e: any) => {
                    const cb = clickRef.current;
                    if (cb && e?.latLng) cb(e.latLng.lat(), e.latLng.lng());
                });

                const bounds = new maps.LatLngBounds();
                pointList.forEach((m, idx) => {
                    const pos = { lat: m.lat, lng: m.lng };
                    bounds.extend(pos);
                    const brand = readBrandPrimaryHex();
                    const fill = m.color || (m.highlight ? brand : darkenHex(brand));
                    const labelText = m.label !== undefined ? String(m.label) : String(idx + 1);

                    const textColor = m.textColor || '#ffffff';
                    const compactPin = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
  <rect x="1.5" y="1.5" width="27" height="27" rx="7" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
  <text x="15" y="20" font-size="12" font-weight="800" font-family="system-ui, -apple-system, sans-serif" fill="${textColor}" text-anchor="middle">${labelText}</text>
</svg>
                    `.trim());
                    const svgPin = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <path d="M17 0C7.61 0 0 7.61 0 17c0 12.8 17 27 17 27s17-14.2 17-27C34 7.61 26.39 0 17 0z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
  <text x="17" y="22" font-size="14" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#ffffff" text-anchor="middle">${labelText}</text>
</svg>
                    `.trim());

                    new maps.Marker({
                        position: pos,
                        map,
                        title: m.title || `Stop ${labelText}`,
                        icon: m.compact
                            ? {
                                  url: `data:image/svg+xml;charset=UTF-8,${compactPin}`,
                                  scaledSize: new maps.Size(30, 30),
                                  anchor: new maps.Point(15, 15)
                              }
                            : {
                                  url: `data:image/svg+xml;charset=UTF-8,${svgPin}`,
                                  scaledSize: new maps.Size(34, 44),
                                  anchor: new maps.Point(17, 44)
                              }
                    });
                });
                if (pointList.length > 1) {
                    map.fitBounds(bounds, 50);
                }
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
        };
    }, [hasPoints, JSON.stringify(pointList), zoom, title]);

    if (!canRender) {
        if (!showPlaceholder) return null;
        return (
            <div
                className={`w-full rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] flex items-center justify-center text-sm text-gray-500 px-4 text-center ${className}`}
                style={{ height }}
            >
                {placeholder}
            </div>
        );
    }

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

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    if (!MAPS_JS_KEY) return null;
    try {
        await loadMapsScript(MAPS_JS_KEY);
        const maps = (window as any).google?.maps;
        if (!maps?.Geocoder) return null;
        return await new Promise<string | null>((resolve) => {
            new maps.Geocoder().geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                resolve(status === 'OK' && results?.[0]?.formatted_address ? String(results[0].formatted_address) : null);
            });
        });
    } catch {
        return null;
    }
}

export function mapsJsConfigured() {
    return Boolean(MAPS_JS_KEY);
}


export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const query = String(address || '').trim();
    if (!MAPS_JS_KEY || !query) return null;
    try {
        await loadMapsScript(MAPS_JS_KEY);
        const maps = (window as any).google?.maps;
        if (!maps?.Geocoder) return null;
        const geocoder = new maps.Geocoder();
        const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
            geocoder.geocode({ address: query }, (results: any[], status: string) => {
                if (status !== 'OK' || !results?.[0]?.geometry?.location) {
                    resolve(null);
                    return;
                }
                const loc = results[0].geometry.location;
                resolve({ lat: loc.lat(), lng: loc.lng() });
            });
        });
        return result;
    } catch {
        return null;
    }
}


export function geoGridMarkers(
    centerLat: number,
    centerLng: number,
    grid: number[][],
    halfSpanMiles = 4
): MapMarker[] {
    const size = Array.isArray(grid) ? grid.length : 0;
    if (size < 2) return [];
    const step = (halfSpanMiles * 2) / (size - 1);
    const mid = (size - 1) / 2;
    const dLat = step / 69;
    const cos = Math.cos((centerLat * Math.PI) / 180);
    const dLng = step / (69 * (Math.abs(cos) < 0.01 ? 0.01 : cos));

    const markers: MapMarker[] = [];
    for (let r = 0; r < size; r++) {
        const row = grid[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
            const rank = Number(row[c]);
            if (!Number.isFinite(rank)) continue;
            const rounded = Math.round(rank);
            markers.push({
                lat: centerLat - (r - mid) * dLat,
                lng: centerLng + (c - mid) * dLng,
                label: rounded >= 21 ? '20+' : String(rounded),
                title: rounded >= 21 ? 'Not in top 20' : `Local Pack rank ${rounded}`,
                compact: true,
                color: rounded <= 3 ? '#9A3A0A' : rounded <= 10 ? '#FDBA9B' : '#E2E8F0',
                textColor: rounded <= 3 ? '#ffffff' : rounded <= 10 ? '#7C2D12' : '#64748B'
            });
        }
    }
    return markers;
}
