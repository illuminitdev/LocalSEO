import { migrate } from './lib/db';
import { runEnrichment, triggerLeadEnrichment } from './lib/leadGbpEnrich';

/**
 * Lambda entry for admin lead GBP enrichment (invoked asynchronously by the API Lambda).
 * Event: { batchId?: string | null }
 */
export const handler = async (event: { batchId?: string | null } = {}) => {
    await migrate().catch((err) => console.error('[lead-enrich] migrate failed:', err?.message || err));
    const batchId = event?.batchId || null;
    const result = await runEnrichment(batchId);
    console.log('[lead-enrich] done', { batchId, ...result });
    // Time budget hit with leads still pending: continue in a fresh invocation.
    if (result.more) await triggerLeadEnrichment(batchId);
    return result;
};
