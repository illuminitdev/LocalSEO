import { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    Calendar,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Droplets,
    LayoutGrid,
    Paintbrush,
    Scissors,
    Syringe,
    User,
    type LucideIcon
} from 'lucide-react';
import { apiGet, apiPost, cn, formatCents, restrictPhoneInput } from '../../../shared/utils';
import { orgBrandStyle, resolveOrgBrand } from '../../../shared/orgBrand';
import { monthDays, todayStr } from '../shared/bookingUtils';
import {
    getBookingPreset,
    resolveSalonServiceCategory,
    SALON_SERVICE_CATEGORIES,
    type BookingCustomField
} from '../shared/bookingIndustryPresets';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
    Hair: Scissors,
    Beauty: Droplets,
    Aesthetics: Syringe,
    Makeup: Paintbrush,
    Courses: BookOpen,
    Other: LayoutGrid
};

function categoryIcon(category: string): LucideIcon {
    return CATEGORY_ICONS[category] || LayoutGrid;
}

type Slot = { startAt: string; endAt: string; date: string; label: string };

export type SalonEventType = {
    slug: string;
    name: string;
    description?: string;
    durationMinutes: number;
    depositCents: number;
    totalCents?: number;
    category?: string;
};

type HostBrand = {
    name: string;
    tradeType?: string;
    phone?: string;
    email?: string;
    serviceArea?: string;
    logoUrl?: string;
    brandPrimary?: string;
    brandSecondary?: string;
};

type IndustryConfig = {
    id?: string;
    name?: string;
    confirmationTitle?: string;
    customFields?: BookingCustomField[];
    uploadPrompt?: string;
    notesPlaceholder?: string;
};

type Step = 'category' | 'service' | 'stylist' | 'when' | 'details' | 'payment';

const STEPS: { key: Step; label: string }[] = [
    { key: 'category', label: 'Category' },
    { key: 'service', label: 'Service' },
    { key: 'stylist', label: 'Stylist' },
    { key: 'when', label: 'When' },
    { key: 'details', label: 'About you' },
    { key: 'payment', label: 'Confirm' }
];

