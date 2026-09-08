import { query } from './db';

export async function listExpenses(orgId: string, bookingId: string) {
    const { rows } = await query(
        `SELECT * FROM job_expenses WHERE org_id = $1 AND booking_id = $2 ORDER BY created_at DESC`,
        [orgId, bookingId]
    );
    return rows;
}

export async function addExpense(
    orgId: string,
    bookingId: string,
    userId: string | null,
    { category, amountCents, note }: { category?: string; amountCents: number; note?: string }
) {
    const { rows: bookings } = await query(`SELECT id FROM bookings WHERE id = $1 AND org_id = $2`, [
        bookingId,
        orgId
    ]);
    if (!bookings.length) throw Object.assign(new Error('Booking not found'), { status: 404 });
    const { rows } = await query(
        `INSERT INTO job_expenses (org_id, booking_id, category, amount_cents, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
            orgId,
            bookingId,
            String(category || 'materials'),
            Math.max(0, Math.round(Number(amountCents) || 0)),
            String(note || ''),
            userId
        ]
    );
    return rows[0];
}

export async function deleteExpense(orgId: string, expenseId: string) {
    const { rows } = await query(`DELETE FROM job_expenses WHERE id = $1 AND org_id = $2 RETURNING *`, [
        expenseId,
        orgId
    ]);
    if (!rows.length) throw Object.assign(new Error('Expense not found'), { status: 404 });
    return rows[0];
}

export async function listTimeEntries(orgId: string, bookingId: string) {
    const { rows } = await query(
        `SELECT t.*, u.name AS user_name FROM time_entries t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.org_id = $1 AND t.booking_id = $2 ORDER BY t.created_at DESC`,
        [orgId, bookingId]
    );
    return rows;
}

export async function addTimeEntry(
    orgId: string,
    bookingId: string,
    userId: string | null,
    { minutes, note }: { minutes: number; note?: string }
) {
    const { rows: bookings } = await query(`SELECT id FROM bookings WHERE id = $1 AND org_id = $2`, [
        bookingId,
        orgId
    ]);
    if (!bookings.length) throw Object.assign(new Error('Booking not found'), { status: 404 });
    const { rows } = await query(
        `INSERT INTO time_entries (org_id, booking_id, user_id, minutes, note)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [orgId, bookingId, userId, Math.max(0, Math.round(Number(minutes) || 0)), String(note || '')]
    );
    return rows[0];
}

export async function jobProfitSummary(orgId: string, bookingId: string) {
    const { rows: bookings } = await query(
        `SELECT b.*, o.default_hourly_cents,
                COALESCE((SELECT SUM(amount_cents) FROM invoices i WHERE i.booking_id = b.id AND i.status IN ('paid','open','draft')), 0) AS invoice_sum
         FROM bookings b
         JOIN organizations o ON o.id = b.org_id
         WHERE b.id = $1 AND b.org_id = $2`,
        [bookingId, orgId]
    );
    if (!bookings.length) return null;
    const b = bookings[0];
    const expenses = await listExpenses(orgId, bookingId);
    const timeEntries = await listTimeEntries(orgId, bookingId);
    const expenseTotal = expenses.reduce((s, e) => s + (e.amount_cents || 0), 0);
    const minutes = timeEntries.reduce((s, t) => s + (t.minutes || 0), 0);
    const laborCents = Math.round((minutes / 60) * (b.default_hourly_cents || 0));
    const revenue = Math.max(b.total_cents || 0, Number(b.invoice_sum) || 0, b.deposit_cents || 0);
    return {
        booking: b,
        expenses,
        timeEntries,
        expenseTotal,
        laborMinutes: minutes,
        laborCents,
        revenueCents: revenue,
        profitCents: revenue - expenseTotal - laborCents
    };
}

export async function moneyDashboard(orgId: string, { from, to }: { from?: string; to?: string } = {}) {
    const params: any[] = [orgId];
    let dateFilter = '';
    if (from) {
        params.push(from);
        dateFilter += ` AND b.start_at >= $${params.length}`;
    }
    if (to) {
        params.push(to);
        dateFilter += ` AND b.start_at <= $${params.length}`;
    }

    const { rows: rev } = await query(
        `SELECT
            COALESCE(SUM(CASE WHEN b.deposit_paid THEN b.deposit_cents ELSE 0 END), 0)::int AS deposits_paid,
            COALESCE(SUM(b.total_cents), 0)::int AS booked_total
         FROM bookings b
         WHERE b.org_id = $1 AND b.status <> 'cancelled' ${dateFilter}`,
        params
    );

    const invParams: any[] = [orgId];
    let invFilter = '';
    if (from) {
        invParams.push(from);
        invFilter += ` AND i.created_at >= $${invParams.length}`;
    }
    if (to) {
        invParams.push(to);
        invFilter += ` AND i.created_at <= $${invParams.length}`;
    }
    const { rows: inv } = await query(
        `SELECT
            COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount_cents ELSE 0 END), 0)::int AS paid,
            COALESCE(SUM(CASE WHEN i.status IN ('open','draft','sent') THEN i.amount_cents ELSE 0 END), 0)::int AS open_balance
         FROM invoices i
         JOIN bookings b ON b.id = i.booking_id
         WHERE b.org_id = $1 ${invFilter}`,
        invParams
    );

    const expParams: any[] = [orgId];
    let expFilter = '';
    if (from) {
        expParams.push(from);
        expFilter += ` AND e.created_at >= $${expParams.length}`;
    }
    if (to) {
        expParams.push(to);
        expFilter += ` AND e.created_at <= $${expParams.length}`;
    }
    let expenses = 0;
    try {
        const { rows: exp } = await query(
            `SELECT COALESCE(SUM(e.amount_cents), 0)::int AS expenses
             FROM job_expenses e WHERE e.org_id = $1 ${expFilter}`,
            expParams
        );
        expenses = exp[0]?.expenses || 0;
    } catch {
        expenses = 0;
    }

    return {
        depositsPaid: rev[0]?.deposits_paid || 0,
        bookedTotal: rev[0]?.booked_total || 0,
        invoicesPaid: inv[0]?.paid || 0,
        openBalance: inv[0]?.open_balance || 0,
        expenses
    };
}

export function expensesCsv(rows: any[]) {
    const header = 'id,booking_id,category,amount_cents,note,created_at';
    const lines = rows.map(
        (r) =>
            `${r.id},${r.booking_id},${JSON.stringify(r.category)},${r.amount_cents},${JSON.stringify(r.note || '')},${r.created_at}`
    );
    return [header, ...lines].join('\n');
}
