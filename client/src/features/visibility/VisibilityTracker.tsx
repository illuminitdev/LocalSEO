import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Plus, RefreshCw, Sparkles, Trash2, AlertCircle, CheckCircle2, X, ArrowUp, ArrowDown } from 'lucide-react';
import { apiGet, apiPost, cn } from '../../shared/utils';

type Point = { date: string; rank: number };
type TrackedKeyword = {
    keyword: string;
    volume: number | null;
    history: Point[];
    top: string[];
    addedAt: string;
    checkedAt?: string;
};
type Suggestion = { keyword: string; volume: number | null };
type TrackerInfo = {
    keywords: TrackedKeyword[];
    configured: boolean;
    business: { name: string; category: string; city: string; connected: boolean };
    max: number;
};

const NOT_RANKED = 21;
const PAGE_SIZE = 10;
const CHECK_BATCH = 4;
const DAY = 86_400_000;
const PERIODS = [
    { days: 7, label: 'Last 7 Days' },
    { days: 14, label: 'Last 14 Days' },
    { days: 30, label: 'Last 30 Days' },
    { days: 90, label: 'Last 90 Days' }
];

// Share of clicks by Google Maps position; used to turn ranks into a single visibility %.
const CTR = [0.3, 0.17, 0.11, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015];
const ctrFor = (rank: number) => (rank >= 1 && rank <= 10 ? CTR[rank - 1] : rank <= 20 ? 0.008 : 0);

const current = (k: TrackedKeyword) => (k.history.length ? k.history[k.history.length - 1].rank : null);

/** Rank at the start of the window: last check on/before the cutoff, else the earliest check before the latest one. */
function previous(k: TrackedKeyword, days: number) {
    if (k.history.length < 2) return null;
    const cutoff = Date.now() - days * DAY;
    const latest = k.history.length - 1;
    let found: Point | null = null;
    for (let i = 0; i < latest; i++) if (new Date(k.history[i].date).getTime() <= cutoff) found = k.history[i];
    return (found ?? k.history[0]).rank;
}

function visibility(items: Array<{ rank: number | null; volume: number | null }>) {
    const rows = items.filter((i) => i.rank != null);
    if (!rows.length) return null;
    let got = 0;
    let max = 0;
    for (const r of rows) {
        const w = Math.max(1, r.volume ?? 1);
        got += w * ctrFor(r.rank as number);
        max += w * CTR[0];
    }
    return max ? (got / max) * 100 : 0;
}

const rankLabel = (rank: number | null) => (rank == null ? '—' : rank >= NOT_RANKED ? '>20' : String(rank));
const fmtVolume = (v: number | null) => (v == null ? '—' : v.toLocaleString());

function Delta({ value, suffix = '' }: { value: number | null; suffix?: string }) {
    if (value == null || Math.abs(value) < 0.05) return null;
    const up = value > 0;
    return (
        <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold', up ? 'text-emerald-600' : 'text-red-500')}>
            {up ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
            {Math.abs(value).toFixed(1)}
            {suffix}
        </span>
    );
}

function ChangeChip({ change, rank }: { change: number | null; rank: number | null }) {
    if (rank == null) return <span className="text-xs text-slate-400">—</span>;
    if (change == null || change === 0) {
        return (
            <span
                className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold"
                title={change == null ? 'First check — no earlier rank to compare' : 'No change in this period'}
            >
                {change == null ? 'New · ' : 'Same · '}
                {rankLabel(rank)}
            </span>
        );
    }
    const up = change > 0;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold',
                up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
            )}
        >
            {up ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
            {Math.abs(change)}
        </span>
    );
}

