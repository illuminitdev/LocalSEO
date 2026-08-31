function parseTimeToMinutes(timeStr) {
    const [h, m] = String(timeStr).split(':').map(Number);
    return h * 60 + (m || 0);
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

function toDateInTimezone(dateStr, timeStr, timezone) {
    const iso = `${dateStr}T${timeStr}:00`;
    const d = new Date(iso);
    return d;
}

function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function generateSlots({
    fromDate,
    toDate,
    timezone,
    rules,
    durationMinutes,
    bufferMinutes,
    minNoticeHours,
    maxDaysAhead,
    existingBookings,
    busyBlocks
}) {
    const slots = [];
    const now = new Date();
    const minStart = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
    const maxEnd = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);

    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d > maxEnd) break;
        const dateStr = localDateStr(d);
        const dayRules = rules.filter((r) => {
            if (r.enabled === false) return false;
            let ruleDate = null;
            if (r.avail_date) {
                ruleDate = r.avail_date instanceof Date ? localDateStr(r.avail_date) : String(r.avail_date).slice(0, 10);
            } else if (r.date) {
                ruleDate = String(r.date).slice(0, 10);
            }
            return ruleDate === dateStr;
        });

        for (const rule of dayRules) {
            const windowStart = parseTimeToMinutes(rule.start_time);
            const windowEnd = parseTimeToMinutes(rule.end_time);
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

                const bookingConflict = existingBookings.some((b) => {
                    const bStart = new Date(b.start_at).getTime();
                    const bEnd = new Date(b.end_at).getTime() + bufferMinutes * 60 * 1000;
                    return overlaps(slotStartMs, slotEndMs + bufferMinutes * 60 * 1000, bStart, bEnd);
                });

                const busyConflict = (busyBlocks || []).some((block) => {
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

function datesWithAvailability(slots) {
    const set = new Set();
    for (const s of slots) set.add(s.date);
    return [...set];
}

module.exports = { generateSlots, datesWithAvailability, parseTimeToMinutes, minutesToTime };
