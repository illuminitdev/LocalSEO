import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Bell,
    BookOpen,
    Calendar,
    Check,
    CreditCard,
    Droplets,
    Flame,
    LayoutGrid,
    ListOrdered,
    LogOut,
    Paintbrush,
    Pencil,
    Plus,
    Scissors,
    Settings,
    ShieldAlert,
    Syringe,
    Trash2,
    Wallet,
    Wrench,
    X,
    Utensils,
    type LucideIcon
} from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, cn, formatCents } from '../../../shared/utils';
import AvailabilityEditor, { type AvailabilitySavePayload, type AvailabilitySettings } from './AvailabilityEditor';
import {
    getBookingPreset,
    normalizeBookingIndustryId,
    resolveSalonServiceCategory,
    SALON_SERVICE_CATEGORIES
} from './bookingIndustryPresets';
import RestaurantMenuEditor from '../restaurants/RestaurantMenuEditor';

const SALON_CATEGORY_ICONS: Record<string, LucideIcon> = {
    Hair: Scissors,
    Beauty: Droplets,
    Aesthetics: Syringe,
    Makeup: Paintbrush,
    Courses: BookOpen,
    Other: LayoutGrid
};

function salonCategoryIcon(category: string): LucideIcon {
    return SALON_CATEGORY_ICONS[category] || LayoutGrid;
}

type Tab = 'events' | 'menu' | 'availability' | 'integrations' | 'profile' | 'reminders';

type EventTemplateKey = 'standard' | 'emergency' | 'serious';

const EVENT_TEMPLATES: Record<
    EventTemplateKey,
    { name: string; description: string; durationMinutes: number; icon: typeof Wrench; accent: string; border: string }
> = {
    standard: {
        name: 'Standard Visit',
        description: 'Regular scheduled appointment',
        durationMinutes: 60,
        icon: Wrench,
        accent: 'text-[#0F172A]',
        border: 'border-[#E2E8F0] hover:border-[#0F172A]/30'
    },
    emergency: {
        name: 'Emergency Callout',
        description: 'Urgent same-day service',
        durationMinutes: 90,
        icon: Flame,
        accent: 'text-red-600',
        border: 'border-red-200 hover:border-red-400'
    },
    serious: {
        name: 'Serious Repair',
        description: 'Complex or major work',
        durationMinutes: 120,
        icon: ShieldAlert,
        accent: 'text-amber-600',
        border: 'border-amber-200 hover:border-amber-400'
    }
};

function templateKeyForName(name: string): EventTemplateKey | null {
    const lower = name.toLowerCase();
    if (lower.includes('emergency')) return 'emergency';
    if (lower.includes('serious')) return 'serious';
    if (lower.includes('standard')) return 'standard';
    return null;
}

function poundsToCents(value: string) {
    const n = parseFloat(value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
}


function poundsToCentsAllowZero(value: string): number | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const n = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
}

type Props = {
    embedded?: boolean;
    onBack?: () => void;
    onLoggedOut?: () => void;
    initialDashboard?: {
        organization?: any;
        eventTypes?: any[];
        availabilityDateRules?: any[];
        availabilityWeeklyRules?: any[];
    } | null;
    onRefresh?: () => void;
};

