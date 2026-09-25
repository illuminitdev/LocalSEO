const ORG_SLUG_KEY = 'localpulse_booking_org';

export function getBookingOrgSlug(): string | null {
    return localStorage.getItem(ORG_SLUG_KEY);
}

export function setBookingOrgSlug(slug: string) {
    localStorage.setItem(ORG_SLUG_KEY, slug);
}

export function clearBookingOrgSlug() {
    localStorage.removeItem(ORG_SLUG_KEY);
}

export function bookingOrgHeaders(): Record<string, string> {
    const slug = getBookingOrgSlug();
    return slug ? { 'X-Booking-Org': slug } : {};
}

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

const BOOKING_DRAFT_VERSION = 1;

export type PublicBookingDraft = {
    v: number;
    step?: string;
    propertyType?: string;
    propertyOther?: string;
    cartSlugs?: string[];
    selectedCatalog?: {
        id: string;
        name: string;
        description?: string;
        priceCents?: number;
        category?: string;
    } | null;
    stylist?: string;
    stylistUserId?: string | null;
    intakeAnswers?: Record<string, string>;
    intakeMode?: 'instant' | 'request';
    preferredAt?: string;
    selectedDate?: string;
    selectedSlot?: { startAt: string; endAt: string; date: string; label: string; assignedUserId?: string | null } | null;
    customerName?: string;
    email?: string;
    phone?: string;
    /** @deprecated legacy combined contact field */
    contact?: string;
    postcode?: string;
    description?: string;
    photoUrl?: string;
    month?: { year: number; month: number };
    activeCategory?: string;
    catalogTab?: 'appointments' | 'treatments';
};

function bookingDraftKey(hostSlug: string) {
    return `lp-book-draft:${hostSlug}`;
}

export function readBookingDraft(hostSlug: string): PublicBookingDraft | null {
    if (!hostSlug || typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(bookingDraftKey(hostSlug));
        if (!raw) return null;
        const data = JSON.parse(raw) as PublicBookingDraft;
        if (!data || data.v !== BOOKING_DRAFT_VERSION) return null;
        return data;
    } catch {
        return null;
    }
}

export function writeBookingDraft(hostSlug: string, draft: Omit<PublicBookingDraft, 'v'>) {
    if (!hostSlug || typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(
            bookingDraftKey(hostSlug),
            JSON.stringify({ ...draft, v: BOOKING_DRAFT_VERSION })
        );
    } catch {
        /* quota / private mode */
    }
}

export function clearBookingDraft(hostSlug: string) {
    if (!hostSlug || typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.removeItem(bookingDraftKey(hostSlug));
    } catch {
        /* ignore */
    }
}
