import type { ApiError } from './utils';

/** Plain message for a 402 `insufficient_credits` error. The details live under Usage in Account settings. */
export function creditErrorMessage(err: ApiError) {
    const end = err?.body?.periodEnd
        ? new Date(err.body.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '';
    return `You've used all your credits for this month${end ? `. They reset on ${end}` : ''}. You can see your usage under Account settings.`;
}
