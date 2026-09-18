import { downloadElementAsPdf } from '../../shared/downloadElementAsPdf';
import { formatCents } from '../../shared/utils';
import type { PaymentDocument } from './types';
import { formatPaidDate, formatPaymentMethod } from './types';

export function invoicePdfId(docId: string) {
    return `payment-doc-invoice-${docId}`;
}

export function receiptPdfId(docId: string) {
    return `payment-doc-receipt-${docId}`;
}

export async function downloadPaymentInvoice(doc: PaymentDocument) {
    await downloadElementAsPdf(invoicePdfId(doc.id), `invoice-${doc.invoiceNumber}`);
}

export async function downloadPaymentReceipt(doc: PaymentDocument) {
    await downloadElementAsPdf(receiptPdfId(doc.id), `receipt-${doc.invoiceNumber}`);
}

/** Hidden printable templates — mount once per document near download UI. */
export function PaymentDocPrintables({ doc }: { doc: PaymentDocument }) {
    const amount = formatCents(doc.amountCents, doc.currency);
    const method = formatPaymentMethod(doc);
    const paidDate = formatPaidDate(doc.paidAt);
    const items =
        doc.lineItems?.length > 0
            ? doc.lineItems
            : [{ description: 'Payment', amountCents: doc.amountCents, quantity: 1 }];

    return (
        <div className="fixed left-[-10000px] top-0 w-[700px] pointer-events-none opacity-0" aria-hidden>
            <div id={invoicePdfId(doc.id)} className="bg-white text-[#0F172A] p-8 font-sans">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-[#64748B]">Invoice</p>
                        <h1 className="text-2xl font-bold mt-1">{doc.businessName || 'Invoice'}</h1>
                    </div>
                    <div className="text-right text-sm">
                        <p className="font-semibold">{doc.invoiceNumber}</p>
                        <p className="text-[#64748B]">Paid {paidDate}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-8">
                    <div>
                        <p className="text-[#64748B] text-xs uppercase mb-1">Bill to</p>
                        <p className="font-semibold">{doc.customerName || 'Customer'}</p>
                        {doc.customerEmail && <p className="text-[#64748B]">{doc.customerEmail}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-[#64748B] text-xs uppercase mb-1">Status</p>
                        <p className="font-semibold text-emerald-700">Paid</p>
                    </div>
                </div>
                <table className="w-full text-sm border-collapse mb-6">
                    <thead>
                        <tr className="border-b border-[#E2E8F0] text-left text-[#64748B]">
                            <th className="py-2 font-medium">Description</th>
                            <th className="py-2 font-medium text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((li, i) => (
                            <tr key={i} className="border-b border-[#F1F5F9]">
                                <td className="py-3">
                                    {li.description}
                                    {li.quantity && li.quantity > 1 ? ` × ${li.quantity}` : ''}
                                </td>
                                <td className="py-3 text-right font-medium">
                                    {formatCents(li.amountCents, doc.currency)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="flex justify-end">
                    <div className="w-56 text-sm space-y-1">
                        <div className="flex justify-between font-bold text-base pt-2 border-t border-[#E2E8F0]">
                            <span>Total paid</span>
                            <span>{amount}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div id={receiptPdfId(doc.id)} className="bg-white text-[#0F172A] p-8 font-sans mt-8">
                <div className="text-center mb-8">
                    <p className="text-xs uppercase tracking-wide text-[#64748B]">Payment receipt</p>
                    <h1 className="text-2xl font-bold mt-1">{doc.businessName || 'Receipt'}</h1>
                    <p className="text-3xl font-black mt-4">{amount}</p>
                    <p className="text-emerald-700 font-semibold mt-2">Paid</p>
                </div>
                <div className="space-y-3 text-sm max-w-md mx-auto">
                    <div className="flex justify-between border-b border-[#F1F5F9] py-2">
                        <span className="text-[#64748B]">Invoice number</span>
                        <span className="font-medium">{doc.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#F1F5F9] py-2">
                        <span className="text-[#64748B]">Payment date</span>
                        <span className="font-medium">{paidDate}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#F1F5F9] py-2">
                        <span className="text-[#64748B]">Payment method</span>
                        <span className="font-medium">{method}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#F1F5F9] py-2">
                        <span className="text-[#64748B]">Customer</span>
                        <span className="font-medium">{doc.customerName || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2">
                        <span className="text-[#64748B]">Amount charged</span>
                        <span className="font-medium">{amount}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
