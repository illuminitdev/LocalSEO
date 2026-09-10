import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../shared/utils';
import {
    formatDateLabel,
    monthDays,
    parseTimeToMinutes,
    slotsOverlap,
    suggestNextSlot,
    todayStr
} from './bookingUtils';

export type DateSlot = {
    id: string;
    startTime: string;
    endTime: string;
};

export type AvailabilitySettings = {
    timezone: string;
    minNoticeHours: number;
    maxDaysAhead: number;
    bufferMinutes: number;
};

type DateRuleInput = {
    date?: string;
    avail_date?: string;
    startTime?: string;
    start_time?: string;
    endTime?: string;
    end_time?: string;
    enabled?: boolean;
};

type WeeklyRuleInput = {
    dayOfWeek?: number;
    day_of_week?: number;
    startTime?: string;
    start_time?: string;
    endTime?: string;
    end_time?: string;
    enabled?: boolean;
};

export type AvailabilitySavePayload = {
    settings: AvailabilitySettings;
    weeklyRules: { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[];
    dateRules: { date: string; startTime: string; endTime: string; enabled: boolean }[];
};

type Props = {
    initialDateRules: DateRuleInput[];
    initialWeeklyRules?: WeeklyRuleInput[];
    settings: AvailabilitySettings;
    onSettingsChange: (settings: AvailabilitySettings) => void;
    onSave: (payload: AvailabilitySavePayload) => Promise<void>;
    saving?: boolean;
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function rulesToMap(rules: DateRuleInput[]): Record<string, DateSlot[]> {
    const map: Record<string, DateSlot[]> = {};
    for (const r of rules) {
        if (r.enabled === false) continue;
        const date = String(r.date || r.avail_date || '').slice(0, 10);
        const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
        const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
        if (!date || !startTime || !endTime) continue;
        if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) continue;
        if (!map[date]) map[date] = [];
        map[date].push({
            id: `${date}-${startTime}-${endTime}-${map[date].length}`,
            startTime,
            endTime
        });
    }
    for (const date of Object.keys(map)) {
        map[date].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    }
    return map;
}

/** Dates with an explicit override (open hours or closed). */
function closedDatesFromRules(rules: DateRuleInput[]): Set<string> {
    const byDate: Record<string, { any: boolean; open: boolean }> = {};
    for (const r of rules) {
        const date = String(r.date || r.avail_date || '').slice(0, 10);
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { any: false, open: false };
        byDate[date].any = true;
        const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
        const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
        if (
            r.enabled !== false &&
            startTime &&
            endTime &&
            parseTimeToMinutes(endTime) > parseTimeToMinutes(startTime)
        ) {
            byDate[date].open = true;
        }
    }
    return new Set(Object.keys(byDate).filter((d) => byDate[d].any && !byDate[d].open));
}

function weeklyRulesToMap(rules: WeeklyRuleInput[]): Record<number, DateSlot[]> {
    const map: Record<number, DateSlot[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const r of rules) {
        if (r.enabled === false) continue;
        const dow = Number(r.dayOfWeek ?? r.day_of_week);
        if (Number.isNaN(dow) || dow < 0 || dow > 6) continue;
        const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
        const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
        if (!startTime || !endTime) continue;
        map[dow].push({
            id: `w-${dow}-${startTime}-${endTime}-${map[dow].length}`,
            startTime,
            endTime
        });
    }
    for (let i = 0; i < 7; i++) {
        map[i].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    }
    return map;
}

function mapToDateRules(map: Record<string, DateSlot[]>, closedDates: Set<string>) {
    const rules: { date: string; startTime: string; endTime: string; enabled: boolean }[] = [];
    for (const [date, slots] of Object.entries(map)) {
        for (const slot of slots) {
            rules.push({
                date,
                startTime: slot.startTime,
                endTime: slot.endTime,
                enabled: true
            });
        }
    }
    for (const date of closedDates) {
        if (map[date]?.length) continue;
        // Sentinel closed override — wins over weekly template
        rules.push({ date, startTime: '00:00', endTime: '00:00', enabled: false });
    }
    return rules;
}

function mapToWeeklyRules(map: Record<number, DateSlot[]>) {
    const rules: { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[] = [];
    for (let dow = 0; dow < 7; dow++) {
        for (const slot of map[dow] || []) {
            rules.push({
                dayOfWeek: dow,
                startTime: slot.startTime,
                endTime: slot.endTime,
                enabled: true
            });
        }
    }
    return rules;
}

function validateSlotsList(label: string, slots: DateSlot[]): string | null {
    for (const slot of slots) {
        if (parseTimeToMinutes(slot.endTime) <= parseTimeToMinutes(slot.startTime)) {
            return `${label}: end time must be after start time.`;
        }
    }
    const sorted = [...slots].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            if (slotsOverlap(sorted[i], sorted[j])) {
                return `${label}: time blocks cannot overlap.`;
            }
        }
    }
    return null;
}

