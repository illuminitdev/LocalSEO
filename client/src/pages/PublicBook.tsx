import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import CustomerBookingFlow, { type BookingProfile, type BookingSlot } from '../components/CustomerBookingFlow';
import { apiGet } from '../lib/utils';

export default function PublicBook() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [profile, setProfile] = useState<BookingProfile | null>(null);
    const [slots, setSlots] = useState<BookingSlot[]>([]);

    useEffect(() => {
        apiGet('/api/booking/public')
            .then((data) => {
                setProfile({
                    name: data.name,
                    businessName: data.businessName,
                    tradeType: data.tradeType,
                    phone: data.phone,
                    deposit: data.deposit,
                    currency: data.currency,
                    serviceArea: data.serviceArea,
                    emergencyNote: data.emergencyNote,
                    acceptingEmergencies: data.acceptingEmergencies,
                    paymentsMode: data.paymentsMode
                });
                setSlots(data.slots || []);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-[#64748B] font-medium">
                Loading booking schedule...
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
                <p className="text-red-600">{error || 'Booking unavailable — open Booking Plots and pick a profile first.'}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-12">
            <div className="max-w-4xl mx-auto px-4 pt-4">
                <Link to="/booking" className="inline-flex items-center gap-2 mb-4 text-sm font-bold text-[#0F172A]">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Tradesperson Dashboard
                </Link>
                <CustomerBookingFlow profile={profile} slots={slots} />
            </div>
        </div>
    );
}
