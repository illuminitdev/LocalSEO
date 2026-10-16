import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import { useCredits } from './CreditsContext';

const DISMISS_KEY = 'credits-low-dismissed';

function readDismissed(periodEnd: string | null) {
    try {
        return sessionStorage.getItem(DISMISS_KEY) === String(periodEnd);
    } catch {
        return false;
    }
}

/** Shown only when credits are nearly or fully used up. Nothing appears at normal levels. */
export default function LowCreditsBanner() {
    const { summary, hasPool } = useCredits();
    const [dismissedEnd, setDismissedEnd] = useState<string | null>(null);
    if (!summary || !hasPool) return null;

    const empty = summary.remaining === 0;
    const low = summary.remaining <= summary.allowance * 0.1;
    if (!low) return null;
    if (!empty && (dismissedEnd === summary.periodEnd || readDismissed(summary.periodEnd))) return null;

    const resets = summary.periodEnd
        ? new Date(summary.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : 'next month';

    return (
        <div
            role="status"
            className={
                empty
                    ? 'mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800'
                    : 'mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900'
            }
        >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="flex-1">
                {empty
                    ? `You've used all your credits for this month. They reset on ${resets}.`
                    : `Your credits are running low (${summary.remaining} left). They reset on ${resets}.`}{' '}
                <Link to="/account#usage" className="font-bold underline">
                    View usage
                </Link>
            </p>
            {!empty && (
                <button
                    type="button"
                    aria-label="Dismiss"
                    className="shrink-0 cursor-pointer"
                    onClick={() => {
                        setDismissedEnd(summary.periodEnd);
                        try {
                            sessionStorage.setItem(DISMISS_KEY, String(summary.periodEnd));
                        } catch {
                            /* storage is optional */
                        }
                    }}
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
