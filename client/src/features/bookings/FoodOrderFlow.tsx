import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react';
import { apiGet, apiPost, cn, formatCents, restrictPhoneInput } from '../../shared/utils';
import { todayStr } from './bookingUtils';

export type MenuItemPublic = {
    id: string;
    category: string;
    name: string;
    description: string;
    priceCents: number;
};

type FoodOrdering = {
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    deliveryFeeCents: number;
    deliveryMinOrderCents: number;
    deliveryNotes: string;
};

type Props = {
    hostSlug: string;
    hostName: string;
    menuItems: MenuItemPublic[];
    foodOrdering: FoodOrdering;
    eventSlugForPickup?: string;
    onBack: () => void;
};

type Cart = Record<string, number>;

export default function FoodOrderFlow({
    hostSlug,
    hostName,
    menuItems,
    foodOrdering,
    eventSlugForPickup,
    onBack
}: Props) {
    const [cart, setCart] = useState<Cart>({});
    const [step, setStep] = useState<'menu' | 'checkout'>('menu');
    const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>(
        foodOrdering.deliveryEnabled ? 'delivery' : 'pickup'
    );
    const [customerName, setCustomerName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [deliveryNotes, setDeliveryNotes] = useState('');
    const [pickupDate, setPickupDate] = useState(todayStr());
    const [pickupSlots, setPickupSlots] = useState<{ startAt: string; label: string }[]>([]);
    const [pickupAt, setPickupAt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const byCategory = useMemo(() => {
        const map = new Map<string, MenuItemPublic[]>();
        for (const item of menuItems) {
            const cat = item.category || 'Menu';
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(item);
        }
        return [...map.entries()];
    }, [menuItems]);

    const lines = useMemo(() => {
        return menuItems
            .filter((m) => (cart[m.id] || 0) > 0)
            .map((m) => ({
                item: m,
                quantity: cart[m.id],
                lineTotal: m.priceCents * cart[m.id]
            }));
    }, [menuItems, cart]);

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const deliveryFee =
        fulfillment === 'delivery' ? Math.max(0, foodOrdering.deliveryFeeCents || 0) : 0;
    const total = subtotal + deliveryFee;
    const cartCount = lines.reduce((s, l) => s + l.quantity, 0);

    useEffect(() => {
        if (fulfillment !== 'pickup' || !eventSlugForPickup || !pickupDate) {
            setPickupSlots([]);
            return;
        }
        apiGet(`/api/public/${hostSlug}/${eventSlugForPickup}/availability?from=${pickupDate}&to=${pickupDate}`)
            .then((data) => {
                const slots = (data.slots || data || []).map((s: any) => ({
                    startAt: s.startAt,
                    label: s.label || new Date(s.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                }));
                setPickupSlots(slots);
            })
            .catch(() => setPickupSlots([]));
    }, [fulfillment, eventSlugForPickup, pickupDate, hostSlug]);

    const setQty = (id: string, qty: number) => {
        setCart((c) => {
            const next = { ...c };
            if (qty <= 0) delete next[id];
            else next[id] = Math.min(99, qty);
            return next;
        });
    };

    const goCheckout = () => {
        if (!lines.length) {
            setError('Add at least one item');
            return;
        }
        setError('');
        setStep('checkout');
    };

    const submit = async () => {
        setError('');
        if (!customerName.trim() || !email.trim() || !phone.trim()) {
            setError('Name, email and phone are required');
            return;
        }
        if (fulfillment === 'delivery' && !deliveryAddress.trim()) {
            setError('Delivery address is required');
            return;
        }
        if (
            fulfillment === 'delivery' &&
            foodOrdering.deliveryMinOrderCents > 0 &&
            subtotal < foodOrdering.deliveryMinOrderCents
        ) {
            setError(`Minimum order for delivery is ${formatCents(foodOrdering.deliveryMinOrderCents)}`);
            return;
        }
        if (fulfillment === 'pickup' && !pickupAt) {
            setError('Choose a pickup time');
            return;
        }
        setSubmitting(true);
        try {
            const result = await apiPost(`/api/public/${hostSlug}/food-orders`, {
                customerName: customerName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                fulfillment,
                deliveryAddress: deliveryAddress.trim(),
                deliveryNotes: deliveryNotes.trim(),
                pickupAt: fulfillment === 'pickup' ? pickupAt : null,
                items: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity }))
            });
            if (result.url) {
                window.location.href = result.url;
                return;
            }
            if (result.manageToken) {
                window.location.href = `/book/food-order/${result.manageToken}`;
                return;
            }
            throw new Error(result.error || 'Checkout failed');
        } catch (e: any) {
            setError(e.message || 'Checkout failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-4 flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">Order food</p>
                    <h1 className="text-xl font-black mt-0.5">{hostName}</h1>
                    <p className="text-sm text-white/70 mt-1">Pay online — delivery to your home or collection.</p>
                </div>
                <button type="button" onClick={onBack} className="text-xs font-bold text-[#F59E0B] underline shrink-0">
                    ← Back
                </button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            {step === 'menu' && (
                <>
                    {byCategory.map(([cat, items]) => (
                        <div key={cat} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                            <h2 className="font-bold text-[#0F172A]">{cat}</h2>
                            {items.map((item) => {
                                const qty = cart[item.id] || 0;
                                return (
                                    <div
                                        key={item.id}
                                        className="flex items-start justify-between gap-3 border-t border-[#E2E8F0] pt-3 first:border-0 first:pt-0"
                                    >
                                        <div>
                                            <p className="font-bold text-[#0F172A]">{item.name}</p>
                                            {item.description && (
                                                <p className="text-sm text-[#64748B] mt-0.5">{item.description}</p>
                                            )}
                                            <p className="text-sm font-black text-[#F59E0B] mt-1">
                                                {formatCents(item.priceCents)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {qty > 0 && (
                                                <button
                                                    type="button"
                                                    className="w-8 h-8 rounded-full border border-[#E2E8F0] flex items-center justify-center"
                                                    onClick={() => setQty(item.id, qty - 1)}
                                                >
                                                    <Minus className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {qty > 0 && <span className="font-bold w-4 text-center">{qty}</span>}
                                            <button
                                                type="button"
                                                className="w-8 h-8 rounded-full bg-[#0F172A] text-white flex items-center justify-center"
                                                onClick={() => setQty(item.id, qty + 1)}
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    <div className="sticky bottom-4">
                        <button
                            type="button"
                            disabled={!cartCount}
                            onClick={goCheckout}
                            className={cn(
                                'w-full rounded-2xl px-5 py-4 font-black flex items-center justify-between',
                                cartCount ? 'bg-[#F59E0B] text-[#0F172A]' : 'bg-[#E2E8F0] text-[#94A3B8]'
                            )}
                        >
                            <span className="inline-flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5" /> Checkout ({cartCount})
                            </span>
                            <span>{formatCents(subtotal)}</span>
                        </button>
                    </div>
                </>
            )}

            {step === 'checkout' && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                    <button
                        type="button"
                        onClick={() => setStep('menu')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B]"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" /> Edit cart
                    </button>
                    <ul className="space-y-1 text-sm">
                        {lines.map((l) => (
                            <li key={l.item.id} className="flex justify-between gap-2">
                                <span>
                                    {l.quantity}× {l.item.name}
                                </span>
                                <span className="font-bold">{formatCents(l.lineTotal)}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="flex flex-wrap gap-2">
                        {foodOrdering.deliveryEnabled && (
                            <button
                                type="button"
                                onClick={() => setFulfillment('delivery')}
                                className={cn(
                                    'px-3 py-2 rounded-xl text-xs font-bold border',
                                    fulfillment === 'delivery'
                                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                        : 'border-[#E2E8F0] text-[#64748B]'
                                )}
                            >
                                Delivery
                            </button>
                        )}
                        {foodOrdering.pickupEnabled && (
                            <button
                                type="button"
                                onClick={() => setFulfillment('pickup')}
                                className={cn(
                                    'px-3 py-2 rounded-xl text-xs font-bold border',
                                    fulfillment === 'pickup'
                                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                        : 'border-[#E2E8F0] text-[#64748B]'
                                )}
                            >
                                Pickup
                            </button>
                        )}
                    </div>

                    {fulfillment === 'delivery' && (
                        <>
                            {foodOrdering.deliveryNotes && (
                                <p className="text-sm text-[#64748B]">{foodOrdering.deliveryNotes}</p>
                            )}
                            <textarea
                                className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                rows={2}
                                placeholder="Delivery address *"
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                            />
                            <input
                                className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                placeholder="Delivery notes (optional)"
                                value={deliveryNotes}
                                onChange={(e) => setDeliveryNotes(e.target.value)}
                            />
                        </>
                    )}

                    {fulfillment === 'pickup' && (
                        <div className="space-y-2">
                            <input
                                type="date"
                                className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                value={pickupDate}
                                min={todayStr()}
                                onChange={(e) => {
                                    setPickupDate(e.target.value);
                                    setPickupAt('');
                                }}
                            />
                            <div className="flex flex-wrap gap-2">
                                {pickupSlots.map((s) => (
                                    <button
                                        key={s.startAt}
                                        type="button"
                                        onClick={() => setPickupAt(s.startAt)}
                                        className={cn(
                                            'px-3 py-2 rounded-xl text-xs font-bold border',
                                            pickupAt === s.startAt
                                                ? 'bg-[#F59E0B] border-[#F59E0B] text-[#0F172A]'
                                                : 'border-[#E2E8F0] text-[#64748B]'
                                        )}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                                {!pickupSlots.length && eventSlugForPickup && (
                                    <p className="text-sm text-[#64748B]">No pickup slots this day — try another date.</p>
                                )}
                                {!eventSlugForPickup && (
                                    <input
                                        type="datetime-local"
                                        className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                        onChange={(e) =>
                                            setPickupAt(e.target.value ? new Date(e.target.value).toISOString() : '')
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <input
                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        placeholder="Full name *"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <input
                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        placeholder="Email *"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        placeholder="Mobile *"
                        value={phone}
                        onChange={(e) => setPhone(restrictPhoneInput(e.target.value))}
                    />

                    <div className="border-t border-[#E2E8F0] pt-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span className="font-bold">{formatCents(subtotal)}</span>
                        </div>
                        {deliveryFee > 0 && (
                            <div className="flex justify-between">
                                <span>Delivery fee</span>
                                <span className="font-bold">{formatCents(deliveryFee)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-base font-black">
                            <span>Total</span>
                            <span className="text-[#F59E0B]">{formatCents(total)}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={submitting}
                        onClick={submit}
                        className="w-full rounded-2xl bg-[#F59E0B] text-[#0F172A] py-3 font-black"
                    >
                        {submitting ? 'Processing…' : `Pay ${formatCents(total)}`}
                    </button>
                </div>
            )}
        </div>
    );
}
