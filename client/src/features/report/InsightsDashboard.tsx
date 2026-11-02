import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight, Lightbulb, MapPin, MessageSquareText, Search, Star, TrendingUp, Trophy, Zap, BarChart3 } from 'lucide-react';
import { InfoTip, type InfoText } from '../../shared/InfoTip';
import { Tip as HoverTip } from '../visibility/VisibilityTracker';
import { packCompetitors, sharePct } from './insightsData';

function topCompetitorPct(h: any) {
    const total = Number(h?.totalSlots) || 0;
    const top = packCompetitors(h)[0];
    return total && top ? Math.round((top.slots / total) * 100) : 0;
}

const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });


function Card({ title, icon, info, right, children, className = '' }: { title: string; icon: ReactNode; info?: InfoText; right?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <div className={`flex flex-col h-full min-w-0 rounded-2xl border border-[#E2E8F0] bg-white p-5 break-inside-avoid ${className}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#0F172A]">
                    {icon}
                    {title}
                    {info && <InfoTip info={info} />}
                </h2>
                {right}
            </div>
            <div className="flex-1 flex flex-col min-h-0">{children}</div>
        </div>
    );
}

function Delta({ value, unit = '', goodWhenUp = true, suffix }: { value: number | null; unit?: string; goodWhenUp?: boolean; suffix?: string }) {
    if (value == null) return null;
    if (value === 0) return <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">No change{suffix ? ` ${suffix}` : ''}</span>;
    const good = value > 0 === goodWhenUp;
    return (
        <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-bold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
            {value > 0 ? <ArrowUp className="w-2.5 h-2.5 shrink-0" strokeWidth={3} /> : <ArrowDown className="w-2.5 h-2.5 shrink-0" strokeWidth={3} />}
            {Math.abs(Number(value.toFixed(1))).toLocaleString()}
            {unit}
            {suffix && <span className="font-medium text-gray-400 ml-1">{suffix}</span>}
        </span>
    );
}

type Bar = { label: string; value: number; display: string; highlight?: boolean };

/** Small bars comparing current values (used when there is no history for a line yet). Hover a bar for its value. */
function MiniBars({ bars, color, max }: { bars: Bar[]; color: string; max?: number }) {
    if (!bars.length) return null;
    const top = max || Math.max(1, ...bars.map((b) => b.value));
    return (
        <div className="flex items-end gap-1 w-24 h-9 shrink-0" aria-hidden="true">
            {bars.map((b, i) => (
                <HoverTip key={i} title={b.label} text={b.display}>
                    <span
                        className="block w-3 rounded-t-sm cursor-help"
                        style={{ height: `${Math.max(8, (b.value / top) * 36)}px`, background: color, opacity: b.highlight ? 1 : 0.35 }}
                    />
                </HoverTip>
            ))}
        </div>
    );
}

/** Tiny line of past values; nothing is drawn with fewer than 2 points (no fake trends). */
function Sparkline({ values, color }: { values: number[]; color: string }) {
    if (values.length < 2) return null;
    const W = 96;
    const H = 34;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)]);
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-9 shrink-0" aria-hidden="true">
            <polygon points={`0,${H} ${line} ${W},${H}`} fill={color} opacity="0.12" />
            <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function KpiTile({
    icon,
    tone,
    label,
    info,
    value,
    delta,
    note,
    spark,
    sparkColor,
    bars,
    barsMax
}: {
    icon: ReactNode;
    tone: string;
    label: string;
    info: InfoText;
    value: ReactNode;
    delta?: ReactNode;
    note?: ReactNode;
    spark?: number[];
    sparkColor: string;
    bars?: Bar[];
    barsMax?: number;
}) {
    return (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 break-inside-avoid">
            <div className="flex items-center gap-2.5">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-[#0F172A]">
                    {label}
                    <InfoTip info={info} />
                </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0 text-2xl font-black text-[#0F172A] leading-tight">{value}</div>
                {spark && spark.length >= 2 ? <Sparkline values={spark} color={sparkColor} /> : bars?.length ? <MiniBars bars={bars} color={sparkColor} max={barsMax} /> : null}
            </div>
            <div className="mt-1 min-h-[16px] truncate">{delta || <span className="text-[10px] text-gray-400">{note}</span>}</div>
        </div>
    );
}

/* ── Performance trend (line chart) ───────────────────────────────────────── */

type Point = { at: string; you: number; rival: number };

function TrendChart({ points }: { points: Point[] }) {
    const W = 640;
    const H = 220;
    const L = 36;
    const B = 24;
    const x = (i: number) => (points.length < 2 ? L + (W - L) / 2 : L + (i / (points.length - 1)) * (W - L - 12));
    const y = (v: number) => 8 + (1 - v / 100) * (H - B - 8);
    const path = (key: 'you' | 'rival') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Map Pack share over time">
            {[0, 25, 50, 75, 100].map((t) => (
                <g key={t}>
                    <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth="1" />
                    <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94A3B8">
                        {t}%
                    </text>
                </g>
            ))}
            {points.length > 1 && <path d={`${path('you')} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--brand-primary)" opacity="0.08" />}
            {points.length > 1 && <path d={path('rival')} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 5" />}
            {points.length > 1 && <path d={path('you')} fill="none" stroke="var(--brand-primary)" strokeWidth="2.5" />}
            {points.map((p, i) => (
                <g key={p.at}>
                    <circle cx={x(i)} cy={y(p.you)} r="4" fill="white" stroke="var(--brand-primary)" strokeWidth="2">
                        <title>{`${shortDate(p.at)}: you ${p.you}%, strongest competitor ${p.rival}%`}</title>
                    </circle>
                    <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94A3B8">
                        {shortDate(p.at)}
                    </text>
                </g>
            ))}
            {last && (
                <g>
                    <rect x={Math.min(W - 52, x(points.length - 1) - 24)} y={y(last.you) - 30} width="48" height="20" rx="6" fill="var(--brand-primary)" />
                    <text x={Math.min(W - 28, x(points.length - 1))} y={y(last.you) - 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--brand-primary-foreground)">
                        {last.you}%
                    </text>
                </g>
            )}
        </svg>
    );
}

const RANGES = [
    { key: '30', label: 'Last 30 days', days: 30 },
    { key: '90', label: 'Last 90 days', days: 90 },
    { key: 'all', label: 'All checks', days: 0 }
] as const;

function PerformanceTrend({ history, rankRows, renderRanks }: { history: any[]; rankRows: any[]; renderRanks: () => ReactNode }) {
    const [tab, setTab] = useState<'visibility' | 'rankings' | 'reviews'>('visibility');
    const [range, setRange] = useState<(typeof RANGES)[number]['key']>('90');
    const days = RANGES.find((r) => r.key === range)?.days || 0;
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    const points: Point[] = history
        .filter((h) => h?.share && h?.createdAt && new Date(h.createdAt).getTime() >= cutoff)
        .slice()
        .reverse()
        .map((h) => ({ at: h.createdAt, you: sharePct(h), rival: topCompetitorPct(h) }));

    return (
        <Card
            title="Your Performance Trend"
            icon={<BarChart3 className="w-4 h-4 text-[var(--brand-primary)]" />}
            info={{
                title: 'Performance trend',
                body: [
                    'Visibility: your share of all Google Maps top 3 spots at each check (solid line) against your strongest competitor (dashed line).',
                    'Rankings: your Google Maps rank for each tracked keyword, previous check vs latest. Points are added each time you run a check (at most weekly).'
                ]
            }}
            className="lg:col-span-3"
            right={
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex p-0.5 rounded-lg bg-slate-100 text-[11px] font-bold pdf-hide">
                        {(['visibility', 'rankings', 'reviews'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTab(t)}
                                className={`px-3 py-1 rounded-md capitalize cursor-pointer ${tab === t ? 'bg-white text-[var(--brand-primary)] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    {tab === 'visibility' && (
                        <select
                            value={range}
                            onChange={(e) => setRange(e.target.value as any)}
                            className="pdf-hide rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 cursor-pointer"
                        >
                            {RANGES.map((r) => (
                                <option key={r.key} value={r.key}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            }
        >
            {tab === 'visibility' &&
                (points.length ? (
                    <>
                        <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-slate-500 mb-1">
                            <span className="inline-flex items-center gap-1.5">
                                <i className="w-2.5 h-2.5 rounded-full bg-[var(--brand-primary)]" /> Your Map Pack share
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <i className="w-4 border-t-2 border-dashed border-slate-400" /> Strongest competitor
                            </span>
                        </div>
                        <TrendChart points={points} />
                        {points.length < 2 && <p className="text-center text-[11px] text-gray-400 mt-1">The trend line appears after 2 or more checks. Run the check again next week.</p>}
                    </>
                ) : (
                    <p className="py-12 text-center text-xs text-gray-500">No checks in this period. Choose a longer range or run a new check.</p>
                ))}
            {tab === 'rankings' &&
                (rankRows.length ? renderRanks() : <p className="py-12 text-center text-xs text-gray-500">Track keywords on the Visibility Tracker page to see rank movement here.</p>)}
            {tab === 'reviews' && (
                <p className="py-12 text-center text-xs text-gray-500">
                    Review history over time is not saved yet, so there is no reviews trend to show. Your current review count is in the GBP Reviews tile above.
                </p>
            )}
        </Card>
    );
}

/* ── AI key insights ──────────────────────────────────────────────────────── */

type Insight = { tone: 'good' | 'warn' | 'bad' | 'info'; icon: ReactNode; title: string; text: string; badge: string };

const TONE: Record<Insight['tone'], { bar: string; chip: string; iconBg: string }> = {
    good: { bar: 'border-l-emerald-500', chip: 'bg-emerald-50 text-emerald-700', iconBg: 'bg-emerald-50 text-emerald-600' },
    warn: { bar: 'border-l-amber-500', chip: 'bg-amber-50 text-amber-700', iconBg: 'bg-amber-50 text-amber-600' },
    bad: { bar: 'border-l-red-500', chip: 'bg-red-50 text-red-600', iconBg: 'bg-red-50 text-red-500' },
    info: { bar: 'border-l-violet-500', chip: 'bg-violet-50 text-violet-700', iconBg: 'bg-violet-50 text-violet-600' }
};

function KeyInsights({ summary, insights }: { summary?: string; insights: Insight[] }) {
    return (
        <Card
            title="AI Key Insights"
            icon={<Lightbulb className="w-4 h-4 text-amber-500" />}
            info={{ title: 'AI key insights', body: ['The most important findings from this report: what improved, what is strong and what needs work.', 'The summary is written by AI from your data; the cards are worked out from the same numbers.'] }}
            className="lg:col-span-2"
        >
            {summary && <p className="text-xs text-gray-600 leading-relaxed mb-3">{summary}</p>}
            <ul className="space-y-2.5">
                {insights.map((it, i) => {
                    const t = TONE[it.tone];
                    return (
                        <li key={i} className={`flex items-start gap-3 rounded-xl border border-[#E2E8F0] border-l-4 ${t.bar} p-3`}>
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.iconBg}`}>{it.icon}</span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <h4 className="text-xs font-bold text-[#0F172A]">{it.title}</h4>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${t.chip}`}>{it.badge}</span>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-0.5">{it.text}</p>
                            </div>
                        </li>
                    );
                })}
                {!insights.length && <li className="text-xs text-gray-500">No findings yet.</li>}
            </ul>
        </Card>
    );
}