export default function BookingSettingsPanel({ embedded, onBack, onLoggedOut, initialDashboard, onRefresh }: Props) {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [eventTypes, setEventTypes] = useState<any[]>([]);
    const [dateRules, setDateRules] = useState<any[]>([]);
    const [weeklyRules, setWeeklyRules] = useState<any[]>([]);
    const [settings, setSettings] = useState<AvailabilitySettings>({
        timezone: 'Europe/London',
        minNoticeHours: 2,
        maxDaysAhead: 60,
        bufferMinutes: 15
    });
    const [org, setOrg] = useState<any>(null);
    const fromTrade = org?.trade_type ? getBookingPreset(org.trade_type).id : null;
    const fromCol = normalizeBookingIndustryId(org?.booking_industry_id);
    
    const industryId =
        fromTrade === 'dentists'
            ? 'dentists'
            : fromTrade === 'salons'
              ? 'salons'
              : fromCol || fromTrade;
    const isRestaurant = industryId === 'restaurants';
    const isDentists = industryId === 'dentists';
    const isSalons = industryId === 'salons';
    const hasCatalogTab = isRestaurant || isDentists;
    const tab: Tab =
        tabParam === 'availability' ||
        tabParam === 'integrations' ||
        tabParam === 'profile' ||
        tabParam === 'reminders' ||
        (tabParam === 'menu' && hasCatalogTab)
            ? (tabParam as Tab)
            : 'events';
    const [googleConnected, setGoogleConnected] = useState(false);
    const [stripeStatus, setStripeStatus] = useState<{
        configured?: boolean;
        connected?: boolean;
        ready?: boolean;
        chargesEnabled?: boolean;
        detailsSubmitted?: boolean;
        accountId?: string | null;
    } | null>(null);
    const [stripeBusy, setStripeBusy] = useState(false);
    const [qboStatus, setQboStatus] = useState<{
        configured?: boolean;
        connected?: boolean;
        realmId?: string | null;
        connectedAt?: string | null;
    } | null>(null);
    const [qboBusy, setQboBusy] = useState(false);
    const [zapierUrl, setZapierUrl] = useState('');
    const [zapierSecret, setZapierSecret] = useState('');
    const [zapierBusy, setZapierBusy] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EventTemplateKey>('standard');
    const [newDepositPounds, setNewDepositPounds] = useState('60');
    const [addingEvent, setAddingEvent] = useState(false);
    const [newSlotName, setNewSlotName] = useState('');
    const [newSlotDuration, setNewSlotDuration] = useState('60');
    const [newSlotDeposit, setNewSlotDeposit] = useState('0');
    const [newSlotPrice, setNewSlotPrice] = useState('45');
    const [newSlotCategory, setNewSlotCategory] = useState<string>(SALON_SERVICE_CATEGORIES[0]);
    const [customCategories, setCustomCategories] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDepositPounds, setEditDepositPounds] = useState('');
    const [editPricePounds, setEditPricePounds] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editName, setEditName] = useState('');
    const [editDuration, setEditDuration] = useState('60');
    const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
    const [renameCategoryValue, setRenameCategoryValue] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingAvailability, setSavingAvailability] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [teamsEnabled, setTeamsEnabled] = useState(false);
    const [availScope, setAvailScope] = useState<'org' | string>('org');
    const [bookableMembers, setBookableMembers] = useState<any[]>([]);
    const [loadingMemberAvail, setLoadingMemberAvail] = useState(false);

    const applyDashboard = (dash: NonNullable<Props['initialDashboard']>) => {
        setOrg(dash.organization);
        setEventTypes(dash.eventTypes || []);
        setDateRules(dash.availabilityDateRules || []);
        setWeeklyRules(dash.availabilityWeeklyRules || []);
        setTeamsEnabled(Boolean(dash.teamsEnabled));
        setSettings({
            timezone: dash.organization?.timezone || 'Europe/London',
            minNoticeHours: dash.organization?.min_notice_hours || 2,
            maxDaysAhead: dash.organization?.max_days_ahead || 60,
            bufferMinutes: dash.organization?.buffer_minutes || 15
        });
        setZapierUrl(dash.organization?.zapier_webhook_url || '');
        setZapierSecret(dash.organization?.zapier_secret || '');
    };

    useEffect(() => {
        if (!org?.id) return;
        apiGet('/api/host/team')
            .then((res) => {
                setBookableMembers(res.members || []);
                if (res.teamsEnabled != null) setTeamsEnabled(Boolean(res.teamsEnabled));
            })
            .catch(() => {});
    }, [org?.id]);

    const loadAvailabilityScope = async (scope: 'org' | string) => {
        setLoadingMemberAvail(true);
        setError('');
        try {
            const qs = scope === 'org' ? '' : `?userId=${encodeURIComponent(scope)}`;
            const res = await apiGet(`/api/host/availability${qs}`);
            setDateRules(res.dateRules || []);
            setWeeklyRules(res.weeklyRules || []);
            if (res.settings) {
                setSettings({
                    timezone: res.settings.timezone || settings.timezone,
                    minNoticeHours: res.settings.min_notice_hours ?? settings.minNoticeHours,
                    maxDaysAhead: res.settings.max_days_ahead ?? settings.maxDaysAhead,
                    bufferMinutes: res.settings.buffer_minutes ?? settings.bufferMinutes
                });
            }
            setAvailScope(scope);
        } catch (e: any) {
            setError(e.message || 'Could not load availability');
        } finally {
            setLoadingMemberAvail(false);
        }
    };

    useEffect(() => {
        if (initialDashboard?.organization) {
            applyDashboard(initialDashboard);
            setLoading(false);
            setError('');
        } else {
            apiGet('/api/host/dashboard')
                .then((dash) => {
                    applyDashboard(dash);
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
        }

        apiGet('/api/integrations/google/status')
            .then((g) => setGoogleConnected(g.connected))
            .catch(() => setGoogleConnected(false));

        apiGet('/api/host/stripe/status')
            .then((s) => setStripeStatus(s))
            .catch(() => setStripeStatus({ configured: false, connected: false, ready: false }));

        apiGet('/api/integrations/qbo/status')
            .then((q) => setQboStatus(q))
            .catch(() => setQboStatus({ configured: false, connected: false }));
    }, [initialDashboard]);

    useEffect(() => {
        const stripeParam = searchParams.get('stripe');
        if (stripeParam !== 'return' && stripeParam !== 'refresh') return;

        apiGet('/api/host/stripe/status')
            .then((s) => setStripeStatus(s))
            .catch(() => {});

        const next = new URLSearchParams(searchParams);
        next.delete('stripe');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const setTab = (t: Tab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', t);
        if (embedded) next.set('panel', 'settings');
        setSearchParams(next);
    };

    const existingTemplateKeys = new Set(
        eventTypes.map((et) => templateKeyForName(et.name)).filter(Boolean) as EventTemplateKey[]
    );

    const salonCategoryOptions = useMemo(() => {
        const fromEvents = eventTypes
            .map((et) => resolveSalonServiceCategory(et.name, et.category))
            .filter(Boolean);
        return Array.from(
            new Set([
                ...SALON_SERVICE_CATEGORIES,
                ...customCategories,
                ...fromEvents
            ])
        );
    }, [eventTypes, customCategories]);

    const rememberCategory = (raw: string) => {
        const cat = String(raw || '').trim();
        if (!cat) return '';
        if (!(SALON_SERVICE_CATEGORIES as readonly string[]).includes(cat)) {
            setCustomCategories((prev) => (prev.includes(cat) ? prev : [...prev, cat]));
        }
        return cat;
    };

    const saveAvailability = async (payload: AvailabilitySavePayload) => {
        setSavingAvailability(true);
        setError('');
        try {
            await apiPut('/api/host/availability', {
                settings:
                    availScope === 'org'
                        ? {
                              timezone: payload.settings.timezone,
                              minNoticeHours: payload.settings.minNoticeHours,
                              maxDaysAhead: payload.settings.maxDaysAhead,
                              bufferMinutes: payload.settings.bufferMinutes
                          }
                        : undefined,
                weeklyRules: payload.weeklyRules,
                dateRules: payload.dateRules,
                ...(availScope !== 'org' ? { userId: availScope } : {})
            });
            setDateRules(payload.dateRules);
            setWeeklyRules(payload.weeklyRules);
            if (availScope === 'org') setSettings(payload.settings);
            setSaved(true);
            onRefresh?.();
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            setError(e.message);
            throw e;
        } finally {
            setSavingAvailability(false);
        }
    };

    const addEvent = async () => {
        const depositCents = poundsToCents(newDepositPounds);
        if (!depositCents) {
            setError('Enter a valid deposit amount in pounds.');
            return;
        }
        if (existingTemplateKeys.has(selectedTemplate)) {
            setError(`${EVENT_TEMPLATES[selectedTemplate].name} already exists — use the pencil icon to edit it.`);
            return;
        }
        const tpl = EVENT_TEMPLATES[selectedTemplate];
        setAddingEvent(true);
        setError('');
        try {
            const et = await apiPost('/api/host/event-types', {
                name: tpl.name,
                description: tpl.description,
                durationMinutes: tpl.durationMinutes,
                depositCents,
                totalCents: depositCents
            });
            setEventTypes((prev) => [...prev, et]);
            setNewDepositPounds(selectedTemplate === 'standard' ? '60' : selectedTemplate === 'emergency' ? '80' : '100');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setAddingEvent(false);
        }
    };

    const addAppointmentSlot = async () => {
        const name = newSlotName.trim();
        if (!name) {
            setError(isSalons ? 'Enter a name for the service.' : 'Enter a name for the appointment slot.');
            return;
        }
        const durationMinutes = parseInt(newSlotDuration, 10);
        if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
            setError('Duration must be at least 15 minutes.');
            return;
        }
        const depositCents = poundsToCentsAllowZero(newSlotDeposit);
        if (depositCents == null) {
            setError('Enter a valid deposit (0 is allowed for free slots).');
            return;
        }
        const priceCents = isSalons
            ? poundsToCentsAllowZero(newSlotPrice)
            : depositCents;
        if (isSalons && (priceCents == null || priceCents < depositCents)) {
            setError('Enter a service price that is at least the deposit amount.');
            return;
        }
        const category = isSalons ? rememberCategory(newSlotCategory) : '';
        if (isSalons && !category) {
            setError('Enter or pick a category (e.g. Hair, Beauty, or your own).');
            return;
        }
        setAddingEvent(true);
        setError('');
        try {
            const et = await apiPost('/api/host/event-types', {
                name,
                description: name,
                durationMinutes,
                depositCents,
                totalCents: isSalons ? priceCents : depositCents,
                ...(isSalons ? { category } : {})
            });
            setEventTypes((prev) => [...prev, et]);
            setNewSlotName('');
            setNewSlotDuration('60');
            setNewSlotDeposit('0');
            setNewSlotPrice('45');
            if (isSalons) setNewSlotCategory(category || SALON_SERVICE_CATEGORIES[0]);
        } catch (e: any) {
            setError(e.message || (isSalons ? 'Could not add service' : 'Could not add appointment slot'));
        } finally {
            setAddingEvent(false);
        }
    };

    const startEdit = (et: any) => {
        setEditingId(et.id);
        setEditDepositPounds((et.deposit_cents / 100).toFixed(2).replace(/\.00$/, ''));
        setEditPricePounds(
            ((et.total_cents ?? et.deposit_cents) / 100).toFixed(2).replace(/\.00$/, '')
        );
        setEditName(et.name || '');
        setEditDuration(String(et.duration_minutes || 60));
        setEditCategory(resolveSalonServiceCategory(et.name, et.category) || SALON_SERVICE_CATEGORIES[0]);
        setError('');
    };

    const saveEdit = async (et: any) => {
        const depositCents = poundsToCentsAllowZero(editDepositPounds);
        if (depositCents == null || depositCents < 0) {
            setError('Enter a valid deposit amount (0 allowed).');
            return;
        }
        const priceCents = isSalons
            ? poundsToCentsAllowZero(editPricePounds)
            : depositCents;
        if (isSalons && (priceCents == null || priceCents < depositCents)) {
            setError('Service price must be at least the deposit.');
            return;
        }
        const durationMinutes = parseInt(editDuration, 10);
        if (isSalons && (!Number.isFinite(durationMinutes) || durationMinutes < 15)) {
            setError('Duration must be at least 15 minutes.');
            return;
        }
        const name = editName.trim();
        if (isSalons && !name) {
            setError('Service name is required.');
            return;
        }
        const category = isSalons ? rememberCategory(editCategory) : undefined;
        if (isSalons && !category) {
            setError('Category is required.');
            return;
        }
        setSavingEdit(true);
        setError('');
        try {
            const updated = await apiPatch(`/api/host/event-types/${et.id}`, {
                depositCents,
                totalCents: isSalons ? priceCents : depositCents,
                ...(isSalons
                    ? {
                          name,
                          description: name,
                          durationMinutes,
                          category
                      }
                    : {})
            });
            setEventTypes((prev) => prev.map((x) => (x.id === et.id ? updated : x)));
            setEditingId(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSavingEdit(false);
        }
    };

    const renameSalonCategory = async (fromCat: string) => {
        const toCat = rememberCategory(renameCategoryValue);
        if (!toCat) {
            setError('Enter a new category name.');
            return;
        }
        if (toCat === fromCat) {
            setRenamingCategory(null);
            return;
        }
        setSavingEdit(true);
        setError('');
        try {
            const targets = eventTypes.filter(
                (et) => resolveSalonServiceCategory(et.name, et.category) === fromCat
            );
            const updatedRows = await Promise.all(
                targets.map((et) =>
                    apiPatch(`/api/host/event-types/${et.id}`, {
                        category: toCat
                    })
                )
            );
            const byId = new Map(updatedRows.map((row: any) => [row.id, row]));
            setEventTypes((prev) => prev.map((x) => byId.get(x.id) || x));
            if (newSlotCategory === fromCat) setNewSlotCategory(toCat);
            setRenamingCategory(null);
            setRenameCategoryValue('');
        } catch (e: any) {
            setError(e.message || 'Could not rename category');
        } finally {
            setSavingEdit(false);
        }
    };

    const deleteEventType = async (et: any) => {
        if (!window.confirm(`Delete “${et.name}”? This cannot be undone.`)) return;
        setError('');
        try {
            await apiDelete(`/api/host/event-types/${et.id}`);
            setEventTypes((prev) => prev.filter((x) => x.id !== et.id));
            if (editingId === et.id) setEditingId(null);
        } catch (e: any) {
            setError(e.message || 'Could not delete service');
        }
    };

    const saveProfile = async () => {
        setSavingProfile(true);
        setError('');
        try {
            await apiPatch('/api/host/organization', {
                name: org.name,
                hostName: org.host_name,
                tradeType: org.trade_type,
                phone: org.phone,
                email: org.email,
                serviceArea: org.service_area,
                remindersEnabled: org.reminders_enabled !== false,
                smsEnabled: Boolean(org.sms_enabled),
                reminderVisitHours: org.reminder_visit_hours ?? 24,
                reminderPostJobHours: org.reminder_post_job_hours ?? 24,
                reminderInvoiceDays: org.reminder_invoice_days ?? 3
            });
            setSaved(true);
            setSavingProfile(false);
            setTimeout(() => setSaved(false), 2000);
            onRefresh?.();
        } catch (e: any) {
            setError(e.message);
            setSavingProfile(false);
        }
    };

    const logoutBooking = async () => {
        setLoggingOut(true);
        setError('');
        try {
            await apiPost('/api/host/logout', {});
            onLoggedOut?.();
        } catch (e: any) {
            setError(e.message || 'Could not leave booking');
            setLoggingOut(false);
        }
    };

    const connectGoogle = async () => {
        const { url } = await apiGet('/api/integrations/google/start');
        window.location.href = url;
    };

    const connectQbo = async () => {
        setQboBusy(true);
        setError('');
        try {
            const { url } = await apiGet('/api/integrations/qbo/start');
            window.location.href = url;
        } catch (e: any) {
            setError(e.message || 'Could not start QuickBooks connect');
            setQboBusy(false);
        }
    };

    const disconnectQbo = async () => {
        setQboBusy(true);
        try {
            await apiPost('/api/integrations/qbo/disconnect', {});
            setQboStatus((s) => ({ ...(s || {}), connected: false, realmId: null }));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setQboBusy(false);
        }
    };

    const saveZapier = async () => {
        setZapierBusy(true);
        setError('');
        try {
            const updated = await apiPatch('/api/host/organization', {
                zapierWebhookUrl: zapierUrl.trim(),
                zapierSecret: zapierSecret.trim()
            });
            setOrg(updated);
            setZapierUrl(updated.zapier_webhook_url || '');
            setZapierSecret(updated.zapier_secret || '');
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setZapierBusy(false);
        }
    };

    const connectStripe = async () => {
        setStripeBusy(true);
        setError('');
        try {
            const { url } = await apiPost('/api/host/stripe/connect');
            if (url) window.location.href = url;
            else throw new Error('No Stripe onboarding URL returned');
        } catch (e: any) {
            setError(e.message || 'Could not start Stripe Connect');
            setStripeBusy(false);
        }
    };

    const openStripeDashboard = async () => {
        setStripeBusy(true);
        setError('');
        try {
            const { url } = await apiPost('/api/host/stripe/dashboard');
            if (url) window.location.href = url;
            else throw new Error('No Stripe dashboard URL returned');
        } catch (e: any) {
            setError(e.message || 'Could not open Stripe Express Dashboard');
            setStripeBusy(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center py-16 text-[#64748B]">Loading settings…</div>;

    return (
        <div className={embedded ? 'space-y-4' : 'min-h-screen bg-[#F8FAFC]'}>
            {!embedded && (
                <header className="bg-[#0F172A] text-white px-4 py-4">
                    <div className="max-w-5xl mx-auto flex items-center gap-3">
                        <button type="button" onClick={onBack} className="p-2 rounded-xl bg-white/10">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                            <p className="text-xs text-white/50 uppercase">Settings</p>
                            <h1 className="font-black">{org?.name}</h1>
                        </div>
                    </div>
                </header>
            )}

            <div className={embedded ? 'space-y-4' : 'max-w-5xl mx-auto px-4 py-6 space-y-4'}>
                {embedded && (
                    <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#E2E8F0]">
                        <div>
                            <p className="text-xs font-bold uppercase text-[#64748B]">Schedule settings</p>
                            <h2 className="font-black text-lg text-[#0F172A]">{org?.name}</h2>
                        </div>
                        {onBack && (
                            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B]">
                                <ArrowLeft className="w-3.5 h-3.5" /> Back to board
                            </button>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {(
                        [
                            [
                                'events',
                                isRestaurant
                                    ? 'Book a table'
                                    : isSalons
                                      ? 'Services'
                                      : isDentists
                                        ? 'Event types'
                                        : 'Event types',
                                Settings
                            ],
                            ...(isRestaurant
                                ? [['menu', 'Menu', Utensils] as const]
                                : isDentists
                                  ? [['menu', 'Treatments', ListOrdered] as const]
                                  : []),
                            ['availability', 'Availability', Calendar],
                            ['integrations', 'Integrations', CreditCard],
                            ['reminders', 'Reminders', Bell],
                            ['profile', 'Profile', Wallet]
                        ] as const
                    ).map(([key, label, Icon]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key as Tab)}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border',
                                tab === key ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white border-[#E2E8F0] text-[#64748B]'
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                {saved && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2">Saved.</p>}

                {tab === 'menu' && hasCatalogTab && (
                    <RestaurantMenuEditor
                        org={org}
                        onOrgUpdated={setOrg}
                        variant={isDentists ? 'priceList' : 'restaurant'}
                        sections={isDentists ? 'form' : 'all'}
                    />
                )}

                {tab === 'events' && (
                    <div className="space-y-4">
                        {isDentists && (
                            <RestaurantMenuEditor
                                key={`price-list-${tab}`}
                                org={org}
                                onOrgUpdated={setOrg}
                                variant="priceList"
                                sections="list"
                            />
                        )}

                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                            <div>
                                <h2 className="font-bold text-[#0F172A]">
                                    {isRestaurant
                                        ? 'Table booking'
                                        : isDentists
                                          ? 'Appointment slots'
                                          : isSalons
                                            ? 'Your salon services'
                                            : 'Your services'}
                                </h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    {isRestaurant
                                        ? 'Guests who choose Book a table pick a date/time against this offer. Food menu and online orders are managed under the Menu tab.'
                                        : isDentists
                                          ? 'Calendar slots guests book against (e.g. Free Consultation, Routine Check-up). Add more below if you need them.'
                                          : isSalons
                                            ? 'Group services by category (Hair, Beauty, Aesthetics, Makeup). Customers pick a category, then a service, then a stylist and time.'
                                            : 'Set the deposit customers pay when booking each service type.'}
                                </p>
                            </div>

                            {eventTypes.length === 0 && (
                                <p className="text-sm text-[#94A3B8] border border-dashed border-[#E2E8F0] rounded-xl px-4 py-6 text-center">
                                    {isDentists
                                        ? 'No appointment slots yet — add one below.'
                                        : isSalons
                                          ? 'No services yet — add your first category and service below (e.g. Hair, Facial).'
                                          : 'No services yet — add Standard, Emergency, or Serious below.'}
                                </p>
                            )}

                            {isSalons ? (
                                <div className="space-y-6">
                                    {(
                                        [
                                            ...SALON_SERVICE_CATEGORIES,
                                            ...Array.from(
                                                new Set(
                                                    eventTypes
                                                        .map((et) =>
                                                            resolveSalonServiceCategory(et.name, et.category)
                                                        )
                                                        .filter(
                                                            (c) =>
                                                                c &&
                                                                !(SALON_SERVICE_CATEGORIES as readonly string[]).includes(
                                                                    c
                                                                )
                                                        )
                                                )
                                            ),
                                            ...(eventTypes.some(
                                                (et) => !resolveSalonServiceCategory(et.name, et.category)
                                            )
                                                ? ['Other']
                                                : [])
                                        ] as string[]
                                    )
                                        .filter((cat, i, arr) => arr.indexOf(cat) === i)
                                        .map((cat) => {
                                            const items = eventTypes.filter((et) => {
                                                const c = resolveSalonServiceCategory(et.name, et.category);
                                                if (cat === 'Other') return !c;
                                                return c === cat;
                                            });
                                            if (!items.length && !(SALON_SERVICE_CATEGORIES as readonly string[]).includes(cat)) {
                                                return null;
                                            }
                                            if (!items.length) return null;
                                            const CatIcon = salonCategoryIcon(cat);
                                            return (
                                                <div key={cat} className="space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        {renamingCategory === cat ? (
                                                            <div className="flex flex-wrap items-center gap-2 flex-1">
                                                                <input
                                                                    value={renameCategoryValue}
                                                                    onChange={(e) =>
                                                                        setRenameCategoryValue(e.target.value)
                                                                    }
                                                                    className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-bold"
                                                                    placeholder="Category name"
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    type="button"
                                                                    disabled={savingEdit}
                                                                    onClick={() => renameSalonCategory(cat)}
                                                                    className="px-3 py-1.5 rounded-lg bg-[#0F172A] text-white text-xs font-bold"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setRenamingCategory(null);
                                                                        setRenameCategoryValue('');
                                                                    }}
                                                                    className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-bold text-[#64748B]"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-xs font-bold uppercase tracking-wide text-[#64748B] inline-flex items-center gap-1.5">
                                                                    <CatIcon className="w-3.5 h-3.5" />
                                                                    {cat}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setRenamingCategory(cat);
                                                                        setRenameCategoryValue(cat);
                                                                    }}
                                                                    className="text-[11px] font-bold text-[#64748B] hover:text-[#0F172A] inline-flex items-center gap-1"
                                                                    title="Rename category"
                                                                >
                                                                    <Pencil className="w-3 h-3" /> Rename
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {items.map((et) => {
                                                            const isEditing = editingId === et.id;
                                                            const Icon = salonCategoryIcon(
                                                                resolveSalonServiceCategory(et.name, et.category)
                                                            );
                                                            return (
                                                                <div
                                                                    key={et.id}
                                                                    className="rounded-xl border border-[#E2E8F0] p-4 flex flex-col gap-2 bg-white"
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <div className="w-9 h-9 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0 text-[#0F172A]">
                                                                                <Icon className="w-4 h-4" />
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <p className="font-bold text-[#0F172A] truncate">
                                                                                    {et.name}
                                                                                </p>
                                                                                <p className="text-[10px] text-[#64748B]">
                                                                                    {et.duration_minutes} min
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        {!isEditing && (
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => startEdit(et)}
                                                                                    className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:border-[#0F172A]/30"
                                                                                    title="Edit service"
                                                                                >
                                                                                    <Pencil className="w-4 h-4" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => deleteEventType(et)}
                                                                                    className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                                                                    title="Delete service"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {isEditing ? (
                                                                        <div className="space-y-2 pt-1">
                                                                            <label className="block text-xs font-bold text-[#64748B]">
                                                                                Category
                                                                                <input
                                                                                    list="salon-category-options"
                                                                                    value={editCategory}
                                                                                    onChange={(e) =>
                                                                                        setEditCategory(e.target.value)
                                                                                    }
                                                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                                                                    placeholder="Hair, Beauty, or type new…"
                                                                                />
                                                                            </label>
                                                                            <label className="block text-xs font-bold text-[#64748B]">
                                                                                Name
                                                                                <input
                                                                                    value={editName}
                                                                                    onChange={(e) =>
                                                                                        setEditName(e.target.value)
                                                                                    }
                                                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                                                                />
                                                                            </label>
                                                                            <label className="block text-xs font-bold text-[#64748B]">
                                                                                Duration (min)
                                                                                <input
                                                                                    type="number"
                                                                                    min={15}
                                                                                    step={15}
                                                                                    value={editDuration}
                                                                                    onChange={(e) =>
                                                                                        setEditDuration(e.target.value)
                                                                                    }
                                                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                                                                />
                                                                            </label>
                                                                            <label className="block text-xs font-bold text-[#64748B]">
                                                                                Deposit (£)
                                                                                <div className="relative mt-1">
                                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">
                                                                                        £
                                                                                    </span>
                                                                                    <input
                                                                                        type="text"
                                                                                        inputMode="decimal"
                                                                                        value={editDepositPounds}
                                                                                        onChange={(e) =>
                                                                                            setEditDepositPounds(
                                                                                                e.target.value
                                                                                            )
                                                                                        }
                                                                                        className="w-full rounded-xl border border-[#E2E8F0] pl-8 pr-3 py-2 text-sm font-bold"
                                                                                    />
                                                                                </div>
                                                                            </label>
                                                                            <label className="block text-xs font-bold text-[#64748B]">
                                                                                Price (£) *
                                                                                <div className="relative mt-1">
                                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">
                                                                                        £
                                                                                    </span>
                                                                                    <input
                                                                                        type="text"
                                                                                        inputMode="decimal"
                                                                                        value={editPricePounds}
                                                                                        onChange={(e) =>
                                                                                            setEditPricePounds(
                                                                                                e.target.value
                                                                                            )
                                                                                        }
                                                                                        className="w-full rounded-xl border border-[#E2E8F0] pl-8 pr-3 py-2 text-sm font-bold"
                                                                                    />
                                                                                </div>
                                                                            </label>
                                                                            <div className="flex gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={savingEdit}
                                                                                    onClick={() => saveEdit(et)}
                                                                                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-bold"
                                                                                >
                                                                                    <Check className="w-3.5 h-3.5" /> Save
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setEditingId(null)}
                                                                                    className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B]"
                                                                                >
                                                                                    <X className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
                                                                                <p className="text-[10px] font-bold uppercase text-[#64748B]">
                                                                                    Price
                                                                                </p>
                                                                                <p className="text-xl font-black text-[#F59E0B]">
                                                                                    {formatCents(et.total_cents ?? et.deposit_cents)}
                                                                                </p>
                                                                                <p className="text-[10px] text-[#64748B] mt-0.5">
                                                                                    Deposit {formatCents(et.deposit_cents)}
                                                                                </p>
                                                                            </div>
                                                                            <p className="text-[10px] text-[#94A3B8] truncate">
                                                                                /book/{org?.slug}/{et.slug}
                                                                            </p>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {eventTypes.map((et) => {
                                    const key = templateKeyForName(et.name);
                                    const tpl = key ? EVENT_TEMPLATES[key] : null;
                                    const Icon = tpl?.icon || Wrench;
                                    const isEditing = editingId === et.id;

                                    return (
                                        <div
                                            key={et.id}
                                            className={cn(
                                                'rounded-xl border p-4 flex flex-col gap-2 bg-white',
                                                tpl?.border || 'border-[#E2E8F0]'
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={cn('w-9 h-9 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0', tpl?.accent)}>
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-[#0F172A] truncate">{et.name}</p>
                                                        <p className="text-[10px] text-[#64748B]">{et.duration_minutes} min visit</p>
                                                    </div>
                                                </div>
                                                {!isEditing && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEdit(et)}
                                                            className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:border-[#0F172A]/30"
                                                            title="Edit deposit"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteEventType(et)}
                                                            className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                                            title="Delete service"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {isEditing ? (
                                                <div className="space-y-2 pt-1">
                                                    <label className="block text-xs font-bold text-[#64748B]">
                                                        Deposit (£)
                                                        <div className="relative mt-1">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">£</span>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={editDepositPounds}
                                                                onChange={(e) => setEditDepositPounds(e.target.value)}
                                                                className="w-full rounded-xl border border-[#E2E8F0] pl-8 pr-3 py-2 text-sm font-bold"
                                                                autoFocus
                                                            />
                                                        </div>
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={savingEdit}
                                                            onClick={() => saveEdit(et)}
                                                            className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-bold"
                                                        >
                                                            <Check className="w-3.5 h-3.5" /> Save
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingId(null)}
                                                            className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B]"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
                                                        <p className="text-[10px] font-bold uppercase text-[#64748B]">Deposit</p>
                                                        <p className={cn('text-xl font-black', tpl?.accent || 'text-[#F59E0B]')}>
                                                            {formatCents(et.deposit_cents)}
                                                        </p>
                                                    </div>
                                                    <p className="text-[10px] text-[#94A3B8] truncate">/book/{org?.slug}/{et.slug}</p>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            )}

                            {(isDentists || isSalons) && (
                                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                                    <div>
                                        <p className="text-xs font-bold uppercase text-[#64748B]">
                                            {isSalons ? 'Add service' : 'Add appointment slot'}
                                        </p>
                                        <p className="text-sm text-[#64748B] mt-0.5">
                                            {isSalons
                                                ? 'Pick or type a category, then name, duration, and deposit. You can rename categories on each section header.'
                                                : 'e.g. Free Consultation, New Patient Exam — sets duration and deposit for the calendar.'}
                                        </p>
                                    </div>
                                    <div className={cn('grid gap-3', isSalons ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
                                        {isSalons && (
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">
                                                    Category * (pick or type new)
                                                </span>
                                                <input
                                                    list="salon-category-options"
                                                    value={newSlotCategory}
                                                    onChange={(e) => setNewSlotCategory(e.target.value)}
                                                    placeholder="Hair, Beauty, Nails…"
                                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm bg-white"
                                                />
                                                <datalist id="salon-category-options">
                                                    {salonCategoryOptions.map((c) => (
                                                        <option key={c} value={c} />
                                                    ))}
                                                </datalist>
                                                <p className="text-[10px] text-[#94A3B8] mt-1">
                                                    Suggestions: {SALON_SERVICE_CATEGORIES.join(', ')}. Type any new
                                                    name to create a category.
                                                </p>
                                            </label>
                                        )}
                                        <label className={cn('block', isSalons ? '' : 'sm:col-span-1')}>
                                            <span className="text-xs font-bold text-[#64748B]">Name *</span>
                                            <input
                                                type="text"
                                                value={newSlotName}
                                                onChange={(e) => setNewSlotName(e.target.value)}
                                                placeholder={
                                                    isSalons ? 'e.g. Cut & Blow Dry' : 'e.g. Free Consultation'
                                                }
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs font-bold text-[#64748B]">Duration (min)</span>
                                            <input
                                                type="number"
                                                min={15}
                                                step={15}
                                                value={newSlotDuration}
                                                onChange={(e) => setNewSlotDuration(e.target.value)}
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs font-bold text-[#64748B]">Deposit (£)</span>
                                            <div className="relative mt-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">£</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={newSlotDeposit}
                                                    onChange={(e) => setNewSlotDeposit(e.target.value)}
                                                    placeholder="0"
                                                    className="w-full rounded-xl border border-[#E2E8F0] pl-8 pr-3 py-2.5 text-sm font-bold"
                                                />
                                            </div>
                                        </label>
                                        {isSalons && (
                                            <label className="block">
                                                <span className="text-xs font-bold text-[#64748B]">Price (£) *</span>
                                                <div className="relative mt-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">£</span>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={newSlotPrice}
                                                        onChange={(e) => setNewSlotPrice(e.target.value)}
                                                        placeholder="45"
                                                        className="w-full rounded-xl border border-[#E2E8F0] pl-8 pr-3 py-2.5 text-sm font-bold"
                                                    />
                                                </div>
                                            </label>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={addingEvent || !newSlotName.trim()}
                                        onClick={addAppointmentSlot}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold disabled:opacity-40"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {addingEvent ? 'Adding…' : isSalons ? 'Add service' : 'Add slot'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {!isDentists && !isSalons && (
                            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                                <div>
                                    <p className="text-xs font-bold uppercase text-[#64748B]">Add a service</p>
                                    <p className="text-sm text-[#64748B] mt-0.5">Pick a type and set the deposit amount.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {(Object.keys(EVENT_TEMPLATES) as EventTemplateKey[]).map((key) => {
                                        const tpl = EVENT_TEMPLATES[key];
                                        const Icon = tpl.icon;
                                        const taken = existingTemplateKeys.has(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                disabled={taken}
                                                onClick={() => {
                                                    setSelectedTemplate(key);
                                                    if (key === 'standard') setNewDepositPounds('60');
                                                    else if (key === 'emergency') setNewDepositPounds('80');
                                                    else setNewDepositPounds('100');
                                                }}
                                                className={cn(
                                                    'rounded-xl border p-3 text-left transition',
                                                    taken && 'opacity-40 cursor-not-allowed',
                                                    selectedTemplate === key && !taken
                                                        ? 'border-[#0F172A] bg-[#0F172A]/5 ring-1 ring-[#0F172A]'
                                                        : tpl.border
                                                )}
                                            >
                                                <Icon className={cn('w-5 h-5 mb-2', tpl.accent)} />
                                                <p className="font-bold text-sm text-[#0F172A]">{tpl.name}</p>
                                                <p className="text-[10px] text-[#64748B] mt-0.5">{taken ? 'Already added' : tpl.description}</p>
                                            </button>
                                        );
                                    })}
                                </div>

                                <label className="block max-w-xs">
                                    <span className="text-xs font-bold text-[#64748B]">Deposit amount (£)</span>
                                    <div className="relative mt-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold text-lg">£</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={newDepositPounds}
                                            onChange={(e) => setNewDepositPounds(e.target.value)}
                                            disabled={existingTemplateKeys.has(selectedTemplate)}
                                            className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3 py-3 text-lg font-black text-[#0F172A] disabled:opacity-50"
                                            placeholder="60"
                                        />
                                    </div>
                                </label>

                                <button
                                    type="button"
                                    disabled={addingEvent || existingTemplateKeys.has(selectedTemplate) || !poundsToCents(newDepositPounds)}
                                    onClick={addEvent}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold disabled:opacity-40"
                                >
                                    <Plus className="w-4 h-4" />
                                    {addingEvent ? 'Adding…' : `Add ${EVENT_TEMPLATES[selectedTemplate].name}`}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'availability' && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                        {teamsEnabled && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase text-[#64748B]">Schedule scope</p>
                                <p className="text-sm text-[#64748B]">
                                    Opening hours limit when the salon is open. Member schedules are who can be booked
                                    (Booking Pro).
                                </p>
                                <select
                                    value={availScope}
                                    disabled={loadingMemberAvail || savingAvailability}
                                    onChange={(e) => loadAvailabilityScope(e.target.value)}
                                    className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-semibold max-w-md"
                                >
                                    <option value="org">Opening hours (organisation)</option>
                                    {bookableMembers
                                        .filter((m) => m.active !== false)
                                        .map((m) => (
                                            <option key={m.user_id} value={m.user_id}>
                                                {m.display_name || m.name || m.email}
                                                {m.bookable ? '' : ' (not bookable yet)'}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        )}
                        <AvailabilityEditor
                            key={`${availScope}-${weeklyRules.length}-${dateRules.length}`}
                            initialDateRules={dateRules}
                            initialWeeklyRules={weeklyRules}
                            settings={settings}
                            onSettingsChange={setSettings}
                            onSave={saveAvailability}
                            saving={savingAvailability || loadingMemberAvail}
                            title={
                                availScope === 'org'
                                    ? teamsEnabled
                                        ? 'Opening hours'
                                        : 'Your availability'
                                    : 'Member schedule'
                            }
                            hideOrgSettings={availScope !== 'org'}
                        />
                    </div>
                )}

                {tab === 'integrations' && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                        <h2 className="font-bold">Integrations</h2>
                        <div className="flex items-center justify-between gap-3 border border-[#E2E8F0] rounded-xl p-4">
                            <div>
                                <p className="font-bold">Stripe</p>
                                <p className="text-xs text-[#64748B]">
                                    Connect your Stripe account so booking deposits pay you. The platform takes a small application fee.
                                </p>
                                {stripeStatus?.accountId && (
                                    <p className="text-[10px] text-[#94A3B8] font-mono mt-1 truncate max-w-[220px]" title={stripeStatus.accountId}>
                                        {stripeStatus.accountId}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!stripeStatus?.configured ? (
                                    <span className="text-xs font-bold text-[#94A3B8]">Not configured</span>
                                ) : stripeStatus?.ready ? (
                                    <>
                                        <span className="text-xs font-bold text-emerald-700">Connected</span>
                                        <button
                                            type="button"
                                            onClick={openStripeDashboard}
                                            disabled={stripeBusy}
                                            className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#0F172A] disabled:opacity-50"
                                        >
                                            Dashboard
                                        </button>
                                    </>
                                ) : stripeStatus?.connected ? (
                                    <button
                                        type="button"
                                        onClick={connectStripe}
                                        disabled={stripeBusy}
                                        className="px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        {stripeBusy ? 'Opening…' : 'Continue setup'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={connectStripe}
                                        disabled={stripeBusy}
                                        className="px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        {stripeBusy ? 'Opening…' : 'Connect'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between border border-[#E2E8F0] rounded-xl p-4">
                            <div>
                                <p className="font-bold">Google Calendar</p>
                                <p className="text-xs text-[#64748B]">Block busy times & sync events</p>
                            </div>
                            {googleConnected ? (
                                <span className="text-xs font-bold text-emerald-700">Connected</span>
                            ) : (
                                <button type="button" onClick={connectGoogle} className="px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold">Connect</button>
                            )}
                        </div>
                        <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                            <div>
                                <p className="font-bold">Zapier webhook</p>
                                <p className="text-xs text-[#64748B]">
                                    Catch hooks for booking.created, booking.completed, quote.approved, invoice.paid. Optional HMAC
                                    header <code className="text-[10px]">X-LocalPulse-Signature</code>.
                                </p>
                            </div>
                            <label className="block text-xs font-bold text-[#64748B]">
                                Webhook URL
                                <input
                                    value={zapierUrl}
                                    onChange={(e) => setZapierUrl(e.target.value)}
                                    placeholder="https://hooks.zapier.com/..."
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#0F172A]"
                                />
                            </label>
                            <label className="block text-xs font-bold text-[#64748B]">
                                Signing secret (optional)
                                <input
                                    value={zapierSecret}
                                    onChange={(e) => setZapierSecret(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#0F172A]"
                                />
                            </label>
                            <button
                                type="button"
                                disabled={zapierBusy}
                                onClick={saveZapier}
                                className="px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold disabled:opacity-50"
                            >
                                {zapierBusy ? 'Saving…' : 'Save Zapier'}
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3 border border-[#E2E8F0] rounded-xl p-4">
                            <div>
                                <p className="font-bold">QuickBooks Online</p>
                                <p className="text-xs text-[#64748B]">
                                    OAuth connect and push a sales receipt summary when an invoice is paid. CSV export still available
                                    under Jobs &amp; money.
                                </p>
                                {qboStatus?.realmId && (
                                    <p className="text-[10px] text-[#94A3B8] font-mono mt-1">Realm {qboStatus.realmId}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {!qboStatus?.configured ? (
                                    <span className="text-xs font-bold text-[#94A3B8]">Set QBO env keys</span>
                                ) : qboStatus?.connected ? (
                                    <>
                                        <span className="text-xs font-bold text-emerald-700">Connected</span>
                                        <button
                                            type="button"
                                            onClick={disconnectQbo}
                                            disabled={qboBusy}
                                            className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold disabled:opacity-50"
                                        >
                                            Disconnect
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={connectQbo}
                                        disabled={qboBusy}
                                        className="px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        {qboBusy ? 'Opening…' : 'Connect'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'reminders' && org && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                        <div>
                            <h2 className="font-bold text-[#0F172A]">Reminders</h2>
                            <p className="text-sm text-[#64748B] mt-1">
                                Automated email and optional outbound SMS (Amazon SNS) for visits, requests, post-job,
                                invoices, and quotes. Customer replies are not received via SNS.
                            </p>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                            <input
                                type="checkbox"
                                checked={org.reminders_enabled !== false}
                                onChange={(e) => setOrg((o: any) => ({ ...o, reminders_enabled: e.target.checked }))}
                            />
                            Enable email reminders
                        </label>
                        <label className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                            <input
                                type="checkbox"
                                checked={Boolean(org.sms_enabled)}
                                onChange={(e) => setOrg((o: any) => ({ ...o, sms_enabled: e.target.checked }))}
                            />
                            Also send outbound SMS via AWS SNS when the client has a phone
                        </label>
                        <label className="block text-xs font-bold uppercase text-[#64748B]">
                            Visit reminder (hours before start)
                            <input
                                type="number"
                                min={1}
                                max={168}
                                value={org.reminder_visit_hours ?? 24}
                                onChange={(e) =>
                                    setOrg((o: any) => ({ ...o, reminder_visit_hours: Number(e.target.value) || 24 }))
                                }
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm font-medium text-[#0F172A]"
                            />
                        </label>
                        <label className="block text-xs font-bold uppercase text-[#64748B]">
                            Post-job follow-up (hours after complete)
                            <input
                                type="number"
                                min={1}
                                max={168}
                                value={org.reminder_post_job_hours ?? 24}
                                onChange={(e) =>
                                    setOrg((o: any) => ({
                                        ...o,
                                        reminder_post_job_hours: Number(e.target.value) || 24
                                    }))
                                }
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm font-medium text-[#0F172A]"
                            />
                        </label>
                        <label className="block text-xs font-bold uppercase text-[#64748B]">
                            Unpaid invoice reminder (days after send)
                            <input
                                type="number"
                                min={1}
                                max={30}
                                value={org.reminder_invoice_days ?? 3}
                                onChange={(e) =>
                                    setOrg((o: any) => ({
                                        ...o,
                                        reminder_invoice_days: Number(e.target.value) || 3
                                    }))
                                }
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm font-medium text-[#0F172A]"
                            />
                        </label>
                        <button
                            type="button"
                            disabled={savingProfile}
                            onClick={saveProfile}
                            className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white font-bold text-sm disabled:opacity-60"
                        >
                            {savingProfile ? 'Saving…' : 'Save reminder settings'}
                        </button>
                    </div>
                )}

                {tab === 'profile' && org && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                        <div>
                            <h2 className="font-bold text-[#0F172A]">Profile details</h2>
                            <p className="text-sm text-[#64748B] mt-1">Edit what customers see on your booking page.</p>
                        </div>
                        {(() => {
                            const preset = getBookingPreset(org.booking_industry_id || org.trade_type);
                            const ph = preset.setupPlaceholders;
                            const emailHint = ph.contact.includes('@')
                                ? `e.g. ${ph.contact.split(' or ').pop()}`
                                : 'e.g. hello@yourbusiness.com';
                            return (
                                [
                                    ['host_name', 'Your full name', ph.name],
                                    ['name', 'Business name', ph.businessName],
                                    ['trade_type', 'Service type', `e.g. ${preset.name}`],
                                    ['phone', 'Phone number', 'e.g. 07700 900123'],
                                    ['email', 'Notification email', emailHint],
                                    ['service_area', isSalons ? 'Salon location / area' : 'Service area', ph.serviceArea]
                                ] as const
                            ).map(([field, label, placeholder]) => (
                                <label key={field} className="block text-xs font-bold uppercase text-[#64748B]">
                                    {label}
                                    <input
                                        value={org[field] || ''}
                                        onChange={(e) => setOrg((o: any) => ({ ...o, [field]: e.target.value }))}
                                        placeholder={placeholder}
                                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm font-medium text-[#0F172A]"
                                    />
                                </label>
                            ));
                        })()}
                        <p className="text-xs text-[#94A3B8] leading-relaxed">
                            Add your <strong className="text-[#64748B]">phone</strong> and{' '}
                            <strong className="text-[#64748B]">notification email</strong>. When a customer books and pays,
                            confirmation emails go to you and the customer with the service, time, and payment details.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                disabled={savingProfile}
                                onClick={saveProfile}
                                className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white font-bold text-sm disabled:opacity-60"
                            >
                                {savingProfile ? 'Saving…' : 'Save profile'}
                            </button>
                            {onBack && (
                                <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
                                    Back to board
                                </button>
                            )}
                        </div>

                        <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
                            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-[#0F172A]">Leave booking</p>
                                    <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
                                        Log out of Booking Plots only. Your settings, Stripe, and bookings stay saved — you can come back anytime. Other portal tools stay signed in.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={loggingOut}
                                    onClick={logoutBooking}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-sm font-bold text-[#0F172A] hover:bg-white shrink-0 disabled:opacity-50"
                                >
                                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                                    {loggingOut ? 'Leaving…' : 'Log out of booking'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
