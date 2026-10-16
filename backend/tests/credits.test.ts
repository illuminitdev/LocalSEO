import { describe, expect, it } from 'vitest';
import { InsufficientCredits, cooldownEnds, creditPeriod } from '../lib/credits';
import {
    AUTO_CHECK_EVERY_DAYS,
    CREDIT_ALLOWANCES,
    CREDIT_COSTS,
    LOCATION_LIMITS,
    TRACKED_KEYWORD_LIMIT,
    TRACKED_KEYWORD_LIMITS,
    getAutoCheckEveryDays,
    getTrackedKeywordLimit,
    getGridScanLimit,
    getLlmTrackerPromptLimit,
    getCreditAllowance,
    getLocationLimit
} from '../lib/planCatalog';

describe('creditPeriod', () => {
    const now = new Date('2026-10-15T12:00:00Z');

    it('uses the subscription billing period when it contains today', () => {
        const period = creditPeriod({ currentPeriodStart: '2026-10-03T00:00:00Z', currentPeriodEnd: '2026-11-03T00:00:00Z' }, now);
        expect(period.start.toISOString()).toBe('2026-10-03T00:00:00.000Z');
        expect(period.end.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    });

    it('falls back to the calendar month when there is no period', () => {
        const period = creditPeriod({}, now);
        expect(period.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(period.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('falls back to the calendar month when the period has already ended', () => {
        const period = creditPeriod({ currentPeriodStart: '2026-08-01T00:00:00Z', currentPeriodEnd: '2026-09-01T00:00:00Z' }, now);
        expect(period.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('rolls over the year in December', () => {
        const period = creditPeriod({}, new Date('2026-12-20T00:00:00Z'));
        expect(period.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
});

describe('cooldownEnds', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();

    it('is null when never run', () => {
        expect(cooldownEnds(null, 24, now)).toBeNull();
        expect(cooldownEnds(undefined, 24, now)).toBeNull();
    });

    it('returns the end time while inside the window', () => {
        expect(cooldownEnds('2026-10-15T00:00:00Z', 24, now)).toBe('2026-10-16T00:00:00.000Z');
    });

    it('is null once the window has passed', () => {
        expect(cooldownEnds('2026-10-14T11:00:00Z', 24, now)).toBeNull();
    });

    it('ignores invalid dates', () => {
        expect(cooldownEnds('not a date', 24, now)).toBeNull();
    });
});

describe('InsufficientCredits', () => {
    it('says there are not enough credits and when they reset', () => {
        const err = new InsufficientCredits(9, 4, '2026-11-01T12:00:00.000Z');
        expect(err.status).toBe(402);
        expect(err.code).toBe('insufficient_credits');
        expect(err.cost).toBe(9);
        expect(err.remaining).toBe(4);
        expect(err.message).toMatch(/enough credits/);
        expect(err.message).toMatch(/reset on 1 Nov/);
    });

    it('has a clear message when nothing is left', () => {
        expect(new InsufficientCredits(1, 0, null).message).toBe("You've used all your credits for this month.");
    });
});

describe('plan limits', () => {
    it('gives each Local SEO plan an allowance, and booking-only plans none', () => {
        expect(getCreditAllowance('local-presence')).toBe(CREDIT_ALLOWANCES['local-presence']);
        expect(getCreditAllowance('local-growth')).toBeGreaterThan(getCreditAllowance('local-presence'));
        expect(getCreditAllowance('complete-growth-system')).toBeGreaterThan(getCreditAllowance('local-growth'));
        expect(getCreditAllowance('booking-pro')).toBe(0);
        expect(getCreditAllowance(null)).toBe(0);
    });

    it('limits locations by plan, up to 10', () => {
        expect(getLocationLimit('local-presence')).toBe(1);
        expect(getLocationLimit('local-growth')).toBe(3);
        expect(getLocationLimit('complete-growth-system')).toBe(10);
        expect(Math.max(...Object.values(LOCATION_LIMITS))).toBeLessThanOrEqual(10);
        expect(getLocationLimit('unknown')).toBe(1);
    });

    it('has automatic keyword checks turned off on every plan', () => {
        expect(getAutoCheckEveryDays('local-presence')).toBe(0);
        expect(getAutoCheckEveryDays('local-growth')).toBe(0);
        expect(getAutoCheckEveryDays('complete-growth-system')).toBe(0);
        expect(Object.keys(AUTO_CHECK_EVERY_DAYS)).toEqual([]);
    });

    it('tracks 5 keywords on Local Presence and 10 on the Growth plans', () => {
        expect(getTrackedKeywordLimit('local-presence')).toBe(5);
        expect(getTrackedKeywordLimit('local-growth')).toBe(10);
        expect(getTrackedKeywordLimit('complete-growth-system')).toBe(10);
        expect(getTrackedKeywordLimit('unknown')).toBe(5);
        expect(TRACKED_KEYWORD_LIMIT).toBe(Math.max(...Object.values(TRACKED_KEYWORD_LIMITS)));
    });

    it('charges a 3x3 scan 9 credits and a keyword check 1 credit', () => {
        expect(CREDIT_COSTS.rankScan).toBe(9);
        expect(CREDIT_COSTS.trackerKeyword).toBe(1);
    });

    it('allows 3x3 grid scans per month: Local Presence 5, Local Growth 10, Complete Growth 10', () => {
        expect(getGridScanLimit('local-presence')).toBe(5);
        expect(getGridScanLimit('local-growth')).toBe(10);
        expect(getGridScanLimit('complete-growth-system')).toBe(10);
        expect(getGridScanLimit('unknown')).toBe(0);
    });

    it('uses the same 5/10/10 limit for LLM prompts as for keywords', () => {
        for (const plan of ['local-presence', 'local-growth', 'complete-growth-system']) {
            expect(getLlmTrackerPromptLimit(plan)).toBe(getTrackedKeywordLimit(plan));
        }
        expect(getLlmTrackerPromptLimit('local-presence')).toBe(5);
    });

    it('charges Gemini text 1 credit and Gemini images 2 credits', () => {
        expect(CREDIT_COSTS.aiText).toBe(1);
        expect(CREDIT_COSTS.aiImage).toBe(2);
    });
});
