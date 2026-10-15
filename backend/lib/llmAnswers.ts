import { norm, type Platform, type RawAnswer, type RowAnalysis } from './aiInsights';

/**
 * Answers (and the verdict reached on them) shared by LLM Visibility and LLM Tracking, kept in
 * dashboardState.llmAnswers. Both screens read the same entry for a prompt, so they cannot disagree.
 */
// Big enough for every prompt × platform a plan can have, so a saved answer is never dropped and paid for again.
const MAX_ENTRIES = 200;

export type StoredAnswer = {
    prompt: string;
    platform: Platform;
    askedAt: string;
    answer: RawAnswer;
    verdict?: RowAnalysis;
};

export const answerKey = (platform: Platform, prompt: string) => `${platform}|${norm(prompt)}`;

function store(dash: any): Record<string, StoredAnswer> {
    if (!dash.llmAnswers || typeof dash.llmAnswers !== 'object') dash.llmAnswers = {};
    return dash.llmAnswers;
}

/**
 * Each prompt is asked once per billing month. The request sets the period start here (see llmPeriod in
 * server.ts); without it the calendar month is used.
 */
export function setAnswerPeriod(dash: any, periodStart: string) {
    dash.llmAnswerPeriodStart = periodStart;
}

export function answerPeriodStart(dash: any): number {
    const set = dash?.llmAnswerPeriodStart ? new Date(dash.llmAnswerPeriodStart).getTime() : NaN;
    if (Number.isFinite(set)) return set;
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** The stored answer when it was asked in the current billing month, else null (then it may be asked again). */
export function cachedAnswer(dash: any, platform: Platform, prompt: string): StoredAnswer | null {
    const entry = store(dash)[answerKey(platform, prompt)];
    if (!entry?.answer?.present) return null;
    const at = new Date(entry.askedAt).getTime();
    return Number.isFinite(at) && at >= answerPeriodStart(dash) ? entry : null;
}

/** Save an answer (and its verdict) and keep only the newest entries. */
export function putAnswer(dash: any, entry: StoredAnswer) {
    const all = store(dash);
    const key = answerKey(entry.platform, entry.prompt);
    const previous = all[key];
    // Same answer asked at the same time keeps the verdict it already has unless a new one is given.
    all[key] = { ...entry, verdict: entry.verdict ?? (previous?.askedAt === entry.askedAt ? previous.verdict : undefined) };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
        keys
            .sort((a, b) => new Date(all[a].askedAt).getTime() - new Date(all[b].askedAt).getTime())
            .slice(0, keys.length - MAX_ENTRIES)
            .forEach((k) => delete all[k]);
    }
}
