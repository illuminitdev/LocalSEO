import { query } from './db';
import { upsertClientWithProperty } from './clients';
import { stripeAccountOpts } from './stripeConnect';

export type PaymentDocSourceType = 'booking_deposit' | 'food_order' | 'quote_deposit';

export type PaymentLineItem = {
    description: string;
    amountCents: number;
    quantity?: number;
};

export type UpsertPaymentDocumentInput = {
    orgId: string;
    clientId?: string | null;
    sourceType: PaymentDocSourceType;
    sourceId: string;
    amountCents: number;
    currency?: string;
    paidAt?: Date | string | null;
    paymentMethodBrand?: string;
    paymentMethodLast4?: string;
    customerName?: string;
    customerEmail?: string;
    businessName?: string;
    lineItems?: PaymentLineItem[];
    stripeSessionId?: string | null;
    stripePaymentIntentId?: string | null;
};

function slugPrefix(slugOrName: string) {
    const raw = String(slugOrName || 'INV')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 8);
    return raw || 'INV';
}

async function nextInvoiceNumber(orgId: string, orgSlug: string) {
    const prefix = slugPrefix(orgSlug);
    const { rows } = await query(
        `SELECT COUNT(*)::int AS n FROM payment_documents WHERE org_id = $1`,
        [orgId]
    );
    const n = (Number(rows[0]?.n) || 0) + 1;
    return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function publicPaymentDocument(row: any) {
    if (!row) return null;
    const lineItems = Array.isArray(row.line_items)
        ? row.line_items
        : typeof row.line_items === 'string'
          ? JSON.parse(row.line_items || '[]')
          : row.line_items || [];
    return {
        id: row.id,
        orgId: row.org_id,
        clientId: row.client_id || null,
        sourceType: row.source_type,
        sourceId: row.source_id,
        invoiceNumber: row.invoice_number,
        amountCents: Number(row.amount_cents) || 0,
        currency: row.currency || 'GBP',
        status: row.status || 'paid',
        paidAt: row.paid_at,
        paymentMethodBrand: row.payment_method_brand || '',
        paymentMethodLast4: row.payment_method_last4 || '',
        customerName: row.customer_name || '',
        customerEmail: row.customer_email || '',
        businessName: row.business_name || '',
        lineItems: (lineItems || []).map((li: any) => ({
            description: li.description || li.name || '',
            amountCents: Number(li.amountCents ?? li.amount_cents) || 0,
            quantity: li.quantity != null ? Number(li.quantity) : undefined
        })),
        stripeSessionId: row.stripe_session_id || null,
        stripePaymentIntentId: row.stripe_payment_intent_id || null
    };
}

export async function getPaymentDocumentBySource(sourceType: PaymentDocSourceType, sourceId: string) {
    const { rows } = await query(
        `SELECT * FROM payment_documents WHERE source_type = $1 AND source_id = $2 LIMIT 1`,
        [sourceType, sourceId]
    );
    return rows[0] ? publicPaymentDocument(rows[0]) : null;
}

export async function getPaymentDocumentById(orgId: string, id: string) {
    const { rows } = await query(
        `SELECT * FROM payment_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [id, orgId]
    );
    return rows[0] ? publicPaymentDocument(rows[0]) : null;
}

export async function listPaymentDocumentsForClient(orgId: string, clientId: string) {
    const { rows } = await query(
        `SELECT * FROM payment_documents
         WHERE org_id = $1 AND client_id = $2
         ORDER BY paid_at DESC, created_at DESC`,
        [orgId, clientId]
    );
    return rows.map(publicPaymentDocument);
}

export async function listPaymentDocumentsForOrg(orgId: string, { limit = 100 }: { limit?: number } = {}) {
    const { rows } = await query(
        `SELECT * FROM payment_documents
         WHERE org_id = $1
         ORDER BY paid_at DESC, created_at DESC
         LIMIT $2`,
        [orgId, Math.min(Math.max(limit, 1), 500)]
    );
    return rows.map(publicPaymentDocument);
}

export async function upsertPaymentDocument(input: UpsertPaymentDocumentInput) {
    const existing = await query(
        `SELECT * FROM payment_documents WHERE source_type = $1 AND source_id = $2 LIMIT 1`,
        [input.sourceType, input.sourceId]
    );
    if (existing.rows[0]) {
        const { rows } = await query(
            `UPDATE payment_documents SET
                client_id = COALESCE($3, client_id),
                amount_cents = $4,
                currency = COALESCE(NULLIF($5, ''), currency),
                paid_at = COALESCE($6::timestamptz, paid_at),
                payment_method_brand = COALESCE(NULLIF($7, ''), payment_method_brand),
                payment_method_last4 = COALESCE(NULLIF($8, ''), payment_method_last4),
                customer_name = COALESCE(NULLIF($9, ''), customer_name),
                customer_email = COALESCE(NULLIF($10, ''), customer_email),
                business_name = COALESCE(NULLIF($11, ''), business_name),
                line_items = COALESCE($12::jsonb, line_items),
                stripe_session_id = COALESCE($13, stripe_session_id),
                stripe_payment_intent_id = COALESCE($14, stripe_payment_intent_id),
                updated_at = NOW()
             WHERE id = $1 AND org_id = $2
             RETURNING *`,
            [
                existing.rows[0].id,
                input.orgId,
                input.clientId || null,
                Math.max(0, Math.round(Number(input.amountCents) || 0)),
                input.currency || 'GBP',
                input.paidAt || null,
                input.paymentMethodBrand || '',
                input.paymentMethodLast4 || '',
                input.customerName || '',
                input.customerEmail || '',
                input.businessName || '',
                JSON.stringify(input.lineItems || existing.rows[0].line_items || []),
                input.stripeSessionId || null,
                input.stripePaymentIntentId || null
            ]
        );
        return publicPaymentDocument(rows[0]);
    }

    const { rows: orgRows } = await query(`SELECT slug, name FROM organizations WHERE id = $1`, [
        input.orgId
    ]);
    const org = orgRows[0] || {};
    const invoiceNumber = await nextInvoiceNumber(input.orgId, org.slug || org.name || 'INV');

    const { rows } = await query(
        `INSERT INTO payment_documents (
            org_id, client_id, source_type, source_id, invoice_number,
            amount_cents, currency, status, paid_at,
            payment_method_brand, payment_method_last4,
            customer_name, customer_email, business_name, line_items,
            stripe_session_id, stripe_payment_intent_id
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,'paid',COALESCE($8::timestamptz, NOW()),
            $9,$10,$11,$12,$13,$14::jsonb,$15,$16
         ) RETURNING *`,
        [
            input.orgId,
            input.clientId || null,
            input.sourceType,
            input.sourceId,
            invoiceNumber,
            Math.max(0, Math.round(Number(input.amountCents) || 0)),
            input.currency || 'GBP',
            input.paidAt || null,
            input.paymentMethodBrand || '',
            input.paymentMethodLast4 || '',
            input.customerName || '',
            input.customerEmail || '',
            input.businessName || org.name || '',
            JSON.stringify(input.lineItems || []),
            input.stripeSessionId || null,
            input.stripePaymentIntentId || null
        ]
    );
    return publicPaymentDocument(rows[0]);
}

/** Extract card brand/last4 from an expanded Checkout Session or PaymentIntent. */
export async function extractPaymentMethodFromStripe(
    stripeClient: any,
    sessionOrPi: any,
    stripeAccountId?: string | null
): Promise<{ brand: string; last4: string }> {
    const empty = { brand: '', last4: '' };
    if (!stripeClient || !sessionOrPi) return empty;

    try {
        let paymentIntent = sessionOrPi.payment_intent;
        if (typeof paymentIntent === 'string') {
            paymentIntent = await stripeClient.paymentIntents.retrieve(
                paymentIntent,
                { expand: ['payment_method'] },
                stripeAccountOpts(stripeAccountId)
            );
        }
        if (!paymentIntent) return empty;

        let pm = paymentIntent.payment_method;
        if (typeof pm === 'string') {
            pm = await stripeClient.paymentMethods.retrieve(pm, {}, stripeAccountOpts(stripeAccountId));
        }
        const card = pm?.card || paymentIntent.charges?.data?.[0]?.payment_method_details?.card;
        if (!card) {
            const brand = pm?.type || '';
            return { brand, last4: '' };
        }
        return {
            brand: String(card.brand || pm?.type || ''),
            last4: String(card.last4 || '')
        };
    } catch (err: any) {
        console.warn('extractPaymentMethodFromStripe:', err?.message || err);
        return empty;
    }
}

export async function ensureClientForPayment(input: {
    orgId: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
}) {
    const result = await upsertClientWithProperty({
        orgId: input.orgId,
        name: input.name || 'Customer',
        email: input.email || '',
        phone: input.phone || '',
        address: input.address || '',
        status: 'active'
    });
    return result.client;
}
