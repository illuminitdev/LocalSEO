import { query } from './db';

export const HISTORY_MONTHS = 12;
export const GRID_DETAIL_DAYS = 90;
const MAX_POINTS = 120;

export type RankPoint = { date: string; rank: number };

export type KeywordHistory = { history: RankPoint[]; top: string[]; checkedAt?: string };

export async function recordRankCheck(
    orgId: string,
    locationId: string,
    keyword: string,
    rank: number,
    top3: string[],
    source: 'manual' | 'auto' = 'manual',
    at = new Date()
) {
    await query(
        `INSERT INTO rank_checks (org_id, location_id, keyword, rank, top3, source, checked_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [orgId, locationId, keyword, rank, JSON.stringify(top3.slice(0, 3)), source, at]
    );
}

/** Latest check time per keyword at a location (used for cooldowns and the automatic schedule). */
export async function lastCheckTimes(orgId: string, locationId: string, keywords: string[]) {
    const out = new Map<string, string>();
    if (!keywords.length) return out;
    const { rows } = await query(
        `SELECT keyword, MAX(checked_at) AS at FROM rank_checks
         WHERE org_id = $1 AND location_id = $2 AND keyword = ANY($3::text[])
         GROUP BY keyword`,
        [orgId, locationId, keywords]
    );
    for (const r of rows) out.set(String(r.keyword), new Date(r.at).toISOString());
    return out;
}

/** Rank history per keyword at a location, oldest first, last 120 points. */
export async function historyFor(orgId: string, locationId: string, keywords: string[]) {
    const out = new Map<string, KeywordHistory>();
    if (!keywords.length) return out;
    const { rows } = await query(
        `SELECT keyword, rank, top3, checked_at FROM rank_checks
         WHERE org_id = $1 AND location_id = $2 AND keyword = ANY($3::text[])
           AND checked_at >= NOW() - ($4 || ' months')::interval
         ORDER BY checked_at ASC`,
        [orgId, locationId, keywords, String(HISTORY_MONTHS)]
    );
    for (const r of rows) {
        const key = String(r.keyword);
        const entry = out.get(key) || { history: [], top: [] };
        const at = new Date(r.checked_at).toISOString();
        entry.history.push({ date: at, rank: Number(r.rank) });
        entry.top = Array.isArray(r.top3) ? r.top3.map(String) : [];
        entry.checkedAt = at;
        out.set(key, entry);
    }
    for (const entry of out.values()) entry.history = entry.history.slice(-MAX_POINTS);
    return out;
}

// ── Local Search Grid scans ─────────────────────────────────────────────────

export type GridScanInput = {
    keyword: string;
    gridSize: number;
    grid: number[][] | null;
    avgRank: number;
    top3Percentage: number;
    health: number;
    competitorShare: any[];
    competitors: any[];
    center: { lat: number; lng: number } | null;
    at?: Date;
};

export async function recordGridScan(orgId: string, locationId: string, scan: GridScanInput) {
    await query(
        `INSERT INTO grid_scans
            (org_id, location_id, keyword, grid_size, grid, avg_rank, top3_pct, health, competitor_share, competitors, center, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12)`,
        [
            orgId,
            locationId,
            scan.keyword,
            scan.gridSize,
            scan.grid ? JSON.stringify(scan.grid) : null,
            scan.avgRank,
            scan.top3Percentage,
            scan.health,
            JSON.stringify(scan.competitorShare || []),
            JSON.stringify(scan.competitors || []),
            scan.center ? JSON.stringify(scan.center) : null,
            scan.at || new Date()
        ]
    );
}

/**
 * Reserves this keyword+address for the billing period before any DataForSEO call is made.
 * 'taken' means it was already scanned (or is being scanned) this period, so nothing new may run.
 */
export async function claimGridSlot(orgId: string, locationId: string, keyword: string, periodStart: string, scanId: string) {
    const { rows } = await query(
        `INSERT INTO grid_scan_slots (org_id, location_id, keyword, period_start, scan_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING scan_id`,
        [orgId, locationId, keyword, periodStart, scanId]
    );
    return rows.length ? ('claimed' as const) : ('taken' as const);
}

/**
 * Takes over a slot whose scan was abandoned (started, never finished, so no saved result) more than
 * `minutes` ago. Point requests are only accepted for 20 minutes after a start, so the old scan cannot still run.
 */
export async function reclaimStaleGridSlot(orgId: string, locationId: string, keyword: string, periodStart: string, scanId: string, minutes = 30) {
    const { rows } = await query(
        `UPDATE grid_scan_slots SET scan_id = $5, created_at = NOW()
         WHERE org_id = $1 AND location_id = $2 AND keyword = $3 AND period_start = $4
           AND created_at < NOW() - ($6 || ' minutes')::interval
         RETURNING scan_id`,
        [orgId, locationId, keyword, periodStart, scanId, String(minutes)]
    );
    return rows.length > 0;
}

/** Grid scans started by this business in the billing period (all addresses). */
export async function gridSlotsUsed(orgId: string, periodStart: string) {
    const { rows } = await query(
        `SELECT COUNT(*)::int AS n FROM grid_scan_slots WHERE org_id = $1 AND period_start = $2`,
        [orgId, periodStart]
    );
    return Number(rows[0]?.n) || 0;
}

/** Frees a slot whose scan never ran or failed completely (it was refunded), so it can be tried again. */
export async function releaseGridSlot(orgId: string, scanId: string) {
    await query(`DELETE FROM grid_scan_slots WHERE org_id = $1 AND scan_id = $2`, [orgId, scanId]);
}

/** Every keyword this business has scanned in the grid (any address), newest first. */
export async function scannedKeywords(orgId: string): Promise<string[]> {
    const { rows } = await query(
        `SELECT keyword, MAX(created_at) AS at FROM grid_scans WHERE org_id = $1 GROUP BY keyword ORDER BY at DESC`,
        [orgId]
    );
    return rows.map((r: any) => String(r.keyword));
}

export async function lastScanAt(orgId: string, locationId: string, keyword: string) {
    const { rows } = await query(
        `SELECT MAX(created_at) AS at FROM grid_scans WHERE org_id = $1 AND location_id = $2 AND keyword = $3`,
        [orgId, locationId, keyword]
    );
    return rows[0]?.at ? new Date(rows[0].at).toISOString() : null;
}

/** The newest scan for each keyword at a location, as the page shows them (same shape as before). */
export async function latestRuns(orgId: string, locationId: string, limit = 12) {
    const { rows } = await query(
        `SELECT * FROM (
             SELECT DISTINCT ON (keyword) *
             FROM grid_scans
             WHERE org_id = $1 AND location_id = $2
             ORDER BY keyword, created_at DESC
         ) latest
         ORDER BY created_at DESC
         LIMIT $3`,
        [orgId, locationId, limit]
    );
    return rows.map((r: any) => ({
        keyword: String(r.keyword),
        gapAnalysis: '',
        grid: Array.isArray(r.grid) ? (r.grid as number[][]) : null,
        gridSize: Number(r.grid_size),
        competitors: Array.isArray(r.competitors) ? r.competitors : [],
        competitorShare: Array.isArray(r.competitor_share) ? r.competitor_share : [],
        center: r.center || null,
        avgRank: Number(r.avg_rank),
        top3Percentage: Number(r.top3_pct),
        updatedAt: new Date(r.created_at).toISOString()
    }));
}

/** One entry per scanned keyword with its last 10 points (the "tracked keywords" table on the Rank Tracker). */
export async function trackedFromScans(orgId: string, locationId: string, limit = 12) {
    const { rows } = await query(
        `SELECT keyword, avg_rank, top3_pct, health, created_at FROM (
             SELECT keyword, avg_rank, top3_pct, health, created_at,
                    ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY created_at DESC) AS rn
             FROM grid_scans WHERE org_id = $1 AND location_id = $2
         ) s
         WHERE rn <= 10
         ORDER BY keyword, created_at ASC`,
        [orgId, locationId]
    );
    const byKeyword = new Map<string, any[]>();
    for (const r of rows) {
        const list = byKeyword.get(String(r.keyword)) || [];
        list.push(r);
        byKeyword.set(String(r.keyword), list);
    }
    const entries = [...byKeyword.entries()].map(([keyword, list]) => {
        const last = list[list.length - 1];
        const before = list.length > 1 ? list[list.length - 2] : null;
        return {
            keyword,
            avgRank: Number(last.avg_rank),
            top3Percentage: Number(last.top3_pct),
            updatedAt: new Date(last.created_at).toISOString(),
            previousAvgRank: before && Number(before.avg_rank) > 0 ? Number(before.avg_rank) : null,
            health: Number(last.health),
            history: list.map((p) => ({
                avgRank: Number(p.avg_rank),
                top3Percentage: Number(p.top3_pct),
                updatedAt: new Date(p.created_at).toISOString()
            }))
        };
    });
    return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

// ── One-time import of history that used to live in the dashboard JSON ───────

/** Copies old blob history into the tables under the primary location. Safe to call more than once. */
export async function backfillFromDashboard(orgId: string, locationId: string, dashboard: any) {
    const { rows } = await query(
        `SELECT (SELECT COUNT(*) FROM rank_checks WHERE org_id = $1)::int AS checks,
                (SELECT COUNT(*) FROM grid_scans WHERE org_id = $1)::int AS scans`,
        [orgId]
    );
    const hasChecks = Number(rows[0]?.checks) > 0;
    const hasScans = Number(rows[0]?.scans) > 0;
    let imported = 0;

    if (!hasChecks) {
        const keywords: any[] = Array.isArray(dashboard?.visibilityTracker?.keywords) ? dashboard.visibilityTracker.keywords : [];
        for (const k of keywords) {
            const history: any[] = Array.isArray(k?.history) ? k.history : [];
            for (let i = 0; i < history.length; i++) {
                const p = history[i];
                const at = new Date(p?.date);
                const rank = Math.round(Number(p?.rank));
                if (Number.isNaN(at.getTime()) || !Number.isFinite(rank)) continue;
                const top = i === history.length - 1 && Array.isArray(k.top) ? k.top.map(String) : [];
                await recordRankCheck(orgId, locationId, String(k.keyword), rank, top, 'manual', at);
                imported += 1;
            }
        }
    }

    if (!hasScans) {
        const runs: any[] = Array.isArray(dashboard?.gapAnalyses) ? dashboard.gapAnalyses : [];
        const tracked: any[] = Array.isArray(dashboard?.trackedKeywords) ? dashboard.trackedKeywords : [];
        for (const run of runs) {
            const keyword = String(run?.keyword || '');
            const t = tracked.find((x) => String(x?.keyword || '').toLowerCase() === keyword.toLowerCase());
            const runAt = new Date(run?.updatedAt || Date.now());
            // Older points (summary only, no grid)
            for (const p of Array.isArray(t?.history) ? t.history : []) {
                const at = new Date(p?.updatedAt);
                if (Number.isNaN(at.getTime()) || at.getTime() >= runAt.getTime()) continue;
                await recordGridScan(orgId, locationId, {
                    keyword,
                    gridSize: Number(run?.gridSize) || 3,
                    grid: null,
                    avgRank: Number(p?.avgRank) || 0,
                    top3Percentage: Number(p?.top3Percentage) || 0,
                    health: 0,
                    competitorShare: [],
                    competitors: [],
                    center: null,
                    at
                });
                imported += 1;
            }
            await recordGridScan(orgId, locationId, {
                keyword,
                gridSize: Number(run?.gridSize) || 3,
                grid: Array.isArray(run?.grid) ? run.grid : null,
                avgRank: Number(run?.avgRank) || 0,
                top3Percentage: Number(run?.top3Percentage) || 0,
                health: Number(t?.health) || 0,
                competitorShare: Array.isArray(run?.competitorShare) ? run.competitorShare : [],
                competitors: Array.isArray(run?.competitors) ? run.competitors : [],
                center: run?.center || null,
                at: runAt
            });
            imported += 1;
        }
    }
    return imported;
}

// ── Retention ───────────────────────────────────────────────────────────────

/** Full grid detail is kept 90 days, summaries and rank history 12 months, the usage ledger 18 months. */
export async function purgeOldHistory() {
    const grids = await query(
        `UPDATE grid_scans SET grid = NULL
         WHERE grid IS NOT NULL AND created_at < NOW() - ($1 || ' days')::interval`,
        [String(GRID_DETAIL_DAYS)]
    );
    const scans = await query(`DELETE FROM grid_scans WHERE created_at < NOW() - ($1 || ' months')::interval`, [String(HISTORY_MONTHS)]);
    const checks = await query(`DELETE FROM rank_checks WHERE checked_at < NOW() - ($1 || ' months')::interval`, [String(HISTORY_MONTHS)]);
    const ledger = await query(`DELETE FROM usage_ledger WHERE created_at < NOW() - INTERVAL '18 months'`);
    return {
        gridDetailCleared: grids.rowCount || 0,
        scansDeleted: scans.rowCount || 0,
        checksDeleted: checks.rowCount || 0,
        ledgerDeleted: ledger.rowCount || 0
    };
}
