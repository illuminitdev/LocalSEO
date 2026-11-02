import { useId, useState } from 'react';

// Small SVG charts for the Citations page. All values come from saved scans.

export function Sparkline({ values, color }: { values: number[]; color: string }) {
    const gradientId = useId();
    if (values.length < 2) {
        return (
            <svg viewBox="0 0 100 36" className="w-24 h-9" aria-hidden="true">
                <line x1="2" y1="26" x2="98" y2="26" stroke={color} strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" opacity="0.35" />
            </svg>
        );
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * 96, 32 - ((v - min) / span) * 26] as const);
    const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
    const area = `M2,34 L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L98,34 Z`;
    return (
        <svg viewBox="0 0 100 36" className="w-24 h-9" aria-hidden="true">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

export type TrendPoint = { label: string; value: number };

export function TrendChart({ points, max, suffix = '', name }: { points: TrendPoint[]; max: number; suffix?: string; name: string }) {
    const [hover, setHover] = useState<number | null>(null);
    const gradientId = useId();
    const W = 640;
    const H = 230;
    const left = 40;
    const right = 24;
    const top = 28;
    const bottom = 30;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const yMax = Math.max(1, max);
    const x = (i: number) => (points.length === 1 ? left + plotW / 2 : left + (i / (points.length - 1)) * plotW);
    const y = (v: number) => top + plotH - (v / yMax) * plotH;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * yMax));
    const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
    const area = points.length > 1 ? `M${x(0)},${top + plotH} L${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' L')} L${x(points.length - 1)},${top + plotH} Z` : '';
    // Only a few date labels so they never collide.
    const labelEvery = Math.max(1, Math.ceil(points.length / 6));
    const lastIdx = points.length - 1;
    const active = hover ?? lastIdx;
    const activePoint = points[active];
    const bubbleX = Math.min(W - right - 30, Math.max(left + 30, x(active)));

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${name} by scan`} onMouseLeave={() => setHover(null)}>
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0" />
                </linearGradient>
            </defs>
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#EEF2F6" strokeWidth="1" />
                    <text x={left - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94A3B8">
                        {t}
                        {suffix}
                    </text>
                </g>
            ))}
            {points.map((p, i) =>
                i % labelEvery === 0 || i === lastIdx ? (
                    <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94A3B8">
                        {p.label}
                    </text>
                ) : null
            )}
            {area && <path d={area} fill={`url(#${gradientId})`} />}
            {points.length > 1 && (
                <polyline points={line} fill="none" stroke="var(--brand-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3 3" />}
            {points.map((p, i) => (
                <circle
                    key={`p${i}`}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={i === active ? 5.5 : 4}
                    fill={i === active ? 'var(--brand-primary)' : '#fff'}
                    stroke={i === active ? '#fff' : 'var(--brand-primary)'}
                    strokeWidth="2"
                />
            ))}
            {activePoint && (
                <g>
                    <rect x={bubbleX - 30} y={y(activePoint.value) - 34} width="60" height="22" rx="7" fill="var(--brand-primary)" />
                    <text x={bubbleX} y={y(activePoint.value) - 19} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--brand-primary-foreground, #fff)">
                        {activePoint.value}
                        {suffix}
                    </text>
                </g>
            )}
            {/* Hit areas wider than the markers. */}
            {points.map((p, i) => {
                const half = points.length === 1 ? plotW / 2 : plotW / (points.length - 1) / 2;
                return (
                    <rect key={`h${i}`} x={x(i) - half} y={top} width={half * 2} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)}>
                        <title>{`${p.label}: ${p.value}${suffix} ${name.toLowerCase()}`}</title>
                    </rect>
                );
            })}
        </svg>
    );
}

export type DonutSlice = { label: string; value: number; color: string };

export function Donut({ slices, total }: { slices: DonutSlice[]; total: number }) {
    const [hover, setHover] = useState<number | null>(null);
    const r = 56;
    const c = 2 * Math.PI * r;
    const sum = slices.reduce((acc, s) => acc + s.value, 0);
    const gap = slices.filter((s) => s.value > 0).length > 1 ? 3 : 0;
    let offset = 0;
    const active = hover != null ? slices[hover] : null;
    return (
        <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0" role="img" aria-label="Listings by source">
            <circle cx="80" cy="80" r={r} fill="none" stroke="#F1F5F9" strokeWidth="20" />
            {sum > 0 &&
                slices.map((s, i) => {
                    if (!s.value) return null;
                    const len = (s.value / sum) * c;
                    const dash = `${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`;
                    const el = (
                        <circle
                            key={s.label}
                            cx="80"
                            cy="80"
                            r={r}
                            fill="none"
                            stroke={s.color}
                            strokeWidth={hover === i ? 24 : 20}
                            strokeDasharray={dash}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 80 80)"
                            className="transition-all cursor-pointer"
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                        >
                            <title>{`${s.label}: ${s.value}`}</title>
                        </circle>
                    );
                    offset += len;
                    return el;
                })}
            <text x="80" y="80" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0F172A">
                {active ? active.value : total}
            </text>
            <text x="80" y="100" textAnchor="middle" fontSize="11" fill="#64748B">
                {active ? active.label : 'Listings'}
            </text>
        </svg>
    );
}
