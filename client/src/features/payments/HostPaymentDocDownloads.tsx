import { useEffect, useState } from 'react';
import { apiGet } from '../../shared/utils';
import type { PaymentDocument } from './types';
import { PaymentDocHostActions } from './PaymentPaidCard';

/** Loads a payment document by id (or uses provided doc) and shows compact Invoice/Receipt downloads. */
export function HostPaymentDocDownloads({
    documentId,
    doc: initialDoc
}: {
    documentId?: string | null;
    doc?: PaymentDocument | null;
}) {
    const [doc, setDoc] = useState<PaymentDocument | null>(initialDoc || null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (initialDoc) {
            setDoc(initialDoc);
            return;
        }
        if (!documentId) return;
        let cancelled = false;
        apiGet(`/api/host/payment-documents/${encodeURIComponent(documentId)}`)
            .then((res) => {
                if (!cancelled) setDoc(res.paymentDocument || null);
            })
            .catch((e) => {
                if (!cancelled) setError(e.message || 'Could not load payment document');
            });
        return () => {
            cancelled = true;
        };
    }, [documentId, initialDoc]);

    if (error) return <p className="text-[10px] text-red-600">{error}</p>;
    if (!doc) return null;
    return <PaymentDocHostActions doc={doc} />;
}
