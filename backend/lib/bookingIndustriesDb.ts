import { query } from './db';

export type BookingIndustryRow = {
    id: string;
    name: string;
    shortName: string;
    icon: string;
    sortOrder: number;
    active: boolean;
    navSlug: string | null;
    demoReady: boolean;
    createdAt?: string;
    updatedAt?: string;
};

function mapRow(r: any): BookingIndustryRow {
    return {
        id: String(r.id),
        name: String(r.name || ''),
        shortName: String(r.short_name || r.name || ''),
        icon: String(r.icon || 'Building2'),
        sortOrder: Number(r.sort_order) || 100,
        active: r.active !== false,
        navSlug: r.nav_slug != null ? String(r.nav_slug) : null,
        demoReady: Boolean(r.demo_ready),
        createdAt: r.created_at ? String(r.created_at) : undefined,
        updatedAt: r.updated_at ? String(r.updated_at) : undefined
    };
}

export function slugifyIndustryId(raw: string): string {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

export async function listBookingIndustries(opts?: { activeOnly?: boolean }): Promise<BookingIndustryRow[]> {
    const activeOnly = Boolean(opts?.activeOnly);
    const { rows } = await query(
        activeOnly
            ? `SELECT * FROM booking_industries WHERE active = TRUE ORDER BY sort_order ASC, short_name ASC`
            : `SELECT * FROM booking_industries ORDER BY sort_order ASC, short_name ASC`
    );
    return rows.map(mapRow);
}

export async function getBookingIndustryById(id: string): Promise<BookingIndustryRow | null> {
    const key = slugifyIndustryId(id);
    if (!key) return null;
    const { rows } = await query(`SELECT * FROM booking_industries WHERE id = $1`, [key]);
    return rows[0] ? mapRow(rows[0]) : null;
}

export async function isActiveBookingIndustryId(id: string): Promise<boolean> {
    const row = await getBookingIndustryById(id);
    return Boolean(row?.active);
}

export async function createBookingIndustry(input: {
    id?: string;
    name: string;
    shortName?: string;
    icon?: string;
    sortOrder?: number;
    active?: boolean;
    navSlug?: string | null;
    demoReady?: boolean;
}): Promise<BookingIndustryRow> {
    const name = String(input.name || '').trim();
    if (!name) {
        const err: any = new Error('name is required');
        err.status = 400;
        throw err;
    }
    const id = slugifyIndustryId(input.id || input.shortName || name);
    if (!id) {
        const err: any = new Error('id is required');
        err.status = 400;
        throw err;
    }
    const shortName = String(input.shortName || name).trim();
    const icon = String(input.icon || 'Building2').trim() || 'Building2';
    const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Math.round(Number(input.sortOrder)) : 200;
    const active = input.active !== false;
    const navSlug =
        input.navSlug === undefined || input.navSlug === null || input.navSlug === ''
            ? `/booking-demo?industry=${id}`
            : String(input.navSlug).trim();
    const demoReady = Boolean(input.demoReady);

    try {
        const { rows } = await query(
            `INSERT INTO booking_industries
                (id, name, short_name, icon, sort_order, active, nav_slug, demo_ready)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [id, name, shortName, icon, sortOrder, active, navSlug, demoReady]
        );
        return mapRow(rows[0]);
    } catch (err: any) {
        if (err?.code === '23505') {
            const e: any = new Error('An industry with this id already exists');
            e.status = 409;
            throw e;
        }
        throw err;
    }
}

export async function updateBookingIndustry(
    id: string,
    input: {
        name?: string;
        shortName?: string;
        icon?: string;
        sortOrder?: number;
        active?: boolean;
        navSlug?: string | null;
        demoReady?: boolean;
    }
): Promise<BookingIndustryRow> {
    const key = slugifyIndustryId(id);
    const existing = await getBookingIndustryById(key);
    if (!existing) {
        const err: any = new Error('Industry not found');
        err.status = 404;
        throw err;
    }

    const name = input.name !== undefined ? String(input.name).trim() : existing.name;
    const shortName =
        input.shortName !== undefined ? String(input.shortName).trim() : existing.shortName;
    const icon = input.icon !== undefined ? String(input.icon).trim() || 'Building2' : existing.icon;
    const sortOrder =
        input.sortOrder !== undefined && Number.isFinite(Number(input.sortOrder))
            ? Math.round(Number(input.sortOrder))
            : existing.sortOrder;
    const active = input.active !== undefined ? Boolean(input.active) : existing.active;
    const navSlug =
        input.navSlug !== undefined
            ? input.navSlug === null || input.navSlug === ''
                ? null
                : String(input.navSlug).trim()
            : existing.navSlug;
    const demoReady = input.demoReady !== undefined ? Boolean(input.demoReady) : existing.demoReady;

    if (!name || !shortName) {
        const err: any = new Error('name and shortName are required');
        err.status = 400;
        throw err;
    }

    const { rows } = await query(
        `UPDATE booking_industries
         SET name = $2,
             short_name = $3,
             icon = $4,
             sort_order = $5,
             active = $6,
             nav_slug = $7,
             demo_ready = $8,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [key, name, shortName, icon, sortOrder, active, navSlug, demoReady]
    );
    return mapRow(rows[0]);
}
