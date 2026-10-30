import { purgeOldHistory } from './lib/rankHistory';

/**
 * Daily job: history cleanup only (database work, no paid API).
 * Automatic keyword checks were removed: DataForSEO and Gemini only run when a user clicks a button.
 */
export async function runDailyJobs() {
    const started = Date.now();
    const purged = await purgeOldHistory().catch((err: any) => {
        console.error('[jobs] cleanup failed:', err?.message || err);
        return null;
    });
    const totals = { ms: Date.now() - started, purged };
    console.log('[jobs] daily run finished', JSON.stringify(totals));
    return { totals };
}

/** Lambda entry for the EventBridge schedule. */
export const handler = async () => runDailyJobs();
