import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, CreditCard, Flame, Pencil, Plus, Settings, ShieldAlert, Wallet, Wrench, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPut, cn, formatCents } from '../lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export default function BookingSettings() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = (searchParams.get('tab') as Tab) || 'events';
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [eventTypes, setEventTypes] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [settings, setSettings] = useState({ timezone: 'Europe/London', minNoticeHours: 2, maxDaysAhead: 60, bufferMinutes: 15 });
    const [org, setOrg] = useState<any>(null);
    const [googleConnected, setGoogleConnected] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<EventTemplateKey>('standard');
    const [newDepositPounds, setNewDepositPounds] = useState('60');
    const [addingEvent, setAddingEvent] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDepositPounds, setEditDepositPounds] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);

    useEffect(() => {
        apiGet('/api/host/dashboard')
            .then((dash) => {
                setOrg(dash.organization);
                setEventTypes(dash.eventTypes || []);
                setRules(dash.availabilityRules || []);
                setSettings({
                    timezone: dash.organization?.timezone || 'Europe/London',
                    minNoticeHours: dash.organization?.min_notice_hours || 2,
                    maxDaysAhead: dash.organization?.max_days_ahead || 60,
                    bufferMinutes: dash.organization?.buffer_minutes || 15
                });
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));

        apiGet('/api/integrations/google/status')
            .then((g) => setGoogleConnected(g.connected))
            .catch(() => setGoogleConnected(false));
    }, []);

    const setTab = (t: Tab) => setSearchParams({ tab: t });

    const existingTemplateKeys = new Set(
        eventTypes.map((et) => templateKeyForName(et.name)).filter(Boolean) as EventTemplateKey[]
    );

    const saveAvailability = async () => {
        setError('');
        try {
            await apiPut('/api/host/availability', {
                settings: {
                    timezone: settings.timezone,
                    minNoticeHours: settings.minNoticeHours,
                    maxDaysAhead: settings.maxDaysAhead,
                    bufferMinutes: settings.bufferMinutes
                },
                rules: rules.map((r) => ({
                    dayOfWeek: r.day_of_week ?? r.dayOfWeek,
                    startTime: String(r.start_time || r.startTime).slice(0, 5),
                    endTime: String(r.end_time || r.endTime).slice(0, 5),
                    enabled: r.enabled !== false
                }))
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            setError(e.message);
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
            navigate('/booking');
        } catch (e: any) {
            setError(e.message);
            setSavingProfile(false);
        }
    };

    const connectGoogle = async () => {
        const { url } = await apiGet('/api/integrations/google/start');
        window.location.href = url;
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            <header className="bg-[#0F172A] text-white px-4 py-4">
                <div className="max-w-5xl mx-auto flex items-center gap-3">
                    <Link to="/booking" className="p-2 rounded-xl bg-white/10"><ArrowLeft className="w-4 h-4" /></Link>
                    <div>
                        <p className="text-xs text-white/50 uppercase">Settings</p>
                        <h1 className="font-black">{org?.name}</h1>
                    </div>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                    {([
                        ['events', 'Event types', Settings],
                        ['availability', 'Availability', Calendar],
                        ['integrations', 'Integrations', CreditCard],
                        ['profile', 'Profile', Wallet]
                    ] as const).map(([key, label, Icon]) => (
                        <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${tab === key ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white border-[#E2E8F0] text-[#64748B]'}`}>
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
                                <p className="text-sm text-[#64748B] mt-0.5">Pick a type and set the deposit amount — that&apos;s all you need.</p>
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
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                        <h2 className="font-bold">Weekly availability</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <label className="text-xs font-bold text-[#64748B]">Min notice (hours)<input type="number" value={settings.minNoticeHours} onChange={(e) => setSettings((s) => ({ ...s, minNoticeHours: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" /></label>
                            <label className="text-xs font-bold text-[#64748B]">Max days ahead<input type="number" value={settings.maxDaysAhead} onChange={(e) => setSettings((s) => ({ ...s, maxDaysAhead: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" /></label>
                            <label className="text-xs font-bold text-[#64748B]">Buffer (min)<input type="number" value={settings.bufferMinutes} onChange={(e) => setSettings((s) => ({ ...s, bufferMinutes: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" /></label>
                            <label className="text-xs font-bold text-[#64748B]">Timezone<input value={settings.timezone} onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" /></label>
                        </div>
                        {DAYS.map((dayName, dayOfWeek) => {
                            const dayRules = rules.filter((r) => Number(r.day_of_week ?? r.dayOfWeek) === dayOfWeek);
                            return (
                                <div key={dayName} className="border border-[#E2E8F0] rounded-xl p-3">
                                    <p className="text-xs font-bold text-[#64748B] mb-2">{dayName}</p>
                                    {dayRules.length === 0 && <p className="text-xs text-[#94A3B8]">Unavailable</p>}
                                    {dayRules.map((r, i) => (
                                        <div key={i} className="flex gap-2 text-sm mb-1">
                                            <span>{String(r.start_time || r.startTime).slice(0, 5)} – {String(r.end_time || r.endTime).slice(0, 5)}</span>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setRules((prev) => [...prev, { day_of_week: dayOfWeek, start_time: '09:00', end_time: '17:00', enabled: true }])} className="text-xs font-bold text-[#F59E0B] mt-1">+ Add hours</button>
                                </div>
                            );
                        })}
                        <button type="button" onClick={saveAvailability} className="px-5 py-2.5 rounded-xl bg-[#F59E0B] text-white font-bold text-sm">Save availability</button>
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
