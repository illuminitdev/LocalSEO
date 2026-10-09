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

/** Wall-clock parts of an instant in a given IANA timezone. */
function zonedParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value;
    }
    const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour,
        minute: Number(map.minute),
        second: Number(map.second)
    };
}

/**
 * Convert org wall-clock date+time to a UTC Date.
 * Availability rules are always stored as wall times in org.timezone.
 */
function toDateInTimezone(dateStr: string, timeStr: string, timezone: any) {
    const tz = String(timezone || 'Europe/London').trim() || 'Europe/London';
    const [year, month, day] = String(dateStr).split('-').map(Number);
    const [hour, minute] = String(timeStr).split(':').map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute || 0, 0);
    // Iterate: guess UTC, read wall time in tz, correct by the delta.
    let utcMs = desired;
    for (let i = 0; i < 3; i++) {
        const p = zonedParts(new Date(utcMs), tz);
        const asWall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        const diff = asWall - desired;
        if (diff === 0) break;
        utcMs -= diff;
    }
    return new Date(utcMs);
}

function localDateStr(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Calendar YYYY-MM-DD for pg DATE / ISO strings (UTC day — avoids US Lambda day-shift). */
function calendarDateStr(value: any): string | null {
    if (value == null || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getUTCFullYear();
        const m = String(value.getUTCMonth() + 1).padStart(2, '0');
        const day = String(value.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function ruleDateStr(r: any): string | null {
    if (r.avail_date != null && r.avail_date !== '') {
        return calendarDateStr(r.avail_date);
    }
    if (r.date != null && r.date !== '') {
        return calendarDateStr(r.date);
    }
    return null;
}

function normalizeTime(t: any): string {
    return String(t || '').slice(0, 5);
}

function dayOfWeekForDate(dateStr: string): number {
    
    return new Date(`${dateStr}T12:00:00`).getDay();
}





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

/** Intersect two sets of time windows (minutes from midnight). */
function intersectWindows(
    a: { start: number; end: number }[],
    b: { start: number; end: number }[]
): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    for (const wa of a) {
        for (const wb of b) {
            const start = Math.max(wa.start, wb.start);
            const end = Math.min(wa.end, wb.end);
            if (end > start) out.push({ start, end });
        }
    }
    return out;
}

function rulesToWindows(rules: any[]): { start: number; end: number }[] {
    return (rules || []).map((r) => ({
        start: parseTimeToMinutes(normalizeTime(r.start_time ?? r.startTime)),
        end: parseTimeToMinutes(normalizeTime(r.end_time ?? r.endTime))
    }));
}

/**
 * When teamsEnabled, bookable windows = org opening hours ∩ member availability.
 * Pass org*Rules as opening hours (user_id IS NULL) and member*Rules for the member.
 */
function resolveWindowsForDate(
    dateStr: string,
    opts: {
        dateRules?: any[];
        weeklyRules?: any[];
        orgDateRules?: any[];
        orgWeeklyRules?: any[];
        memberDateRules?: any[];
        memberWeeklyRules?: any[];
        intersectWithOrg?: boolean;
    }
): { start: number; end: number }[] {
    if (opts.intersectWithOrg) {
        const orgDay = resolveRulesForDate(
            dateStr,
            opts.orgDateRules || [],
            opts.orgWeeklyRules || []
        );
        const memberDay = resolveRulesForDate(
            dateStr,
            opts.memberDateRules || [],
            opts.memberWeeklyRules || []
        );
        if (!orgDay.length || !memberDay.length) return [];
        return intersectWindows(rulesToWindows(orgDay), rulesToWindows(memberDay));
    }
    const dayRules = resolveRulesForDate(dateStr, opts.dateRules || [], opts.weeklyRules || []);
    return rulesToWindows(dayRules);
}

function generateSlots({
    fromDate,
    toDate,
    timezone,
    rules,
    weeklyRules,
    dateRules,
    orgWeeklyRules,
    orgDateRules,
    memberWeeklyRules,
    memberDateRules,
    intersectWithOrg,
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

    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d > maxEnd) break;
        const dateStr = localDateStr(d);
        const windows = resolveWindowsForDate(dateStr, {
            dateRules: dateRules || rules || [],
            weeklyRules: weeklyRules || [],
            orgDateRules,
            orgWeeklyRules,
            memberDateRules,
            memberWeeklyRules,
            intersectWithOrg: Boolean(intersectWithOrg)
        });

        for (const win of windows) {
            const windowStart = win.start;
            const windowEnd = win.end;
            let cursor = windowStart;

            const duration = Math.max(1, Number(durationMinutes) || 60);
            const buffer = Math.max(0, Number(bufferMinutes) || 0);
            // Offer bookable blocks on the service duration (e.g. 09:00, 10:00…).
            // Buffer only reserves gap after existing bookings / busy blocks.
            while (cursor + duration <= windowEnd) {
                const slotStart = toDateInTimezone(dateStr, minutesToTime(cursor), timezone);
                const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

                if (slotStart < minStart) {
                    cursor += duration;
                    continue;
                }

                const slotStartMs = slotStart.getTime();
                const slotEndMs = slotEnd.getTime();

                const bookingConflict = existingBookings.some((b: any) => {
                    const bStart = new Date(b.start_at).getTime();
                    const bEnd = new Date(b.end_at).getTime() + buffer * 60 * 1000;
                    return overlaps(slotStartMs, slotEndMs + buffer * 60 * 1000, bStart, bEnd);
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
                        label: `${minutesToTime(cursor)} – ${minutesToTime(cursor + duration)}`
                    });
                }

                cursor += duration;
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

/** Merge slots by startAt, keeping first occurrence (for First Available union). */
function mergeSlotsByStart(slotLists: any[][]): any[] {
    const map = new Map<string, any>();
    for (const list of slotLists) {
        for (const s of list) {
            if (!map.has(s.startAt)) map.set(s.startAt, s);
        }
    }
    return [...map.values()].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
}

export {
    generateSlots,
    datesWithAvailability,
    parseTimeToMinutes,
    minutesToTime,
    resolveRulesForDate,
    dayOfWeekForDate,
    intersectWindows,
    mergeSlotsByStart
};
