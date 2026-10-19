import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Loader2, Plus, RefreshCw, Sparkles, Trash2, Trophy, Users } from 'lucide-react';
import { apiGet, apiPost, cn } from '../../shared/utils';
import { getPageCache, setPageCache } from '../../shared/pageCache';
import { LlmTabs } from './LlmVisibility';

type Platform = 'chatgpt' | 'claude' | 'perplexity';
type PlatformResult = {
    mentioned: boolean;
    position: number;
    competitors?: string[];
    context?: string;
    text?: string;
    sources?: Array<{ title: string; url: string; domain: string }>;
};
type Point = {
    date: string;
    askedAt?: string;
    rank: number;
    mentioned: number;
    answered: number;
    platforms: Partial<Record<Platform, PlatformResult>>;
};
type TrackedPrompt = { prompt: string; addedAt: string; checkedAt?: string; history: Point[] };
type TrackerInfo = {
    prompts: TrackedPrompt[];
    suggestions: string[];
    configured: boolean;
    business: { name: string; category: string; city: string; connected: boolean };
    max: number;
};

const NOT_RANKED = 21;
const CHECK_BATCH = 2;
const DAY = 86_400_000;
const PERIODS = [
    { days: 7, label: 'Last 7 Days' },
    { days: 30, label: 'Last 30 Days' },
    { days: 90, label: 'Last 90 Days' }
];
const PLATFORM_LABEL: Record<Platform, string> = { chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity' };
const RED = '#EF4444';
const GREEN = '#10B981';
const GREY = '#94A3B8';
const BLUE = '#3B82F6';

const current = (p: TrackedPrompt) => (p.history.length ? p.history[p.history.length - 1].rank : null);
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const rankLabel = (rank: number | null) => (rank == null ? '—' : rank >= NOT_RANKED ? 'Not named' : `#${fmtNum(rank)}`);
function ago(iso?: string) {
    const ms = Date.now() - new Date(iso || '').getTime();
    if (!iso || !Number.isFinite(ms) || ms < 0) return '';
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const platformRank =(r?: PlatformResult) => (r ? (r.mentioned ? `#${r.position}` : 'Not named') : '—');

/** Wrap every occurrence of the business name in the answer in a highlight. */
function Highlighted({ text, name }: { text: string; name: string }) {
    const clean = name.trim();
    if (clean.length < 3) return <>{text}</>;
    const parts = text.split(new RegExp(`(${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === clean.toLowerCase() ? (
                    <mark key={i} className="bg-amber-100 text-[#0F172A] font-bold rounded px-0.5">{part}</mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
}

function ResponsePanel({ item, platform, businessName, onClose }: { item: TrackedPrompt; platform: Platform; businessName: string; onClose: () => void }) {
    const last = item.history[item.history.length - 1];
    const before = item.history.length > 1 ? item.history[item.history.length - 2] : null;
    const r = last?.platforms[platform];
    const prev = before?.platforms[platform];
    let compare = '';
    if (r && prev) {
        if (r.mentioned && !prev.mentioned) compare = `New since the last check: ${PLATFORM_LABEL[platform]} now names you (${platformRank(r)}).`;
        else if (!r.mentioned && prev.mentioned) compare = `Lost since the last check: ${PLATFORM_LABEL[platform]} named you ${platformRank(prev)} before, now it does not.`;
        else if (r.mentioned && prev.mentioned && r.position !== prev.position) compare = `Position moved from ${platformRank(prev)} to ${platformRank(r)} since the last check.`;
        else compare = 'Same result as the last check.';
    }
    return (
        <div className="px-4 py-4 bg-slate-50 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                    {PLATFORM_LABEL[platform]} answer
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', r?.mentioned ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
                        {r?.mentioned ? `Names you · ${platformRank(r)}` : 'Does not name you'}
                    </span>
                </div>
                <button type="button" onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-[#0F172A] cursor-pointer">Close</button>
            </div>
            {last?.askedAt && (
                <p className="text-xs text-slate-500 mb-1">
                    Answer from {ago(last.askedAt)}. Shared with LLM Visibility; asked once a month, then the saved answer is shown.
                </p>
            )}
            {compare && <p className="text-xs text-slate-500 mb-2">{compare}</p>}
            {r?.text ? (
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white border border-[#E2E8F0] rounded-xl p-3 max-h-72 overflow-y-auto">
                    <Highlighted text={r.text} name={businessName} />
                </div>
            ) : (
                <p className="text-xs text-slate-500">The full answer was not saved for this check. Re-check the prompt to see it.</p>
            )}
            {r?.context ? <p className="text-xs text-slate-600 mt-2"><strong>About you:</strong> {r.context}</p> : null}
            {!!r?.competitors?.length && (
                <p className="text-xs text-slate-600 mt-2"><strong>Also named:</strong> {r.competitors.join(', ')}</p>
            )}
            {!!r?.sources?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.sources.slice(0, 6).map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-[#E2E8F0] text-blue-600 hover:underline">
                            {s.domain || s.title}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Rank at the start of the window: last check on/before the cutoff, else the earliest check. */
function previous(p: TrackedPrompt, days: number) {
    if (p.history.length < 2) return null;
    const cutoff = Date.now() - days * DAY;
    let found: Point | null = null;
    for (let i = 0; i < p.history.length - 1; i++) if (new Date(p.history[i].date).getTime() <= cutoff) found = p.history[i];
    return (found ?? p.history[0]).rank;
}

/** Positive = moved up the list (better). */
function change(p: TrackedPrompt, days: number) {
    const now = current(p);
    const before = previous(p, days);
    return now == null || before == null ? null : before - now;
}

function ChangeChip({ value }: { value: number | null }) {
    if (value == null) return <span className="text-xs text-slate-400">New</span>;
    if (Math.abs(value) < 0.05) return <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold">Same</span>;
    const up = value > 0;
    return (
        <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold', up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
            {up ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
            {fmtNum(Math.round(Math.abs(value) * 10) / 10)}
        </span>
    );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{label}</div>
            <div className={cn('text-3xl font-black text-[#0F172A]', tone)}>{value}</div>
            {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
    );
}

/** Line through the points; lower rank number = higher on the chart. Red when getting worse, green when improving. */
function linePath(coords: Array<readonly [number, number]>) {
    return coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function Sparkline({ history }: { history: Point[] }) {
    const w = 84;
    const h = 24;
    const pts = history.slice(-12);
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
    const coords = pts.map((p, i) => [1 + (i / (pts.length - 1)) * (w - 2), hi === lo ? h / 2 : 3 + ((p.rank - lo) / (hi - lo)) * (h - 6)] as const);
    const delta = pts[0].rank - pts[pts.length - 1].rank;
    return (
        <svg width={w} height={h} aria-hidden>
            <path d={linePath(coords)} fill="none" stroke={delta > 0 ? GREEN : delta < 0 ? RED : GREY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/** Average rank per check date across all prompts, drawn as the big red/green trend graph. */
function TrendChart({ prompts, days }: { prompts: TrackedPrompt[]; days: number }) {
    const since = Date.now() - days * DAY;
    // One point per check run: checks made within 10 minutes of each other (one "Check all") share a point.
    const RUN = 10 * 60_000;
    const [hover, setHover] = useState<number | null>(null);
    type RunItem = { prompt: string; rank: number; mentioned: number; answered: number };
    const byRun = new Map<number, RunItem[]>();
    for (const p of prompts) {
        for (const pt of p.history) {
            const t = new Date(pt.date).getTime();
            if (t < since) continue;
            const key = Math.floor(t / RUN);
            byRun.set(key, [...(byRun.get(key) || []), { prompt: p.prompt, rank: pt.rank, mentioned: pt.mentioned, answered: pt.answered }]);
        }
    }
    const series = [...byRun.entries()]
        .sort(([a], [b]) => a - b)
        .map(([key, items]) => ({
            date: new Date(key * RUN).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            avg: items.reduce((s, v) => s + v.rank, 0) / items.length,
            items: items.sort((a, b) => a.rank - b.rank)
        }));
    const W = 640;
    const H = 240;
    const padL = 48;
    const padR = 24;
    const padT = 30;
    const padB = 38;
    if (series.length === 0) {
        return (
            <div className="h-[180px] flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                Check your prompts to start the trend.
            </div>
        );
    }
    // Scale fits the data so ups and downs are visible; rank 1 (best) is at the top.
    const avgs = series.map((s) => s.avg);
    const lo = Math.min(...avgs);
    const hi = Math.max(...avgs);
    const margin = Math.max(1, (hi - lo) * 0.35);
    const yMin = Math.max(1, lo - margin);
    const yMax = Math.max(Math.min(NOT_RANKED, hi + margin), yMin + 4);
    const plotH = H - padT - padB;
    const x = (i: number) => (series.length === 1 ? (padL + W - padR) / 2 : padL + (i / (series.length - 1)) * (W - padL - padR));
    const y = (rank: number) => padT + ((Math.min(Math.max(rank, yMin), yMax) - yMin) / (yMax - yMin)) * plotH;
    const base = padT + plotH;
    const coords = series.map((s, i) => [x(i), y(s.avg)] as const);
    const clampY = (v: number) => Math.max(padT, Math.min(base, v));
    let line = `M${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i - 1] ?? coords[i];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[i + 2] ?? p2;
        line += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${clampY(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${clampY(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${base} L${coords[0][0].toFixed(1)},${base} Z`;
    const improving = series[0].avg - series[series.length - 1].avg;
    const stroke = series.length < 2 ? BLUE : improving > 0 ? GREEN : improving < 0 ? RED : BLUE;
    const dotColor = (i: number) => (i === 0 ? BLUE : series[i].avg < series[i - 1].avg ? GREEN : series[i].avg > series[i - 1].avg ? RED : GREY);
    const ticks = [0, 1, 2, 3].map((t) => yMin + ((yMax - yMin) * t) / 3);
    const shown = hover != null ? series[hover] : null;
    const leftPct = hover != null ? (coords[hover][0] / W) * 100 : 0;
    return (
        <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Average LLM rank over time">
            <defs>
                <linearGradient id="llm-trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {ticks.map((r) => (
                <g key={r}>
                    <line x1={padL} x2={W - padR} y1={y(r)} y2={y(r)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
                    <text x={padL - 8} y={y(r) + 3} textAnchor="end" fontSize="10" fill="#64748B">{`#${r.toFixed(1)}`}</text>
                </g>
            ))}
            {series.length > 1 && <path d={area} fill="url(#llm-trend-fill)" />}
            {series.length === 1 && (
                <rect x={coords[0][0] - 28} y={coords[0][1]} width="56" height={base - coords[0][1]} rx="6" fill="url(#llm-trend-fill)" />
            )}
            {series.length > 1 && <path d={line} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
            {coords.map(([cx, cy], i) => (
                <g key={`${series[i].date}-${i}`}>
                    <circle cx={cx} cy={cy} r="5" fill="#fff" stroke={dotColor(i)} strokeWidth="3" />
                    <text x={cx} y={cy - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={dotColor(i)}>{`#${series[i].avg.toFixed(1)}`}</text>
                    <circle
                        cx={cx}
                        cy={cy}
                        r="16"
                        fill="transparent"
                        className="cursor-pointer"
                        tabIndex={0}
                        aria-label={`${series[i].date}: average rank ${series[i].avg.toFixed(1)} across ${series[i].items.length} prompts`}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(i)}
                        onBlur={() => setHover(null)}
                    />
                </g>
            ))}
            {series.length === 1 ? (
                <text x={x(0)} y={H - 10} fontSize="10" fill="#64748B" textAnchor="middle">{series[0].date} · re-check later to see ups and downs</text>
            ) : (
                <>
                    <text x={padL} y={H - 10} fontSize="10" fill="#64748B">{series[0].date}</text>
                    <text x={W - padR} y={H - 10} fontSize="10" fill="#64748B" textAnchor="end">{series[series.length - 1].date}</text>
                </>
            )}
        </svg>
        {shown && hover != null && (
            <div
                className="absolute z-10 w-72 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-lg pointer-events-none"
                style={{
                    left: `${leftPct}%`,
                    top: 0,
                    transform: `translateX(${leftPct > 65 ? '-100%' : leftPct < 35 ? '0%' : '-50%'})`
                }}
            >
                <p className="text-[11px] text-slate-500">{shown.date}</p>
                <p className="text-sm font-black text-[#0F172A] mb-0.5">
                    Average #{shown.avg.toFixed(1)}
                    <span className="font-medium text-slate-500"> · {shown.items.length} prompt{shown.items.length === 1 ? '' : 's'} checked</span>
                </p>
                {hover > 0 && (
                    <p className={cn('text-[11px] font-bold mb-1.5', shown.avg < series[hover - 1].avg ? 'text-emerald-600' : shown.avg > series[hover - 1].avg ? 'text-red-500' : 'text-slate-500')}>
                        {shown.avg === series[hover - 1].avg
                            ? 'Same as the previous check'
                            : `${shown.avg < series[hover - 1].avg ? 'Better' : 'Worse'} by ${Math.abs(shown.avg - series[hover - 1].avg).toFixed(1)} than the previous check`}
                    </p>
                )}
                <ul className="space-y-1 border-t border-[#E2E8F0] pt-1.5">
                    {shown.items.map((it) => (
                        <li key={it.prompt} className="flex items-start justify-between gap-2 text-[11px] leading-snug">
                            <span className="text-slate-700">{it.prompt}</span>
                            <span className={cn('shrink-0 font-black', it.rank >= NOT_RANKED ? 'text-red-500' : 'text-[#0F172A]')}>
                                {it.rank >= NOT_RANKED ? 'Not named' : `#${fmtNum(it.rank)}`}
                                <span className="ml-1 font-medium text-slate-400">{it.mentioned}/{it.answered}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        )}
        </div>
    );
}

function downloadCsv(prompts: TrackedPrompt[]) {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Prompt', 'Checked', 'Rank', 'Platforms naming you', 'Platforms answered'].map(esc).join(',')];
    for (const p of prompts) for (const pt of p.history) rows.push([p.prompt, pt.date, pt.rank >= NOT_RANKED ? 'Not named' : pt.rank, pt.mentioned, pt.answered].map(esc).join(','));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'llm-prompt-tracking.csv';
    a.click();
    URL.revokeObjectURL(url);
}

export default function LlmTracker() {
    const cached = getPageCache<TrackerInfo>('llm-tracker');
    const [info, setInfo] = useState<TrackerInfo | null>(cached ?? null);
    const [loading, setLoading] = useState(!cached);
    const [days, setDays] = useState(30);
    const [input, setInput] = useState('');
    const [adding, setAdding] = useState(false);
    const [checking, setChecking] = useState({ done: 0, total: 0 });
    const [error, setError] = useState('');
    const [open, setOpen] = useState<{ prompt: string; platform: Platform } | null>(null);

    const busy = checking.total > 0;
    const prompts = info?.prompts ?? [];
    const max = info?.max ?? 10;
    const full = prompts.length >= max;

    useEffect(() => {
        if (info) setPageCache('llm-tracker', info);
    }, [info]);

    useEffect(() => {
        apiGet('/api/llm/tracker')
            .then((data: TrackerInfo) => setInfo(data))
            .catch((e: any) => setError(e?.message || 'Could not load LLM tracking'))
            .finally(() => setLoading(false));
    }, []);

    const add = async (text: string) => {
        const prompt = text.trim();
        if (!prompt || adding) return;
        setAdding(true);
        setError('');
        try {
            setInfo(await apiPost('/api/llm/tracker/prompts', { prompt }));
            setInput('');
        } catch (e: any) {
            setError(e?.message || 'Could not add the prompt');
        } finally {
            setAdding(false);
        }
    };

    const remove = async (prompt: string) => {
        if (!window.confirm('Stop tracking this prompt? Its history will be deleted.')) return;
        try {
            setInfo(await apiPost('/api/llm/tracker/remove', { prompt }));
        } catch (e: any) {
            setError(e?.message || 'Could not remove the prompt');
        }
    };

    // Each prompt is asked once per billing month (shared with LLM Visibility); after that the saved answer is shown.
    const check = async (list: string[]) => {
        if (!list.length || busy) return;
        setError('');
        setChecking({ done: 0, total: list.length });
        const failures: string[] = [];
        try {
            for (let i = 0; i < list.length; i += CHECK_BATCH) {
                const batch = list.slice(i, i + CHECK_BATCH);
                const data = await apiPost('/api/llm/tracker/check', { prompts: batch });
                setInfo(data);
                failures.push(...Object.values((data?.errors || {}) as Record<string, string>));
                setChecking({ done: Math.min(list.length, i + batch.length), total: list.length });
            }
            if (failures.length) setError(failures[0]);
        } catch (e: any) {
            setError(e?.message || 'Check failed');
        } finally {
            setChecking({ done: 0, total: 0 });
        }
    };

    const stats = useMemo(() => {
        const checked = prompts.filter((p) => current(p) != null);
        const named = checked.filter((p) => (current(p) as number) < NOT_RANKED);
        const avg = named.length ? named.reduce((s, p) => s + (current(p) as number), 0) / named.length : null;
        const best = [...named].sort((a, b) => (current(a) as number) - (current(b) as number))[0];
        return { checked: checked.length, named: named.length, avg, best };
    }, [prompts]);

    // Best prompts: named by the most platforms first, then the lowest average rank.
    const best = useMemo(
        () =>
            prompts
                .filter((p) => current(p) != null && (current(p) as number) < NOT_RANKED)
                .sort((a, b) => {
                    const la = a.history[a.history.length - 1];
                    const lb = b.history[b.history.length - 1];
                    return lb.mentioned - la.mentioned || la.rank - lb.rank;
                })
                .slice(0, 3),
        [prompts]
    );

    // Businesses the AI answers name instead of you, counted over the latest check of every prompt.
    const competitors = useMemo(() => {
        const counts = new Map<string, number>();
        for (const p of prompts) {
            const last = p.history[p.history.length - 1];
            for (const r of Object.values(last?.platforms ?? {})) {
                for (const name of r?.competitors ?? []) counts.set(name, (counts.get(name) || 0) + 1);
            }
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [prompts]);

    if (loading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">LLM Prompt Tracking</h1>
                    <p className="text-gray-500 text-sm mt-1 max-w-xl">
                        Track where {info?.business.name || 'your business'} ranks when ChatGPT, Claude and Perplexity answer the prompts your customers use.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {prompts.some((p) => p.history.length) && (
                        <button
                            type="button"
                            onClick={() => downloadCsv(prompts)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-[#E2E8F0] text-xs font-bold rounded-xl cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => check(prompts.map((p) => p.prompt))}
                        disabled={busy || !prompts.length || !info?.configured}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-sm font-bold disabled:opacity-60 cursor-pointer"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin text-amber-300" /> : <RefreshCw className="w-4 h-4" />}
                        {busy ? `Checking ${checking.done}/${checking.total}…` : 'Check all prompts'}
                    </button>
                </div>
            </div>

            <LlmTabs active="tracking" trackedCount={prompts.length} />

            {info && !info.configured && (
                <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                    DataForSEO login is missing, so prompts can be saved but not checked.
                </p>
            )}
            {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard label="Average rank" value={stats.avg == null ? '—' : `#${stats.avg.toFixed(1)}`} hint="Across prompts where you are named" tone={stats.avg == null ? '' : 'text-red-500'} />
                <StatCard label="Prompts naming you" value={`${stats.named}/${stats.checked}`} hint="Of the prompts checked" />
                <StatCard label="Best prompt" value={stats.best ? rankLabel(current(stats.best)) : '—'} hint={stats.best?.prompt} tone="text-emerald-600" />
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-[#0F172A]">Average rank over time</h2>
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="text-xs font-bold border border-[#E2E8F0] rounded-lg px-2 py-1.5 bg-white cursor-pointer"
                    >
                        {PERIODS.map((p) => (
                            <option key={p.days} value={p.days}>{p.label}</option>
                        ))}
                    </select>
                </div>
                <TrendChart prompts={prompts} days={days} />
                <p className="text-[11px] text-slate-400 mt-2">Higher on the chart = named earlier in the AI answer. Red = slipping, green = improving.</p>
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm mb-6 overflow-hidden">
                <div className="p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                    <div>
                        <h2 className="text-sm font-bold text-[#0F172A]">
                            Your prompts{' '}
                            <span className={cn('font-medium', full ? 'text-red-500' : 'text-slate-400')}>
                                · {prompts.length}/{max} used · {Math.max(0, max - prompts.length)} left
                            </span>
                        </h2>
                        {full && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                You have reached your plan&apos;s limit.{' '}
                                {/* TODO: link to the plans / upgrade page once it exists. */}
                                <button type="button" onClick={() => setError('Upgrade your plan to track more prompts.')} className="font-bold text-[var(--brand-primary)] hover:underline cursor-pointer">
                                    Upgrade plan to track more prompts
                                </button>
                            </p>
                        )}
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            add(input);
                        }}
                        className="flex gap-2 w-full sm:w-auto"
                    >
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            maxLength={200}
                            disabled={full}
                            placeholder={full ? `Plan limit of ${max} prompts reached` :`e.g. Best ${info?.business.category || 'business'} in ${info?.business.city || 'my area'}?`}
                            className="flex-1 sm:w-80 text-sm border border-[#E2E8F0] rounded-xl px-3 py-2 disabled:bg-slate-50"
                        />
                        <button
                            type="submit"
                            disabled={full || adding || input.trim().length < 5}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
                        >
                            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                        </button>
                    </form>
                </div>
                {prompts.length === 0 ? (
                    <p className="p-8 text-center text-sm text-slate-500">Add a prompt your customers might ask an AI assistant, or pick a suggestion below.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50">
                                    <th className="px-4 py-2.5 font-bold">Prompt</th>
                                    <th className="px-4 py-2.5 font-bold">Rank</th>
                                    <th className="px-4 py-2.5 font-bold">Change</th>
                                    <th className="px-4 py-2.5 font-bold">Platforms</th>
                                    <th className="px-4 py-2.5 font-bold">Trend</th>
                                    <th className="px-2 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0]">
                                {prompts.map((p) => {
                                    const rank = current(p);
                                    const last = p.history[p.history.length - 1];
                                    const isOpen = open?.prompt === p.prompt;
                                    return (
                                        <Fragment key={p.prompt}>
                                        <tr className="hover:bg-[#F8FAFC]">
                                            <td className="px-4 py-3 max-w-sm font-medium text-[#0F172A]">{p.prompt}</td>
                                            <td className={cn('px-4 py-3 font-black', rank == null ? 'text-slate-400' : rank >= NOT_RANKED ? 'text-red-500' : 'text-[#0F172A]')}>
                                                {rank == null ? 'Not checked' : rankLabel(rank)}
                                            </td>
                                            <td className="px-4 py-3"><ChangeChip value={change(p, days)} /></td>
                                            <td className="px-4 py-3">
                                                {last ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {(Object.keys(PLATFORM_LABEL) as Platform[]).map((pl) => {
                                                            const r = last.platforms[pl];
                                                            if (!r) return null;
                                                            const active = isOpen && open?.platform === pl;
                                                            return (
                                                                <button
                                                                    key={pl}
                                                                    type="button"
                                                                    onClick={() => setOpen(active ? null : { prompt: p.prompt, platform: pl })}
                                                                    title={`${r.mentioned ? `${PLATFORM_LABEL[pl]} names you (${platformRank(r)})` : `${PLATFORM_LABEL[pl]} does not name you`} — click to read its answer`}
                                                                    className={cn(
                                                                        'px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer hover:ring-2',
                                                                        r.mentioned ? 'bg-emerald-50 text-emerald-600 hover:ring-emerald-200' : 'bg-red-50 text-red-500 hover:ring-red-200',
                                                                        active && 'ring-2'
                                                                    )}
                                                                >
                                                                    {PLATFORM_LABEL[pl]} {platformRank(r)}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3"><Sparkline history={p.history} /></td>
                                            <td className="px-2 py-3 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    title="Check this prompt"
                                                    disabled={busy || !info?.configured}
                                                    onClick={() => check([p.prompt])}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Stop tracking"
                                                    onClick={() => remove(p.prompt)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                        {isOpen && open && (
                                            <tr>
                                                <td colSpan={6} className="p-0">
                                                    <ResponsePanel item={p} platform={open.platform} businessName={info?.business.name || ''} onClose={() => setOpen(null)} />
                                                </td>
                                            </tr>
                                        )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-3">
                        <Trophy className="w-4 h-4 text-amber-500" /> Best prompts for you
                    </h2>
                    {best.length === 0 ? (
                        <p className="text-xs text-slate-500">Check your prompts to see which ones get you named by AI assistants.</p>
                    ) : (
                        <ul className="space-y-2">
                            {best.map((p) => (
                                <li key={p.prompt} className="flex items-center justify-between gap-3 text-sm p-2.5 rounded-xl bg-emerald-50/60">
                                    <span className="font-medium text-[#0F172A]">{p.prompt}</span>
                                    <span className="text-right shrink-0">
                                        <span className="block font-black text-emerald-600">{rankLabel(current(p))}</span>
                                        <span className="block text-[10px] text-slate-500">{p.history[p.history.length - 1].mentioned}/{p.history[p.history.length - 1].answered} platforms</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-3">
                        <Sparkles className="w-4 h-4 text-blue-500" /> Suggested prompts
                    </h2>
                    {(info?.suggestions.length ?? 0) === 0 ? (
                        <p className="text-xs text-slate-500">No more suggestions right now.</p>
                    ) : (
                        <ul className="space-y-2">
                            {info?.suggestions.slice(0, 5).map((s) => (
                                <li key={s} className="flex items-center justify-between gap-3 text-sm p-2.5 rounded-xl bg-slate-50">
                                    <span className="text-[#0F172A]">{s}</span>
                                    <button
                                        type="button"
                                        disabled={full || adding}
                                        onClick={() => add(s)}
                                        className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)] disabled:opacity-40 cursor-pointer shrink-0"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Track
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {competitors.length > 0 && (
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm mt-4">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-1">
                        <Users className="w-4 h-4 text-red-500" /> Who AI recommends instead of you
                    </h2>
                    <p className="text-xs text-slate-500 mb-3">Businesses named in the latest answers, by how many platform answers mention them.</p>
                    <div className="flex flex-wrap gap-2">
                        {competitors.map(([name, count]) => (
                            <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-bold">
                                {name}
                                <span className="px-1.5 rounded-full bg-white text-[10px]">{count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
