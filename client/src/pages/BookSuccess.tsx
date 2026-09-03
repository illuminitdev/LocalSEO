import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Mail, ShieldCheck } from 'lucide-react';
import { apiGet, API_BASE } from '../lib/utils';

export default function BookSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);

    useEffect(() => {
        if (!sessionId) {
            setError('Missing payment session — return to booking and try again.');
            setLoading(false);
            return;
        }
        apiGet(`/api/public/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
            .then((data) => {
                setBooking(data.booking);
            })
            .catch((e) => setError(e.message || 'Could not confirm booking'))
            .finally(() => setLoading(false));
    }, [sessionId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-[#64748B] font-medium">
                Confirming your payment...
            </div>
        );
    }

    if (error || !booking) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
                <div className="max-w-md text-center space-y-4">
                    <p className="text-red-600 font-medium">{error || 'Booking could not be confirmed'}</p>
                    <p className="text-sm text-[#64748B]">If you completed payment, refresh this page — your booking will be confirmed automatically.</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 text-sm font-bold text-white bg-[#0F172A] px-4 py-2 rounded-xl"
                    >
                        Refresh & confirm
                    </button>
                </div>
            </div>
        );
    }

    const when = new Date(booking.start_at).toLocaleString('en-GB');
    const icsUrl = `${API_BASE}/api/public/bookings/${booking.id}/calendar.ics`;

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-black text-[#0F172A]">Booking confirmed</h1>
                <p className="text-sm text-[#64748B] mt-2">Deposit paid. Your appointment is confirmed.</p>

                <div className="mt-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-left text-sm space-y-2">
                    <p><span className="text-[#64748B]">Name:</span> <strong>{booking.customer_name}</strong></p>
                    <p><span className="text-[#64748B]">When:</span> <strong>{when}</strong></p>
                    <p><span className="text-[#64748B]">Address:</span> <strong>{booking.customer_address}</strong></p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                    {booking.manage_token && (
                        <Link to={`/book/manage/${booking.manage_token}`} className="text-sm font-bold text-[#F59E0B]">
                            Reschedule or cancel
                        </Link>
                    )}
                    <a href={icsUrl} className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[#0F172A]">
                        <Download className="w-4 h-4" /> Add to calendar (.ics)
                    </a>
                    <p className="flex items-center justify-center gap-2 text-xs text-[#64748B]">
                        <Mail className="w-3.5 h-3.5" /> Confirmation sent to {booking.customer_email}
                    </p>
                </div>
            </div>
        </div>
    );
}
