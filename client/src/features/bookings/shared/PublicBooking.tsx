import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    Calendar,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Download,
    Flame,
    ListOrdered,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
    Sparkles,
    User
} from 'lucide-react';
import { API_BASE, apiGet, apiPost, cn, formatCents, restrictPhoneInput } from '../../../shared/utils';
import { monthDays, todayStr } from './bookingUtils';
import { getBookingPreset, normalizeBookingIndustryId, resolveSalonServiceCategory } from './bookingIndustryPresets';
import FoodOrderFlow from '../restaurants/FoodOrderFlow';
import SalonBookingFlow from '../salons/SalonBookingFlow';
import { orgBrandStyle, resolveOrgBrand } from '../../../shared/orgBrand';

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

type IndustryFormConfig = {
    id?: string;
    name?: string;
    customFields?: { id: string; label: string; type: string; options: string[] }[];
    uploadPrompt?: string;
    notesPlaceholder?: string;
    confirmationTitle?: string;
    services?: string[];
    defaultService?: string;
    timeSlots?: string[];
};

type MenuItemPublic = {
    id: string;
    category?: string;
    name: string;
    description?: string;
    priceCents: number;
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

type Props = {
    hostSlug: string;
    eventSlug?: string;
    host: HostBrand;
    eventType?: EventType;
    eventTypes?: EventType[];
    menuItems?: MenuItemPublic[];
    industry?: IndustryFormConfig | null;
    mediaUploadsEnabled?: boolean;
    onSuccess?: () => void;
};

function BrandHeader({
    host,
    title,
    subtitle,
    children,
    compact
}: {
    host: HostBrand;
    title?: string;
    subtitle?: ReactNode;
    children?: ReactNode;
    compact?: boolean;
}) {
    const brand = resolveOrgBrand(host);
    return (
        <div
            className={cn(
                'text-white px-5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.55)]',
                compact ? 'py-4 rounded-2xl' : 'py-5 rounded-[1.75rem]'
            )}
            style={{ background: 'var(--brand-secondary)' }}
        >
            <div className="flex items-start gap-3">
                {brand.logoUrl ? (
                    <img
                        src={brand.logoUrl}
                        alt=""
                        className={cn(
                            'rounded-xl object-contain bg-white/10 shrink-0',
                            compact ? 'h-10 w-10 p-1' : 'h-12 w-12 p-1.5'
                        )}
                    />
                ) : null}
                <div className="min-w-0 flex-1">
                    <p
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: 'var(--brand-primary)' }}
                    >
                        {title || host.tradeType || 'Book online'}
                    </p>
                    <h1 className={cn('font-black mt-1 tracking-tight', compact ? 'text-xl' : 'text-2xl')}>
                        {host.name}
                    </h1>
                    {subtitle}
                </div>
                {children}
            </div>
        </div>
    );
}


