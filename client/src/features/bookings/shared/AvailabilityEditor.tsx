import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, ChevronLeft, ChevronRight, Plus, UserRound } from 'lucide-react';
import { apiGet, apiPost, apiPut, cn } from '../../../shared/utils';
import { formatDateLabel, monthDays, parseTimeToMinutes, todayStr } from './bookingUtils';

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

type MemberSchedule = {
    userId: string;
    displayName: string;
    bookable: boolean;
    active: boolean;
    weeklyRules: { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[];
};

type Props = {
    initialDateRules: DateRuleInput[];
    initialWeeklyRules?: WeeklyRuleInput[];
    settings: AvailabilitySettings;
    onSettingsChange: (settings: AvailabilitySettings) => void;
    onSave: (payload: AvailabilitySavePayload) => Promise<void>;
    saving?: boolean;
    saved?: boolean;
    title?: string;
    hideOrgSettings?: boolean;
    defaultWeekdays?: boolean;
    /** Org opening-hours view: load team coverage on the calendar. */
    showTeamCoverage?: boolean;
};

const DAY_OPTIONS = [
    { day: 1, label: 'Mon', short: 'Monday' },
    { day: 2, label: 'Tue', short: 'Tuesday' },
    { day: 3, label: 'Wed', short: 'Wednesday' },
    { day: 4, label: 'Thu', short: 'Thursday' },
    { day: 5, label: 'Fri', short: 'Friday' },
    { day: 6, label: 'Sat', short: 'Saturday' },
    { day: 0, label: 'Sun', short: 'Sunday' }
] as const;

type TimeWindow = { startTime: string; endTime: string };

function normalizeWeekly(rules: WeeklyRuleInput[]) {
    return (rules || [])
        .map((r) => ({
            dayOfWeek: Number(r.dayOfWeek ?? r.day_of_week),
            startTime: String(r.startTime || r.start_time || '').slice(0, 5),
            endTime: String(r.endTime || r.end_time || '').slice(0, 5),
            enabled: r.enabled !== false
        }))
        .filter(
            (r) =>
                !Number.isNaN(r.dayOfWeek) &&
                r.dayOfWeek >= 0 &&
                r.dayOfWeek <= 6 &&
                r.startTime &&
                r.endTime &&
                parseTimeToMinutes(r.endTime) > parseTimeToMinutes(r.startTime)
        );
}

function formatWindowsLabel(windows: TimeWindow[]) {
    return windows.map((w) => `${w.startTime}–${w.endTime}`).join(', ');
}

function validateWindows(windows: TimeWindow[]): string | null {
    if (!windows.length) return 'Add at least one time window.';
    for (const w of windows) {
        if (parseTimeToMinutes(w.endTime) <= parseTimeToMinutes(w.startTime)) {
            return 'End time must be after start time for every window.';
        }
    }
    const sorted = [...windows].sort(
        (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
    );
    for (let i = 1; i < sorted.length; i++) {
        if (parseTimeToMinutes(sorted[i].startTime) < parseTimeToMinutes(sorted[i - 1].endTime)) {
            return 'Time windows cannot overlap.';
        }
    }
    return null;
}

/** Split outer open span around a lunch/break gap (e.g. 09–17 with 12–13 → 09–12 + 13–17). */
function applyLunchToWindows(
    windows: TimeWindow[],
    lunchStart: string,
    lunchEnd: string
): TimeWindow[] {
    const base =
        windows.length > 0
            ? windows
            : [{ startTime: '09:00', endTime: '17:00' }];
    const start = base.reduce(
        (min, w) =>
            parseTimeToMinutes(w.startTime) < parseTimeToMinutes(min) ? w.startTime : min,
        base[0].startTime
    );
    const end = base.reduce(
        (max, w) => (parseTimeToMinutes(w.endTime) > parseTimeToMinutes(max) ? w.endTime : max),
        base[0].endTime
    );
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    const ls = parseTimeToMinutes(lunchStart);
    const le = parseTimeToMinutes(lunchEnd);
    if (le <= ls) return base;
    const out: TimeWindow[] = [];
    if (ls > s) out.push({ startTime: start, endTime: lunchStart });
    if (le < e) out.push({ startTime: lunchEnd, endTime: end });
    return out.length ? out : base;
}

function windowsToWeeklyRules(days: Iterable<number>, windows: TimeWindow[]) {
    const rules: { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[] =
        [];
    for (const dayOfWeek of [...days].sort((a, b) => a - b)) {
        for (const w of windows) {
            rules.push({
                dayOfWeek,
                startTime: w.startTime,
                endTime: w.endTime,
                enabled: true
            });
        }
    }
    return rules;
}

function replaceDowWindows(
    applied: { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[],
    dow: number,
    windows: TimeWindow[]
): { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }[] {
    const kept = applied
        .filter((r) => r.dayOfWeek !== dow)
        .map((r) => ({
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            enabled: true
        }));
    const added = windows.map((w) => ({
        dayOfWeek: dow,
        startTime: w.startTime,
        endTime: w.endTime,
        enabled: true
    }));
    return [...kept, ...added].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

function initialFromWeekly(rules: WeeklyRuleInput[], defaultWeekdays: boolean) {
    const normalized = normalizeWeekly(rules).filter((r) => r.enabled);
    if (!normalized.length) {
        return {
            days: defaultWeekdays ? new Set([1, 2, 3, 4, 5, 6]) : new Set<number>(),
            windows: [{ startTime: '09:00', endTime: '17:00' }] as TimeWindow[],
            applied: false
        };
    }
    const firstDow = normalized[0].dayOfWeek;
    const dayWindows = normalized
        .filter((r) => r.dayOfWeek === firstDow)
        .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
    return {
        days: new Set(normalized.map((r) => r.dayOfWeek)),
        windows: dayWindows.length
            ? dayWindows
            : [{ startTime: normalized[0].startTime, endTime: normalized[0].endTime }],
        applied: true
    };
}

function TimeWindowsEditor({
    windows,
    onChange,
    compact
}: {
    windows: TimeWindow[];
    onChange: (next: TimeWindow[]) => void;
    compact?: boolean;
}) {
    const pad = compact ? 'px-2 py-2 text-xs' : 'px-3 py-2.5 text-sm';
    return (
        <div className="space-y-2">
            {windows.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <input
                        type="time"
                        value={w.startTime}
                        onChange={(e) => {
                            const next = windows.map((row, i) =>
                                i === idx ? { ...row, startTime: e.target.value } : row
                            );
                            onChange(next);
                        }}
                        className={cn(
                            'flex-1 rounded-xl border border-[#E2E8F0] font-bold bg-white',
                            pad
                        )}
                    />
                    <span className="text-[#94A3B8] text-xs font-bold shrink-0">to</span>
                    <input
                        type="time"
                        value={w.endTime}
                        onChange={(e) => {
                            const next = windows.map((row, i) =>
                                i === idx ? { ...row, endTime: e.target.value } : row
                            );
                            onChange(next);
                        }}
                        className={cn(
                            'flex-1 rounded-xl border border-[#E2E8F0] font-bold bg-white',
                            pad
                        )}
                    />
                    {windows.length > 1 ? (
                        <button
                            type="button"
                            onClick={() => onChange(windows.filter((_, i) => i !== idx))}
                            className="shrink-0 px-2 py-2 rounded-lg border border-[#E2E8F0] text-[11px] font-bold text-[#64748B] hover:bg-slate-50"
                            aria-label="Remove window"
                        >
                            −
                        </button>
                    ) : null}
                    {idx === windows.length - 1 ? (
                        <button
                            type="button"
                            onClick={() => {
                                const last = windows[windows.length - 1];
                                const lastEnd = parseTimeToMinutes(last.endTime);
                                const nextStart = Math.min(lastEnd + 60, 22 * 60);
                                const nextEnd = Math.min(nextStart + 60, 23 * 60);
                                const h = (m: number) =>
                                    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
                                onChange([
                                    ...windows,
                                    { startTime: h(nextStart), endTime: h(Math.max(nextEnd, nextStart + 30)) }
                                ]);
                            }}
                            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                            aria-label="Add time window"
                            title="Add another time window"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    ) : (
                        <span className="w-9 shrink-0" />
                    )}
                </div>
            ))}
        </div>
    );
}

function dayOfWeekFromDate(dateStr: string) {
    return new Date(`${dateStr}T12:00:00`).getDay();
}

function hoursForDate(
    dateStr: string,
    weeklyByDay: Map<number, { startTime: string; endTime: string }[]>,
    closedDates: Set<string>,
    dateOverrides: Map<string, { startTime: string; endTime: string }[]>
) {
    if (closedDates.has(dateStr)) return [] as { startTime: string; endTime: string }[];
    if (dateOverrides.has(dateStr)) return dateOverrides.get(dateStr) || [];
    return weeklyByDay.get(dayOfWeekFromDate(dateStr)) || [];
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

function openOverridesFromRules(rules: DateRuleInput[]) {
    const map = new Map<string, { startTime: string; endTime: string }[]>();
    for (const r of rules) {
        if (r.enabled === false) continue;
        const date = String(r.date || r.avail_date || '').slice(0, 10);
        const startTime = String(r.startTime || r.start_time || '').slice(0, 5);
        const endTime = String(r.endTime || r.end_time || '').slice(0, 5);
        if (!date || !startTime || !endTime) continue;
        if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) continue;
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push({ startTime, endTime });
    }
    return map;
}

export default function AvailabilityEditor({
    initialDateRules = [],
    initialWeeklyRules = [],
    settings,
    onSettingsChange: _onSettingsChange,
    onSave,
    saving,
    saved,
    defaultWeekdays = true,
    showTeamCoverage = false
}: Props) {
    const seed = useMemo(
        () => initialFromWeekly(initialWeeklyRules, defaultWeekdays),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    const [selectedDays, setSelectedDays] = useState<Set<number>>(() => seed.days);
    /** Top “Global working hours” — one or more windows applied to selected weekdays. */
    const [templateWindows, setTemplateWindows] = useState<TimeWindow[]>(() => seed.windows);
    const [lunchStart, setLunchStart] = useState('12:00');
    const [lunchEnd, setLunchEnd] = useState('13:00');
    /** Right-side day panel — asks this date only vs every weekday. */
    const [dayWindows, setDayWindows] = useState<TimeWindow[]>(() => seed.windows);
    const [appliedWeekly, setAppliedWeekly] = useState(() =>
        normalizeWeekly(initialWeeklyRules).filter((r) => r.enabled)
    );
    const [closedDates, setClosedDates] = useState(() => closedDatesFromRules(initialDateRules));
    const [dateOverrides, setDateOverrides] = useState(() => openOverridesFromRules(initialDateRules));
    const [error, setError] = useState('');
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState('');
    const [scopePrompt, setScopePrompt] = useState<{ windows: TimeWindow[] } | null>(null);
    const [memberSchedules, setMemberSchedules] = useState<MemberSchedule[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [memberForm, setMemberForm] = useState<{
        userId: string;
        name: string;
        windows: TimeWindow[];
    } | null>(null);
    const [memberBusy, setMemberBusy] = useState(false);
    const [memberError, setMemberError] = useState('');
    const [overlapWarn, setOverlapWarn] = useState<string[] | null>(null);

    const days = useMemo(() => monthDays(month.year, month.month), [month]);

    const weeklyByDay = useMemo(() => {
        const map = new Map<number, { startTime: string; endTime: string }[]>();
        for (const r of appliedWeekly) {
            if (!map.has(r.dayOfWeek)) map.set(r.dayOfWeek, []);
            map.get(r.dayOfWeek)!.push({ startTime: r.startTime, endTime: r.endTime });
        }
        return map;
    }, [appliedWeekly]);

    const loadMemberSchedules = async () => {
        if (!showTeamCoverage) return;
        setLoadingMembers(true);
        try {
            const team = await apiGet('/api/host/team').catch(() => ({ members: [] }));
            const members = (team.members || []).filter((m: any) => m.active !== false);
            if (!members.length) {
                setMemberSchedules([]);
                return;
            }

            // Bulk schedules when available
            const rulesByUser = new Map<string, any[]>();
            try {
                const res = await apiGet('/api/host/team/schedules');
                for (const s of res.schedules || []) {
                    const uid = String(s.userId || s.user_id || '');
                    if (uid) rulesByUser.set(uid, s.weeklyRules || []);
                }
            } catch {
                // ignore — fill per member below
            }

            const schedules = await Promise.all(
                members.map(async (m: any) => {
                    const userId = String(m.user_id || m.membership_id || '');
                    let weeklyRules = rulesByUser.get(userId);
                    if (!weeklyRules) {
                        try {
                            const avail = await apiGet(
                                `/api/host/availability?userId=${encodeURIComponent(userId)}`
                            );
                            weeklyRules = avail.weeklyRules || [];
                        } catch {
                            weeklyRules = [];
                        }
                    }
                    return {
                        userId,
                        displayName: m.display_name || m.name || m.email || 'Team member',
                        bookable: Boolean(m.bookable),
                        active: m.active !== false,
                        weeklyRules: normalizeWeekly(weeklyRules || [])
                    };
                })
            );

            setMemberSchedules(schedules.filter((s) => s.userId));
        } catch {
            setMemberSchedules([]);
        } finally {
            setLoadingMembers(false);
        }
    };

    useEffect(() => {
        loadMemberSchedules();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTeamCoverage]);

    const summary = useMemo(() => {
        const names = DAY_OPTIONS.filter((d) => selectedDays.has(d.day)).map((d) => d.label);
        if (!names.length) return 'No working days selected';
        return `${names.join(', ')} · ${formatWindowsLabel(templateWindows)}`;
    }, [selectedDays, templateWindows]);

    const selectedHours = selectedDate
        ? hoursForDate(selectedDate, weeklyByDay, closedDates, dateOverrides)
        : [];
    const selectedIsClosed = selectedDate ? closedDates.has(selectedDate) || selectedHours.length === 0 : false;
    const selectedDow = selectedDate ? dayOfWeekFromDate(selectedDate) : -1;

    const membersOnDay = useMemo(() => {
        if (!selectedDate || selectedDow < 0) return [];
        return memberSchedules
            .filter((m) => m.active)
            .map((m) => {
                const slots = m.weeklyRules.filter((r) => r.enabled && r.dayOfWeek === selectedDow);
                return { ...m, slots };
            })
            // Members scheduled this weekday first (e.g. Mon–Wed globally)
            .sort((a, b) => Number(b.slots.length > 0) - Number(a.slots.length > 0));
    }, [memberSchedules, selectedDate, selectedDow]);

    const membersWorkingCount = useMemo(
        () => membersOnDay.filter((m) => m.slots.length > 0).length,
        [membersOnDay]
    );

    const toggleDay = (day: number) => {
        setSelectedDays((prev) => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day);
            else next.add(day);
            return next;
        });
        setError('');
    };

    const buildDateRulesPayload = (
        overrides: Map<string, { startTime: string; endTime: string }[]>,
        closed: Set<string>
    ) => {
        const rules: { date: string; startTime: string; endTime: string; enabled: boolean }[] = [];
        for (const [date, slots] of overrides.entries()) {
            if (closed.has(date)) continue;
            for (const slot of slots) {
                rules.push({
                    date,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    enabled: true
                });
            }
        }
        for (const date of closed) {
            rules.push({ date, startTime: '00:00', endTime: '00:00', enabled: false });
        }
        return rules;
    };

    const syncHoursFromDate = (date: string) => {
        const hours = hoursForDate(date, weeklyByDay, closedDates, dateOverrides);
        if (hours.length) {
            setDayWindows(hours.map((h) => ({ startTime: h.startTime, endTime: h.endTime })));
        } else {
            setDayWindows(templateWindows.map((w) => ({ ...w })));
        }
    };

    /** Top control: apply to all selected weekdays every week — no prompt. */
    const applyFullTemplate = async () => {
        if (!selectedDays.size) {
            setError('Select at least one working day.');
            return;
        }
        const winErr = validateWindows(templateWindows);
        if (winErr) {
            setError(winErr);
            return;
        }
        setError('');
        setScopePrompt(null);

        const weeklyRules = windowsToWeeklyRules(selectedDays, templateWindows);

        await onSave({
            settings,
            weeklyRules,
            dateRules: []
        });
        setAppliedWeekly(weeklyRules);
        setDateOverrides(new Map());
        setClosedDates(new Set());
        const copy = templateWindows.map((w) => ({ ...w }));
        if (selectedDate) {
            setDayWindows(copy);
        } else {
            setSelectedDate(todayStr());
            setDayWindows(copy);
        }
    };

    /** Right panel only: ask this date only vs every matching weekday. */
    const requestDayApply = () => {
        if (!selectedDate) {
            setError('Select a day on the calendar first.');
            return;
        }
        const winErr = validateWindows(dayWindows);
        if (winErr) {
            setError(winErr);
            return;
        }
        setError('');
        setScopePrompt({ windows: dayWindows.map((w) => ({ ...w })) });
    };

    const confirmScopeApply = async (scope: 'date_only' | 'weekday_global') => {
        if (!scopePrompt || !selectedDate) return;
        const windows = scopePrompt.windows;
        const dow = dayOfWeekFromDate(selectedDate);
        const dayName = DAY_OPTIONS.find((d) => d.day === dow)?.short || 'that day';

        try {
            if (scope === 'date_only') {
                const nextOverrides = new Map(dateOverrides);
                nextOverrides.set(
                    selectedDate,
                    windows.map((w) => ({ startTime: w.startTime, endTime: w.endTime }))
                );
                const nextClosed = new Set(closedDates);
                nextClosed.delete(selectedDate);

                const weeklyRules: {
                    dayOfWeek: number;
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                }[] =
                    appliedWeekly.length > 0
                        ? appliedWeekly.map((r) => ({
                              dayOfWeek: r.dayOfWeek,
                              startTime: r.startTime,
                              endTime: r.endTime,
                              enabled: true
                          }))
                        : windowsToWeeklyRules(selectedDays, windows);

                await onSave({
                    settings,
                    weeklyRules,
                    dateRules: buildDateRulesPayload(nextOverrides, nextClosed)
                });
                setDateOverrides(nextOverrides);
                setClosedDates(nextClosed);
                if (!appliedWeekly.length) setAppliedWeekly(weeklyRules);
            } else {
                let weeklyRules: {
                    dayOfWeek: number;
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                }[] = replaceDowWindows(appliedWeekly, dow, windows);
                if (!appliedWeekly.length) {
                    const days = new Set(selectedDays);
                    days.add(dow);
                    weeklyRules = windowsToWeeklyRules(days, windows);
                }

                const nextOverrides = new Map(dateOverrides);
                nextOverrides.delete(selectedDate);
                const nextClosed = new Set(closedDates);
                nextClosed.delete(selectedDate);

                await onSave({
                    settings,
                    weeklyRules,
                    dateRules: buildDateRulesPayload(nextOverrides, nextClosed)
                });
                setAppliedWeekly(weeklyRules);
                setSelectedDays(new Set(weeklyRules.map((r) => r.dayOfWeek)));
                setDateOverrides(nextOverrides);
                setClosedDates(nextClosed);
                setTemplateWindows(windows.map((w) => ({ ...w })));
            }
            setDayWindows(windows.map((w) => ({ ...w })));
            setScopePrompt(null);
        } catch (e: any) {
            setError(e.message || `Could not apply hours for ${dayName}`);
        }
    };

    const saveMemberForDay = async (force = false) => {
        if (!memberForm || !selectedDate) return;
        const winErr = validateWindows(memberForm.windows);
        if (winErr) {
            setMemberError(winErr);
            return;
        }
        const existing = memberSchedules.find((m) => m.userId === memberForm.userId);
        const weeklyRules = replaceDowWindows(
            existing?.weeklyRules || [],
            selectedDow,
            memberForm.windows
        );

        setMemberBusy(true);
        setMemberError('');
        try {
            if (!force) {
                const check = await apiPost('/api/host/availability/check-overlaps', {
                    userId: memberForm.userId,
                    weeklyRules
                });
                if (check.hasOverlaps && check.overlaps?.length) {
                    setOverlapWarn(check.overlaps.map((o: any) => o.message));
                    setMemberBusy(false);
                    return;
                }
            }
            await apiPut('/api/host/availability', {
                weeklyRules,
                dateRules: [],
                userId: memberForm.userId
            });
            setOverlapWarn(null);
            setMemberForm(null);
            await loadMemberSchedules();
        } catch (e: any) {
            setMemberError(e.message || 'Could not save member hours');
            setOverlapWarn(null);
        } finally {
            setMemberBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Notice / buffer / timezone stay in org defaults — calendar is for hours only */}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <p className="text-xs font-semibold text-[#64748B] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
                Hours are UK time (Europe/London) for your business address — same times customers see when booking.
            </p>

            {/* Global weekly template */}
            <div className="border border-[#E2E8F0] rounded-2xl overflow-hidden bg-white">
                <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-[#0F172A] text-sm">Global working hours</h3>
                            <p className="text-xs text-[#64748B] mt-1">
                                Apply globally updates every selected weekday each week (no extra prompt). Use the
                                calendar day panel to change one date or one weekday.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedDays(new Set([1, 2, 3, 4, 5, 6]));
                                setError('');
                            }}
                            className="text-xs font-bold text-[var(--brand-primary)] hover:underline"
                        >
                            Mon–Sat (Sun leave)
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {DAY_OPTIONS.map((d) => {
                            const on = selectedDays.has(d.day);
                            const isSunday = d.day === 0;
                            return (
                                <button
                                    key={d.day}
                                    type="button"
                                    onClick={() => toggleDay(d.day)}
                                    className={cn(
                                        'min-w-[3.25rem] px-3 py-2.5 rounded-xl border text-xs font-bold transition',
                                        on
                                            ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] border-[var(--brand-primary)]'
                                            : isSunday
                                              ? 'bg-slate-50 text-slate-400 border-dashed border-slate-200'
                                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                    )}
                                >
                                    {d.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="space-y-3">
                        <div>
                            <p className="text-xs font-bold text-[#64748B] mb-2">
                                Hours (applies globally) — use + for another block (e.g. after lunch)
                            </p>
                            <TimeWindowsEditor
                                windows={templateWindows}
                                onChange={(next) => {
                                    setTemplateWindows(next);
                                    setError('');
                                }}
                            />
                        </div>
                        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2">
                            <p className="text-xs font-bold text-[#0F172A]">Lunch / break (optional)</p>
                            <p className="text-[11px] text-[#64748B]">
                                Splits open hours around a break, then Apply globally so customers cannot book
                                during lunch.
                            </p>
                            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                                <div className="flex items-center gap-2 flex-1">
                                    <input
                                        type="time"
                                        value={lunchStart}
                                        onChange={(e) => setLunchStart(e.target.value)}
                                        className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-bold bg-white"
                                    />
                                    <span className="text-[#94A3B8] text-xs font-bold">to</span>
                                    <input
                                        type="time"
                                        value={lunchEnd}
                                        onChange={(e) => setLunchEnd(e.target.value)}
                                        className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-bold bg-white"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = applyLunchToWindows(
                                            templateWindows,
                                            lunchStart,
                                            lunchEnd
                                        );
                                        const err = validateWindows(next);
                                        if (err) {
                                            setError(err);
                                            return;
                                        }
                                        setTemplateWindows(next);
                                        setError('');
                                    }}
                                    className="shrink-0 px-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:border-[var(--brand-primary)]"
                                >
                                    Apply lunch break
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void applyFullTemplate()}
                            className={cn(
                                'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60 w-full sm:w-auto',
                                saved ? 'bg-emerald-600' : 'bg-[var(--brand-primary)]'
                            )}
                        >
                            {saved ? <Check className="w-4 h-4" /> : null}
                            {saving ? 'Applying…' : saved ? 'Applied' : 'Apply globally'}
                        </button>
                    </div>

                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                        <span className="font-bold text-slate-800">Weekly template: </span>
                        {summary}
                    </p>
                </div>
            </div>

            {/* Calendar + day detail */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0] border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <div className="p-5 bg-[#FAFBFC]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-[var(--brand-primary)]" /> Calendar
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
                        Amber marks = open from your global hours. Click a day to see hours and team coverage.
                    </p>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#64748B] mb-1">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d}>{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((d, i) => {
                            if (!d.inMonth) return <div key={i} />;
                            const hours = hoursForDate(d.date, weeklyByDay, closedDates, dateOverrides);
                            const isOpen = hours.length > 0;
                            const isClosed = closedDates.has(d.date) || (!isOpen && weeklyByDay.size > 0);
                            const isPast = d.date < todayStr();
                            const memberCount = showTeamCoverage
                                ? memberSchedules.filter(
                                      (m) =>
                                          m.active &&
                                          m.weeklyRules.some(
                                              (r) =>
                                                  r.enabled &&
                                                  r.dayOfWeek === dayOfWeekFromDate(d.date) &&
                                                  parseTimeToMinutes(r.endTime) > parseTimeToMinutes(r.startTime)
                                          )
                                  ).length
                                : 0;
                            return (
                                <button
                                    key={d.date}
                                    type="button"
                                    onClick={() => {
                                        setSelectedDate(d.date);
                                        syncHoursFromDate(d.date);
                                        setMemberForm(null);
                                        setMemberError('');
                                        setOverlapWarn(null);
                                        setScopePrompt(null);
                                    }}
                                    className={cn(
                                        'aspect-square rounded-lg text-sm font-bold transition relative flex flex-col items-center justify-center border',
                                        selectedDate === d.date
                                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                            : isOpen
                                              ? 'bg-[var(--brand-primary-soft)] border-[var(--brand-primary)]/30 text-slate-900 hover:border-[var(--brand-primary)]'
                                              : isClosed
                                                ? 'bg-white border-[#E2E8F0] text-red-500'
                                                : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50',
                                        isPast && selectedDate !== d.date && 'opacity-60'
                                    )}
                                >
                                    {d.date.slice(8)}
                                    {memberCount > 0 && selectedDate !== d.date && (
                                        <span className="absolute top-0.5 right-0.5 text-[8px] font-black text-[var(--brand-primary)]">
                                            {memberCount}
                                        </span>
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
                                {appliedWeekly.length
                                    ? 'Click a marked date to see opening hours and team members.'
                                    : 'Apply global hours first, then click dates on the calendar.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <h3 className="font-bold text-[#0F172A]">{formatDateLabel(selectedDate)}</h3>
                                <p className="text-xs text-[#64748B] mt-0.5">
                                    {selectedIsClosed
                                        ? 'Closed / holiday — no organisation hours this day.'
                                        : `Open ${selectedHours.map((h) => `${h.startTime}–${h.endTime}`).join(', ')}`}
                                </p>
                            </div>

                            <div className="rounded-xl border border-[#E2E8F0] bg-slate-50/80 p-3 space-y-3">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                        This day
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Change hours here, then Apply — we’ll ask: this date only, or every{' '}
                                        {DAY_OPTIONS.find((d) => d.day === selectedDow)?.short || 'weekday'}.
                                    </p>
                                </div>
                                <TimeWindowsEditor
                                    compact
                                    windows={dayWindows}
                                    onChange={(next) => {
                                        setDayWindows(next);
                                        setError('');
                                    }}
                                />
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={requestDayApply}
                                    className="w-full px-3 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-xs font-bold disabled:opacity-50"
                                >
                                    Apply hours for this day…
                                </button>
                                {dateOverrides.has(selectedDate) && (
                                    <p className="text-[11px] text-amber-700 font-medium">
                                        Custom hours for this date only (overrides the weekly template).
                                    </p>
                                )}
                            </div>

                            {showTeamCoverage && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                            Team members this day
                                            {membersWorkingCount > 0
                                                ? ` · ${membersWorkingCount} working`
                                                : membersOnDay.length
                                                  ? ' · none scheduled'
                                                  : ''}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => void loadMemberSchedules()}
                                            className="text-[10px] font-bold text-[var(--brand-primary)] hover:underline"
                                        >
                                            {loadingMembers ? 'Loading…' : 'Refresh'}
                                        </button>
                                    </div>

                                    {!membersOnDay.length ? (
                                        <div className="border border-dashed border-[#E2E8F0] rounded-xl p-4 text-center">
                                            <UserRound className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                                            <p className="text-xs text-slate-500">No team members yet.</p>
                                            <p className="text-[11px] text-slate-400 mt-1">
                                                Add someone under Team, set Mon–Wed hours, then Refresh here.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {membersOnDay.map((m) => (
                                                <div
                                                    key={m.userId}
                                                    className="rounded-xl border border-[#E2E8F0] p-3 flex items-start justify-between gap-3"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-900 truncate">
                                                            {m.displayName}
                                                            {m.bookable ? (
                                                                <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">
                                                                    bookable
                                                                </span>
                                                            ) : null}
                                                        </p>
                                                        {m.slots.length ? (
                                                            <p className="text-xs text-slate-600 mt-0.5">
                                                                {m.slots
                                                                    .map((s) => `${s.startTime}–${s.endTime}`)
                                                                    .join(', ')}
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs text-amber-700 mt-0.5">
                                                                No hours set for this weekday
                                                            </p>
                                                        )}
                                                    </div>
                                                    {!m.slots.length && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setMemberForm({
                                                                    userId: m.userId,
                                                                    name: m.displayName,
                                                                    windows:
                                                                        selectedHours.length > 0
                                                                            ? selectedHours.map((h) => ({
                                                                                  startTime: h.startTime,
                                                                                  endTime: h.endTime
                                                                              }))
                                                                            : [
                                                                                  {
                                                                                      startTime: '09:00',
                                                                                      endTime: '17:00'
                                                                                  }
                                                                              ]
                                                                });
                                                                setMemberError('');
                                                                setOverlapWarn(null);
                                                            }}
                                                            className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-[11px] font-bold"
                                                        >
                                                            <Plus className="w-3 h-3" /> Set hours
                                                        </button>
                                                    )}
                                                    {m.slots.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setMemberForm({
                                                                    userId: m.userId,
                                                                    name: m.displayName,
                                                                    windows: m.slots.map((s) => ({
                                                                        startTime: s.startTime,
                                                                        endTime: s.endTime
                                                                    }))
                                                                });
                                                                setMemberError('');
                                                                setOverlapWarn(null);
                                                            }}
                                                            className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {memberForm && (
                                        <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary-soft)]/40 p-3 space-y-3">
                                            <p className="text-xs font-bold text-slate-800">
                                                Set hours for {memberForm.name} on{' '}
                                                {DAY_OPTIONS.find((d) => d.day === selectedDow)?.short ||
                                                    'this day'}{' '}
                                                (every week)
                                            </p>
                                            {memberError && (
                                                <p className="text-xs text-red-600">{memberError}</p>
                                            )}
                                            <TimeWindowsEditor
                                                compact
                                                windows={memberForm.windows}
                                                onChange={(next) =>
                                                    setMemberForm((prev) =>
                                                        prev ? { ...prev, windows: next } : prev
                                                    )
                                                }
                                            />
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setMemberForm(null);
                                                        setOverlapWarn(null);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={memberBusy}
                                                    onClick={() => saveMemberForDay(false)}
                                                    className="px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-[11px] font-bold disabled:opacity-50"
                                                >
                                                    {memberBusy ? 'Saving…' : 'Save for member'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {scopePrompt && selectedDate && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 w-full max-w-md space-y-4 shadow-xl">
                        <div>
                            <h3 className="font-black text-slate-900 text-lg">Apply these hours?</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                {formatWindowsLabel(scopePrompt.windows)} for{' '}
                                <span className="font-bold text-slate-700">{formatDateLabel(selectedDate)}</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void confirmScopeApply('date_only')}
                                className="w-full text-left rounded-xl border border-slate-200 hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)]/40 p-3 transition"
                            >
                                <p className="text-sm font-bold text-slate-900">This date only</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Changes only {formatDateLabel(selectedDate)}. Other{' '}
                                    {DAY_OPTIONS.find((d) => d.day === selectedDow)?.short || 'weekdays'} stay as they
                                    are.
                                </p>
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void confirmScopeApply('weekday_global')}
                                className="w-full text-left rounded-xl border border-slate-200 hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)]/40 p-3 transition"
                            >
                                <p className="text-sm font-bold text-slate-900">
                                    Every {DAY_OPTIONS.find((d) => d.day === selectedDow)?.short || 'weekday'} globally
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Updates that weekday every week. Other weekdays keep their current global hours.
                                </p>
                            </button>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setScopePrompt(null)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {overlapWarn && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl border border-amber-200 p-5 w-full max-w-md space-y-3 shadow-xl">
                        <h3 className="font-black text-slate-900">Schedule overlap</h3>
                        <p className="text-xs text-slate-500">
                            These times align with another team member. Review before applying.
                        </p>
                        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                            {overlapWarn.map((msg, i) => (
                                <li
                                    key={i}
                                    className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
                                >
                                    {msg}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setOverlapWarn(null)}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                            >
                                Edit times
                            </button>
                            <button
                                type="button"
                                disabled={memberBusy}
                                onClick={() => saveMemberForDay(true)}
                                className="px-4 py-2 rounded-xl bg-amber-600 text-[var(--brand-primary-foreground)] text-xs font-bold disabled:opacity-50"
                            >
                                Apply anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
