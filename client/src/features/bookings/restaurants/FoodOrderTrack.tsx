import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin, Package } from 'lucide-react';
import { apiGet, cn, formatCents } from '../../../shared/utils';
import { PaymentPaidCard } from '../../payments/PaymentPaidCard';
import { orgBrandStyle, resolveOrgBrand } from '../../../shared/orgBrand';
import PlacesMap, { geocodeAddress, type MapMarker } from '../../../shared/PlacesMap';

const STATUS_STEPS_DELIVERY = ['paid', 'preparing', 'out_for_delivery', 'delivered'];
const STATUS_STEPS_PICKUP = ['paid', 'preparing', 'ready', 'collected'];

function statusLabel(s: string) {
    return s.replace(/_/g, ' ');
}

/** Progress 0–1 along restaurant → destination for map courier pin. */
function trackProgress(status: string, fulfillment: string) {
    const steps =
        fulfillment === 'pickup' ? STATUS_STEPS_PICKUP : STATUS_STEPS_DELIVERY;
    const idx = steps.indexOf(status);
    if (idx < 0) return 0;
    return Math.min(1, Math.max(0, idx / Math.max(1, steps.length - 1)));
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export function FoodOrderTrack() {
    const { token } = useParams();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [restaurantPoint, setRestaurantPoint] = useState<{ lat: number; lng: number } | null>(
        null
    );
    const [destPoint, setDestPoint] = useState<{ lat: number; lng: number } | null>(null);

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

    const order = data?.order;
    const org = data?.org;

    useEffect(() => {
        if (!org && !order) return;
        let cancelled = false;

        (async () => {
            const restaurantQuery = [org?.name, org?.serviceArea].filter(Boolean).join(', ');
            const restaurant =
                (restaurantQuery
                    ? await geocodeAddress(restaurantQuery)
                    : null) ||
                (org?.serviceArea ? await geocodeAddress(String(org.serviceArea)) : null);

            let dest: { lat: number; lng: number } | null = null;
            if (order?.fulfillment === 'delivery' && order.deliveryAddress) {
                dest = await geocodeAddress(String(order.deliveryAddress));
            } else if (restaurant) {
                // Pickup: destination is the restaurant itself
                dest = restaurant;
            }

            if (!cancelled) {
                setRestaurantPoint(restaurant);
                setDestPoint(dest);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        org?.name,
        org?.serviceArea,
        order?.fulfillment,
        order?.deliveryAddress,
        order?.status
    ]);

    const markers: MapMarker[] = useMemo(() => {
        if (!order) return [];
        const list: MapMarker[] = [];
        if (restaurantPoint) {
            list.push({
                ...restaurantPoint,
                label: 'R',
                title: org?.name || 'Restaurant',
                highlight: true,
                color: '#0F172A'
            });
        }
        if (destPoint && order.fulfillment === 'delivery') {
            list.push({
                ...destPoint,
                label: 'D',
                title: 'Delivery address',
                color: '#F59E0B'
            });
        }
        if (
            restaurantPoint &&
            destPoint &&
            order.fulfillment === 'delivery' &&
            order.status !== 'cancelled' &&
            order.status !== 'delivered'
        ) {
            const t = trackProgress(order.status, order.fulfillment);
            list.push({
                lat: lerp(restaurantPoint.lat, destPoint.lat, t),
                lng: lerp(restaurantPoint.lng, destPoint.lng, t),
                label: '•',
                title: 'Order in progress',
                color: '#F97316'
            });
        }
        return list;
    }, [order, restaurantPoint, destPoint, org?.name]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-[#64748B]">
                Loading order…
            </div>
        );
    }
    if (error || !order) {
        return (
            <div className="min-h-screen flex items-center justify-center text-red-600 p-6">
                {error || 'Order not found'}
            </div>
        );
    }

    const steps =
        order.fulfillment === 'pickup' ? STATUS_STEPS_PICKUP : STATUS_STEPS_DELIVERY;
    const idx = steps.indexOf(order.status);
    const activeIdx =
        order.status === 'cancelled'
            ? -1
            : idx >= 0
              ? idx
              : order.status === 'pending_payment'
                ? -1
                : 0;

    const brandHost = {
        name: org?.name || 'Restaurant',
        tradeType: org?.tradeType || 'Restaurant',
        logoUrl: org?.logoUrl || '',
        brandPrimary: org?.brandPrimary,
        brandSecondary: org?.brandSecondary
    };
    const brand = resolveOrgBrand(brandHost);

    return (
        <div
            className="min-h-screen"
            style={{
                ...orgBrandStyle(brandHost),
                background: '#F8FAFC',
                fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif"
            }}
        >
            <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm">
                <div className="mx-auto flex h-20 max-w-6xl items-center gap-5 px-4 sm:h-24 sm:gap-6 sm:px-6 lg:px-8">
                    {brand.logoUrl ? (
                        <div className="flex h-12 max-w-[140px] shrink-0 items-center overflow-hidden sm:h-14 sm:max-w-[160px]">
                            <img
                                src={brand.logoUrl}
                                alt=""
                                className="max-h-12 w-auto max-w-[140px] object-contain object-left sm:max-h-14 sm:max-w-[160px]"
                            />
                        </div>
                    ) : (
                        <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg sm:h-14 sm:w-14"
                            style={{
                                background: 'color-mix(in srgb, var(--brand-primary) 18%, white)',
                                color: 'var(--brand-primary)'
                            }}
                        >
                            <Package className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                    )}
                    <div className="min-w-0 leading-snug">
                        <p className="truncate text-base font-extrabold tracking-tight text-[#0F172A] sm:text-lg">
                            {org?.name || 'Restaurant'}
                        </p>
                        <p className="truncate text-xs font-medium text-[#64748B] sm:text-sm capitalize">
                            Order tracking · {order.fulfillment} · {statusLabel(order.status)}
                        </p>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 sm:py-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {org?.slug ? (
                        <Link
                            to={`/book/${org.slug}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#64748B]"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to {org.name}
                        </Link>
                    ) : (
                        <span />
                    )}
                    <p
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: 'var(--brand-primary)' }}
                    >
                        Live updates every 15s
                    </p>
                </div>

                <div>
                    <h1 className="text-2xl font-black text-[#0F172A]">Track your order</h1>
                    <p className="text-sm text-[#64748B] mt-1">
                        Status, items, and map preview for this order.
                    </p>
                </div>

                <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
                    <div className="min-w-0 space-y-5">
                        {order.status === 'cancelled' ? (
                            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                                This order was cancelled.
                            </p>
                        ) : (
                            <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm p-5 sm:p-6 space-y-4">
                                <h2 className="font-black text-lg text-[#0F172A]">Status</h2>
                                <ol className="space-y-3">
                                    {steps.map((s, i) => {
                                        const done = i <= activeIdx;
                                        const current = i === activeIdx;
                                        return (
                                            <li key={s} className="flex items-center gap-3">
                                                <span
                                                    className={cn(
                                                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black',
                                                        done
                                                            ? 'text-[var(--brand-secondary)]'
                                                            : 'bg-[#F1F5F9] text-[#94A3B8]'
                                                    )}
                                                    style={
                                                        done
                                                            ? {
                                                                  background: 'var(--brand-primary)'
                                                              }
                                                            : undefined
                                                    }
                                                >
                                                    {i + 1}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'text-sm font-bold capitalize',
                                                        current
                                                            ? 'text-[#0F172A]'
                                                            : done
                                                              ? 'text-[#0F172A]'
                                                              : 'text-[#94A3B8]'
                                                    )}
                                                >
                                                    {statusLabel(s)}
                                                    {current ? ' · now' : ''}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        )}

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                            <div className="border-b border-[#F1F5F9] px-5 py-3 bg-[#FAFBFC]">
                                <h2 className="text-sm font-black text-[#0F172A]">Items</h2>
                            </div>
                            <ul className="divide-y divide-[#F1F5F9]">
                                {(order.items || []).map((it: any) => (
                                    <li
                                        key={it.id || it.name}
                                        className="flex justify-between gap-3 px-5 py-3.5 text-sm"
                                    >
                                        <span className="text-[#0F172A] font-medium">
                                            {it.quantity}× {it.name}
                                        </span>
                                        <span className="font-bold text-[#0F172A] shrink-0">
                                            {formatCents(it.lineTotalCents)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="border-t border-[#F1F5F9] px-5 py-3 space-y-1 bg-[#FAFBFC] text-sm">
                                {order.deliveryFeeCents > 0 && (
                                    <div className="flex justify-between text-[#64748B]">
                                        <span>Delivery fee</span>
                                        <span className="font-bold text-[#0F172A]">
                                            {formatCents(order.deliveryFeeCents)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between font-black text-[#0F172A]">
                                    <span>Total</span>
                                    <span style={{ color: 'var(--brand-primary)' }}>
                                        {formatCents(order.totalCents)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm p-5 sm:p-6 text-sm space-y-2">
                            <h2 className="font-black text-lg text-[#0F172A]">Details</h2>
                            <p>
                                <span className="font-bold text-[#0F172A]">Name:</span>{' '}
                                <span className="text-[#64748B]">{order.customerName}</span>
                            </p>
                            {order.fulfillment === 'delivery' && (
                                <p className="flex gap-2">
                                    <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[var(--brand-primary)]" />
                                    <span>
                                        <span className="font-bold text-[#0F172A]">Address:</span>{' '}
                                        <span className="text-[#64748B]">
                                            {order.deliveryAddress}
                                        </span>
                                    </span>
                                </p>
                            )}
                            {order.fulfillment === 'pickup' && order.pickupAt && (
                                <p>
                                    <span className="font-bold text-[#0F172A]">Pickup:</span>{' '}
                                    <span className="text-[#64748B]">
                                        {new Date(order.pickupAt).toLocaleString('en-GB')}
                                    </span>
                                </p>
                            )}
                        </div>
                    </div>

                    <aside className="lg:sticky lg:top-28 h-fit space-y-3">
                        <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                            <div className="border-b border-[#F1F5F9] px-4 py-3 bg-[#FAFBFC]">
                                <p className="text-sm font-black text-[#0F172A]">Track on map</p>
                                <p className="text-xs text-[#64748B] mt-0.5">
                                    Google Maps preview · updates with order status
                                </p>
                            </div>
                            <div className="p-3">
                                <PlacesMap
                                    markers={markers}
                                    title="Order track"
                                    height={360}
                                    zoom={markers.length > 1 ? 13 : 15}
                                    showPlaceholder
                                    placeholder={
                                        markers.length
                                            ? 'Loading map…'
                                            : 'Map preview unavailable — add a service area or delivery address to show location.'
                                    }
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="px-4 pb-4 space-y-1 text-[11px] text-[#64748B]">
                                {restaurantPoint && (
                                    <p>
                                        <span className="font-bold text-[#0F172A]">R</span> Restaurant
                                    </p>
                                )}
                                {order.fulfillment === 'delivery' && destPoint && (
                                    <p>
                                        <span className="font-bold text-[#0F172A]">D</span> Delivery
                                    </p>
                                )}
                                {order.fulfillment === 'delivery' &&
                                    order.status !== 'delivered' &&
                                    order.status !== 'cancelled' && (
                                        <p>Orange pin moves as status updates.</p>
                                    )}
                            </div>
                        </div>
                    </aside>
                </div>
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
                            <div className="w-full pt-1">
                                <Link
                                    to={`/book/food-order/${token}`}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-black text-[var(--brand-secondary,#0F172A)] bg-[var(--brand-primary,#F59E0B)] hover:opacity-95 transition"
                                >
                                    Track your order
                                    <ArrowRight className="w-4 h-4" />
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
            <div className="min-h-screen flex items-center justify-center text-[#64748B]">
                Opening order…
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6 text-[#64748B]">
            Confirming payment…
        </div>
    );
}
