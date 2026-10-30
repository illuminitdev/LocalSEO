import { cn } from '../../shared/utils';
import { useCredits } from '../../shared/CreditsContext';
import { CREDIT_FEATURE_LABELS, getTrackedKeywordLimit, type CreditFeature } from '../../shared/planCatalog';

const ACTION_ROWS: Array<{ feature: CreditFeature; label: string; unit: (cost: number) => string }> = [
    { feature: 'rankScan', label: 'Local rank scan', unit: (n) => `${n} per scan` },
    { feature: 'trackerKeyword', label: 'Keyword rank check', unit: (n) => `${n} per keyword` },
    { feature: 'aiInsights', label: 'AI Insights refresh', unit: (n) => `${n} per refresh` },
    { feature: 'llmVisibility', label: 'LLM Visibility check', unit: (n) => `up to ${n} per check` },
    { feature: 'llmTrackerAnswer', label: 'LLM Tracking check', unit: (n) => `${n} per new answer` },
    { feature: 'citations', label: 'Citations scan', unit: (n) => `${n} per scan` },
    { feature: 'reviewSync', label: 'Google review sync', unit: (n) => `${n} per sync` },
    { feature: 'keywordSuggest', label: 'New keyword idea search', unit: (n) => `${n} per search` },
    { feature: 'aiText', label: 'AI audit, post copy, review reply or Q&A answer', unit: (n) => `${n} per answer` },
    { feature: 'aiImage', label: 'AI post image or media photo', unit: (n) => `${n} per image` }
];


function resetLabel(iso: string | null) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Usage tab in Account settings: credits left, where they went, and what each action uses. */
export default function UsagePanel() {
    const { summary, hasPool, costOf } = useCredits();
    if (!summary || !hasPool) {
        return <p className="text-sm text-[#64748B]">Your plan does not include usage credits.</p>;
    }

    const pct = Math.min(100, Math.round((summary.used / Math.max(1, summary.allowance)) * 100));
    const low = summary.remaining <= summary.allowance * 0.1;
    const empty = summary.remaining === 0;

    return (
        <div className="space-y-6">
            <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-[#0F172A]">
                        <span className="text-2xl font-black tabular-nums">{summary.remaining.toLocaleString()}</span>
                        <span className="text-[#64748B]"> of {summary.allowance.toLocaleString()} credits left</span>
                    </p>
                    <p className="text-xs text-[#64748B]">Resets on {resetLabel(summary.periodEnd)}</p>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                        className={cn('h-full rounded-full transition-all', empty ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-[var(--brand-primary)]')}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>

            <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">Used this month</h3>
                {summary.breakdown.length ? (
                    <ul className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0] bg-white">
                        {summary.breakdown.map((row) => (
                            <li key={row.feature} className="flex items-center justify-between px-4 py-2.5 text-sm">
                                <span className="text-[#334155]">{CREDIT_FEATURE_LABELS[row.feature as CreditFeature] || row.feature}</span>
                                <span className="font-bold tabular-nums text-[#0F172A]">{row.credits}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-[#64748B]">No credits used yet this month.</p>
                )}
            </div>

            <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">What each action uses</h3>
                <ul className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0] bg-white">
                    {ACTION_ROWS.map((row) => (
                        <li key={row.feature} className="flex items-center justify-between px-4 py-2.5 text-sm">
                            <span className="text-[#334155]">{row.label}</span>
                            <span className="tabular-nums text-[#0F172A]">
                                {row.unit(costOf(row.feature))} {costOf(row.feature) === 1 ? 'credit' : 'credits'}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            <ul className="space-y-1.5 text-xs text-[#64748B] list-disc pl-4">
                
                <li>Each grid keyword and tracked keyword runs once per billing month. After that the saved result is shown, with no new charge.</li>
                <li>Checks that fail are refunded. Credits reset on your billing date and do not roll over.</li>
                <li>
                    You can track up to {getTrackedKeywordLimit(summary.planId)} keywords. Keywords are only checked when you click Check.
                </li>
            </ul>
        </div>
    );
}
