import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    LayoutGrid,
    Minus,
    Plus,
    Trash2
} from 'lucide-react';
import { apiGet, apiPost, cn, formatCents, restrictPhoneInput } from '../../../shared/utils';
import { todayStr } from '../shared/bookingUtils';

export type MenuItemPublic = {
    id: string;
    category: string;
    name: string;
    description: string;
    priceCents: number;
    available?: boolean;
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
type Step = 'menu' | 'when' | 'details' | 'confirm';

const STEPS: { key: Step; label: string }[] = [
    { key: 'menu', label: 'Menu' },
    { key: 'when', label: 'Delivery' },
    { key: 'details', label: 'About you' },
    { key: 'confirm', label: 'Confirm' }
];

export default function FoodOrderFlow({
    hostSlug,
    hostName,
    menuItems,
    foodOrdering,
    eventSlugForPickup,
    onBack
}: Props) {
    const [cart, setCart] = useState<Cart>({});
    const [step, setStep] = useState<Step>('menu');
    const [activeCategory, setActiveCategory] = useState('All');
    const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
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

    const categories = useMemo(() => {
        const cats = Array.from(
            new Set(menuItems.map((m) => String(m.category || '').trim() || 'Menu'))
        );
        return cats;
    }, [menuItems]);

    const visibleItems = useMemo(() => {
        if (activeCategory === 'All') return menuItems;
        return menuItems.filter(
            (m) => (String(m.category || '').trim() || 'Menu') === activeCategory
        );
    }, [menuItems, activeCategory]);

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
    const showCartPanel = cartCount > 0;

    useEffect(() => {
        if (fulfillment !== 'pickup' || !eventSlugForPickup || !pickupDate) {
            setPickupSlots([]);
            return;
        }
        apiGet(
            `/api/public/${hostSlug}/${eventSlugForPickup}/availability?from=${pickupDate}&to=${pickupDate}`
        )
            .then((data) => {
                const slots = (data.slots || data || []).map((s: any) => ({
                    startAt: s.startAt,
                    label:
                        s.label ||
                        new Date(s.startAt).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })
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
        setError('');
    };

    const addOne = (id: string) => setQty(id, (cart[id] || 0) + 1);

    const goBack = () => {
        setError('');
        const i = STEPS.findIndex((s) => s.key === step);
        if (i <= 0) {
            onBack();
            return;
        }
        setStep(STEPS[i - 1].key);
    };

    const continueFromMenu = () => {
        if (!lines.length) {
            setError('Select at least one menu item to continue.');
            return;
        }
        setError('');
        setStep('when');
    };

    const continueFromWhen = () => {
        if (fulfillment === 'delivery' && !deliveryAddress.trim()) {
            setError('Delivery address is required.');
            return;
        }
        if (
            fulfillment === 'delivery' &&
            foodOrdering.deliveryMinOrderCents > 0 &&
            subtotal < foodOrdering.deliveryMinOrderCents
        ) {
            setError(
                `Minimum order for delivery is ${formatCents(foodOrdering.deliveryMinOrderCents)}`
            );
            return;
        }
        if (fulfillment === 'pickup' && !pickupAt) {
            setError('Choose a pickup time.');
            return;
        }
        setError('');
        setStep('details');
    };

    const continueFromDetails = () => {
        if (!customerName.trim()) {
            setError('Full name is required.');
            return;
        }
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setError('A valid email is required.');
            return;
        }
        if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
            setError('A valid phone number is required.');
            return;
        }
        setError('');
        setStep('confirm');
    };

    const stickyCta = (() => {
        if (step === 'menu') {
            return {
                label: 'Continue',
                action: continueFromMenu,
                disabled: !cartCount
            };
        }
        if (step === 'when') {
            return {
                label: 'Continue',
                action: continueFromWhen,
                disabled: !cartCount
            };
        }
        if (step === 'details') {
            return {
                label: 'Continue to confirm',
                action: continueFromDetails,
                disabled: !cartCount
            };
        }
        return null;
    })();

    const submit = async () => {
        setError('');
        if (!lines.length) {
            setError('Add at least one item');
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
                items: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
                returnOrigin: typeof window !== 'undefined' ? window.location.origin : undefined
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

    if (!menuItems.length) {
        return (
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-[#64748B]">
                No menu items are published yet.
                <button
                    type="button"
                    onClick={onBack}
                    className="mt-4 block mx-auto text-xs font-bold underline"
                    style={{ color: 'var(--brand-primary)' }}
                >
                    Back to options
                </button>
            </div>
        );
    }

    const cartPanel = showCartPanel ? (
        <aside className="lg:sticky lg:top-6 h-fit rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#F1F5F9] px-4 py-3 bg-[#FAFBFC]">
                <p className="text-sm font-black text-[#0F172A]">Your selection</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                    {cartCount} item{cartCount === 1 ? '' : 's'} · {formatCents(subtotal)}
                </p>
            </div>
            <ul className="divide-y divide-[#F1F5F9] max-h-[min(50vh,360px)] overflow-y-auto">
                {lines.map((l) => (
                    <li key={l.item.id} className="flex items-start gap-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[#0F172A] leading-snug">
                                {l.item.name}
                            </p>
                            <p className="text-xs text-[#64748B] mt-0.5">
                                {l.quantity} × {formatCents(l.item.priceCents)}
                            </p>
                            <div className="mt-2 inline-flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setQty(l.item.id, l.quantity - 1)}
                                    className="w-7 h-7 rounded-lg border border-[#E2E8F0] flex items-center justify-center"
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-xs font-bold w-5 text-center">{l.quantity}</span>
                                <button
                                    type="button"
                                    onClick={() => setQty(l.item.id, l.quantity + 1)}
                                    className="w-7 h-7 rounded-lg border border-[#E2E8F0] flex items-center justify-center"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setQty(l.item.id, 0)}
                            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-600 hover:bg-red-50 shrink-0"
                            aria-label={`Remove ${l.item.name}`}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="border-t border-[#F1F5F9] px-4 py-3 space-y-3 bg-[#FAFBFC]">
                <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-[#64748B]">Subtotal</span>
                    <span className="font-black text-[#0F172A]">{formatCents(subtotal)}</span>
                </div>
                {step !== 'menu' && (
                    <button
                        type="button"
                        onClick={() => setStep('menu')}
                        className="w-full text-left text-xs font-bold"
                        style={{ color: 'var(--brand-primary)' }}
                    >
                        + Add or change items
                    </button>
                )}
                {stickyCta && (
                    <button
                        type="button"
                        disabled={stickyCta.disabled}
                        onClick={stickyCta.action}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black disabled:opacity-40 text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                    >
                        {stickyCta.label}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </aside>
    ) : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#64748B]"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {step === 'menu' ? 'Back to options' : 'Back'}
                </button>
                <p className="text-xs font-medium text-[#94A3B8] truncate">{hostName}</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
                {STEPS.map((s, i) => {
                    const active = s.key === step;
                    const doneStep = STEPS.findIndex((x) => x.key === step) > i;
                    return (
                        <span
                            key={s.key}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]',
                                active && 'text-[#0F172A] shadow-sm',
                                doneStep && !active && 'bg-[#E2E8F0] text-[#0F172A]',
                                !active &&
                                    !doneStep &&
                                    'bg-white text-[#94A3B8] border border-[#E2E8F0]'
                            )}
                            style={active ? { background: 'var(--brand-primary)' } : undefined}
                        >
                            {i + 1}. {s.label}
                        </span>
                    );
                })}
            </div>

            {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">
                    {error}
                </p>
            )}

            <div
                className={cn(
                    'grid gap-6 items-start',
                    showCartPanel ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1'
                )}
            >
                <div className="min-w-0 space-y-5">
                    {step === 'menu' && (
                        <div className="space-y-5">
                            <div>
                                <p
                                    className="text-[10px] font-black uppercase tracking-widest"
                                    style={{ color: 'var(--brand-primary)' }}
                                >
                                    Order food
                                </p>
                                <h2 className="text-2xl font-black text-[#0F172A] mt-1">
                                    Browse menu
                                </h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    Prices and availability for items you can order now.
                                </p>
                            </div>

                            <div className="flex gap-3 overflow-x-auto overflow-y-visible pt-2.5 pb-1 -mx-1 px-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveCategory('All')}
                                    className={cn(
                                        'relative shrink-0 w-[100px] rounded-2xl border bg-white px-2 py-3.5 text-center shadow-sm transition',
                                        activeCategory === 'All'
                                            ? 'border-[#0F172A] ring-1 ring-[#0F172A]'
                                            : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                                    )}
                                >
                                    <LayoutGrid className="mx-auto h-7 w-7 text-[#0F172A]" />
                                    <p className="mt-2 text-xs font-bold text-[#0F172A]">All</p>
                                </button>
                                {categories.map((cat) => {
                                    const selected = activeCategory === cat;
                                    const hasPicks = menuItems.some(
                                        (m) =>
                                            (cart[m.id] || 0) > 0 &&
                                            (String(m.category || '').trim() || 'Menu') === cat
                                    );
                                    return (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setActiveCategory(cat)}
                                            className={cn(
                                                'relative shrink-0 w-[100px] rounded-2xl border bg-white px-2 py-3.5 text-center shadow-sm transition',
                                                selected
                                                    ? 'border-[#0F172A] ring-1 ring-[#0F172A]'
                                                    : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                                            )}
                                        >
                                            {hasPicks && (
                                                <span
                                                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow"
                                                    style={{ background: 'var(--brand-primary)' }}
                                                >
                                                    <Check className="h-3 w-3" strokeWidth={3} />
                                                </span>
                                            )}
                                            <p
                                                className="mx-auto h-7 w-7 flex items-center justify-center text-lg font-black"
                                                style={{ color: 'var(--brand-primary)' }}
                                            >
                                                {cat.slice(0, 1).toUpperCase()}
                                            </p>
                                            <p className="mt-2 text-xs font-bold text-[#0F172A] leading-tight">
                                                {cat}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
                                {visibleItems.length === 0 && (
                                    <p className="px-6 py-12 text-center text-sm text-[#64748B]">
                                        No items in this category.
                                    </p>
                                )}
                                <ul className="divide-y divide-[#F1F5F9]">
                                    {visibleItems.map((item) => {
                                        const qty = cart[item.id] || 0;
                                        const open = detailsOpen[item.id];
                                        const available = item.available !== false;
                                        return (
                                            <li key={item.id} className="px-5 py-5 sm:px-6">
                                                <div className="flex items-start justify-between gap-6">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-base font-bold text-[#0F172A]">
                                                            {item.name}
                                                        </p>
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748B]">
                                                            <span
                                                                className={cn(
                                                                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
                                                                    available
                                                                        ? 'bg-emerald-50 text-emerald-700'
                                                                        : 'bg-[#F1F5F9] text-[#94A3B8]'
                                                                )}
                                                            >
                                                                {available ? 'Available' : 'Unavailable'}
                                                            </span>
                                                            {item.description ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setDetailsOpen((d) => ({
                                                                            ...d,
                                                                            [item.id]: !d[item.id]
                                                                        }))
                                                                    }
                                                                    className="font-semibold underline-offset-2 hover:underline"
                                                                    style={{
                                                                        color: 'var(--brand-primary)'
                                                                    }}
                                                                >
                                                                    {open
                                                                        ? 'Hide details'
                                                                        : 'Show details'}
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                        {open && item.description && (
                                                            <p className="mt-2 text-sm text-[#64748B] leading-relaxed max-w-2xl">
                                                                {item.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-end gap-2.5">
                                                        <p className="text-base font-black text-[#0F172A]">
                                                            {formatCents(item.priceCents)}
                                                        </p>
                                                        {qty > 0 ? (
                                                            <div className="inline-flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setQty(item.id, qty - 1)
                                                                    }
                                                                    className="w-8 h-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center"
                                                                >
                                                                    <Minus className="w-3.5 h-3.5" />
                                                                </button>
                                                                <span className="text-sm font-bold w-6 text-center">
                                                                    {qty}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    disabled={!available}
                                                                    onClick={() =>
                                                                        setQty(item.id, qty + 1)
                                                                    }
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--brand-secondary)] disabled:opacity-40"
                                                                    style={{
                                                                        background:
                                                                            'var(--brand-primary)'
                                                                    }}
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled={!available}
                                                                onClick={() => addOne(item.id)}
                                                                className="min-w-[96px] rounded-lg border px-4 py-2 text-sm font-bold bg-white disabled:opacity-40"
                                                                style={{
                                                                    borderColor:
                                                                        'var(--brand-primary)',
                                                                    color: 'var(--brand-primary)'
                                                                }}
                                                            >
                                                                Select
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    )}

                    {step !== 'menu' && (
                        <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm p-5 sm:p-6 space-y-5">
                            {step === 'when' && (
                                <>
                                    <div>
                                        <h2 className="font-black text-xl text-[#0F172A]">
                                            Delivery or pickup
                                        </h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            Choose how you want your order, then add address or a
                                            pickup time.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {foodOrdering.deliveryEnabled && (
                                            <button
                                                type="button"
                                                onClick={() => setFulfillment('delivery')}
                                                className={cn(
                                                    'px-4 py-2.5 rounded-xl text-sm font-bold border transition',
                                                    fulfillment === 'delivery'
                                                        ? 'text-[var(--brand-secondary)] border-transparent'
                                                        : 'border-[#E2E8F0] text-[#0F172A]'
                                                )}
                                                style={
                                                    fulfillment === 'delivery'
                                                        ? {
                                                              background: 'var(--brand-primary)'
                                                          }
                                                        : undefined
                                                }
                                            >
                                                Delivery
                                            </button>
                                        )}
                                        {foodOrdering.pickupEnabled && (
                                            <button
                                                type="button"
                                                onClick={() => setFulfillment('pickup')}
                                                className={cn(
                                                    'px-4 py-2.5 rounded-xl text-sm font-bold border transition',
                                                    fulfillment === 'pickup'
                                                        ? 'text-[var(--brand-secondary)] border-transparent'
                                                        : 'border-[#E2E8F0] text-[#0F172A]'
                                                )}
                                                style={
                                                    fulfillment === 'pickup'
                                                        ? {
                                                              background: 'var(--brand-primary)'
                                                          }
                                                        : undefined
                                                }
                                            >
                                                Pickup
                                            </button>
                                        )}
                                    </div>

                                    {fulfillment === 'delivery' && (
                                        <div className="max-w-md space-y-3">
                                            {foodOrdering.deliveryNotes ? (
                                                <p className="text-sm text-[#64748B]">
                                                    {foodOrdering.deliveryNotes}
                                                </p>
                                            ) : null}
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Delivery address *
                                                </span>
                                                <textarea
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                    rows={3}
                                                    value={deliveryAddress}
                                                    onChange={(e) =>
                                                        setDeliveryAddress(e.target.value)
                                                    }
                                                    placeholder="Street, city, postcode"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Delivery notes
                                                </span>
                                                <input
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                    value={deliveryNotes}
                                                    onChange={(e) =>
                                                        setDeliveryNotes(e.target.value)
                                                    }
                                                    placeholder="Gate code, flat number…"
                                                />
                                            </label>
                                        </div>
                                    )}

                                    {fulfillment === 'pickup' && (
                                        <div className="max-w-md space-y-3">
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Pickup date *
                                                </span>
                                                <input
                                                    type="date"
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                    value={pickupDate}
                                                    min={todayStr()}
                                                    onChange={(e) => {
                                                        setPickupDate(e.target.value);
                                                        setPickupAt('');
                                                    }}
                                                />
                                            </label>
                                            <div>
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Pickup time *
                                                </span>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {pickupSlots.map((s) => (
                                                        <button
                                                            key={s.startAt}
                                                            type="button"
                                                            onClick={() => setPickupAt(s.startAt)}
                                                            className={cn(
                                                                'px-3 py-2 rounded-xl text-sm font-bold border transition',
                                                                pickupAt === s.startAt
                                                                    ? 'text-[var(--brand-secondary)] border-transparent'
                                                                    : 'border-[#E2E8F0] text-[#64748B]'
                                                            )}
                                                            style={
                                                                pickupAt === s.startAt
                                                                    ? {
                                                                          background:
                                                                              'var(--brand-primary)'
                                                                      }
                                                                    : undefined
                                                            }
                                                        >
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                    {!pickupSlots.length && eventSlugForPickup && (
                                                        <p className="text-sm text-[#64748B]">
                                                            No pickup slots this day — try another
                                                            date.
                                                        </p>
                                                    )}
                                                    {!eventSlugForPickup && (
                                                        <input
                                                            type="datetime-local"
                                                            className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                                            onChange={(e) =>
                                                                setPickupAt(
                                                                    e.target.value
                                                                        ? new Date(
                                                                              e.target.value
                                                                          ).toISOString()
                                                                        : ''
                                                                )
                                                            }
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {step === 'details' && (
                                <>
                                    <div>
                                        <h2 className="font-black text-xl text-[#0F172A]">
                                            About you
                                        </h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            We’ll use these details for your order confirmation.
                                        </p>
                                    </div>
                                    <div className="max-w-md space-y-3">
                                        <label className="block">
                                            <span className="text-xs font-bold text-[#64748B]">
                                                Full name *
                                            </span>
                                            <input
                                                value={customerName}
                                                onChange={(e) => setCustomerName(e.target.value)}
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs font-bold text-[#64748B]">
                                                Email *
                                            </span>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                placeholder="name@email.com"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs font-bold text-[#64748B]">
                                                Phone *
                                            </span>
                                            <input
                                                value={phone}
                                                onChange={(e) =>
                                                    setPhone(restrictPhoneInput(e.target.value))
                                                }
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                placeholder="07…"
                                            />
                                        </label>
                                    </div>
                                </>
                            )}

                            {step === 'confirm' && (
                                <>
                                    <div>
                                        <h2 className="font-black text-xl text-[#0F172A]">
                                            Confirm & pay
                                        </h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            Review your order before paying.
                                        </p>
                                    </div>
                                    <div className="max-w-lg rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2 text-sm">
                                        <div>
                                            <span className="font-bold text-[#0F172A]">Items:</span>
                                            <ul className="mt-1.5 space-y-1">
                                                {lines.map((l) => (
                                                    <li
                                                        key={l.item.id}
                                                        className="flex justify-between gap-2 text-[#64748B]"
                                                    >
                                                        <span>
                                                            {l.quantity}× {l.item.name}
                                                        </span>
                                                        <span className="font-bold text-[#0F172A] shrink-0">
                                                            {formatCents(l.lineTotal)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <p>
                                            <span className="font-bold text-[#0F172A]">
                                                Fulfillment:
                                            </span>{' '}
                                            {fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
                                        </p>
                                        {fulfillment === 'delivery' && (
                                            <p>
                                                <span className="font-bold text-[#0F172A]">
                                                    Address:
                                                </span>{' '}
                                                {deliveryAddress}
                                            </p>
                                        )}
                                        {fulfillment === 'pickup' && pickupAt && (
                                            <p>
                                                <span className="font-bold text-[#0F172A]">
                                                    Pickup:
                                                </span>{' '}
                                                {new Date(pickupAt).toLocaleString('en-GB', {
                                                    weekday: 'short',
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        )}
                                        <p>
                                            <span className="font-bold text-[#0F172A]">Contact:</span>{' '}
                                            {customerName} · {email} · {phone}
                                        </p>
                                        {deliveryFee > 0 && (
                                            <p>
                                                <span className="font-bold text-[#0F172A]">
                                                    Delivery fee:
                                                </span>{' '}
                                                {formatCents(deliveryFee)}
                                            </p>
                                        )}
                                        <p>
                                            <span className="font-bold text-[#0F172A]">Total:</span>{' '}
                                            {formatCents(total)}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={submit}
                                        className="w-full max-w-lg rounded-xl px-4 py-3.5 text-sm font-black disabled:opacity-50 text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                                    >
                                        {submitting
                                            ? 'Processing…'
                                            : `Pay ${formatCents(total)}`}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {cartPanel}
            </div>
        </div>
    );
}
