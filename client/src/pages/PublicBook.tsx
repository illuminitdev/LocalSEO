import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';import { apiGet } from '../lib/utils';
import CustomerBookingFlow from '../components/CustomerBookingFlow';

export default function PublicBookHost() {
    const { hostSlug } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        if (!hostSlug) return;
        apiGet(`/api/public/${hostSlug}`)
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [hostSlug]);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    if (error || !data) return <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Not found'}</div>;

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-6 px-4">
            <div className="max-w-5xl mx-auto">
                <CustomerBookingFlow
                    hostSlug={hostSlug!}
                    host={{
                        name: data.name,
                        tradeType: data.tradeType,
                        phone: data.phone,
                        email: data.email,
                        serviceArea: data.serviceArea
                    }}
                    eventTypes={data.eventTypes.map((et: any) => ({
                        slug: et.slug,
                        name: et.name,
                        description: et.description,
                        durationMinutes: et.duration_minutes,
                        depositCents: et.deposit_cents,
                        totalCents: et.total_cents
                    }))}
                />
            </div>
        </div>
    );
}

export function PublicBookEvent() {
    const { hostSlug, eventSlug } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        if (!hostSlug || !eventSlug) return;
        apiGet(`/api/public/${hostSlug}/${eventSlug}`)
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [hostSlug, eventSlug]);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading schedule…</div>;
    if (error || !data) return <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Not found'}</div>;

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-6 px-4">
            <div className="max-w-5xl mx-auto">
                <CustomerBookingFlow
                    hostSlug={hostSlug!}
                    eventSlug={eventSlug!}
                    host={data.host}
                    eventType={{
                        slug: data.eventType.slug,
                        name: data.eventType.name,
                        description: data.eventType.description,
                        durationMinutes: data.eventType.durationMinutes,
                        depositCents: data.eventType.depositCents,
                        totalCents: data.eventType.totalCents
                    }}
                />
            </div>
        </div>
    );
}
