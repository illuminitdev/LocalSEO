import { query } from './db';


export type NotificationItem = {
    id: string;
    type: string;
    title: string;
    body: string;
    time: string;
    link: string;
    /** Pre-read by source (e.g. review already opened elsewhere). */
    read?: boolean;
};

export type NotificationState = {
    clearedAt: Date | null;
    clearedIds: Set<string>;
    readIds: Set<string>;
};

export type NotificationAction =
    | { type: 'clear_all'; ids?: string[] }
    | { type: 'read'; ids: string[] }
    | { type: 'read_all'; ids?: string[] }
    | { type: 'dismiss'; ids: string[] };

const MAX_IDS = 500;
const MAX_FEED = 50;

let tableReady = false;

export async function ensureNotificationStateTable() {
    if (tableReady) return;
    await query(`
        CREATE TABLE IF NOT EXISTS notification_state (
            owner_key TEXT NOT NULL,
            panel TEXT NOT NULL,
            cleared_at TIMESTAMPTZ,
            cleared_ids TEXT[] NOT NULL DEFAULT '{}',
            read_ids TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_key, panel)
        )
    `);
    tableReady = true;
}

export async function getNotificationState(ownerKey: string, panel: string): Promise<NotificationState> {
    await ensureNotificationStateTable();
    const { rows } = await query(
        `SELECT cleared_at, cleared_ids, read_ids FROM notification_state WHERE owner_key = $1 AND panel = $2`,
        [ownerKey, panel]
    );
    const row = rows[0];
    return {
        clearedAt: row?.cleared_at ? new Date(row.cleared_at) : null,
        clearedIds: new Set((row?.cleared_ids || []).map(String)),
        readIds: new Set((row?.read_ids || []).map(String))
    };
}

function cleanIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))).slice(0, MAX_IDS);
}

/** Merge new ids onto the end of an existing list, de-duplicated and capped to the newest MAX_IDS. */
function mergeIds(existing: Set<string>, add: string[]): string[] {
    const merged = Array.from(existing).filter((id) => !add.includes(id)).concat(add);
    return merged.slice(-MAX_IDS);
}

export function parseNotificationAction(body: any): NotificationAction | null {
    const type = String(body?.type || '');
    const ids = cleanIds(body?.ids);
    if (type === 'clear_all' || type === 'read_all') return { type, ids };
    if ((type === 'read' || type === 'dismiss') && ids.length) return { type, ids };
    return null;
}

export async function applyNotificationAction(ownerKey: string, panel: string, action: NotificationAction) {
    const state = await getNotificationState(ownerKey, panel);
    const ids = cleanIds(action.ids);
    let clearedAt = state.clearedAt;
    let clearedIds = Array.from(state.clearedIds);
    let readIds = Array.from(state.readIds);

    if (action.type === 'clear_all') {
        clearedAt = new Date();
        clearedIds = mergeIds(state.clearedIds, ids);
        readIds = mergeIds(state.readIds, ids);
    } else if (action.type === 'dismiss') {
        clearedIds = mergeIds(state.clearedIds, ids);
    } else {
        readIds = mergeIds(state.readIds, ids);
    }

    await query(
        `INSERT INTO notification_state (owner_key, panel, cleared_at, cleared_ids, read_ids, updated_at)
         VALUES ($1, $2, $3, $4::text[], $5::text[], NOW())
         ON CONFLICT (owner_key, panel) DO UPDATE SET
            cleared_at = EXCLUDED.cleared_at,
            cleared_ids = EXCLUDED.cleared_ids,
            read_ids = EXCLUDED.read_ids,
            updated_at = NOW()`,
        [ownerKey, panel, clearedAt, clearedIds, readIds]
    );
}

/** Drop ids from both lists (e.g. a notice that should be able to come back later). */
export async function forgetNotificationIds(ownerKey: string, panel: string, ids: string[]) {
    await ensureNotificationStateTable();
    await query(
        `UPDATE notification_state
         SET cleared_ids = ARRAY(SELECT x FROM unnest(cleared_ids) x WHERE NOT (x = ANY($3::text[]))),
             read_ids = ARRAY(SELECT x FROM unnest(read_ids) x WHERE NOT (x = ANY($3::text[]))),
             updated_at = NOW()
         WHERE owner_key = $1 AND panel = $2
           AND (cleared_ids && $3::text[] OR read_ids && $3::text[])`,
        [ownerKey, panel, ids]
    );
}

/**
 * Hide everything cleared (by time watermark or explicit id), mark read flags,
 * sort newest first and cap the list.
 */
export function applyStateToFeed(items: NotificationItem[], state: NotificationState) {
    const clearedMs = state.clearedAt ? state.clearedAt.getTime() : null;
    const seen = new Set<string>();
    const visible = items
        .filter((item) => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            if (state.clearedIds.has(item.id)) return false;
            const t = new Date(item.time).getTime();
            if (clearedMs !== null && Number.isFinite(t) && t <= clearedMs) return false;
            return true;
        })
        .map((item) => ({ ...item, read: Boolean(item.read) || state.readIds.has(item.id) }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, MAX_FEED);

    return {
        notifications: visible,
        unreadCount: visible.filter((n) => !n.read).length,
        generatedAt: new Date().toISOString()
    };
}
