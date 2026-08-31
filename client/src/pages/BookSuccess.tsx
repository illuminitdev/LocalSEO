import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { apiGet } from '../lib/utils';

export default function BookSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);
    const [email, setEmail] = useState<any>(null);

    useEffect(() => {
        if (!sessionId) {
            setError('Missing payment session — return to booking and try again.');
            setLoading(false);
            return;
        }
        apiGet(`/api/booking/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
            .then((data) => {
                setBooking(data.booking);
                setEmail(data.email);
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
                    <Link to="/book" className="inline-flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                        <ArrowLeft className="w-4 h-4" /> Back to booking
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-black text-[#0F172A]">Booking confirmed</h1>
                <p className="text-sm text-[#64748B] mt-2">
                    Payment successful. Your deposit for <strong>{booking.slotLabel}</strong> on <strong>{booking.date}</strong> is confirmed.
                </p>

                <div className="mt-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-left text-sm space-y-2">
                    <p><span className="text-[#64748B]">Name:</span> <strong>{booking.customerName}</strong></p>
                    <p><span className="text-[#64748B]">Address:</span> <strong>{booking.address}</strong></p>
                    <p><span className="text-[#64748B]">Deposit paid:</span> <strong className="text-[#F59E0B]">{booking.currency}{Number(booking.depositAmount).toFixed(2)}</strong></p>
                </div>

                <div className="mt-4 flex items-start justify-center gap-2 text-sm text-[#64748B]">
                    <Mail className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                    <p>
                        {email?.sent
                            ? <>Confirmation email sent to <strong>{booking.email}</strong>.</>
                            : email?.mode === 'logged'
                              ? <>Confirmation logged for <strong>{booking.email}</strong> (add SMTP in backend .env to send real emails).</>
                              : <>We will email <strong>{booking.email}</strong> when mail is configured.</>}
                    </p>
                </div>

                <Link
                    to="/book"
                    className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
                >
                    <ArrowLeft className="w-4 h-4" /> Done
                </Link>
            </div>
        </div>
    );
}
