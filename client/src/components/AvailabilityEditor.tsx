import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import {
    formatDateLabel,
    monthDays,
    parseTimeToMinutes,
    slotsOverlap,
    suggestNextSlot,
    todayStr
} from '../lib/calendar';

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

type Props = {
    initialDateRules: DateRuleInput[];
    settings: AvailabilitySettings;
    onSettingsChange: (settings: AvailabilitySettings) => void;
    onSave: (payload: { settings: AvailabilitySettings; dateRules: { date: string; startTime: string; endTime: string; enabled: boolean }[] }) => Promise<void>;
    saving?: boolean;
};

function rulesToMap(rules: DateRuleInput[]): Record<string, DateSlot[]> {
    const map: Record<string, DateSlot[]> = {};
    for (const r of rules) {
        if (r.enabled === false) continue;
        const date = String(r.date || r.avail_date || '').slice(0, 10);
        const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
        const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
        if (!date || !startTime || !endTime) continue;
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

function mapToRules(map: Record<string, DateSlot[]>) {
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
    return rules;
}

function validateDateSlots(map: Record<string, DateSlot[]>): string | null {
    for (const [date, slots] of Object.entries(map)) {
        for (const slot of slots) {
            if (parseTimeToMinutes(slot.endTime) <= parseTimeToMinutes(slot.startTime)) {
                return `${formatDateLabel(date)}: end time must be after start time.`;
            }
        }
        const sorted = [...slots].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                if (slotsOverlap(sorted[i], sorted[j])) {
                    return `${formatDateLabel(date)}: time blocks cannot overlap.`;
                }
            }
        }
    }
    return null;
}

export default function AvailabilityEditor({ initialDateRules, settings, onSettingsChange, onSave, saving }: Props) {
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState('');
    const [dateSlots, setDateSlots] = useState<Record<string, DateSlot[]>>(() => rulesToMap(initialDateRules));
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const days = useMemo(() => monthDays(month.year, month.month), [month]);
    const datesWithSlots = useMemo(() => new Set(Object.keys(dateSlots).filter((d) => dateSlots[d]?.length)), [dateSlots]);
    const selectedSlots = selectedDate ? dateSlots[selectedDate] || [] : [];

    const updateSlot = (date: string, id: string, patch: Partial<DateSlot>) => {
        setDateSlots((prev) => ({
            ...prev,
            [date]: (prev[date] || []).map((s) => (s.id === id ? { ...s, ...patch } : s))
        }));
    };

    const deleteSlot = (date: string, id: string) => {
        setDateSlots((prev) => {
            const next = (prev[date] || []).filter((s) => s.id !== id);
            const copy = { ...prev };
            if (next.length) copy[date] = next;
            else delete copy[date];
            return copy;
        });
        if (editingId === id) setEditingId(null);
    };

    const addSlot = (date: string) => {
        const existing = dateSlots[date] || [];
        const next = suggestNextSlot(existing);
        const slot: DateSlot = {
            id: `slot-${date}-${Date.now()}`,
            startTime: next.startTime,
            endTime: next.endTime
        };
        setDateSlots((prev) => ({
            ...prev,
            [date]: [...(prev[date] || []), slot].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))
        }));
        setEditingId(slot.id);
    };

    const handleSave = async () => {
        const validationError = validateDateSlots(dateSlots);
        if (validationError) {
            setError(validationError);
            return;
        }
        setError('');
        await onSave({ settings, dateRules: mapToRules(dateSlots) });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-bold text-[#0F172A]">Your availability</h2>
                <p className="text-sm text-[#64748B] mt-1">Pick dates on the calendar and set the hours customers can book.</p>
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
                            <Calendar className="w-4 h-4 text-[#F59E0B]" /> Calendar
                        </h3>
                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() => setMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }))}
                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }))}
                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-[#64748B] mb-3">
                        {new Date(month.year, month.month).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
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
                            const hasSlots = datesWithSlots.has(d.date);
                            return (
                                <button
                                    key={d.date}
                                    type="button"
                                    disabled={isPast}
                                    onClick={() => { setSelectedDate(d.date); setEditingId(null); setError(''); }}
                                    className={cn(
                                        'aspect-square rounded-lg text-sm font-bold transition relative flex flex-col items-center justify-center',
                                        isPast
                                            ? 'text-[#CBD5E1] cursor-not-allowed'
                                            : 'hover:bg-[#0F172A] hover:text-white border border-[#E2E8F0] bg-white',
                                        selectedDate === d.date && 'bg-[#0F172A] text-white border-[#0F172A]',
                                        hasSlots && selectedDate !== d.date && 'ring-1 ring-[#F59E0B]/50'
                                    )}
                                >
                                    {d.date.slice(8)}
                                    {hasSlots && (
                                        <span className={cn(
                                            'absolute bottom-1 w-1 h-1 rounded-full',
                                            selectedDate === d.date ? 'bg-white' : 'bg-[#F59E0B]'
                                        )} />
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
                            <p className="text-sm text-[#64748B]">Pick a date on the calendar to set your hours.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-bold text-[#0F172A]">{formatDateLabel(selectedDate)}</h3>
                                    <p className="text-xs text-[#64748B] mt-0.5">Customers can book only on this date with these hours.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => addSlot(selectedDate)}
                                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold shrink-0"
                                >
                                    <Plus className="w-4 h-4" /> Add hours
                                </button>
                            </div>

                            {selectedSlots.length === 0 ? (
                                <div className="border border-dashed border-[#E2E8F0] rounded-xl p-8 text-center">
                                    <p className="text-sm text-[#94A3B8]">No hours set — tap Add hours to open this date.</p>
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
                                                    isEditing ? 'border-[#F59E0B] bg-[#F59E0B]/5' : 'border-[#E2E8F0] bg-[#FAFBFC]'
                                                )}
                                            >
                                                <input
                                                    type="time"
                                                    value={slot.startTime}
                                                    onChange={(e) => updateSlot(selectedDate, slot.id, { startTime: e.target.value })}
                                                    className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                />
                                                <span className="text-[#94A3B8] text-xs shrink-0">to</span>
                                                <input
                                                    type="time"
                                                    value={slot.endTime}
                                                    onChange={(e) => updateSlot(selectedDate, slot.id, { endTime: e.target.value })}
                                                    className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm font-bold bg-white flex-1 min-w-0"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingId(isEditing ? null : slot.id)}
                                                    className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] shrink-0"
                                                    title="Edit"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteSlot(selectedDate, slot.id)}
                                                    className="p-2 rounded-lg border border-red-100 text-red-600 hover:bg-red-50 shrink-0"
                                                    title="Delete"
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
