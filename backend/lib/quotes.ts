import { randomBytes } from 'crypto';
import { query } from './db';
import { sendMail } from './bookingEmail';
import { enqueueScheduledMessage } from './bookingReminders';
import { applicationFeeAmount, stripeAccountOpts } from './stripeConnect';
import { newManageToken } from './authTokens';

function frontendOrigin() {
    return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export function newQuoteToken() {
    return randomBytes(24).toString('hex');
}

export function quotePublicUrl(token: string) {
    return `${frontendOrigin()}/quote/${token}`;
}

function lineSubtotal(items: { quantity: number; unit_price_cents: number }[]) {
    return items.reduce((sum, li) => sum + Math.round(Number(li.quantity || 0) * Number(li.unit_price_cents || 0)), 0);
}

export async function loadQuoteWithItems(quoteId: string, orgId?: string) {
    const params: any[] = [quoteId];
    let sql = `SELECT q.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                      o.name AS org_name, o.slug AS org_slug, o.currency AS org_currency,
                      o.stripe_account_id, o.stripe_charges_enabled, o.email AS org_email, o.phone AS org_phone
               FROM quotes q
               JOIN clients c ON c.id = q.client_id
               JOIN organizations o ON o.id = q.org_id
               WHERE q.id = $1`;
    if (orgId) {
        params.push(orgId);
        sql += ` AND q.org_id = $2`;
    }
    const { rows } = await query(sql, params);
    if (!rows.length) return null;
    const quote = rows[0];
    const { rows: lineItems } = await query(
        `SELECT * FROM quote_line_items WHERE quote_id = $1 ORDER BY sort_order, created_at`,
        [quote.id]
    );
    return { quote, lineItems };
}

export async function loadQuoteByToken(token: string) {
    const { rows } = await query(
        `SELECT q.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                o.name AS org_name, o.slug AS org_slug, o.currency AS org_currency,
                o.stripe_account_id, o.stripe_charges_enabled, o.email AS org_email, o.phone AS org_phone,
                o.host_name
         FROM quotes q
         JOIN clients c ON c.id = q.client_id
         JOIN organizations o ON o.id = q.org_id
         WHERE q.public_token = $1`,
        [token]
    );
    if (!rows.length) return null;
    const quote = rows[0];
    if (quote.status === 'sent' && quote.expiry_date && new Date(quote.expiry_date) < new Date(new Date().toDateString())) {
        await query(`UPDATE quotes SET status = 'expired', updated_at = NOW() WHERE id = $1 AND status = 'sent'`, [
            quote.id
        ]);
        quote.status = 'expired';
    }
    const { rows: lineItems } = await query(
        `SELECT * FROM quote_line_items WHERE quote_id = $1 ORDER BY sort_order, created_at`,
        [quote.id]
    );
    return { quote, lineItems };
}

export async function listQuotes(orgId: string, { clientId, status }: { clientId?: string; status?: string } = {}) {
    const params: any[] = [orgId];
    let where = 'q.org_id = $1';
    if (clientId) {
        params.push(clientId);
        where += ` AND q.client_id = $${params.length}`;
    }
    if (status) {
        params.push(status);
        where += ` AND q.status = $${params.length}`;
    }
    const { rows } = await query(
        `SELECT q.*, c.name AS client_name, c.email AS client_email
         FROM quotes q
         JOIN clients c ON c.id = q.client_id
         WHERE ${where}
         ORDER BY q.updated_at DESC
         LIMIT 100`,
        params
    );
    return rows;
}

export async function replaceLineItems(quoteId: string, items: any[]) {
    await query(`DELETE FROM quote_line_items WHERE quote_id = $1`, [quoteId]);
    const normalized = (items || [])
        .map((li: any, idx: number) => ({
            description: String(li.description || '').trim() || 'Line item',
            quantity: Math.max(0.01, Number(li.quantity) || 1),
            unit_price_cents: Math.max(0, Math.round(Number(li.unit_price_cents ?? li.unitPriceCents) || 0)),
            sort_order: idx
        }))
        .filter((li) => li.description);
    for (const li of normalized) {
        await query(
            `INSERT INTO quote_line_items (quote_id, description, quantity, unit_price_cents, sort_order)
             VALUES ($1,$2,$3,$4,$5)`,
            [quoteId, li.description, li.quantity, li.unit_price_cents, li.sort_order]
        );
    }
    const subtotal = lineSubtotal(normalized);
    await query(`UPDATE quotes SET subtotal_cents = $2, updated_at = NOW() WHERE id = $1`, [quoteId, subtotal]);
    return { lineItems: normalized, subtotal_cents: subtotal };
}

export async function createQuote(orgId: string, body: any) {
    const clientId = body.clientId || body.client_id;
    if (!clientId) throw Object.assign(new Error('clientId is required'), { status: 400 });
    const { rows: clients } = await query(`SELECT id FROM clients WHERE id = $1 AND org_id = $2`, [clientId, orgId]);
    if (!clients.length) throw Object.assign(new Error('Client not found'), { status: 404 });

    const token = newQuoteToken();
    const deposit = Math.max(0, Math.round(Number(body.depositCents ?? body.deposit_cents) || 0));
    const title = String(body.title || 'Quote').trim() || 'Quote';
    const notes = String(body.notes || '');
    const expiry = body.expiryDate || body.expiry_date || null;
    const propertyId = body.propertyId || body.property_id || null;

    const { rows } = await query(
        `INSERT INTO quotes (
            org_id, client_id, property_id, status, title, notes, deposit_cents, expiry_date, public_token
         ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8) RETURNING *`,
        [orgId, clientId, propertyId, title, notes, deposit, expiry, token]
    );
    const quote = rows[0];
    const { subtotal_cents } = await replaceLineItems(quote.id, body.lineItems || body.line_items || []);
    quote.subtotal_cents = subtotal_cents;
    return loadQuoteWithItems(quote.id, orgId);
}

export async function updateQuote(orgId: string, quoteId: string, body: any) {
    const existing = await loadQuoteWithItems(quoteId, orgId);
    if (!existing) throw Object.assign(new Error('Quote not found'), { status: 404 });
    if (!['draft', 'sent'].includes(existing.quote.status)) {
        throw Object.assign(new Error('Only draft or sent quotes can be edited'), { status: 400 });
    }

    const title = body.title != null ? String(body.title).trim() || existing.quote.title : existing.quote.title;
    const notes = body.notes != null ? String(body.notes) : existing.quote.notes;
    const deposit =
        body.depositCents != null || body.deposit_cents != null
            ? Math.max(0, Math.round(Number(body.depositCents ?? body.deposit_cents) || 0))
            : existing.quote.deposit_cents;
    const expiry =
        body.expiryDate !== undefined || body.expiry_date !== undefined
            ? body.expiryDate ?? body.expiry_date
            : existing.quote.expiry_date;

    await query(
        `UPDATE quotes SET title = $1, notes = $2, deposit_cents = $3, expiry_date = $4,
            property_id = COALESCE($7::uuid, property_id), updated_at = NOW()
         WHERE id = $5 AND org_id = $6`,
        [
            title,
            notes,
            deposit,
            expiry || null,
            quoteId,
            orgId,
            body.propertyId || body.property_id || null
        ]
    );

    if (body.lineItems || body.line_items) {
        await replaceLineItems(quoteId, body.lineItems || body.line_items);
    }
    return loadQuoteWithItems(quoteId, orgId);
}

export async function sendQuoteEmail(quote: any, lineItems: any[]) {
    const url = quotePublicUrl(quote.public_token);
    const currency = quote.currency || quote.org_currency || 'GBP';
    const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
    const total = `${symbol}${((quote.subtotal_cents || 0) / 100).toFixed(2)}`;
    const deposit =
        quote.deposit_cents > 0 ? `${symbol}${((quote.deposit_cents || 0) / 100).toFixed(2)} deposit on approval` : 'No deposit required';
    const lines = (lineItems || [])
        .map(
            (li) =>
                `- ${li.description} × ${li.quantity} @ ${symbol}${((li.unit_price_cents || 0) / 100).toFixed(2)}`
        )
        .join('\n');

    const subject = `Quote from ${quote.org_name || 'Business'}: ${quote.title}`;
    const text = [
        `Hi ${quote.client_name || 'there'},`,
        '',
        `${quote.org_name || 'Business'} sent you a quote.`,
        '',
        quote.title,
        lines,
        '',
        `Total: ${total}`,
        deposit,
        quote.expiry_date ? `Valid until: ${quote.expiry_date}` : '',
        '',
        `Review and approve: ${url}`,
        quote.notes ? `\nNotes:\n${quote.notes}` : ''
    ]
        .filter(Boolean)
        .join('\n');

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">
        <h1 style="font-size:20px">Quote: ${quote.title}</h1>
        <p>Hi ${quote.client_name || 'there'},</p>
        <p><strong>${quote.org_name || 'Business'}</strong> sent you a quote.</p>
        <p><strong>Total:</strong> ${total}<br/><strong>${deposit}</strong></p>
        <p><a href="${url}" style="display:inline-block;background:#F59E0B;color:#0F172A;padding:10px 16px;border-radius:8px;font-weight:700;text-decoration:none">Review quote</a></p>
      </div>`;

    return sendMail({ to: quote.client_email, subject, text, html });
}

export async function markQuoteSent(orgId: string, quoteId: string, { scheduleFollowUp = true } = {}) {
    const data = await loadQuoteWithItems(quoteId, orgId);
    if (!data) throw Object.assign(new Error('Quote not found'), { status: 404 });
    if (!data.quote.client_email) throw Object.assign(new Error('Client email required to send quote'), { status: 400 });
    if (!data.lineItems.length) throw Object.assign(new Error('Add at least one line item'), { status: 400 });

    await query(
        `UPDATE quotes SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), updated_at = NOW()
         WHERE id = $1 AND org_id = $2`,
        [quoteId, orgId]
    );
    const updated = await loadQuoteWithItems(quoteId, orgId);
    await sendQuoteEmail(updated!.quote, updated!.lineItems);

    if (scheduleFollowUp && updated!.quote.client_email) {
        const sendAt = new Date(Date.now() + 3 * 86400000);
        const url = quotePublicUrl(updated!.quote.public_token);
        await enqueueScheduledMessage({
            orgId,
            clientId: updated!.quote.client_id,
            triggerEvent: 'quote_followup',
            toEmail: updated!.quote.client_email,
            subject: `Reminder: quote from ${updated!.quote.org_name}`,
            bodyText: `Hi ${updated!.quote.client_name},\n\nFriendly reminder to review your quote from ${updated!.quote.org_name}:\n${url}\n\nThanks.`,
            bodyHtml: `<p>Hi ${updated!.quote.client_name},</p><p>Reminder to review your quote from <strong>${updated!.quote.org_name}</strong>.</p><p><a href="${url}">Open quote</a></p>`,
            sendAt
        });
    }
    return updated;
}

async function createJobFromApprovedQuote(quote: any) {
    const { rows: events } = await query(
        `SELECT * FROM event_types WHERE org_id = $1 AND active = TRUE ORDER BY sort_order, created_at LIMIT 1`,
        [quote.org_id]
    );
    const eventType = events[0];
    if (!eventType) return null;

    const start = new Date(Date.now() + 2 * 86400000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + (eventType.duration_minutes || 60) * 60000);
    const manageToken = newManageToken();

    const { rows: props } = await query(
        `SELECT * FROM client_properties WHERE client_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [quote.client_id]
    );

    const { rows } = await query(
        `INSERT INTO bookings (
            org_id, event_type_id, status, customer_name, customer_email, customer_phone,
            customer_address, description, start_at, end_at, deposit_cents, total_cents, manage_token,
            client_id, property_id, job_status, intake_type, deposit_paid, quote_id
         ) VALUES (
            $1,$2,'confirmed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'scheduled','instant',$15,$16
         ) RETURNING *`,
        [
            quote.org_id,
            eventType.id,
            quote.client_name,
            quote.client_email,
            quote.client_phone || '',
            props[0]?.address || '',
            `From quote: ${quote.title}`,
            start.toISOString(),
            end.toISOString(),
            quote.deposit_cents || 0,
            quote.subtotal_cents || eventType.total_cents,
            manageToken,
            quote.client_id,
            quote.property_id || props[0]?.id || null,
            Boolean(quote.deposit_paid || quote.deposit_cents <= 0),
            quote.id
        ]
    );
    const booking = rows[0];
    await query(`UPDATE quotes SET booking_id = $2, updated_at = NOW() WHERE id = $1`, [quote.id, booking.id]);
    return booking;
}

