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
    LayoutGrid,
    Paintbrush,
    Palette,
    Scissors,
    Syringe,
    Trash2,
    User,
    type LucideIcon
} from 'lucide-react';
import { apiGet, apiPost, cn, formatCents, restrictPhoneInput } from '../../../shared/utils';
import { orgBrandStyle, resolveOrgBrand } from '../../../shared/orgBrand';
import { monthDays, todayStr, readBookingDraft, writeBookingDraft, clearBookingDraft } from './bookingUtils';
import {
    getBookingPreset,
    getBookingFlowConfig,
    normalizeBookingIndustryId,
    resolveSalonServiceCategory,
    SALON_SERVICE_CATEGORIES,
    type BookingCustomField
} from './bookingIndustryPresets';
import PropertyStep from '../electricians/PropertyStep';
import {
    isElectricianPropertyId,
    isOtherProperty,
    propertyDisplayLabel,
    type ElectricianPropertyId
} from '../electricians/propertyOptions';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
    Hair: Scissors,
    Beauty: Palette,
    Aesthetics: Syringe,
    Makeup: Paintbrush,
    Courses: BookOpen,
    Other: LayoutGrid
};

function categoryIcon(category: string): LucideIcon {
    return CATEGORY_ICONS[category] || LayoutGrid;
}

function formatDuration(minutes: number) {
    const m = Number(minutes) || 0;
    if (m <= 0) return '';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (!rem) return h === 1 ? '1 hr' : `${h} hrs`;
    return `${h} hr ${rem} min`;
}

type Slot = { startAt: string; endAt: string; date: string; label: string; assignedUserId?: string };

export type ShellEventType = {
    slug: string;
    name: string;
    description?: string;
    durationMinutes: number;
    depositCents: number;
    totalCents?: number;
    category?: string;
};

export type ShellMenuItem = {
    id: string;
    category: string;
    name: string;
    description?: string;
    priceCents: number;
};

type BookableMember = { id: string; displayName: string };

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


type Step = 'property' | 'services' | 'stylist' | 'when' | 'details' | 'payment';
type IntakeMode = 'instant' | 'request';
type CatalogBrowseTab = 'appointments' | 'treatments';

type Props = {
    hostSlug: string;
    host: HostBrand;
    eventTypes: ShellEventType[];
    menuItems?: ShellMenuItem[];
    industry?: IndustryConfig | null;
    mediaUploadsEnabled?: boolean;
   
    eventSlug?: string;
    onSuccess?: () => void;
};

export type CustomerViewPortalProps = Props;

