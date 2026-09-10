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
    initialWeeklyRules?: WeeklyRuleInput[];
    settings: AvailabilitySettings;
    onSettingsChange: (settings: AvailabilitySettings) => void;
    onSave: (payload: AvailabilitySavePayload) => Promise<void>;
    saving?: boolean;
};

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

function weeklyRulesToTemplate(rules: WeeklyRuleInput[]): DateSlot[] {
    const byDow: Record<number, DateSlot[]> = {};
    for (let i = 0; i < 7; i++) byDow[i] = [];
    for (const r of rules) {
        if (r.enabled === false) continue;
        const dow = Number(r.dayOfWeek ?? r.day_of_week);
        if (Number.isNaN(dow) || dow < 0 || dow > 6) continue;
        const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
        const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
        if (!startTime || !endTime) continue;
        if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) continue;
        byDow[dow].push({
            id: `w-${dow}-${startTime}-${endTime}-${byDow[dow].length}`,
            startTime,
            endTime
        });
    }
    for (let i = 0; i < 7; i++) {
        byDow[i].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    }
    // Prefer the fullest weekday as the shared template (all days should match after save).
    let best: DateSlot[] = [];
    for (let i = 0; i < 7; i++) {
        if ((byDow[i] || []).length > best.length) best = byDow[i];
    }
    return cloneSlots(best, 'tpl');
}

function cloneSlots(slots: DateSlot[], idPrefix: string): DateSlot[] {
    return slots.map((s, i) => ({
        id: `${idPrefix}-${s.startTime}-${s.endTime}-${i}`,
        startTime: s.startTime,
        endTime: s.endTime
    }));
}

function mapToWeeklyRules(template: DateSlot[]) {
    const rules: { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[] = [];
    for (let dow = 0; dow < 7; dow++) {
        for (const slot of template) {
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

/** Closed dates only — open per-date overrides are cleared on save (weekly template wins). */
function mapToClosedDateRules(closedDates: Set<string>) {
    return [...closedDates].map((date) => ({
        date,
        startTime: '00:00',
        endTime: '00:00',
        enabled: false
    }));
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
    /** Hours applied to every weekday on save. */
    const [templateSlots, setTemplateSlots] = useState<DateSlot[]>(() =>
        weeklyRulesToTemplate(initialWeeklyRules)
    );
    const [closedDates, setClosedDates] = useState<Set<string>>(() => closedDatesFromRules(initialDateRules));
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const days = useMemo(() => monthDays(month.year, month.month), [month]);
    const hasWeeklyHours = templateSlots.length > 0;
    const selectedIsClosed = selectedDate ? closedDates.has(selectedDate) : false;

    const updateSlot = (id: string, patch: Partial<DateSlot>) => {
        setTemplateSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    };

    const deleteSlot = (id: string) => {
        setTemplateSlots((prev) => prev.filter((s) => s.id !== id));
        if (editingId === id) setEditingId(null);
    };

    const addSlot = () => {
        if (selectedDate) {
            setClosedDates((prev) => {
                if (!prev.has(selectedDate)) return prev;
                const n = new Set(prev);
                n.delete(selectedDate);
                return n;
            });
        }
        const next = suggestNextSlot(templateSlots);
        const slot: DateSlot = {
            id: `tpl-${Date.now()}`,
            startTime: next.startTime,
            endTime: next.endTime
        };
        setTemplateSlots((prev) =>
            [...prev, slot].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))
        );
        setEditingId(slot.id);
        setError('');
    };

    const markDateClosed = (date: string) => {
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
        setEditingId(null);
    };

    const handleSave = async () => {
        const validationError = validateSlotsList(templateSlots);
        if (validationError) {
            setError(validationError);
            return;
        }
        setError('');
        await onSave({
            settings,
            weeklyRules: mapToWeeklyRules(templateSlots),
            dateRules: mapToClosedDateRules(closedDates)
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-bold text-[#0F172A]">Your availability</h2>
                <p className="text-sm text-[#64748B] mt-1">
                    Pick any date, set hours, Save — applies to every day of the week.
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
                            <Calendar className="w-4 h-4 text-[#F59E0B]" /> Weekly hours
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
                        Amber = open hours every week. Red = closed that date only.
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
                                        !isClosed &&
                                            hasWeeklyHours &&
                                            selectedDate !== d.date &&
                                            'bg-[#FFFBEB]'
                                    )}
                                >
                                    {d.date.slice(8)}
                                    {(hasWeeklyHours || isClosed) && (
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
                                Pick any date, set hours, then Save — same hours every day of the week.
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
                                            : 'Hours you set here apply to every day of the week when you save.'}
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
                                        Clear closed (use weekly hours)
                                    </button>
                                )}
                            </div>

                            {selectedIsClosed ? (
                                <div className="border border-dashed border-red-200 rounded-xl p-8 text-center bg-red-50/50">
                                    <p className="text-sm text-red-700 font-medium">This date is marked closed.</p>
                                </div>
                            ) : templateSlots.length === 0 ? (
                                <div className="border border-dashed border-[#E2E8F0] rounded-xl p-6 text-center">
                                    <p className="text-sm text-[#94A3B8]">No hours yet — add hours, then Save.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {templateSlots.map((slot) => {
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
