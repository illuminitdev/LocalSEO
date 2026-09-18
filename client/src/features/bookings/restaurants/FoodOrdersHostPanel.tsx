import { useEffect, useState } from 'react';
import { apiGet, apiPatch, cn, formatCents } from '../../../shared/utils';
import { PaymentDocHostActions } from '../../payments/PaymentPaidCard';
import type { PaymentDocument } from '../../payments/types';

type FoodOrder = {
    id: string;
    fulfillment: string;
    status: string;
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    pickupAt?: string | null;
    totalCents: number;
    items: { name: string; quantity: number; lineTotalCents: number }[];
    paymentDocument?: PaymentDocument | null;
    clientId?: string | null;
};

const NEXT: Record<string, { label: string; status: string }[]> = {
    paid: [
        { label: 'Preparing', status: 'preparing' },
        { label: 'Cancel', status: 'cancelled' }
    ],
    preparing: [
        { label: 'Out for delivery', status: 'out_for_delivery' },
        { label: 'Ready for pickup', status: 'ready' },
        { label: 'Cancel', status: 'cancelled' }
    ],
    out_for_delivery: [{ label: 'Delivered', status: 'delivered' }],
    ready: [{ label: 'Collected', status: 'collected' }]
};

export default function FoodOrdersHostPanel() {
    const [orders, setOrders] = useState<FoodOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');

    const load = async () => {
        setError('');
        try {
            const data = await apiGet('/api/host/food-orders');
            setOrders(data.orders || []);
        } catch (e: any) {
            setError(e.message || 'Could not load food orders');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const t = setInterval(load, 20000);
        return () => clearInterval(t);
    }, []);

    const setStatus = async (id: string, status: string) => {
        setBusyId(id);
        try {
            await apiPatch(`/api/host/food-orders/${id}`, { status });
            await load();
        } catch (e: any) {
            setError(e.message || 'Update failed');
        } finally {
            setBusyId('');
        }
    };

    if (loading) return <p className="text-sm text-[#64748B]">Loading food orders…</p>;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h2 className="font-bold text-[#0F172A]">Food orders</h2>
                    <p className="text-sm text-[#64748B]">
                        Paid online orders — update status so guests can track delivery.
                    </p>
                </div>
                <button type="button" onClick={load} className="text-xs font-bold text-[#F59E0B] underline">
                    Refresh
                </button>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {orders.length === 0 && (
                <p className="text-sm text-[#64748B] bg-white border border-[#E2E8F0] rounded-2xl px-4 py-6">
                    No food orders yet.
                </p>
            )}
            {orders.map((order) => {
                const actions = NEXT[order.status] || [];
                return (
                    <div key={order.id} className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-bold text-[#0F172A]">{order.customerName || 'Guest'}</p>
                                <p className="text-xs text-[#64748B]">
                                    {order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
                                    {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                                </p>
                                {order.fulfillment === 'delivery' && order.deliveryAddress && (
                                    <p className="text-sm text-[#0F172A] mt-1">{order.deliveryAddress}</p>
                                )}
                                {order.fulfillment === 'pickup' && order.pickupAt && (
                                    <p className="text-sm text-[#0F172A] mt-1">
                                        Pickup {new Date(order.pickupAt).toLocaleString('en-GB')}
                                    </p>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                <span
                                    className={cn(
                                        'inline-block text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border',
                                        order.status === 'delivered' || order.status === 'collected'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : order.status === 'cancelled'
                                              ? 'bg-red-50 text-red-700 border-red-200'
                                              : 'bg-amber-50 text-amber-800 border-amber-200'
                                    )}
                                >
                                    {order.status.replace(/_/g, ' ')}
                                </span>
                                <p className="font-black text-[#F59E0B] mt-1">
                                    {formatCents(order.totalCents)}
                                </p>
                            </div>
                        </div>
                        <ul className="text-sm text-[#64748B] space-y-0.5">
                            {(order.items || []).map((it, idx) => (
                                <li key={idx}>
                                    {it.quantity}× {it.name}
                                </li>
                            ))}
                        </ul>
                        {order.paymentDocument && (
                            <div className="pt-1">
                                <p className="text-[10px] font-bold uppercase text-[#64748B] mb-1">
                                    Invoice & receipt
                                </p>
                                <PaymentDocHostActions doc={order.paymentDocument} />
                            </div>
                        )}
                        {actions.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {actions.map((a) => (
                                    <button
                                        key={a.status}
                                        type="button"
                                        disabled={busyId === order.id}
                                        onClick={() => setStatus(order.id, a.status)}
                                        className={cn(
                                            'px-3 py-1.5 rounded-xl text-xs font-bold border',
                                            a.status === 'cancelled'
                                                ? 'border-red-200 text-red-600'
                                                : 'bg-[#0F172A] text-white border-[#0F172A]'
                                        )}
                                    >
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
