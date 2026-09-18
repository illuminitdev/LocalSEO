import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, formatCents } from '../../../shared/utils';
import { PaymentPaidCard } from '../../payments/PaymentPaidCard';

const STATUS_STEPS_DELIVERY = ['paid', 'preparing', 'out_for_delivery', 'delivered'];
const STATUS_STEPS_PICKUP = ['paid', 'preparing', 'ready', 'collected'];

function statusLabel(s: string) {
    return s.replace(/_/g, ' ');
}

export function FoodOrderTrack() {
    const { token } = useParams();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = () => {
        if (!token) return;
        apiGet(`/api/public/food-orders/${token}`)
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [token]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading order…</div>;
    }
    if (error || !data?.order) {
        return (
            <div className="min-h-screen flex items-center justify-center text-red-600 p-6">
                {error || 'Order not found'}
            </div>
        );
    }

    const order = data.order;
    const org = data.org;
    const steps =
        order.fulfillment === 'pickup' ? STATUS_STEPS_PICKUP : STATUS_STEPS_DELIVERY;
    const idx = steps.indexOf(order.status);
    const activeIdx = order.status === 'cancelled' ? -1 : idx >= 0 ? idx : order.status === 'pending_payment' ? -1 : 0;

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-8 px-4">
            <div className="max-w-lg mx-auto space-y-4">
                <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">Order tracking</p>
                    <h1 className="text-xl font-black mt-0.5">{org?.name || 'Restaurant'}</h1>
                    <p className="text-sm text-white/70 mt-1 capitalize">
                        {order.fulfillment} · {statusLabel(order.status)}
                    </p>
                </div>

                {order.status === 'cancelled' ? (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">This order was cancelled.</p>
                ) : (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                        <h2 className="font-bold text-[#0F172A]">Status</h2>
                        <ol className="space-y-2">
                            {steps.map((s, i) => (
                                <li
                                    key={s}
                                    className={`text-sm font-medium ${
                                        i <= activeIdx ? 'text-[#0F172A]' : 'text-[#94A3B8]'
                                    }`}
                                >
                                    <span
                                        className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                            i <= activeIdx ? 'bg-[#F59E0B]' : 'bg-[#E2E8F0]'
                                        }`}
                                    />
                                    {statusLabel(s)}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-2">
                    <h2 className="font-bold text-[#0F172A]">Items</h2>
                    {(order.items || []).map((it: any) => (
                        <div key={it.id || it.name} className="flex justify-between text-sm gap-2">
                            <span>
                                {it.quantity}× {it.name}
                            </span>
                            <span className="font-bold">{formatCents(it.lineTotalCents)}</span>
                        </div>
                    ))}
                    {order.deliveryFeeCents > 0 && (
                        <div className="flex justify-between text-sm gap-2">
                            <span>Delivery fee</span>
                            <span className="font-bold">{formatCents(order.deliveryFeeCents)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-black border-t border-[#E2E8F0] pt-2">
                        <span>Total</span>
                        <span className="text-[#F59E0B]">{formatCents(order.totalCents)}</span>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 text-sm space-y-1">
                    <p>
                        <span className="font-bold">Name:</span> {order.customerName}
                    </p>
                    {order.fulfillment === 'delivery' && (
                        <p>
                            <span className="font-bold">Address:</span> {order.deliveryAddress}
                        </p>
                    )}
                    {order.fulfillment === 'pickup' && order.pickupAt && (
                        <p>
                            <span className="font-bold">Pickup:</span>{' '}
                            {new Date(order.pickupAt).toLocaleString('en-GB')}
                        </p>
                    )}
                </div>

                {org?.slug && (
                    <Link to={`/book/${org.slug}`} className="block text-center text-sm font-bold text-[#F59E0B]">
                        Back to {org.name}
                    </Link>
                )}
            </div>
        </div>
    );
}

export function FoodOrderSuccess() {
    const [params] = useSearchParams();
    const sessionId = params.get('session_id');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState('');
    const [paymentDocument, setPaymentDocument] = useState<any>(null);

    useEffect(() => {
        if (!sessionId) {
            setError('Missing session');
            setLoading(false);
            return;
        }
        apiGet(`/api/public/food-orders/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
            .then((data) => {
                const t = data.order?.manageToken;
                if (t) setToken(t);
                else setError('Order not found');
                setPaymentDocument(data.paymentDocument || data.order?.paymentDocument || null);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [sessionId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-[#64748B]">
                Confirming payment…
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-red-600">{error}</div>
        );
    }

    if (paymentDocument) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
                <PaymentPaidCard
                    doc={paymentDocument}
                    footer={
                        token ? (
                            <div className="text-center">
                                <Link
                                    to={`/book/food-order/${token}`}
                                    className="inline-flex text-sm font-bold text-[#F59E0B]"
                                >
                                    Track your order →
                                </Link>
                            </div>
                        ) : null
                    }
                />
            </div>
        );
    }

    if (token) {
        window.location.replace(`/book/food-order/${token}`);
        return (
            <div className="min-h-screen flex items-center justify-center text-[#64748B]">Opening order…</div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6 text-[#64748B]">
            Confirming payment…
        </div>
    );
}
