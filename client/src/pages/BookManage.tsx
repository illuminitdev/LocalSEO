import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/utils';

export default function BookManage() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) return;
        apiGet(`/api/public/manage/${token}`)
            .then((d) => setBooking(d.booking))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [token]);

    const cancel = async () => {
        if (!token || !confirm('Cancel this booking? If you paid a deposit, it will be refunded to your card.')) return;
        setBusy(true);
        setError('');
        try {
            const result = await apiPost(`/api/public/manage/${token}/cancel`, {});
            if (result.booking) {
                setBooking(result.booking);
            } else {
                setBooking((b: any) => ({ ...b, status: 'cancelled' }));
            }
            if (result.refundError) {
                setMessage('Booking cancelled, but the card refund failed. Contact the business.');
            } else if (result.refund && !result.refund.skipped) {
                const toCustomer = ((result.refund.refundToCustomerCents || result.refund.amountCents || 0) / 100).toFixed(2);
                setMessage(`Booking cancelled. Refund of £${toCustomer} is on the way to your card.`);
            } else {
                setMessage('Booking cancelled.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    if (error || !booking) return <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Booking not found'}</div>;

    const when = new Date(booking.start_at).toLocaleString('en-GB');

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-2xl border border-[#E2E8F0] p-8 space-y-4">
                <h1 className="text-xl font-black text-[#0F172A]">Manage booking</h1>
                <div className="text-sm space-y-1">
                    <p><span className="text-[#64748B]">Service:</span> <strong>{booking.event_name}</strong></p>
                    <p><span className="text-[#64748B]">When:</span> <strong>{when}</strong></p>
                    <p><span className="text-[#64748B]">Status:</span> <strong>{booking.status}</strong></p>
                </div>
                {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{message}</p>}
                {booking.status !== 'cancelled' && booking.status !== 'done' && (
                    <button type="button" disabled={busy} onClick={cancel} className="w-full py-2.5 rounded-xl border border-red-200 text-red-700 font-bold text-sm">
                        Cancel booking
                    </button>
                )}
                <p className="text-xs text-[#64748B]">To reschedule, contact {booking.org_name} or use the booking link again after cancelling.</p>
                <Link to={`/book/${booking.org_slug}/${booking.event_slug}`} className="block text-center text-sm font-bold text-[#0F172A]">
                    Book again
                </Link>
            </div>
        </div>
    );
}
