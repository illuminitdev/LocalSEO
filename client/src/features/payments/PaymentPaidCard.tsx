import { useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { formatCents } from '../../shared/utils';
import type { PaymentDocument } from './types';
import { formatPaidDate, formatPaymentMethod } from './types';
import {
    PaymentDocPrintables,
    downloadPaymentInvoice,
    downloadPaymentReceipt
} from './PaymentDocPrintables';

type Props = {
    doc: PaymentDocument;
    /** Optional extra actions below the download buttons (manage booking, track order, etc.) */
    footer?: ReactNode;
    className?: string;
};

export function PaymentDocDownloadButtons({
    doc,
    compact = false
}: {
    doc: PaymentDocument;
    compact?: boolean;
}) {
    const [busy, setBusy] = useState<'invoice' | 'receipt' | null>(null);

    const run = async (kind: 'invoice' | 'receipt') => {
        setBusy(kind);
        try {
            if (kind === 'invoice') await downloadPaymentInvoice(doc);
            else await downloadPaymentReceipt(doc);
        } catch (err) {
            console.error(err);
            alert(kind === 'invoice' ? 'Could not download invoice' : 'Could not download receipt');
        } finally {
            setBusy(null);
        }
    };

    if (compact) {
        return (
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run('invoice')}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0] disabled:opacity-50"
                >
                    {busy === 'invoice' ? '…' : 'Invoice'}
                </button>
                <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => run('receipt')}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#0F172A] text-white disabled:opacity-50"
                >
                    {busy === 'receipt' ? '…' : 'Receipt'}
                </button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-3">
            <button
                type="button"
                disabled={!!busy}
                onClick={() => run('invoice')}
                className="rounded-xl border border-[#0F172A] px-4 py-3 text-sm font-semibold text-[#0F172A] disabled:opacity-50"
            >
                {busy === 'invoice' ? 'Preparing…' : 'Download invoice'}
            </button>
            <button
                type="button"
                disabled={!!busy}
                onClick={() => run('receipt')}
                className="rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
                {busy === 'receipt' ? 'Preparing…' : 'Download receipt'}
            </button>
        </div>
    );
}

export function PaymentPaidCard({ doc, footer, className = '' }: Props) {
    const amount = formatCents(doc.amountCents, doc.currency);
    const method = formatPaymentMethod(doc);
    const paidDate = formatPaidDate(doc.paidAt);

    return (
        <div className={`w-full max-w-md ${className}`}>
            <PaymentDocPrintables doc={doc} />
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
                <div className="flex flex-col items-center text-center">
                    <div className="relative mb-4">
                        <div className="w-14 h-14 rounded-xl bg-[#F1F5F9] flex items-center justify-center">
                            <FileText className="w-7 h-7 text-[#64748B]" />
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">
                            ✓
                        </span>
                    </div>
                    <p className="text-sm text-[#64748B]">Invoice paid</p>
                    <p className="text-3xl font-black text-[#0F172A] mt-1">{amount}</p>
                </div>

                <dl className="mt-8 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                        <dt className="text-[#64748B]">Charge amount</dt>
                        <dd className="font-semibold text-[#0F172A]">{amount}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-[#64748B]">Invoice number</dt>
                        <dd className="font-semibold text-[#0F172A]">{doc.invoiceNumber}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-[#64748B]">Payment date</dt>
                        <dd className="font-semibold text-[#0F172A]">{paidDate}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-[#64748B]">Payment method</dt>
                        <dd className="font-semibold text-[#0F172A]">{method}</dd>
                    </div>
                </dl>

                <div className="mt-8">
                    <PaymentDocDownloadButtons doc={doc} />
                </div>

                {footer && <div className="mt-6 pt-4 border-t border-[#F1F5F9]">{footer}</div>}
            </div>
        </div>
    );
}

/** Host/board helper: printable templates + compact download buttons for a document. */
export function PaymentDocHostActions({ doc }: { doc: PaymentDocument }) {
    return (
        <div className="space-y-2">
            <PaymentDocPrintables doc={doc} />
            <PaymentDocDownloadButtons doc={doc} compact />
        </div>
    );
}
