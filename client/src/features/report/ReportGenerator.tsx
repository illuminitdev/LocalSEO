import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    MessageSquareWarning,
    Camera,
    FileText,
    UserCheck,
    Sparkles,
    TrendingUp,
    RefreshCw,
    Trash2,
    Loader2,
    Lightbulb,
    Clock,
    ArrowUpRight,
    ArrowUp,
    ArrowDown,
    Star,
    Download,
    Check,
    X
} from 'lucide-react';
import { apiDelete, apiGet, apiPost, ago, type ApiError } from '../../shared/utils';
import { useCredits } from '../../shared/CreditsContext';
import { creditErrorMessage } from '../../shared/creditMessages';
import { downloadElementAsPdf } from '../../shared/downloadElementAsPdf';
import { getPageCache, setPageCache } from '../../shared/pageCache';

const ACTION_ICONS: Record<string, any> = {
    review: MessageSquareWarning,
    clock: Clock,
    photo: Camera,
    post: FileText,
    profile: UserCheck,
    rank: TrendingUp,
    gap: Star
};
const ACTION_TONES: Record<string, string> = {
    review: 'bg-rose-50 text-rose-500',
    clock: 'bg-orange-500 text-white',
    photo: 'bg-[#0F172A] text-white',
    post: 'bg-blue-50 text-blue-600',
    profile: 'bg-emerald-50 text-emerald-600',
    rank: 'bg-violet-50 text-violet-600',
    gap: 'bg-amber-50 text-amber-600'
};

function weekLabelBuckets(history: any[]) {
    // Last 4 calendar weeks (Mon start); each bucket uses the newest snapshot saved in that week.
    const now = new Date();
    const day = now.getUTCDay() || 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
    return [3, 2, 1, 0].map((back, i) => {
        const d = new Date(monday);
        d.setUTCDate(d.getUTCDate() - back * 7);
        const key = d.toISOString().slice(0, 10);
        const snap = history.find((h) => h?.weekStart === key && h?.share);
        return { label: `W${i + 1}`, key, share: snap?.share || null };
    });
}