function isDateSelectable(dateStr: string, maxDaysAhead: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${dateStr}T12:00:00`);
    const max = new Date(today);
    max.setDate(max.getDate() + maxDaysAhead);
    return d >= today && d <= max;
}

export default function CustomerViewPortal({
    hostSlug,
    host,
    eventTypes,
    menuItems = [],
    industry: industryProp,
    mediaUploadsEnabled = false,
    eventSlug,
    onSuccess
}: Props) {
    const industryId =
        normalizeBookingIndustryId(industryProp?.id) || getBookingPreset(host.tradeType).id;
    const flowConfig = getBookingFlowConfig(industryId);
    const isSalon = industryId === 'salons';
    const preset = getBookingPreset(industryId);
    const industry = {
        ...preset,
        ...(industryProp || {}),
        customFields: (industryProp?.customFields || preset.customFields || []).filter(
            (f) => f.id !== 'enquiryType' && f.id !== 'propertyType' && f.id !== 'propertySize'
        )
    };

    const stylistField =
        flowConfig.staffStep === false
            ? null
            : industry.customFields.find((f) => f.id === 'practitionerPref') ||
              industry.customFields.find((f) => (f.options || []).length > 0) ||
              industry.customFields[0] ||
              null;
    const otherFields = stylistField
        ? industry.customFields.filter((f) => f.id !== stylistField.id)
        : industry.customFields;

    const slotEventSlug =
        eventTypes.find((e) => /free\s*consultation/i.test(e.name))?.slug ||
        eventTypes[0]?.slug ||
        '';

    const showCatalog =
        flowConfig.catalogMode === 'priceList' && menuItems.length > 0 && Boolean(slotEventSlug);

    const catalogLabel = (m: ShellMenuItem) => {
        const cat = String(m.category || '').trim();
        const pounds = ((Number(m.priceCents) || 0) / 100).toFixed(2).replace(/\.00$/, '');
        return cat ? `${cat}: ${m.name} (£${pounds})` : `${m.name} (£${pounds})`;
    };

    const preselected = useMemo(
        () => (eventSlug ? eventTypes.find((e) => e.slug === eventSlug) : undefined),
        [eventSlug, eventTypes]
    );

    const initialNeedsStaff =
        flowConfig.staffStep === 'team' ||
        (flowConfig.staffStep === 'field' && Boolean(stylistField?.options?.length));

    const categorizedEventTypes = useMemo(
        () =>
            eventTypes.map((et) => ({
                ...et,
                category: isSalon
                    ? resolveSalonServiceCategory(et.name, et.category)
                    : String(et.category || '').trim()
            })),
        [eventTypes, isSalon]
    );

    const categories = useMemo(() => {
        const fromEvents = Array.from(
            new Set(
                categorizedEventTypes
                    .map((et) => String(et.category || '').trim())
                    .filter(Boolean)
            )
        );
        if (isSalon) {
            const ordered = [
                ...SALON_SERVICE_CATEGORIES.filter((c) => fromEvents.includes(c)),
                ...fromEvents.filter(
                    (c) => !(SALON_SERVICE_CATEGORIES as readonly string[]).includes(c)
                )
            ];
            if (categorizedEventTypes.some((et) => !String(et.category || '').trim())) {
                ordered.push('Other');
            }
            return ordered.length ? ordered : [...SALON_SERVICE_CATEGORIES];
        }
        const ordered = [...fromEvents];
        if (categorizedEventTypes.some((et) => !String(et.category || '').trim())) {
            ordered.push('Other');
        }
        return ordered;
    }, [categorizedEventTypes, isSalon]);

    const priceListByCategory = useMemo(() => {
        const map = new Map<string, ShellMenuItem[]>();
        for (const item of menuItems) {
            const cat = String(item.category || '').trim() || 'Treatments';
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(item);
        }
        return [...map.entries()];
    }, [menuItems]);

    const treatmentCategories = useMemo(
        () => priceListByCategory.map(([cat]) => cat),
        [priceListByCategory]
    );

    const draft = useMemo(() => readBookingDraft(hostSlug), [hostSlug]);
    const requireBothContacts = !isSalon;

    const restoredCart = useMemo((): ShellEventType[] => {
        if (draft?.selectedCatalog?.id && draft.cartSlugs?.[0]) {
            const slotEt =
                eventTypes.find((e) => e.slug === draft.cartSlugs![0]) || eventTypes[0] || null;
            if (slotEt) {
                const price = Number(draft.selectedCatalog.priceCents) || 0;
                const cat = String(draft.selectedCatalog.category || '').trim();
                const pounds = (price / 100).toFixed(2).replace(/\.00$/, '');
                const label = cat
                    ? `${cat}: ${draft.selectedCatalog.name} (£${pounds})`
                    : `${draft.selectedCatalog.name} (£${pounds})`;
                return [
                    {
                        slug: slotEt.slug,
                        name: label,
                        description: draft.selectedCatalog.description,
                        durationMinutes: Number(slotEt.durationMinutes) || 30,
                        depositCents: price,
                        totalCents: price,
                        category: draft.selectedCatalog.category
                    }
                ];
            }
        }
        if (draft?.cartSlugs?.length) {
            const fromDraft = draft.cartSlugs
                .map((slug) => eventTypes.find((e) => e.slug === slug))
                .filter(Boolean) as ShellEventType[];
            if (fromDraft.length) return fromDraft;
        }
        return preselected ? [preselected] : [];
    }, [draft, eventTypes, preselected]);

    const validDraftSteps = useMemo(() => {
        const order: Step[] = [];
        if (flowConfig.propertyStep) order.push('property');
        order.push('services');
        if (initialNeedsStaff) order.push('stylist');
        order.push('when', 'details', 'payment');
        return order;
    }, [flowConfig.propertyStep, initialNeedsStaff]);

    const [step, setStep] = useState<Step>(() => {
        const dStep = draft?.step as Step | undefined;
        if (dStep && validDraftSteps.includes(dStep)) return dStep;
        if (flowConfig.propertyStep) return 'property';
        if (preselected && flowConfig.selection === 'single') {
            return initialNeedsStaff ? 'stylist' : 'when';
        }
        return 'services';
    });
    const [propertyType, setPropertyType] = useState<ElectricianPropertyId | ''>(() => {
        const id = String(draft?.propertyType || '');
        return isElectricianPropertyId(id) ? id : '';
    });
    const [propertyOther, setPropertyOther] = useState(() => String(draft?.propertyOther || ''));
    const [activeCategory, setActiveCategory] = useState<string>(
        () => draft?.activeCategory || 'All'
    );
    const [catalogTab, setCatalogTab] = useState<CatalogBrowseTab>(
        () => draft?.catalogTab || 'appointments'
    );
    const [cart, setCart] = useState<ShellEventType[]>(() => restoredCart);
    const [selectedCatalog, setSelectedCatalog] = useState<ShellMenuItem | null>(() => {
        if (!draft?.selectedCatalog?.id) return null;
        const found = menuItems.find((m) => m.id === draft.selectedCatalog!.id);
        if (found) return found;
        return {
            id: draft.selectedCatalog.id,
            name: draft.selectedCatalog.name,
            description: draft.selectedCatalog.description,
            priceCents: Number(draft.selectedCatalog.priceCents) || 0,
            category: String(draft.selectedCatalog.category || '')
        };
    });
    const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
    const [stylist, setStylist] = useState(() => String(draft?.stylist || ''));
    const [stylistUserId, setStylistUserId] = useState<string | null>(
        () => draft?.stylistUserId ?? null
    );
    const [teamsEnabled, setTeamsEnabled] = useState(false);
    const [teamMembers, setTeamMembers] = useState<BookableMember[]>([]);
    const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>(
        () => draft?.intakeAnswers || {}
    );
    const [intakeMode, setIntakeMode] = useState<IntakeMode>(
        () => draft?.intakeMode || 'instant'
    );
    const [preferredAt, setPreferredAt] = useState(() => String(draft?.preferredAt || ''));
    const [month, setMonth] = useState(() => {
        if (draft?.month?.year != null && draft?.month?.month != null) {
            return { year: draft.month.year, month: draft.month.month };
        }
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState(() => String(draft?.selectedDate || ''));
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(() => {
        const s = draft?.selectedSlot;
        if (!s?.startAt || !s?.endAt) return null;
        return {
            startAt: s.startAt,
            endAt: s.endAt,
            date: s.date || String(s.startAt).slice(0, 10),
            label: s.label || '',
            ...(s.assignedUserId ? { assignedUserId: s.assignedUserId } : {})
        };
    });
    const [daySlots, setDaySlots] = useState<Slot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [maxDaysAhead, setMaxDaysAhead] = useState(60);
    const [hasAvailabilityRules, setHasAvailabilityRules] = useState(false);
    const [paymentsMode, setPaymentsMode] = useState<'stripe' | 'simulated'>('stripe');
    const [stripePaymentsReady, setStripePaymentsReady] = useState(true);
    const [customerName, setCustomerName] = useState(() => String(draft?.customerName || ''));
    const [email, setEmail] = useState(() => {
        if (draft?.email) return String(draft.email);
        const legacy = String(draft?.contact || '');
        return legacy.includes('@') ? legacy : '';
    });
    const [phone, setPhone] = useState(() => {
        if (draft?.phone) return restrictPhoneInput(String(draft.phone));
        const legacy = String(draft?.contact || '');
        return legacy && !legacy.includes('@') ? restrictPhoneInput(legacy) : '';
    });
    const [postcode, setPostcode] = useState(() => String(draft?.postcode || ''));
    const [description, setDescription] = useState(() => String(draft?.description || ''));
    const [photoUrl, setPhotoUrl] = useState(() => String(draft?.photoUrl || ''));
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [detailsTouched, setDetailsTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    const primaryService = cart[0] || null;
    const cartDuration = cart.reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
    const cartDeposit = cart.reduce((sum, s) => sum + (Number(s.depositCents) || 0), 0);
    const cartTotal = cart.reduce(
        (sum, s) => sum + (Number(s.totalCents ?? s.depositCents) || 0),
        0
    );
    const cartSlugsKey = cart.map((s) => s.slug).join(',');

    const categoriesWithCart = useMemo(() => {
        const set = new Set<string>();
        for (const s of cart) {
            const c = String(s.category || '').trim() || 'Other';
            set.add(c);
        }
        return set;
    }, [cart]);

    const visibleServices = useMemo(() => {
        if (!flowConfig.categories || activeCategory === 'All') return categorizedEventTypes;
        return categorizedEventTypes.filter((et) => {
            const c = String(et.category || '').trim();
            if (activeCategory === 'Other') return !c;
            return c === activeCategory;
        });
    }, [categorizedEventTypes, activeCategory, flowConfig.categories]);

    const visibleTreatmentGroups = useMemo(() => {
        if (activeCategory === 'All') return priceListByCategory;
        return priceListByCategory.filter(([cat]) => cat === activeCategory);
    }, [priceListByCategory, activeCategory]);

    useEffect(() => {
        if (flowConfig.staffStep !== 'team') {
            setTeamsEnabled(false);
            setTeamMembers([]);
            return;
        }
        apiGet(`/api/public/${hostSlug}/team`)
            .then((data) => {
                setTeamsEnabled(Boolean(data.teamsEnabled));
                setTeamMembers(
                    (data.members || []).map((m: any) => ({
                        id: m.id,
                        displayName: m.displayName || m.display_name || 'Staff'
                    }))
                );
            })
            .catch(() => {
                setTeamsEnabled(false);
                setTeamMembers([]);
            });
    }, [hostSlug, flowConfig.staffStep]);

    useEffect(() => {
        if (done) {
            clearBookingDraft(hostSlug);
            return;
        }
        writeBookingDraft(hostSlug, {
            step,
            propertyType: propertyType || '',
            propertyOther,
            cartSlugs: cart.map((s) => s.slug),
            selectedCatalog: selectedCatalog
                ? {
                      id: selectedCatalog.id,
                      name: selectedCatalog.name,
                      description: selectedCatalog.description,
                      priceCents: selectedCatalog.priceCents,
                      category: selectedCatalog.category
                  }
                : null,
            stylist,
            stylistUserId,
            intakeAnswers,
            intakeMode,
            preferredAt,
            selectedDate,
            selectedSlot,
            customerName,
            email,
            phone,
            postcode,
            description,
            photoUrl,
            month,
            activeCategory,
            catalogTab
        });
    }, [
        hostSlug,
        done,
        step,
        propertyType,
        propertyOther,
        cart,
        selectedCatalog,
        stylist,
        stylistUserId,
        intakeAnswers,
        intakeMode,
        preferredAt,
        selectedDate,
        selectedSlot,
        customerName,
        email,
        phone,
        postcode,
        description,
        photoUrl,
        month,
        activeCategory,
        catalogTab
    ]);

    useEffect(() => {
        if (!primaryService?.slug) return;
        apiGet(`/api/public/${hostSlug}/${primaryService.slug}`)
            .then((data) => {
                setPaymentsMode(data.paymentsMode === 'simulated' ? 'simulated' : 'stripe');
                setStripePaymentsReady(Boolean(data.stripePaymentsReady));
                if (data.maxDaysAhead) setMaxDaysAhead(data.maxDaysAhead);
            })
            .catch(() => {});
    }, [hostSlug, primaryService?.slug]);

    useEffect(() => {
        if (
            intakeMode !== 'instant' ||
            !primaryService?.slug ||
            !selectedDate ||
            !cart.length
        ) {
            setDaySlots([]);
            setHasAvailabilityRules(false);
            return;
        }
        setLoadingSlots(true);
        const qs = new URLSearchParams({ from: selectedDate, to: selectedDate });
        qs.set('serviceSlugs', cart.map((s) => s.slug).join(','));
        if (cartDuration > 0) qs.set('durationMinutes', String(cartDuration));
        if (flowConfig.staffStep === 'team' && teamsEnabled) {
            if (stylistUserId) qs.set('userId', stylistUserId);
            else qs.set('firstAvailable', 'true');
        }
        apiGet(`/api/public/${hostSlug}/${primaryService.slug}/availability?${qs.toString()}`)
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
    }, [
        hostSlug,
        primaryService?.slug,
        selectedDate,
        teamsEnabled,
        stylistUserId,
        cartSlugsKey,
        cartDuration,
        cart.length,
        intakeMode,
        flowConfig.staffStep
    ]);

    const stylistOptions = useMemo(() => {
        if (flowConfig.staffStep === 'team' && teamsEnabled && teamMembers.length) {
            return [
                { id: '', label: 'First Available' },
                ...teamMembers.map((m) => ({ id: m.id, label: m.displayName }))
            ];
        }
        if (flowConfig.staffStep === false) return [];
        return (stylistField?.options || ['First Available']).map((opt) => ({
            id: '',
            label: opt
        }));
    }, [flowConfig.staffStep, teamsEnabled, teamMembers, stylistField?.options]);

    const needsStylist =
        flowConfig.staffStep === 'team'
            ? Boolean(teamsEnabled || stylistField?.options?.length)
            : flowConfig.staffStep === 'field'
              ? Boolean(stylistField?.options?.length)
              : false;

    useEffect(() => {
        if (step === 'stylist' && !needsStylist) {
            setStep('when');
        }
    }, [step, needsStylist]);

    const stepOrder = useMemo((): Step[] => {
        const order: Step[] = [];
        if (flowConfig.propertyStep) order.push('property');
        order.push('services');
        if (needsStylist) order.push('stylist');
        order.push('when', 'details');
        if (!(flowConfig.requestMode && intakeMode === 'request')) {
            order.push('payment');
        }
        return order;
    }, [needsStylist, flowConfig.propertyStep, flowConfig.requestMode, intakeMode]);

    const visibleSteps = useMemo(
        () =>
            stepOrder.map((key) => ({
                key,
                label:
                    key === 'property'
                        ? flowConfig.labels.property || 'Property'
                        : key === 'services'
                          ? flowConfig.labels.services
                          : key === 'stylist'
                            ? flowConfig.labels.staff
                            : key === 'when'
                              ? flowConfig.labels.when
                              : key === 'details'
                                ? flowConfig.labels.details
                                : flowConfig.labels.confirm
            })),
        [stepOrder, flowConfig.labels]
    );

    const validateDetails = () => {
        const errors: Record<string, string> = {};
        if (!customerName.trim()) errors.customerName = 'Full name is required.';
        const emailTrim = email.trim().toLowerCase();
        const phoneDigits = phone.replace(/\D/g, '');
        if (requireBothContacts) {
            if (!emailTrim) errors.email = 'Email is required.';
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
                errors.email = 'Enter a valid email.';
            }
            if (!phoneDigits) errors.phone = 'Phone is required.';
            else if (phoneDigits.length < 10 || phoneDigits.length > 11) {
                errors.phone = 'Enter a valid UK phone number (10–11 digits).';
            }
        } else {
            if (!emailTrim && !phoneDigits) {
                errors.email = 'Email or phone is required.';
            }
            if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
                errors.email = 'Enter a valid email.';
            }
            if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11)) {
                errors.phone = 'Enter a valid UK phone number (10–11 digits).';
            }
        }
        if (flowConfig.requirePostcode && !postcode.trim()) {
            errors.postcode = 'Postcode is required.';
        }
        for (const field of otherFields) {
            if (!String(intakeAnswers[field.id] || '').trim()) {
                errors[field.id] = `${field.label.replace(/\s*\*$/, '')} is required.`;
            }
        }
        return errors;
    };

    const contactPayload = () => ({
        email: email.trim().toLowerCase(),
        phone: phone ? restrictPhoneInput(phone) : ''
    });

    const buildIntakeAnswers = () => {
        const answers = {
            ...intakeAnswers,
            ...(stylistField && needsStylist
                ? { [stylistField.id]: stylist || stylistOptions[0]?.label || 'First Available' }
                : {})
        };
        if (flowConfig.propertyStep && propertyType) {
            answers.propertyType = propertyDisplayLabel(propertyType, propertyOther);
            if (isOtherProperty(propertyType) && propertyOther.trim()) {
                answers.propertyOther = propertyOther.trim();
            }
        }
        if (selectedCatalog) {
            answers.catalogItemId = selectedCatalog.id;
            answers.catalogLabel = catalogLabel(selectedCatalog);
        }
        return answers;
    };

    const bookingAddress = () => {
        if (flowConfig.requirePostcode && postcode.trim()) return postcode.trim();
        return host.serviceArea || flowConfig.labels.addressFallback;
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
        const i = stepOrder.indexOf(step);
        if (i <= 0) {
            setStep(flowConfig.propertyStep ? 'property' : 'services');
            return;
        }
        setStep(stepOrder[i - 1]);
    };

    const continueFromProperty = () => {
        if (!propertyType) {
            setError('Choose a property type.');
            return;
        }
        if (isOtherProperty(propertyType) && !propertyOther.trim()) {
            setError('Please describe the place.');
            return;
        }
        setError('');
        if (preselected && flowConfig.selection === 'single' && cart.length) {
            setStep(needsStylist ? 'stylist' : 'when');
            return;
        }
        setStep('services');
    };

    const toggleService = (et: ShellEventType) => {
        setSelectedCatalog(null);
        setIntakeAnswers((a) => {
            const next = { ...a };
            delete next.catalogItemId;
            delete next.catalogLabel;
            return next;
        });
        setCart((prev) => {
            if (flowConfig.selection === 'single') {
                if (prev.length === 1 && prev[0].slug === et.slug) return [];
                return [et];
            }
            if (prev.some((s) => s.slug === et.slug)) {
                return prev.filter((s) => s.slug !== et.slug);
            }
            return [...prev, et];
        });
        setSelectedSlot(null);
        setError('');
    };

    const selectTreatment = (item: ShellMenuItem) => {
        const slotEt =
            eventTypes.find((e) => e.slug === slotEventSlug) || eventTypes[0] || null;
        if (!slotEt) {
            setError('No appointment slot type is available for treatments.');
            return;
        }
        const price = Number(item.priceCents) || 0;
        const synthetic: ShellEventType = {
            slug: slotEt.slug,
            name: catalogLabel(item),
            description: item.description,
            durationMinutes: Number(slotEt.durationMinutes) || 30,
            depositCents: price,
            totalCents: price,
            category: item.category
        };
        setSelectedCatalog(item);
        setCart([synthetic]);
        setSelectedSlot(null);
        setError('');
    };

    const removeFromCart = (slug: string) => {
        setSelectedCatalog(null);
        setIntakeAnswers((a) => {
            const next = { ...a };
            delete next.catalogItemId;
            delete next.catalogLabel;
            return next;
        });
        setCart((prev) => {
            const next = prev.filter((s) => s.slug !== slug);
            if (!next.length) {
                setStep('services');
                setSelectedDate('');
                setSelectedSlot(null);
            }
            return next;
        });
        setSelectedSlot(null);
        setError('');
    };

    const continueFromServices = () => {
        if (!cart.length) {
            setError('Select at least one service to continue.');
            return;
        }
        setError('');
        if (needsStylist) {
            setStep('stylist');
        } else {
            setStylist('First Available');
            setStylistUserId(null);
            setStep('when');
        }
    };

    const submitRequest = async () => {
        if (!primaryService || !preferredAt || !cart.length) return;
        setSubmitting(true);
        setError('');
        try {
            const answers = buildIntakeAnswers();
            const { email: bookEmail, phone: bookPhone } = contactPayload();
            const start = new Date(preferredAt);
            const end = new Date(
                start.getTime() + (Number(primaryService.durationMinutes) || 60) * 60000
            );
            const result = await apiPost(`/api/public/${hostSlug}/${primaryService.slug}/book`, {
                customerName: customerName.trim(),
                email: bookEmail,
                phone: bookPhone,
                address: bookingAddress(),
                description: description.trim(),
                photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
                intakeAnswers: answers,
                intakeType: 'request',
                preferredSlots: [{ startAt: start.toISOString(), endAt: end.toISOString() }],
                startAt: start.toISOString(),
                endAt: end.toISOString(),
                serviceSlugs: cart.map((s) => s.slug)
            });
            if (result.success || result.mode === 'request') {
                clearBookingDraft(hostSlug);
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

    const stickyCta = (() => {
        if (step === 'property') {
            return {
                label: 'Continue',
                action: continueFromProperty,
                disabled: !propertyType || (isOtherProperty(propertyType) && !propertyOther.trim())
            };
        }
        if (step === 'services') {
            return {
                label: needsStylist
                    ? `Choose ${flowConfig.labels.staff.toLowerCase()}`
                    : 'Choose time',
                action: continueFromServices,
                disabled: !cart.length
            };
        }
        if (step === 'stylist') {
            return {
                label: 'Choose time',
                action: () => {
                    if (!stylist && stylistOptions[0]) {
                        setStylist(stylistOptions[0].label);
                        setStylistUserId(stylistOptions[0].id || null);
                    }
                    setStep('when');
                },
                disabled: !cart.length
            };
        }
        if (step === 'when') {
            if (flowConfig.requestMode && intakeMode === 'request') {
                return {
                    label: 'Continue',
                    action: () => {
                        if (!preferredAt) {
                            setError('Choose a preferred date and time for your request.');
                            return;
                        }
                        setError('');
                        setStep('details');
                    },
                    disabled: !preferredAt || !cart.length
                };
            }
            return {
                label: 'Continue',
                action: () => {
                    if (!selectedSlot) {
                        setError('Select a time to continue.');
                        return;
                    }
                    setError('');
                    setStep('details');
                },
                disabled: !selectedSlot || !cart.length
            };
        }
        if (step === 'details') {
            if (flowConfig.requestMode && intakeMode === 'request') {
                return {
                    label: submitting ? 'Submitting…' : 'Submit request',
                    action: () => {
                        setDetailsTouched(true);
                        const errors = validateDetails();
                        setFieldErrors(errors);
                        if (Object.keys(errors).length) {
                            setError('Please fill in all required fields.');
                            return;
                        }
                        setError('');
                        void submitRequest();
                    },
                    disabled: !cart.length || submitting || !preferredAt
                };
            }
            return {
                label: 'Continue to confirm',
                action: () => {
                    setDetailsTouched(true);
                    const errors = validateDetails();
                    setFieldErrors(errors);
                    if (Object.keys(errors).length) {
                        setError('Please fill in all required fields.');
                        return;
                    }
                    setError('');
                    setStep('payment');
                },
                disabled: !cart.length
            };
        }
        return null;
    })();

    const submit = async () => {
        if (!primaryService || !selectedSlot || !cart.length) return;
        setSubmitting(true);
        setError('');
        try {
            const answers = buildIntakeAnswers();
            const { email: bookEmail, phone: bookPhone } = contactPayload();
            const useTeamAssign = flowConfig.staffStep === 'team' && teamsEnabled;
            const assignedFromSlot =
                useTeamAssign && !stylistUserId ? selectedSlot.assignedUserId || null : stylistUserId;
            const result = await apiPost(`/api/public/${hostSlug}/${primaryService.slug}/book`, {
                customerName: customerName.trim(),
                email: bookEmail,
                phone: bookPhone,
                address: bookingAddress(),
                description: description.trim(),
                photoUrls: photoUrl.trim() ? [photoUrl.trim()] : [],
                intakeAnswers: answers,
                intakeType: 'instant',
                startAt: selectedSlot.startAt,
                endAt: selectedSlot.endAt,
                serviceSlugs: cart.map((s) => s.slug),
                ...(useTeamAssign && assignedFromSlot ? { assignedUserId: assignedFromSlot } : {})
            });
            if (result.url) {
                clearBookingDraft(hostSlug);
                window.location.href = result.url;
                return;
            }
            if (result.success || result.simulated) {
                clearBookingDraft(hostSlug);
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
    const showCartPanel = cart.length > 0 && !done;
    const chipCategories =
        showCatalog && catalogTab === 'treatments' ? treatmentCategories : categories;

    const cartPanel = showCartPanel ? (
        <aside className="lg:sticky lg:top-6 h-fit rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#F1F5F9] px-4 py-3 bg-[#FAFBFC]">
                <p className="text-sm font-black text-[#0F172A]">{flowConfig.labels.selectionTitle}</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                    {cart.length} service{cart.length === 1 ? '' : 's'} · {formatDuration(cartDuration)}
                </p>
            </div>
            <ul className="divide-y divide-[#F1F5F9] max-h-[min(50vh,360px)] overflow-y-auto">
                {cart.map((s) => (
                    <li key={selectedCatalog ? `catalog-${selectedCatalog.id}` : s.slug} className="flex items-start gap-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[#0F172A] leading-snug">{s.name}</p>
                            <p className="text-xs text-[#64748B] mt-0.5">
                                {formatDuration(s.durationMinutes)}
                                {Number(s.totalCents ?? s.depositCents) > 0
                                    ? ` · ${formatCents(s.totalCents ?? s.depositCents)}`
                                    : ''}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeFromCart(s.slug)}
                            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-red-600 hover:bg-red-50 shrink-0"
                            aria-label={`Remove ${s.name}`}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="border-t border-[#F1F5F9] px-4 py-3 space-y-3 bg-[#FAFBFC]">
                <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-[#64748B]">Total</span>
                    <span className="font-black text-[#0F172A]">
                        {cartTotal > 0 ? formatCents(cartTotal) : 'Free'}
                    </span>
                </div>
                {cartDeposit > 0 && cartDeposit !== cartTotal && (
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                        <span>Deposit due</span>
                        <span className="font-bold text-[#0F172A]">{formatCents(cartDeposit)}</span>
                    </div>
                )}
                {step !== 'services' && (
                    <button
                        type="button"
                        onClick={() => setStep('services')}
                        className="w-full text-left text-xs font-bold"
                        style={{ color: 'var(--brand-primary)' }}
                    >
                        + Add or change services
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

    if (!categorizedEventTypes.length) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-[#64748B]">
                {flowConfig.labels.emptyServices}
            </div>
        );
    }

    if (done) {
        const isRequestDone = flowConfig.requestMode && intakeMode === 'request';
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
                        {isRequestDone
                            ? 'Request submitted'
                            : industry.confirmationTitle || 'Appointment Confirmed!'}
                    </h2>
                    <p className="text-sm text-[#64748B] mt-2">
                        {cart.map((s) => s.name).join(', ')}
                        {isRequestDone && preferredAt
                            ? ` · Preferred ${new Date(preferredAt).toLocaleString('en-GB', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                              })}`
                            : selectedSlot
                              ? ` · ${new Date(selectedSlot.startAt).toLocaleString('en-GB', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}`
                              : ''}
                    </p>
                    {stylist && !isRequestDone && (
                        <p className="text-sm text-[#64748B] mt-1">With {stylist}</p>
                    )}
                    <p className="text-xs text-[#94A3B8] mt-4">
                        {isRequestDone
                            ? 'The clinic will confirm your visit.'
                            : 'Check your email for confirmation details.'}
                    </p>
                </div>
            </div>
        );
    }

    const renderServiceList = (items: ShellEventType[]) => (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
            {items.length === 0 && (
                <p className="px-6 py-12 text-center text-sm text-[#64748B]">
                    No services in this category.
                </p>
            )}
            <ul className="divide-y divide-[#F1F5F9]">
                {items.map((et) => {
                    const inCart =
                        !selectedCatalog && cart.some((s) => s.slug === et.slug);
                    const price = Number(et.totalCents ?? et.depositCents) || 0;
                    const open = detailsOpen[et.slug];
                    return (
                        <li key={et.slug} className="px-5 py-5 sm:px-6">
                            <div className="flex items-start justify-between gap-6">
                                <div className="min-w-0 flex-1">
                                    <p className="text-base font-bold text-[#0F172A]">{et.name}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748B]">
                                        <span>{formatDuration(et.durationMinutes)}</span>
                                        {et.description ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setDetailsOpen((d) => ({
                                                        ...d,
                                                        [et.slug]: !d[et.slug]
                                                    }))
                                                }
                                                className="font-semibold underline-offset-2 hover:underline"
                                                style={{ color: 'var(--brand-primary)' }}
                                            >
                                                {open ? 'Hide details' : 'Show details'}
                                            </button>
                                        ) : null}
                                    </div>
                                    {open && et.description && (
                                        <p className="mt-2 text-sm text-[#64748B] leading-relaxed max-w-2xl">
                                            {et.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2.5">
                                    <p className="text-base font-black text-[#0F172A]">
                                        {price > 0 ? formatCents(price) : 'Free'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => toggleService(et)}
                                        className={cn(
                                            'min-w-[96px] rounded-lg border px-4 py-2 text-sm font-bold transition',
                                            inCart
                                                ? 'text-[var(--brand-secondary)] border-transparent'
                                                : 'bg-white'
                                        )}
                                        style={
                                            inCart
                                                ? { background: 'var(--brand-primary)' }
                                                : {
                                                      borderColor: 'var(--brand-primary)',
                                                      color: 'var(--brand-primary)'
                                                  }
                                        }
                                    >
                                        {inCart ? 'Selected' : 'Select'}
                                    </button>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );

    const renderTreatmentList = () => (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
            {visibleTreatmentGroups.length === 0 && (
                <p className="px-6 py-12 text-center text-sm text-[#64748B]">
                    No treatments in this category.
                </p>
            )}
            <ul className="divide-y divide-[#F1F5F9]">
                {visibleTreatmentGroups.flatMap(([cat, items]) =>
                    items.map((item) => {
                        const inCart = selectedCatalog?.id === item.id;
                        const price = Number(item.priceCents) || 0;
                        return (
                            <li key={item.id} className="px-5 py-5 sm:px-6">
                                <div className="flex items-start justify-between gap-6">
                                    <div className="min-w-0 flex-1">
                                        {cat ? (
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                                                {cat}
                                            </p>
                                        ) : null}
                                        <p className="text-base font-bold text-[#0F172A]">{item.name}</p>
                                        {item.description ? (
                                            <p className="mt-1.5 text-sm text-[#64748B] leading-relaxed max-w-2xl">
                                                {item.description}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-2.5">
                                        <p className="text-base font-black text-[#0F172A]">
                                            {price > 0 ? formatCents(price) : 'Free'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (inCart) {
                                                    removeFromCart(slotEventSlug);
                                                } else {
                                                    selectTreatment(item);
                                                }
                                            }}
                                            className={cn(
                                                'min-w-[96px] rounded-lg border px-4 py-2 text-sm font-bold transition',
                                                inCart
                                                    ? 'text-[var(--brand-secondary)] border-transparent'
                                                    : 'bg-white'
                                            )}
                                            style={
                                                inCart
                                                    ? { background: 'var(--brand-primary)' }
                                                    : {
                                                          borderColor: 'var(--brand-primary)',
                                                          color: 'var(--brand-primary)'
                                                      }
                                            }
                                        >
                                            {inCart ? 'Selected' : 'Select'}
                                        </button>
                                    </div>
                                </div>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    );

    return (
        <div
            className="min-h-screen"
            style={{
                ...orgBrandStyle(host),
                background: '#F8FAFC',
                fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif"
            }}
        >
            {/* Branding nav — visible brand header */}
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
                            {isSalon ? (
                                <Scissors className="h-5 w-5 sm:h-6 sm:w-6" />
                            ) : (
                                <Calendar className="h-5 w-5 sm:h-6 sm:w-6" />
                            )}
                        </div>
                    )}
                    <div className="min-w-0 leading-snug">
                        <p className="truncate text-base font-extrabold tracking-tight text-[#0F172A] sm:text-lg">
                            {host.name}
                        </p>
                        {host.tradeType ? (
                            <p className="truncate text-xs font-medium text-[#64748B] sm:text-sm">
                                {host.tradeType}
                            </p>
                        ) : null}
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 sm:py-8 space-y-6">
                {/* Stepper centered under nav */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {visibleSteps.map((s, i) => {
                        const active = s.key === step;
                        const doneStep = visibleSteps.findIndex((x) => x.key === step) > i;
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
                        {/* ——— Property type (electricians) ——— */}
                        {step === 'property' && flowConfig.propertyStep && (
                            <PropertyStep
                                propertyType={propertyType}
                                propertyOther={propertyOther}
                                title={flowConfig.labels.propertyTitle}
                                hint={flowConfig.labels.propertyHint}
                                showContinue={!showCartPanel && Boolean(stickyCta)}
                                continueDisabled={stickyCta?.disabled}
                                continueLabel={stickyCta?.label || 'Continue'}
                                onPropertyTypeChange={(id) => {
                                    setPropertyType(id);
                                    if (id !== 'other') setPropertyOther('');
                                    setError('');
                                }}
                                onPropertyOtherChange={setPropertyOther}
                                onContinue={stickyCta?.action}
                            />
                        )}

                        {/* ——— Browse services ——— */}
                        {step === 'services' && (
                            <div className="space-y-5">
                                {flowConfig.propertyStep && (
                                    <button
                                        type="button"
                                        onClick={goBack}
                                        className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B]"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                                    </button>
                                )}
                                <div>
                                    <p
                                        className="text-[10px] font-black uppercase tracking-widest"
                                        style={{ color: 'var(--brand-primary)' }}
                                    >
                                        Book an appointment
                                    </p>
                                    <h2 className="text-2xl font-black text-[#0F172A] mt-1">
                                        {flowConfig.labels.browseTitle}
                                    </h2>
                                    {flowConfig.propertyStep && propertyType ? (
                                        <p className="text-sm text-[#64748B] mt-1">
                                            Property:{' '}
                                            <span className="font-semibold text-[#0F172A]">
                                                {propertyDisplayLabel(propertyType, propertyOther)}
                                            </span>
                                        </p>
                                    ) : null}
                                </div>

                                {showCatalog && (
                                    <div className="flex gap-2 p-1 rounded-xl bg-[#F1F5F9] w-fit">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCatalogTab('appointments');
                                                setActiveCategory('All');
                                            }}
                                            className={cn(
                                                'rounded-lg px-4 py-2 text-sm font-bold transition',
                                                catalogTab === 'appointments'
                                                    ? 'bg-white text-[#0F172A] shadow-sm'
                                                    : 'text-[#64748B]'
                                            )}
                                        >
                                            Appointments
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCatalogTab('treatments');
                                                setActiveCategory('All');
                                            }}
                                            className={cn(
                                                'rounded-lg px-4 py-2 text-sm font-bold transition',
                                                catalogTab === 'treatments'
                                                    ? 'bg-white text-[#0F172A] shadow-sm'
                                                    : 'text-[#64748B]'
                                            )}
                                        >
                                            Treatments
                                        </button>
                                    </div>
                                )}

                                {flowConfig.categories &&
                                    !(showCatalog && catalogTab === 'treatments'
                                        ? treatmentCategories.length === 0
                                        : categories.length === 0) && (
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
                                        {chipCategories.map((cat) => {
                                            const Icon = categoryIcon(cat);
                                            const selected = activeCategory === cat;
                                            const hasPicks =
                                                catalogTab === 'treatments' && showCatalog
                                                    ? Boolean(
                                                          selectedCatalog &&
                                                              (String(selectedCatalog.category || '').trim() ||
                                                                  'Treatments') === cat
                                                      )
                                                    : categoriesWithCart.has(cat);
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
                                                            style={{
                                                                background: 'var(--brand-primary)'
                                                            }}
                                                        >
                                                            <Check className="h-3 w-3" strokeWidth={3} />
                                                        </span>
                                                    )}
                                                    <Icon
                                                        className="mx-auto h-7 w-7"
                                                        style={{ color: 'var(--brand-primary)' }}
                                                    />
                                                    <p className="mt-2 text-xs font-bold text-[#0F172A] leading-tight">
                                                        {cat}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {showCatalog && catalogTab === 'treatments'
                                    ? renderTreatmentList()
                                    : renderServiceList(visibleServices)}
                            </div>
                        )}

                        {/* ——— Later steps ——— */}
                        {step !== 'services' && step !== 'property' && (
                            <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm p-5 sm:p-6 space-y-5">
                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B]"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                                </button>

                                {step === 'stylist' && needsStylist && (
                                    <>
                                        <div>
                                            <h2 className="font-black text-xl text-[#0F172A]">
                                                Who would you like?
                                            </h2>
                                            <p className="text-sm text-[#64748B] mt-1">
                                                Prefer someone specific or take the first available.
                                            </p>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {stylistOptions.map((opt) => (
                                                <button
                                                    key={`${opt.id}-${opt.label}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setStylist(opt.label);
                                                        setStylistUserId(opt.id || null);
                                                        setError('');
                                                        setStep('when');
                                                    }}
                                                    className={cn(
                                                        'w-full text-left rounded-xl border px-4 py-3 font-bold text-sm transition flex items-center gap-2',
                                                        stylist === opt.label
                                                            ? 'border-[var(--brand-primary)] text-[#0F172A] bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)]'
                                                            : 'border-[#E2E8F0] text-[#0F172A] hover:border-[var(--brand-primary)]'
                                                    )}
                                                >
                                                    <User className="w-4 h-4 text-[#64748B] shrink-0" />
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {step === 'when' && primaryService && (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="font-black text-xl text-[#0F172A]">
                                                Choose a time
                                            </h2>
                                            <p className="text-sm text-[#64748B] mt-1">
                                                {cart.length} service{cart.length === 1 ? '' : 's'} ·{' '}
                                                {formatDuration(cartDuration)}
                                                {stylist ? ` · ${stylist}` : ''}
                                            </p>
                                        </div>

                                        {flowConfig.requestMode && (
                                            <div className="flex gap-2 p-1 rounded-xl bg-[#F1F5F9] w-fit">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIntakeMode('instant');
                                                        setError('');
                                                    }}
                                                    className={cn(
                                                        'rounded-lg px-4 py-2 text-sm font-bold transition',
                                                        intakeMode === 'instant'
                                                            ? 'bg-white text-[#0F172A] shadow-sm'
                                                            : 'text-[#64748B]'
                                                    )}
                                                >
                                                    Book a time
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIntakeMode('request');
                                                        setSelectedSlot(null);
                                                        setError('');
                                                    }}
                                                    className={cn(
                                                        'rounded-lg px-4 py-2 text-sm font-bold transition',
                                                        intakeMode === 'request'
                                                            ? 'bg-white text-[#0F172A] shadow-sm'
                                                            : 'text-[#64748B]'
                                                    )}
                                                >
                                                    Request a visit/time
                                                </button>
                                            </div>
                                        )}

                                        {flowConfig.requestMode && intakeMode === 'request' ? (
                                            <label className="block max-w-md">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Preferred date & time *
                                                </span>
                                                <input
                                                    type="datetime-local"
                                                    value={preferredAt}
                                                    onChange={(e) => {
                                                        setPreferredAt(e.target.value);
                                                        setError('');
                                                    }}
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                />
                                            </label>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="rounded-2xl border border-[#E2E8F0] bg-[#FAFBFC] p-4 shadow-sm">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm">
                                                            <Calendar className="w-4 h-4 text-[var(--brand-primary)]" />{' '}
                                                            Pick a date
                                                        </h3>
                                                        <div className="flex gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setMonth((m) => {
                                                                        const d = new Date(
                                                                            m.year,
                                                                            m.month - 1,
                                                                            1
                                                                        );
                                                                        return {
                                                                            year: d.getFullYear(),
                                                                            month: d.getMonth()
                                                                        };
                                                                    })
                                                                }
                                                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                                                            >
                                                                <ChevronLeft className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setMonth((m) => {
                                                                        const d = new Date(
                                                                            m.year,
                                                                            m.month + 1,
                                                                            1
                                                                        );
                                                                        return {
                                                                            year: d.getFullYear(),
                                                                            month: d.getMonth()
                                                                        };
                                                                    })
                                                                }
                                                                className="p-1.5 rounded-lg border border-[#E2E8F0] bg-white"
                                                            >
                                                                <ChevronRight className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs font-bold text-[#64748B] mb-2">
                                                        {new Date(
                                                            month.year,
                                                            month.month,
                                                            1
                                                        ).toLocaleString('en-GB', {
                                                            month: 'long',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#64748B] mb-1">
                                                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(
                                                            (d) => (
                                                                <div key={d}>{d}</div>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-7 gap-1">
                                                        {days.map((d, i) => {
                                                            if (!d.inMonth || !d.date) {
                                                                return <div key={`pad-${i}`} />;
                                                            }
                                                            const selectable =
                                                                isDateSelectable(
                                                                    d.date,
                                                                    maxDaysAhead
                                                                ) && d.date >= todayStr();
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
                                                                            ? 'hover:bg-[var(--brand-secondary)] hover:text-white border border-[#E2E8F0] bg-white'
                                                                            : 'text-[#CBD5E1] cursor-not-allowed',
                                                                        selectedDate === d.date &&
                                                                            'bg-[var(--brand-secondary)] text-white border-[var(--brand-secondary)]'
                                                                    )}
                                                                >
                                                                    {d.date.slice(8)}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
                                                    <h3 className="font-bold text-[#0F172A] flex items-center gap-2 text-sm mb-3">
                                                        <Clock className="w-4 h-4 text-[var(--brand-primary)]" />
                                                        {selectedDate
                                                            ? new Date(
                                                                  selectedDate + 'T12:00:00'
                                                              ).toLocaleDateString('en-GB', {
                                                                  weekday: 'long',
                                                                  day: 'numeric',
                                                                  month: 'short'
                                                              })
                                                            : 'Select a date'}
                                                    </h3>
                                                    {!selectedDate && (
                                                        <p className="text-sm text-[#64748B] py-8 text-center">
                                                            Choose a date on the calendar.
                                                        </p>
                                                    )}
                                                    {selectedDate && loadingSlots && (
                                                        <p className="text-sm text-[#64748B] py-8 text-center">
                                                            Loading times…
                                                        </p>
                                                    )}
                                                    {selectedDate &&
                                                        !loadingSlots &&
                                                        !hasAvailabilityRules && (
                                                            <p className="text-sm text-[#64748B] py-8 text-center">
                                                                No booking times set yet.
                                                            </p>
                                                        )}
                                                    {selectedDate &&
                                                        !loadingSlots &&
                                                        hasAvailabilityRules &&
                                                        daySlots.length === 0 && (
                                                            <p className="text-sm text-[#64748B] py-8 text-center">
                                                                No times — try another date.
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
                                                                    selectedSlot?.startAt ===
                                                                        slot.startAt
                                                                        ? 'bg-[var(--brand-secondary)] text-white border-[var(--brand-secondary)]'
                                                                        : 'border-[#E2E8F0] hover:border-[var(--brand-primary)]'
                                                                )}
                                                            >
                                                                {new Date(
                                                                    slot.startAt
                                                                ).toLocaleTimeString('en-GB', {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {step === 'details' && (
                                    <>
                                        <div>
                                            <h2 className="font-black text-xl text-[#0F172A]">
                                                {flowConfig.labels.details}
                                            </h2>
                                            <p className="text-sm text-[#64748B] mt-1">
                                                We’ll use these details for your confirmation.
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
                                                {detailsTouched && fieldErrors.customerName && (
                                                    <p className="text-xs text-red-600 mt-1">
                                                        {fieldErrors.customerName}
                                                    </p>
                                                )}
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Email{requireBothContacts ? ' *' : ' (or phone)'}
                                                </span>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="name@email.com"
                                                    autoComplete="email"
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                />
                                                {detailsTouched && fieldErrors.email && (
                                                    <p className="text-xs text-red-600 mt-1">
                                                        {fieldErrors.email}
                                                    </p>
                                                )}
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Phone{requireBothContacts ? ' *' : ' (or email)'}
                                                </span>
                                                <input
                                                    type="tel"
                                                    inputMode="numeric"
                                                    value={phone}
                                                    onChange={(e) =>
                                                        setPhone(restrictPhoneInput(e.target.value, 11))
                                                    }
                                                    placeholder="07…"
                                                    autoComplete="tel"
                                                    maxLength={11}
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                                />
                                                {detailsTouched && fieldErrors.phone && (
                                                    <p className="text-xs text-red-600 mt-1">
                                                        {fieldErrors.phone}
                                                    </p>
                                                )}
                                            </label>
                                            {flowConfig.requirePostcode && (
                                                <label className="block">
                                                    <span className="text-xs font-bold text-[#64748B]">
                                                        Postcode *
                                                    </span>
                                                    <input
                                                        value={postcode}
                                                        onChange={(e) => setPostcode(e.target.value)}
                                                        placeholder="e.g. M1 1AE"
                                                        autoComplete="postal-code"
                                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm uppercase"
                                                    />
                                                    {detailsTouched && fieldErrors.postcode && (
                                                        <p className="text-xs text-red-600 mt-1">
                                                            {fieldErrors.postcode}
                                                        </p>
                                                    )}
                                                </label>
                                            )}
                                            {otherFields.map((field) => (
                                                <label key={field.id} className="block">
                                                    <span className="text-xs font-bold text-[#64748B]">
                                                        {field.label}
                                                    </span>
                                                    <select
                                                        value={intakeAnswers[field.id] || ''}
                                                        onChange={(e) =>
                                                            setIntakeAnswers((a) => ({
                                                                ...a,
                                                                [field.id]: e.target.value
                                                            }))
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
                                                        <p className="text-xs text-red-600 mt-1">
                                                            {fieldErrors[field.id]}
                                                        </p>
                                                    )}
                                                </label>
                                            ))}
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Notes
                                                </span>
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
                                                        <p className="text-xs text-[#64748B] mt-1">
                                                            Uploading…
                                                        </p>
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
                                    </>
                                )}

                                {step === 'payment' && primaryService && selectedSlot && (
                                    <>
                                        <div>
                                            <h2 className="font-black text-xl text-[#0F172A]">
                                                Confirm & pay deposit
                                            </h2>
                                            <p className="text-sm text-[#64748B] mt-1">
                                                Review your appointment before paying.
                                            </p>
                                        </div>
                                        <div className="max-w-lg rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2 text-sm">
                                            <div>
                                                <span className="font-bold text-[#0F172A]">Services:</span>
                                                <ul className="mt-1.5 space-y-1">
                                                    {cart.map((s) => (
                                                        <li
                                                            key={
                                                                selectedCatalog
                                                                    ? `pay-catalog-${selectedCatalog.id}`
                                                                    : s.slug
                                                            }
                                                            className="flex justify-between gap-2 text-[#64748B]"
                                                        >
                                                            <span>
                                                                {s.name}{' '}
                                                                <span className="text-[11px]">
                                                                    ({formatDuration(s.durationMinutes)})
                                                                </span>
                                                            </span>
                                                            <span className="font-bold text-[#0F172A] shrink-0">
                                                                {Number(s.totalCents || s.depositCents) >
                                                                0
                                                                    ? formatCents(
                                                                          s.totalCents || s.depositCents
                                                                      )
                                                                    : 'Free'}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            {needsStylist && stylist ? (
                                                <p>
                                                    <span className="font-bold text-[#0F172A]">
                                                        {flowConfig.labels.staff}:
                                                    </span>{' '}
                                                    {stylist}
                                                </p>
                                            ) : null}
                                            {flowConfig.propertyStep && propertyType ? (
                                                <p>
                                                    <span className="font-bold text-[#0F172A]">
                                                        Property:
                                                    </span>{' '}
                                                    {propertyDisplayLabel(propertyType, propertyOther)}
                                                </p>
                                            ) : null}
                                            {flowConfig.requirePostcode && postcode.trim() ? (
                                                <p>
                                                    <span className="font-bold text-[#0F172A]">
                                                        Postcode:
                                                    </span>{' '}
                                                    {postcode.trim()}
                                                </p>
                                            ) : null}
                                            <p>
                                                <span className="font-bold text-[#0F172A]">When:</span>{' '}
                                                {new Date(selectedSlot.startAt).toLocaleString(
                                                    'en-GB',
                                                    {
                                                        weekday: 'short',
                                                        day: 'numeric',
                                                        month: 'short',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    }
                                                )}
                                                {cartDuration
                                                    ? ` · ${formatDuration(cartDuration)}`
                                                    : ''}
                                            </p>
                                            <p>
                                                <span className="font-bold text-[#0F172A]">Deposit:</span>{' '}
                                                {cartDeposit > 0 ? formatCents(cartDeposit) : '£0'}
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
                                                : cartDeposit > 0
                                                  ? `Pay ${formatCents(cartDeposit)} deposit`
                                                  : 'Confirm appointment'}
                                        </button>
                                        <p className="text-[11px] text-[#94A3B8] max-w-lg">
                                            {paymentsMode === 'stripe' && stripePaymentsReady
                                                ? 'You will be redirected to Stripe Checkout to pay securely.'
                                                : paymentsMode === 'stripe'
                                                  ? 'Waiting for business Stripe connection.'
                                                  : 'Stripe is not configured — booking may complete in test mode.'}
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {}
                    {cartPanel}
                </div>
            </div>
        </div>
    );
}
