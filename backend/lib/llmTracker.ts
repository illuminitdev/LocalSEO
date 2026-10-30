import { LLM_PLATFORMS, answerVerdicts, askLlm, type Platform, type RawAnswer, type VisibilityBusiness } from './aiInsights';
import { cachedAnswer, putAnswer, type StoredAnswer } from './llmAnswers';

const MAX_HISTORY_POINTS = 60;
const MAX_PROMPT_LENGTH = 200;
/** Rank stored when the business is not named in any LLM answer. */
export const NOT_RANKED = 21;
/** Rank used when the business is named but its order among the recommendations can't be read. */
const MENTIONED_UNKNOWN_POSITION = 10;

export type PromptPlatformResult = {
    mentioned: boolean;
    position: number; // order among the businesses the answer names; 0 when not named
    competitors: string[];
    context: string;
    /** Full answer and sources: kept only on the latest check of each prompt to limit stored size. */
    text?: string;
    sources?: Array<{ title: string; url: string; domain: string }>;
};
export type PromptPoint = {
    date: string;
    /** When the oldest answer behind this point was asked (earlier than `date` when answers were reused). */
    askedAt?: string;
    rank: number;
    mentioned: number; // platforms (of those that answered) that named the business
    answered: number; // platforms that returned an answer
    platforms: Partial<Record<Platform, PromptPlatformResult>>;
};
export type TrackedPrompt = {
    prompt: string;
    addedAt: string;
    checkedAt?: string;
    history: PromptPoint[];
};

export function cleanPrompt(raw: unknown) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT_LENGTH);
}

/** One point from the shared answers + verdicts of a prompt. Rank = average over the platforms that answered; a platform that does not name the business counts as NOT_RANKED. */
export function pointFromEntries(entries: Partial<Record<Platform, StoredAnswer>>): PromptPoint | null {
    const platforms: PromptPoint['platforms'] = {};
    let askedAt = '';
    for (const p of LLM_PLATFORMS) {
        const e = entries[p];
        if (!e?.verdict || !e.answer.present) continue;
        const v = e.verdict;
        platforms[p] = {
            mentioned: v.mentioned,
            position: v.mentioned ? v.position || MENTIONED_UNKNOWN_POSITION : 0,
            competitors: v.competitors,
            context: v.context,
            text: e.answer.text,
            sources: e.answer.sources
        };
        if (!askedAt || e.askedAt < askedAt) askedAt = e.askedAt;
    }
    const answered = Object.values(platforms);
    if (!answered.length) return null;
    const perPlatform = answered.map((r) => (r!.mentioned ? Math.min(NOT_RANKED - 1, r!.position) : NOT_RANKED));
    const mentionedCount = answered.filter((r) => r!.mentioned).length;
    return {
        date: new Date().toISOString(),
        askedAt,
        rank: mentionedCount ? Math.round((perPlatform.reduce((s, v) => s + v, 0) / perPlatform.length) * 10) / 10 : NOT_RANKED,
        mentioned: mentionedCount,
        answered: answered.length,
        platforms
    };
}

/** Runs the Gemini analysis over answers grouped by platform (implemented in server.ts); may fail or return no rows. */
export type AnalyzeAnswers = (business: VisibilityBusiness, input: Partial<Record<Platform, RawAnswer[]>>) => Promise<{ rows: any[] }>;

/**
 * Check prompts through the shared answer store: answers asked this billing month (from here or from LLM Visibility) are reused,
 * Verdicts use the same rule as LLM Visibility and are stored with the answer.
 * Keep batches small (the Gemini analysis handles at most 8 answers per platform).
 */
export async function checkPrompts(
    dash: any,
    prompts: string[],
    business: VisibilityBusiness,
    opts: { analyze: AnalyzeAnswers }
): Promise<Map<string, PromptPoint | string>> {
    const entries = new Map<string, Partial<Record<Platform, StoredAnswer>>>(prompts.map((p) => [p, {}]));
    const firstError = new Map<string, string>();
    await Promise.all(
        prompts.flatMap((prompt) =>
            LLM_PLATFORMS.map(async (platform) => {
                try {
                    let entry = cachedAnswer(dash, platform, prompt);
                    if (!entry) {
                        const answer = await askLlm(platform, prompt, business);
                        if (!answer.present) throw new Error(`${platform} returned an empty answer.`);
                        entry = { prompt, platform, askedAt: new Date().toISOString(), answer };
                        putAnswer(dash, entry);
                    }
                    entries.get(prompt)![platform] = entry;
                } catch (err: any) {
                    if (!firstError.has(prompt)) firstError.set(prompt, String(err?.message || 'failed'));
                }
            })
        )
    );

    // Judge every answer that has no verdict yet, in one analysis pass shared by all prompts.
    const pending: Partial<Record<Platform, Array<StoredAnswer>>> = {};
    for (const slot of entries.values()) {
        for (const p of LLM_PLATFORMS) {
            const e = slot[p];
            if (e && !e.verdict) (pending[p] ||= []).push(e);
        }
    }
    if (Object.keys(pending).length) {
        const input: Partial<Record<Platform, RawAnswer[]>> = {};
        for (const p of LLM_PLATFORMS) if (pending[p]) input[p] = pending[p]!.map((e) => e.answer);
        const analysis = await opts.analyze(business, input).catch(() => ({ rows: [] as any[] }));
        const verdicts = answerVerdicts(business, input, analysis);
        for (const p of LLM_PLATFORMS) {
            (pending[p] || []).forEach((e, i) => {
                const v = verdicts[p]?.[i]?.verdict;
                if (v) {
                    e.verdict = v;
                    putAnswer(dash, e);
                }
            });
        }
    }

    const out = new Map<string, PromptPoint | string>();
    for (const prompt of prompts) {
        out.set(prompt, pointFromEntries(entries.get(prompt)!) || firstError.get(prompt) || 'No LLM platform returned an answer.');
    }
    return out;
}

/** Append a point, replacing the last one when it was taken within a minute (double clicks). */
export function appendPoint(item: TrackedPrompt, point: PromptPoint) {
    const last = item.history[item.history.length - 1];
    if (last && new Date(point.date).getTime() - new Date(last.date).getTime() < 60_000) item.history.pop();
    // Only the newest check keeps the full answers; older ones keep ranks, competitors and context.
    for (const old of item.history) {
        for (const r of Object.values(old.platforms)) {
            if (r) {
                delete r.text;
                delete r.sources;
            }
        }
    }
    item.history.push(point);
    if (item.history.length > MAX_HISTORY_POINTS) item.history.splice(0, item.history.length - MAX_HISTORY_POINTS);
    item.checkedAt = point.date;
}

export { suggestPrompts } from './aiInsights';
