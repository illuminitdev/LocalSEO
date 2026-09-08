import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiGet, apiPost, formatCents } from '../../shared/utils';

export default function PublicQuote() {
    const { token } = useParams();
    const [searchParams] = useSearchParams();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [busy, setBusy] = useState(false);

    const load = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await apiGet(`/api/public/quotes/${token}`);
            setData(res);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Quote not found');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        if (searchParams.get('paid') === '1' && token) {
            setInfo('Payment received — refreshing quote…');
            load().then(() => setInfo('Quote approved and deposit paid. Thank you!'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, token]);

    const approve = async () => {
        if (!token) return;
        setBusy(true);
        setError('');
        try {
            const result = await apiPost(`/api/public/quotes/${token}/approve`, {});
            if (result.url) {
                window.location.href = result.url;
                return;
            }
            setInfo(
                result.mode === 'already_approved'
                    ? 'This quote was already approved.'
                    : 'Quote approved. The business will follow up to schedule the work.'
            );
            await load();
        } catch (e: any) {
            setError(e.message || 'Could not approve');
        } finally {
            setBusy(false);
        }
    };

    const decline = async () => {
        if (!token || !confirm('Decline this quote?')) return;
        setBusy(true);
        setError('');
        try {
            await apiPost(`/api/public/quotes/${token}/decline`, {});
            setInfo('Quote declined.');
            await load();
        } catch (e: any) {
            setError(e.message || 'Could not decline');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center font-bold text-[#64748B]">Loading quote…</div>;
    }

    if (error && !data) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4 text-center">
                <p className="text-red-600 font-bold">{error}</p>
            </div>
        );
    }

    const q = data.quote;
    const currency = q.currency || 'GBP';
    const canRespond = q.status === 'sent';

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-8 px-4">
            <div className="max-w-xl mx-auto space-y-4">
                <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">{q.businessName}</p>
                    <h1 className="text-2xl font-black mt-1">{q.title}</h1>
                    <p className="text-sm text-white/70 mt-1">
                        For {q.clientName} · <span className="uppercase text-xs font-bold">{q.status}</span>
                    </p>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-4 py-2">{info}</p>}

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                    <ul className="divide-y divide-[#F1F5F9]">
                        {(data.lineItems || []).map((li: any) => (
                            <li key={li.id} className="py-2 flex justify-between gap-3 text-sm">
                                <div>
                                    <p className="font-medium text-[#0F172A]">{li.description}</p>
                                    <p className="text-xs text-[#64748B]">
                                        {li.quantity} × {formatCents(li.unitPriceCents, currency)}
                                    </p>
                                </div>
                                <p className="font-bold shrink-0">
                                    {formatCents(Math.round(li.quantity * li.unitPriceCents), currency)}
                                </p>
                            </li>
                        ))}
                    </ul>
                    <div className="border-t border-[#E2E8F0] pt-3 flex justify-between text-sm font-bold">
                        <span>Total</span>
                        <span>{formatCents(q.subtotalCents, currency)}</span>
                    </div>
                    {q.depositCents > 0 && (
                        <p className="text-xs text-[#64748B]">
                            Deposit on approval: {formatCents(q.depositCents, currency)}
                            {q.depositPaid ? ' (paid)' : ''}
                        </p>
                    )}
                    {q.expiryDate && (
                        <p className="text-xs text-[#64748B]">Valid until {String(q.expiryDate).slice(0, 10)}</p>
                    )}
                    {q.notes && <p className="text-sm text-[#64748B] whitespace-pre-wrap">{q.notes}</p>}
                </div>

                {canRespond && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={approve}
                            className="inline-flex items-center gap-1.5 flex-1 justify-center rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-3 text-sm font-bold disabled:opacity-50"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {busy ? '…' : q.depositCents > 0 ? 'Approve & pay deposit' : 'Approve quote'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={decline}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-bold text-red-600 disabled:opacity-50"
                        >
                            <XCircle className="w-4 h-4" /> Decline
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