/* ── Top local keywords ───────────────────────────────────────────────────── */

type KeywordRow = { keyword: string; rank: number | null; change: number | null; visibility: number | null; leader?: string; outOfTop3?: boolean };

function KeywordsTable({ rows }: { rows: KeywordRow[] }) {
    const rankText = (r: number | null) => (r == null ? '—' : r > 20 ? '20+' : Number(r.toFixed(1)).toString());
    return (
        <Card
            title="Top Local Keywords"
            icon={<Search className="w-4 h-4 text-[var(--brand-primary)]" />}
            info={{
                title: 'Top local keywords',
                body: [
                    'Rank: your average Google Maps position (1 is best). Change: places moved since the previous check (green = up).',
                    'Visibility: the share of your Local Search Grid where you are in the top 3. It shows only for keywords scanned on the Local Search Grid.',
                    '"#1" under a keyword is the business Google Maps showed first in this report\'s check. "Not top 3" means you were not in the top 3 for that keyword.'
                ]
            }}
        >
            {rows.length ? (
                <table className="w-full table-fixed text-xs">
                    <colgroup>
                        <col />
                        <col className="w-12" />
                        <col className="w-16" />
                        <col className="w-[84px]" />
                    </colgroup>
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-[#E2E8F0]">
                            <th className="pb-2 font-bold text-left">Keyword</th>
                            <th className="pb-2 font-bold text-right">Rank</th>
                            <th className="pb-2 pl-2 font-bold text-right">Change</th>
                            <th className="pb-2 pl-3 font-bold text-left">Visibility</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                        {rows.map((r) => (
                            <tr key={r.keyword} className="align-middle">
                                <td className="py-2 pr-2 overflow-hidden [&>span]:flex [&>span]:w-full [&>span]:min-w-0">
                                    <HoverTip
                                        title={r.keyword}
                                        text={r.leader ? `#1 on Google Maps: ${r.leader}` : r.rank != null ? `Your Google Maps rank: ${rankText(r.rank)}` : 'You were not in the Google Maps top 3 for this keyword.'}
                                        width={260}
                                    >
                                        <span className="block min-w-0 w-full cursor-default">
                                            <span className="block font-semibold text-[#0F172A] truncate">{r.keyword}</span>
                                            {r.leader && <span className="block text-[10px] text-gray-400 truncate">#1: {r.leader}</span>}
                                        </span>
                                    </HoverTip>
                                </td>
                                <td className="py-2 text-right font-semibold whitespace-nowrap">
                                    {r.outOfTop3 && r.rank == null ? <span className="text-[10px] font-semibold text-red-500">3+</span> : rankText(r.rank)}
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                    {!r.change ? (
                                        <span className="text-gray-300">—</span>
                                    ) : (
                                        <span className={`inline-flex items-center gap-0.5 font-bold ${r.change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {r.change > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                                            {Math.abs(r.change)}
                                        </span>
                                    )}
                                </td>
                                <td className="py-2 pl-3">
                                    {r.visibility == null ? (
                                        <span className="text-gray-300">—</span>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-8 shrink-0 text-right font-semibold">{Math.round(r.visibility)}%</span>
                                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, r.visibility))}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="py-8 text-center text-xs text-gray-500">
                    No keyword ranks yet. Add keywords on the{' '}
                    <Link to="/visibility-tracker" className="font-semibold text-[var(--brand-primary)] hover:underline">
                        Visibility Tracker
                    </Link>
                    .
                </p>
            )}
            <p className="mt-auto pt-3 text-[10px] text-gray-400">Rank 1 is best · 3+ = not in the top 3 · hover a keyword for details</p>
        </Card>
    );
}

/* ── Competitor comparison (grouped bars, each metric on its own scale) ───── */

type Entity = { name: string; share: number; rating: number | null; reviews: number | null };

function CompetitorBars({ you, rivals }: { you: Entity; rivals: Entity[] }) {
    const all = [you, ...rivals.slice(0, 2)];
    const colors = ['bg-[var(--brand-primary)]', 'bg-violet-300', 'bg-slate-300'];
    const groups: Array<{ label: string; get: (e: Entity) => number | null; fmt: (n: number) => string; max?: number }> = [
        { label: 'Map Pack share', get: (e) => e.share, fmt: (n) => `${n}%` },
        { label: 'Rating', get: (e) => e.rating, fmt: (n) => `${n.toFixed(1)}★`, max: 5 },
        { label: 'Reviews', get: (e) => e.reviews, fmt: (n) => n.toLocaleString() }
    ];
    return (
        <Card
            title="Competitor Comparison"
            icon={<Trophy className="w-4 h-4 text-amber-500" />}
            info={{
                title: 'Competitor comparison',
                body: [
                    'You against the two businesses that took the most Google Maps top 3 spots in this report.',
                    'Each group has its own scale: Map Pack share (% of all top 3 spots), Google rating and number of Google reviews.'
                ]
            }}
        >
            <div className="flex flex-wrap justify-center gap-3 text-[10px] font-semibold text-slate-500 mb-3">
                {all.map((e, i) => (
                    <span key={e.name + i} className="inline-flex items-center gap-1.5 max-w-[130px]">
                        <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[i]}`} />
                        <span className="truncate">{e.name}</span>
                    </span>
                ))}
            </div>
            <div className="flex-1 grid grid-cols-3 gap-3 min-h-[180px]">
                {groups.map((g) => {
                    const vals = all.map((e) => g.get(e));
                    const max = g.max || Math.max(1, ...vals.map((v) => v || 0));
                    return (
                        <div key={g.label} className="flex flex-col items-center min-w-0">
                            <div className="flex-1 flex items-end justify-center gap-1.5 w-full border-b border-[#E2E8F0]">
                                {vals.map((v, i) => (
                                    <div key={i} className="flex flex-col items-center justify-end h-full w-5 sm:w-6">
                                        <span className="text-[9px] font-bold text-slate-600 mb-0.5 whitespace-nowrap">{v == null ? '—' : g.fmt(v)}</span>
                                        <div className={`w-full rounded-t ${colors[i]}`} style={{ height: `${v == null ? 0 : Math.max(2, (v / max) * 82)}%` }} />
                                    </div>
                                ))}
                            </div>
                            <span className="mt-1.5 text-[10px] font-semibold text-slate-500 text-center">{g.label}</span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

/* ── Recommended actions ──────────────────────────────────────────────────── */

type Rec = { title: string; text: string; to: string; icon: any; tone: string; priority?: { label: string; cls: string } | null };

function RecommendedActions({ items, onViewReport }: { items: Rec[]; onViewReport: () => void }) {
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? items : items.slice(0, 3);
    return (
        <Card
            title="Recommended Actions"
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            info={{ title: 'Recommended actions', body: ['What to do next, most important first. AI picks them from your data and gives the reason; each one links to the page where you fix it.', 'This week\'s plan and the profile checklist are at the end of the full report.'] }}
        >
            <ul className="divide-y divide-[#E2E8F0]">
                {shown.map((a, i) => {
                    const Icon = a.icon;
                    return (
                        <li key={i}>
                            <Link to={a.to} className="flex items-start gap-3 py-2.5 group">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.tone}`}>
                                    <Icon className="w-4 h-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-[#0F172A] group-hover:text-[var(--brand-primary)] line-clamp-1" title={a.title}>
                                        {a.title}
                                    </div>
                                    {a.text && <div className="text-[11px] text-gray-500 line-clamp-1" title={a.text}>{a.text}</div>}
                                    {a.priority && <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${a.priority.cls}`}>{a.priority.label}</span>}
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1 pdf-hide" />
                            </Link>
                        </li>
                    );
                })}
                {!items.length && <li className="py-4 text-xs text-gray-500">Nothing urgent right now.</li>}
            </ul>
            {items.length > 3 && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="pdf-hide self-start mt-1 text-[11px] font-bold text-[var(--brand-primary)] hover:underline cursor-pointer">
                    {showAll ? 'Show top 3' : `+ ${items.length - 3} more action${items.length - 3 === 1 ? '' : 's'}`}
                </button>
            )}
            <div className="pdf-hide mt-auto pt-3">
                <button type="button" onClick={onViewReport} className="w-full py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold cursor-pointer">
                    View Full Report ↓
                </button>
            </div>
        </Card>
    );
}

/* ── The dashboard ────────────────────────────────────────────────────────── */

export function InsightsDashboard({
    latest,
    history,
    business,
    trackerRows,
    gridKeywords,
    llm,
    recs,
    renderRanks,
    onViewReport
}: {
    latest: any;
    history: any[];
    business: any;
    trackerRows: Array<{ keyword: string; rank: number; previous: number | null }>;
    gridKeywords: any[];
    llm: any;
    recs: Rec[];
    renderRanks: () => ReactNode;
    onViewReport: () => void;
}) {
    const checks = history.filter((h) => h?.share);
    const prev = checks.find((h) => h.createdAt !== latest.createdAt && new Date(h.createdAt) < new Date(latest.createdAt)) || null;
    const share = sharePct(latest);
    const shareSpark = checks.slice(0, 8).reverse().map(sharePct);

    // Map Pack rank: tracked keywords where you are in the top 20 (Visibility Tracker), else the Local Search Grid average.
    const ranked = trackerRows.filter((r) => r.rank <= 20);
    const rankNow = avg(ranked.map((r) => r.rank)) ?? avg(gridKeywords.map((k) => Number(k.avgRank)).filter((n) => n > 0));
    const withPrev = trackerRows.filter((r) => r.previous != null && r.previous <= 20 && r.rank <= 20);
    const rankDelta = withPrev.length ? (avg(withPrev.map((r) => r.previous as number)) as number) - (avg(withPrev.map((r) => r.rank)) as number) : null;

    const llmReport = llm?.report;
    const llmHistory: any[] = Array.isArray(llm?.history) ? llm.history : [];
    const aio = typeof llmReport?.google?.inclusion === 'number' ? llmReport.google.inclusion : null;
    const aioPrev = llmHistory.find((h) => h?.createdAt && h.createdAt !== llmReport?.createdAt && typeof h?.google?.inclusion === 'number');
    const aioSpark = llmHistory.slice(0, 8).reverse().map((h) => h?.google?.inclusion).filter((n) => typeof n === 'number');

    const reviews = Number(business?.reviewsCount) || 0;
    const rating = business?.rating != null ? Number(business.rating) : null;

    // Insight cards from the same numbers.
    const insights: Insight[] = [];
    if (prev) {
        const d = share - sharePct(prev);
        insights.push({
            tone: d > 0 ? 'good' : d < 0 ? 'bad' : 'info',
            icon: <TrendingUp className="w-4 h-4" />,
            title: d === 0 ? 'Your Map Pack share held steady' : `Your Map Pack share is ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points`,
            text: `You hold ${latest.youSlots ?? 0} of ${latest.totalSlots ?? 0} top 3 spots, against ${prev.youSlots ?? 0} of ${prev.totalSlots ?? 0} on ${shortDate(prev.createdAt)}.`,
            badge: d > 0 ? 'Positive' : d < 0 ? 'Needs work' : 'Stable'
        });
    } else {
        insights.push({
            tone: 'info',
            icon: <TrendingUp className="w-4 h-4" />,
            title: `You hold ${latest.youSlots ?? 0} of ${latest.totalSlots ?? 0} top 3 spots`,
            text: 'This is your first check. Run it again next week to see which way you are moving.',
            badge: 'Baseline'
        });
    }
    const packs: any[] = latest.packs || [];
    const inTop = packs.filter((p) => (p.top3 || []).some((r: any) => r.isYou));
    if (packs.length) {
        const pct = Math.round((inTop.length / packs.length) * 100);
        const missing = packs.find((p) => !(p.top3 || []).some((r: any) => r.isYou));
        insights.push({
            tone: pct >= 60 ? 'good' : pct >= 30 ? 'warn' : 'bad',
            icon: <Star className="w-4 h-4" />,
            title: `Top 3 for ${inTop.length} of ${packs.length} keywords`,
            text: inTop.length
                ? `You are in the top 3 for "${inTop[0].keyword}"${missing ? `, but not for "${missing.keyword}".` : '.'}`
                : `You are not in the Google Maps top 3 for any keyword checked, for example "${packs[0].keyword}".`,
            badge: pct >= 60 ? 'Great' : pct >= 30 ? 'Fair' : 'Needs work'
        });
    }
    if (aio != null) {
        const d = aioPrev ? aio - aioPrev.google.inclusion : null;
        insights.push({
            tone: aio >= 50 ? 'good' : aio > 0 ? 'info' : 'warn',
            icon: <MessageSquareText className="w-4 h-4" />,
            title: d != null && d > 0 ? 'More AI Overview mentions' : `Named in ${aio}% of Google AI Overview checks`,
            text: `Your business was named or cited in ${aio}% of the Google AI Overview checks on the LLM Visibility page${d ? ` (${d > 0 ? '+' : ''}${d} points since the check before)` : ''}.`,
            badge: d != null && d > 0 ? 'Growing' : aio > 0 ? 'Visible' : 'Not yet'
        });
    } else {
        const top = packCompetitors(latest)[0];
        if (top && top.reviews > reviews) {
            insights.push({
                tone: 'warn',
                icon: <Star className="w-4 h-4" />,
                title: `${top.name} has ${(top.reviews - reviews).toLocaleString()} more reviews`,
                text: `They hold ${top.slots} top 3 spots with ${top.reviews.toLocaleString()} reviews against your ${reviews.toLocaleString()}.`,
                badge: 'Review gap'
            });
        }
    }

    // Keywords: tracked keywords first, with grid visibility where the keyword was scanned on the Local Search Grid.
    const gridBy = new Map(gridKeywords.map((k) => [String(k.keyword).toLowerCase(), k]));
    let kwRows: KeywordRow[] = trackerRows.map((r) => {
        const g = gridBy.get(r.keyword.toLowerCase());
        return { keyword: r.keyword, rank: r.rank, change: r.previous == null ? null : r.previous - r.rank, visibility: g ? Number(g.top3Percentage) : null };
    });
    for (const g of gridKeywords) {
        if (kwRows.some((r) => r.keyword.toLowerCase() === String(g.keyword).toLowerCase())) continue;
        kwRows.push({
            keyword: String(g.keyword),
            rank: Number(g.avgRank) || null,
            change: g.previousAvgRank ? Number((g.previousAvgRank - g.avgRank).toFixed(1)) : null,
            visibility: Number(g.top3Percentage)
        });
    }
    // Keywords from this report's Map Pack check: who is #1, and your place in the top 3 when not tracked elsewhere.
    for (const p of latest.packs || []) {
        const top3: any[] = p.top3 || [];
        const mine = top3.findIndex((r) => r.isYou);
        const leader = top3[0] && !top3[0].isYou ? String(top3[0].name) : undefined;
        const row = kwRows.find((r) => r.keyword.toLowerCase() === String(p.keyword).toLowerCase());
        if (row) row.leader = leader;
        else kwRows.push({ keyword: String(p.keyword), rank: mine >= 0 ? mine + 1 : null, change: null, visibility: null, leader, outOfTop3: mine < 0 });
    }
    kwRows = kwRows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 6);

    // Tile graphs: a trend line when there are 2+ checks, otherwise bars comparing the current values.
    const top2 = packCompetitors(latest).slice(0, 2);
    const total = Number(latest.totalSlots) || 1;
    const visBars: Bar[] = [
        { label: 'You', value: share, display: `${share}% of top 3 spots`, highlight: true },
        ...top2.map((c) => ({ label: c.name, value: Math.round((c.slots / total) * 100), display: `${Math.round((c.slots / total) * 100)}% of top 3 spots` }))
    ];
    const rankSource = ranked.length
        ? ranked.map((r) => ({ keyword: r.keyword, rank: r.rank }))
        : gridKeywords.filter((k) => Number(k.avgRank) > 0).map((k) => ({ keyword: String(k.keyword), rank: Number(k.avgRank) }));
    const rankBars: Bar[] = rankSource.slice(0, 6).map((r) => ({
        label: r.keyword,
        value: 21 - Math.min(21, r.rank),
        display: `Rank ${Number(r.rank.toFixed(1))} on Google Maps (taller bar = better rank)`,
        highlight: r.rank <= 3
    }));
    const reviewBars: Bar[] = [
        { label: 'You', value: reviews, display: `${reviews.toLocaleString()} Google reviews`, highlight: true },
        ...top2.map((c) => ({ label: c.name, value: c.reviews, display: `${c.reviews.toLocaleString()} Google reviews` }))
    ];
    const platformNames: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity' };
    const aioBars: Bar[] = llmReport
        ? [
              ...Object.entries(llmReport.platforms || {}).map(([id, p]: [string, any]) => ({
                  label: platformNames[id] || id,
                  value: Number(p?.mentionRate) || 0,
                  display: `Named in ${Number(p?.mentionRate) || 0}% of answers`
              })),
              ...(aio != null ? [{ label: 'Google AI Overviews', value: aio, display: `Named or cited in ${aio}% of checks`, highlight: true }] : [])
          ]
        : [];

    const rivals: Entity[] = packCompetitors(latest)
        .slice(0, 2)
        .map((c) => ({ name: c.name, share: Math.round((c.slots / (Number(latest.totalSlots) || 1)) * 100), rating: c.rating || null, reviews: c.reviews || null }));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiTile
                    icon={<MapPin className="w-4 h-4" />}
                    tone="bg-blue-50 text-blue-600"
                    label="Local Visibility"
                    info={{ title: 'Local visibility', body: ['Your share of all Google Maps top 3 spots for your keywords in this check (spots you hold ÷ spots checked).', 'The arrow compares with your previous check. The graph shows your recent checks, or until there are 2 checks, bars for you and your two strongest competitors (hover a bar).'] }}
                    value={`${share}%`}
                    delta={prev ? <Delta value={share - sharePct(prev)} unit=" pts" suffix="vs last check" /> : null}
                    note="First check"
                    spark={shareSpark}
                    bars={visBars}
                    barsMax={100}
                    sparkColor="#2563EB"
                />
                <KpiTile
                    icon={<BarChart3 className="w-4 h-4" />}
                    tone="bg-emerald-50 text-emerald-600"
                    label="Map Pack Rank"
                    info={{ title: 'Map Pack rank', body: ['Your average Google Maps position across your tracked keywords (Visibility Tracker), or your Local Search Grid average if nothing is tracked. Lower is better.', 'The arrow shows how many places you moved since the previous check (green = up). Each bar is one keyword: taller = better rank, solid = in the top 3 (hover a bar).'] }}
                    value={rankNow == null ? '—' : rankNow.toFixed(1)}
                    delta={rankDelta != null ? <Delta value={Number(rankDelta.toFixed(1))} suffix={Math.abs(rankDelta) === 1 ? 'position' : 'positions'} /> : null}
                    note={rankNow == null ? 'Track keywords to see this' : 'No previous check yet'}
                    bars={rankBars}
                    barsMax={20}
                    sparkColor="#10B981"
                />
                <KpiTile
                    icon={<Star className="w-4 h-4" />}
                    tone="bg-amber-50 text-amber-500"
                    label="GBP Reviews"
                    info={{ title: 'Google reviews', body: ['Your total Google review count and star rating from your business profile.', 'The bars compare your review count with your two strongest Map Pack competitors (hover a bar). Review history is not saved yet, so there is no trend line.'] }}
                    value={reviews ? reviews.toLocaleString() : '—'}
                    note={rating != null ? `${rating}★ rating` : 'No rating yet'}
                    bars={reviewBars.some((b) => b.value > 0) ? reviewBars : []}
                    sparkColor="#F59E0B"
                />
                <KpiTile
                    icon={<MessageSquareText className="w-4 h-4" />}
                    tone="bg-violet-50 text-violet-600"
                    label="AI Overview Mentions"
                    info={{ title: 'AI Overview mentions', body: ['The share of Google AI Overview checks that named or cited your business, from your latest LLM Visibility check.', 'The graph shows your recent checks, or until there are 2 checks, how often each AI assistant named you (hover a bar). Run LLM Visibility to update it.'] }}
                    value={aio == null ? '—' : `${aio}%`}
                    delta={aio != null && aioPrev ? <Delta value={aio - aioPrev.google.inclusion} unit=" pts" /> : null}
                    note={
                        aio == null ? (
                            <Link to="/llm-visibility" className="font-semibold text-[var(--brand-primary)] hover:underline">
                                Run LLM Visibility
                            </Link>
                        ) : (
                            'From LLM Visibility'
                        )
                    }
                    spark={aioSpark}
                    bars={aioBars}
                    barsMax={100}
                    sparkColor="#8B5CF6"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <PerformanceTrend history={history} rankRows={trackerRows} renderRanks={renderRanks} />
                <KeyInsights summary={latest?.report?.summary} insights={insights} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                <KeywordsTable rows={kwRows} />
                <CompetitorBars you={{ name: 'You', share, rating, reviews: reviews || null }} rivals={rivals} />
                <RecommendedActions items={recs} onViewReport={onViewReport} />
            </div>
        </div>
    );
}
