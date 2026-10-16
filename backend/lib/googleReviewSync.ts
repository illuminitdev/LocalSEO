import { logDfsCost } from './dfsCost';
import { dataForSeoConfigured } from './dataForSeoCitations';
import { locationCodeFor, type GeoHint } from './geo';

export type SyncedReview = {
    author: string;
    rating: number;
    text: string;
    when: string;
    ownerReply: string;
    ownerRepliedAt: string;
};

export function reviewSyncConfigured() {
    return dataForSeoConfigured();
}

function auth() {
    const login = String(process.env.DATAFORSEO_LOGIN || '').trim();
    const password = String(process.env.DATAFORSEO_PASSWORD || '').trim();
    return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

function safeIso(v: unknown) {
    if (!v) return '';
    const d = new Date(String(v).replace(' +00:00', 'Z').replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Starts a DataForSEO Google Reviews task (it runs asynchronously; poll with fetchReviewTask). */
export async function startReviewTask(placeId: string, geo: GeoHint, depth = 100): Promise<string> {
    const res = await fetch('https://api.dataforseo.com/v3/business_data/google/reviews/task_post', {
        method: 'POST',
        headers: { Authorization: auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify([{ place_id: placeId, location_code: locationCodeFor(geo), language_code: 'en', depth, sort_by: 'newest' }]),
        signal: AbortSignal.timeout(20000)
    });
    const data: any = await res.json().catch(() => ({}));
    logDfsCost('reviews/task_post', data);
    const task = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!res.ok || !task || task.status_code !== 20100 || !task.id) {
        throw new Error(String(task?.status_message || data?.status_message || `DataForSEO HTTP ${res.status}`));
    }
    return String(task.id);
}

/** Pending while DataForSEO is still collecting; done with the reviews once ready. */
export async function fetchReviewTask(
    taskId: string
): Promise<{ status: 'pending' } | { status: 'done'; reviews: SyncedReview[]; total: number | null }> {
    const res = await fetch(`https://api.dataforseo.com/v3/business_data/google/reviews/task_get/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: auth() },
        signal: AbortSignal.timeout(20000)
    });
    const data: any = await res.json().catch(() => ({}));
    logDfsCost('reviews/task_get', data);
    const task = Array.isArray(data?.tasks) ? data.tasks[0] : null;
    if (!task) throw new Error(String(data?.status_message || `DataForSEO HTTP ${res.status}`));
    // 40601 = task handed over, 40602 = in queue
    if (task.status_code === 40601 || task.status_code === 40602) return { status: 'pending' };
    if (task.status_code !== 20000) throw new Error(String(task.status_message || 'Review task failed'));
    const result = Array.isArray(task.result) ? task.result[0] : task.result;
    const items: any[] = Array.isArray(result?.items) ? result.items : [];
    const reviews: SyncedReview[] = items
        .filter((i) => i && (i.rating?.value != null || i.review_text || i.original_review_text))
        .map((i) => ({
            author: String(i.profile_name || 'Google user').slice(0, 80),
            rating: Math.max(1, Math.min(5, Math.round(Number(i.rating?.value)) || 5)),
            text: String(i.review_text || i.original_review_text || '').trim().slice(0, 2000),
            when: safeIso(i.timestamp),
            ownerReply: String(i.owner_answer || i.original_owner_answer || '').trim().slice(0, 2000),
            ownerRepliedAt: safeIso(i.owner_timestamp)
        }));
    return { status: 'done', reviews, total: Number(result?.reviews_count) || null };
}
