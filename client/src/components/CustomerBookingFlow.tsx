import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Calendar,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Flame,
    MapPin,
    Phone,
    ShieldCheck,
    User
} from 'lucide-react';
import { apiPost, cn, restrictPhoneInput } from '../lib/utils';

export interface BookingSlot {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    label: string;
    isEmergencyOnly: boolean;
    enabled: boolean;
}

export interface BookingProfile {
    name: string;
    businessName: string;
    tradeType: string;
    phone: string;
    deposit: number;
    currency: string;
    serviceArea: string;
    emergencyNote: string;
    acceptingEmergencies: boolean;
    paymentsMode?: 'stripe' | 'simulated';
}

function nextDates(count = 14) {
    const out: { iso: string; label: string; sub: string }[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        let label = d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
        if (i === 0) label = 'TODAY';
        if (i === 1) label = 'TOMORROW';
        out.push({
            iso,
            label,
            sub: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
        });
    }
    return out;
}

type Props = {
    profile: BookingProfile;
    slots: BookingSlot[];
    embedded?: boolean;
    onBack?: () => void;
    onSuccess?: () => void;
};

export default function CustomerBookingFlow({ profile, slots, embedded = false, onBack, onSuccess }: Props) {
    const [isEmergency, setIsEmergency] = useState(false);
    const [date, setDate] = useState(nextDates()[0].iso);
    const [slotId, setSlotId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [description, setDescription] = useState('');
    const [notifyVia, setNotifyVia] = useState<'both' | 'whatsapp' | 'sms'>('both');
    const [submitting, setSubmitting] = useState(false);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [dateScroll, setDateScroll] = useState(0);

    const dates = useMemo(() => nextDates(), []);

    const daySlots = useMemo(() => {
        const dow = new Date(date + 'T12:00:00').getDay();
        return slots.filter((s) => {
            if (!s.enabled || s.dayOfWeek !== dow) return false;
            if (isEmergency) return true;
            return !s.isEmergencyOnly;
        });
    }, [slots, date, isEmergency]);

    useEffect(() => {
        setSlotId('');
    }, [date, isEmergency]);

    const selected = daySlots.find((s) => s.id === slotId);

    const validate = (): string | null => {
        if (!selected) return 'Select a date and time slot to continue.';
        if (!customerName.trim()) return 'Enter your full name.';
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
        if (!phone.trim()) return 'Enter your phone number.';
        if (phone.replace(/\D/g, '').length < 10) return 'Enter a valid phone number (at least 10 digits).';
        if (!address.trim()) return 'Enter the property address.';
        return null;
    };

    const submit = async () => {
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }
        if (!selected) return;

        setSubmitting(true);
        setPaying(true);
        setError('');
        try {
            const checkout = await apiPost('/api/booking/checkout', {
                customerName: customerName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                address: address.trim(),
                description: description.trim(),
                date,
                slotId: selected.id,
                slotLabel: selected.label,
                startTime: selected.startTime,
                endTime: selected.endTime,
                isEmergency,
                notifyVia
            });

            if (checkout.url) {
                window.location.href = checkout.url;
                return;
            }

            if (!checkout.success && !checkout.simulated) {
                throw new Error(checkout.error || 'Payment could not be processed');
            }

            await new Promise((r) => setTimeout(r, 800));
            await apiPost('/api/booking/bookings', {
                customerName: customerName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                address: address.trim(),
                description: description.trim(),
                date,
                slotId: selected.id,
                slotLabel: selected.label,
                startTime: selected.startTime,
                endTime: selected.endTime,
                isEmergency,
                notifyVia,
                simulatedPayment: true,
                paymentId: checkout.paymentId
            });
            setDone(true);
            onSuccess?.();
        } catch (e: any) {
            setError(e.message || 'Booking failed — check Booking Plots is set up, then try again.');
        } finally {
            setPaying(false);
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', embedded ? 'min-h-[360px]' : 'min-h-[50vh]')}>
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-black text-[#0F172A]">Booking confirmed</h2>
                <p className="text-sm text-[#64748B] mt-2 max-w-sm">
                    Deposit of {profile.currency}{Number(profile.deposit).toFixed(2)} recorded.
                    {email ? ` A confirmation was sent to ${email}.` : ''} {profile.name} has been notified.
                </p>
                {onBack && (
                    <button type="button" onClick={onBack} className="mt-6 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold">
                        Back to dashboard
                    </button>
                )}
            </div>
        );
    }

    const visibleDates = dates.slice(dateScroll, dateScroll + 5);

    return (
        <div className={cn(embedded ? 'space-y-4' : 'min-h-screen bg-[#F8FAFC] pb-12')}>
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#0F172A] hover:text-[#111827] mb-1"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to dashboard
                </button>
            )}

            <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-5 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">{profile.tradeType}</p>
                        <h1 className="text-lg lg:text-xl font-black mt-1 truncate">{profile.businessName}</h1>
                        <p className="text-sm text-white/70 mt-1">
                            {profile.name} · Direct: {profile.phone}
                        </p>
                    </div>
                    {profile.phone && (
                        <a
                            href={`tel:${profile.phone.replace(/\s/g, '')}`}
                            className="shrink-0 w-11 h-11 rounded-full bg-[#F59E0B] text-white flex items-center justify-center"
                            title="Call tradesperson"
                        >
                            <Phone className="w-5 h-5" />
                        </a>
                    )}
                </div>
                {profile.serviceArea && (
                    <p className="text-xs text-white/50 mt-3 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        Serving: {profile.serviceArea}
                    </p>
                )}
            </div>

            <div className={cn(embedded && 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start')}>
                <div className="space-y-4">
                    <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 lg:p-5">
                        <p className="text-sm font-bold text-[#0F172A] mb-3 flex items-center gap-2">
                            <Flame className="w-4 h-4 text-red-500" />
                            Is this an urgent emergency?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={!profile.acceptingEmergencies}
                                onClick={() => setIsEmergency(true)}
                                className={cn(
                                    'rounded-xl py-3 text-xs font-bold border flex items-center justify-center gap-1.5 transition',
                                    isEmergency ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100',
                                    !profile.acceptingEmergencies && 'opacity-40 cursor-not-allowed'
                                )}
                            >
                                <Flame className="w-3.5 h-3.5" /> Yes, Emergency
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsEmergency(false)}
                                className={cn(
                                    'rounded-xl py-3 text-xs font-bold border transition',
                                    !isEmergency ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-white'
                                )}
                            >
                                No, Standard Job
                            </button>
                        </div>
                        <p className="text-xs text-[#64748B] mt-3">
                            {isEmergency
                                ? profile.emergencyNote || 'Emergency standby slots are shown.'
                                : 'Choose from regular scheduled appointments. Emergency-only slots are hidden.'}
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 lg:p-5 space-y-4">
                        <h2 className="text-xs font-black uppercase tracking-wider text-[#0F172A] flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-[#F59E0B]" /> 1. Select date
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={dateScroll === 0}
                                onClick={() => setDateScroll((n) => Math.max(0, n - 1))}
                                className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-30"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex-1 flex gap-2 overflow-x-auto">
                                {visibleDates.map((d) => (
                                    <button
                                        key={d.iso}
                                        type="button"
                                        onClick={() => setDate(d.iso)}
                                        className={cn(
                                            'shrink-0 flex-1 min-w-[64px] rounded-xl px-2 py-2.5 text-center border transition',
                                            date === d.iso ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#0F172A]/30'
                                        )}
                                    >
                                        <div className="text-[9px] font-black">{d.label}</div>
                                        <div className="text-xs font-semibold mt-0.5">{d.sub}</div>
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                disabled={dateScroll >= dates.length - 5}
                                onClick={() => setDateScroll((n) => Math.min(dates.length - 5, n + 1))}
                                className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-30"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <h2 className="text-xs font-black uppercase tracking-wider text-[#0F172A] flex items-center gap-2 pt-1">
                            <Clock className="w-4 h-4 text-[#F59E0B]" /> 2. Select time window
                        </h2>
                        <div className="space-y-2">
                            {daySlots.length === 0 && (
                                <p className="text-sm text-[#64748B] py-6 text-center bg-[#F8FAFC] rounded-xl">
                                    No slots available this day. Try another date or turn on emergency booking.
                                </p>
                            )}
                            {daySlots.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSlotId(s.id)}
                                    className={cn(
                                        'w-full text-left rounded-xl border px-4 py-3 transition flex items-start justify-between gap-2',
                                        slotId === s.id ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#0F172A]/40'
                                    )}
                                >
                                    <div>
                                        <div className="font-bold text-sm">{s.label}</div>
                                        <div className={cn('text-xs mt-0.5', slotId === s.id ? 'text-white/70' : 'text-[#64748B]')}>
                                            {s.startTime} – {s.endTime}
                                            {s.isEmergencyOnly ? ' · Emergency only' : ''}
                                        </div>
                                    </div>
                                    {slotId === s.id && <Check className="w-5 h-5 shrink-0 text-[#F59E0B]" />}
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="space-y-4">
                    <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 lg:p-5 space-y-3">
                        <h3 className="font-bold text-[#0F172A] flex items-center gap-2">
                            <User className="w-4 h-4 text-[#F59E0B]" /> 3. Your contact & job details
                        </h3>
                        <input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Your full name — e.g. Sarah Jenkins"
                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                        />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Your email — for payment receipt & confirmation"
                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                        />
                        <input
                            inputMode="numeric"
                            value={phone}
                            onChange={(e) => setPhone(restrictPhoneInput(e.target.value))}
                            placeholder="Your phone — e.g. 07700900456"
                            maxLength={11}
                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                        />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                            Receive confirmation & 24h reminder via
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {(
                                [
                                    ['both', 'SMS & WhatsApp'],
                                    ['whatsapp', 'WhatsApp Only'],
                                    ['sms', 'SMS Only']
                                ] as const
                            ).map(([k, label]) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setNotifyVia(k)}
                                    className={cn(
                                        'px-3 py-2 rounded-xl text-xs font-bold border transition',
                                        notifyVia === k ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]'
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <input
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Property address — e.g. 124 Maple Drive, SW14 8AB"
                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                        />
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="What needs fixing? — e.g. Boiler losing pressure, error F22..."
                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white resize-none"
                        />
                    </section>

                    <section className="bg-[#0F172A] text-white rounded-2xl p-4 lg:p-5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Required flat deposit</p>
                        <p className="text-3xl font-black mt-1 text-[#F59E0B]">
                            {profile.currency}{Number(profile.deposit).toFixed(2)}
                        </p>
                        <p className="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            {profile.paymentsMode === 'stripe'
                                ? 'Secure payment via Stripe Checkout'
                                : 'Direct payout protected · Stripe Checkout'}
                        </p>
                        {!selected && !error && (
                            <p className="text-xs text-amber-300 mt-3">Select a date and time slot above to continue.</p>
                        )}
                        {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={submit}
                            className={cn(
                                'mt-4 w-full py-3.5 rounded-xl font-bold text-sm transition',
                                submitting
                                    ? 'bg-[#F59E0B]/70 text-white cursor-wait'
                                    : 'bg-[#F59E0B] text-white hover:bg-[#D97706] cursor-pointer'
                            )}
                        >
                            {paying
                                ? 'Redirecting to Stripe...'
                                : submitting
                                  ? 'Confirming booking...'
                                  : `Pay ${profile.currency}${profile.deposit} deposit & book →`}
                        </button>
                        <p className="text-[11px] text-white/40 text-center mt-2">
                            You will be redirected to Stripe to pay. Confirmation email sent after payment.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
