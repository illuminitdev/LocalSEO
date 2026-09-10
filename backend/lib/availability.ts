function parseTimeToMinutes(timeStr: any) {
    const [h, m] = String(timeStr).split(':').map(Number);
    return h * 60 + (m || 0);
}

function minutesToTime(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
    return aStart < bEnd && bStart < aEnd;
}

function toDateInTimezone(dateStr: string, timeStr: string, _timezone: any) {
    const iso = `${dateStr}T${timeStr}:00`;
    return new Date(iso);
}

function localDateStr(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function ruleDateStr(r: any): string | null {
    if (r.avail_date) {
        return r.avail_date instanceof Date ? localDateStr(r.avail_date) : String(r.avail_date).slice(0, 10);
    }
    if (r.date) return String(r.date).slice(0, 10);
    return null;
}

function normalizeTime(t: any): string {
    return String(t || '').slice(0, 5);
}

function dayOfWeekForDate(dateStr: string): number {
    // Noon avoids DST / UTC edge cases on date-only strings
    return new Date(`${dateStr}T12:00:00`).getDay();
}

/**
 * Date overrides win when any row exists for that date (including disabled = closed).
 * Otherwise fall back to weekly day_of_week rules.
 */
function resolveRulesForDate(dateStr: string, dateRules: any[], weeklyRules: any[]) {
    const overrides = (dateRules || []).filter((r: any) => ruleDateStr(r) === dateStr);
    if (overrides.length > 0) {
        return overrides.filter((r: any) => {
            if (r.enabled === false) return false;
            const start = normalizeTime(r.start_time ?? r.startTime);
            const end = normalizeTime(r.end_time ?? r.endTime);
            return start && end && parseTimeToMinutes(end) > parseTimeToMinutes(start);
        });
    }
    const dow = dayOfWeekForDate(dateStr);
    return (weeklyRules || []).filter((r: any) => {
        if (r.enabled === false) return false;
        const ruleDow = Number(r.day_of_week ?? r.dayOfWeek);
        if (ruleDow !== dow) return false;
        const start = normalizeTime(r.start_time ?? r.startTime);
        const end = normalizeTime(r.end_time ?? r.endTime);
        return start && end && parseTimeToMinutes(end) > parseTimeToMinutes(start);
    });
}

function generateSlots({
    fromDate,
    toDate,
    timezone,
    rules,
    weeklyRules,
    dateRules,
    durationMinutes,
    bufferMinutes,
    minNoticeHours,
    maxDaysAhead,
    existingBookings,
    busyBlocks
}: any) {
    const slots: any[] = [];
    const now = new Date();
    const minStart = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
    const maxEnd = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);

    // Back-compat: older callers passed only `rules` (date rules)
    const resolvedDateRules = dateRules || rules || [];
    const resolvedWeekly = weeklyRules || [];

    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d > maxEnd) break;
        const dateStr = localDateStr(d);
        const dayRules = resolveRulesForDate(dateStr, resolvedDateRules, resolvedWeekly);

        for (const rule of dayRules) {
            const windowStart = parseTimeToMinutes(rule.start_time ?? rule.startTime);
            const windowEnd = parseTimeToMinutes(rule.end_time ?? rule.endTime);
            let cursor = windowStart;

            while (cursor + durationMinutes <= windowEnd) {
                const slotStart = toDateInTimezone(dateStr, minutesToTime(cursor), timezone);
                const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

                if (slotStart < minStart) {
                    cursor += durationMinutes + bufferMinutes;
                    continue;
                }

                const slotStartMs = slotStart.getTime();
                const slotEndMs = slotEnd.getTime();

                const bookingConflict = existingBookings.some((b: any) => {
                    const bStart = new Date(b.start_at).getTime();
                    const bEnd = new Date(b.end_at).getTime() + bufferMinutes * 60 * 1000;
                    return overlaps(slotStartMs, slotEndMs + bufferMinutes * 60 * 1000, bStart, bEnd);
                });

                const busyConflict = (busyBlocks || []).some((block: any) => {
                    const bStart = new Date(block.start).getTime();
                    const bEnd = new Date(block.end).getTime();
                    return overlaps(slotStartMs, slotEndMs, bStart, bEnd);
                });

                if (!bookingConflict && !busyConflict) {
                    slots.push({
                        startAt: slotStart.toISOString(),
                        endAt: slotEnd.toISOString(),
                        date: dateStr,
                        label: `${minutesToTime(cursor)} – ${minutesToTime(cursor + durationMinutes)}`
                    });
                }

                cursor += durationMinutes + bufferMinutes;
            }
        }
    }

    return slots;
}

function datesWithAvailability(slots: any[]) {
    const set = new Set<string>();
    for (const s of slots) set.add(s.date);
    return [...set];
}

export {
    generateSlots,
    datesWithAvailability,
    parseTimeToMinutes,
    minutesToTime,
    resolveRulesForDate,
    dayOfWeekForDate
};
