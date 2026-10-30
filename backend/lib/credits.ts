import { query } from './db';
import { attachEntitlements, entitlementsDisabled } from '../middleware/entitlements';
import { CREDIT_COSTS, getCreditAllowance, type CreditFeature } from './planCatalog';

/** Thrown when an action needs more credits than the org has left this period. */
export class InsufficientCredits extends Error {
    status = 402;
    code = 'insufficient_credits';
    cost: number;
    remaining: number;
    periodEnd: string | null;
    constructor(cost: number, remaining: number, periodEnd: string | null) {
        const resets = periodEnd ? new Date(periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
        const lead = remaining > 0 ? "You don't have enough credits left for this" : "You've used all your credits for this month";
        super(`${lead}${resets ? `. They reset on ${resets}` : ''}.`);
        this.cost = cost;
        this.remaining = remaining;
        this.periodEnd = periodEnd;
    }
}

export type CreditUsage = {
    unlimited: boolean;
    planId: string | null;
    allowance: number;
    used: number;
    remaining: number;
    periodStart: string | null;
    periodEnd: string | null;
};

/** Billing period from the subscription, falling back to the calendar month (UTC). */
export function creditPeriod(entitlements: any, now = new Date()) {
    const start = entitlements?.currentPeriodStart ? new Date(entitlements.currentPeriodStart) : null;
    const end = entitlements?.currentPeriodEnd ? new Date(entitlements.currentPeriodEnd) : null;
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= now && now < end) {
        return { start, end };
    }
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start: first, end: next };
}

function iso(v: unknown) {
    return v ? new Date(v as any).toISOString() : null;
}

function rowToUsage(row: any, planId: string | null): CreditUsage {
    const allowance = Number(row.allowance) || 0;
    const used = Number(row.used) || 0;
    return {
        unlimited: false,
        planId,
        allowance,
        used,
        remaining: Math.max(0, allowance - used),
        periodStart: iso(row.period_start),
        periodEnd: iso(row.period_end)
    };
}

const UNLIMITED: CreditUsage = {
    unlimited: true,
    planId: null,
    allowance: 0,
    used: 0,
    remaining: 0,
    periodStart: null,
    periodEnd: null
};

/** Creates or refreshes the org's credit row. The pool resets when the billing period changes. */
async function ensureRow(orgId: string, planId: string | null, entitlements: any) {
    const { start, end } = creditPeriod(entitlements);
    const { rows } = await query(
        `INSERT INTO org_credits (org_id, plan_id, period_start, period_end, allowance, used)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (org_id) DO UPDATE SET
             used = CASE WHEN org_credits.period_start = EXCLUDED.period_start THEN org_credits.used ELSE 0 END,
             plan_id = EXCLUDED.plan_id,
             period_start = EXCLUDED.period_start,
             period_end = EXCLUDED.period_end,
             allowance = EXCLUDED.allowance,
             updated_at = NOW()
         RETURNING *`,
        [orgId, planId || '', start, end, getCreditAllowance(planId)]
    );
    return rows[0];
}

export async function getUsage(req: any): Promise<CreditUsage> {
    if (entitlementsDisabled() || !req.orgId) return UNLIMITED;
    const entitlements = await attachEntitlements(req);
    const planId = entitlements?.planId ? String(entitlements.planId) : null;
    return rowToUsage(await ensureRow(String(req.orgId), planId, entitlements), planId);
}

/** Credits used per feature in the current period. */
export async function getBreakdown(orgId: string, periodStart: string | null) {
    if (!periodStart) return [];
    const { rows } = await query(
        `SELECT feature, SUM(credits)::int AS credits
         FROM usage_ledger
         WHERE org_id = $1 AND created_at >= $2
         GROUP BY feature
         HAVING SUM(credits) > 0
         ORDER BY SUM(credits) DESC`,
        [orgId, periodStart]
    );
    return rows.map((r: any) => ({ feature: String(r.feature), credits: Number(r.credits) }));
}

export async function creditsSummary(req: any) {
    const usage = await getUsage(req);
    const breakdown = usage.unlimited ? [] : await getBreakdown(String(req.orgId), usage.periodStart);
    return { ...usage, costs: CREDIT_COSTS, breakdown };
}

async function writeLedger(orgId: string, feature: string, credits: number, ref: string, note = '') {
    await query(
        `INSERT INTO usage_ledger (org_id, feature, credits, ref, note) VALUES ($1, $2, $3, $4, $5)`,
        [orgId, feature, credits, ref.slice(0, 120), note.slice(0, 200)]
    );
}

