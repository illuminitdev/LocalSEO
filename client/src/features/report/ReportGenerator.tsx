import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    MessageSquareWarning,
    Camera,
    FileText,
    UserCheck,
    TrendingUp,
    RefreshCw,
    Loader2,
    Lightbulb,
    Clock,
    ArrowUpRight,
    ArrowUp,
    ArrowDown,
    Star,
    ExternalLink,
    Check,
    X,
    ThumbsUp,
    ThumbsDown,
    Tag,
    Globe,
    BookMarked,
    Search,
    MapPin
} from 'lucide-react';
import { apiDelete, apiGet, apiPost, type ApiError } from '../../shared/utils';
import { useCredits } from '../../shared/CreditsContext';
import { creditErrorMessage } from '../../shared/creditMessages';
import { downloadElementAsPdf } from '../../shared/downloadElementAsPdf';
import { getPageCache, setPageCache } from '../../shared/pageCache';
import { InfoTip, type InfoText } from '../../shared/InfoTip';
import { InsightsDashboard } from './InsightsDashboard';
import { sharePct } from './insightsData';
import { HistoryButton, HistoryModal, ViewingOldBanner, historyDate } from '../../shared/HistoryPanel';

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
    clock: 'bg-orange-500 text-[var(--brand-primary-foreground)]',
    photo: 'bg-[#0F172A] text-white',
    post: 'bg-blue-50 text-blue-600',
    profile: 'bg-emerald-50 text-emerald-600',
    rank: 'bg-violet-50 text-violet-600',
    gap: 'bg-amber-50 text-amber-600'
};

// Where each AI action area is fixed in the app.
const AREA_LINKS: Record<string, { to: string; cta: string; icon: any; tone: string }> = {
    reviews: { to: '/reviews', cta: 'Open Reviews', icon: Star, tone: 'bg-amber-50 text-amber-600' },
    profile: { to: '/profile', cta: 'Open Profile', icon: UserCheck, tone: 'bg-emerald-50 text-emerald-600' },
    category: { to: '/profile', cta: 'Check category', icon: Tag, tone: 'bg-violet-50 text-violet-600' },
    photos: { to: '/media', cta: 'Add Photos', icon: Camera, tone: 'bg-[#0F172A] text-white' },
    posts: { to: '/posts', cta: 'Create Post', icon: FileText, tone: 'bg-blue-50 text-blue-600' },
    keywords: { to: '/visibility-tracker', cta: 'Track keywords', icon: Search, tone: 'bg-sky-50 text-sky-600' },
    website: { to: '/profile', cta: 'Open Profile', icon: Globe, tone: 'bg-slate-100 text-slate-600' },
    citations: { to: '/citations', cta: 'Open Citations', icon: BookMarked, tone: 'bg-teal-50 text-teal-600' }
};

const PRIORITY_TAGS: Record<string, { label: string; cls: string }> = {
    high: { label: 'High priority', cls: 'bg-rose-50 text-rose-600' },
    medium: { label: 'Medium priority', cls: 'bg-amber-50 text-amber-700' },
    low: { label: 'Low priority', cls: 'bg-slate-100 text-slate-500' }
};

