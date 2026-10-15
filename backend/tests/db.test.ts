import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Real SQL against an in-memory Postgres (PGlite): the migration and every query in the new libs.
const { pg } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PGlite } = require('@electric-sql/pglite');
    return { pg: new PGlite() };
});

vi.mock('../lib/db', () => ({
    query: async (text: string, params?: any[]) => {
        const r = await pg.query(text, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    }
}));

import { InsufficientCredits, getBreakdown, getUsage, hasRecentCharge, refund, refundOnce, registerCall, spend } from '../lib/credits';
import { LocationLimitError, addLocation, ensurePrimaryLocation, getLocation, listLocations, primaryLocation, removeLocation } from '../lib/locations';
import {
    backfillFromDashboard,
    historyFor,
    lastCheckTimes,
    lastScanAt,
    latestRuns,
    purgeOldHistory,
    recordGridScan,
    recordRankCheck,
    trackedFromScans
} from '../lib/rankHistory';

const migration = readFileSync(path.join(__dirname, '..', 'migrations', '036_usage_credits.sql'), 'utf8');
let orgId = '';
let otherOrgId = '';

// Billing periods are built around "now" so the tests do not depend on the date they run.
const DAY = 86_400_000;
const periodStart = new Date(Date.now() - 5 * DAY).toISOString();
const periodEnd = new Date(Date.now() + 25 * DAY).toISOString();
const nextPeriodStart = new Date(Date.now() - 1 * DAY).toISOString();
const nextPeriodEnd = new Date(Date.now() + 29 * DAY).toISOString();

const growthReq = (id = orgId, start = periodStart, end = periodEnd) => ({
    orgId: id,
    entitlements: { planId: 'local-growth', currentPeriodStart: start, currentPeriodEnd: end }
});

beforeAll(async () => {
    await pg.exec('CREATE TABLE organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT)');
    await pg.exec(migration);
    orgId = (await pg.query("INSERT INTO organizations (name) VALUES ('A') RETURNING id")).rows[0].id;
    otherOrgId = (await pg.query("INSERT INTO organizations (name) VALUES ('B') RETURNING id")).rows[0].id;
});

describe('migration 036', () => {
    it('can run twice (idempotent)', async () => {
        await expect(pg.exec(migration)).resolves.toBeDefined();
    });
});

describe('credits (real SQL)', () => {
    it('creates the pool from the plan and the billing period', async () => {
        const usage = await getUsage(growthReq());
        expect(usage).toMatchObject({ allowance: 1000, used: 0, remaining: 1000, unlimited: false });
        expect(usage.periodEnd).toBe(periodEnd);
    });

    it('spends, refunds and reports the breakdown', async () => {
        const req = growthReq();
        await spend(req, 'rankScan', 9, 'scan-1');
        await spend(req, 'trackerKeyword', 3, 'tracker-1');
        expect((await getUsage(req)).used).toBe(12);
        await refund(req, 'trackerKeyword', 1, 'tracker-1', 'one failed');
        expect((await getUsage(req)).used).toBe(11);
        const breakdown = await getBreakdown(orgId, (await getUsage(req)).periodStart);
        expect(breakdown).toEqual(expect.arrayContaining([{ feature: 'rankScan', credits: 9 }, { feature: 'trackerKeyword', credits: 2 }]));
    });

    it('refuses to spend more than is left, with the remaining count', async () => {
        const req = growthReq();
        const before = (await getUsage(req)).remaining;
        await expect(spend(req, 'rankScan', before + 1, 'too-big')).rejects.toBeInstanceOf(InsufficientCredits);
        await expect(spend(req, 'rankScan', before + 1, 'too-big')).rejects.toMatchObject({ code: 'insufficient_credits', remaining: before });
        expect((await getUsage(req)).remaining).toBe(before);
    });

    it('never spends more than the allowance when requests run at the same time', async () => {
        const id = (await pg.query("INSERT INTO organizations (name) VALUES ('Race') RETURNING id")).rows[0].id;
        const req = growthReq(id);
        const results = await Promise.allSettled([1, 2, 3, 4].map((n) => spend(req, 'rankScan', 400, `race-${n}`)));
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2); // 2 x 400 fits in 1000, a third does not
        expect((await getUsage(req)).used).toBe(800);
    });

    it('resets the pool when the billing period changes', async () => {
        expect((await getUsage(growthReq())).used).toBeGreaterThan(0);
        const renewed = growthReq(orgId, nextPeriodStart, nextPeriodEnd);
        expect(await getUsage(renewed)).toMatchObject({ used: 0, remaining: 1000 });
    });

    it('keeps used credits when only the plan changes inside the same period', async () => {
        const id = (await pg.query("INSERT INTO organizations (name) VALUES ('Upgrade') RETURNING id")).rows[0].id;
        const before = growthReq(id);
        await spend(before, 'rankScan', 9, 'x');
        const after = { orgId: id, entitlements: { ...before.entitlements, planId: 'complete-growth-system' } };
        expect(await getUsage(after)).toMatchObject({ allowance: 2000, used: 9 });
    });

    it('gives booking-only plans no credits', async () => {
        const id = (await pg.query("INSERT INTO organizations (name) VALUES ('Booking') RETURNING id")).rows[0].id;
        const req = { orgId: id, entitlements: { planId: 'booking-pro' } };
        await expect(spend(req, 'rankScan', 1, 'x')).rejects.toBeInstanceOf(InsufficientCredits);
    });

    it('caps the calls made under one paid run, and recognises the payment', async () => {
        const req = growthReq();
        await spend(req, 'rankScan', 9, 'scan-cap');
        expect(await hasRecentCharge(orgId, 'rankScan', 'scan-cap')).toBe(true);
        expect(await hasRecentCharge(orgId, 'rankScan', 'never-paid')).toBe(false);
        expect(await hasRecentCharge(otherOrgId, 'rankScan', 'scan-cap')).toBe(false); // another org cannot reuse it
        const outcomes = [];
        for (let i = 0; i < 4; i++) outcomes.push(await registerCall(orgId, 'rankScan', 'scan-cap', 3));
        expect(outcomes).toEqual([true, true, true, false]);
    });

    it('refunds once per run', async () => {
        const req = growthReq();
        await spend(req, 'rankScan', 9, 'scan-refund');
        const used = (await getUsage(req)).used;
        await refundOnce(req, 'rankScan', 3, 'scan-refund');
        await refundOnce(req, 'rankScan', 3, 'scan-refund');
        expect((await getUsage(req)).used).toBe(used - 3);
    });
});

