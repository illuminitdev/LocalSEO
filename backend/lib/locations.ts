import { query } from './db';

export type OrgLocation = {
    id: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
    placeId: string;
    isPrimary: boolean;
    createdAt: string;
};

export class LocationLimitError extends Error {
    status = 400;
    code = 'location_limit';
    constructor(limit: number) {
        super(`Your plan includes ${limit} location${limit === 1 ? '' : 's'}.`);
    }
}

function mapRow(r: any): OrgLocation {
    return {
        id: String(r.id),
        label: String(r.label || ''),
        address: String(r.address || ''),
        lat: Number(r.lat),
        lng: Number(r.lng),
        placeId: String(r.place_id || ''),
        isPrimary: Boolean(r.is_primary),
        createdAt: new Date(r.created_at).toISOString()
    };
}

export async function listLocations(orgId: string): Promise<OrgLocation[]> {
    const { rows } = await query(
        'SELECT * FROM org_locations WHERE org_id = $1 ORDER BY is_primary DESC, created_at ASC',
        [orgId]
    );
    return rows.map(mapRow);
}

export async function primaryLocation(orgId: string): Promise<OrgLocation | null> {
    const { rows } = await query('SELECT * FROM org_locations WHERE org_id = $1 AND is_primary', [orgId]);
    return rows[0] ? mapRow(rows[0]) : null;
}

export async function getLocation(orgId: string, id: string): Promise<OrgLocation | null> {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
    const { rows } = await query('SELECT * FROM org_locations WHERE org_id = $1 AND id = $2', [orgId, id]);
    return rows[0] ? mapRow(rows[0]) : null;
}

export type BusinessPoint = { name?: string; address?: string; lat: number; lng: number; placeId?: string };

/**
 * The business address is always location 1. It is created on first use and kept in step
 * with the connected business if the address changes.
 */
export async function ensurePrimaryLocation(orgId: string, business: BusinessPoint): Promise<OrgLocation> {
    const existing = await query('SELECT * FROM org_locations WHERE org_id = $1 AND is_primary', [orgId]);
    const label = String(business.name || '').trim() || 'Business address';
    const address = String(business.address || '').trim();
    if (existing.rows[0]) {
        const row = existing.rows[0];
        const moved =
            Math.abs(Number(row.lat) - business.lat) > 0.0005 ||
            Math.abs(Number(row.lng) - business.lng) > 0.0005 ||
            (address && address !== row.address);
        if (!moved) return mapRow(row);
        const { rows } = await query(
            `UPDATE org_locations SET label = $2, address = $3, lat = $4, lng = $5, place_id = $6
             WHERE id = $1 RETURNING *`,
            [row.id, label, address, business.lat, business.lng, String(business.placeId || '')]
        );
        return mapRow(rows[0]);
    }
    await query(
        `INSERT INTO org_locations (org_id, label, address, lat, lng, place_id, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT DO NOTHING`,
        [orgId, label, address, business.lat, business.lng, String(business.placeId || '')]
    );
    const { rows } = await query('SELECT * FROM org_locations WHERE org_id = $1 AND is_primary', [orgId]);
    return mapRow(rows[0]);
}

export async function addLocation(
    orgId: string,
    input: { label: string; address: string; lat: number; lng: number; placeId?: string },
    limit: number
): Promise<OrgLocation> {
    const { rows: count } = await query('SELECT COUNT(*)::int AS n FROM org_locations WHERE org_id = $1', [orgId]);
    if (Number(count[0]?.n) >= limit) throw new LocationLimitError(limit);
    const { rows } = await query(
        `INSERT INTO org_locations (org_id, label, address, lat, lng, place_id, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
        [orgId, input.label.slice(0, 80), input.address.slice(0, 300), input.lat, input.lng, String(input.placeId || '')]
    );
    return mapRow(rows[0]);
}

/** The primary location cannot be removed. Its scan history is deleted with it (ON DELETE CASCADE). */
export async function removeLocation(orgId: string, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return false;
    const { rowCount } = await query('DELETE FROM org_locations WHERE org_id = $1 AND id = $2 AND NOT is_primary', [orgId, id]);
    return (rowCount || 0) > 0;
}
