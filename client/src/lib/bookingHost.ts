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