async function cancelQuoteFollowUps(clientId: string, orgId: string) {
    await query(
        `UPDATE scheduled_messages SET status = 'cancelled'
         WHERE org_id = $1 AND client_id = $2 AND trigger_event = 'quote_followup' AND status = 'pending'`,
        [orgId, clientId]
    );
}

export async function declineQuoteByToken(token: string) {
    const data = await loadQuoteByToken(token);
    if (!data) throw Object.assign(new Error('Quote not found'), { status: 404 });
    if (data.quote.status !== 'sent') {
        throw Object.assign(new Error('Only sent quotes can be declined'), { status: 400 });
    }
    await query(
        `UPDATE quotes SET status = 'declined', responded_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [data.quote.id]
    );
    await cancelQuoteFollowUps(data.quote.client_id, data.quote.org_id);
    return loadQuoteByToken(token);
}

export async function approveQuoteByToken(token: string, { stripeClient }: { stripeClient?: any } = {}) {
    const data = await loadQuoteByToken(token);
    if (!data) throw Object.assign(new Error('Quote not found'), { status: 404 });
    const quote = data.quote;
    if (quote.status === 'approved') {
        return { mode: 'already_approved', quote, lineItems: data.lineItems, bookingId: quote.booking_id };
    }
    if (quote.status !== 'sent') {
        throw Object.assign(new Error('Only sent quotes can be approved'), { status: 400 });
    }

    const depositCents = Number(quote.deposit_cents) || 0;
    const allowSimulated =
        String(process.env.ALLOW_SIMULATED_PAYMENTS || '').toLowerCase() === 'true' ||
        String(process.env.ALLOW_SIMULATED_PAYMENTS || '') === '1';

    if (depositCents > 0) {
        if (!stripeClient) {
            if (!allowSimulated) {
                throw Object.assign(new Error('Card payments are not configured'), {
                    status: 503,
                    code: 'payments_not_configured'
                });
            }
        } else if (!quote.stripe_account_id || !quote.stripe_charges_enabled) {
            throw Object.assign(
                new Error('This business has not finished connecting Stripe for deposits'),
                { status: 400, code: 'stripe_not_connected' }
            );
        } else {
            const fee = applicationFeeAmount(depositCents);
            const session = await stripeClient.checkout.sessions.create(
                {
                    mode: 'payment',
                    customer_email: quote.client_email,
                    line_items: [
                        {
                            quantity: 1,
                            price_data: {
                                currency: (quote.org_currency || 'GBP').toLowerCase(),
                                unit_amount: depositCents,
                                product_data: {
                                    name: `Deposit — ${quote.title}`,
                                    description: quote.org_name || 'Quote deposit'
                                }
                            }
                        }
                    ],
                    payment_intent_data: {
                        application_fee_amount: fee,
                        metadata: { quoteId: quote.id, orgId: quote.org_id, kind: 'quote_deposit' }
                    },
                    metadata: { quoteId: quote.id, orgId: quote.org_id, kind: 'quote_deposit' },
                    success_url: `${frontendOrigin()}/quote/${token}?paid=1`,
                    cancel_url: `${frontendOrigin()}/quote/${token}?cancelled=1`
                },
                stripeAccountOpts(quote.stripe_account_id)
            );
            await query(`UPDATE quotes SET stripe_session_id = $2, updated_at = NOW() WHERE id = $1`, [
                quote.id,
                session.id
            ]);
            return { mode: 'stripe', url: session.url, sessionId: session.id };
        }
    }

    await query(
        `UPDATE quotes SET status = 'approved', deposit_paid = $2, responded_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [quote.id, depositCents <= 0 || allowSimulated]
    );
    await cancelQuoteFollowUps(quote.client_id, quote.org_id);
    const refreshed = (await loadQuoteByToken(token))!;
    const booking = await createJobFromApprovedQuote(refreshed.quote);
    const { fireZapierEvent } = await import('./zapier');
    fireZapierEvent(quote.org_id, 'quote.approved', {
        quoteId: quote.id,
        title: quote.title,
        totalCents: quote.total_cents,
        bookingId: booking?.id || null
    }).catch(() => {});
    return {
        mode: 'approved',
        quote: refreshed.quote,
        lineItems: refreshed.lineItems,
        bookingId: booking?.id || null
    };
}

