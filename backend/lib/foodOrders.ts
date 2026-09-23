import { query } from './db';
import { newManageToken } from './authTokens';
import { applicationFeeAmount, stripeAccountOpts } from './stripeConnect';
import { isRestaurantOrg, listMenuItems } from './orgMenu';
import {
    ensureClientForPayment,
    upsertPaymentDocument,
    getPaymentDocumentBySource
} from './paymentDocuments';

function frontendOrigin() {
    return (process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(
        /\/$/,
        ''
    );
}

/** Prefer the page the customer is on (e.g. localhost) so Stripe returns there after pay. */
function resolveCheckoutOrigin(requested?: string | null) {
    const fallback = frontendOrigin();
    const raw = String(requested || '').trim().replace(/\/$/, '');
    if (!raw) return fallback;
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return fallback;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;

    const host = parsed.hostname.toLowerCase();
    const allowedHosts = new Set<string>(['localhost', '127.0.0.1']);
    for (const envKey of ['FRONTEND_URL', 'CLIENT_ORIGIN']) {
        const v = String(process.env[envKey] || '').trim();
        if (!v) continue;
        try {
            allowedHosts.add(new URL(v).hostname.toLowerCase());
        } catch {
            /* ignore */
        }
    }
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const isZappSites = host === 'zappsites.com' || host.endsWith('.zappsites.com');
    if (!isLocal && !isZappSites && !allowedHosts.has(host)) {
        return fallback;
    }
    return `${parsed.protocol}//${parsed.host}`;
}

const HOST_STATUSES = new Set([
    'preparing',
    'out_for_delivery',
    'delivered',
    'ready',
    'collected',
    'cancelled'
]);

export async function confirmFoodOrderPayment({
    foodOrderId,
    stripeSessionId,
    paymentIntentId,
    paymentMethodBrand,
    paymentMethodLast4
}: {
    foodOrderId: string;
    stripeSessionId?: string | null;
    paymentIntentId?: string | null;
    paymentMethodBrand?: string;
    paymentMethodLast4?: string;
}) {
    const { rows } = await query(`SELECT * FROM food_orders WHERE id = $1`, [foodOrderId]);
    const order = rows[0];
    if (!order) return null;
    const alreadyPaid = order.status !== 'pending_payment' && order.paid_at;
    if (!alreadyPaid) {
        await query(
            `UPDATE food_orders SET
               status = 'paid',
               paid_at = COALESCE(paid_at, NOW()),
               stripe_session_id = COALESCE($2, stripe_session_id),
               stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
               updated_at = NOW()
             WHERE id = $1`,
            [foodOrderId, stripeSessionId || null, paymentIntentId ? String(paymentIntentId) : null]
        );
    }

    const loaded = await loadFoodOrderById(foodOrderId);
    if (!loaded) return null;

    try {
        const { rows: orgRows } = await query(
            `SELECT id, name, slug, currency FROM organizations WHERE id = $1`,
            [loaded.org_id]
        );
        const org = orgRows[0];
        let clientId = loaded.client_id || null;
        if (!clientId) {
            const client = await ensureClientForPayment({
                orgId: loaded.org_id,
                name: loaded.customer_name,
                email: loaded.customer_email,
                phone: loaded.customer_phone,
                address: loaded.delivery_address
            });
            clientId = client.id;
            await query(`UPDATE food_orders SET client_id = $1, updated_at = NOW() WHERE id = $2`, [
                clientId,
                loaded.id
            ]);
            loaded.client_id = clientId;
        }

        const lineItems = (loaded.items || []).map((i: any) => ({
            description: `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`,
            amountCents: Number(i.lineTotalCents) || 0,
            quantity: Number(i.quantity) || 1
        }));
        if (Number(loaded.delivery_fee_cents) > 0) {
            lineItems.push({
                description: 'Delivery fee',
                amountCents: Number(loaded.delivery_fee_cents) || 0,
                quantity: 1
            });
        }

        const paymentDocument = await upsertPaymentDocument({
            orgId: loaded.org_id,
            clientId,
            sourceType: 'food_order',
            sourceId: loaded.id,
            amountCents: Number(loaded.total_cents) || 0,
            currency: loaded.currency || org?.currency || 'GBP',
            paidAt: loaded.paid_at || new Date(),
            paymentMethodBrand: paymentMethodBrand || '',
            paymentMethodLast4: paymentMethodLast4 || '',
            customerName: loaded.customer_name,
            customerEmail: loaded.customer_email,
            businessName: org?.name || '',
            lineItems,
            stripeSessionId: stripeSessionId || loaded.stripe_session_id,
            stripePaymentIntentId: paymentIntentId || loaded.stripe_payment_intent_id
        });
        return { ...loaded, paymentDocument };
    } catch (err: any) {
        console.error('Food order payment document error:', err.message);
        const paymentDocument = await getPaymentDocumentBySource('food_order', loaded.id).catch(
            () => null
        );
        return { ...loaded, paymentDocument };
    }
}

export async function loadFoodOrderById(id: string) {
    const { rows } = await query(`SELECT * FROM food_orders WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return attachItems(rows[0]);
}

export async function loadFoodOrderByToken(token: string) {
    const { rows } = await query(`SELECT * FROM food_orders WHERE manage_token = $1`, [token]);
    if (!rows[0]) return null;
    const order = await attachItems(rows[0]);
    const { rows: orgRows } = await query(
        `SELECT id, slug, name, phone, email, currency, service_area, trade_type,
                logo_url, brand_primary, brand_secondary
         FROM organizations WHERE id = $1`,
        [rows[0].org_id]
    );
    const org = orgRows[0]
        ? {
              id: orgRows[0].id,
              slug: orgRows[0].slug,
              name: orgRows[0].name,
              phone: orgRows[0].phone,
              email: orgRows[0].email,
              currency: orgRows[0].currency,
              serviceArea: orgRows[0].service_area || '',
              tradeType: orgRows[0].trade_type || '',
              logoUrl: orgRows[0].logo_url || '',
              brandPrimary: orgRows[0].brand_primary || '',
              brandSecondary: orgRows[0].brand_secondary || ''
          }
        : null;
    return { order, org };
}

async function attachItems(order: any) {
    const { rows: items } = await query(
        `SELECT id, menu_item_id, name, unit_price_cents, quantity, line_total_cents
         FROM food_order_items WHERE food_order_id = $1 ORDER BY created_at`,
        [order.id]
    );
    return {
        ...order,
        items: items.map((i) => ({
            id: i.id,
            menuItemId: i.menu_item_id,
            name: i.name,
            unitPriceCents: Number(i.unit_price_cents) || 0,
            quantity: Number(i.quantity) || 0,
            lineTotalCents: Number(i.line_total_cents) || 0
        }))
    };
}

export function publicFoodOrderPayload(order: any) {
    return {
        id: order.id,
        fulfillment: order.fulfillment,
        status: order.status,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        deliveryAddress: order.delivery_address,
        deliveryNotes: order.delivery_notes,
        pickupAt: order.pickup_at,
        subtotalCents: Number(order.subtotal_cents) || 0,
        deliveryFeeCents: Number(order.delivery_fee_cents) || 0,
        totalCents: Number(order.total_cents) || 0,
        currency: order.currency || 'GBP',
        paidAt: order.paid_at,
        manageToken: order.manage_token,
        createdAt: order.created_at,
        clientId: order.client_id || null,
        paymentDocument: order.paymentDocument || null,
        items: order.items || []
    };
}

export async function listFoodOrders(orgId: string, { limit = 50 } = {}) {
    const { rows } = await query(
        `SELECT * FROM food_orders WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [orgId, Math.min(Number(limit) || 50, 200)]
    );
    const out = [];
    for (const row of rows) {
        const full = await attachItems(row);
        const doc = await getPaymentDocumentBySource('food_order', full.id).catch(() => null);
        out.push(publicFoodOrderPayload({ ...full, paymentDocument: doc }));
    }
    return out;
}

export async function updateFoodOrderStatus(orgId: string, orderId: string, status: string) {
    const next = String(status || '').trim();
    if (!HOST_STATUSES.has(next)) {
        const err: any = new Error('Invalid status');
        err.status = 400;
        throw err;
    }
    const { rows } = await query(
        `UPDATE food_orders SET status = $1, updated_at = NOW()
         WHERE id = $2 AND org_id = $3 AND status <> 'pending_payment'
         RETURNING *`,
        [next, orderId, orgId]
    );
    if (!rows[0]) {
        const err: any = new Error('Order not found or still awaiting payment');
        err.status = 404;
        throw err;
    }
    return publicFoodOrderPayload(await attachItems(rows[0]));
}

type CreateFoodOrderInput = {
    org: any;
    stripeClient: any;
    customerName: string;
    email: string;
    phone: string;
    fulfillment: 'delivery' | 'pickup';
    deliveryAddress?: string;
    deliveryNotes?: string;
    pickupAt?: string | null;
    items: { menuItemId: string; quantity: number }[];
    /** Browser origin where the customer started checkout (localhost / app URL). */
    returnOrigin?: string | null;
};

export async function createFoodOrderCheckout(input: CreateFoodOrderInput) {
    const { org, stripeClient } = input;
    if (!isRestaurantOrg(org)) {
        const err: any = new Error('Food orders are only available for restaurants');
        err.status = 403;
        throw err;
    }

    const fulfillment = input.fulfillment === 'pickup' ? 'pickup' : 'delivery';
    if (fulfillment === 'delivery' && org.food_delivery_enabled === false) {
        const err: any = new Error('Delivery is not enabled for this restaurant');
        err.status = 400;
        throw err;
    }
    if (fulfillment === 'pickup' && org.food_pickup_enabled === false) {
        const err: any = new Error('Pickup is not enabled for this restaurant');
        err.status = 400;
        throw err;
    }

    const customerName = String(input.customerName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const phone = String(input.phone || '').trim();
    if (!customerName || !email || !phone) {
        const err: any = new Error('Name, email and phone are required');
        err.status = 400;
        throw err;
    }

    const deliveryAddress = String(input.deliveryAddress || '').trim();
    const deliveryNotes = String(input.deliveryNotes || '').trim();
    if (fulfillment === 'delivery' && !deliveryAddress) {
        const err: any = new Error('Delivery address is required');
        err.status = 400;
        throw err;
    }

    let pickupAt: string | null = null;
    if (fulfillment === 'pickup') {
        if (!input.pickupAt) {
            const err: any = new Error('Pickup time is required');
            err.status = 400;
            throw err;
        }
        const d = new Date(input.pickupAt);
        if (Number.isNaN(d.getTime())) {
            const err: any = new Error('Invalid pickup time');
            err.status = 400;
            throw err;
        }
        pickupAt = d.toISOString();
    }

    const menu = await listMenuItems(org.id, { activeOnly: true });
    const byId = new Map(menu.map((m: any) => [m.id, m]));
    const lineInputs = Array.isArray(input.items) ? input.items : [];
    if (!lineInputs.length) {
        const err: any = new Error('Add at least one menu item');
        err.status = 400;
        throw err;
    }

    const lines: { menuItemId: string; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[] =
        [];
    let subtotal = 0;
    for (const li of lineInputs) {
        const id = String(li.menuItemId || '').trim();
        const quantity = Math.max(1, Math.min(99, Math.floor(Number(li.quantity) || 0)));
        const item = byId.get(id);
        if (!item || !quantity) {
            const err: any = new Error('Invalid menu item in cart');
            err.status = 400;
            throw err;
        }
        const unit = Number(item.price_cents) || 0;
        const lineTotal = unit * quantity;
        subtotal += lineTotal;
        lines.push({
            menuItemId: id,
            name: item.name,
            unitPriceCents: unit,
            quantity,
            lineTotalCents: lineTotal
        });
    }

    const minOrder = Number(org.delivery_min_order_cents) || 0;
    if (fulfillment === 'delivery' && minOrder > 0 && subtotal < minOrder) {
        const err: any = new Error(`Minimum order for delivery is ${(minOrder / 100).toFixed(2)}`);
        err.status = 400;
        throw err;
    }

    const deliveryFee =
        fulfillment === 'delivery' ? Math.max(0, Number(org.delivery_fee_cents) || 0) : 0;
    const totalCents = subtotal + deliveryFee;
    if (totalCents <= 0) {
        const err: any = new Error('Order total must be greater than zero');
        err.status = 400;
        throw err;
    }

    const allowSimulated =
        String(process.env.ALLOW_SIMULATED_PAYMENTS || '').toLowerCase() === 'true' ||
        String(process.env.ALLOW_SIMULATED_PAYMENTS || '') === '1';

    if (!stripeClient) {
        if (!allowSimulated) {
            const err: any = new Error('Card payments are not configured on the server yet.');
            err.status = 503;
            err.code = 'payments_not_configured';
            throw err;
        }
    } else if (!org.stripe_account_id || !org.stripe_charges_enabled) {
        const err: any = new Error(
            'This restaurant has not finished connecting Stripe. Ask them to connect Stripe in Booking → Settings → Integrations.'
        );
        err.status = 400;
        err.code = 'stripe_not_connected';
        throw err;
    }

    const manageToken = newManageToken();
    const currency = (org.currency || 'GBP').toUpperCase();

    const { rows: orderRows } = await query(
        `INSERT INTO food_orders (
            org_id, fulfillment, status, customer_name, customer_email, customer_phone,
            delivery_address, delivery_notes, pickup_at,
            subtotal_cents, delivery_fee_cents, total_cents, currency, manage_token
         ) VALUES (
            $1,$2,'pending_payment',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
         ) RETURNING *`,
        [
            org.id,
            fulfillment,
            customerName,
            email,
            phone,
            deliveryAddress,
            deliveryNotes,
            pickupAt,
            subtotal,
            deliveryFee,
            totalCents,
            currency,
            manageToken
        ]
    );
    const order = orderRows[0];

    for (const line of lines) {
        await query(
            `INSERT INTO food_order_items (food_order_id, menu_item_id, name, unit_price_cents, quantity, line_total_cents)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [order.id, line.menuItemId, line.name, line.unitPriceCents, line.quantity, line.lineTotalCents]
        );
    }

    if (!stripeClient) {
        const paid = await confirmFoodOrderPayment({ foodOrderId: order.id });
        return {
            mode: 'simulated',
            success: true,
            foodOrderId: order.id,
            manageToken,
            order: publicFoodOrderPayload(paid)
        };
    }

    const fee = applicationFeeAmount(totalCents);
    const lineItems = lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
            currency: currency.toLowerCase(),
            unit_amount: line.unitPriceCents,
            product_data: {
                name: line.name,
                description: `${org.name} food order`
            }
        }
    }));
    if (deliveryFee > 0) {
        lineItems.push({
            quantity: 1,
            price_data: {
                currency: currency.toLowerCase(),
                unit_amount: deliveryFee,
                product_data: {
                    name: 'Delivery fee',
                    description: org.name
                }
            }
        });
    }

    const origin = resolveCheckoutOrigin(input.returnOrigin);
    const session = await stripeClient.checkout.sessions.create(
        {
            mode: 'payment',
            customer_email: email,
            line_items: lineItems,
            payment_intent_data: {
                application_fee_amount: fee,
                metadata: { foodOrderId: order.id, orgId: org.id, kind: 'food_order' }
            },
            metadata: { foodOrderId: order.id, orgId: org.id, kind: 'food_order' },
            success_url: `${origin}/book/food-order/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/book/${org.slug}?food=1&cancelled=1`
        },
        stripeAccountOpts(org.stripe_account_id)
    );

    await query('UPDATE food_orders SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2', [
        session.id,
        order.id
    ]);

    return {
        mode: 'stripe',
        url: session.url,
        sessionId: session.id,
        foodOrderId: order.id,
        manageToken
    };
}

export async function verifyFoodOrderCheckout(stripeClient: any, sessionId: string) {
    if (!stripeClient) {
        const err: any = new Error('Stripe not configured');
        err.status = 503;
        throw err;
    }
    const { rows: sessOrg } = await query(
        `SELECT o.stripe_account_id, fo.id AS food_order_id
         FROM food_orders fo
         JOIN organizations o ON o.id = fo.org_id
         WHERE fo.stripe_session_id = $1
         LIMIT 1`,
        [sessionId]
    );
    const session = await stripeClient.checkout.sessions.retrieve(
        sessionId,
        { expand: ['payment_intent', 'payment_intent.payment_method'] },
        stripeAccountOpts(sessOrg[0]?.stripe_account_id)
    );
    const foodOrderId = session.metadata?.foodOrderId || sessOrg[0]?.food_order_id;
    if (!foodOrderId) {
        const err: any = new Error('Not a food order checkout');
        err.status = 400;
        throw err;
    }
    if (session.payment_status !== 'paid') {
        const err: any = new Error('Payment not completed');
        err.status = 400;
        throw err;
    }
    const pi = session.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    const { extractPaymentMethodFromStripe } = await import('./paymentDocuments');
    const pm = await extractPaymentMethodFromStripe(
        stripeClient,
        session,
        sessOrg[0]?.stripe_account_id
    );
    const order = await confirmFoodOrderPayment({
        foodOrderId,
        stripeSessionId: session.id,
        paymentIntentId,
        paymentMethodBrand: pm.brand,
        paymentMethodLast4: pm.last4
    });
    if (!order) {
        const err: any = new Error('Order not found');
        err.status = 404;
        throw err;
    }
    const { rows: orgRows } = await query(
        `SELECT id, slug, name, phone, email, currency FROM organizations WHERE id = $1`,
        [order.org_id]
    );
    return {
        order: publicFoodOrderPayload(order),
        org: orgRows[0] || null,
        paymentDocument: order.paymentDocument || null
    };
}
