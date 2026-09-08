import { query } from './db';

export type ClientUpsertInput = {
    orgId: string;
    name: string;
    email: string;
    phone?: string;
    address?: string;
    propertyLabel?: string;
    propertyId?: string | null;
    status?: 'lead' | 'active' | 'inactive';
    notes?: string;
};

/** Match existing property by id or address; otherwise insert a new property (never overwrite unrelated addresses). */
async function resolveProperty(
    clientId: string,
    address: string,
    { propertyId, label }: { propertyId?: string | null; label?: string } = {}
) {
    const addr = String(address || '').trim();
    const propLabel = String(label || 'Service address').trim() || 'Service address';

    if (propertyId) {
        const { rows } = await query(
            `SELECT * FROM client_properties WHERE id = $1 AND client_id = $2`,
            [propertyId, clientId]
        );
        if (rows[0]) {
            if (addr && addr !== rows[0].address) {
                const upd = await query(
                    `UPDATE client_properties SET address = $1, label = COALESCE(NULLIF($2, ''), label) WHERE id = $3 RETURNING *`,
                    [addr, propLabel, rows[0].id]
                );
                return upd.rows[0];
            }
            return rows[0];
        }
    }

    if (!addr) {
        const { rows } = await query(
            `SELECT * FROM client_properties WHERE client_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [clientId]
        );
        return rows[0] || null;
    }

    const { rows: match } = await query(
        `SELECT * FROM client_properties WHERE client_id = $1 AND lower(trim(address)) = lower(trim($2)) LIMIT 1`,
        [clientId, addr]
    );
    if (match[0]) return match[0];

    const { rows } = await query(
        `INSERT INTO client_properties (client_id, address, label) VALUES ($1, $2, $3) RETURNING *`,
        [clientId, addr, propLabel]
    );
    return rows[0];
}

/** Find or create client by org + email; attach/create property without clobbering other addresses. */
export async function upsertClientWithProperty(input: ClientUpsertInput) {
    const email = String(input.email || '')
        .trim()
        .toLowerCase();
    const name = String(input.name || '').trim() || 'Customer';
    const phone = String(input.phone || '').trim();
    const address = String(input.address || '').trim();
    const status = input.status || 'active';
    const notes = input.notes != null ? String(input.notes) : undefined;

    if (!email) {
        const { rows } = await query(
            `INSERT INTO clients (org_id, name, email, phone, status, notes)
             VALUES ($1, $2, '', $3, $4, $5) RETURNING *`,
            [input.orgId, name, phone, status, notes ?? '']
        );
        const client = rows[0];
        const property = address
            ? await resolveProperty(client.id, address, {
                  propertyId: input.propertyId,
                  label: input.propertyLabel
              })
            : null;
        return { client, property, duplicateEmail: false };
    }

    const existing = await query(
        `SELECT * FROM clients WHERE org_id = $1 AND lower(email) = $2 LIMIT 1`,
        [input.orgId, email]
    );

    let client = existing.rows[0];
    const duplicateEmail = Boolean(client);
    if (client) {
        const { rows } = await query(
            `UPDATE clients SET
                name = COALESCE(NULLIF($1, ''), name),
                phone = COALESCE(NULLIF($2, ''), phone),
                status = COALESCE($3, status),
                notes = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE notes END,
                updated_at = NOW()
             WHERE id = $5 RETURNING *`,
            [name, phone, status, notes ?? null, client.id]
        );
        client = rows[0];
    } else {
        const { rows } = await query(
            `INSERT INTO clients (org_id, name, email, phone, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [input.orgId, name, email, phone, status, notes ?? '']
        );
        client = rows[0];
    }

    const property = await resolveProperty(client.id, address, {
        propertyId: input.propertyId,
        label: input.propertyLabel
    });

    return { client, property, duplicateEmail };
}

export async function listClients(orgId: string, { q, status }: { q?: string; status?: string } = {}) {
    const params: any[] = [orgId];
    let where = 'c.org_id = $1';
    if (status && ['lead', 'active', 'inactive'].includes(status)) {
        params.push(status);
        where += ` AND c.status = $${params.length}`;
    }
    if (q && String(q).trim()) {
        params.push(`%${String(q).trim().toLowerCase()}%`);
        where += ` AND (lower(c.name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length} OR c.phone LIKE $${params.length})`;
    }
    const { rows } = await query(
        `SELECT c.*,
                (SELECT address FROM client_properties p WHERE p.client_id = c.id ORDER BY p.created_at ASC LIMIT 1) AS address,
                (SELECT COUNT(*)::int FROM client_properties p WHERE p.client_id = c.id) AS property_count,
                (SELECT COUNT(*)::int FROM bookings b WHERE b.client_id = c.id) AS booking_count
         FROM clients c
         WHERE ${where}
         ORDER BY c.updated_at DESC, c.created_at DESC`,
        params
    );
    return rows;
}

export async function getClientDetail(orgId: string, clientId: string) {
    const { rows } = await query(`SELECT * FROM clients WHERE id = $1 AND org_id = $2`, [clientId, orgId]);
    if (!rows.length) return null;
    const client = rows[0];
    const { rows: properties } = await query(
        `SELECT * FROM client_properties WHERE client_id = $1 ORDER BY created_at ASC`,
        [clientId]
    );
    const { rows: bookings } = await query(
        `SELECT b.*, e.name AS event_name, e.slug AS event_slug,
                i.status AS invoice_status, i.stripe_hosted_url AS invoice_url, i.amount_cents AS invoice_amount_cents
         FROM bookings b
         LEFT JOIN event_types e ON e.id = b.event_type_id
         LEFT JOIN invoices i ON i.booking_id = b.id
         WHERE b.client_id = $1 AND b.org_id = $2
         ORDER BY b.start_at DESC`,
        [clientId, orgId]
    );
    const { rows: invoices } = await query(
        `SELECT i.*, b.start_at AS booking_start, b.customer_name
         FROM invoices i
         JOIN bookings b ON b.id = i.booking_id
         WHERE i.client_id = $1 OR b.client_id = $1
         ORDER BY i.created_at DESC`,
        [clientId]
    );
    const { rows: quotes } = await query(
        `SELECT id, title, status, subtotal_cents, deposit_cents, deposit_paid, expiry_date, public_token, property_id, created_at, updated_at, sent_at
         FROM quotes WHERE client_id = $1 AND org_id = $2
         ORDER BY updated_at DESC`,
        [clientId, orgId]
    );
    return { client, properties, bookings, invoices, quotes };
}

export async function addClientProperty(
    orgId: string,
    clientId: string,
    { address, label, notes }: { address: string; label?: string; notes?: string }
) {
    const { rows: clients } = await query(`SELECT id FROM clients WHERE id = $1 AND org_id = $2`, [
        clientId,
        orgId
    ]);
    if (!clients.length) throw Object.assign(new Error('Client not found'), { status: 404 });
    const addr = String(address || '').trim();
    if (!addr) throw Object.assign(new Error('Address is required'), { status: 400 });
    const { rows } = await query(
        `INSERT INTO client_properties (client_id, address, label, notes)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [clientId, addr, String(label || 'Service address').trim() || 'Service address', String(notes || '')]
    );
    await query(`UPDATE clients SET updated_at = NOW() WHERE id = $1`, [clientId]);
    return rows[0];
}

export async function updateClientProperty(
    orgId: string,
    clientId: string,
    propertyId: string,
    { address, label, notes }: { address?: string; label?: string; notes?: string }
) {
    const { rows: owned } = await query(
        `SELECT p.* FROM client_properties p
         JOIN clients c ON c.id = p.client_id
         WHERE p.id = $1 AND p.client_id = $2 AND c.org_id = $3`,
        [propertyId, clientId, orgId]
    );
    if (!owned.length) throw Object.assign(new Error('Property not found'), { status: 404 });
    const { rows } = await query(
        `UPDATE client_properties SET
            address = COALESCE(NULLIF(trim($1), ''), address),
            label = COALESCE(NULLIF(trim($2), ''), label),
            notes = COALESCE($3, notes)
         WHERE id = $4 RETURNING *`,
        [
            address != null ? String(address) : owned[0].address,
            label != null ? String(label) : owned[0].label,
            notes != null ? String(notes) : owned[0].notes,
            propertyId
        ]
    );
    await query(`UPDATE clients SET updated_at = NOW() WHERE id = $1`, [clientId]);
    return rows[0];
}

export async function deleteClientProperty(orgId: string, clientId: string, propertyId: string) {
    const { rows } = await query(
        `DELETE FROM client_properties p
         USING clients c
         WHERE p.id = $1 AND p.client_id = $2 AND c.id = p.client_id AND c.org_id = $3
         RETURNING p.*`,
        [propertyId, clientId, orgId]
    );
    if (!rows.length) throw Object.assign(new Error('Property not found'), { status: 404 });
    await query(`UPDATE clients SET updated_at = NOW() WHERE id = $1`, [clientId]);
    return rows[0];
}

export async function findDuplicateEmail(orgId: string, email: string, excludeClientId?: string) {
    const e = String(email || '')
        .trim()
        .toLowerCase();
    if (!e) return null;
    const params: any[] = [orgId, e];
    let sql = `SELECT id, name, email FROM clients WHERE org_id = $1 AND lower(email) = $2`;
    if (excludeClientId) {
        params.push(excludeClientId);
        sql += ` AND id <> $${params.length}`;
    }
    sql += ' LIMIT 1';
    const { rows } = await query(sql, params);
    return rows[0] || null;
}

/** Merge mergeClientId into keepClientId (same org). Moves related rows then deletes the duplicate. */
export async function mergeClients(orgId: string, keepClientId: string, mergeClientId: string) {
    if (!keepClientId || !mergeClientId) {
        throw Object.assign(new Error('keepClientId and mergeClientId are required'), { status: 400 });
    }
    if (keepClientId === mergeClientId) {
        throw Object.assign(new Error('Cannot merge a client into itself'), { status: 400 });
    }
    const { rows: clients } = await query(
        `SELECT * FROM clients WHERE org_id = $1 AND id = ANY($2::uuid[])`,
        [orgId, [keepClientId, mergeClientId]]
    );
    if (clients.length !== 2) {
        throw Object.assign(new Error('Both clients must belong to this organization'), { status: 404 });
    }

    const merge = clients.find((c: any) => c.id === mergeClientId);
    const keep = clients.find((c: any) => c.id === keepClientId);

    await query(`UPDATE client_properties SET client_id = $1 WHERE client_id = $2`, [keepClientId, mergeClientId]);
    await query(`UPDATE bookings SET client_id = $1 WHERE client_id = $2 AND org_id = $3`, [
        keepClientId,
        mergeClientId,
        orgId
    ]);
    await query(`UPDATE quotes SET client_id = $1 WHERE client_id = $2 AND org_id = $3`, [
        keepClientId,
        mergeClientId,
        orgId
    ]);
    await query(`UPDATE invoices SET client_id = $1 WHERE client_id = $2`, [keepClientId, mergeClientId]);
    await query(
        `UPDATE client_portal_tokens SET client_id = $1 WHERE client_id = $2`,
        [keepClientId, mergeClientId]
    );
    await query(
        `UPDATE clients SET referred_by_client_id = $1 WHERE referred_by_client_id = $2 AND org_id = $3`,
        [keepClientId, mergeClientId, orgId]
    );
    // Avoid unique (org_id, customer_phone) conflicts: drop merge threads that collide, else reassign
    await query(
        `DELETE FROM message_threads m
         WHERE m.client_id = $2 AND m.org_id = $3
           AND EXISTS (
             SELECT 1 FROM message_threads k
             WHERE k.org_id = m.org_id
               AND k.customer_phone = m.customer_phone
               AND k.client_id = $1
           )`,
        [keepClientId, mergeClientId, orgId]
    );
    await query(
        `UPDATE message_threads SET client_id = $1 WHERE client_id = $2 AND org_id = $3`,
        [keepClientId, mergeClientId, orgId]
    );

    const mergedNotes = [keep?.notes, merge?.notes].map((n: any) => String(n || '').trim()).filter(Boolean);
    await query(
        `UPDATE clients SET
            phone = CASE WHEN trim(COALESCE(phone, '')) = '' THEN $2 ELSE phone END,
            notes = $3,
            updated_at = NOW()
         WHERE id = $1`,
        [keepClientId, merge?.phone || '', mergedNotes.join('\n---\n')]
    );
    await query(`DELETE FROM clients WHERE id = $1 AND org_id = $2`, [mergeClientId, orgId]);
    return getClientDetail(orgId, keepClientId);
}