function isDateSelectable(dateStr: string, maxDaysAhead: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${dateStr}T12:00:00`);
    const max = new Date(today);
    max.setDate(max.getDate() + maxDaysAhead);
    return d >= today && d <= max;
}

type Props = {
    hostSlug: string;
    host: HostBrand;
    eventTypes: SalonEventType[];
    industry?: IndustryConfig | null;
    mediaUploadsEnabled?: boolean;
    onSuccess?: () => void;
};

export default function SalonBookingFlow({
    hostSlug,
    host,
    eventTypes,
    industry: industryProp,
    mediaUploadsEnabled = false,
    onSuccess
}: Props) {
    const preset = getBookingPreset('salons');
    const industry = {
        ...preset,
        ...(industryProp || {}),
        customFields: (industryProp?.customFields || preset.customFields || []).filter(
            (f) => f.id !== 'enquiryType'
        )
    };
    const stylistField =
        industry.customFields.find((f) => f.id === 'practitionerPref') || industry.customFields[0];
    const otherFields = industry.customFields.filter((f) => f.id !== stylistField?.id);

    const categorizedEventTypes = useMemo(
        () =>
            eventTypes.map((et) => ({
                ...et,
                category: resolveSalonServiceCategory(et.name, et.category)
            })),
        [eventTypes]
    );

    const categories = useMemo(() => {
        const fromEvents = Array.from(
            new Set(
                categorizedEventTypes
                    .map((et) => String(et.category || '').trim())
                    .filter(Boolean)
            )
        );
        const ordered = [
            ...SALON_SERVICE_CATEGORIES.filter((c) => fromEvents.includes(c)),
            ...fromEvents.filter((c) => !(SALON_SERVICE_CATEGORIES as readonly string[]).includes(c))
        ];
        if (categorizedEventTypes.some((et) => !String(et.category || '').trim())) {
            ordered.push('Other');
        }
        return ordered.length ? ordered : [...SALON_SERVICE_CATEGORIES];
    }, [categorizedEventTypes]);

    const [step, setStep] = useState<Step>('category');
    const [category, setCategory] = useState('');
    const [service, setService] = useState<SalonEventType | null>(null);
    const [stylist, setStylist] = useState('');
    const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [daySlots, setDaySlots] = useState<Slot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [maxDaysAhead, setMaxDaysAhead] = useState(60);
    const [hasAvailabilityRules, setHasAvailabilityRules] = useState(false);
    const [paymentsMode, setPaymentsMode] = useState<'stripe' | 'simulated'>('stripe');
    const [stripePaymentsReady, setStripePaymentsReady] = useState(true);
    const [customerName, setCustomerName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [description, setDescription] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [detailsTouched, setDetailsTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    const servicesInCategory = useMemo(() => {
        if (!category) return [];
        return categorizedEventTypes.filter((et) => {
            const c = String(et.category || '').trim();
            if (category === 'Other') return !c;
            return c === category;
        });
    }, [categorizedEventTypes, category]);

    useEffect(() => {
        if (!service?.slug) return;
        apiGet(`/api/public/${hostSlug}/${service.slug}`)
            .then((data) => {
                setPaymentsMode(data.paymentsMode === 'simulated' ? 'simulated' : 'stripe');
                setStripePaymentsReady(Boolean(data.stripePaymentsReady));
                if (data.maxDaysAhead) setMaxDaysAhead(data.maxDaysAhead);
            })
            .catch(() => {});
    }, [hostSlug, service?.slug]);

    useEffect(() => {
        if (!service?.slug || !selectedDate) {
            setDaySlots([]);
            setHasAvailabilityRules(false);
            return;
        }
        setLoadingSlots(true);
        apiGet(
            `/api/public/${hostSlug}/${service.slug}/availability?from=${selectedDate}&to=${selectedDate}`
        )
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
    }, [hostSlug, service?.slug, selectedDate]);

    const stepIndex = STEPS.findIndex((s) => s.key === step);

    const validateDetails = () => {
        const errors: Record<string, string> = {};
        if (!customerName.trim()) errors.customerName = 'Full name is required.';
        if (!email.trim()) errors.email = 'Email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email.';
        if (!phone.trim()) errors.phone = 'Phone number is required.';
        else if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number.';
        for (const field of otherFields) {
            if (!String(intakeAnswers[field.id] || '').trim()) {
                errors[field.id] = `${field.label.replace(/\s*\*$/, '')} is required.`;
            }
        }
        return errors;
    };

    const uploadPhotoFile = async (file: File) => {
        if (!mediaUploadsEnabled) return;
        setUploadingPhoto(true);
        setError('');
        try {
            const { uploadUrl, publicUrl } = await apiPost(`/api/public/${hostSlug}/upload-url`, {
                contentType: file.type || 'image/jpeg'
            });
            const put = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'image/jpeg' },
                body: file
            });
            if (!put.ok) throw new Error('Photo upload failed');
            setPhotoUrl(publicUrl);
        } catch (e: any) {
            setError(e.message || 'Photo upload failed');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const goBack = () => {
        setError('');
        const order: Step[] = ['category', 'service', 'stylist', 'when', 'details', 'payment'];
        const i = order.indexOf(step);
        if (i <= 0) return;
        setStep(order[i - 1]);
    };

    const submit = async () => {
        if (!service || !selectedSlot) return;
        setSubmitting(true);
        setError('');
        try {
            const answers = {
                ...intakeAnswers,
                ...(stylistField ? { [stylistField.id]: stylist || stylistField.options?.[0] || 'First Available' } : {})
            };
            const result = await apiPost(`/api/public/${hostSlug}/${service.slug}/book`, {
                customerName: customerName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                address: host.serviceArea || 'Salon visit',
                description: description.trim(),
                photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
                intakeAnswers: answers,
                intakeType: 'instant',
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

    const brand = resolveOrgBrand(host);
    const days = monthDays(month.year, month.month);

    if (!categorizedEventTypes.length) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-[#64748B]">
                No salon services are published yet.
            </div>
        );
    }

    if (done) {
        return (
            <div
                className="min-h-screen flex flex-col items-center justify-center text-center py-12 px-4"
                style={{
                    ...orgBrandStyle(host),
                    background:
                        'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 14%, #F8FAFC) 0%, #F8FAFC 55%, #F1F5F9 100%)'
                }}
            >
                <div className="w-full max-w-md mx-auto rounded-[1.75rem] border border-white/70 bg-white/95 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] p-8">
                    <div
                        className="w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto"
                        style={{ background: 'color-mix(in srgb, var(--brand-primary) 22%, white)' }}
                    >
                        <Check className="w-8 h-8" style={{ color: 'var(--brand-secondary)' }} />
                    </div>
                    <h2 className="text-2xl font-black text-[#0F172A]">
                        {industry.confirmationTitle || 'Salon Appointment Confirmed!'}
                    </h2>
                    <p className="text-sm text-[#64748B] mt-2">
                        {service?.name}
                        {selectedSlot
                            ? ` · ${new Date(selectedSlot.startAt).toLocaleString('en-GB', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                              })}`
                            : ''}
                    </p>
                    {stylist && (
                        <p className="text-sm text-[#64748B] mt-1">With {stylist}</p>
                    )}
                    <p className="text-xs text-[#94A3B8] mt-4">Check your email for confirmation details.</p>
                </div>
            </div>
        );
    }

    const whenStep = step === 'when';

    return (
        <div
            className={cn('min-h-screen px-4', whenStep ? 'py-3' : 'py-6')}
            style={{
                ...orgBrandStyle(host),
                background:
                    'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 10%, #F8FAFC) 0%, #F8FAFC 40%, #F1F5F9 100%)'
            }}
        >
            <div className={cn('mx-auto', whenStep ? 'max-w-4xl space-y-2' : 'max-w-lg space-y-4')}>
                <div
                    className={cn(
                        'text-white rounded-[1.75rem] shadow-[0_16px_40px_-28px_rgba(15,23,42,0.55)]',
                        whenStep ? 'px-4 py-3' : 'px-5 py-5'
                    )}
                    style={{ background: 'var(--brand-secondary)' }}
                >
                    <div className={cn('flex items-center', whenStep ? 'gap-3' : 'gap-4')}>
                        {brand.logoUrl ? (
                            <img
                                src={brand.logoUrl}
                                alt={host.name}
                                className="shrink-0 object-contain object-left rounded-xl bg-white p-2"
                                style={{
                                    height: whenStep ? 40 : 56,
                                    width: 'auto',
                                    maxWidth: whenStep ? 140 : 200,
                                    minWidth: whenStep ? 72 : 100
                                }}
                            />
                        ) : (
                            <div
                                className={cn(
                                    'rounded-xl bg-white/10 flex items-center justify-center shrink-0',
                                    whenStep ? 'h-10 w-10' : 'h-14 w-14'
                                )}
                            >
                                <Scissors
                                    className={whenStep ? 'w-5 h-5' : 'w-6 h-6'}
                                    style={{ color: 'var(--brand-primary)' }}
                                />
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            {!whenStep && (
                                <p
                                    className="text-[10px] font-black uppercase tracking-widest"
                                    style={{ color: 'var(--brand-primary)' }}
                                >
                                    Book an appointment
                                </p>
                            )}
                            <h1
                                className={cn(
                                    'font-black tracking-tight',
                                    whenStep ? 'text-lg' : 'text-2xl mt-1'
                                )}
                            >
                                {host.name}
                            </h1>
                            {!whenStep && (
                                <>
                                    <p className="text-sm text-white/70 mt-1">
                                        Pick a service, stylist, and time — deposits secure your slot.
                                    </p>
                                    {(host.phone || host.serviceArea) && (
                                        <p className="text-xs text-white/55 mt-2">
                                            {[host.phone, host.serviceArea].filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {STEPS.map((s, i) => {
                        const active = i === stepIndex;
                        const doneStep = i < stepIndex;
                        return (
                            <span
                                key={s.key}
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
                                    active && 'text-white',
                                    doneStep && !active && 'bg-[#F1F5F9] text-[#0F172A]',
                                    !active && !doneStep && 'text-[#94A3B8]'
                                )}
                                style={active ? { background: 'var(--brand-primary)', color: 'var(--brand-secondary)' } : undefined}
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
                        'bg-white rounded-[1.5rem] border border-[#E2E8F0] shadow-sm',
                        whenStep ? 'overflow-hidden' : 'p-5 space-y-4'
                    )}
                >
                    {step !== 'category' && step !== 'when' && (
                        <button
                            type="button"
                            onClick={goBack}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B]"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Back
                        </button>
                    )}

                    {step === 'category' && (
                        <>
                            <div>
                                <h2 className="font-black text-lg text-[#0F172A]">What are you booking?</h2>
                                <p className="text-sm text-[#64748B] mt-1">Choose a category to see services.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {categories.map((cat) => {
                                    const count =
                                        cat === 'Other'
                                            ? categorizedEventTypes.filter(
                                                  (et) => !String(et.category || '').trim()
                                              ).length
                                            : categorizedEventTypes.filter(
                                                  (et) => String(et.category || '').trim() === cat
                                              ).length;
                                    if (!count) return null;
                                    const Icon = categoryIcon(cat);
                                    return (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => {
                                                setCategory(cat);
                                                setService(null);
                                                setError('');
                                                setStep('service');
                                            }}
                                            className="text-left rounded-2xl border border-[#E2E8F0] p-4 hover:border-[var(--brand-primary)] transition bg-[#FAFBFC]"
                                        >
                                            <Icon
                                                className="w-5 h-5 mb-2"
                                                style={{ color: 'var(--brand-primary)' }}
                                            />
                                            <p className="font-black text-[#0F172A]">{cat}</p>
                                            <p className="text-[11px] text-[#64748B] mt-0.5">
                                                {count} service{count === 1 ? '' : 's'}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {step === 'service' && (
                        <>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                                    {category}
                                </p>
                                <h2 className="font-black text-lg text-[#0F172A] mt-1">Choose a service</h2>
                            </div>
                            <div className="space-y-2">
                                {servicesInCategory.map((et) => (
                                    <button
                                        key={et.slug}
                                        type="button"
                                        onClick={() => {
                                            setService(et);
                                            setSelectedDate('');
                                            setSelectedSlot(null);
                                            setError('');
                                            if (stylistField?.options?.length) {
                                                setStep('stylist');
                                            } else {
                                                setStylist('First Available');
                                                setStep('when');
                                            }
                                        }}
                                        className={cn(
                                            'w-full text-left rounded-2xl border p-4 transition',
                                            service?.slug === et.slug
                                                ? 'border-[var(--brand-primary)]'
                                                : 'border-[#E2E8F0] hover:border-[var(--brand-primary)] bg-white'
                                        )}
                                        style={
                                            service?.slug === et.slug
                                                ? {
                                                      background:
                                                          'color-mix(in srgb, var(--brand-primary) 12%, white)'
                                                  }
                                                : undefined
                                        }
                                    >
                                        <div className="flex justify-between gap-3 items-start">
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#0F172A]">{et.name}</p>
                                                <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5" /> {et.durationMinutes} min
                                                </p>
                                            </div>
                                            <p className="text-sm font-black text-[#0F172A] shrink-0">
                                                {et.depositCents > 0
                                                    ? formatCents(et.depositCents)
                                                    : 'Free'}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {step === 'stylist' && stylistField && (
                        <>
                            <div>
                                <h2 className="font-black text-lg text-[#0F172A]">Who would you like?</h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    Prefer a stylist or take the first available.
                                </p>
                            </div>
                            <div className="space-y-2">
                                {(stylistField.options || []).map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => {
                                            setStylist(opt);
                                            setError('');
                                            setStep('when');
                                        }}
                                        className={cn(
                                            'w-full text-left rounded-2xl border px-4 py-3.5 font-bold text-sm transition flex items-center gap-2',
                                            stylist === opt
                                                ? 'border-[var(--brand-primary)] text-[#0F172A]'
                                                : 'border-[#E2E8F0] text-[#0F172A] hover:border-[var(--brand-primary)]'
                                        )}
                                    >
                                        <User className="w-4 h-4 text-[#64748B]" />
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {step === 'when' && service && (
                        <div>
                            <div className="px-5 pt-4 pb-3 border-b border-[#F1F5F9] flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B] shrink-0"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                                </button>
                                <p className="text-sm font-bold text-[#0F172A] truncate min-w-0">
                                    {service.name}
                                    {stylist ? ` · ${stylist}` : ''}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
                                <div className="p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                            <Calendar className="w-4 h-4 text-[var(--brand-primary)]" /> Pick a date
                                        </h2>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setMonth((m) => {
                                                        const d = new Date(m.year, m.month - 1, 1);
                                                        return { year: d.getFullYear(), month: d.getMonth() };
                                                    })
                                                }
                                                className="p-1.5 rounded-lg border border-[#E2E8F0]"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setMonth((m) => {
                                                        const d = new Date(m.year, m.month + 1, 1);
                                                        return { year: d.getFullYear(), month: d.getMonth() };
                                                    })
                                                }
                                                className="p-1.5 rounded-lg border border-[#E2E8F0]"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-[#64748B] mb-3">
                                        {new Date(month.year, month.month, 1).toLocaleString('en-GB', {
                                            month: 'long',
                                            year: 'numeric'
                                        })}
                                    </p>
                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#64748B] mb-1">
                                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                                            <div key={d}>{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {days.map((d, i) => {
                                            if (!d.inMonth || !d.date) {
                                                return <div key={`pad-${i}`} />;
                                            }
                                            const selectable =
                                                isDateSelectable(d.date, maxDaysAhead) && d.date >= todayStr();
                                            const isPast = d.date < todayStr();
                                            return (
                                                <button
                                                    key={d.date}
                                                    type="button"
                                                    disabled={!selectable}
                                                    onClick={() => {
                                                        setSelectedDate(d.date);
                                                        setSelectedSlot(null);
                                                        setError('');
                                                    }}
                                                    className={cn(
                                                        'aspect-square rounded-lg text-sm font-bold transition',
                                                        selectable
                                                            ? 'hover:bg-[var(--brand-secondary)] hover:text-white border border-[#E2E8F0] bg-[#F8FAFC]'
                                                            : 'text-[#CBD5E1] cursor-not-allowed',
                                                        selectedDate === d.date &&
                                                            'bg-[var(--brand-secondary)] text-white',
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
                                        <Clock className="w-4 h-4 text-[var(--brand-primary)]" />
                                        {selectedDate
                                            ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
                                                  weekday: 'long',
                                                  day: 'numeric',
                                                  month: 'short'
                                              })
                                            : 'Select a date first'}
                                    </h2>
                                    {!selectedDate && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">
                                            Choose any date on the calendar.
                                        </p>
                                    )}
                                    {selectedDate && loadingSlots && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">Loading times…</p>
                                    )}
                                    {selectedDate && !loadingSlots && !hasAvailabilityRules && (
                                        <p className="text-sm text-[#64748B] py-8 text-center">
                                            No booking times set yet — the business hasn&apos;t configured their
                                            availability.
                                        </p>
                                    )}
                                    {selectedDate &&
                                        !loadingSlots &&
                                        hasAvailabilityRules &&
                                        daySlots.length === 0 && (
                                            <p className="text-sm text-[#64748B] py-8 text-center">
                                                No times available on this day — try another date.
                                            </p>
                                        )}
                                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                        {daySlots.map((slot) => (
                                            <button
                                                key={slot.startAt}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSlot(slot);
                                                    setError('');
                                                }}
                                                className={cn(
                                                    'py-2.5 rounded-xl border text-sm font-bold transition',
                                                    selectedSlot?.startAt === slot.startAt
                                                        ? 'bg-[var(--brand-secondary)] text-white border-[var(--brand-secondary)]'
                                                        : 'border-[#E2E8F0] hover:border-[color-mix(in_srgb,var(--brand-secondary)_40%,transparent)]'
                                                )}
                                            >
                                                {new Date(slot.startAt).toLocaleTimeString('en-GB', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-[#E2E8F0] p-5 bg-[#FAFBFC]">
                                <button
                                    type="button"
                                    disabled={!selectedSlot}
                                    onClick={() => {
                                        if (!selectedSlot) {
                                            setError('Select a time to continue.');
                                            return;
                                        }
                                        setError('');
                                        setStep('details');
                                    }}
                                    className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                                >
                                    Continue <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'details' && (
                        <>
                            <div>
                                <h2 className="font-black text-lg text-[#0F172A]">About you</h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    We’ll use these details for your appointment confirmation.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <label className="block">
                                    <span className="text-xs font-bold text-[#64748B]">Full name *</span>
                                    <input
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                    />
                                    {detailsTouched && fieldErrors.customerName && (
                                        <p className="text-xs text-red-600 mt-1">{fieldErrors.customerName}</p>
                                    )}
                                </label>
                                <label className="block">
                                    <span className="text-xs font-bold text-[#64748B]">Email *</span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                    />
                                    {detailsTouched && fieldErrors.email && (
                                        <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>
                                    )}
                                </label>
                                <label className="block">
                                    <span className="text-xs font-bold text-[#64748B]">Phone *</span>
                                    <input
                                        value={phone}
                                        onChange={(e) => setPhone(restrictPhoneInput(e.target.value))}
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                    />
                                    {detailsTouched && fieldErrors.phone && (
                                        <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>
                                    )}
                                </label>
                                {otherFields.map((field) => (
                                    <label key={field.id} className="block">
                                        <span className="text-xs font-bold text-[#64748B]">{field.label}</span>
                                        <select
                                            value={intakeAnswers[field.id] || ''}
                                            onChange={(e) =>
                                                setIntakeAnswers((a) => ({ ...a, [field.id]: e.target.value }))
                                            }
                                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm bg-white"
                                        >
                                            <option value="">Select…</option>
                                            {(field.options || []).map((opt) => (
                                                <option key={opt} value={opt}>
                                                    {opt}
                                                </option>
                                            ))}
                                        </select>
                                        {detailsTouched && fieldErrors[field.id] && (
                                            <p className="text-xs text-red-600 mt-1">{fieldErrors[field.id]}</p>
                                        )}
                                    </label>
                                ))}
                                <label className="block">
                                    <span className="text-xs font-bold text-[#64748B]">Notes</span>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder={industry.notesPlaceholder}
                                        rows={3}
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                    />
                                </label>
                                {mediaUploadsEnabled && (
                                    <label className="block">
                                        <span className="text-xs font-bold text-[#64748B]">
                                            {industry.uploadPrompt || 'Inspiration photo'}
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="mt-1 block w-full text-sm"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) uploadPhotoFile(file);
                                            }}
                                        />
                                        {uploadingPhoto && (
                                            <p className="text-xs text-[#64748B] mt-1">Uploading…</p>
                                        )}
                                        {photoUrl && (
                                            <img
                                                src={photoUrl}
                                                alt=""
                                                className="mt-2 h-20 w-20 rounded-xl object-cover border border-[#E2E8F0]"
                                            />
                                        )}
                                    </label>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setDetailsTouched(true);
                                    const errors = validateDetails();
                                    setFieldErrors(errors);
                                    if (Object.keys(errors).length) {
                                        setError('Please fill in all required fields.');
                                        return;
                                    }
                                    setError('');
                                    setStep('payment');
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                            >
                                Continue to confirm <ArrowRight className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {step === 'payment' && service && selectedSlot && (
                        <>
                            <div>
                                <h2 className="font-black text-lg text-[#0F172A]">Confirm & pay deposit</h2>
                                <p className="text-sm text-[#64748B] mt-1">Review your appointment before paying.</p>
                            </div>
                            <div className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2 text-sm">
                                <p>
                                    <span className="font-bold text-[#0F172A]">Service:</span> {service.name}
                                </p>
                                <p>
                                    <span className="font-bold text-[#0F172A]">Stylist:</span> {stylist}
                                </p>
                                <p>
                                    <span className="font-bold text-[#0F172A]">When:</span>{' '}
                                    {new Date(selectedSlot.startAt).toLocaleString('en-GB', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                                <p>
                                    <span className="font-bold text-[#0F172A]">Deposit:</span>{' '}
                                    {service.depositCents > 0 ? formatCents(service.depositCents) : '£0'}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={submit}
                                className="w-full rounded-xl px-4 py-3.5 text-sm font-black disabled:opacity-50 text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                            >
                                {submitting
                                    ? 'Processing…'
                                    : service.depositCents > 0
                                      ? `Pay ${formatCents(service.depositCents)} deposit`
                                      : 'Confirm appointment'}
                            </button>
                            <p className="text-[11px] text-[#94A3B8] text-center">
                                {paymentsMode === 'stripe' && stripePaymentsReady
                                    ? 'You will be redirected to Stripe Checkout to pay securely.'
                                    : paymentsMode === 'stripe'
                                      ? 'Waiting for business Stripe connection.'
                                      : 'Stripe is not configured — booking may complete in test mode.'}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
