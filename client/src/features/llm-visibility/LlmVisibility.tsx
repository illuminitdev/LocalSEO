import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPageCache, setPageCache } from '../../shared/pageCache';
import {
    LineChart,
    Download,
    Loader2,
    Lightbulb,
    BookOpen,
    X,
    BadgeCheck,
    CheckCircle2,
    Clock,
    MessageSquare,
    Smile,
    ShieldCheck,
    Bot,
    ArrowUpRight,
    Trash2
} from 'lucide-react';
import { apiDelete, apiGet, apiPost, cn, logDashboardActivity } from '../../shared/utils';
import { useCredits } from '../../shared/CreditsContext';
import { downloadElementAsPdf } from '../../shared/downloadElementAsPdf';

type Step = '' | 'asking' | 'analysing';

const when = (iso?: string) =>
    iso
        ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Saved report';

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
    const tones = {
        slate: 'bg-slate-100 text-slate-600',
        green: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
        red: 'bg-red-50 text-red-600'
    };
    return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function badgeTone(label: string): 'green' | 'amber' | 'red' | 'slate' {
    if (/high|improving|well/i.test(label)) return 'green';
    if (/moderate|partly/i.test(label)) return 'amber';
    if (/low|not/i.test(label)) return 'red';
    return 'slate';
}

