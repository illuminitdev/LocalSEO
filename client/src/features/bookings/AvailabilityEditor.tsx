import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
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
    /** Legacy recurring rules — ignored in UI; cleared on save so hours no longer repeat forever. */
    initialWeeklyRules?: WeeklyRuleInput[];
    settings: AvailabilitySettings;
    onSettingsChange: (settings: AvailabilitySettings) => void;
    onSave: (payload: AvailabilitySavePayload) => Promise<void>;
    saving?: boolean;
};

function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Sunday–Saturday week containing `dateStr` (matches calendar grid). */
function weekDatesFor(dateStr: string): string[] {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return [];
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay());
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
        const x = new Date(sunday);
        x.setDate(sunday.getDate() + i);
        out.push(toDateKey(x));
    }
    return out;
}

/** Today + future days in a Sun–Sat week (past days are never locked). */
function remainingWeekDates(week: string[]): string[] {
    const today = todayStr();
    return week.filter((d) => d >= today);
}

function formatWeekRange(dates: string[]): string {
    if (!dates.length) return '';
    if (dates.length === 1) return formatDateLabel(dates[0]);
    return `${formatDateLabel(dates[0])} – ${formatDateLabel(dates[dates.length - 1])}`;
}

function rulesToOpenMap(rules: DateRuleInput[]): Record<string, DateSlot[]> {
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

function cloneSlots(slots: DateSlot[], idPrefix: string): DateSlot[] {
    return slots.map((s, i) => ({
        id: `${idPrefix}-${s.startTime}-${s.endTime}-${i}`,
        startTime: s.startTime,
        endTime: s.endTime
    }));
}

function slotsForWeek(dateSlots: Record<string, DateSlot[]>, weekDates: string[]): DateSlot[] {
    const remaining = remainingWeekDates(weekDates);
    for (const d of remaining) {
        if (dateSlots[d]?.length) return cloneSlots(dateSlots[d], 'edit');
    }
    for (const d of weekDates) {
        if (dateSlots[d]?.length) return cloneSlots(dateSlots[d], 'edit');
    }
    return [];
}

function mapToDateRules(dateSlots: Record<string, DateSlot[]>, closedDates: Set<string>) {
    const rules: { date: string; startTime: string; endTime: string; enabled: boolean }[] = [];
    for (const [date, slots] of Object.entries(dateSlots)) {
        if (closedDates.has(date)) continue;
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
        rules.push({ date, startTime: '00:00', endTime: '00:00', enabled: false });
    }
    return rules;
}

function validateSlotsList(slots: DateSlot[]): string | null {
    for (const slot of slots) {
        if (parseTimeToMinutes(slot.endTime) <= parseTimeToMinutes(slot.startTime)) {
            return 'End time must be after start time.';
        }
    }
    const sorted = [...slots].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            if (slotsOverlap(sorted[i], sorted[j])) {
                return 'Time blocks cannot overlap.';
            }
        }
    }
    return null;
}