// Server sorts rule actions by weight (60–100); show that as a priority level.
function priorityLevel(weight?: number) {
    if (typeof weight !== 'number') return null;
    return PRIORITY_TAGS[weight >= 85 ? 'high' : weight >= 70 ? 'medium' : 'low'];
}

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// What each part of the report means, shown in the (i) popups.
const INFO: Record<string, InfoText> = {
    summary: {
        title: 'Summary',
        body: [
            'A short AI-written overview of where your business stands in local Google Maps results and the main reason why.',
            'It is written only from the data checked for this report: the top 3 results for your keywords, your reviews, search demand and your profile.'
        ]
    },
    spots: {
        title: 'Top 3 spots you hold',
        body: [
            'For each keyword, Google Maps shows 3 businesses first (the "Map Pack"). We check 5 keywords, so there are up to 15 spots.',
            '"5 / 11" means you appeared in 5 of the 11 spots Google showed. The arrow is the change since your previous report.'
        ]
    },
    share: {
        title: 'Your Map Pack share',
        body: [
            'Your spots as a percentage of all the top 3 spots checked: spots you hold ÷ spots checked.',
            'Higher is better. 100% would mean you are in the top 3 for every keyword.'
        ]
    },
    rivalReviews: {
        title: 'Top competitor reviews',
        body: [
            'The Google review count of the competitor with the most reviews among the businesses in your top 3 results.',
            'Review count is one of the strongest local ranking signals. Green means their count went down, red means their lead grew.'
        ]
    },
    tracked: {
        title: 'Tracked keywords',
        body: [
            'Keywords you track on the Visibility Tracker page, and how many moved up or down in Google Maps since their previous check.',
            'Keywords that are not up or down kept the same rank.'
        ]
    },
    shareChart: {
        title: 'Map Pack share by week',
        body: [
            'Each bar is one week. It splits all the top 3 spots checked between you, your two strongest competitors and everyone else.',
            'A new bar appears each week you refresh the report, so after a few weeks you can see if you are gaining or losing ground.'
        ]
    },
    movement: {
        title: 'Keyword rank movement',
        body: [
            'Your Google Maps rank for each tracked keyword. #1 is the best; 20+ means you were not found in the first 20 results.',
            'Grey dot = the previous check, coloured dot = the latest. Green means you moved up, red means you moved down.'
        ]
    },
    packTable: {
        title: 'Who holds the top 3',
        body: [
            'The 3 businesses Google Maps showed first for each keyword, searched from your business location, with their rating and review count.',
            'Your business is highlighted as "You". Results can differ slightly for customers searching from other places.'
        ]
    },
    competitors: {
        title: 'Competitor analysis',
        body: [
            'The businesses that took the most top 3 spots across your keywords, with their Google category, rating and reviews.',
            'The AI note explains what they have that you lack, based only on this data.'
        ]
    },
    customers: {
        title: 'What your customers say',
        body: [
            'AI reads your recent Google reviews and lists what customers praise, what they complain about and the service words they use.',
            'Service words in reviews help Google match you to those searches, so ask happy customers to mention the service they used.'
        ]
    },
    keywords: {
        title: 'Keyword opportunities',
        body: [
            'How many times a month each keyword is searched on Google, and the change against the same month last year (so seasonal swings are not mistaken for growth).',
            'The AI note explains which keywords to focus on next and why.'
        ]
    },
    plan: {
        title: "This week's plan",
        body: [
            'The single most important change for this week and the steps to do it, written by AI from this report.',
            'The Profile checklist lists quick fixes found by fixed rules (missing hours, unanswered low reviews, photos, posts). Mark them Done or Dismiss to hide them. All actions are in the Recommended Actions card above.'
        ]
    },
};

function Section({ n, title, note, info, children }: { n: number; title: string; note?: string; info?: InfoText; children: ReactNode }) {
    return (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 break-inside-avoid">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black text-[var(--brand-primary)]">{String(n).padStart(2, '0')}</span>
                <h2 className="text-lg font-bold text-[#0F172A]">{title}</h2>
                {info && <InfoTip info={info} />}
            </div>
            {note && <p className="text-[11px] text-gray-500 mb-4">{note}</p>}
            {!note && <div className="mb-3" />}
            {children}
        </section>
    );
}

