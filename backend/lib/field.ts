import { query } from './db';

/** Owners/admins can act on any job; techs only on assigned jobs. */
export function assertFieldAccess(user: { id?: string; role?: string } | null | undefined, booking: any) {
    const role = String(user?.role || '').toLowerCase();
    if (!user?.id) {
        // Dev slug-only host without JWT — allow
        if (!role) return;
        throw Object.assign(new Error('Login required for field actions'), { status: 401 });
    }
    if (role === 'owner' || role === 'admin') return;
    if (role === 'tech' || role === 'member') {
        if (booking.assigned_user_id && String(booking.assigned_user_id) === String(user.id)) return;
        throw Object.assign(new Error('You can only update jobs assigned to you'), { status: 403 });
    }
    // Unknown role: treat like tech if assigned
    if (booking.assigned_user_id && String(booking.assigned_user_id) === String(user.id)) return;
    if (role === 'owner' || role === 'admin') return;
    throw Object.assign(new Error('Not allowed to update this job'), { status: 403 });
}

export async function listFieldJobs(orgId: string, user: { id?: string; role?: string } | null) {
    const role = String(user?.role || '').toLowerCase();
    const params: any[] = [orgId];
    let sql = `
        SELECT b.*, e.name AS event_name
        FROM bookings b
        LEFT JOIN event_types e ON e.id = b.event_type_id
        WHERE b.org_id = $1
          AND COALESCE(b.status, '') <> 'cancelled'
          AND COALESCE(b.job_status, '') <> 'cancelled'
          AND COALESCE(b.job_status, '') NOT IN ('completed', 'invoiced')
    `;
    if (role === 'tech' || role === 'member') {
        params.push(user!.id);
        sql += ` AND b.assigned_user_id = $2`;
    }
    sql += ` ORDER BY b.start_at ASC NULLS LAST LIMIT 100`;
    const { rows } = await query(sql, params);
    return rows;
}

export async function getFieldBooking(orgId: string, bookingId: string) {
    const { rows } = await query(
        `SELECT b.*, e.name AS event_name
         FROM bookings b
         LEFT JOIN event_types e ON e.id = b.event_type_id
         WHERE b.id = $1 AND b.org_id = $2`,
        [bookingId, orgId]
    );
    return rows[0] || null;
}

export async function checkInBooking(orgId: string, bookingId: string, lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw Object.assign(new Error('Valid lat/lng required'), { status: 400 });
    }
    const { rows } = await query(
        `UPDATE bookings SET
            checkin_lat = $1, checkin_lng = $2, checkin_at = NOW(),
            job_status = CASE WHEN job_status IN ('requested', 'scheduled') THEN 'in_progress' ELSE job_status END,
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
         WHERE id = $3 AND org_id = $4
         RETURNING *`,
        [lat, lng, bookingId, orgId]
    );
    if (!rows.length) throw Object.assign(new Error('Booking not found'), { status: 404 });
    return rows[0];
}

export async function saveSignature(orgId: string, bookingId: string, signatureUrl: string) {
    const url = String(signatureUrl || '').trim();
    if (!url.startsWith('https://')) {
        throw Object.assign(new Error('signatureUrl must be https'), { status: 400 });
    }
    const { rows } = await query(
        `UPDATE bookings SET signature_url = $1, updated_at = NOW()
         WHERE id = $2 AND org_id = $3 RETURNING *`,
        [url, bookingId, orgId]
    );
    if (!rows.length) throw Object.assign(new Error('Booking not found'), { status: 404 });
    return rows[0];
}

export async function appendJobPhotos(orgId: string, bookingId: string, urls: string[]) {
    const clean = (urls || []).map((u) => String(u || '').trim()).filter((u) => u.startsWith('https://'));
    if (!clean.length) throw Object.assign(new Error('At least one photo URL required'), { status: 400 });
    const { rows } = await query(
        `UPDATE bookings SET
            photo_urls = COALESCE(photo_urls, '[]'::jsonb) || $1::jsonb,
            updated_at = NOW()
         WHERE id = $2 AND org_id = $3
         RETURNING *`,
        [JSON.stringify(clean), bookingId, orgId]
    );
    if (!rows.length) throw Object.assign(new Error('Booking not found'), { status: 404 });
    return rows[0];
}