export async function confirmQuoteDeposit({ quoteId, stripeSessionId, paymentIntentId }: any) {
    const { rows } = await query(
        `SELECT q.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
                o.name AS org_name, o.currency AS org_currency
         FROM quotes q
         JOIN clients c ON c.id = q.client_id
         JOIN organizations o ON o.id = q.org_id
         WHERE q.id = $1 OR ($2::text IS NOT NULL AND q.stripe_session_id = $2)
         LIMIT 1`,
        [quoteId || null, stripeSessionId || null]
    );
    if (!rows.length) return null;
    let quote = rows[0];
    if (quote.status === 'approved' && quote.deposit_paid) return quote;

    await query(
        `UPDATE quotes SET status = 'approved', deposit_paid = TRUE,
             stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
             responded_at = COALESCE(responded_at, NOW()), updated_at = NOW()
         WHERE id = $1`,
        [quote.id, paymentIntentId || null]
    );
    await cancelQuoteFollowUps(quote.client_id, quote.org_id);
    quote = (await query(`SELECT q.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
                          FROM quotes q JOIN clients c ON c.id = q.client_id WHERE q.id = $1`, [quote.id])).rows[0];
    if (!quote.booking_id) {
        await createJobFromApprovedQuote(quote);
    }
    const { fireZapierEvent } = await import('./zapier');
    fireZapierEvent(quote.org_id, 'quote.approved', {
        quoteId: quote.id,
        title: quote.title,
        totalCents: quote.total_cents,
        bookingId: quote.booking_id || null
    }).catch(() => {});
    return quote;
}
