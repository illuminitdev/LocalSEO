import { useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type DayHours = { open: boolean; from: string; to: string };

const DEFAULT_WEEK: DayHours[] = DAYS.map((_, i) => ({ open: i < 5, from: '09:00', to: '17:00' }));

function to12h(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function to24h(raw: string): string | null {
    const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const ampm = (m[3] || '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function dayIndex(raw: string): number {
    return DAYS.findIndex((d) => raw.trim().toLowerCase().startsWith(d.toLowerCase()));
}

function parseHours(text: string): DayHours[] | null {
    const value = String(text || '').trim();
    if (!value) return null;
    const week: DayHours[] = DAYS.map(() => ({ open: false, from: '09:00', to: '17:00' }));
    for (const part of value.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)) {
        const m = part.match(/^([a-z]+)(?:\s*[-–]\s*([a-z]+))?\s*:?\s+(.+)$/i);
        if (!m) return null;
        const start = dayIndex(m[1]);
        const end = m[2] ? dayIndex(m[2]) : start;
        if (start < 0 || end < 0) return null;
        const rest = m[3].trim();
        let slot: DayHours;
        if (/^closed$/i.test(rest)) {
            slot = { open: false, from: '09:00', to: '17:00' };
        } else if (/^(open )?24 ?(hours|hrs)$/i.test(rest)) {
            slot = { open: true, from: '00:00', to: '23:59' };
        } else {
            const [a, b] = rest.split(/\s*[-–]\s*/);
            const from = a ? to24h(a) : null;
            const to = b ? to24h(b) : null;
            if (!from || !to) return null;
            slot = { open: true, from, to };
        }
        // "Fri-Mon" wraps round the week.
        for (let i = start, n = 0; n < 7; i = (i + 1) % 7, n++) {
            week[i] = { ...slot };
            if (i === end) break;
        }
    }
    return week;
}

function formatHours(week: DayHours[]): string {
    const label = (d: DayHours) => (d.open ? `${to12h(d.from)} - ${to12h(d.to)}` : 'Closed');
    const parts: string[] = [];
    let i = 0;
    while (i < 7) {
        let j = i;
        while (j + 1 < 7 && label(week[j + 1]) === label(week[i])) j++;
        parts.push(`${i === j ? DAYS[i] : `${DAYS[i]}-${DAYS[j]}`} ${label(week[i])}`);
        i = j + 1;
    }
    return parts.join(', ');
}

const timeInput =
    'px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded-lg font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] disabled:opacity-40';

export default function HoursPicker({ value, onChange }: { value: string; onChange: (hours: string) => void }) {
    const [unreadable] = useState(() => Boolean(String(value || '').trim()) && !parseHours(value));
    const [week, setWeek] = useState<DayHours[]>(() => parseHours(value) || DEFAULT_WEEK);

    const update = (next: DayHours[]) => {
        setWeek(next);
        onChange(formatHours(next));
    };
    const setDay = (i: number, patch: Partial<DayHours>) => update(week.map((d, k) => (k === i ? { ...d, ...patch } : d)));

    return (
        <div className="border border-[#E2E8F0] rounded-xl p-3 space-y-2">
            {unreadable ? (
                <p className="text-[11px] text-amber-700">
                    Saved hours “{value}” could not be read. Set them below; they replace the old text when you save.
                </p>
            ) : null}
            {week.map((d, i) => (
                <div key={DAYS[i]} className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="w-10 font-bold text-gray-700">{DAYS[i]}</span>
                    <label className="flex items-center gap-1.5 w-20 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={d.open}
                            onChange={(e) => setDay(i, { open: e.target.checked })}
                            className="w-4 h-4 accent-[var(--brand-primary)]"
                        />
                        <span className={d.open ? 'text-[#0F172A] font-medium' : 'text-gray-400'}>{d.open ? 'Open' : 'Closed'}</span>
                    </label>
                    <input
                        type="time"
                        value={d.from}
                        disabled={!d.open}
                        onChange={(e) => setDay(i, { from: e.target.value })}
                        className={timeInput}
                        aria-label={`${DAYS[i]} opening time`}
                    />
                    <span className="text-gray-400">to</span>
                    <input
                        type="time"
                        value={d.to}
                        disabled={!d.open}
                        onChange={(e) => setDay(i, { to: e.target.value })}
                        className={timeInput}
                        aria-label={`${DAYS[i]} closing time`}
                    />
                    {i === 0 ? (
                        <button
                            type="button"
                            onClick={() => update(week.map(() => ({ ...week[0] })))}
                            className="text-[11px] font-bold text-[var(--brand-primary)] hover:underline cursor-pointer"
                        >
                            Copy to all days
                        </button>
                    ) : null}
                </div>
            ))}
            <p className="text-[11px] text-gray-400 pt-1">Shown as: {formatHours(week)}</p>
        </div>
    );
}