function isDateSelectable(dateStr: string, maxDaysAhead: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${dateStr}T12:00:00`);
    const max = new Date(today);
    max.setDate(max.getDate() + maxDaysAhead);
    return d >= today && d <= max;
}

export function CustomerBookingFlow({
    hostSlug,
    eventSlug: initialEventSlug,
    host,
    eventType: initialEventType,
    eventTypes = [],
    menuItems = [],
    industry: industryProp,
    mediaUploadsEnabled = false,
    onSuccess
}: Props) {
    const industry = {
        ...getBookingPreset(host.tradeType || 'plumbing'),
        ...(industryProp || {}),
        customFields: (industryProp?.customFields || getBookingPreset(host.tradeType || 'plumbing').customFields || []).filter(
            (f) => f.id !== 'enquiryType'
        )
    };
    const industryId =
        normalizeBookingIndustryId(industryProp?.id) ||
        normalizeBookingIndustryId(industry.id) ||
        getBookingPreset(host.tradeType || '').id;
    const isDentistsFlow = industryId === 'dentists';
    const [activeEventSlug, setActiveEventSlug] = useState(initialEventSlug || '');
    const [eventType, setEventType] = useState<EventType | null>(initialEventType || null);
    const [selectedCatalog, setSelectedCatalog] = useState<MenuItemPublic | null>(null);
    const [paymentsMode, setPaymentsMode] = useState<'stripe' | 'simulated'>('stripe');
    const [stripePaymentsReady, setStripePaymentsReady] = useState(true);
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
    const [photoUrl, setPhotoUrl] = useState('');
    const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [intakeMode, setIntakeMode] = useState<'instant' | 'request'>('instant');
    const [preferredAt, setPreferredAt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [detailsTouched, setDetailsTouched] = useState(false);
    const [done, setDone] = useState(false);
    const [priceListCategory, setPriceListCategory] = useState('All');
    const [expandedPriceCategories, setExpandedPriceCategories] = useState<Set<string>>(new Set());
    const [priceCategoriesInitialized, setPriceCategoriesInitialized] = useState(false);
    const [dentalBrowsePath, setDentalBrowsePath] = useState<'choose' | 'appointments' | 'priceList'>(
        'choose'
    );

    const slotEventSlug =
        eventTypes.find((e) => /free\s*consultation/i.test(e.name))?.slug ||
        eventTypes[0]?.slug ||
        '';

    const catalogLabel = (m: MenuItemPublic) => {
        const cat = String(m.category || '').trim();
        const pounds = ((Number(m.priceCents) || 0) / 100).toFixed(2).replace(/\.00$/, '');
        return cat ? `${cat}: ${m.name} (£${pounds})` : `${m.name} (£${pounds})`;
    };

    const cleanEventName = (name: string) =>
        String(name || '')
            .replace(/\s*\((?:from\s*)?£[\d.,]+\)\s*$/i, '')
            .trim() || String(name || '');

    const eventPriceDisplay = (et: EventType): { cents: number; label: 'Price' | 'Deposit' } => {
        const total = Number(et.totalCents);
        if (Number.isFinite(total) && total > 0) {
            return { cents: total, label: 'Price' };
        }
        const deposit = Number(et.depositCents) || 0;
        return {
            cents: deposit,
            label: deposit > 0 ? 'Deposit' : 'Price'
        };
    };

    const showServicePicker = !activeEventSlug && !initialEventSlug;
    const isEmergency = activeEventSlug.includes('emergency');
    const days = useMemo(() => monthDays(month.year, month.month), [month]);

    const priceListByCategory = useMemo(() => {
        const map = new Map<string, MenuItemPublic[]>();
        for (const item of menuItems) {
            const cat = String(item.category || '').trim() || 'Treatments';
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(item);
        }
        return [...map.entries()];
    }, [menuItems]);

    const priceListCategories = useMemo(
        () => priceListByCategory.map(([cat]) => cat),
        [priceListByCategory]
    );

    const visiblePriceListGroups = useMemo(() => {
        if (priceListCategory === 'All') return priceListByCategory;
        return priceListByCategory.filter(([cat]) => cat === priceListCategory);
    }, [priceListByCategory, priceListCategory]);

    useEffect(() => {
        if (!isDentistsFlow || priceCategoriesInitialized || priceListCategories.length === 0) return;
        setExpandedPriceCategories(new Set(priceListCategories));
        setPriceCategoriesInitialized(true);
    }, [isDentistsFlow, priceCategoriesInitialized, priceListCategories]);

    const serviceLabel = selectedCatalog
        ? catalogLabel(selectedCatalog)
        : eventType
          ? cleanEventName(eventType.name)
          : 'Appointment';
    const chargeCents = selectedCatalog
        ? Number(selectedCatalog.priceCents) || 0
        : eventType
          ? eventPriceDisplay(eventType).cents
          : 0;

    const bookingIntakeAnswers = useMemo(() => {
        const base = { ...intakeAnswers };
        if (selectedCatalog) {
            base.selectedService = catalogLabel(selectedCatalog);
            base.priceListItemId = selectedCatalog.id;
        }
        return base;
    }, [intakeAnswers, selectedCatalog]);

    useEffect(() => {
        if (!activeEventSlug) return;
        const fromList = eventTypes.find((e) => e.slug === activeEventSlug);
        if (fromList) {
            setEventType(fromList);
        } else if (initialEventType?.slug === activeEventSlug) {
            setEventType(initialEventType);
        }

        apiGet(`/api/public/${hostSlug}/${activeEventSlug}`)
            .then((data) => {
                if (!fromList && initialEventType?.slug !== activeEventSlug) {
                    setEventType({
                        slug: data.eventType.slug,
                        name: data.eventType.name,
                        description: data.eventType.description,
                        durationMinutes: data.eventType.durationMinutes,
                        depositCents: data.eventType.depositCents,
                        totalCents: data.eventType.totalCents
                    });
                }
                setPaymentsMode(data.paymentsMode === 'simulated' ? 'simulated' : 'stripe');
                setStripePaymentsReady(Boolean(data.stripePaymentsReady));
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
        setSelectedCatalog(null);
        setActiveEventSlug(et.slug);
        setEventType(et);
        setError('');
        setStep('schedule');
        setSelectedDate('');
        setSelectedSlot(null);
    };

    const pickCatalogItem = (item: MenuItemPublic) => {
        if (!slotEventSlug) {
            setError('No bookable appointment slot is set up yet. Add an event type in Schedule settings.');
            return;
        }
        setSelectedCatalog(item);
        setActiveEventSlug(slotEventSlug);
        setError('');
        setStep('schedule');
        setSelectedDate('');
        setSelectedSlot(null);
    };

    const backToServicePicker = () => {
        setActiveEventSlug('');
        setEventType(null);
        setSelectedCatalog(null);
        setStep('schedule');
        setSelectedDate('');
        setSelectedSlot(null);
    };

    const backToDentalChoose = () => {
        setDentalBrowsePath('choose');
        setError('');
    };

    const validateDetails = (): Record<string, string> => {
        const errors: Record<string, string> = {};
        if (!customerName.trim()) errors.customerName = 'Full name is required.';
        if (!email.trim()) errors.email = 'Email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
        if (!phone.trim()) errors.phone = 'Phone number is required.';
        else if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number (at least 10 digits).';
        if (!address.trim()) errors.address = 'Property address is required.';
        for (const field of industry.customFields || []) {
            if (!String(intakeAnswers[field.id] || '').trim()) {
                errors[field.id] = `${field.label.replace(/\s*\*$/, '')} is required.`;
            }
        }
        return errors;
    };

    const detailsValid = useMemo(
        () => Object.keys(validateDetails()).length === 0,
        [customerName, email, phone, address, intakeAnswers, industry]
    );

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

    const goToDetails = () => {
        if (intakeMode === 'instant' && !selectedSlot) {
            setError('Select a date and time to continue.');
            return;
        }
        if (intakeMode === 'request' && !preferredAt) {
            setError('Choose a preferred date and time for your request.');
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
        if (intakeMode === 'request') {
            submitRequest();
            return;
        }
        setStep('payment');
    };

    const submitRequest = async () => {
        if (!eventType || !preferredAt) return;
        setSubmitting(true);
        setError('');
        try {
            const start = new Date(preferredAt);
            const end = new Date(start.getTime() + (eventType.durationMinutes || 60) * 60000);
            const result = await apiPost(`/api/public/${hostSlug}/${activeEventSlug}/book`, {
                customerName: customerName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                address: address.trim(),
                description: description.trim(),
                intakeType: 'request',
                preferredSlots: [{ startAt: start.toISOString(), endAt: end.toISOString() }],
                photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
                intakeAnswers: bookingIntakeAnswers,
                startAt: start.toISOString(),
                endAt: end.toISOString()
            });
            if (result.success || result.mode === 'request') {
                setDone(true);
                onSuccess?.();
                return;
            }
            throw new Error(result.error || 'Request could not be submitted');
        } catch (e: any) {
            setError(e.message || 'Request failed — try again.');
        } finally {
            setSubmitting(false);
        }
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
                photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
                intakeAnswers: bookingIntakeAnswers,
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

    const stepIndicator = (current: BookingStep) => {
        const steps: { key: BookingStep; label: string }[] = [
            { key: 'schedule', label: isDentistsFlow ? 'When' : 'Date & time' },
            { key: 'details', label: isDentistsFlow ? 'About you' : 'Your details' },
            { key: 'payment', label: isDentistsFlow ? 'Confirm' : 'Payment' }
        ];
        const idx = steps.findIndex((s) => s.key === current);
        if (isDentistsFlow) {
            return (
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {steps.map((s, i) => {
                        const active = i === idx;
                        const doneStep = i < idx;
                        return (
                            <div key={s.key} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                {i > 0 && <span className="text-[#CBD5E1] text-xs">›</span>}
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
                                        active && 'text-white',
                                        doneStep && !active && 'bg-[#F1F5F9] text-[#0F172A]',
                                        !active && !doneStep && 'text-[#94A3B8]'
                                    )}
                                    style={active ? { background: 'var(--brand-secondary)' } : undefined}
                                >
                                    <span
                                        className={cn(
                                            'w-4 h-4 rounded-full text-[9px] flex items-center justify-center',
                                            active ? 'bg-white/20' : 'bg-[#E2E8F0] text-[#64748B]'
                                        )}
                                    >
                                        {i + 1}
                                    </span>
                                    {s.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            );
        }
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
            <div
                className="min-h-screen flex flex-col items-center justify-center text-center py-12 px-4"
                style={{
                    ...orgBrandStyle(host),
                    background: isDentistsFlow
                        ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 12%, #F8FAFC) 0%, #F8FAFC 50%, #F1F5F9 100%)'
                        : '#F8FAFC'
                }}
            >
                <div
                    className={cn(
                        'w-full max-w-md mx-auto',
                        isDentistsFlow &&
                            'rounded-[1.75rem] border border-white/70 bg-white/95 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] p-8'
                    )}
                >
                    <div
                        className={cn(
                            'w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto',
                            !isDentistsFlow && 'bg-emerald-100'
                        )}
                        style={
                            isDentistsFlow
                                ? {
                                      background:
                                          'color-mix(in srgb, var(--brand-primary) 22%, white)'
                                  }
                                : undefined
                        }
                    >
                        <ShieldCheck
                            className={cn('w-8 h-8', !isDentistsFlow && 'text-emerald-600')}
                            style={isDentistsFlow ? { color: 'var(--brand-secondary)' } : undefined}
                        />
                    </div>
                    <h2 className="text-xl font-black text-[#0F172A]">
                        {intakeMode === 'request'
                            ? isDentistsFlow
                                ? 'Request sent'
                                : 'Request submitted'
                            : isDentistsFlow
                              ? "You're booked"
                              : 'Booking confirmed'}
                    </h2>
                    <p className="text-sm text-[#64748B] mt-2 max-w-sm mx-auto">
                        {intakeMode === 'request'
                            ? isDentistsFlow
                                ? `The clinic will check your preferred time and get back to you.${email ? ` We’ll use ${email}.` : ''}`
                                : `The business will review your preferred time and get back to you.${email ? ` We noted ${email}.` : ''}`
                            : isDentistsFlow
                              ? `${chargeCents > 0 ? `Deposit of ${formatCents(chargeCents)} recorded.` : 'Your visit is confirmed.'}${email ? ` Details sent to ${email}.` : ''}`
                              : `Payment of ${formatCents(chargeCents)} recorded.${email ? ` Confirmation sent to ${email}.` : ''}`}
                    </p>
                </div>
            </div>
        );
    }

    if (showServicePicker) {
        const sortedEvents = [...eventTypes].sort((a, b) => {
            const aFree = /free\s*consultation/i.test(a.name) ? 0 : 1;
            const bFree = /free\s*consultation/i.test(b.name) ? 0 : 1;
            return aFree - bFree;
        });

        return (
            <div
                className="min-h-screen py-6 sm:py-10 px-4"
                style={{
                    ...orgBrandStyle(host),
                    background:
                        'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 10%, #F8FAFC) 0%, #F8FAFC 42%, #F1F5F9 100%)'
                }}
            >
                <div className="max-w-2xl mx-auto space-y-5">
                    <BrandHeader
                        host={host}
                        subtitle={
                            host.serviceArea ? (
                                <p className="text-xs text-white/60 mt-2 flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 shrink-0" /> {host.serviceArea}
                                </p>
                            ) : null
                        }
                    />

                    {isDentistsFlow ? (
                        <div className="space-y-4">
                            {dentalBrowsePath !== 'choose' && (
                                <div className="flex items-center gap-2 text-xs font-bold text-[#64748B]">
                                    <button
                                        type="button"
                                        onClick={backToDentalChoose}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/90 border border-[#E2E8F0] hover:border-[var(--brand-primary)] transition"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" /> Start over
                                    </button>
                                    <span className="text-[#CBD5E1]">/</span>
                                    <span style={{ color: 'var(--brand-secondary)' }}>
                                        {dentalBrowsePath === 'appointments'
                                            ? 'Book a time'
                                            : 'Treatments'}
                                    </span>
                                </div>
                            )}

                            {error && (
                                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                                    {error}
                                </p>
                            )}

                            {dentalBrowsePath === 'choose' && (
                                <div className="rounded-[1.75rem] border border-white/70 bg-white/95 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] p-5 sm:p-7 space-y-6">
                                    <div className="space-y-2">
                                        <p
                                            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em]"
                                            style={{ color: 'var(--brand-primary)' }}
                                        >
                                            <Sparkles className="w-3.5 h-3.5" /> Book online
                                        </p>
                                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0F172A]">
                                            How would you like to book?
                                        </h2>
                                        <p className="text-sm text-[#64748B] max-w-md">
                                            Pick a visit time, or explore treatments first — whichever feels
                                            easier.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDentalBrowsePath('appointments')}
                                            className="group text-left rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 sm:p-6 hover:border-[var(--brand-primary)] hover:bg-white hover:shadow-md transition"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div
                                                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                                    style={{
                                                        background: 'var(--brand-secondary)',
                                                        color: 'var(--brand-primary)'
                                                    }}
                                                >
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-black text-lg text-[#0F172A]">
                                                        Book a time
                                                    </p>
                                                    <p className="text-sm text-[#64748B] mt-1">
                                                        Free consultation, check-ups, and visit slots
                                                        {eventTypes.length
                                                            ? ` · ${eventTypes.length} options`
                                                            : ''}
                                                    </p>
                                                </div>
                                                <ArrowRight className="w-5 h-5 text-[#94A3B8] group-hover:text-[var(--brand-primary)] shrink-0 mt-1 transition" />
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDentalBrowsePath('priceList')}
                                            className="group text-left rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 sm:p-6 hover:border-[var(--brand-primary)] hover:bg-white hover:shadow-md transition"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div
                                                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                                    style={{
                                                        background:
                                                            'color-mix(in srgb, var(--brand-primary) 18%, white)',
                                                        color: 'var(--brand-secondary)'
                                                    }}
                                                >
                                                    <ListOrdered className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-black text-lg text-[#0F172A]">
                                                        Explore treatments
                                                    </p>
                                                    <p className="text-sm text-[#64748B] mt-1">
                                                        Facial, dental, injectables and more with prices
                                                        {menuItems.length
                                                            ? ` · ${menuItems.length} treatments`
                                                            : ''}
                                                    </p>
                                                </div>
                                                <ArrowRight className="w-5 h-5 text-[#94A3B8] group-hover:text-[var(--brand-primary)] shrink-0 mt-1 transition" />
                                            </div>
                                        </button>
                                    </div>

                                    {(host.phone || host.email) && (
                                        <p className="text-xs text-[#94A3B8] text-center pt-1">
                                            Prefer to talk?{' '}
                                            {host.phone ? (
                                                <a
                                                    href={`tel:${host.phone.replace(/\s/g, '')}`}
                                                    className="font-bold underline"
                                                    style={{ color: 'var(--brand-secondary)' }}
                                                >
                                                    Call {host.phone}
                                                </a>
                                            ) : (
                                                <a
                                                    href={`mailto:${host.email}`}
                                                    className="font-bold underline"
                                                    style={{ color: 'var(--brand-secondary)' }}
                                                >
                                                    Email us
                                                </a>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}

                            {dentalBrowsePath === 'appointments' && (
                                <div className="rounded-[1.75rem] border border-white/70 bg-white/95 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] overflow-hidden">
                                    <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-[#F1F5F9]">
                                        <h2 className="text-xl font-black text-[#0F172A]">Book a time</h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            Tap a visit — next you’ll choose date and time.
                                        </p>
                                    </div>
                                    <div className="p-3 sm:p-4 space-y-2">
                                        {sortedEvents.length === 0 && (
                                            <p className="text-sm text-[#94A3B8] text-center py-10">
                                                No visit times published yet.
                                            </p>
                                        )}
                                        {sortedEvents.map((et) => {
                                            const price = eventPriceDisplay(et);
                                            const isFree = /free\s*consultation/i.test(et.name);
                                            return (
                                                <button
                                                    key={`slot-${et.slug}`}
                                                    type="button"
                                                    onClick={() => pickService(et)}
                                                    className={cn(
                                                        'w-full text-left rounded-2xl border p-4 transition group',
                                                        isFree
                                                            ? 'border-[color-mix(in_srgb,var(--brand-primary)_45%,#E2E8F0)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)]'
                                                            : 'border-[#E2E8F0] bg-white hover:border-[var(--brand-primary)] hover:bg-[#FCFDFE]'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <p className="font-bold text-[#0F172A]">
                                                                    {cleanEventName(et.name)}
                                                                </p>
                                                                {isFree && (
                                                                    <span
                                                                        className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
                                                                        style={{
                                                                            background:
                                                                                'var(--brand-primary)'
                                                                        }}
                                                                    >
                                                                        Popular
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {et.description &&
                                                                et.description !== et.name && (
                                                                    <p className="text-sm text-[#64748B] mt-1 line-clamp-2">
                                                                        {et.description}
                                                                    </p>
                                                                )}
                                                            <p className="text-xs text-[#64748B] mt-2 inline-flex items-center gap-1">
                                                                <Clock className="w-3.5 h-3.5" />{' '}
                                                                {et.durationMinutes} min
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p
                                                                className="text-lg font-black"
                                                                style={{ color: 'var(--brand-primary)' }}
                                                            >
                                                                {formatCents(price.cents)}
                                                            </p>
                                                            <p className="text-[10px] font-bold uppercase text-[#94A3B8] mt-0.5">
                                                                {price.label}
                                                            </p>
                                                        </div>
                                                        <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[var(--brand-primary)] shrink-0" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {dentalBrowsePath === 'priceList' && (
                                <div className="rounded-[1.75rem] border border-white/70 bg-white/95 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)] overflow-hidden">
                                    <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-[#F1F5F9] space-y-4">
                                        <div>
                                            <h2 className="text-xl font-black text-[#0F172A]">
                                                Explore treatments
                                            </h2>
                                            <p className="text-sm text-[#64748B] mt-1">
                                                Browse by type, then select what you want.
                                            </p>
                                        </div>
                                        {priceListCategories.length > 1 && (
                                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                                                {['All', ...priceListCategories].map((cat) => {
                                                    const active = priceListCategory === cat;
                                                    return (
                                                        <button
                                                            key={cat}
                                                            type="button"
                                                            onClick={() => {
                                                                setPriceListCategory(cat);
                                                                if (cat !== 'All') {
                                                                    setExpandedPriceCategories(
                                                                        (prev) =>
                                                                            new Set([...prev, cat])
                                                                    );
                                                                }
                                                            }}
                                                            className={cn(
                                                                'shrink-0 px-3.5 py-2 rounded-full text-xs font-bold border transition',
                                                                active
                                                                    ? 'text-white border-transparent shadow-sm'
                                                                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]'
                                                            )}
                                                            style={
                                                                active
                                                                    ? {
                                                                          background:
                                                                              'var(--brand-secondary)'
                                                                      }
                                                                    : undefined
                                                            }
                                                        >
                                                            {cat}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-3 sm:p-4 space-y-3">
                                        {visiblePriceListGroups.map(([cat, items]) => {
                                            const isOpen =
                                                expandedPriceCategories.has(cat) ||
                                                priceListCategory === cat ||
                                                priceListCategories.length <= 2;
                                            const minCents = Math.min(
                                                ...items.map((i) => Number(i.priceCents) || 0)
                                            );
                                            return (
                                                <div
                                                    key={cat}
                                                    className="rounded-2xl border border-[#E2E8F0] overflow-hidden bg-white"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedPriceCategories((prev) => {
                                                                const next = new Set(prev);
                                                                if (next.has(cat)) next.delete(cat);
                                                                else next.add(cat);
                                                                return next;
                                                            })
                                                        }
                                                        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left bg-[#F8FAFC]"
                                                    >
                                                        <div>
                                                            <p className="font-bold text-[#0F172A]">{cat}</p>
                                                            <p className="text-xs text-[#64748B] mt-0.5">
                                                                from {formatCents(minCents)} · {items.length}{' '}
                                                                option{items.length === 1 ? '' : 's'}
                                                            </p>
                                                        </div>
                                                        <ChevronDown
                                                            className={cn(
                                                                'w-4 h-4 text-[#94A3B8] transition',
                                                                isOpen && 'rotate-180'
                                                            )}
                                                        />
                                                    </button>
                                                    {isOpen && (
                                                        <div className="divide-y divide-[#F1F5F9]">
                                                            {items.map((item) => (
                                                                <button
                                                                    key={item.id}
                                                                    type="button"
                                                                    onClick={() => pickCatalogItem(item)}
                                                                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FCFDFE] transition group"
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="font-bold text-[#0F172A]">
                                                                            {item.name}
                                                                        </p>
                                                                        {item.description && (
                                                                            <p className="text-sm text-[#64748B] mt-0.5 line-clamp-2">
                                                                                {item.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <p
                                                                        className="font-black text-base shrink-0"
                                                                        style={{
                                                                            color: 'var(--brand-primary)'
                                                                        }}
                                                                    >
                                                                        {formatCents(item.priceCents)}
                                                                    </p>
                                                                    <span
                                                                        className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg text-white opacity-90 group-hover:opacity-100"
                                                                        style={{
                                                                            background:
                                                                                'var(--brand-secondary)'
                                                                        }}
                                                                    >
                                                                        Select
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {menuItems.length === 0 && (
                                            <p className="text-sm text-[#94A3B8] text-center py-10">
                                                Treatments will appear here once the clinic publishes them.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4 shadow-sm">
                            <h2 className="font-bold text-lg text-[#0F172A]">What do you need?</h2>
                            <p className="text-sm text-[#64748B]">
                                Choose a service or treatment — then pick a date and time.
                            </p>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                            <div className="space-y-3">
                                {eventTypes.map((et) => {
                                    const emergency = et.slug.includes('emergency');
                                    const price = eventPriceDisplay(et);
                                    return (
                                        <button
                                            key={`et-${et.slug}`}
                                            type="button"
                                            onClick={() => pickService(et)}
                                            className={cn(
                                                'w-full text-left rounded-xl border p-4 transition',
                                                emergency
                                                    ? 'border-red-200 hover:border-red-400 hover:bg-red-50/50'
                                                    : 'border-[#E2E8F0] hover:border-[var(--brand-primary)] hover:bg-[color-mix(in_srgb,var(--brand-primary)_5%,white)]'
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-bold text-[#0F172A] flex items-center gap-2">
                                                        {emergency && (
                                                            <Flame className="w-4 h-4 text-red-500" />
                                                        )}
                                                        {cleanEventName(et.name)}
                                                    </p>
                                                    {et.description && et.description !== et.name && (
                                                        <p className="text-sm text-[#64748B] mt-1">
                                                            {et.description}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> {et.durationMinutes}{' '}
                                                        min
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-[10px] font-bold uppercase text-[#64748B]">
                                                        {price.label}
                                                    </p>
                                                    <p
                                                        className={cn(
                                                            'text-xl font-black',
                                                            emergency ? 'text-red-600' : ''
                                                        )}
                                                        style={
                                                            emergency
                                                                ? undefined
                                                                : { color: 'var(--brand-primary)' }
                                                        }
                                                    >
                                                        {formatCents(price.cents)}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                                {menuItems.map((item) => (
                                    <button
                                        key={`menu-${item.id}`}
                                        type="button"
                                        onClick={() => pickCatalogItem(item)}
                                        className="w-full text-left rounded-xl border border-[#E2E8F0] p-4 transition hover:border-[var(--brand-primary)] hover:bg-[color-mix(in_srgb,var(--brand-primary)_5%,white)]"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                {item.category && (
                                                    <p className="text-[10px] font-bold uppercase text-[#94A3B8]">
                                                        {item.category}
                                                    </p>
                                                )}
                                                <p className="font-bold text-[#0F172A]">{item.name}</p>
                                                {item.description && (
                                                    <p className="text-sm text-[#64748B] mt-1">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[10px] font-bold uppercase text-[#64748B]">
                                                    Price
                                                </p>
                                                <p
                                                    className="text-xl font-black"
                                                    style={{ color: 'var(--brand-primary)' }}
                                                >
                                                    {formatCents(item.priceCents)}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                                {eventTypes.length === 0 && menuItems.length === 0 && (
                                    <p className="text-sm text-[#94A3B8] text-center py-6">
                                        No services available yet.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (!eventType) {
        return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    }

    return (
        <div
            className="min-h-screen py-6 px-4"
            style={{
                ...orgBrandStyle(host),
                background: isDentistsFlow
                    ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 10%, #F8FAFC) 0%, #F8FAFC 40%, #F1F5F9 100%)'
                    : '#F8FAFC'
            }}
        >
            <div className="max-w-4xl mx-auto space-y-4">
                <BrandHeader
                    host={host}
                    compact
                    title={host.tradeType}
                    subtitle={
                        host.serviceArea ? (
                            <p className="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 shrink-0" /> {host.serviceArea}
                            </p>
                        ) : null
                    }
                >
                    {(host.phone || host.email) &&
                        (host.email && !host.phone ? (
                            <a
                                href={`mailto:${host.email}`}
                                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ background: 'var(--brand-primary)' }}
                                title={host.email}
                            >
                                <Mail className="w-4 h-4" />
                            </a>
                        ) : (
                            <a
                                href={`tel:${(host.phone || '').replace(/\s/g, '')}`}
                                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ background: 'var(--brand-primary)' }}
                                title={host.phone}
                            >
                                <Phone className="w-4 h-4" />
                            </a>
                        ))}
                </BrandHeader>
                {!initialEventSlug && (eventTypes.length > 0 || menuItems.length > 0) && (
                    <button
                        type="button"
                        onClick={backToServicePicker}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white border border-[#E2E8F0] hover:border-[var(--brand-primary)] transition"
                        style={{ color: 'var(--brand-secondary)' }}
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {isDentistsFlow ? 'Change booking option' : 'Change service'}
                    </button>
                )}

                <div
                    className={cn(
                        'bg-white overflow-hidden',
                        isDentistsFlow
                            ? 'rounded-[1.75rem] border border-white/70 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)]'
                            : 'rounded-2xl border border-[#E2E8F0] shadow-sm'
                    )}
                >
                    <div
                        className={cn(
                            'px-5 pt-5 pb-3 border-b',
                            isDentistsFlow ? 'border-[#F1F5F9] bg-white' : 'border-[#E2E8F0] bg-[#FAFBFC]'
                        )}
                    >
                        {stepIndicator(step)}
                        {isDentistsFlow && (
                            <p className="mt-3 text-sm font-bold text-[#0F172A] flex items-center gap-2">
                                <span
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                                    style={{
                                        background: 'color-mix(in srgb, var(--brand-primary) 18%, white)',
                                        color: 'var(--brand-secondary)'
                                    }}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                </span>
                                <span className="min-w-0 truncate">{serviceLabel}</span>
                            </p>
                        )}
                    </div>

                    {}
                    {step === 'schedule' && (
                        <div>
                            <div className="px-5 pt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIntakeMode('instant');
                                        setError('');
                                    }}
                                    className={cn(
                                        'px-3.5 py-2 rounded-full text-xs font-bold border transition',
                                        intakeMode === 'instant'
                                            ? 'text-white border-transparent shadow-sm'
                                            : 'bg-white text-[#64748B] border-[#E2E8F0]'
                                    )}
                                    style={
                                        intakeMode === 'instant'
                                            ? { background: 'var(--brand-secondary)', borderColor: 'var(--brand-secondary)' }
                                            : undefined
                                    }
                                >
                                    {isDentistsFlow ? 'Pick a slot' : 'Book a time'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIntakeMode('request');
                                        setSelectedSlot(null);
                                        setError('');
                                    }}
                                    className={cn(
                                        'px-3.5 py-2 rounded-full text-xs font-bold border transition',
                                        intakeMode === 'request'
                                            ? 'text-white border-transparent shadow-sm'
                                            : 'bg-white text-[#64748B] border-[#E2E8F0]'
                                    )}
                                    style={
                                        intakeMode === 'request'
                                            ? { background: 'var(--brand-secondary)', borderColor: 'var(--brand-secondary)' }
                                            : undefined
                                    }
                                >
                                    {isDentistsFlow ? 'Request a time' : 'Request a visit'}
                                </button>
                            </div>
                            {intakeMode === 'request' ? (
                                <div className="p-5 space-y-4">
                                    <p className="text-sm text-[#64748B]">
                                        {isDentistsFlow
                                            ? 'Prefer a time that isn’t listed? Tell the clinic when works — they’ll confirm. No deposit on requests.'
                                            : 'Tell us when you prefer — the business will confirm a time. No deposit is taken on requests.'}
                                    </p>
                                    <label className="block text-xs font-bold text-[#64748B]">
                                        Preferred date & time
                                        <input
                                            type="datetime-local"
                                            value={preferredAt}
                                            onChange={(e) => setPreferredAt(e.target.value)}
                                            className="mt-1 w-full max-w-md rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={goToDetails}
                                        className="px-5 py-3 rounded-xl font-bold text-sm text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
                                    >
                                        Continue to your details
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
                                        <div className="p-5">
                                            <div className="flex items-center justify-between mb-4">
                                                <h2 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                                    <Calendar className="w-4 h-4 text-[var(--brand-primary)]" /> Pick a date
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
                                                                selectable
                                                                    ? 'hover:bg-[var(--brand-secondary)] hover:text-white border border-[#E2E8F0] bg-[#F8FAFC]'
                                                                    : 'text-[#CBD5E1] cursor-not-allowed',
                                                                selectedDate === d.date && 'bg-[var(--brand-secondary)] text-white',
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
                                                                ? 'bg-[var(--brand-secondary)] text-white border-[var(--brand-secondary)]'
                                                                : 'border-[#E2E8F0] hover:border-[color-mix(in_srgb,var(--brand-secondary)_40%,transparent)]'
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
                                            className="w-full py-3.5 rounded-xl bg-[var(--brand-secondary)] text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                                        >
                                            {isDentistsFlow ? 'Continue' : 'Next — enter your details'}
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {}
                    {step === 'details' && (selectedSlot || intakeMode === 'request') && (
                        <div className="p-5 space-y-4">
                            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 text-sm">
                                {intakeMode === 'request' && preferredAt ? (
                                    <>
                                        <p className="font-bold text-[#0F172A]">
                                            Preferred: {new Date(preferredAt).toLocaleString('en-GB')}
                                        </p>
                                        <p className="text-xs text-[#64748B] mt-0.5">
                                            Request · {serviceLabel} · business will confirm
                                        </p>
                                    </>
                                ) : selectedSlot ? (
                                    <>
                                        <p className="font-bold text-[#0F172A]">
                                            {new Date(selectedSlot.startAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                                            {' at '}
                                            {new Date(selectedSlot.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        <p className="text-xs text-[#64748B] mt-0.5">
                                            {serviceLabel}
                                            {eventType.durationMinutes ? ` · ${eventType.durationMinutes} min` : ''}
                                        </p>
                                    </>
                                ) : null}
                            </div>

                            <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                <User className="w-4 h-4 text-[var(--brand-primary)]" /> Your details
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
                                    <span className="text-xs font-bold text-[#64748B]">
                                        {isDentistsFlow ? 'Your address / postcode' : 'Property address / postcode'}{' '}
                                        <span className="text-red-500">*</span>
                                    </span>
                                    <input
                                        value={address}
                                        onChange={(e) => { setAddress(e.target.value); setFieldErrors((p) => ({ ...p, address: '' })); }}
                                        onBlur={() => setFieldErrors((p) => ({ ...p, ...validateDetails() }))}
                                        className={cn('mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm', fieldErrors.address && detailsTouched ? 'border-red-400' : 'border-[#E2E8F0]')}
                                    />
                                    {detailsTouched && fieldErrors.address && <p className="text-xs text-red-600 mt-1">{fieldErrors.address}</p>}
                                </label>
                                {(industry.customFields || []).map((field) => (
                                    <label key={field.id} className="block sm:col-span-1">
                                        <span className="text-xs font-bold text-[#64748B]">{field.label}</span>
                                        <select
                                            value={intakeAnswers[field.id] || ''}
                                            onChange={(e) => {
                                                setIntakeAnswers((prev) => ({ ...prev, [field.id]: e.target.value }));
                                                setFieldErrors((p) => ({ ...p, [field.id]: '' }));
                                            }}
                                            onBlur={() => setFieldErrors((p) => ({ ...p, ...validateDetails() }))}
                                            className={cn(
                                                'mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm',
                                                fieldErrors[field.id] && detailsTouched ? 'border-red-400' : 'border-[#E2E8F0]'
                                            )}
                                        >
                                            <option value="">Select…</option>
                                            {field.options.map((opt) => (
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
                                <label className="block sm:col-span-2">
                                    <span className="text-xs font-bold text-[#64748B]">Notes <span className="text-[#94A3B8] font-normal">(optional)</span></span>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        placeholder={industry.notesPlaceholder}
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm resize-none"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-xs font-bold text-[#64748B]">
                                        {industry.uploadPrompt}{' '}
                                        <span className="text-[#94A3B8] font-normal">(optional)</span>
                                    </span>
                                    {mediaUploadsEnabled ? (
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            disabled={uploadingPhoto}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) void uploadPhotoFile(file);
                                            }}
                                            className="mt-1 w-full text-sm"
                                        />
                                    ) : (
                                        <input
                                            type="url"
                                            value={photoUrl}
                                            onChange={(e) => setPhotoUrl(e.target.value)}
                                            placeholder="https://…"
                                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm"
                                        />
                                    )}
                                    {uploadingPhoto && <p className="text-xs text-[#64748B] mt-1">Uploading…</p>}
                                    {photoUrl && (
                                        <a
                                            href={photoUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-[#0F172A] underline mt-1 inline-block"
                                        >
                                            View uploaded photo
                                        </a>
                                    )}
                                </label>
                            </div>

                            {error && <p className="text-sm text-red-600">{error}</p>}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setStep('schedule'); setError(''); setDetailsTouched(false); }} className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
                                    <ArrowLeft className="w-4 h-4" /> Back
                                </button>
                                <button
                                    type="button"
                                    disabled={!detailsValid || submitting}
                                    onClick={goToPayment}
                                    className="flex-1 py-3 rounded-xl bg-[var(--brand-secondary)] text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    {submitting
                                        ? 'Submitting…'
                                        : intakeMode === 'request'
                                          ? 'Submit request'
                                          : 'Next — payment'}
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {}
                    {step === 'payment' && selectedSlot && (
                        <div className="p-5 space-y-4">
                            <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)]" />{' '}
                                {isDentistsFlow ? 'Review & confirm' : 'Review & pay deposit'}
                            </h3>

                            <div className="rounded-xl border border-[#E2E8F0] divide-y divide-[#E2E8F0] text-sm">
                                <div className="px-4 py-3 flex justify-between gap-3">
                                    <span className="text-[#64748B] shrink-0">Service</span>
                                    <span className="font-bold text-[#0F172A] text-right">{serviceLabel}</span>
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
                                    <span className="font-bold text-[#0F172A]">
                                        {chargeCents > 0 ? 'Amount due today' : 'Amount due'}
                                    </span>
                                    <span className="font-black text-[var(--brand-primary)] text-lg">{formatCents(chargeCents)}</span>
                                </div>
                            </div>

                            {error && <p className="text-sm text-red-600">{error}</p>}
                            {!error && paymentsMode === 'simulated' && chargeCents > 0 && (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    Card payments are not configured on the server yet. Pay will not open Stripe until keys are deployed.
                                </p>
                            )}
                            {!error && paymentsMode === 'stripe' && !stripePaymentsReady && chargeCents > 0 && (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    This business has not connected Stripe yet, so deposits cannot be collected.
                                </p>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setStep('details'); setError(''); }} className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
                                    <ArrowLeft className="w-4 h-4" /> Back
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        submitting ||
                                        (chargeCents > 0 &&
                                            (paymentsMode === 'simulated' || !stripePaymentsReady))
                                    }
                                    onClick={submit}
                                    className="flex-1 py-3.5 rounded-xl bg-[var(--brand-primary)] text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    <ShieldCheck className="w-4 h-4" />
                                    {submitting
                                        ? 'Processing…'
                                        : chargeCents > 0
                                          ? `Pay ${formatCents(chargeCents)} & book`
                                          : 'Confirm booking'}
                                </button>
                            </div>
                            <p className="text-[11px] text-[#64748B] text-center">
                                {paymentsMode === 'stripe' && stripePaymentsReady
                                    ? 'You will be redirected to Stripe Checkout to pay securely'
                                    : paymentsMode === 'stripe'
                                      ? 'Waiting for business Stripe connection'
                                      : 'Stripe is not configured on the server'}
                                {isEmergency && ' · Emergency callout'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function PublicBookHost() {
    const { hostSlug } = useParams();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [path, setPath] = useState<'choose' | 'table' | 'food' | null>(null);

    useEffect(() => {
        if (!hostSlug) return;
        apiGet(`/api/public/${hostSlug}`)
            .then((d) => {
                setData(d);
                const isRestaurant = normalizeBookingIndustryId(d.bookingIndustryId) === 'restaurants';
                if (!isRestaurant) {
                    setPath('table');
                } else if (searchParams.get('food') === '1') {
                    setPath('food');
                } else {
                    setPath('choose');
                }
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [hostSlug, searchParams]);

    if (loading || path === null) {
        return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    }
    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Not found'}</div>
        );
    }

    const eventTypes = (data.eventTypes || []).map((et: any) => ({
        slug: et.slug,
        name: et.name,
        description: et.description,
        durationMinutes: et.duration_minutes,
        depositCents: et.deposit_cents,
        totalCents: et.total_cents,
        category: resolveSalonServiceCategory(et.name, et.category || '')
    }));
    const menuItems = data.menuItems || [];
    const hasMenu = menuItems.length > 0;
    const isSalons = normalizeBookingIndustryId(data.bookingIndustryId) === 'salons';

    if (isSalons) {
        return (
            <SalonBookingFlow
                hostSlug={hostSlug!}
                host={{
                    name: data.name,
                    tradeType: data.tradeType,
                    phone: data.phone,
                    email: data.email,
                    serviceArea: data.serviceArea,
                    logoUrl: data.logoUrl || data.logo_url || '',
                    brandPrimary: data.brandPrimary || data.brand_primary,
                    brandSecondary: data.brandSecondary || data.brand_secondary
                }}
                eventTypes={eventTypes}
                industry={data.industry || getBookingPreset('salons')}
                mediaUploadsEnabled={Boolean(data.mediaUploadsEnabled)}
            />
        );
    }

    if (path === 'choose') {
        return (
            <div
                className="min-h-screen bg-[#F8FAFC] py-6 px-4"
                style={orgBrandStyle({
                    logoUrl: data.logoUrl,
                    brandPrimary: data.brandPrimary,
                    brandSecondary: data.brandSecondary
                })}
            >
                <div className="max-w-lg mx-auto space-y-4">
                    <BrandHeader
                        host={{
                            name: data.name,
                            tradeType: data.tradeType,
                            logoUrl: data.logoUrl,
                            brandPrimary: data.brandPrimary,
                            brandSecondary: data.brandSecondary
                        }}
                        title={data.tradeType || 'Restaurant'}
                        subtitle={
                            <p className="text-sm text-white/70 mt-2">
                                Book a table, or order food for delivery / pickup.
                            </p>
                        }
                    />
                    <button
                        type="button"
                        onClick={() => setPath('table')}
                        className="w-full text-left bg-white rounded-2xl border border-[#E2E8F0] p-5 hover:border-[var(--brand-primary)] transition"
                    >
                        <p className="font-black text-[#0F172A] text-lg">Book a table</p>
                        <p className="text-sm text-[#64748B] mt-1">Reserve a date and time. Order with your waiter when you arrive.</p>
                    </button>
                    <button
                        type="button"
                        disabled={!hasMenu}
                        onClick={() => hasMenu && setPath('food')}
                        className={cn(
                            'w-full text-left rounded-2xl border p-5 transition',
                            hasMenu
                                ? 'bg-white border-[#E2E8F0] hover:border-[var(--brand-primary)]'
                                : 'bg-[#F8FAFC] border-[#E2E8F0] opacity-60 cursor-not-allowed'
                        )}
                    >
                        <p className="font-black text-[#0F172A] text-lg">Order food</p>
                        <p className="text-sm text-[#64748B] mt-1">
                            {hasMenu
                                ? 'Browse the menu, pay online, delivery to your home or collection.'
                                : 'Menu not published yet — check back soon.'}
                        </p>
                    </button>
                </div>
            </div>
        );
    }

    if (path === 'food') {
        return (
            <div
                className="min-h-screen bg-[#F8FAFC] py-6 px-4"
                style={orgBrandStyle({
                    logoUrl: data.logoUrl,
                    brandPrimary: data.brandPrimary,
                    brandSecondary: data.brandSecondary
                })}
            >
                <div className="max-w-lg mx-auto">
                    <FoodOrderFlow
                        hostSlug={hostSlug!}
                        hostName={data.name}
                        menuItems={menuItems}
                        foodOrdering={
                            data.foodOrdering || {
                                deliveryEnabled: true,
                                pickupEnabled: true,
                                deliveryFeeCents: 0,
                                deliveryMinOrderCents: 0,
                                deliveryNotes: ''
                            }
                        }
                        eventSlugForPickup={eventTypes[0]?.slug}
                        onBack={() => setPath('choose')}
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-[#F8FAFC] py-6 px-4"
            style={orgBrandStyle({
                logoUrl: data.logoUrl,
                brandPrimary: data.brandPrimary,
                brandSecondary: data.brandSecondary
            })}
        >
            <div className="max-w-5xl mx-auto space-y-3">
                {normalizeBookingIndustryId(data.bookingIndustryId) === 'restaurants' && (
                    <button
                        type="button"
                        onClick={() => setPath('choose')}
                        className="text-xs font-bold text-[var(--brand-primary)] underline"
                    >
                        ← Back to options
                    </button>
                )}
                <CustomerBookingFlow
                    hostSlug={hostSlug!}
                    host={{
                        name: data.name,
                        tradeType: data.tradeType,
                        phone: data.phone,
                        email: data.email,
                        serviceArea: data.serviceArea,
                        logoUrl: data.logoUrl,
                        brandPrimary: data.brandPrimary,
                        brandSecondary: data.brandSecondary
                    }}
                    industry={data.industry || getBookingPreset(data.bookingIndustryId || data.tradeType)}
                    mediaUploadsEnabled={Boolean(data.mediaUploadsEnabled)}
                    eventTypes={eventTypes}
                    menuItems={(data.menuItems || []).map((m: any) => ({
                        id: m.id,
                        category: m.category || '',
                        name: m.name,
                        description: m.description || '',
                        priceCents: Number(m.priceCents ?? m.price_cents) || 0
                    }))}
                    eventSlug={eventTypes.length === 1 && !(data.menuItems || []).length ? eventTypes[0].slug : undefined}
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
        <div className="min-h-screen bg-[#F8FAFC] py-6 px-4" style={orgBrandStyle(data.host)}>
            <div className="max-w-5xl mx-auto">
                <CustomerBookingFlow
                    hostSlug={hostSlug!}
                    eventSlug={eventSlug!}
                    host={data.host}
                    industry={data.industry || getBookingPreset(data.host?.bookingIndustryId || data.host?.tradeType)}
                    mediaUploadsEnabled={Boolean(data.mediaUploadsEnabled)}
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

export function BookSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);

    useEffect(() => {
        if (!sessionId) {
            setError('Missing payment session — return to booking and try again.');
            setLoading(false);
            return;
        }
        apiGet(`/api/public/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
            .then((data) => {
                setBooking(data.booking);
            })
            .catch((e) => setError(e.message || 'Could not confirm booking'))
            .finally(() => setLoading(false));
    }, [sessionId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-[#64748B] font-medium">
                Confirming your payment...
            </div>
        );
    }

    if (error || !booking) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
                <div className="max-w-md text-center space-y-4">
                    <p className="text-red-600 font-medium">{error || 'Booking could not be confirmed'}</p>
                    <p className="text-sm text-[#64748B]">If you completed payment, refresh this page — your booking will be confirmed automatically.</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 text-sm font-bold text-white bg-[#0F172A] px-4 py-2 rounded-xl"
                    >
                        Refresh & confirm
                    </button>
                </div>
            </div>
        );
    }

    const when = new Date(booking.start_at).toLocaleString('en-GB');
    const icsUrl = `${API_BASE}/api/public/bookings/${booking.id}/calendar.ics`;

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-black text-[#0F172A]">Booking confirmed</h1>
                <p className="text-sm text-[#64748B] mt-2">Deposit paid. Your appointment is confirmed.</p>

                <div className="mt-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-left text-sm space-y-2">
                    <p><span className="text-[#64748B]">Name:</span> <strong>{booking.customer_name}</strong></p>
                    <p><span className="text-[#64748B]">When:</span> <strong>{when}</strong></p>
                    <p><span className="text-[#64748B]">Address:</span> <strong>{booking.customer_address}</strong></p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                    {booking.manage_token && (
                        <Link to={`/book/manage/${booking.manage_token}`} className="text-sm font-bold text-[#F59E0B]">
                            Reschedule or cancel
                        </Link>
                    )}
                    <a href={icsUrl} className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[#0F172A]">
                        <Download className="w-4 h-4" /> Add to calendar (.ics)
                    </a>
                    <p className="flex items-center justify-center gap-2 text-xs text-[#64748B]">
                        <Mail className="w-3.5 h-3.5" /> Confirmation sent to {booking.customer_email}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function BookManage() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) return;
        apiGet(`/api/public/manage/${token}`)
            .then((d) => setBooking(d.booking))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [token]);

    const cancel = async () => {
        if (!token || !confirm('Cancel this booking? If you paid a deposit, it will be refunded to your card.')) return;
        setBusy(true);
        setError('');
        try {
            const result = await apiPost(`/api/public/manage/${token}/cancel`, {});
            if (result.booking) {
                setBooking(result.booking);
            } else {
                setBooking((b: any) => ({ ...b, status: 'cancelled' }));
            }
            if (result.refundError) {
                setMessage('Booking cancelled, but the card refund failed. Contact the business.');
            } else if (result.refund && !result.refund.skipped) {
                const toCustomer = ((result.refund.refundToCustomerCents || result.refund.amountCents || 0) / 100).toFixed(2);
                setMessage(`Booking cancelled. Refund of £${toCustomer} is on the way to your card.`);
            } else {
                setMessage('Booking cancelled.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    if (error || !booking) return <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Booking not found'}</div>;

    const when = new Date(booking.start_at).toLocaleString('en-GB');

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-2xl border border-[#E2E8F0] p-8 space-y-4">
                <h1 className="text-xl font-black text-[#0F172A]">Manage booking</h1>
                <div className="text-sm space-y-1">
                    <p><span className="text-[#64748B]">Service:</span> <strong>{booking.event_name}</strong></p>
                    <p><span className="text-[#64748B]">When:</span> <strong>{when}</strong></p>
                    <p><span className="text-[#64748B]">Status:</span> <strong>{booking.status}</strong></p>
                </div>
                {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{message}</p>}
                {booking.status !== 'cancelled' && booking.status !== 'done' && (
                    <button type="button" disabled={busy} onClick={cancel} className="w-full py-2.5 rounded-xl border border-red-200 text-red-700 font-bold text-sm">
                        Cancel booking
                    </button>
                )}
                <p className="text-xs text-[#64748B]">To reschedule, contact {booking.org_name} or use the booking link again after cancelling.</p>
                <Link to={`/book/${booking.org_slug}/${booking.event_slug}`} className="block text-center text-sm font-bold text-[#0F172A]">
                    Book again
                </Link>
            </div>
        </div>
    );
}

export default PublicBookHost;