function validateAll(weekly: Record<number, DateSlot[]>, dateMap: Record<string, DateSlot[]>): string | null {
    for (let dow = 0; dow < 7; dow++) {
        const err = validateSlotsList(DAY_LABELS[dow], weekly[dow] || []);
        if (err) return err;
    }
    for (const [date, slots] of Object.entries(dateMap)) {
        const err = validateSlotsList(formatDateLabel(date), slots);
        if (err) return err;
    }
    return null;
}

function dayOfWeekForDate(dateStr: string): number {
    return new Date(`${dateStr}T12:00:00`).getDay();
}

function cloneSlots(slots: DateSlot[], idPrefix: string): DateSlot[] {
    return slots.map((s, i) => ({
        id: `${idPrefix}-${s.startTime}-${s.endTime}-${i}-${Date.now()}`,
        startTime: s.startTime,
        endTime: s.endTime
    }));
}

export default function AvailabilityEditor({
    initialDateRules,
    initialWeeklyRules = [],
    settings,
    onSettingsChange,
    onSave,
    saving
}: Props) {
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState('');
    const [weeklySlots, setWeeklySlots] = useState<Record<number, DateSlot[]>>(() =>
        weeklyRulesToMap(initialWeeklyRules)
    );
    const [dateSlots, setDateSlots] = useState<Record<string, DateSlot[]>>(() => rulesToMap(initialDateRules));
    const [closedDates, setClosedDates] = useState<Set<string>>(() => closedDatesFromRules(initialDateRules));
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const days = useMemo(() => monthDays(month.year, month.month), [month]);
    const overrideDates = useMemo(() => {
        const set = new Set<string>([...Object.keys(dateSlots).filter((d) => dateSlots[d]?.length), ...closedDates]);
        return set;
    }, [dateSlots, closedDates]);

    const selectedSlots = selectedDate ? dateSlots[selectedDate] || [] : [];
    const selectedIsClosed = selectedDate ? closedDates.has(selectedDate) : false;
    const selectedHasOverride = selectedDate ? overrideDates.has(selectedDate) : false;
    const inheritedWeekly = selectedDate ? weeklySlots[dayOfWeekForDate(selectedDate)] || [] : [];

    const updateWeeklySlot = (dow: number, id: string, patch: Partial<DateSlot>) => {
        setWeeklySlots((prev) => ({
            ...prev,
            [dow]: (prev[dow] || []).map((s) => (s.id === id ? { ...s, ...patch } : s))
        }));
    };

    const deleteWeeklySlot = (dow: number, id: string) => {
        setWeeklySlots((prev) => ({
            ...prev,
            [dow]: (prev[dow] || []).filter((s) => s.id !== id)
        }));
        if (editingId === id) setEditingId(null);
    };

    const addWeeklySlot = (dow: number) => {
        const existing = weeklySlots[dow] || [];
        const next = suggestNextSlot(existing);
        const slot: DateSlot = {
            id: `wslot-${dow}-${Date.now()}`,
            startTime: next.startTime,
            endTime: next.endTime
        };
        setWeeklySlots((prev) => ({
            ...prev,
            [dow]: [...(prev[dow] || []), slot].sort(
                (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
            )
        }));
        setEditingId(slot.id);
    };

    const applyDayToWholeWeek = (sourceDow: number) => {
        const source = weeklySlots[sourceDow] || [];
        if (!source.length) {
            setError(`Add hours on ${DAY_LABELS[sourceDow]} first, then apply to the whole week.`);
            return;
        }
        setError('');
        setWeeklySlots((prev) => {
            const next: Record<number, DateSlot[]> = { ...prev };
            for (let dow = 0; dow < 7; dow++) {
                next[dow] = cloneSlots(source, `w-${dow}`);
            }
            return next;
        });
    };

    const updateDateSlot = (date: string, id: string, patch: Partial<DateSlot>) => {
        setClosedDates((prev) => {
            if (!prev.has(date)) return prev;
            const n = new Set(prev);
            n.delete(date);
            return n;
        });
        setDateSlots((prev) => ({
            ...prev,
            [date]: (prev[date] || []).map((s) => (s.id === id ? { ...s, ...patch } : s))
        }));
    };

    const deleteDateSlot = (date: string, id: string) => {
        setDateSlots((prev) => {
            const next = (prev[date] || []).filter((s) => s.id !== id);
            const copy = { ...prev };
            if (next.length) copy[date] = next;
            else delete copy[date];
            return copy;
        });
        if (editingId === id) setEditingId(null);
    };

    const addDateSlot = (date: string) => {
        setClosedDates((prev) => {
            if (!prev.has(date)) return prev;
            const n = new Set(prev);
            n.delete(date);
            return n;
        });
        const existing = dateSlots[date] || [];
        const next = suggestNextSlot(existing.length ? existing : inheritedWeekly);
        const slot: DateSlot = {
            id: `slot-${date}-${Date.now()}`,
            startTime: next.startTime,
            endTime: next.endTime
        };
        setDateSlots((prev) => ({
            ...prev,
            [date]: [...(prev[date] || []), slot].sort(
                (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
            )
        }));
        setEditingId(slot.id);
    };

    const markDateClosed = (date: string) => {
        setDateSlots((prev) => {
            const copy = { ...prev };
            delete copy[date];
            return copy;
        });
        setClosedDates((prev) => new Set(prev).add(date));
        setEditingId(null);
    };

    const clearDateOverride = (date: string) => {
        setDateSlots((prev) => {
            const copy = { ...prev };
            delete copy[date];
            return copy;
        });
        setClosedDates((prev) => {
            const n = new Set(prev);
            n.delete(date);
            return n;
        });
        setEditingId(null);
    };

    const handleSave = async () => {
        const validationError = validateAll(weeklySlots, dateSlots);
        if (validationError) {
            setError(validationError);
            return;
        }
        setError('');
        await onSave({
            settings,
            weeklyRules: mapToWeeklyRules(weeklySlots),
            dateRules: mapToDateRules(dateSlots, closedDates)
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-bold text-[#0F172A]">Your availability</h2>
                <p className="text-sm text-[#64748B] mt-1">
                    Set weekly hours once (they repeat every week). Use the calendar only for one-off changes or closed
                    days.
                </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="text-xs font-bold text-[#64748B]">
                    Min notice (hours)
                    <input
                        type="number"
                        min={0}
                        value={settings.minNoticeHours}
                        onChange={(e) => onSettingsChange({ ...settings, minNoticeHours: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-2 text-sm"
                    />
                </label>
                <label className="text-xs font-bold text-[#64748B]">
                    Max days ahead
                    <input
                        type="number"
                        min={1}
                        value={settings.maxDaysAhead}
                        onChange={(e) => onSettingsChange({ ...settings, maxDaysAhead: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-2 text-sm"
                    />
                </label>
                <label className="text-xs font-bold text-[#64748B]">
                    Buffer (min)
                    <input
                        type="number"
                        min={0}
                        value={settings.bufferMinutes}
                        onChange={(e) => onSettingsChange({ ...settings, bufferMinutes: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-2 text-sm"
                    />
                </label>
                <label className="text-xs font-bold text-[#64748B]">
                    Timezone
                    <input
                        value={settings.timezone}
                        onChange={(e) => onSettingsChange({ ...settings, timezone: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-2 py-2 text-sm"
                    />
                </label>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                <div>
                    <h3 className="font-bold text-[#0F172A] text-sm">Weekly hours</h3>
                    <p className="text-xs text-[#64748B] mt-1">
                        Set one day, then use <strong>Apply to whole week</strong> to lock the same times on every day.
                    </p>
                </div>
                <div className="space-y-3">
                    {DAY_LABELS.map((label, dow) => {
                        const slots = weeklySlots[dow] || [];
                        return (
                            <div key={dow} className="rounded-xl border border-[#E2E8F0] p-3 bg-[#FAFBFC]">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <p className="text-sm font-bold text-[#0F172A]">{label}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => applyDayToWholeWeek(dow)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[11px] font-bold text-[#0F172A]"
                                            title="Copy this day's hours to Mon–Sun"
                                        >
                                            <Copy className="w-3 h-3" /> Apply to whole week
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addWeeklySlot(dow)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F59E0B] text-white text-[11px] font-bold"
                                        >
                                            <Plus className="w-3 h-3" /> Add hours
                                        </button>
                                    </div>
                                </div>
                                {slots.length === 0 ? (
                                    <p className="text-xs text-[#94A3B8]">No hours — closed by default this weekday.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {slots.map((slot) => {
                                            const isEditing = editingId === slot.id;
                                            return (
                                                <div
                                                    key={slot.id}
                                                    className={cn(
                                                        'flex items-center gap-2 p-2 rounded-xl border',
                                                        isEditing
                                                            ? 'border-[#F59E0B] bg-[#F59E0B]/5'
                                                            : 'border-[#E2E8F0] bg-white'
                                                    )}
                                                >
                                                    <input
                                                        type="time"
                                                        value={slot.startTime}
                                                        onChange={(e) =>
                                                            updateWeeklySlot(dow, slot.id, { startTime: e.target.value })
                                                        }
                                                        className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                    />
                                                    <span className="text-[#94A3B8] text-xs shrink-0">to</span>
                                                    <input
                                                        type="time"
                                                        value={slot.endTime}
                                                        onChange={(e) =>
                                                            updateWeeklySlot(dow, slot.id, { endTime: e.target.value })
                                                        }
                                                        className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingId(isEditing ? null : slot.id)}
                                                        className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] shrink-0"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteWeeklySlot(dow, slot.id)}
                                                        className="p-2 rounded-lg border border-red-100 text-red-600 shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0] border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <div className="p-5 bg-[#FAFBFC]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-[#F59E0B]" /> Date overrides
                        </h3>
                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() =>
                                    setMonth((m) =>
                                        m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }
                                    )
                                }
                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setMonth((m) =>
                                        m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }
                                    )
                                }
                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-[#64748B] mb-1">
                        {new Date(month.year, month.month).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mb-3">
                        Amber = custom hours or closed. Other days use weekly hours.
                    </p>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#64748B] mb-1">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d}>{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((d, i) => {
                            if (!d.inMonth) return <div key={i} />;
                            const isPast = d.date < todayStr();
                            const hasOverride = overrideDates.has(d.date);
                            const isClosed = closedDates.has(d.date);
                            const hasWeekly = (weeklySlots[dayOfWeekForDate(d.date)] || []).length > 0;
                            return (
                                <button
                                    key={d.date}
                                    type="button"
                                    disabled={isPast}
                                    onClick={() => {
                                        setSelectedDate(d.date);
                                        setEditingId(null);
                                        setError('');
                                    }}
                                    className={cn(
                                        'aspect-square rounded-lg text-sm font-bold transition relative flex flex-col items-center justify-center',
                                        isPast
                                            ? 'text-[#CBD5E1] cursor-not-allowed'
                                            : 'hover:bg-[#0F172A] hover:text-white border border-[#E2E8F0] bg-white',
                                        selectedDate === d.date && 'bg-[#0F172A] text-white border-[#0F172A]',
                                        hasOverride && selectedDate !== d.date && 'ring-1 ring-[#F59E0B]/50',
                                        !hasOverride && hasWeekly && selectedDate !== d.date && 'bg-[#FFFBEB]'
                                    )}
                                >
                                    {d.date.slice(8)}
                                    {(hasOverride || hasWeekly) && (
                                        <span
                                            className={cn(
                                                'absolute bottom-1 w-1 h-1 rounded-full',
                                                selectedDate === d.date
                                                    ? 'bg-white'
                                                    : isClosed
                                                      ? 'bg-red-500'
                                                      : 'bg-[#F59E0B]'
                                            )}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-5 bg-white min-h-[320px]">
                    {!selectedDate ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-12">
                            <Calendar className="w-10 h-10 text-[#CBD5E1] mb-3" />
                            <p className="text-sm text-[#64748B]">
                                Pick a date to override weekly hours for that day only.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-bold text-[#0F172A]">{formatDateLabel(selectedDate)}</h3>
                                    <p className="text-xs text-[#64748B] mt-0.5">
                                        {selectedIsClosed
                                            ? 'Closed (override) — customers cannot book this date.'
                                            : selectedHasOverride
                                              ? 'Custom hours for this date only.'
                                              : inheritedWeekly.length
                                                ? 'Using weekly hours — add an override to change this date.'
                                                : 'No weekly hours for this weekday — add an override to open this date.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => addDateSlot(selectedDate)}
                                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold shrink-0"
                                >
                                    <Plus className="w-4 h-4" /> Add hours
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => markDateClosed(selectedDate)}
                                    className="px-3 py-1.5 rounded-lg border border-red-100 text-red-700 text-xs font-bold bg-red-50"
                                >
                                    Mark closed
                                </button>
                                {selectedHasOverride && (
                                    <button
                                        type="button"
                                        onClick={() => clearDateOverride(selectedDate)}
                                        className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#64748B] text-xs font-bold"
                                    >
                                        Clear override (use weekly)
                                    </button>
                                )}
                            </div>

                            {selectedIsClosed ? (
                                <div className="border border-dashed border-red-200 rounded-xl p-8 text-center bg-red-50/50">
                                    <p className="text-sm text-red-700 font-medium">This date is marked closed.</p>
                                </div>
                            ) : selectedSlots.length === 0 ? (
                                <div className="border border-dashed border-[#E2E8F0] rounded-xl p-6 text-center space-y-2">
                                    <p className="text-sm text-[#94A3B8]">No date override.</p>
                                    {inheritedWeekly.length > 0 && (
                                        <p className="text-xs text-[#64748B]">
                                            Weekly: {inheritedWeekly.map((s) => `${s.startTime}–${s.endTime}`).join(', ')}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {selectedSlots.map((slot) => {
                                        const isEditing = editingId === slot.id;
                                        return (
                                            <div
                                                key={slot.id}
                                                className={cn(
                                                    'flex items-center gap-2 p-3 rounded-xl border',
                                                    isEditing
                                                        ? 'border-[#F59E0B] bg-[#F59E0B]/5'
                                                        : 'border-[#E2E8F0] bg-[#FAFBFC]'
                                                )}
                                            >
                                                <input
                                                    type="time"
                                                    value={slot.startTime}
                                                    onChange={(e) =>
                                                        updateDateSlot(selectedDate, slot.id, {
                                                            startTime: e.target.value
                                                        })
                                                    }
                                                    className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                />
                                                <span className="text-[#94A3B8] text-xs shrink-0">to</span>
                                                <input
                                                    type="time"
                                                    value={slot.endTime}
                                                    onChange={(e) =>
                                                        updateDateSlot(selectedDate, slot.id, { endTime: e.target.value })
                                                    }
                                                    className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingId(isEditing ? null : slot.id)}
                                                    className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] shrink-0"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteDateSlot(selectedDate, slot.id)}
                                                    className="p-2 rounded-lg border border-red-100 text-red-600 shrink-0"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-[#F59E0B] text-white font-bold text-sm disabled:opacity-60"
            >
                {saving ? 'Saving…' : 'Save availability'}
            </button>
        </div>
    );
}
