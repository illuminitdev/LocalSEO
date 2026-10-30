import { dfsTask, dataForSeoConfigured } from './dataForSeoCitations';

/**
 * Only 3x3 for now (9 points = 9 DataForSEO calls = 9 credits). 5x5, 7x7 and 9x9 were removed to control cost;
 * to bring one back later, add it here and price the scan per point (size * size credits) in scan-start.
 */
export const GRID_SIZES = [3] as const;
export const GRID_HALF_SPAN_MILES = 3;
export const NOT_RANKED = 21;

// DataForSEO live Maps searches can take 30-60s when their queue is busy. Behind API Gateway (Lambda) the request is
// cut at ~29s, so stay under that there; locally there is no such limit, so wait long enough for the answer.
const MAPS_TIMEOUT_MS = Number(process.env.DFS_MAPS_TIMEOUT_MS) || (process.env.AWS_LAMBDA_FUNCTION_NAME ? 27000 : 120000);

export type GridBusiness = {
    name?: string;
    placeId?: string;
};

export function gridConfigured() {
    return dataForSeoConfigured();
}

export function normalizeGridSize(value: unknown) {
    const n = Number(value);
    return (GRID_SIZES as readonly number[]).includes(n) ? n : 3;
}

/** Coordinate of grid cell (row 0 = north, col 0 = west). Must match geoGridMarkers() on the client. */
export function gridPoint(centerLat: number, centerLng: number, size: number, row: number, col: number) {
    const step = (GRID_HALF_SPAN_MILES * 2) / (size - 1);
    const mid = (size - 1) / 2;
    const dLat = step / 69;
    const cos = Math.cos((centerLat * Math.PI) / 180);
    const dLng = step / (69 * (Math.abs(cos) < 0.01 ? 0.01 : cos));
    return {
        lat: centerLat - (row - mid) * dLat,
        lng: centerLng + (col - mid) * dLng
    };
}

function norm(value: unknown) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function isOwnListing(item: any, business: GridBusiness) {
    if (business.placeId && String(item?.place_id || '') === business.placeId) return true;
    const mine = norm(business.name);
    const theirs = norm(item?.title);
    if (!mine || !theirs) return false;
    return mine === theirs || (mine.length > 5 && (theirs.includes(mine) || mine.includes(theirs)));
}

/** One live Google Maps search at a coordinate; returns our rank (1-20, 21 = not found) and the top-3 names. */
export async function rankAtPoint(keyword: string, lat: number, lng: number, business: GridBusiness) {
    let result: any;
    try {
        result = await dfsTask(
            'serp/google/maps/live/advanced',
            {
                keyword,
                location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},15z`,
                language_code: 'en',
                device: 'mobile',
                depth: 20
            },
            MAPS_TIMEOUT_MS
        );
    } catch (err: any) {
        // "No Search Results" is a valid answer (nothing listed here for this keyword), not a failure.
        if (/no search results/i.test(String(err?.message || ''))) {
            return { rank: NOT_RANKED, top3: [] as string[], places: [] as Array<{ name: string; lat: number | null; lng: number | null; rating: number; reviews: number; rank: number; isYou: boolean }> };
        }
        throw err;
    }
    const items: any[] = (Array.isArray(result?.items) ? result.items : []).filter(
        (item: any) => item?.type === 'maps_search' || item?.type === 'maps_paid_item' || item?.title
    );
    let rank = NOT_RANKED;
    const top3: string[] = [];
    const places: Array<{ name: string; lat: number | null; lng: number | null; rating: number; reviews: number; rank: number; isYou: boolean }> = [];
    items.forEach((item, index) => {
        const position = Number(item?.rank_group) || index + 1;
        if (position <= 3 && item?.title) top3.push(String(item.title));
        const own = isOwnListing(item, business);
        if (rank === NOT_RANKED && position <= 20 && own) rank = position;
        if (item?.title && position <= 10) {
            const la = Number(item.latitude);
            const ln = Number(item.longitude);
            places.push({
                name: String(item.title).slice(0, 160),
                lat: Number.isFinite(la) ? la : null,
                lng: Number.isFinite(ln) ? ln : null,
                rating: Number(item?.rating?.value) || 0,
                reviews: Number(item?.rating?.votes_count) || 0,
                rank: position,
                isYou: own
            });
        }
    });
    return { rank, top3: top3.slice(0, 3), places };
}

/** A single grid cell (one live search) so every request stays far below the ~30s gateway limit. */
export async function rankGridCell({
    keyword,
    business,
    center,
    size,
    row,
    col
}: {
    keyword: string;
    business: GridBusiness;
    center: { lat: number; lng: number };
    size: number;
    row: number;
    col: number;
}) {
    const point = gridPoint(center.lat, center.lng, size, row, col);
    return rankAtPoint(keyword, point.lat, point.lng, business);
}

/** One row of the grid, with limited parallelism so a 9-wide row finishes well inside the API timeout. */
export async function rankGridRow({
    keyword,
    business,
    center,
    size,
    row
}: {
    keyword: string;
    business: GridBusiness;
    center: { lat: number; lng: number };
    size: number;
    row: number;
}) {
    const ranks: number[] = new Array(size).fill(NOT_RANKED);
    const tally: Record<string, number> = {};
    await Promise.all(
        ranks.map(async (_, col) => {
            const point = gridPoint(center.lat, center.lng, size, row, col);
            try {
                const { rank, top3 } = await rankAtPoint(keyword, point.lat, point.lng, business);
                ranks[col] = rank;
                for (const name of top3) tally[name] = (tally[name] || 0) + 1;
            } catch (err: any) {
                console.warn(`[rank-grid] point ${row},${col} failed:`, err?.message || err);
                ranks[col] = NOT_RANKED;
            }
        })
    );
    return { ranks, tally };
}

export function summarizeGrid(grid: number[][]) {
    const ranks = grid.flat().filter((n) => Number.isFinite(n));
    const avgRank = ranks.length ? Number((ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1)) : 0;
    const top3Percentage = ranks.length ? Math.round((ranks.filter((r) => r <= 3).length / ranks.length) * 100) : 0;
    return { avgRank, top3Percentage };
}

export function competitorShare(tally: Record<string, number>, business: GridBusiness, cellCount: number) {
    const total = Math.max(1, cellCount * 3);
    return Object.entries(tally)
        .map(([name, count]) => ({
            name,
            sharePct: Math.round((count / total) * 100),
            isYou: isOwnListing({ title: name }, business)
        }))
        .sort((a, b) => b.sharePct - a.sharePct)
        .slice(0, 6);
}

/** 0-100: pack position (50%), Local 3-Pack coverage (30%), profile completeness (20%). */
export function optimizationHealth(avgRank: number, top3Percentage: number, profileScore: number) {
    const rankScore = Math.max(0, Math.min(100, ((NOT_RANKED - avgRank) / (NOT_RANKED - 1)) * 100));
    return Math.round(rankScore * 0.5 + top3Percentage * 0.3 + Math.max(0, Math.min(100, profileScore)) * 0.2);
}
