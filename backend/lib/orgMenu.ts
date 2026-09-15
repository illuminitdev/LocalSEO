import { query } from './db';
import { normalizeBookingIndustryId } from './bookingIndustryPresets';

export function isRestaurantOrg(org: any): boolean {
    return normalizeBookingIndustryId(org?.booking_industry_id) === 'restaurants';
}

export function assertRestaurantOrg(org: { booking_industry_id?: string | null; trade_type?: string | null }) {
    if (isRestaurantOrg(org)) return;
    const err: any = new Error('Menu and food orders are only available for restaurants');
    err.status = 403;
    err.code = 'restaurants_only';
    throw err;
}

export async function loadOrgForMenu(orgId: string) {
    const { rows } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    if (!rows[0]) {
        const err: any = new Error('Organization not found');
        err.status = 404;
        throw err;
    }
    assertRestaurantOrg(rows[0]);
    return rows[0];
}

export type MenuItemInput = {
    category?: string;
    name: string;
    description?: string;
    priceCents: number;
    sortOrder?: number;
    active?: boolean;
};

function normalizeItem(raw: any, index = 0): MenuItemInput | null {
    const name = String(raw?.name || raw?.item_name || '').trim();
    if (!name) return null;
    let priceCents = Number(raw?.priceCents ?? raw?.price_cents);
    if (!Number.isFinite(priceCents)) {
        const gbp = String(raw?.price_gbp ?? raw?.price ?? '').replace(/[^0-9.]/g, '');
        const n = parseFloat(gbp);
        priceCents = Number.isFinite(n) ? Math.round(n * 100) : NaN;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) return null;
    const activeRaw = raw?.active;
    const active =
        activeRaw === undefined || activeRaw === null || activeRaw === ''
            ? true
            : !(
                  activeRaw === false ||
                  String(activeRaw).toLowerCase() === 'false' ||
                  String(activeRaw) === '0'
              );
    return {
        category: String(raw?.category || '').trim(),
        name,
        description: String(raw?.description || '').trim(),
        priceCents: Math.round(priceCents),
        sortOrder: Number.isFinite(Number(raw?.sortOrder ?? raw?.sort_order))
            ? Number(raw.sortOrder ?? raw.sort_order)
            : index,
        active
    };
}

export async function listMenuItems(orgId: string, { activeOnly = false } = {}) {
    const { rows } = await query(
        `SELECT * FROM org_menu_items
         WHERE org_id = $1 ${activeOnly ? 'AND active = TRUE' : ''}
         ORDER BY sort_order, category, name`,
        [orgId]
    );
    return rows;
}

export async function createMenuItem(orgId: string, raw: any) {
    const item = normalizeItem(raw);
    if (!item) {
        const err: any = new Error('name and a valid price are required');
        err.status = 400;
        throw err;
    }
    const { rows } = await query(
        `INSERT INTO org_menu_items (org_id, category, name, description, price_cents, sort_order, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [orgId, item.category, item.name, item.description, item.priceCents, item.sortOrder ?? 0, item.active !== false]
    );
    return rows[0];
}

export async function updateMenuItem(orgId: string, id: string, raw: any) {
    const category = raw.category !== undefined ? String(raw.category || '').trim() : null;
    const name = raw.name !== undefined ? String(raw.name || '').trim() : null;
    const description = raw.description !== undefined ? String(raw.description || '').trim() : null;
    let priceCents: number | null = null;
    if (raw.priceCents !== undefined || raw.price_cents !== undefined || raw.price_gbp !== undefined || raw.price !== undefined) {
        const normalized = normalizeItem({ ...raw, name: name || 'x' });
        if (!normalized) {
            const err: any = new Error('Invalid price');
            err.status = 400;
            throw err;
        }
        priceCents = normalized.priceCents;
    }
    const sortOrder = raw.sortOrder !== undefined || raw.sort_order !== undefined
        ? Number(raw.sortOrder ?? raw.sort_order)
        : null;
    const active = raw.active !== undefined ? raw.active !== false : null;

    if (name !== null && !name) {
        const err: any = new Error('Name cannot be empty');
        err.status = 400;
        throw err;
    }

    const { rows } = await query(
        `UPDATE org_menu_items SET
           category = COALESCE($1, category),
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           price_cents = COALESCE($4, price_cents),
           sort_order = COALESCE($5, sort_order),
           active = COALESCE($6, active),
           updated_at = NOW()
         WHERE id = $7 AND org_id = $8 RETURNING *`,
        [category, name, description, priceCents, sortOrder, active, id, orgId]
    );
    if (!rows[0]) {
        const err: any = new Error('Menu item not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

export async function deleteMenuItem(orgId: string, id: string) {
    const { rowCount } = await query('DELETE FROM org_menu_items WHERE id = $1 AND org_id = $2', [id, orgId]);
    if (!rowCount) {
        const err: any = new Error('Menu item not found');
        err.status = 404;
        throw err;
    }
}

export async function importMenuItems(
    orgId: string,
    itemsRaw: any[],
    mode: 'replace' | 'append' = 'append'
) {
    const items = (Array.isArray(itemsRaw) ? itemsRaw : [])
        .map((r, i) => normalizeItem(r, i))
        .filter(Boolean) as MenuItemInput[];
    if (!items.length) {
        const err: any = new Error('No valid menu items to import');
        err.status = 400;
        throw err;
    }
    if (mode === 'replace') {
        await query('DELETE FROM org_menu_items WHERE org_id = $1', [orgId]);
    }
    const created = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const { rows } = await query(
            `INSERT INTO org_menu_items (org_id, category, name, description, price_cents, sort_order, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                orgId,
                item.category || '',
                item.name,
                item.description || '',
                item.priceCents,
                item.sortOrder ?? i,
                item.active !== false
            ]
        );
        created.push(rows[0]);
    }
    return created;
}

export function publicMenuItem(row: any) {
    return {
        id: row.id,
        category: row.category || '',
        name: row.name,
        description: row.description || '',
        priceCents: Number(row.price_cents) || 0,
        sortOrder: Number(row.sort_order) || 0
    };
}
