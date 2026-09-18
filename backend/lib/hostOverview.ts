import { query } from './db';
import { moneyDashboard } from './costing';
import { getPlanById } from './planCatalog';
import { loadOrgEntitlements } from '../middleware/entitlements';

export async function hostBookingOverview(orgId: string) {
    const { rows: orgRows } = await query(
        `SELECT id, name, slug, booking_industry_id, currency FROM organizations WHERE id = $1`,
        [orgId]
    );
    const org = orgRows[0];
    if (!org) return null;

    const entitlements = await loadOrgEntitlements(orgId);
    const planId = entitlements.planId || null;
    const plan = planId ? getPlanById(planId) : null;

    const [
        clientsRes,
        todayRes,
        upcomingRes,
        requestsRes,
        invoicesPaidRes,
        quotesOpenRes,
        foodOpenRes,
        money
    ] = await Promise.all([
        query(`SELECT COUNT(*)::int AS n FROM clients WHERE org_id = $1`, [orgId]),
        query(
            `SELECT COUNT(*)::int AS n FROM bookings
             WHERE org_id = $1
               AND status <> 'cancelled'
               AND COALESCE(job_status, '') <> 'cancelled'
               AND start_at::date = CURRENT_DATE`,
            [orgId]
        ),
        query(
            `SELECT COUNT(*)::int AS n FROM bookings
             WHERE org_id = $1
               AND status <> 'cancelled'
               AND COALESCE(job_status, '') <> 'cancelled'
               AND start_at >= NOW()
               AND status <> 'done'
               AND COALESCE(job_status, '') NOT IN ('completed', 'invoiced', 'in_progress', 'requested')
               AND (status IN ('confirmed', 'awaiting_payment') OR job_status = 'scheduled')`,
            [orgId]
        ),
        query(
            `SELECT COUNT(*)::int AS n FROM bookings
             WHERE org_id = $1
               AND status <> 'cancelled'
               AND COALESCE(job_status, '') <> 'cancelled'
               AND (job_status = 'requested' OR intake_type = 'request')`,
            [orgId]
        ),
        query(
            `SELECT COUNT(*)::int AS n
             FROM invoices i
             JOIN bookings b ON b.id = i.booking_id
             WHERE b.org_id = $1 AND i.status = 'paid'`,
            [orgId]
        ),
        query(
            `SELECT COUNT(*)::int AS n FROM quotes
             WHERE org_id = $1 AND status IN ('draft', 'sent')`,
            [orgId]
        ),
        query(
            `SELECT COUNT(*)::int AS n FROM food_orders
             WHERE org_id = $1
               AND status NOT IN ('delivered', 'collected', 'cancelled', 'pending_payment')`,
            [orgId]
        ).catch(() => ({ rows: [{ n: 0 }] })),
        moneyDashboard(orgId)
    ]);

    return {
        organization: {
            name: org.name || '',
            slug: org.slug || '',
            booking_industry_id: org.booking_industry_id || null,
            currency: org.currency || 'GBP'
        },
        planId,
        planName: plan?.name || null,
        clients: clientsRes.rows[0]?.n || 0,
        bookingsToday: todayRes.rows[0]?.n || 0,
        upcoming: upcomingRes.rows[0]?.n || 0,
        openRequests: requestsRes.rows[0]?.n || 0,
        invoicesPaid: invoicesPaidRes.rows[0]?.n || 0,
        quotesOpen: quotesOpenRes.rows[0]?.n || 0,
        foodOrdersOpen: foodOpenRes.rows[0]?.n || 0,
        money
    };
}
