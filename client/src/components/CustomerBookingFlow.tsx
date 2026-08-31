import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Flame,
    MapPin,
    Phone,
    ShieldCheck,
    User
} from 'lucide-react';
import { apiGet, apiPost, cn, formatCents, restrictPhoneInput } from '../lib/utils';

type Slot = { startAt: string; endAt: string; date: string; label: string };

type EventType = {
    slug: string;
    name: string;
    description?: string;
    durationMinutes: number;
    depositCents: number;
    totalCents?: number;
};

type BookingStep = 'schedule' | 'details' | 'payment';

type Props = {
    hostSlug: string;
    eventSlug?: string;
    host: { name: string; tradeType?: string; phone?: string; serviceArea?: string };
    eventType?: EventType;
    eventTypes?: EventType[];
    onSuccess?: () => void;
};

import { monthDays, todayStr } from '../lib/calendar';

function isDateSelectable(dateStr: string, maxDaysAhead: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${dateStr}T12:00:00`);
    const max = new Date(today);
    max.setDate(max.getDate() + maxDaysAhead);
    return d >= today && d <= max;
}

export default function CustomerBookingFlow({
    hostSlug,
    eventSlug: initialEventSlug,
    host,
    eventType: initialEventType,
    eventTypes = [],
    onSuccess
}: Props) {
    const [activeEventSlug, setActiveEventSlug] = useState(initialEventSlug || '');
    const [eventType, setEventType] = useState<EventType | null>(initialEventType || null);
    const [paymentsMode, setPaymentsMode] = useState<'stripe' | 'simulated'>('stripe');
    const [maxDaysAhead, setMaxDaysAhead] = useState(60);
    const [hasAvailabilityRules, setHasAvailabilityRules] = useState(false);
    const [step, setStep] = useState<BookingStep>('schedule');
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [daySlots, setDaySlots] = useState<Slot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [detailsTouched, setDetailsTouched] = useState(false);
    const [done, setDone] = useState(false);

    const showServicePicker = !activeEventSlug && eventTypes.length > 0;
    const isEmergency = activeEventSlug.includes('emergency');
    const days = useMemo(() => monthDays(month.year, month.month), [month]);

    useEffect(() => {
        if (!activeEventSlug) return;
        const fromList = eventTypes.find((e) => e.slug === activeEventSlug);
        if (fromList) {
            setEventType(fromList);
            return;
        }
        if (initialEventType?.slug === activeEventSlug) {
            setEventType(initialEventType);
            return;
        }
        apiGet(`/api/public/${hostSlug}/${activeEventSlug}`)
            .then((data) => {
                setEventType({
                    slug: data.eventType.slug,
                    name: data.eventType.name,
                    description: data.eventType.description,
                    durationMinutes: data.eventType.durationMinutes,
                    depositCents: data.eventType.depositCents,
                    totalCents: data.eventType.totalCents
                });
                setPaymentsMode(data.paymentsMode === 'simulated' ? 'simulated' : 'stripe');
                if (data.maxDaysAhead) setMaxDaysAhead(data.maxDaysAhead);
            })
            .catch((e) => setError(e.message));
    }, [activeEventSlug, hostSlug, eventTypes, initialEventType]);

    useEffect(() => {
        if (initialEventSlug) setActiveEventSlug(initialEventSlug);
    }, [initialEventSlug]);

    useEffect(() => {
        if (!activeEventSlug || !selectedDate) {
            setDaySlots([]);
            setHasAvailabilityRules(false);
            return;
        }
        setLoadingSlots(true);
        apiGet(`/api/public/${hostSlug}/${activeEventSlug}/availability?from=${selectedDate}&to=${selectedDate}`)
            .then((data) => {
                setDaySlots(data.slots || []);
                setHasAvailabilityRules(Boolean(data.hasAvailabilityRules));
                if (data.maxDaysAhead) setMaxDaysAhead(data.maxDaysAhead);
            })
            .catch(() => {
                setDaySlots([]);
                setHasAvailabilityRules(false);
            })
            .finally(() => setLoadingSlots(false));
        setSelectedSlot(null);
    }, [hostSlug, activeEventSlug, selectedDate]);

    const pickService = (et: EventType) => {
        setActiveEventSlug(et.slug);
        setEventType(et);
        setError('');
        setStep('schedule');
        setSelectedDate('');
        setSelectedSlot(null);
    };

    const validateDetails = (): Record<string, string> => {
        const errors: Record<string, string> = {};
        if (!customerName.trim()) errors.customerName = 'Full name is required.';
        if (!email.trim()) errors.email = 'Email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
        if (!phone.trim()) errors.phone = 'Phone number is required.';
        else if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number (at least 10 digits).';
        if (!address.trim()) errors.address = 'Property address is required.';
        return errors;
    };

    const detailsValid = useMemo(() => Object.keys(validateDetails()).length === 0, [customerName, email, phone, address]);

    const goToDetails = () => {
        if (!selectedSlot) {
            setError('Select a date and time to continue.');
            return;
        }
        setError('');
        setStep('details');
    };

    const goToPayment = () => {
        setDetailsTouched(true);
        const errors = validateDetails();
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            setError('Please fill in all required fields.');
            return;
        }
        setError('');
        setStep('payment');
    };

    const submit = async () => {
        if (!selectedSlot || !eventType) return;

        setSubmitting(true);
        setError('');
        try {
            const result = await apiPost(`/api/public/${hostSlug}/${activeEventSlug}/book`, {
                customerName: customerName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                address: address.trim(),
                description: description.trim(),
                startAt: selectedSlot.startAt,
                endAt: selectedSlot.endAt
            });

            if (result.url) {
                window.location.href = result.url;
                return;
            }
            if (result.success || result.simulated) {
                setDone(true);
                onSuccess?.();
                return;
            }
            throw new Error(result.error || 'Payment could not be processed');
        } catch (e: any) {
            setError(e.message || 'Booking failed — try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const stepIndicator = (current: BookingStep) => {
        const steps: { key: BookingStep; label: string }[] = [
            { key: 'schedule', label: 'Date & time' },
            { key: 'details', label: 'Your details' },
            { key: 'payment', label: 'Payment' }
        ];
        const idx = steps.findIndex((s) => s.key === current);
        return (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                {steps.map((s, i) => (
                    <span key={s.key} className="flex items-center gap-2">
                        {i > 0 && <span className="text-[#CBD5E1]">›</span>}
                        <span className={cn(i <= idx ? 'text-[#0F172A]' : 'text-[#CBD5E1]')}>
                            {i + 1}. {s.label}
                        </span>
                    </span>
                ))}
            </div>
        );
    };

    if (done) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-center py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-black text-[#0F172A]">Booking confirmed</h2>
                <p className="text-sm text-[#64748B] mt-2 max-w-sm">
                    Deposit of {eventType ? formatCents(eventType.depositCents) : ''} recorded.
                    {email ? ` Confirmation sent to ${email}.` : ''}
                </p>
            </div>
        );
    }

    if (showServicePicker) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] py-8 px-4">
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">{host.tradeType || 'Book online'}</p>
                        <h1 className="text-2xl font-black mt-1">{host.name}</h1>
                        {host.serviceArea && (
                            <p className="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 shrink-0" /> {host.serviceArea}
                            </p>
                        )}
                    </div>
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4 shadow-sm">
                        <h2 className="font-bold text-lg text-[#0F172A]">What do you need?</h2>
                        <p className="text-sm text-[#64748B]">Choose a service — each has its own deposit.</p>
                        <div className="space-y-3">
                            {eventTypes.map((et) => {
                                const emergency = et.slug.includes('emergency');
                                return (
                                    <button
                                        key={et.slug}
                                        type="button"
                                        onClick={() => pickService(et)}
                                        className={cn(
                                            'w-full text-left rounded-xl border p-4 transition',
                                            emergency
                                                ? 'border-red-200 hover:border-red-400 hover:bg-red-50/50'
                                                : 'border-[#E2E8F0] hover:border-[#F59E0B] hover:bg-[#F59E0B]/5'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-bold text-[#0F172A] flex items-center gap-2">
                                                    {emergency && <Flame className="w-4 h-4 text-red-500" />}
                                                    {et.name}
                                                </p>
                                                {et.description && <p className="text-sm text-[#64748B] mt-1">{et.description}</p>}
                                                <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {et.durationMinutes} min
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[10px] font-bold uppercase text-[#64748B]">Deposit</p>
                                                <p className={cn('text-xl font-black', emergency ? 'text-red-600' : 'text-[#F59E0B]')}>
                                                    {formatCents(et.depositCents)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!eventType) {
        return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-6 px-4">
            <div className="max-w-4xl mx-auto space-y-4">
                <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">{host.tradeType}</p>
                            <h1 className="text-xl font-black mt-0.5">{host.name}</h1>
                            <p className="text-sm text-white/70 mt-1">
                                {eventType.name} · Deposit <span className="text-[#F59E0B] font-bold">{formatCents(eventType.depositCents)}</span>
                            </p>
                        </div>
                        {host.phone && (
                            <a href={`tel:${host.phone.replace(/\s/g, '')}`} className="shrink-0 w-10 h-10 rounded-full bg-[#F59E0B] flex items-center justify-center">
                                <Phone className="w-4 h-4" />
                            </a>
                        )}
                    </div>
                    {eventTypes.length > 1 && (
                        <button type="button" onClick={() => { setActiveEventSlug(''); setEventType(null); setStep('schedule'); setSelectedDate(''); setSelectedSlot(null); }} className="mt-2 text-xs font-bold text-[#F59E0B] underline">
                            ← Change service
                        </button>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                    <div className="px-5 pt-5 pb-3 border-b border-[#E2E8F0] bg-[#FAFBFC]">
                        {stepIndicator(step)}
                    </div>

                    {/* Step 1: Schedule */}
                    {step === 'schedule' && (
                        <div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
                                <div className="p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                            <Calendar className="w-4 h-4 text-[#F59E0B]" /> Pick a date
                                        </h2>
                                        <div className="flex gap-1">
                                            <button type="button" onClick={() => setMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }))} className="p-1.5 rounded-lg border border-[#E2E8F0]">
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <button type="button" onClick={() => setMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }))} className="p-1.5 rounded-lg border border-[#E2E8F0]">
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-[#64748B] mb-3">
                                        {new Date(month.year, month.month).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
                                    </p>
                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#64748B] mb-1">
                                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <div key={d}>{d}</div>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {days.map((d, i) => {
                                            if (!d.inMonth) return <div key={i} />;
                                            const selectable = isDateSelectable(d.date, maxDaysAhead);
                                            const isPast = d.date < todayStr();
                                            return (
                                                <button
                                                    key={d.date}
                                                    type="button"
                                                    disabled={!selectable}
                                                    onClick={() => { setSelectedDate(d.date); setError(''); }}
                                                    className={cn(
                                                        'aspect-square rounded-lg text-sm font-bold transition',
                                                        selectable ? 'hover:bg-[#0F172A] hover:text-white border border-[#E2E8F0] bg-[#F8FAFC]' : 'text-[#CBD5E1] cursor-not-allowed',
                                                        selectedDate === d.date && 'bg-[#0F172A] text-white',
                                                        isPast && !selectable && 'opacity-40'
                                                    )}
                                                >
                                                    {d.date.slice(8)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="p-5">
                                    <h2 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm mb-4">
                                        <Clock className="w-4 h-4 text-[#F59E0B]" />
                                        {selectedDate
                                            ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
                                            : 'Select a date first'}
                                    </h2>
                                    {!selectedDate && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">Choose any date on the calendar.</p>
                                    )}
                                    {selectedDate && loadingSlots && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">Loading times…</p>
                                    )}
                                    {selectedDate && !loadingSlots && !hasAvailabilityRules && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">
                                            No booking times set yet — the business hasn&apos;t configured their availability.
                                        </p>
                                    )}
                                    {selectedDate && !loadingSlots && hasAvailabilityRules && daySlots.length === 0 && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">No times available on this day — try another date.</p>
                                    )}
                                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                        {daySlots.map((s) => (
                                            <button
                                                key={s.startAt}
                                                type="button"
                                                onClick={() => { setSelectedSlot(s); setError(''); }}
                                                className={cn(
                                                    'py-2.5 rounded-xl border text-sm font-bold transition',
                                                    selectedSlot?.startAt === s.startAt
                                                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                                        : 'border-[#E2E8F0] hover:border-[#0F172A]/40'
                                                )}
                                            >
                                                {new Date(s.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-[#E2E8F0] p-5 bg-[#FAFBFC]">
                                {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
                                <button
                                    type="button"
                                    disabled={!selectedSlot}
                                    onClick={goToDetails}
                                    className="w-full py-3.5 rounded-xl bg-[#0F172A] text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    Next — enter your details
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Details */}
                    {step === 'details' && selectedSlot && (
                        <div className="p-5 space-y-4">
                            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 text-sm">
                                <p className="font-bold text-[#0F172A]">
                                    {new Date(selectedSlot.startAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    {' at '}
                                    {new Date(selectedSlot.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-xs text-[#64748B] mt-0.5">{eventType.name} · {eventType.durationMinutes} min</p>
                            </div>

                            <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                <User className="w-4 h-4 text-[#F59E0B]" /> Your details
                            </h3>
                            <p className="text-xs text-[#64748B]"><span className="text-red-500">*</span> Required fields</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="block sm:col-span-1">
                                    <span className="text-xs font-bold text-[#64748B]">Full name <span className="text-red-500">*</span></span>
                                    <input
                                        value={customerName}
                                        onChange={(e) => { setCustomerName(e.target.value); setFieldErrors((p) => ({ ...p, customerName: '' })); }}
                                        onBlur={() => setFieldErrors((p) => ({ ...p, ...validateDetails() }))}
                                        className={cn('mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm', fieldErrors.customerName && detailsTouched ? 'border-red-400' : 'border-[#E2E8F0]')}
                                    />
                                    {detailsTouched && fieldErrors.customerName && <p className="text-xs text-red-600 mt-1">{fieldErrors.customerName}</p>}
                                </label>
                                <label className="block sm:col-span-1">
                                    <span className="text-xs font-bold text-[#64748B]">Email <span className="text-red-500">*</span></span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })); }}
                                        onBlur={() => setFieldErrors((p) => ({ ...p, ...validateDetails() }))}
                                        className={cn('mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm', fieldErrors.email && detailsTouched ? 'border-red-400' : 'border-[#E2E8F0]')}
                                    />
                                    {detailsTouched && fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
                                </label>
                                <label className="block sm:col-span-1">
                                    <span className="text-xs font-bold text-[#64748B]">Phone <span className="text-red-500">*</span></span>
                                    <input
                                        inputMode="numeric"
                                        value={phone}
                                        onChange={(e) => { setPhone(restrictPhoneInput(e.target.value)); setFieldErrors((p) => ({ ...p, phone: '' })); }}
                                        onBlur={() => setFieldErrors((p) => ({ ...p, ...validateDetails() }))}
                                        maxLength={11}
                                        className={cn('mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm', fieldErrors.phone && detailsTouched ? 'border-red-400' : 'border-[#E2E8F0]')}
                                    />
                                    {detailsTouched && fieldErrors.phone && <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>}
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-xs font-bold text-[#64748B]">Property address <span className="text-red-500">*</span></span>
                                    <input
                                        value={address}
                                        onChange={(e) => { setAddress(e.target.value); setFieldErrors((p) => ({ ...p, address: '' })); }}
                                        onBlur={() => setFieldErrors((p) => ({ ...p, ...validateDetails() }))}
                                        className={cn('mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm', fieldErrors.address && detailsTouched ? 'border-red-400' : 'border-[#E2E8F0]')}
                                    />
                                    {detailsTouched && fieldErrors.address && <p className="text-xs text-red-600 mt-1">{fieldErrors.address}</p>}
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-xs font-bold text-[#64748B]">Describe the job <span className="text-[#94A3B8] font-normal">(recommended)</span></span>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        placeholder="e.g. fuse box tripping, lights not working…"
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm resize-none"
                                    />
                                </label>
                            </div>

                            {error && <p className="text-sm text-red-600">{error}</p>}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setStep('schedule'); setError(''); setDetailsTouched(false); }} className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
                                    <ArrowLeft className="w-4 h-4" /> Back
                                </button>
                                <button
                                    type="button"
                                    disabled={!detailsValid}
                                    onClick={goToPayment}
                                    className="flex-1 py-3 rounded-xl bg-[#0F172A] text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    Next — payment
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Payment */}
                    {step === 'payment' && selectedSlot && (
                        <div className="p-5 space-y-4">
                            <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                <ShieldCheck className="w-4 h-4 text-[#F59E0B]" /> Review & pay deposit
                            </h3>

                            <div className="rounded-xl border border-[#E2E8F0] divide-y divide-[#E2E8F0] text-sm">
                                <div className="px-4 py-3 flex justify-between">
                                    <span className="text-[#64748B]">Service</span>
                                    <span className="font-bold text-[#0F172A]">{eventType.name}</span>
                                </div>
                                <div className="px-4 py-3 flex justify-between">
                                    <span className="text-[#64748B]">When</span>
                                    <span className="font-bold text-[#0F172A] text-right">
                                        {new Date(selectedSlot.startAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        {' · '}
                                        {new Date(selectedSlot.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="px-4 py-3 flex justify-between">
                                    <span className="text-[#64748B]">Name</span>
                                    <span className="font-bold text-[#0F172A]">{customerName}</span>
                                </div>
                                <div className="px-4 py-3 flex justify-between">
                                    <span className="text-[#64748B]">Address</span>
                                    <span className="font-bold text-[#0F172A] text-right max-w-[60%]">{address}</span>
                                </div>
                                <div className="px-4 py-3 flex justify-between bg-[#FAFBFC]">
                                    <span className="font-bold text-[#0F172A]">Deposit due today</span>
                                    <span className="font-black text-[#F59E0B] text-lg">{formatCents(eventType.depositCents)}</span>
                                </div>
                            </div>

                            {error && <p className="text-sm text-red-600">{error}</p>}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setStep('details'); setError(''); }} className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
                                    <ArrowLeft className="w-4 h-4" /> Back
                                </button>
                                <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={submit}
                                    className="flex-1 py-3.5 rounded-xl bg-[#F59E0B] text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    <ShieldCheck className="w-4 h-4" />
                                    {submitting ? 'Processing…' : `Pay ${formatCents(eventType.depositCents)} deposit & book`}
                                </button>
                            </div>
                            <p className="text-[11px] text-[#64748B] text-center">
                                {paymentsMode === 'stripe' ? 'Secure payment via Stripe' : 'Test mode'}
                                {isEmergency && ' · Emergency callout'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