export default function AvailabilityEditor({
    initialDateRules,
    initialWeeklyRules: _initialWeeklyRules = [],
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
    const [dateSlots, setDateSlots] = useState<Record<string, DateSlot[]>>(() =>
        rulesToOpenMap(initialDateRules)
    );
    const [closedDates, setClosedDates] = useState<Set<string>>(() => closedDatesFromRules(initialDateRules));
    const [weekSlots, setWeekSlots] = useState<DateSlot[]>([]);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const days = useMemo(() => monthDays(month.year, month.month), [month]);
    const selectedWeek = selectedDate ? weekDatesFor(selectedDate) : [];
    const selectedRemaining = useMemo(() => remainingWeekDates(selectedWeek), [selectedWeek]);
    const selectedIsClosed = selectedDate ? closedDates.has(selectedDate) : false;
    const openDates = useMemo(
        () => new Set(Object.keys(dateSlots).filter((d) => (dateSlots[d] || []).length > 0)),
        [dateSlots]
    );

    /** Apply hours only to today + future days; strip open hours from past days in that week. */
    const applySlotsToWeek = (week: string[], slots: DateSlot[], closed: Set<string>) => {
        const today = todayStr();
        setDateSlots((prev) => {
            const next = { ...prev };
            for (const d of week) {
                if (d < today) {
                    delete next[d];
                    continue;
                }
                if (closed.has(d)) {
                    delete next[d];
                    continue;
                }
                if (slots.length === 0) {
                    delete next[d];
                } else {
                    next[d] = cloneSlots(slots, d);
                }
            }
            return next;
        });
    };

    const selectDate = (date: string) => {
        const week = weekDatesFor(date);
        setSelectedDate(date);
        setWeekSlots(slotsForWeek(dateSlots, week));
        setEditingId(null);
        setError('');
    };

    const updateSlot = (id: string, patch: Partial<DateSlot>) => {
        setWeekSlots((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
            if (selectedWeek.length) applySlotsToWeek(selectedWeek, next, closedDates);
            return next;
        });
    };

    const deleteSlot = (id: string) => {
        setWeekSlots((prev) => {
            const next = prev.filter((s) => s.id !== id);
            if (selectedWeek.length) applySlotsToWeek(selectedWeek, next, closedDates);
            return next;
        });
        if (editingId === id) setEditingId(null);
    };

    const addSlot = () => {
        if (!selectedDate || !selectedWeek.length) return;
        setClosedDates((prev) => {
            if (!prev.has(selectedDate)) return prev;
            const n = new Set(prev);
            n.delete(selectedDate);
            return n;
        });
        const nextSuggest = suggestNextSlot(weekSlots);
        const slot: DateSlot = {
            id: `slot-${Date.now()}`,
            startTime: nextSuggest.startTime,
            endTime: nextSuggest.endTime
        };
        setWeekSlots((prev) => {
            const next = [...prev, slot].sort(
                (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
            );
            const closed = new Set(closedDates);
            closed.delete(selectedDate);
            applySlotsToWeek(selectedWeek, next, closed);
            return next;
        });
        setEditingId(slot.id);
        setError('');
    };

    const markDateClosed = (date: string) => {
        setDateSlots((prev) => {
            const copy = { ...prev };
            delete copy[date];
            return copy;
        });
        setClosedDates((prev) => new Set(prev).add(date));
        setEditingId(null);
        setError('');
    };

    const clearClosed = (date: string) => {
        setClosedDates((prev) => {
            const n = new Set(prev);
            n.delete(date);
            return n;
        });
        // Restore this day from the rest of the week's hours if any
        const week = weekDatesFor(date);
        const restored = slotsForWeek(dateSlots, week.filter((d) => d !== date));
        if (restored.length) {
            setDateSlots((prev) => ({ ...prev, [date]: cloneSlots(restored, date) }));
            if (selectedDate === date) setWeekSlots(cloneSlots(restored, 'edit'));
        }
        setEditingId(null);
    };

    const clearThisWeek = () => {
        if (!selectedWeek.length) return;
        setDateSlots((prev) => {
            const next = { ...prev };
            for (const d of selectedWeek) delete next[d];
            return next;
        });
        setClosedDates((prev) => {
            const n = new Set(prev);
            for (const d of selectedRemaining) n.delete(d);
            return n;
        });
        setWeekSlots([]);
        setEditingId(null);
        setError('');
    };

    const handleSave = async () => {
        if (selectedRemaining.length && weekSlots.length) {
            const validationError = validateSlotsList(weekSlots);
            if (validationError) {
                setError(validationError);
                return;
            }
        }

        const today = todayStr();
        const finalSlots: Record<string, DateSlot[]> = { ...dateSlots };
        if (selectedWeek.length) {
            for (const d of selectedWeek) {
                if (d < today) {
                    delete finalSlots[d];
                    continue;
                }
                if (closedDates.has(d)) {
                    delete finalSlots[d];
                } else if (weekSlots.length === 0) {
                    delete finalSlots[d];
                } else {
                    finalSlots[d] = cloneSlots(weekSlots, d);
                }
            }
        }

        for (const [date, slots] of Object.entries(finalSlots)) {
            if (closedDates.has(date)) continue;
            const err = validateSlotsList(slots);
            if (err) {
                setError(`${formatDateLabel(date)}: ${err}`);
                return;
            }
        }

        setError('');
        setDateSlots(finalSlots);

        await onSave({
            settings,
            // Clear forever-recurring weekly template — availability is week-specific date rules only
            weeklyRules: [],
            dateRules: mapToDateRules(finalSlots, closedDates)
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-bold text-[#0F172A]">Your availability</h2>
                <p className="text-sm text-[#64748B] mt-1">
                    Pick any day, set hours, Save — locks remaining days that week (today onward), not past days.
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

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0] border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <div className="p-5 bg-[#FAFBFC]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-[#F59E0B]" /> Hours by week
                        </h3>
                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() =>
                                    setMonth((m) =>
                                        m.month === 0
                                            ? { year: m.year - 1, month: 11 }
                                            : { year: m.year, month: m.month - 1 }
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
                                        m.month === 11
                                            ? { year: m.year + 1, month: 0 }
                                            : { year: m.year, month: m.month + 1 }
                                    )
                                }
                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-[#64748B] mb-1">
                        {new Date(month.year, month.month).toLocaleString('en-GB', {
                            month: 'long',
                            year: 'numeric'
                        })}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mb-3">
                        Amber = open hours (today + future). Past days in a week are never locked.
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
                            const isClosed = closedDates.has(d.date);
                            const hasHours = !isPast && openDates.has(d.date);
                            const inSelectedWeek = selectedWeek.includes(d.date);
                            return (
                                <button
                                    key={d.date}
                                    type="button"
                                    disabled={isPast}
                                    onClick={() => selectDate(d.date)}
                                    className={cn(
                                        'aspect-square rounded-lg text-sm font-bold transition relative flex flex-col items-center justify-center',
                                        isPast
                                            ? 'text-[#CBD5E1] cursor-not-allowed'
                                            : 'hover:bg-[#0F172A] hover:text-white border border-[#E2E8F0] bg-white',
                                        selectedDate === d.date && 'bg-[#0F172A] text-white border-[#0F172A]',
                                        inSelectedWeek &&
                                            selectedDate !== d.date &&
                                            'ring-1 ring-[#F59E0B]/40',
                                        !isClosed && hasHours && selectedDate !== d.date && 'bg-[#FFFBEB]'
                                    )}
                                >
                                    {d.date.slice(8)}
                                    {(hasHours || isClosed) && (
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
                                Pick a day to set hours for the rest of that week (today onward), then Save.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-bold text-[#0F172A]">{formatDateLabel(selectedDate)}</h3>
                                    <p className="text-xs text-[#64748B] mt-0.5">
                                        {selectedIsClosed
                                            ? 'Closed this date only — customers cannot book.'
                                            : selectedRemaining.length
                                              ? `Hours apply to remaining days this week: ${formatWeekRange(selectedRemaining)}.`
                                              : 'All days in this week are in the past — pick a future week.'}
                                    </p>
                                </div>
                                {!selectedIsClosed && (
                                    <button
                                        type="button"
                                        onClick={addSlot}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold shrink-0"
                                    >
                                        <Plus className="w-4 h-4" /> Add hours
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => markDateClosed(selectedDate)}
                                    className="px-3 py-1.5 rounded-lg border border-red-100 text-red-700 text-xs font-bold bg-red-50"
                                >
                                    Mark closed
                                </button>
                                {selectedIsClosed && (
                                    <button
                                        type="button"
                                        onClick={() => clearClosed(selectedDate)}
                                        className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#64748B] text-xs font-bold"
                                    >
                                        Clear closed
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={clearThisWeek}
                                    className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#64748B] text-xs font-bold"
                                >
                                    Clear this week
                                </button>
                            </div>

                            {selectedIsClosed ? (
                                <div className="border border-dashed border-red-200 rounded-xl p-8 text-center bg-red-50/50">
                                    <p className="text-sm text-red-700 font-medium">This date is marked closed.</p>
                                </div>
                            ) : weekSlots.length === 0 ? (
                                <div className="border border-dashed border-[#E2E8F0] rounded-xl p-6 text-center">
                                    <p className="text-sm text-[#94A3B8]">
                                        No hours for this week — add hours, then Save.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {weekSlots.map((slot) => {
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
                                                        updateSlot(slot.id, { startTime: e.target.value })
                                                    }
                                                    className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                />
                                                <span className="text-[#94A3B8] text-xs shrink-0">to</span>
                                                <input
                                                    type="time"
                                                    value={slot.endTime}
                                                    onChange={(e) =>
                                                        updateSlot(slot.id, { endTime: e.target.value })
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
                                                    onClick={() => deleteSlot(slot.id)}
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
