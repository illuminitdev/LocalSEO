import { GoogleGenerativeAI } from '@google/generative-ai';

export const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

export type GeminiCall = { step: string; model: string; ok: boolean; code: string; ms: number; error?: string };

const calls: GeminiCall[] = [];

/** Calls made since the last reset (one audit job). */
export function geminiCallLog(): GeminiCall[] {
  return [...calls];
}

export function resetGeminiCallLog() {
  calls.length = 0;
}

function errorCode(message: string): string {
  const m = message.match(/\[(\d{3})[^\]]*\]/);
  if (m) return m[1];
  if (/timeout|aborted/i.test(message)) return 'timeout';
  return 'error';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One Gemini request with the model fallback list. Busy / timeout errors are retried with a short wait;
 * a quota or billing error (429) moves straight to the next model. Every attempt is logged.
 */
export async function geminiGenerate<T>(
  step: string,
  opts: {
    prompt: string;
    generationConfig?: Record<string, unknown>;
    tools?: unknown[];
    models?: string[];
    parse: (text: string) => T | null;
  }
): Promise<{ value: T; model: string }> {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    calls.push({ step, model: '-', ok: false, code: 'no_key', ms: 0, error: 'GEMINI_API_KEY is not configured' });
    throw new Error('GEMINI_API_KEY is not configured');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError = 'No Gemini model answered';
  for (const modelName of opts.models || GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(attempt === 1 ? 2000 : 6000);
      const started = Date.now();
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          ...(opts.generationConfig ? { generationConfig: opts.generationConfig } : {}),
          ...(opts.tools ? { tools: opts.tools as any } : {})
        });
        const result = await model.generateContent(opts.prompt);
        const value = opts.parse(result.response.text());
        const ms = Date.now() - started;
        if (value == null) {
          calls.push({ step, model: modelName, ok: false, code: 'unusable', ms, error: 'Answer could not be used' });
          console.warn(`[gemini] step=${step} model=${modelName} fail code=unusable ms=${ms}`);
          lastError = 'Gemini answer could not be used';
          break;
        }
        calls.push({ step, model: modelName, ok: true, code: '200', ms });
        console.log(`[gemini] step=${step} model=${modelName} ok ms=${ms}`);
        return { value, model: modelName };
      } catch (err) {
        const message = String((err as Error)?.message || err);
        const code = errorCode(message);
        const ms = Date.now() - started;
        calls.push({ step, model: modelName, ok: false, code, ms, error: message.slice(0, 300) });
        console.warn(`[gemini] step=${step} model=${modelName} fail code=${code} ms=${ms}: ${message.slice(0, 300)}`);
        lastError = message;
        if (!(code === '503' || code === '500' || code === 'timeout')) break;
      }
    }
  }
  throw new Error(lastError);
}

/** Plain-English summary of failed Gemini steps for the audit's data warnings. */
export function geminiWarnings(): string[] {
  const byStep = new Map<string, GeminiCall[]>();
  for (const c of calls) byStep.set(c.step, [...(byStep.get(c.step) || []), c]);
  const out: string[] = [];
  for (const [step, rows] of byStep) {
    if (rows.some((r) => r.ok)) continue;
    const codes = [...new Set(rows.map((r) => r.code))].join(', ');
    const reason = codes.includes('429')
      ? 'quota or billing limit on the Gemini key'
      : codes.includes('503')
        ? 'Google said the model was busy'
        : codes.includes('no_key')
          ? 'no Gemini key configured'
          : `errors ${codes}`;
    out.push(`Gemini ${step} failed (${reason}); the rule-based fallback was used`);
  }
  return out;
}