/** Previous vs latest Google Maps rank per tracked keyword (1 = best). */
function RankMovement({ rows }: { rows: Array<{ keyword: string; rank: number; previous: number | null }> }) {
    const MAX = 21; // 21 = not in the top 20
    const pos = (r: number) => `${((Math.min(r, MAX) - 1) / (MAX - 1)) * 100}%`;
    const label = (r: number) => (r > 20 ? '20+' : `#${r}`);
    return (
        <div>
            <div className="flex justify-between pl-[42%] sm:pl-[36%] pr-24 text-[10px] text-gray-400 mb-1">
                <span>#1 (best)</span>
                <span>#10</span>
                <span>20+</span>
            </div>
            <ul className="space-y-2.5">
                {rows.map((r) => {
                    const prev = r.previous;
                    const delta = prev == null ? 0 : prev - r.rank;
                    const tone = prev == null || delta === 0 ? 'bg-slate-500' : delta > 0 ? 'bg-emerald-500' : 'bg-red-500';
                    const [a, b] = prev == null ? [r.rank, r.rank] : [Math.min(prev, r.rank), Math.max(prev, r.rank)];
                    return (
                        <li key={r.keyword} className="flex items-center gap-3">
                            <span className="w-[40%] sm:w-[34%] text-xs font-semibold text-[#0F172A] truncate" title={r.keyword}>
                                {r.keyword}
                            </span>
                            <div className="relative flex-1 h-5">
                                <div className="absolute inset-x-0 top-1/2 h-px bg-[#E2E8F0]" />
                                {prev != null && delta !== 0 && (
                                    <div
                                        className={`absolute top-1/2 h-1 -translate-y-1/2 rounded ${delta > 0 ? 'bg-emerald-200' : 'bg-red-200'}`}
                                        style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }}
                                    />
                                )}
                                {prev != null && delta !== 0 && (
                                    <span className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300" style={{ left: pos(prev) }} title={`Before: ${label(prev)}`} />
                                )}
                                <span className={`absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${tone}`} style={{ left: pos(r.rank) }} title={`Now: ${label(r.rank)}`} />
                            </div>
                            <span className="w-24 text-right text-xs">
                                {prev == null ? (
                                    <span className="font-semibold text-gray-500">{label(r.rank)} · first check</span>
                                ) : delta === 0 ? (
                                    <span className="font-semibold text-gray-500">{label(r.rank)} · no change</span>
                                ) : (
                                    <span className={`inline-flex items-center gap-0.5 font-bold ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {label(prev)} → {label(r.rank)}
                                        {delta > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                                    </span>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-3 text-[10px] text-gray-400">Grey dot = previous check, coloured dot = latest. Green moved up, red moved down.</p>
        </div>
    );
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
    const [showHistory, setShowHistory] = useState(false);
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

    // Business profile (reviews, rating), Local Search Grid keywords and LLM Visibility: saved data only, no paid calls.
    const [extras, setExtras] = useState<{ business: any; gridKeywords: any[]; llm: any }>({ business: null, gridKeywords: [], llm: null });
    useEffect(() => {
        Promise.all([
            apiGet('/api/business').catch(() => null),
            apiGet('/api/rank/state').catch(() => null),
            apiGet('/api/llm/visibility').catch(() => null)
        ]).then(([biz, rank, llm]) => setExtras({ business: biz, gridKeywords: Array.isArray(rank?.trackedKeywords) ? rank.trackedKeywords : [], llm }));
    }, []);

    const deleteCheck = async (createdAt: string) => {
        if (!window.confirm('Delete this check? This cannot be undone.')) return;
        try {
            setViewing(null);
            setData(await apiDelete(`/api/ai/insights/history?createdAt=${encodeURIComponent(createdAt)}`));
        } catch {
            setErr('The check could not be deleted. Please try again.');
        }
    };

    const markAction = async (id: string, status: 'done' | 'dismissed' | 'reset') => {
        try {
            setData(await apiPost('/api/ai/insights/action', { id, status }));
        } catch {
            setErr('The action could not be updated. Please try again.');
        }
    };

    const exportPdf = async () => {
        setExporting(true);
        try {
            const date = (viewing || data?.latest)?.createdAt || new Date().toISOString();
            await downloadElementAsPdf('insights-content', `ai-insights-report-${date.slice(0, 10)}`);
        } catch {
            setErr('The PDF could not be created. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const refresh = async () => {
        // One refresh per week: the server checks that and takes the credits when the check starts.
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
            if (!packs.some((p) => p.length)) throw new Error('no results');
            setProgress('AI is writing your report…');
            setData(await apiPost('/api/ai/insights/finish', { packs, trendRows, errors }));
        } catch (e: any) {
            const apiErr = e as ApiError;
            if (apiErr?.code === 'insufficient_credits') setErr(creditErrorMessage(apiErr));
            else if (apiErr?.code === 'cooldown') setErr(apiErr.message || 'You can run the next check next week.');
            else setErr('No findings this time. Google Maps returned no results for your keywords. Any credits taken were refunded, so you can try again.');
        } finally {
            setBusy(false);
            setProgress('');
            refreshCredits();
        }
    };

    const fmtResetDay = (iso?: string | null) =>
        iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const coolingDown = Boolean(data?.nextCheckAt && new Date(data.nextCheckAt).getTime() > Date.now());

    if (!loaded) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    const ruleActions: any[] = data?.actions || [];
    const trackerRows: any[] = data?.trackerRows || [];
    const latestSaved = data?.latest;
    const latest = viewing || latestSaved;
    const report = latest?.report || null;
    const pastChecks: any[] = (data?.history || []).filter((h: any) => h?.share);
    const business = data?.business || {};
    const competitorRows: any[] = latest?.competitors || [];
    const trendRows: any[] = latest?.trendRows || [];
    const aiKeywordReason = (kw: string) => report?.keywords?.find((k: any) => k.keyword.toLowerCase() === kw.toLowerCase())?.reason;
    let n = 0;

    const runLabel = busy
        ? progress || 'Checking Google Maps…'
        : coolingDown
          ? `Next check ${fmtResetDay(data?.nextCheckAt)}`
          : latestSaved
            ? 'Refresh report'
            : 'Generate report';

    // Recommended actions for the dashboard (the only action list): AI actions first, else the rule-based checklist.
    const recs = report?.actions?.length
        ? report.actions.slice(0, 5).map((a: any) => {
              const area = AREA_LINKS[a.area] || AREA_LINKS.profile;
              return { title: a.title, text: a.why, to: area.to, icon: area.icon, tone: area.tone, priority: PRIORITY_TAGS[a.priority] };
          })
        : ruleActions.slice(0, 5).map((a: any) => ({
              title: a.title,
              text: a.desc,
              to: a.to,
              icon: ACTION_ICONS[a.icon] || Lightbulb,
              tone: ACTION_TONES[a.icon] || ACTION_TONES.profile,
              priority: priorityLevel(a.weight)
          }));
    const place = extras.business?.address || business.address || '';
    const city = place.split(',').map((x: string) => x.trim()).filter(Boolean).slice(-2).join(', ');

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">AI Insights</h1>
                    <p className="text-gray-500 text-sm mt-1">Smart insights powered by AI to help you grow your local presence.</p>
                    {city && (
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-slate-700" title={place}>
                            <MapPin className="w-3.5 h-3.5 text-[var(--brand-primary)]" /> {city}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <HistoryButton count={pastChecks.length} onClick={() => setShowHistory(true)} />
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={busy || coolingDown}
                        title={coolingDown ? `Checked this week. You can refresh again on ${fmtResetDay(data?.nextCheckAt)}.` : undefined}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-70"
                    >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {runLabel}
                    </button>
                    <button
                        type="button"
                        onClick={exportPdf}
                        disabled={exporting || !latest}
                        title={latest ? undefined : 'Generate the report first'}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F172A] text-white text-[11px] font-bold hover:bg-[#1E293B] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                        Export
                    </button>
                </div>
            </div>

            {viewing && (
                <div className="mb-4">
                    <ViewingOldBanner date={historyDate(viewing.createdAt)} onBack={() => setViewing(null)} />
                </div>
            )}

            {err && <div className="mb-4 text-sm text-slate-700 bg-slate-50 border border-[#E2E8F0] rounded-xl px-4 py-3">{err}</div>}

            {!latest ? (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
                    <h2 className="text-lg font-bold text-[#0F172A]">No report yet</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Click <strong>Generate report</strong>. We check who holds the Google Maps top 3 for your main keywords, then AI writes your report.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                        {[
                            ['1', 'We check Google Maps', 'Your 5 main keywords, searched from your business location.'],
                            ['2', 'AI reads the results', 'Competitors, your reviews, keyword demand and your profile.'],
                            ['3', 'You get a report', 'Summary, priority actions, competitors and a plan for this week. Export it as a PDF.']
                        ].map(([k, t, d]) => (
                            <div key={k} className="flex gap-3 rounded-xl border border-[#E2E8F0] p-3.5">
                                <span className="w-6 h-6 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-xs font-bold flex items-center justify-center shrink-0">{k}</span>
                                <div>
                                    <div className="text-xs font-bold text-[#0F172A]">{t}</div>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{d}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-4">
                        Works best with a category on your <Link to="/profile" className="font-semibold text-[var(--brand-primary)] hover:underline">business profile</Link> and a few{' '}
                        <Link to="/visibility-tracker" className="font-semibold text-[var(--brand-primary)] hover:underline">tracked keywords</Link>.
                    </p>
                </div>
            ) : (
                <div id="insights-content" className="space-y-4 bg-[#F8FAFC]">
                    {/* Report line for the PDF */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                        <strong className="text-[#0F172A]">{business.name || 'Your business'}</strong>
                        <span>Report date: {fmtDate(latest.createdAt)}</span>
                    </div>

                    <InsightsDashboard
                        latest={latest}
                        history={data?.history || []}
                        business={extras.business || business}
                        trackerRows={trackerRows}
                        gridKeywords={extras.gridKeywords}
                        llm={extras.llm}
                        recs={recs}
                        renderRanks={() => <RankMovement rows={trackerRows} />}
                        onViewReport={() => document.getElementById('full-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    />

                    {/* Full report: detail sections, then the action plan */}
                    <div id="full-report" className="pt-4 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[var(--brand-primary)]" />
                        <h2 className="text-lg font-bold text-[#0F172A]">Full report</h2>
                    </div>

                    {/* 1. Competitor analysis */}
                    {competitorRows.length > 0 && (
                        <Section n={++n} title="Competitor analysis" info={INFO.competitors} note={report?.competitors?.length ? 'Why your strongest competitors rank above you, written by AI from the results.' : 'Your strongest competitors in these results.'}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {competitorRows.map((c: any) => {
                                    const why = report?.competitors?.find((x: any) => x.name.toLowerCase() === String(c.name).toLowerCase())?.whyAhead;
                                    return (
                                        <div key={c.name} className="rounded-xl border border-[#E2E8F0] p-4">
                                            <div className="text-sm font-bold text-[#0F172A]">{c.name}</div>
                                            <div className="text-[11px] text-gray-500 mt-0.5">
                                                {[c.category, c.rating ? `${c.rating}★` : '', c.reviews ? `${c.reviews.toLocaleString()} reviews` : ''].filter(Boolean).join(' · ')}
                                            </div>
                                            <div className="mt-2 text-[11px] font-semibold text-[#0F172A]">
                                                In {c.slots} of {latest.totalSlots ?? 0} top 3 spots
                                            </div>
                                            {why && <p className="mt-2 text-xs text-gray-600">{why}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {/* 2. What customers say */}
                    {report && (report.reviews?.praise?.length > 0 || report.reviews?.complaints?.length > 0) && (
                        <Section n={++n} title="What your customers say" info={INFO.customers} note="AI summary of your recent Google reviews.">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-2">
                                        <ThumbsUp className="w-3.5 h-3.5" /> Praised
                                    </div>
                                    {report.reviews.praise.length ? (
                                        <ul className="space-y-1 text-xs text-gray-700 list-disc pl-4">
                                            {report.reviews.praise.map((t: string, i: number) => <li key={i}>{t}</li>)}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-gray-500">No findings.</p>
                                    )}
                                </div>
                                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 mb-2">
                                        <ThumbsDown className="w-3.5 h-3.5" /> Complaints
                                    </div>
                                    {report.reviews.complaints.length ? (
                                        <ul className="space-y-1 text-xs text-gray-700 list-disc pl-4">
                                            {report.reviews.complaints.map((t: string, i: number) => <li key={i}>{t}</li>)}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-gray-500">No complaints found.</p>
                                    )}
                                </div>
                            </div>
                            {report.reviews.keywords?.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] font-semibold text-gray-500 mr-1">Words customers use:</span>
                                    {report.reviews.keywords.map((k: string) => (
                                        <span key={k} className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                                            {k}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* 3. Keyword opportunities */}
                    {trendRows.length > 0 && (
                        <Section n={++n} title="Keyword opportunities" info={INFO.keywords} note={`Monthly Google searches and change against the same month last year.`}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
                                            <th className="pb-2 font-bold">Keyword</th>
                                            <th className="pb-2 font-bold text-right">Searches / mo</th>
                                            <th className="pb-2 font-bold text-right">vs last year</th>
                                            <th className="pb-2 font-bold pl-4">Why it matters</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E2E8F0]">
                                        {[...trendRows]
                                            .sort((a, b) => (aiKeywordReason(b.keyword) ? 1 : 0) - (aiKeywordReason(a.keyword) ? 1 : 0) || b.volume - a.volume)
                                            .map((t: any) => (
                                                <tr key={t.keyword} className="align-top">
                                                    <td className="py-2.5 pr-3 font-semibold text-[#0F172A]">{t.keyword}</td>
                                                    <td className="py-2.5 text-right">{t.volume ? t.volume.toLocaleString() : '—'}</td>
                                                    <td className="py-2.5 text-right">
                                                        {t.trendPct == null ? (
                                                            <span className="text-gray-400">—</span>
                                                        ) : (
                                                            <span className={`inline-flex items-center gap-0.5 font-bold ${t.trendPct > 0 ? 'text-emerald-600' : t.trendPct < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                                                {t.trendPct > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : t.trendPct < 0 ? <ArrowDown className="w-3 h-3" strokeWidth={3} /> : null}
                                                                {Math.abs(t.trendPct)}%
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 pl-4 text-gray-600">{aiKeywordReason(t.keyword) || ''}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    )}

                    {/* This week's plan (the actions themselves are in the Recommended Actions card) */}
                    <Section n={++n} title="This week's plan" info={INFO.plan}>
                        <div className="rounded-xl bg-[#0F172A] p-4 text-white">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-2">
                                {latest.recommendationSource === 'ai' ? 'AI recommendation for this week' : 'Recommendation for this week'}
                            </div>
                            <p className="text-sm leading-relaxed">&ldquo;{latest.recommendation}&rdquo;</p>
                        </div>
                        {report?.plan?.length > 0 && (
                            <div className="mt-4">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">This week's plan</div>
                                <ol className="space-y-2">
                                    {report.plan.map((step: string, i: number) => (
                                        <li key={i} className="flex gap-3 text-xs text-gray-700">
                                            <span className="w-5 h-5 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-[10px] font-bold flex items-center justify-center shrink-0">
                                                {i + 1}
                                            </span>
                                            <span className="pt-0.5">{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        {!report && latest.opportunities?.length > 0 && (
                            <ul className="mt-4 space-y-2">
                                {latest.opportunities.map((o: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-xs text-gray-700">
                                        <TrendingUp className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                                        {o}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="pdf-hide flex flex-wrap gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => navigate('/profile')}
                                className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-foreground)] text-xs font-bold cursor-pointer"
                            >
                                Update Business Profile
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/posts')}
                                className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Write a post about it
                            </button>
                        </div>
                        {report?.actions?.length > 0 && ruleActions.length > 0 && (
                            <div className="mt-5">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Profile checklist</div>
                                <ul className="space-y-2">
                                    {ruleActions.slice(0, report?.actions?.length ? 5 : 8).map((a) => {
                                        const Icon = ACTION_ICONS[a.icon] || Lightbulb;
                                        const level = priorityLevel(a.weight);
                                        return (
                                            <li key={a.id} className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] p-3">
                                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ACTION_TONES[a.icon] || ACTION_TONES.profile}`}>
                                                    <Icon className="w-4 h-4" />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="text-xs font-bold text-[#0F172A]">{a.title}</h4>
                                                        {level && !report?.actions?.length && (
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${level.cls}`}>{level.label}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 mt-0.5">{a.desc}</p>
                                                    <div className="pdf-hide flex flex-wrap items-center gap-3 mt-1.5">
                                                        <Link to={a.to} className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--brand-primary)] hover:underline">
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
                                {data?.hiddenActions > 0 && (
                                    <p className="pdf-hide mt-2 text-[11px] text-gray-400">{data.hiddenActions} hidden (done or dismissed). They return automatically if still relevant.</p>
                                )}
                            </div>
                        )}
                    </Section>

                    <p className="text-center text-[10px] text-gray-400 pb-2">
                        Data: Google Maps results and Google search volume at the report date. Analysis written by AI from this data only.
                    </p>
                </div>
            )}

            <HistoryModal
                open={showHistory}
                title="Report history"
                rows={pastChecks.map((h: any, i: number) => {
                    const prev = pastChecks[i + 1];
                    const d = prev ? (Number(h.youSlots) || 0) - (Number(prev.youSlots) || 0) : null;
                    return {
                        id: h.createdAt,
                        date: historyDate(h.createdAt),
                        summary: `You hold ${h.youSlots ?? 0} of ${h.totalSlots ?? 0} top-3 spots (${sharePct(h)}% share)`,
                        change:
                            d == null ? (
                                <span className="text-[11px] text-gray-400">First check</span>
                            ) : d === 0 ? (
                                <span className="text-[11px] text-gray-400">No change</span>
                            ) : (
                                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${d > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {d > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                                    {Math.abs(d)} spot{Math.abs(d) === 1 ? '' : 's'}
                                </span>
                            )
                    };
                })}
                viewingId={latest?.createdAt}
                latestId={latestSaved?.createdAt}
                onView={(id) => setViewing(id === latestSaved?.createdAt ? null : pastChecks.find((h: any) => h.createdAt === id) || null)}
                onDelete={deleteCheck}
                onClose={() => setShowHistory(false)}
                note="Older reports were checked with the earlier method, so their share can read higher than newer ones."
            />
        </>
    );
}

export default function ReportGenerator() {
    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <InsightsOverview />
        </div>
    );
}
