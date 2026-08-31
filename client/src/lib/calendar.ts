export function monthDays(year: number, month: number) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: { date: string; inMonth: boolean }[] = [];
    const startPad = first.getDay();
    for (let i = 0; i < startPad; i++) days.push({ date: '', inMonth: false });
    for (let d = 1; d <= last.getDate(); d++) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ date, inMonth: true });
    }
    return days;
}

export function todayStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function formatDateLabel(dateStr: string) {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

export function parseTimeToMinutes(timeStr: string) {
    const [h, m] = String(timeStr).slice(0, 5).split(':').map(Number);
    return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function suggestNextSlot(existing: { startTime: string; endTime: string }[]) {
    if (!existing.length) return { startTime: '09:00', endTime: '17:00' };
    const sorted = [...existing].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    const lastEnd = parseTimeToMinutes(sorted[sorted.length - 1].endTime);
    if (lastEnd >= 22 * 60) return { startTime: '09:00', endTime: '10:00' };
    const start = minutesToTime(lastEnd);
    const end = minutesToTime(Math.min(lastEnd + 60, 23 * 60));
    return { startTime: start, endTime: end };
}

export function slotsOverlap(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
    const aStart = parseTimeToMinutes(a.startTime);
    const aEnd = parseTimeToMinutes(a.endTime);
    const bStart = parseTimeToMinutes(b.startTime);
    const bEnd = parseTimeToMinutes(b.endTime);
    return aStart < bEnd && bStart < aEnd;
}