/**
 * Takes credits from the pool. The guarded UPDATE is one statement, so two requests at the same
 * time can never spend more than the allowance. Throws InsufficientCredits when short.
 */
export async function spend(req: any, feature: CreditFeature, credits: number, ref = '', note = '') {
    const cost = Math.max(0, Math.round(credits));
    if (!cost || entitlementsDisabled() || !req.orgId) return null;
    const orgId = String(req.orgId);
    const usage = await getUsage(req);
    const { rows } = await query(
        `UPDATE org_credits
         SET used = used + $2, updated_at = NOW()
         WHERE org_id = $1 AND used + $2 <= allowance
         RETURNING *`,
        [orgId, cost]
    );
    if (!rows.length) throw new InsufficientCredits(cost, usage.remaining, usage.periodEnd);
    await writeLedger(orgId, feature, cost, ref, note);
    return rowToUsage(rows[0], usage.planId);
}

/** Gives credits back for work that failed. Never takes `used` below zero. */
export async function refund(req: any, feature: CreditFeature, credits: number, ref = '', note = '') {
    const amount = Math.max(0, Math.round(credits));
    if (!amount || entitlementsDisabled() || !req.orgId) return;
    const orgId = String(req.orgId);
    await query(
        `UPDATE org_credits SET used = GREATEST(0, used - $2), updated_at = NOW() WHERE org_id = $1`,
        [orgId, amount]
    );
    await writeLedger(orgId, feature, -amount, ref, note || 'refund');
}

/** True when this org paid for `ref` (a scan or run id) within the last `minutes`. */
export async function hasRecentCharge(orgId: string, feature: CreditFeature, ref: string, minutes = 15) {
    if (entitlementsDisabled()) return true;
    const { rows } = await query(
        `SELECT 1 FROM usage_ledger
         WHERE org_id = $1 AND feature = $2 AND ref = $3 AND credits > 0
           AND created_at >= NOW() - ($4 || ' minutes')::interval
         LIMIT 1`,
        [orgId, feature, ref, String(minutes)]
    );
    return rows.length > 0;
}

/**
 * Counts one more call under a paid run (e.g. one scan cell) and refuses once `max` is reached,
 * so a single payment cannot be used for unlimited calls.
 */
export async function registerCall(orgId: string, feature: CreditFeature, ref: string, max: number) {
    if (entitlementsDisabled()) return true;
    const { rows } = await query(
        `WITH c AS (
             SELECT COUNT(*)::int AS n FROM usage_ledger
             WHERE org_id = $1 AND feature = $2 AND ref = $3 AND credits = 0
         )
         INSERT INTO usage_ledger (org_id, feature, credits, ref, note)
         SELECT $1, $2, 0, $3, 'call' FROM c WHERE c.n < $4
         RETURNING id`,
        [orgId, feature, ref.slice(0, 120), max]
    );
    return rows.length > 0;
}

/** Refund that can only happen once per `ref` (guards against a repeated "finish" request). */
export async function refundOnce(req: any, feature: CreditFeature, credits: number, ref: string, note = '') {
    if (!credits || entitlementsDisabled() || !req.orgId) return;
    const { rows } = await query(
        `SELECT 1 FROM usage_ledger WHERE org_id = $1 AND feature = $2 AND ref = $3 AND credits < 0 LIMIT 1`,
        [String(req.orgId), feature, ref.slice(0, 120)]
    );
    if (rows.length) return;
    await refund(req, feature, credits, ref, note);
}

/** When a cooldown ends, or null if the action is allowed now. */
export function cooldownEnds(lastAt: string | Date | null | undefined, hours: number, now = Date.now()) {
    if (!lastAt) return null;
    const last = new Date(lastAt).getTime();
    if (Number.isNaN(last)) return null;
    const next = last + hours * 3_600_000;
    return next > now ? new Date(next).toISOString() : null;
}

/** Sends a 402 for credit errors. Returns true if it handled the error. */
export function sendCreditError(res: any, err: any) {
    if (!(err instanceof InsufficientCredits)) return false;
    res.status(402).json({
        error: err.message,
        code: err.code,
        cost: err.cost,
        remaining: err.remaining,
        periodEnd: err.periodEnd
    });
    return true;
}

export function sendCooldown(res: any, nextAvailableAt: string, what = 'This') {
    res.status(429).json({
        error: `${what} was run recently. You can run it again after ${new Date(nextAvailableAt).toUTCString()}.`,
        code: 'cooldown',
        nextAvailableAt
    });
}