function InsightsOverview() {
    const navigate = useNavigate();
    const cached = getPageCache<any>('ai-insights');
    const [data, setData] = useState<any>(cached ?? null);
    const [loaded, setLoaded] = useState(Boolean(cached));
    const [busy, setBusy] = useState(false);
    const { refresh: refreshCredits } = useCredits();
    const [err, setErr] = useState('');
    const [viewing, setViewing] = useState<any>(null);
    const [showAll, setShowAll] = useState(false);
    const [progress, setProgress] = useState('');
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        apiGet('/api/ai/insights')
            .then(setData)
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    useEffect(() => {
        if (data) setPageCache('ai-insights', data);
    }, [data]);

    const deleteCheck = async (createdAt: string) => {
        if (!window.confirm('Delete this check? This cannot be undone.')) return;
        try {
            setViewing(null);
            setData(await apiDelete(`/api/ai/insights/history?createdAt=${encodeURIComponent(createdAt)}`));
        } catch (e: any) {
            setErr(e?.message || 'Could not delete the check');
        }
    };

    const markAction = async (id: string, status: 'done' | 'dismissed' | 'reset') => {
        try {
            setData(await apiPost('/api/ai/insights/action', { id, status }));
        } catch (e: any) {
            setErr(e?.message || 'Could not update the action');
        }
    };

    const exportPdf = async () => {
        setExporting(true);
        try {
            await downloadElementAsPdf('insights-content', `ai-insights-${new Date().toISOString().slice(0, 10)}`);
        } catch (e: any) {
            setErr(e?.message || 'PDF export failed');
        } finally {
            setExporting(false);
        }
    };

    const refresh = async () => {
        // One refresh per billing month: the server checks that and takes the credits when the check starts.
        setBusy(true);
        setErr('');
        setProgress('Planning keywords…');
        try {
            setViewing(null);
            // One short request per keyword (in parallel) so each stays under the gateway time limit.
            const plan = await apiPost('/api/ai/insights/plan', {});
            const keywords: string[] = plan?.keywords || [];
            const errors: string[] = [];
            let finished = 0;
            setProgress(`Checking keyword 0 of ${keywords.length}…`);
            const withRetry = async (fn: () => Promise<any>) => {
                try {
                    return await fn();
                } catch {
                    return fn();
                }
            };
            const [packs, trendRows] = await Promise.all([
                Promise.all(
                    keywords.map((keyword) =>
                        withRetry(() => apiPost('/api/ai/insights/pack', { keyword }))
                            .then((r: any) => {
                                setProgress(`Checking keyword ${++finished} of ${keywords.length}…`);
                                return (r?.top3 || []) as any[];
                            })
                            .catch((e: any) => {
                                errors.push(e?.message || 'failed');
                                setProgress(`Checking keyword ${++finished} of ${keywords.length}…`);
                                return [] as any[];
                            })
                    )
                ),
                apiPost('/api/ai/insights/trends', {})
                    .then((r: any) => r?.trendRows || [])
                    .catch(() => [])
            ]);
            if (!packs.some((p) => p.length)) {
                throw new Error(`Google Maps lookup failed: ${errors[0] || 'no results returned'}`);
            }
            setProgress('Writing your recommendation…');
            setData(await apiPost('/api/ai/insights/finish', { packs, trendRows, errors }));
        } catch (e: any) {
            const apiErr = e as ApiError;
            if (apiErr?.code === 'insufficient_credits') {
                setErr(creditErrorMessage(apiErr));
            } else {
                setErr(apiErr?.message || 'Could not refresh insights');
            }
        } finally {
            setBusy(false);
            setProgress('');
            refreshCredits();
        }
    };

    const fmtResetDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
    const coolingDown = Boolean(data?.nextCheckAt && new Date(data.nextCheckAt).getTime() > Date.now());

    if (!loaded) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    const actions: any[] = data?.actions || [];
    const visibleActions = showAll ? actions : actions.slice(0, 3);
    const changes: any[] = data?.changes || [];
    const moves = data?.trackerMoves;
    const latestSaved = data?.latest;
    const latest = viewing || latestSaved;
    const pastChecks: any[] = (data?.history || []).filter((h: any) => h?.share);
    const buckets = weekLabelBuckets(data?.history || []);
    const hasChart = buckets.some((b) => b.share);
    const names = latest?.share || buckets.slice().reverse().find((b) => b.share)?.share;

    return (
        <div id="insights-content" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Prioritized Actions */}
                <div className="lg:col-span-2 rounded-2xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-[#0F172A]">Prioritized Actions</h3>
                        <span className="px-2.5 py-1 rounded-md bg-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            High impact
                        </span>
                    </div>
                    {actions.length > 3 && (
                        <button
                            type="button"
                            onClick={() => setShowAll((v) => !v)}
                            className="mb-3 text-xs font-bold text-[var(--brand-primary)] hover:underline cursor-pointer"
                        >
                            {showAll ? 'Show top 3' : `View all (${actions.length})`}
                        </button>
                    )}
                    {data?.hiddenActions > 0 && (
                        <p className="mb-3 text-[11px] text-gray-400">{data.hiddenActions} hidden (done or dismissed). They return automatically if still relevant.</p>
                    )}
                    {actions.length ? (
                        <ul className="space-y-3">
                            {visibleActions.map((a) => {
                                const Icon = ACTION_ICONS[a.icon] || Lightbulb;
                                return (
                                    <li key={a.id} className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] p-4">
                                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ACTION_TONES[a.icon] || ACTION_TONES.profile}`}>
                                            <Icon className="w-4 h-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-[#0F172A]">{a.title}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
                                            <div className="flex flex-wrap items-center gap-3 mt-2">
                                                <Link to={a.to} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)] hover:underline">
                                                    {a.cta} <ArrowUpRight className="w-3 h-3" />
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => markAction(a.id, 'done')}
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-emerald-600 cursor-pointer"
                                                >
                                                    <Check className="w-3 h-3" /> Done
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => markAction(a.id, 'dismissed')}
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-red-500 cursor-pointer"
                                                >
                                                    <X className="w-3 h-3" /> Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500">{data ? 'Nothing urgent right now. Your profile is in good shape.' : 'Loading…'}</p>
                    )}
                </div>

                {/* (view all / restore handled inside the actions card above) */}
                {/* Growth Strategy */}
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 flex flex-col">
                    <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-[var(--brand-primary)]" />
                        Growth Strategy
                    </h3>
                    {latest ? (
                        <>
                            <div className="rounded-xl bg-[#0F172A] p-4 text-white">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-2">AI Recommendation</div>
                                <p className="text-xs leading-relaxed">&ldquo;{latest.recommendation}&rdquo;</p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/posts')}
                                    className="mt-3 w-full py-2 rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-bold cursor-pointer"
                                >
                                    Apply Optimization
                                </button>
                            </div>
                            {latest.opportunities?.length > 0 && (
                                <div className="mt-4">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Market Opportunities</div>
                                    <ul className="space-y-2">
                                        {latest.opportunities.map((o: string, i: number) => (
                                            <li key={i} className="flex gap-2 text-xs text-gray-700">
                                                <TrendingUp className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                                                {o}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-start justify-center gap-3">
                            <p className="text-xs text-gray-500">
                                Get an AI growth recommendation and live market opportunities based on your keywords and local competitors.
                            </p>
                            <p className="text-[11px] text-gray-400">
                                It works best with a category on your <Link to="/profile" className="font-semibold text-[var(--brand-primary)] hover:underline">business profile</Link> and a few{' '}
                                <Link to="/visibility-tracker" className="font-semibold text-[var(--brand-primary)] hover:underline">tracked keywords</Link>.
                            </p>
                            <button
                                type="button"
                                onClick={refresh}
                                disabled={busy || coolingDown}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-bold cursor-pointer disabled:opacity-70"
                            >
                                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {busy ? progress || 'Analysing market…' : 'Generate strategy'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {(changes.length > 0 || moves?.total > 0) && (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h3 className="text-base font-bold text-[#0F172A]">What changed since last check</h3>
                        {data?.since && (
                            <span className="text-[11px] text-gray-400">
                                vs {new Date(data.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {changes.map((c: any) => {
                            const good = c.delta === 0 ? null : c.delta > 0 === c.goodWhenUp;
                            return (
                                <div key={c.label} className="rounded-xl border border-[#E2E8F0] p-3">
                                    <div className="text-[11px] text-gray-500">{c.label}</div>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className="text-xl font-black text-[#0F172A]">
                                            {c.to}
                                            {c.unit}
                                        </span>
                                        {c.delta !== 0 ? (
                                            <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {c.delta > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                                                {Math.abs(c.delta)}
                                                {c.unit}
                                            </span>
                                        ) : (
                                            <span className="text-xs font-semibold text-gray-400">No change</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {moves?.total > 0 && (
                            <div className="rounded-xl border border-[#E2E8F0] p-3">
                                <div className="text-[11px] text-gray-500">Tracked keywords (Visibility Tracker)</div>
                                <div className="mt-1 flex items-center gap-3 text-sm font-bold">
                                    <span className="inline-flex items-center gap-0.5 text-emerald-600">
                                        <ArrowUp className="w-3 h-3" strokeWidth={3} /> {moves.up} up
                                    </span>
                                    <span className="inline-flex items-center gap-0.5 text-red-500">
                                        <ArrowDown className="w-3 h-3" strokeWidth={3} /> {moves.down} down
                                    </span>
                                    <span className="text-xs font-semibold text-gray-400">of {moves.total}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {err && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="font-bold">The Map Pack check could not finish</p>
                    <p className="mt-0.5 text-xs">{err}</p>
                </div>
            )}

            {/* How it works */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                    ['1', 'Run the check', 'We search Google Maps for your 5 main keywords from your business location.'],
                    ['2', 'See who holds the top 3', 'The Map Pack is the 3 businesses Google shows first. We count which spots are yours and which are competitors’.'],
                    ['3', 'Repeat weekly', 'Each run saves a snapshot. After a few weeks the chart shows whether you are gaining or losing ground.']
                ].map(([n, t, d]) => (
                    <div key={n} className="flex gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3.5">
                        <span className="w-6 h-6 rounded-full bg-[var(--brand-primary)] text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
                        <div>
                            <div className="text-xs font-bold text-[#0F172A]">{t}</div>
                            <p className="text-[11px] text-gray-500 mt-0.5">{d}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Visibility Share vs Competitors */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-[#0F172A]">Visibility Share vs. Competitors</h3>
                        <p className="text-[11px] text-gray-500">
                            Share of the Google Map Pack (top 3 spots) held by you and your two strongest competitors.
                        </p>
                        {latestSaved?.createdAt && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                Last checked{' '}
                                {new Date(latestSaved.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            {[
                                ['You', 'bg-[var(--brand-primary)]'],
                                [names?.compA?.name || 'Competitor A', 'bg-[#BEC6DB]'],
                                [names?.compB?.name || 'Competitor B', 'bg-[#4B5563]']
                            ].map(([label, dot]) => (
                                <span key={label} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-[10px] font-bold text-slate-600 max-w-[150px]">
                                    <span className={`w-2 h-2 rounded-sm shrink-0 ${dot}`} />
                                    <span className="truncate">{label}</span>
                                </span>
                            ))}
                        </div>
                        {latest && (
                            <button
                                type="button"
                                onClick={exportPdf}
                                disabled={exporting}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-70"
                            >
                                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Export PDF
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={busy || coolingDown}
                            title={coolingDown ? `Refreshed this month. You can refresh again after ${fmtResetDay(data?.nextCheckAt)}.` : undefined}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F172A] text-white text-[11px] font-bold hover:bg-[#1E293B] cursor-pointer disabled:opacity-70"
                        >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {busy
                                ? progress || 'Checking Google Maps…'
                                : coolingDown
                                  ? `Next refresh ${fmtResetDay(data?.nextCheckAt)}`
                                  : hasChart ? 'Refresh' : 'Run Map Pack check'}
                        </button>
                    </div>
                </div>
                <div className="relative flex gap-3">
                    <div className="flex flex-col justify-between h-56 text-[10px] text-gray-400 pt-0.5 pb-6">
                        <span>100%</span>
                        <span>50%</span>
                        <span>0%</span>
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-6 items-end h-56 border-b border-[#E2E8F0]">
                        {buckets.map((b) => (
                            <div key={b.key} className="flex flex-col items-center justify-end h-full">
                                <div className="w-14 sm:w-20 h-[calc(100%-1.5rem)] flex flex-col justify-end">
                                    {b.share ? (
                                        <>
                                            {[
                                                [b.share.compB, 'bg-[#4B5563] text-white rounded-t-sm'],
                                                [b.share.compA, 'bg-[#BEC6DB] text-slate-700'],
                                                [{ name: 'You', pct: b.share.you }, 'bg-[var(--brand-primary)] text-white']
                                            ].map(([seg, cls]: any, i) => (
                                                <div
                                                    key={i}
                                                    className={`flex items-center justify-center text-[10px] font-bold overflow-hidden ${cls}`}
                                                    style={{ height: `${seg?.pct || 0}%` }}
                                                    title={`${seg?.name}: ${seg?.pct}%`}
                                                >
                                                    {(seg?.pct || 0) >= 12 ? `${seg.pct}%` : ''}
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <div className="h-full rounded-t-sm border border-dashed border-[#E2E8F0]" />
                                    )}
                                </div>
                                <span className="text-[10px] text-gray-500 mt-1.5 h-4">{b.label === 'W4' ? 'This week' : `${4 - Number(b.label.slice(1))} wk ago`}</span>
                            </div>
                        ))}
                    </div>
                    {!hasChart && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="max-w-sm text-center text-xs text-gray-600 bg-white/90 border border-[#E2E8F0] rounded-xl px-4 py-3 shadow-sm">
                                No data yet. Click <strong>Run Map Pack check</strong> to see who holds the top 3 spots for your keywords.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {latest?.share && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Who is in the Map Pack */}
                    <div className="lg:col-span-2 rounded-2xl border border-[#E2E8F0] bg-white p-5">
                        <h3 className="text-base font-bold text-[#0F172A]">Who holds the top 3 for your keywords</h3>
                        <p className="text-[11px] text-gray-500 mb-3">
                            Checked {new Date(latest.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} from your business location.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
                                        <th className="pb-2 font-bold">Keyword</th>
                                        <th className="pb-2 font-bold">#1</th>
                                        <th className="pb-2 font-bold">#2</th>
                                        <th className="pb-2 font-bold">#3</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E2E8F0]">
                                    {(latest.packs || []).map((p: any) => (
                                        <tr key={p.keyword} className="align-top">
                                            <td className="py-2.5 pr-3 font-semibold text-[#0F172A]">{p.keyword}</td>
                                            {[0, 1, 2].map((i) => {
                                                const r = p.top3?.[i];
                                                return (
                                                    <td key={i} className="py-2.5 pr-3">
                                                        {r ? (
                                                            <div className={r.isYou ? 'font-bold text-[var(--brand-primary)]' : 'text-gray-700'}>
                                                                {r.isYou ? 'You' : r.name}
                                                                <div className="text-[10px] font-normal text-gray-400">
                                                                    {r.rating ? `${r.rating}★` : ''} {r.reviews ? `· ${r.reviews.toLocaleString()} reviews` : ''}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Problems found */}
                    <div className="rounded-2xl border border-[#E2E8F0] border-t-4 border-t-[var(--brand-primary)] bg-white p-5">
                        <h3 className="text-base font-bold text-[#0F172A] mb-3">What this means for you</h3>
                        <ul className="space-y-2.5">
                            {(latest.problems || []).map((p: string, i: number) => (
                                <li key={i} className="flex gap-2 text-xs text-gray-700">
                                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                                    {p}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Past checks (every run is saved) */}
            {pastChecks.length > 0 && (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[#0F172A]">Past Map Pack checks</h3>
                        <span className="text-[11px] text-gray-400">Latest {Math.min(5, pastChecks.length)} of {pastChecks.length}</span>
                    </div>
                    <ul className="divide-y divide-[#E2E8F0]">
                        {pastChecks.slice(0, 5).map((h: any) => {
                            const isShown = h.createdAt === latest?.createdAt;
                            return (
                                <li key={h.createdAt} className={`flex items-center ${isShown ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-[#F8FAFC]'}`}>
                                    <button
                                        type="button"
                                        onClick={() => setViewing(h.createdAt === latestSaved?.createdAt ? null : h)}
                                        className="flex-1 min-w-0 text-left px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs cursor-pointer"
                                    >
                                        <span className="font-bold text-[#0F172A]">
                                            {new Date(h.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="text-gray-600">
                                            You hold {h.youSlots ?? 0} of {h.totalSlots ?? 0} top-3 spots ({h.share?.you ?? 0}% share)
                                        </span>
                                        <span className={`font-bold ${isShown ? 'text-[#0F172A]' : 'text-gray-400'}`}>
                                            {isShown ? 'Viewing' : 'View →'}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        title="Delete this check"
                                        aria-label="Delete this check"
                                        onClick={() => deleteCheck(h.createdAt)}
                                        className="p-2.5 mr-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function ReportGenerator() {
    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">AI Insights</h1>
                <p className="text-gray-500 text-sm mt-1">Data-driven analysis and actionable recommendations to dominate your local market.</p>
            </div>
            <InsightsOverview />
        </div>
    );
}