const keyOf = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function ago(iso?: string) {
    const ms = Date.now() - new Date(iso || '').getTime();
    if (!iso || !Number.isFinite(ms) || ms < 0) return '';
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function ReportView({
    report,
    platformErrors,
    tracked,
    onTrack
}: {
    report: any;
    platformErrors?: Record<string, string>;
    tracked: string[];
    onTrack: (prompt: string) => void;
}) {
    const platforms: Record<string, any> = report.platforms || (report.chatgpt ? { chatgpt: report.chatgpt } : {});
    const google = report.google || {};
    const sentiment = report.sentiment || {};
    const sov = report.shareOfVoice || {};
    const llm = report.llm || {};

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* AI Share of Voice */}
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                            <Bot className="w-4 h-4 text-[var(--brand-primary)]" />
                            AI Share of Voice
                        </div>
                        {sov.delta != null && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-bold">
                                {sov.delta >= 0 ? '+' : ''}
                                {sov.delta}%
                            </span>
                        )}
                    </div>
                    <div className="text-4xl font-black text-[#0F172A]">
                        {sov.value ?? 0}
                        <span className="text-lg font-bold text-gray-500">%</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                        Your share of business mentions across {report.questionsAsked || 0} category questions.
                    </p>
                </div>

                {/* Brand Sentiment */}
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                        <Smile className="w-4 h-4 text-[var(--brand-primary)]" />
                        Brand Sentiment
                    </div>
                    {sentiment.score == null ? (
                        <>
                            <div className="text-2xl font-black text-[#0F172A]">—</div>
                            <p className="text-[11px] text-gray-500 mt-2">No AI answers mentioned your business yet.</p>
                        </>
                    ) : (
                        <>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-4xl font-black text-[#0F172A]">{sentiment.score}</span>
                                <span className="text-lg font-bold text-gray-500">%</span>
                                <span className="text-[11px] font-bold text-[var(--brand-primary)] ml-1">{sentiment.label}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mt-3">
                                <div className="h-full bg-[#0F172A]" style={{ width: `${sentiment.score}%` }} />
                            </div>
                        </>
                    )}
                </div>

                {/* LLM Optimization */}
                <div className="rounded-2xl border border-[#E2E8F0] border-t-4 border-t-[var(--brand-primary)] bg-white p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                            <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)]" />
                            LLM Optimization
                        </div>
                        <BadgeCheck className="w-5 h-5 text-[var(--brand-primary)]" />
                    </div>
                    <div className="text-4xl font-black text-[#0F172A]">{llm.grade || '—'}</div>
                    <p className="text-[11px] text-gray-500 mt-2">{llm.note}</p>
                </div>
            </div>

            <div>
                <h2 className="text-xl font-black text-[#0F172A] mb-3">Platform Breakdown</h2>
                {report.analysisUsed === false && (
                    <p className="text-[11px] text-gray-500 mb-3">
                        Detailed AI analysis was unavailable for this run, so positions and competitor names may be missing. Run the check again.
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {LLM_META.map(({ id, label }) => {
                        const p = platforms[id];
                        if (!p) {
                            return (
                                <div key={id} className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-5">
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <PlatformLogo id={id} />
                                        <h3 className="text-base font-bold text-[#0F172A]">{label}</h3>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {platformErrors?.[id]
                                            ? `${label} could not be checked this time: ${friendlyError(platformErrors[id])}`
                                            : `${label} was not part of this check.`}
                                    </p>
                                </div>
                            );
                        }
                        return (
                            <div key={id} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <PlatformLogo id={id} />
                                        <h3 className="text-base font-bold text-[#0F172A]">{label}</h3>
                                    </div>
                                    <Badge tone={badgeTone(p.badge || '')}>{p.badge}</Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Mention Rate</div>
                                        <div className="text-3xl font-black text-[#0F172A]">{p.mentionRate ?? 0}%</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Avg Position</div>
                                        {p.avgPosition != null ? (
                                            <div className="text-3xl font-black text-[#0F172A]">
                                                #{p.avgPosition}
                                                <span className="text-[11px] font-medium text-gray-500 ml-1">in answers</span>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="text-lg font-bold text-gray-500 leading-9">{p.mentionRate > 0 ? 'Mentioned' : 'Not mentioned'}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="border-t border-[#E2E8F0] pt-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Common Response Contexts</div>
                                    {p.contexts?.length ? (
                                        <ul className="space-y-2">
                                            {p.contexts.map((c: string, i: number) => (
                                                <li key={i} className="flex gap-2 text-xs text-gray-700">
                                                    <CheckCircle2 className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                                                    {c}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-gray-500">
                                            {p.mentionRate > 0
                                                ? 'Your business was mentioned, but no clear sentence could be extracted.'
                                                : `${label} did not name your business in these answers.`}
                                        </p>
                                    )}
                                    {p.topCompetitors?.length > 0 && (
                                        <p className="text-[11px] text-gray-500 mt-3">
                                            Most mentioned instead: {p.topCompetitors.map((c: any) => c.name).join(', ')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Google AI Overviews */}
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <PlatformLogo id="google" />
                                <h3 className="text-base font-bold text-[#0F172A]">Google AI Overviews</h3>
                            </div>
                            <Badge tone={badgeTone(google.badge || '')}>{google.badge}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">AI Overview Inclusion</div>
                                <div className="text-3xl font-black text-[#0F172A]">{google.inclusion ?? 0}%</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Overview Shown</div>
                                <div className="text-3xl font-black text-[#0F172A]">{google.overviewShown ?? 0}%</div>
                                <div className="text-[11px] text-gray-500">{google.sourcesCited ?? 0} sources cited</div>
                            </div>
                        </div>
                        {(google.overviewShown ?? 0) === 0 && (
                            <p className="text-[11px] text-gray-500 bg-slate-50 border border-[#E2E8F0] rounded-lg px-3 py-2 mb-3">
                                Google did not show an AI Overview for these questions. This is common for local searches, where Google shows the Map Pack instead.
                            </p>
                        )}
                        <div className="border-t border-[#E2E8F0] pt-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Optimization Opportunities</div>
                            {google.opportunities?.length ? (
                                <ul className="space-y-2">
                                    {google.opportunities.map((o: string, i: number) => (
                                        <li key={i} className="flex gap-2 text-xs text-gray-700">
                                            <ArrowUpRight className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                                            {o}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500">No recommendations available for this run.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {report.questions?.length > 0 && (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                    <h3 className="text-sm font-bold text-[#0F172A] mb-3">Questions we asked</h3>
                    <ul className="divide-y divide-[#E2E8F0]">
                        {report.questions.map((q: any, i: number) => (
                            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                                <span className="text-gray-700 max-w-[55%]">{q.question}</span>
                                <span className="flex flex-wrap gap-1.5 justify-end">
                                    {q.results && Object.keys(q.results).length ? (
                                        LLM_META.filter((m) => q.results[m.id]).map((m) => (
                                            <Badge key={m.id} tone={q.results[m.id].mentioned ? 'green' : 'red'}>
                                                {m.label}: {q.results[m.id].mentioned ? (q.results[m.id].position ? `#${q.results[m.id].position}` : 'Yes') : 'No'}
                                            </Badge>
                                        ))
                                    ) : (
                                        <Badge tone={q.mentioned ? 'green' : 'red'}>
                                            {q.mentioned ? (q.position ? `Mentioned #${q.position}` : 'Mentioned') : 'Not mentioned'}
                                        </Badge>
                                    )}
                                    {tracked.includes(keyOf(q.question)) ? (
                                        <Link to="/llm-visibility/tracking" className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200">
                                            Tracking ✓
                                        </Link>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onTrack(q.question)}
                                            className="px-2 py-0.5 rounded-full border border-[#E2E8F0] text-[10px] font-bold text-[var(--brand-primary)] hover:bg-slate-50 cursor-pointer"
                                        >
                                            + Track this prompt
                                        </button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function friendlyError(msg: string) {
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return 'the API quota or balance is exhausted. Check your DataForSEO balance and try again later.';
    return String(msg).replace(/\s+/g, ' ').slice(0, 160);
}

const LLM_META = [
    { id: 'chatgpt', label: 'ChatGPT' },
    { id: 'claude', label: 'Claude' },
    { id: 'perplexity', label: 'Perplexity' }
] as const;

const LOGO_DOMAIN: Record<string, string> = {
    chatgpt: 'chatgpt.com',
    claude: 'claude.ai',
    perplexity: 'perplexity.ai',
    google: 'google.com'
};

// Real brand logos (site favicons); falls back to a plain icon if the image cannot load.
function PlatformLogo({ id }: { id: string }) {
    const [failed, setFailed] = useState(false);
    return (
        <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
            {failed ? (
                <MessageSquare className="w-5 h-5 text-[#0F172A]" />
            ) : (
                <img
                    src={`https://www.google.com/s2/favicons?domain=${LOGO_DOMAIN[id]}&sz=64`}
                    alt=""
                    width={24}
                    height={24}
                    className="w-6 h-6 object-contain"
                    onError={() => setFailed(true)}
                />
            )}
        </span>
    );
}

type VisibilityCache = { report: any; history: any[]; tracked: string[] };
/** Tabs shared by LLM Visibility and LLM Prompt Tracking so users always see both views. */
export function LlmTabs({ active, trackedCount }: { active: 'check' | 'tracking'; trackedCount?: number }) {
    const tabs = [
        { key: 'check', to: '/llm-visibility', label: 'Visibility Check', icon: Bot },
        { key: 'tracking', to: '/llm-visibility/tracking', label: 'Prompt Tracking', icon: LineChart },
    ] as const;

    return (
        <div className="inline-flex gap-1 p-1 mb-6 bg-white border border-[#E2E8F0] rounded-xl shadow-xs print:hidden">
            {tabs.map(({ key, to, label, icon: Icon }) => {
                const isActive = key === active;
                return (
                    <Link
                        key={key}
                        to={to}
                        className={cn(
                            'inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-sm sm:text-base font-bold transition-colors',
                            isActive
                                ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-sm'
                                : 'text-slate-500 hover:text-[#0F172A] hover:bg-slate-50'
                        )}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                        {key === 'tracking' && !!trackedCount && (
                            <span
                                className={cn(
                                    'px-2 py-0.5 rounded-full text-[11px] font-bold',
                                    isActive ? 'bg-white/40 text-[var(--brand-primary-foreground)]' : 'bg-slate-100 text-slate-600'
                                )}
                            >
                                {trackedCount}
                            </span>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}

const CACHE_KEY = 'llm-visibility';

export default function LlmVisibility() {
    const pageCache = getPageCache<VisibilityCache>(CACHE_KEY);
    const { refresh: refreshCredits } = useCredits();
    const [step, setStep] = useState<Step>('');
    const [isExporting, setIsExporting] = useState(false);
    const [report, setReport] = useState<any>(pageCache?.report ?? null);
    const [history, setHistory] = useState<any[]>(pageCache?.history ?? []);
    const [loaded, setLoaded] = useState(Boolean(pageCache));
    const [error, setError] = useState('');
    // Billing month: one report per month; inside it the saved report is shown and nothing is asked again.
    const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
    const [savedNotice, setSavedNotice] = useState('');
    const [platformErrors, setPlatformErrors] = useState<Record<string, string>>({});
    const [showHowItWorks, setShowHowItWorks] = useState(false);
    const [tracked, setTracked] = useState<string[]>(pageCache?.tracked ?? []);
    const [answersAskedAt, setAnswersAskedAt] = useState('');
    const isGenerating = step !== '';

    useEffect(() => {
        if (loaded) setPageCache(CACHE_KEY, { report, history, tracked });
    }, [loaded, report, history, tracked]);

    useEffect(() => {
        apiGet('/api/llm/visibility')
            .then((data: any) => {
                setHistory(Array.isArray(data?.history) ? data.history : []);
                setReport(data?.report || null);
                if (data?.periodStart && data?.periodEnd) setPeriod({ start: data.periodStart, end: data.periodEnd });
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
        apiGet('/api/llm/tracker')
            .then((data: any) => setTracked((data?.prompts || []).map((p: any) => keyOf(p.prompt))))
            .catch(() => {});
    }, []);

    const trackPrompt = async (prompt: string) => {
        setError('');
        try {
            const data = await apiPost('/api/llm/tracker/prompts', { prompt });
            setTracked((data?.prompts || []).map((p: any) => keyOf(p.prompt)));
        } catch (err: any) {
            setError(err?.message || 'Could not track this prompt');
        }
    };

    // Each prompt is asked once per billing month (answers shared with LLM Tracking). A report already made this
    // month is just shown again: no AI engine or Gemini call, no credits.
    const handleGenerate = async () => {
        setError('');
        setSavedNotice('');
        const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        if (report?.createdAt && period && new Date(report.createdAt).getTime() >= new Date(period.start).getTime()) {
            setSavedNotice(`This month's report is already done, so the saved report is shown. You can run a new one after ${fmt(period.end)}.`);
            return;
        }
        try {
            const business = await apiGet('/api/business');
            if (!business?.name?.trim()) {
                throw new Error('Save your business profile first (required fields on Business profile page).');
            }
            setStep('asking');
            const [results, google] = await Promise.all([
                Promise.all(
                    LLM_META.map(({ id }) =>
                        apiPost(`/api/llm/visibility/${id}`, {})
                            .then((r: any) => ({ id, answers: r?.answers || [], error: '' }))
                            .catch((e: any) => ({ id, answers: [] as any[], error: e?.message || 'failed' }))
                    )
                ),
                apiPost('/api/llm/visibility/google', {}).catch(() => ({ answers: [] }))
            ]);
            const errors: Record<string, string> = {};
            const body: Record<string, any> = { google: google?.answers || [] };
            for (const r of results) {
                body[r.id] = r.answers;
                if (r.error) errors[r.id] = r.error;
            }
            setPlatformErrors(errors);
            if (!results.some((r) => r.answers.length)) {
                throw new Error(results.find((r) => r.error)?.error || 'No LLM platform returned answers.');
            }
            const askedTimes = results.flatMap((r) => r.answers.map((a: any) => a?.askedAt)).filter(Boolean).sort();
            setAnswersAskedAt(askedTimes[0] || '');
            setStep('analysing');
            const data = await apiPost('/api/llm/visibility/analyze', body);
            setReport(data.report);
            setHistory(Array.isArray(data.history) ? data.history : []);
            await logDashboardActivity({
                type: 'report',
                message: `Generated LLM visibility report. LLM grade: ${data.report?.llm?.grade || 'n/a'}.`,
                icon: 'CheckCircle',
                color: 'text-[#0F172A]'
            });
        } catch (err: any) {
            setError(err.message || 'Report failed');
        } finally {
            setStep('');
            refreshCredits();
        }
    };

    const deleteRun = async (createdAt: string) => {
        if (!window.confirm('Delete this check? This cannot be undone.')) return;
        try {
            const data = await apiDelete(`/api/llm/visibility/history?createdAt=${encodeURIComponent(createdAt)}`);
            setHistory(Array.isArray(data?.history) ? data.history : []);
            if (report?.createdAt === createdAt) setReport(data?.report || null);
        } catch (err: any) {
            setError(err?.message || 'Could not delete the check');
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        setError('');
        try {
            const safeName = (report?.businessName || 'report').replace(/[^\w\-]+/g, '-').slice(0, 40);
            await downloadElementAsPdf('report-content', `zappsites-llm-visibility-${safeName}`);
        } catch (err: any) {
            setError(err?.message || 'PDF export failed');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6 print:hidden">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">LLM Visibility Tracking</h1>
                    <p className="text-gray-500 text-sm mt-1 max-w-xl">
                        Monitor your brand&apos;s presence, sentiment, and share of voice across major Generative AI platforms.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {report && (
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-[#E2E8F0] text-[#0F172A] text-xs font-bold rounded-xl cursor-pointer disabled:opacity-70"
                        >
                            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Export Report
                        </button>
                    )}
                    <button
                        onClick={() => handleGenerate()}
                        disabled={isGenerating}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-70 cursor-pointer"
                    >
                        {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-amber-300" />}
                        {step === 'asking' ? 'Asking AI platforms…' : step === 'analysing' ? 'Analysing answers…' : report ? 'Run New Check' : 'Run LLM Visibility Check'}
                    </button>
                </div>
            </div>

            <LlmTabs active="check" trackedCount={tracked.length} />

            {period && (() => {
                const doneThisMonth = Boolean(report?.createdAt) && new Date(report.createdAt).getTime() >= new Date(period.start).getTime();
                const next = new Date(period.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                return (
                    <p className="-mt-2 mb-4 text-[11px] font-semibold text-gray-500 sm:text-right">
                        Report: {doneThisMonth ? 1 : 0} of 1 used this month · {doneThisMonth ? `next on ${next}` : `resets ${next}`}
                    </p>
                );
            })()}
            {savedNotice && (
                <p className="mb-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">{savedNotice}</p>
            )}
            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 print:hidden">{error}</p>
            )}

            {isGenerating && (
                <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center shadow-xs mb-6">
                    <div className="w-14 h-14 border-4 border-slate-100 border-t-[var(--brand-primary)] rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-base font-bold text-[#0F172A]">
                        {step === 'asking' ? 'Asking ChatGPT, Claude, Perplexity and Google 5 questions about your category…' : 'Scoring mentions, sentiment and share of voice…'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">This takes up to a minute.</p>
                </div>
            )}

            {!loaded && !isGenerating && (
                <div className="flex justify-center py-24 print:hidden">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            )}

            {loaded && !report && !isGenerating && (
                <div className="bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-12 md:p-16 flex flex-col items-center text-center shadow-xs mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-[#E2E8F0] flex items-center justify-center mb-4">
                        <Bot className="w-7 h-7 text-slate-400" />
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] mb-2">No LLM visibility checks yet</h2>
                    <p className="text-sm text-gray-500 max-w-md mb-6">
                        We ask ChatGPT, Claude, Perplexity and Google real customer questions about your trade and area, then measure how often you are recommended.
                    </p>
                    <button
                        type="button"
                        onClick={() => handleGenerate()}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-foreground)] rounded-xl text-sm font-bold cursor-pointer"
                    >
                        Run your first check
                    </button>
                </div>
            )}

            {report && !isGenerating && (
                <div id="report-content" className="bg-slate-50/60 rounded-2xl animate-in slide-in-from-bottom-4 duration-500 mb-6">
                    <p className="text-[11px] text-gray-500 mb-4 font-semibold">
                        {report.businessName} • {when(report.createdAt)}
                        {answersAskedAt && report.createdAt === history[0]?.createdAt && (
                            <span className="print:hidden">
                                {' '}• AI answers from {ago(answersAskedAt)} (shared with LLM Tracking, asked once a month)

                            </span>
                        )}
                    </p>
                    <ReportView report={report} platformErrors={platformErrors} tracked={tracked} onTrack={trackPrompt} />
                </div>
            )}

            {history.length > 0 && (
                <div className="mt-6 mb-6 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden print:hidden">
                    <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-700" />
                            <h2 className="text-xs font-bold text-[#0F172A]">Past checks</h2>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">Latest {Math.min(5, history.length)} of {history.length}</span>
                    </div>
                    <ul className="divide-y divide-[#E2E8F0]">
                        {history.slice(0, 5).map((run, idx) => {
                            const isCurrent = run.createdAt === report?.createdAt;
                            return (
                                <li key={run.createdAt || idx} className={`flex items-center ${isCurrent ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-[#F8FAFC]'}`}>
                                    <button
                                        type="button"
                                        onClick={() => setReport(run)}
                                        className="flex-1 min-w-0 text-left px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-black px-2.5 py-0.5 rounded-lg border border-[#E2E8F0] bg-slate-50">
                                                {run.llm?.grade || '—'}
                                            </span>
                                            <span className="font-bold text-[#0F172A]">{when(run.createdAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-gray-600">
                                            <span className="hidden sm:inline">Share of voice {run.shareOfVoice?.value ?? 0}%</span>
                                            <span className="hidden sm:inline">ChatGPT {run.platforms?.chatgpt?.mentionRate ?? run.chatgpt?.mentionRate ?? 0}%</span>
                                            <span className={`font-bold ${isCurrent ? 'text-[#0F172A]' : 'text-gray-400'}`}>
                                                {isCurrent ? 'Viewing' : 'View →'}
                                            </span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        title="Delete this check"
                                        aria-label="Delete this check"
                                        onClick={() => deleteRun(run.createdAt)}
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

            <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Lightbulb className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h4 className="font-bold text-sm text-[#0F172A]">Why track LLM visibility?</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                            More customers now ask ChatGPT, Claude, Perplexity and Google AI for recommendations. If you are not named, they will not find you.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setShowHowItWorks(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                    <BookOpen className="w-4 h-4 text-gray-600" />
                    Learn how it works
                </button>
            </div>

            {showHowItWorks && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowHowItWorks(false);
                    }}
                >
                    <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 md:p-8 shadow-2xl border border-[#E2E8F0]">
                        <button
                            type="button"
                            onClick={() => setShowHowItWorks(false)}
                            className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-lg font-bold text-[#0F172A] mb-4">How LLM Visibility Tracking works</h3>
                        <div className="space-y-3 text-xs text-gray-600">
                            {[
                                ['1. We ask real questions', 'Five customer-style questions about your trade and area are sent to ChatGPT, Claude, Perplexity (all with web search) and Google.'],
                                ['2. We read the answers', 'We check whether your business is named, where it ranks among recommendations, and how it is described.'],
                                ['3. We score it', 'Share of voice, sentiment and an LLM optimization grade, plus actions to get mentioned more.']
                            ].map(([t, d]) => (
                                <div key={t} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <div>
                                        <strong className="text-[#0F172A] block mb-0.5">{t}</strong>
                                        {d}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setShowHowItWorks(false);
                                handleGenerate();
                            }}
                            className="w-full mt-6 py-2.5 px-4 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-foreground)] rounded-xl text-xs font-bold cursor-pointer"
                        >
                            Run a check now
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
