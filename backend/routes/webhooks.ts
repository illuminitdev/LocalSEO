import { Request, Response } from 'express';
import { query } from '../lib/db';
import { confirmBookingPayment } from '../lib/confirmBooking';
import { confirmQuoteDeposit } from '../lib/quotes';
import { syncOrgStripeAccount } from '../lib/stripeConnect';
import { syncStripeSubscriptionRecord } from '../middleware/entitlements';
import { fireZapierEvent } from '../lib/zapier';
import { pushPaidInvoiceToQbo } from '../lib/qbo';

function subscriptionIdFromInvoice(invoice: any): string | null {
    const sub = invoice?.subscription;
    if (!sub) return null;
    return typeof sub === 'string' ? sub : sub.id || null;
}

function createStripeWebhookHandler(stripeClient: any) {
    return async (req: Request, res: Response) => {
        if (!stripeClient) return res.status(400).send('Stripe not configured');
        const sig = req.headers['stripe-signature'];
        const secret = process.env.STRIPE_WEBHOOK_SECRET;

        let event: any;
        if (secret) {
            try {
                event = stripeClient.webhooks.constructEvent(req.body, sig, secret);
            } catch (err: any) {
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }
        } else {
            try {
                event = JSON.parse(req.body.toString());
            } catch {
                return res.status(400).send('Invalid payload');
            }
        }

        try {
            if (event.type === 'account.updated') {
                const account = event.data.object;
                await syncOrgStripeAccount(account);
            }

            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                if (session.payment_status === 'paid' && session.metadata?.bookingId) {
                    await confirmBookingPayment({
                        bookingId: session.metadata.bookingId,
                        stripeSessionId: session.id,
                        paymentIntentId: session.payment_intent
                    });
                }
                if (session.payment_status === 'paid' && session.metadata?.quoteId) {
                    await confirmQuoteDeposit({
                        quoteId: session.metadata.quoteId,
                        stripeSessionId: session.id,
                        paymentIntentId: session.payment_intent
                    });
                }
            }

            if (event.type === 'invoice.paid') {
                const invoice = event.data.object;
                const bookingId = invoice.metadata?.bookingId;
                if (bookingId) {
                    const { rows: invRows } = await query(
                        `UPDATE invoices SET status = 'paid', updated_at = NOW() WHERE booking_id = $1 RETURNING *`,
                        [bookingId]
                    );
                    const { rows: bRows } = await query(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
                    const booking = bRows[0];
                    if (booking?.org_id) {
                        const inv = invRows[0] || {
                            id: invoice.id,
                            amount_cents: invoice.amount_paid,
                            booking_id: bookingId
                        };
                        fireZapierEvent(booking.org_id, 'invoice.paid', {
                            bookingId,
                            invoiceId: inv.id,
                            amountCents: inv.amount_cents || invoice.amount_paid
                        }).catch(() => {});
                        pushPaidInvoiceToQbo(booking.org_id, inv, booking).catch(() => {});
                    }
                }

                const stripeSubId = subscriptionIdFromInvoice(invoice);
                if (stripeSubId) {
                    let stripeSub = invoice.subscription;
                    if (typeof stripeSub === 'string' || !stripeSub?.current_period_end) {
                        try {
                            stripeSub = await stripeClient.subscriptions.retrieve(stripeSubId);
                        } catch (err) {
                            console.warn('Could not retrieve subscription for invoice.paid:', err);
                            stripeSub = { id: stripeSubId, status: 'active' };
                        }
                    }
                    await syncStripeSubscriptionRecord(stripeSub);
                }
            }

            if (event.type === 'customer.subscription.updated') {
                await syncStripeSubscriptionRecord(event.data.object);
            }

            if (event.type === 'customer.subscription.deleted') {
                const stripeSub = event.data.object;
                await query(
                    `UPDATE subscriptions
                     SET status = 'canceled', cancel_at_period_end = TRUE, updated_at = NOW()
                     WHERE stripe_subscription_id = $1`,
                    [stripeSub.id]
                );
            }

            res.json({ received: true });
        } catch (err: any) {
            console.error('Webhook handler error:', err);
            res.status(500).json({ error: err.message });
        }
    };
}

export { createStripeWebhookHandler };
