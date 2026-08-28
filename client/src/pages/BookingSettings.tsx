import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Building2,
    Clock,
    CreditCard,
    Flame,
    MapPin,
    MessageSquare,
    Phone,
    Plus,
    Settings,
    ShieldCheck,
    Trash2,
    User,
    Wallet,
    Wrench
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPut, cn, restrictPhoneInput } from '../lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type SettingsTab = 'slots' | 'stripe' | 'deposit' | 'twilio' | 'profile';

interface Slot {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    label: string;
    isEmergencyOnly: boolean;
    enabled: boolean;
}

interface Profile {
    name: string;
    businessName: string;
    tradeType: string;
    stripeConnected?: boolean;
}

const TABS: { key: SettingsTab; label: string; icon: typeof Clock }[] = [
    { key: 'slots', label: 'Weekly Slots & Emergency', icon: Clock },
    { key: 'stripe', label: 'Stripe Connect', icon: CreditCard },
    { key: 'deposit', label: 'Deposit Amount', icon: Wallet },
    { key: 'twilio', label: 'Twilio SMS', icon: MessageSquare },
    { key: 'profile', label: 'Business Profile', icon: User }
];

const VALID_TABS = new Set<string>(['slots', 'stripe', 'deposit', 'twilio', 'profile']);

export default function BookingSettings() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') || 'slots';
    const settingsTab: SettingsTab = VALID_TABS.has(tabParam) ? (tabParam as SettingsTab) : 'slots';

    const [booting, setBooting] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [day, setDay] = useState(1);
    const [draft, setDraft] = useState({ startTime: '08:00', endTime: '11:00', label: 'Morning Slot', isEmergencyOnly: false });
    const [form, setForm] = useState({
        deposit: 45,
        currency: '£',
        name: '',
        businessName: '',
        tradeType: '',
        phone: '',
        email: '',
        serviceArea: '',
        emergencyNote: ''
    });

    const daySlots = useMemo(() => slots.filter((s) => s.dayOfWeek === day), [slots, day]);

    useEffect(() => {
        apiGet('/api/booking')
            .then((data) => {
                if (!data.ready || !data.profile) {
                    navigate('/booking', { replace: true });
                    return;
                }
                setProfile({
                    name: data.name,
                    businessName: data.businessName,
                    tradeType: data.tradeType,
                    stripeConnected: data.stripeConnected
                });
                setSlots(data.slots || []);
                setForm({
                    deposit: data.deposit,
                    currency: data.currency,
                    name: data.name,
                    businessName: data.businessName,
                    tradeType: data.tradeType,
                    phone: data.phone || '',
                    email: data.email || '',
                    serviceArea: data.serviceArea || '',
                    emergencyNote: data.emergencyNote || ''
                });
            })
            .catch((e) => setError(e.message))
            .finally(() => setBooting(false));
    }, [navigate]);

    const setSettingsTab = (tab: SettingsTab) => {
        setSearchParams({ tab }, { replace: true });
    };

    const onSave = async () => {
        setBusy(true);
        setError('');
        setSaved(false);
        try {
            await apiPut('/api/booking/slots', { slots });
            await apiPatch('/api/booking/settings', form);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (booting) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8]">
                <p className="font-bold text-[#12333C]">Loading settings...</p>
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="min-h-screen bg-[#F5F7F8] flex flex-col">
            {/* Full-width top bar — no LocalPulse sidebar */}
            <header className="bg-[#12333C] text-white shrink-0">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-[#C8D400]/20 flex items-center justify-center shrink-0">
                            <Settings className="w-5 h-5 text-[#C8D400]" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#C8D400]">Booking Plots</p>
                            <h1 className="font-black text-lg sm:text-xl">Booking & Schedule Settings</h1>
                            <p className="text-sm text-white/60 mt-0.5 truncate">
                                {profile.businessName} · Manage time slots, Stripe payouts, and deposits
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/booking"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C8D400] text-[#12333C] text-sm font-bold shrink-0 hover:bg-[#d6e21a] transition"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to booking board
                    </Link>
                </div>
            </header>

            {/* Tabs */}
            <nav className="bg-white border-b border-[#E3E8EA] shrink-0 overflow-x-auto">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 py-2">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSettingsTab(key)}
                            className={cn(
                                'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border-b-2 transition',
                                settingsTab === key
                                    ? 'text-[#12333C] border-[#C8D400] bg-[#C8D400]/15'
                                    : 'text-[#5B6770] border-transparent hover:bg-[#F5F7F8]'
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </div>
            </nav>

            {/* Main content */}
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 lg:py-6 space-y-4">
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                {saved && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2">All changes saved.</p>}

                    {settingsTab === 'slots' && (
                        <>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3 text-sm text-amber-900">
                                <ShieldCheck className="w-5 h-5 shrink-0 text-amber-600" />
                                <div>
                                    <strong className="block text-xs uppercase tracking-wide">Strict Emergency Slot Routing</strong>
                                    Slots marked <strong>EMERGENCY ONLY</strong> only appear when customers choose an emergency booking.
                                </div>
                            </div>

                            <p className="text-xs font-bold uppercase tracking-wider text-[#5B6770]">Select day to configure</p>
                            <div className="grid grid-cols-7 gap-2">
                                {DAYS.map((name, i) => {
                                    const count = slots.filter((s) => s.dayOfWeek === i && s.enabled).length;
                                    const emCount = slots.filter((s) => s.dayOfWeek === i && s.enabled && s.isEmergencyOnly).length;
                                    return (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => setDay(i)}
                                            className={cn(
                                                'rounded-xl px-2 py-2.5 text-center border text-xs font-bold transition',
                                                day === i ? 'bg-[#12333C] text-white border-[#12333C]' : 'bg-white border-[#E3E8EA] hover:border-[#12333C]/30'
                                            )}
                                        >
                                            {name}
                                            <div className="text-base font-black leading-none mt-1">{count}</div>
                                            {emCount > 0 && <Flame className="w-3 h-3 text-red-500 mx-auto mt-0.5" />}
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="text-xs font-bold uppercase tracking-wider text-[#5B6770]">
                                Slots for {DAYS[day]} ({daySlots.length})
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {daySlots.map((s) => (
                                    <SlotRow key={s.id} slot={s} setSlots={setSlots} />
                                ))}
                            </div>

                            <div className="bg-[#F5F7F8] border border-[#E3E8EA] rounded-xl p-4 space-y-3 max-w-xl">
                                <p className="text-xs font-bold uppercase text-[#5B6770]">Add new slot</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="text-xs font-bold text-[#5B6770]">
                                        Start
                                        <input type="time" value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-3 py-2 text-sm bg-white" />
                                    </label>
                                    <label className="text-xs font-bold text-[#5B6770]">
                                        End
                                        <input type="time" value={draft.endTime} onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-3 py-2 text-sm bg-white" />
                                    </label>
                                </div>
                                <label className="block text-xs font-bold text-[#5B6770]">
                                    Slot label
                                    <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-3 py-2 text-sm bg-white" placeholder="Morning Slot" />
                                </label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSlots((prev) => [...prev, { id: `slot_${Date.now()}`, dayOfWeek: day, ...draft, enabled: true }])
                                    }
                                    className="w-full py-2.5 rounded-xl bg-[#12333C] text-white text-sm font-bold flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Add Slot
                                </button>
                            </div>
                        </>
                    )}

                    {settingsTab === 'stripe' && (
                        <div className="bg-[#F5F7F8] rounded-xl border border-[#E3E8EA] p-5 space-y-3 max-w-lg">
                            <p className="text-sm text-[#5B6770]">
                                Status:{' '}
                                <strong className="text-[#12333C]">
                                    {profile.stripeConnected ? 'Connected — Payouts Active' : 'Not connected'}
                                </strong>
                            </p>
                            <p className="text-xs text-[#5B6770]">Simulated until you add Stripe keys in Vercel env or backend .env</p>
                            <button
                                type="button"
                                onClick={async () => {
                                    await apiPost('/api/booking/connect-stripe', {});
                                    setProfile((p) => (p ? { ...p, stripeConnected: true } : p));
                                }}
                                className="w-full py-2.5 rounded-xl bg-[#12333C] text-white text-sm font-bold"
                            >
                                Connect Stripe
                            </button>
                        </div>
                    )}

                    {settingsTab === 'deposit' && (
                        <div className="bg-[#F5F7F8] rounded-xl border border-[#E3E8EA] p-5 grid grid-cols-3 gap-3 max-w-md">
                            <label className="text-xs font-bold text-[#5B6770] col-span-1">
                                Currency
                                <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-2 py-2 text-sm bg-white">
                                    <option value="£">£</option>
                                    <option value="$">$</option>
                                    <option value="€">€</option>
                                </select>
                            </label>
                            <label className="text-xs font-bold text-[#5B6770] col-span-2">
                                Deposit amount
                                <input type="number" min={0} value={form.deposit} onChange={(e) => setForm((f) => ({ ...f, deposit: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-3 py-2 text-sm bg-white" />
                            </label>
                        </div>
                    )}

                    {settingsTab === 'twilio' && (
                        <p className="bg-[#F5F7F8] rounded-xl border border-[#E3E8EA] p-5 text-sm text-[#5B6770] max-w-lg">
                            SMS / WhatsApp reminders are simulated. Job cards on the booking board include “Send 24h Reminder”.
                        </p>
                    )}

                    {settingsTab === 'profile' && (
                        <div className="bg-[#F5F7F8] rounded-xl border border-[#E3E8EA] p-4 space-y-3 max-w-lg">
                            {(
                                [
                                    ['name', 'Your name', User],
                                    ['businessName', 'Business name', Building2],
                                    ['tradeType', 'Trade type', Wrench],
                                    ['phone', 'Phone', Phone],
                                    ['serviceArea', 'Service area', MapPin],
                                    ['emergencyNote', 'Emergency note', Flame]
                                ] as const
                            ).map(([key, label, Icon]) => (
                                <label key={key} className="block text-xs font-bold text-[#5B6770]">
                                    {label}
                                    <div className="relative mt-1">
                                        <Icon className="w-4 h-4 text-[#5B6770] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            value={form[key]}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    [key]: key === 'phone' ? restrictPhoneInput(e.target.value) : e.target.value
                                                }))
                                            }
                                            inputMode={key === 'phone' ? 'numeric' : undefined}
                                            maxLength={key === 'phone' ? 11 : undefined}
                                            className="w-full rounded-lg border border-[#E3E8EA] pl-10 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#12333C]"
                                        />
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
            </main>

            {/* Sticky footer */}
            <footer className="shrink-0 border-t border-[#E3E8EA] bg-white">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center gap-3">
                    <Link to="/booking" className="text-sm font-bold text-[#5B6770] hover:text-[#12333C]">
                        Cancel
                    </Link>
                    <button type="button" disabled={busy} onClick={onSave} className="px-6 py-2.5 rounded-xl bg-[#C8D400] text-[#12333C] text-sm font-bold disabled:opacity-60 hover:bg-[#d6e21a]">
                        {busy ? 'Saving...' : 'Save All Changes'}
                    </button>
                </div>
            </footer>
        </div>
    );
}

function SlotRow({ slot: s, setSlots }: { slot: Slot; setSlots: Dispatch<SetStateAction<Slot[]>> }) {
    return (
        <div className={cn('bg-white border rounded-xl p-3 flex gap-3', s.isEmergencyOnly ? 'border-red-200 bg-red-50/40' : 'border-[#E3E8EA]')}>
            <input
                type="checkbox"
                checked={s.enabled}
                onChange={() => setSlots((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)))}
                className="mt-1 shrink-0"
            />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-[#12333C]">{s.label}</p>
                    <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded', s.isEmergencyOnly ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-700')}>
                        {s.isEmergencyOnly ? 'Emergency Only' : 'Standard Slot'}
                    </span>
                </div>
                <p className="text-xs text-[#5B6770] mt-0.5">{s.startTime} – {s.endTime}</p>
                <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.map((x) => (x.id === s.id ? { ...x, isEmergencyOnly: !x.isEmergencyOnly } : x)))}
                    className={cn(
                        'mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg border',
                        s.isEmergencyOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-[#5B6770] border-[#E3E8EA]'
                    )}
                >
                    <Flame className="w-3 h-3" />
                    {s.isEmergencyOnly ? 'Emergency Slot' : 'Make Emergency'}
                </button>
            </div>
            <button type="button" onClick={() => setSlots((p) => p.filter((x) => x.id !== s.id))} className="shrink-0 p-1 text-[#5B6770] hover:text-red-600">
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}