describe('locations (real SQL)', () => {
    const business = { name: 'Smile Clinic', address: '1 High St, Leeds LS1 1AA', lat: 53.8, lng: -1.55, placeId: 'p1' };

    it('creates the business address as the primary location once', async () => {
        const a = await ensurePrimaryLocation(orgId, business);
        const b = await ensurePrimaryLocation(orgId, business);
        expect(a.id).toBe(b.id);
        expect(a.isPrimary).toBe(true);
        expect(await listLocations(orgId)).toHaveLength(1);
    });

    it('follows the business when its address changes', async () => {
        const moved = await ensurePrimaryLocation(orgId, { ...business, address: '5 Park Row, Leeds LS1 5HD', lat: 53.801, lng: -1.549 });
        expect(moved.address).toContain('Park Row');
        expect(await listLocations(orgId)).toHaveLength(1);
    });

    it('stops adding at the plan limit', async () => {
        await addLocation(orgId, { label: 'Branch 1', address: 'a', lat: 53.9, lng: -1.5 }, 3);
        await addLocation(orgId, { label: 'Branch 2', address: 'b', lat: 53.7, lng: -1.6 }, 3);
        await expect(addLocation(orgId, { label: 'Branch 3', address: 'c', lat: 53.6, lng: -1.7 }, 3)).rejects.toBeInstanceOf(LocationLimitError);
        expect(await listLocations(orgId)).toHaveLength(3);
    });

    it('does not let one org read another org location', async () => {
        const mine = (await listLocations(orgId))[0];
        expect(await getLocation(orgId, mine.id)).not.toBeNull();
        expect(await getLocation(otherOrgId, mine.id)).toBeNull();
        expect(await getLocation(orgId, 'not-a-uuid')).toBeNull();
    });

    it('never removes the primary location', async () => {
        const primary = (await primaryLocation(orgId))!;
        expect(await removeLocation(orgId, primary.id)).toBe(false);
        const extra = (await listLocations(orgId)).find((l) => !l.isPrimary)!;
        expect(await removeLocation(orgId, extra.id)).toBe(true);
    });
});

