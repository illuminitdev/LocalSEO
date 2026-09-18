export type PaymentLineItem = {
    description: string;
    amountCents: number;
    quantity?: number;
};

export type PaymentDocument = {
    id: string;
    orgId?: string;
    clientId?: string | null;
    sourceType: 'booking_deposit' | 'food_order' | 'quote_deposit' | string;
    sourceId: string;
    invoiceNumber: string;
    amountCents: number;
    currency: string;
    status: string;
    paidAt: string;
    paymentMethodBrand: string;
    paymentMethodLast4: string;
    customerName: string;
    customerEmail: string;
    businessName: string;
    lineItems: PaymentLineItem[];
};

export function formatPaymentMethod(doc: PaymentDocument) {
    const brand = String(doc.paymentMethodBrand || '').trim();
    const last4 = String(doc.paymentMethodLast4 || '').trim();
    if (brand && last4) {
        const label = brand.charAt(0).toUpperCase() + brand.slice(1);
        return `${label} •••• ${last4}`;
    }
    if (last4) return `Card •••• ${last4}`;
    if (brand) return brand.charAt(0).toUpperCase() + brand.slice(1);
    return 'Card payment';
}

export function formatPaidDate(value: string | Date | null | undefined) {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}
