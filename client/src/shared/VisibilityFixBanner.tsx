import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';

const LABELS: Record<string, string> = {
    website: "You're fixing: website reachability from the Visibility Audit.",
    nap: "You're fixing: NAP / Google listing gaps from the Visibility Audit.",
    optimisation: "You're fixing: GBP profile optimisation from the Visibility Audit.",
    photos: "You're fixing: photo gaps from the Visibility Audit.",
    posts: "You're fixing: GBP posts from the Visibility Audit.",
    reviews: "You're fixing: reviews & replies from the Visibility Audit.",
    near_me: "You're fixing: near-me / Maps visibility from the Visibility Audit.",
    general: "You're fixing a gap from the Visibility Audit."
};

/** One-line banner when arriving from Visibility Audit “Ready to fix”. */
export default function VisibilityFixBanner() {
    const [params, setParams] = useSearchParams();
    const [dismissed, setDismissed] = useState(false);
    const check = params.get('check') || 'general';
    const from = params.get('from');

    const show = from === 'visibility-audit' && !dismissed;

    useEffect(() => {
        setDismissed(false);
    }, [from, check]);

    const message = useMemo(() => LABELS[check] || LABELS.general, [check]);

    if (!show) return null;

    return (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1">
                <p className="font-semibold">{message}</p>
                <Link to="/visibility-audit/report" className="text-amber-800 underline font-medium mt-1 inline-block">
                    Back to Visibility Audit report
                </Link>
            </div>
            <button
                type="button"
                aria-label="Dismiss"
                className="text-amber-700 hover:text-amber-900 cursor-pointer"
                onClick={() => {
                    setDismissed(true);
                    const next = new URLSearchParams(params);
                    next.delete('from');
                    next.delete('check');
                    setParams(next, { replace: true });
                }}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