describe('rank history (real SQL)', () => {
    it('keeps rank history per keyword and location, oldest first', async () => {
        const primary = (await primaryLocation(orgId))!;
        const branch = (await listLocations(orgId)).find((l) => !l.isPrimary)!;
        await recordRankCheck(orgId, primary.id, 'dentist leeds', 5, ['A', 'B', 'C'], 'manual', new Date('2026-10-01T10:00:00Z'));
        await recordRankCheck(orgId, primary.id, 'dentist leeds', 3, ['B', 'A', 'C'], 'auto', new Date('2026-10-08T10:00:00Z'));
        await recordRankCheck(orgId, branch.id, 'dentist leeds', 9, [], 'manual', new Date('2026-10-02T10:00:00Z'));

        const here = (await historyFor(orgId, primary.id, ['dentist leeds'])).get('dentist leeds')!;
        expect(here.history.map((p) => p.rank)).toEqual([5, 3]);
        expect(here.top).toEqual(['B', 'A', 'C']);
        const there = (await historyFor(orgId, branch.id, ['dentist leeds'])).get('dentist leeds')!;
        expect(there.history.map((p) => p.rank)).toEqual([9]);

        const last = await lastCheckTimes(orgId, primary.id, ['dentist leeds', 'unknown']);
        expect(last.get('dentist leeds')).toBe('2026-10-08T10:00:00.000Z');
        expect(last.has('unknown')).toBe(false);
    });

    it('keeps the newest grid scan per keyword, with a previous value for the change', async () => {
        const primary = (await primaryLocation(orgId))!;
        const base = { gridSize: 3, grid: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], top3Percentage: 33, health: 60, competitorShare: [], competitors: [], center: { lat: 53.8, lng: -1.55 } };
        await recordGridScan(orgId, primary.id, { ...base, keyword: 'emergency dentist', avgRank: 6.5, at: new Date('2026-10-01T09:00:00Z') });
        await recordGridScan(orgId, primary.id, { ...base, keyword: 'emergency dentist', avgRank: 4.2, at: new Date('2026-10-08T09:00:00Z') });
        await recordGridScan(orgId, primary.id, { ...base, keyword: 'dental implants', avgRank: 8, at: new Date('2026-10-05T09:00:00Z') });

        const runs = await latestRuns(orgId, primary.id);
        expect(runs.map((r) => r.keyword)).toEqual(['emergency dentist', 'dental implants']);
        expect(runs[0]).toMatchObject({ avgRank: 4.2, gridSize: 3 });
        expect(runs[0].grid).toHaveLength(3);

        const tracked = await trackedFromScans(orgId, primary.id);
        const emergency = tracked.find((t) => t.keyword === 'emergency dentist')!;
        expect(emergency).toMatchObject({ avgRank: 4.2, previousAvgRank: 6.5 });
        expect(emergency.history).toHaveLength(2);
        expect(await lastScanAt(orgId, primary.id, 'emergency dentist')).toBe('2026-10-08T09:00:00.000Z');
        expect(await lastScanAt(orgId, primary.id, 'nothing')).toBeNull();
    });

    it('imports old dashboard history once and never twice', async () => {
        const id = (await pg.query("INSERT INTO organizations (name) VALUES ('Old') RETURNING id")).rows[0].id;
        const loc = await ensurePrimaryLocation(id, { name: 'Old Co', address: 'x', lat: 51.5, lng: -0.1 });
        const dashboard = {
            visibilityTracker: { keywords: [{ keyword: 'plumber', top: ['Z'], history: [{ date: '2026-09-01T00:00:00Z', rank: 7 }, { date: '2026-09-08T00:00:00Z', rank: 4 }] }] },
            gapAnalyses: [{ keyword: 'plumber', grid: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], gridSize: 3, avgRank: 2, top3Percentage: 100, updatedAt: '2026-09-09T00:00:00Z', competitorShare: [], competitors: [] }],
            trackedKeywords: [{ keyword: 'plumber', health: 70, history: [{ avgRank: 5, top3Percentage: 40, updatedAt: '2026-09-02T00:00:00Z' }, { avgRank: 2, top3Percentage: 100, updatedAt: '2026-09-09T00:00:00Z' }] }]
        };
        const first = await backfillFromDashboard(id, loc.id, dashboard);
        const second = await backfillFromDashboard(id, loc.id, dashboard);
        expect(first).toBe(4); // 2 rank checks + 1 older summary point + the latest scan
        expect(second).toBe(0);
        expect((await historyFor(id, loc.id, ['plumber'])).get('plumber')!.history).toHaveLength(2);
        expect((await trackedFromScans(id, loc.id))[0].history).toHaveLength(2);
    });

    it('keeps 90 days of grid detail and 12 months of history', async () => {
        const id = (await pg.query("INSERT INTO organizations (name) VALUES ('Retention') RETURNING id")).rows[0].id;
        const loc = await ensurePrimaryLocation(id, { name: 'R', address: 'r', lat: 51, lng: 0 });
        const day = 86_400_000;
        const base = { gridSize: 3, grid: [[1]], top3Percentage: 10, health: 10, competitorShare: [], competitors: [], center: null, avgRank: 3 };
        await recordGridScan(id, loc.id, { ...base, keyword: 'recent', at: new Date(Date.now() - 10 * day) });
        await recordGridScan(id, loc.id, { ...base, keyword: 'months-old', at: new Date(Date.now() - 200 * day) });
        await recordGridScan(id, loc.id, { ...base, keyword: 'ancient', at: new Date(Date.now() - 500 * day) });
        await recordRankCheck(id, loc.id, 'recent', 2, [], 'manual', new Date(Date.now() - 10 * day));
        await recordRankCheck(id, loc.id, 'ancient', 2, [], 'manual', new Date(Date.now() - 500 * day));

        const result = await purgeOldHistory();
        expect(result.gridDetailCleared).toBeGreaterThanOrEqual(1);
        const rows = (await pg.query('SELECT keyword, grid FROM grid_scans WHERE org_id = $1 ORDER BY keyword', [id])).rows;
        expect(rows.map((r: any) => r.keyword)).toEqual(['months-old', 'recent']); // 'ancient' deleted
        expect(rows.find((r: any) => r.keyword === 'recent').grid).not.toBeNull(); // newer than 90 days keeps the grid
        expect(rows.find((r: any) => r.keyword === 'months-old').grid).toBeNull(); // older than 90 days: summary only
        expect((await pg.query('SELECT keyword FROM rank_checks WHERE org_id = $1', [id])).rows.map((r: any) => r.keyword)).toEqual(['recent']);
    });
});
