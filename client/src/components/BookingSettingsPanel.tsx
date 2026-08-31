import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, CreditCard, Flame, Pencil, Plus, Settings, ShieldAlert, Wallet, Wrench, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPut, cn, formatCents } from '../lib/utils';
import AvailabilityEditor, { type AvailabilitySettings } from './AvailabilityEditor';

type Tab = 'events' | 'availability' | 'integrations' | 'profile';

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

type Props = {
    embedded?: boolean;
    onBack?: () => void;
    initialDashboard?: {
        organization?: any;
        eventTypes?: any[];
        availabilityDateRules?: any[];
    } | null;
    onRefresh?: () => void;
};

export default function BookingSettingsPanel({ embedded, onBack, initialDashboard, onRefresh }: Props) {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const tab: Tab = tabParam === 'availability' || tabParam === 'integrations' || tabParam === 'profile' ? tabParam : 'events';
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [eventTypes, setEventTypes] = useState<any[]>([]);
    const [dateRules, setDateRules] = useState<any[]>([]);
    const [settings, setSettings] = useState<AvailabilitySettings>({
        timezone: 'Europe/London',
        minNoticeHours: 2,
        maxDaysAhead: 60,
        bufferMinutes: 15
    });
    const [org, setOrg] = useState<any>(null);
    const [googleConnected, setGoogleConnected] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EventTemplateKey>('standard');
    const [newDepositPounds, setNewDepositPounds] = useState('60');
    const [addingEvent, setAddingEvent] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDepositPounds, setEditDepositPounds] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingAvailability, setSavingAvailability] = useState(false);

    const applyDashboard = (dash: NonNullable<Props['initialDashboard']>) => {
        setOrg(dash.organization);
        setEventTypes(dash.eventTypes || []);
        setDateRules(dash.availabilityDateRules || []);
        setSettings({
            timezone: dash.organization?.timezone || 'Europe/London',
            minNoticeHours: dash.organization?.min_notice_hours || 2,
            maxDaysAhead: dash.organization?.max_days_ahead || 60,
            bufferMinutes: dash.organization?.buffer_minutes || 15
        });
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
    }, [initialDashboard]);

    const setTab = (t: Tab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', t);
        if (embedded) next.set('panel', 'settings');
        setSearchParams(next);
    };

    const existingTemplateKeys = new Set(
        eventTypes.map((et) => templateKeyForName(et.name)).filter(Boolean) as EventTemplateKey[]
    );

    const saveAvailability = async (payload: { settings: AvailabilitySettings; dateRules: { date: string; startTime: string; endTime: string; enabled: boolean }[] }) => {
        setSavingAvailability(true);
        setError('');
        try {
            await apiPut('/api/host/availability', {
                settings: {
                    timezone: payload.settings.timezone,
                    minNoticeHours: payload.settings.minNoticeHours,
                    maxDaysAhead: payload.settings.maxDaysAhead,
                    bufferMinutes: payload.settings.bufferMinutes
                },
                dateRules: payload.dateRules
            });
            setDateRules(payload.dateRules);
            setSettings(payload.settings);
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
                totalCents: Math.round(depositCents * 3.33)
            });
            setEventTypes((prev) => [...prev, et]);
            setNewDepositPounds(selectedTemplate === 'standard' ? '60' : selectedTemplate === 'emergency' ? '80' : '100');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setAddingEvent(false);
        }
    };

    const startEdit = (et: any) => {
        setEditingId(et.id);
        setEditDepositPounds((et.deposit_cents / 100).toFixed(2).replace(/\.00$/, ''));
        setError('');
    };

    const saveEdit = async (et: any) => {
        const depositCents = poundsToCents(editDepositPounds);
        if (!depositCents) {
            setError('Enter a valid deposit amount.');
            return;
        }
        setSavingEdit(true);
        setError('');
        try {
            const updated = await apiPatch(`/api/host/event-types/${et.id}`, {
                depositCents,
                totalCents: Math.round(depositCents * 3.33)
            });
            setEventTypes((prev) => prev.map((x) => (x.id === et.id ? updated : x)));
            setEditingId(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSavingEdit(false);
        }
    };

    const saveProfile = async () => {
        setSavingProfile(true);
        setError('');
        try {
            await apiPatch('/api/host/organization', {
                name: org.name,
                tradeType: org.trade_type,
                phone: org.phone,
                email: org.email,
                serviceArea: org.service_area
            });
            onBack?.();
        } catch (e: any) {
            setError(e.message);
            setSavingProfile(false);
        }
    };

    const connectGoogle = async () => {
        const { url } = await apiGet('/api/integrations/google/start');
        window.location.href = url;
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
                    {([
                        ['events', 'Event types', Settings],
                        ['availability', 'Availability', Calendar],
                        ['integrations', 'Integrations', CreditCard],
                        ['profile', 'Profile', Wallet]
                    ] as const).map(([key, label, Icon]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
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

                {tab === 'events' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                            <div>
                                <h2 className="font-bold text-[#0F172A]">Your services</h2>
                                <p className="text-sm text-[#64748B] mt-1">Set the deposit customers pay when booking each service type.</p>
                            </div>

                            {eventTypes.length === 0 && (
                                <p className="text-sm text-[#94A3B8] border border-dashed border-[#E2E8F0] rounded-xl px-4 py-6 text-center">
                                    No services yet — add Standard, Emergency, or Serious below.
                                </p>
                            )}

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
                                                    <button
                                                        type="button"
                                                        onClick={() => startEdit(et)}
                                                        className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:border-[#0F172A]/30 shrink-0"
                                                        title="Edit deposit"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
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
                        </div>

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
                    </div>
                )}

                {tab === 'availability' && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
                        <AvailabilityEditor
                            key={dateRules.length}
                            initialDateRules={dateRules}
                            settings={settings}
                            onSettingsChange={setSettings}
                            onSave={saveAvailability}
                            saving={savingAvailability}
                        />
                    </div>
                )}

                {tab === 'integrations' && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                        <h2 className="font-bold">Integrations</h2>
                        <div className="flex items-center justify-between border border-[#E2E8F0] rounded-xl p-4">
                            <div>
                                <p className="font-bold">Stripe</p>
                                <p className="text-xs text-[#64748B]">Collect deposits at booking</p>
                            </div>
                            <span className="text-xs font-bold text-emerald-700">Configured via env</span>
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
                    </div>
                )}

                {tab === 'profile' && org && (
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-3">
                        <h2 className="font-bold">Business profile</h2>
                        {['name', 'trade_type', 'phone', 'email', 'service_area'].map((field) => (
                            <label key={field} className="block text-xs font-bold text-[#64748B] capitalize">
                                {field.replace('_', ' ')}
                                <input
                                    value={org[field] || ''}
                                    onChange={(e) => setOrg((o: any) => ({ ...o, [field]: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                />
                            </label>
                        ))}
                        <button
                            type="button"
                            disabled={savingProfile}
                            onClick={saveProfile}
                            className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white font-bold text-sm disabled:opacity-60"
                        >
                            {savingProfile ? 'Saving…' : 'Save profile'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