function Sparkline({ history }: { history: Point[] }) {
    const since = Date.now() - 30 * DAY;
    const pts = history.filter((p) => new Date(p.date).getTime() >= since);
    const w = 84;
    const h = 24;
    if (pts.length < 2) {
        return (
            <svg width={w} height={h} aria-hidden>
                <line x1="1" y1={h / 2} x2={w - 1} y2={h / 2} stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
        );
    }
    const ranks = pts.map((p) => p.rank);
    const lo = Math.min(...ranks);
    const hi = Math.max(...ranks);
    const pad = 3;
    // Points are spaced evenly so every check is visible; the scale fits the keyword's own range.
    const coords = pts.map((p, i) => {
        const cx = 1 + (i / (pts.length - 1)) * (w - 2);
        const cy = hi === lo ? h / 2 : pad + ((p.rank - lo) / (hi - lo)) * (h - pad * 2);
        return [cx, cy] as const;
    });
    const clampY = (v: number) => Math.max(1, Math.min(h - 1, v));
    let line = `M${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i - 1] ?? coords[i];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[i + 2] ?? p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
        line += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const delta = pts[0].rank - pts[pts.length - 1].rank;
    const stroke = delta > 0 ? '#10B981' : delta < 0 ? '#EF4444' : '#94A3B8';
    return (
        <svg width={w} height={h} aria-hidden>
            <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function Triple({ items }: { items: Array<{ n: number; label: string; tone: string }> }) {
    return (
        <div className="flex items-stretch divide-x divide-slate-200">
            {items.map((m, i) => (
                <div key={m.label} className={cn('flex-1', i > 0 && 'pl-4', i < items.length - 1 && 'pr-4')}>
                    <div className={cn('text-3xl font-black', m.tone)}>{m.n}</div>
                    <div className="text-xs text-slate-500 font-medium">{m.label}</div>
                </div>
            ))}
        </div>
    );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{label}</div>
            {children}
        </div>
    );
}

export default function VisibilityTracker() {
    const [info, setInfo] = useState<TrackerInfo | null>(null);
    const [keywords, setKeywords] = useState<TrackedKeyword[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [typedSuggestions, setTypedSuggestions] = useState<Suggestion[]>([]);
    const [typedLoading, setTypedLoading] = useState(false);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const trackBoxRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'you' | 'competitors'>('you');
    const [days, setDays] = useState(7);
    const [page, setPage] = useState(0);
    const [input, setInput] = useState('');
    const [adding, setAdding] = useState(false);
    const [checking, setChecking] = useState({ done: 0, total: 0 });
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const busy = checking.total > 0;

    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(''), 5000);
        return () => clearTimeout(t);
    }, [notice]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data: TrackerInfo = await apiGet('/api/visibility-tracker');
                if (cancelled) return;
                setInfo(data);
                setKeywords(data.keywords || []);
            } catch (err: any) {
                if (!cancelled) setError(err?.message || 'Could not load the visibility tracker.');
            } finally {
                if (!cancelled) setLoading(false);
            }
            apiGet('/api/visibility-tracker/suggestions')
                .then((d) => !cancelled && setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : []))
                .catch(() => {});
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Suggestions stay hidden until the keyword box is clicked; clicking elsewhere or pressing Esc closes them.
    useEffect(() => {
        if (!suggestOpen) return;
        const onDown = (e: MouseEvent) => {
            if (trackBoxRef.current && !trackBoxRef.current.contains(e.target as Node)) setSuggestOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSuggestOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [suggestOpen]);

    // Suggestions for the keyword currently being typed (the text after the last comma).
    useEffect(() => {
        const q = input.split(/[,\n]/).pop()?.trim() || '';
        if (q.length < 3) {
            setTypedSuggestions([]);
            return;
        }
        let cancelled = false;
        setTypedLoading(true);
        const t = setTimeout(() => {
            apiGet(`/api/visibility-tracker/suggestions?q=${encodeURIComponent(q)}`)
                .then((d) => !cancelled && setTypedSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : []))
                .catch(() => !cancelled && setTypedSuggestions([]))
                .finally(() => !cancelled && setTypedLoading(false));
        }, 500);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [input]);

    const refreshSuggestions = () =>
        apiGet('/api/visibility-tracker/suggestions')
            .then((d) => setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : []))
            .catch(() => {});

    const runChecks = async (targets: string[]) => {
        if (!targets.length) return;
        setError('');
        setChecking({ done: 0, total: targets.length });
        let failed = 0;
        try {
            for (let i = 0; i < targets.length; i += CHECK_BATCH) {
                const batch = targets.slice(i, i + CHECK_BATCH);
                const data = await apiPost('/api/visibility-tracker/check', { keywords: batch });
                setKeywords(data.keywords || []);
                failed += Array.isArray(data.failed) ? data.failed.length : 0;
                setChecking({ done: Math.min(targets.length, i + batch.length), total: targets.length });
            }
            setNotice(failed ? `Rank updated, ${failed} keyword${failed > 1 ? 's' : ''} could not be checked.` : 'Rank updated');
        } catch (err: any) {
            setError(err?.message || 'Rank check failed.');
        } finally {
            setChecking({ done: 0, total: 0 });
        }
    };

    const addKeywords = async (list: string[]) => {
        const clean = list.map((k) => k.trim()).filter(Boolean);
        if (!clean.length) return;
        setAdding(true);
        setError('');
        setNotice('');
        try {
            const before = new Set(keywords.map((k) => k.keyword));
            const data = await apiPost('/api/visibility-tracker/keywords', { keywords: clean });
            const next: TrackedKeyword[] = data.keywords || [];
            setKeywords(next);
            setInput('');
            setSuggestions((s) => s.filter((x) => !clean.map((c) => c.toLowerCase()).includes(x.keyword)));
            setPage(0);
            refreshSuggestions();
            const fresh = next.filter((k) => !before.has(k.keyword)).map((k) => k.keyword);
            if (info?.configured && fresh.length) await runChecks(fresh);
            else if (fresh.length) setNotice('Keywords added. Live rank checks are not configured yet.');
        } catch (err: any) {
            setError(err?.message || 'Could not add keywords.');
        } finally {
            setAdding(false);
        }
    };

    const removeKeyword = async (keyword: string) => {
        try {
            const data = await apiPost('/api/visibility-tracker/remove', { keyword });
            setKeywords(data.keywords || []);
            refreshSuggestions();
        } catch (err: any) {
            setError(err?.message || 'Could not remove keyword.');
        }
    };

    const rows = useMemo(
        () =>
            keywords.map((k) => {
                const now = current(k);
                const prev = previous(k, days);
                return { k, now, prev, change: now != null && prev != null ? prev - now : null };
            }),
        [keywords, days]
    );

    const stats = useMemo(() => {
        const checked = rows.filter((r) => r.now != null);
        const ranked = checked.filter((r) => (r.now as number) < NOT_RANKED);
        const avg = ranked.length ? ranked.reduce((a, r) => a + (r.now as number), 0) / ranked.length : null;
        const prevRanked = rows.filter((r) => r.prev != null && r.now != null && (r.prev as number) < NOT_RANKED && (r.now as number) < NOT_RANKED);
        const avgNow = prevRanked.length ? prevRanked.reduce((a, r) => a + (r.now as number), 0) / prevRanked.length : null;
        const avgPrev = prevRanked.length ? prevRanked.reduce((a, r) => a + (r.prev as number), 0) / prevRanked.length : null;
        const vis = visibility(rows.map((r) => ({ rank: r.now, volume: r.k.volume })));
        const visPrev = visibility(rows.filter((r) => r.prev != null).map((r) => ({ rank: r.prev, volume: r.k.volume })));
        const visNow = visibility(rows.filter((r) => r.prev != null).map((r) => ({ rank: r.now, volume: r.k.volume })));
        return {
            avg,
            avgDelta: avgNow != null && avgPrev != null ? avgPrev - avgNow : null,
            vis,
            visDelta: visNow != null && visPrev != null ? visNow - visPrev : null,
            up: checked.filter((r) => (r.change ?? 0) > 0).length,
            down: checked.filter((r) => (r.change ?? 0) < 0).length,
            same: checked.filter((r) => (r.change ?? 0) === 0).length,
            pending: rows.length - checked.length,
            leading: checked.filter((r) => r.now === 1).length,
            inPack: checked.filter((r) => (r.now as number) >= 2 && (r.now as number) <= 3).length,
            behind: checked.filter((r) => (r.now as number) > 3).length,
            avgGap: ranked.length ? ranked.reduce((a, r) => a + ((r.now as number) - 1), 0) / ranked.length : null,
            packShare: checked.length ? (checked.filter((r) => (r.now as number) <= 3).length / checked.length) * 100 : null
        };
    }, [rows]);

    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

    const exportCsv = () => {
        const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
        const lines = [
            ['Keyword', 'Current rank', `Change (${days}d)`, 'Search volume', 'Top competitors', 'Last checked'].map(esc).join(','),
            ...rows.map((r) =>
                [
                    r.k.keyword,
                    rankLabel(r.now),
                    r.change ?? '',
                    r.k.volume ?? '',
                    r.k.top.join(' | '),
                    r.k.checkedAt ? r.k.checkedAt.slice(0, 10) : ''
                ]
                    .map(esc)
                    .join(',')
            )
        ];
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `visibility-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading tracker…
            </div>
        );
    }

    const industry = [info?.business.category, info?.business.city].filter(Boolean).join(' · ');

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Visibility Tracker</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Monitor your local search performance across key terms{industry ? ` for ${industry}` : ''}.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-[#E2E8F0] bg-slate-100 p-0.5 text-xs font-semibold">
                        {(['you', 'competitors'] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={cn(
                                    'px-2.5 py-1 rounded-md transition',
                                    view === v ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                )}
                            >
                                {v === 'you' ? 'Your Rank' : 'Vs Competitors'}
                            </button>
                        ))}
                    </div>
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                        aria-label="Comparison period"
                    >
                        {PERIODS.map((p) => (
                            <option key={p.days} value={p.days}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                    {info?.configured && keywords.length > 0 && (
                        <button
                            onClick={() => runChecks(keywords.map((k) => k.keyword))}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', busy && 'animate-spin')} />
                            {busy ? `Checking ${checking.done}/${checking.total}` : 'Refresh ranks'}
                        </button>
                    )}
                    <button
                        onClick={exportCsv}
                        disabled={!rows.length}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        <Download className="w-3.5 h-3.5" /> Export
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </div>
            )}
            {notice && (
                <div
                    role="status"
                    className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-3 text-sm font-semibold text-white shadow-lg"
                >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {notice}
                </div>
            )}
            {info && !info.business.connected && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    Save your business profile first so we can suggest keywords for your industry and check ranks at your location.
                </div>
            )}
            {info && !info.configured && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    Live rank checks are not set up on this server (DataForSEO credentials missing). You can add keywords, but ranks will stay empty.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {view === 'you' ? (
                    <>
                        <StatCard label="Average Position">
                            <div className="flex items-end gap-3">
                                <span className="text-4xl font-black tracking-tight text-[#0F172A]">{stats.avg != null ? stats.avg.toFixed(1) : '—'}</span>
                                <Delta value={stats.avgDelta} />
                            </div>
                        </StatCard>
                        <StatCard label="Visibility Score">
                            <div className="flex items-end gap-3">
                                <span className="text-4xl font-black tracking-tight text-[#0F172A]">
                                    {stats.vis != null ? `${Math.round(stats.vis)}%` : '—'}
                                </span>
                                <Delta value={stats.visDelta} suffix="%" />
                            </div>
                        </StatCard>
                        <StatCard label={`Keyword Movement (${days}d)`}>
                            <Triple
                                items={[
                                    { n: stats.up, label: 'Up', tone: 'text-emerald-500' },
                                    { n: stats.down, label: 'Down', tone: 'text-red-500' },
                                    { n: stats.same, label: 'Static', tone: 'text-[#0F172A]' }
                                ]}
                            />
                            {stats.pending > 0 && <div className="text-[11px] text-slate-400 mt-2">{stats.pending} awaiting first check</div>}
                        </StatCard>
                    </>
                ) : (
                    <>
                        <StatCard label="Avg Gap to #1">
                            <span className="text-4xl font-black tracking-tight text-[#0F172A]">
                                {stats.avgGap != null ? `${stats.avgGap.toFixed(1)}` : '—'}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">places behind the leader</span>
                        </StatCard>
                        <StatCard label="Map Pack Share">
                            <span className="text-4xl font-black tracking-tight text-[#0F172A]">
                                {stats.packShare != null ? `${Math.round(stats.packShare)}%` : '—'}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">of keywords in the top 3</span>
                        </StatCard>
                        <StatCard label="Competitive Position">
                            <Triple
                                items={[
                                    { n: stats.leading, label: 'Leading', tone: 'text-emerald-500' },
                                    { n: stats.inPack, label: 'Top 3', tone: 'text-blue-500' },
                                    { n: stats.behind, label: 'Behind', tone: 'text-red-500' }
                                ]}
                            />
                            {stats.pending > 0 && <div className="text-[11px] text-slate-400 mt-2">{stats.pending} awaiting first check</div>}
                        </StatCard>
                    </>
                )}
            </div>

            <div ref={trackBoxRef} className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm p-4">
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        addKeywords(input.split(/[,\n]/));
                    }}
                >
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onFocus={() => setSuggestOpen(true)}
                        onClick={() => setSuggestOpen(true)}
                        placeholder="Add keywords to track (comma separated), e.g. emergency plumber"
                        className="flex-1 min-w-[220px] rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                        type="submit"
                        disabled={adding || busy || !input.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Track
                    </button>
                </form>
                {suggestOpen && (typedLoading || typedSuggestions.length > 0) && (
                    <div className="mt-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                            Suggestions for “{input.split(/[,\n]/).pop()?.trim()}”
                            {typedLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {typedSuggestions.map((sg) => (
                                <button
                                    key={sg.keyword}
                                    disabled={adding || busy}
                                    onClick={() => addKeywords([sg.keyword])}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-primary)]/40 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    <Plus className="w-3 h-3" />
                                    {sg.keyword}
                                    {sg.volume != null && <span className="text-slate-400">{sg.volume.toLocaleString()}/mo</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {suggestOpen && suggestions.length > 0 && (
                    <div className="mt-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <Sparkles className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                                Suggested for {info?.business.category || 'your industry'}
                            </div>
                            <div className="flex items-center gap-3">
                            <button
                                disabled={adding || busy}
                                onClick={() => addKeywords(suggestions.slice(0, 10).map((s) => s.keyword))}
                                className="text-xs font-bold text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                            >
                                Track top 10
                            </button>
                            <button
                                type="button"
                                onClick={() => setSuggestOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                                aria-label="Close suggestions"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {suggestions.map((s) => (
                                <button
                                    key={s.keyword}
                                    disabled={adding || busy}
                                    onClick={() => addKeywords([s.keyword])}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-[var(--brand-primary)] hover:bg-white disabled:opacity-50"
                                >
                                    <Plus className="w-3 h-3" />
                                    {s.keyword}
                                    {s.volume != null && <span className="text-slate-400">{s.volume.toLocaleString()}/mo</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-[#E2E8F0] bg-slate-50/60">
                                <th className="px-4 py-2 font-semibold">Keyword</th>
                                <th className="px-3 py-2 font-semibold">{view === 'you' ? 'Current Rank' : 'Your Rank'}</th>
                                <th className="px-3 py-2 font-semibold">Change ({days}d)</th>
                                {view === 'you' ? (
                                    <th className="px-3 py-2 font-semibold">Search Volume</th>
                                ) : (
                                    <>
                                        <th className="px-3 py-2 font-semibold">Leader (#1)</th>
                                        <th className="px-3 py-2 font-semibold">Gap to #1</th>
                                    </>
                                )}
                                <th className="px-3 py-2 font-semibold">Trend (30d)</th>
                                <th className="px-3 py-3 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(({ k, now, change }) => (
                                <tr key={k.keyword} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                    <td className="px-5 py-3 font-semibold text-[#0F172A]">{k.keyword}</td>
                                    <td className="px-3 py-2 font-bold text-[#0F172A]">{rankLabel(now)}</td>
                                    <td className="px-3 py-2">
                                        <ChangeChip change={change} rank={now} />
                                    </td>
                                    {view === 'you' ? (
                                        <td className="px-3 py-2 text-slate-600">{fmtVolume(k.volume)}</td>
                                    ) : (
                                        <>
                                            <td className="px-3 py-2 text-xs text-slate-600">{k.top[0] || '—'}</td>
                                            <td className="px-3 py-2">
                                                {now == null ? (
                                                    <span className="text-xs text-slate-400">—</span>
                                                ) : now === 1 ? (
                                                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600">Leading</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-500">
                                                        <ArrowDown className="w-3 h-3" strokeWidth={3} />
                                                        {now >= NOT_RANKED ? '20+' : now - 1}
                                                    </span>
                                                )}
                                            </td>
                                        </>
                                    )}
                                    <td className="px-3 py-2">
                                        <Sparkline history={k.history} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <button
                                            onClick={() => removeKeyword(k.keyword)}
                                            className="text-slate-300 hover:text-red-500"
                                            title="Stop tracking"
                                            aria-label={`Stop tracking ${k.keyword}`}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!visible.length && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                                        No keywords tracked yet. Add your own above or pick from the suggestions for your industry.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between border-t border-[#E2E8F0] px-4 py-2 text-[11px] text-slate-500">
                    <span>
                        {rows.length
                            ? `Showing ${safePage * PAGE_SIZE + 1} to ${Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of ${rows.length} keywords`
                            : 'Showing 0 keywords'}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(safePage - 1)}
                            disabled={safePage === 0}
                            className="rounded border border-[#E2E8F0] px-3 py-1 font-semibold disabled:text-slate-300"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(safePage + 1)}
                            disabled={safePage >= pageCount - 1}
                            className="rounded border border-[#E2E8F0] px-3 py-1 font-semibold text-slate-700 disabled:text-slate-300"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
            <p className="text-[11px] text-slate-400">
                Ranks are live Google Maps positions at your business location (1–20, “&gt;20” = not found). Trends build up each time ranks are refreshed.
            </p>
        </div>
    );
}
