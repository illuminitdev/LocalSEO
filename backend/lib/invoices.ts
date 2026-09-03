function formatMoney(cents: number, currency = 'GBP') {
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
}

async function clearPendingInvoiceItems(stripeClient: any, customerId: string) {
    const pending = await stripeClient.invoiceItems.list({ customer: customerId, pending: true, limit: 100 });
    for (const item of pending.data) {
        await stripeClient.invoiceItems.del(item.id);
    }
}

async function getOrCreateCustomer(stripeClient: any, booking: any) {
    const existing = await stripeClient.customers.list({ email: booking.customer_email, limit: 1 });
    if (existing.data.length) return existing.data[0];
    return stripeClient.customers.create({
        email: booking.customer_email,
        name: booking.customer_name,
        phone: booking.customer_phone || undefined,
        metadata: { bookingId: booking.id }
    });
}

function effectiveJobTotalCents(booking: any, eventType: any) {
    const depositCents = Number(booking.deposit_cents) || Number(eventType.deposit_cents) || 0;
    let totalCents = Math.max(Number(booking.total_cents) || 0, Number(eventType.total_cents) || 0);
    if (depositCents <= 0) return totalCents;
    if (totalCents <= depositCents) return depositCents;
    // Legacy setups auto-set total to deposit × 3.33 — treat as deposit-only (no balance invoice)
    const legacyEstimate = Math.round(depositCents * 3.33);
    if (Math.abs(totalCents - legacyEstimate) <= 2) return depositCents;
    return totalCents;
}

async function createBalanceInvoice(stripeClient: any, booking: any, eventType: any, org: any) {
    const depositCents = Number(booking.deposit_cents) || 0;
    const totalCents = effectiveJobTotalCents(booking, eventType);
    const balance = Math.max(0, totalCents - depositCents);
    if (balance <= 0) {
        if (!depositCents || !booking.deposit_paid) {
            return { skipped: true, reason: 'No balance due — deposit covers the full job price' };
        }

        const customer = await getOrCreateCustomer(stripeClient, booking);
        await clearPendingInvoiceItems(stripeClient, customer.id);

        await stripeClient.invoiceItems.create({
            customer: customer.id,
            amount: depositCents,
            currency: (org.currency || 'GBP').toLowerCase(),
            description: `${eventType.name} — deposit paid`
        });

        const draft = await stripeClient.invoices.create({
            customer: customer.id,
            collection_method: 'send_invoice',
            days_until_due: 7,
            metadata: { bookingId: booking.id, invoiceKind: 'deposit_receipt' },
            pending_invoice_items_behavior: 'include'
        });
        const finalized = await stripeClient.invoices.finalizeInvoice(draft.id);
        const paid = await stripeClient.invoices.pay(finalized.id, { paid_out_of_band: true });

        return {
            stripeInvoiceId: paid.id,
            hostedUrl: paid.hosted_invoice_url || finalized.hosted_invoice_url,
            amountCents: depositCents,
            status: paid.status
        };
    }

    const customer = await getOrCreateCustomer(stripeClient, booking);

    await clearPendingInvoiceItems(stripeClient, customer.id);

    await stripeClient.invoiceItems.create({
        customer: customer.id,
        amount: totalCents,
        currency: (org.currency || 'GBP').toLowerCase(),
        description: `${eventType.name} — full job price`
    });

    if (depositCents > 0) {
        await stripeClient.invoiceItems.create({
            customer: customer.id,
            amount: -depositCents,
            currency: (org.currency || 'GBP').toLowerCase(),
            description: 'Deposit already paid'
        });
    }

    const invoice = await stripeClient.invoices.create({
        customer: customer.id,
        collection_method: 'send_invoice',
        days_until_due: 7,
        metadata: { bookingId: booking.id },
        pending_invoice_items_behavior: 'include'
    });

    if ((invoice.amount_due || 0) <= 0) {
        if (invoice.status === 'draft') await stripeClient.invoices.del(invoice.id);
        return { skipped: true, reason: 'Invoice balance is zero — nothing to charge' };
    }

    const sent = await stripeClient.invoices.sendInvoice(invoice.id);

    return {
        stripeInvoiceId: sent.id,
        hostedUrl: sent.hosted_invoice_url,
        amountCents: sent.amount_due || balance,
        status: sent.status
    };
}

async function refundBookingDeposit(stripeClient: any, booking: any) {
    if (!booking.deposit_paid) {
        return { skipped: true, reason: 'No deposit was paid' };
    }

    let paymentIntentId = booking.stripe_payment_intent_id;
    if (!paymentIntentId && booking.stripe_session_id) {
        const session = await stripeClient.checkout.sessions.retrieve(booking.stripe_session_id);
        paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    }
    if (!paymentIntentId) {
        return { skipped: true, reason: 'No Stripe payment found to refund' };
    }

    const refund = await stripeClient.refunds.create({ payment_intent: paymentIntentId });
    return {
        refundId: refund.id,
        amountCents: refund.amount,
        status: refund.status
    };
}

export { createBalanceInvoice, refundBookingDeposit, formatMoney };
