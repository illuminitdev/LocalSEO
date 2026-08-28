import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    Calendar,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    CreditCard,
    ExternalLink,
    Flame,
    LayoutDashboard,
    MapPin,
    MessageSquare,
    Phone,
    Plus,
    QrCode,
    Settings,
    Share2,
    ShieldCheck,
    Trash2,
    User,
    Wallet,
    Wrench,
    X,
    Zap
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPut, cn, restrictPhoneInput } from '../lib/utils';
import CustomerBookingFlow from '../components/CustomerBookingFlow';
import BookingSetupWizard, { type SetupForm } from '../components/BookingSetupWizard';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Tab = 'dashboard' | 'slots' | 'share';
type Filter = 'active' | 'emergencies' | 'standard' | 'all' | 'done';
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

interface Booking {
    id: string;
    customerName: string;
    phone: string;
    address: string;
    description: string;
    date: string;
    slotLabel: string;
    isEmergency: boolean;
    depositAmount: number;
    currency: string;
    depositPaid: boolean;
    status: string;
    reminderSent?: boolean;
}

interface Profile {
    name: string;
    businessName: string;
    tradeType: string;
    phone: string;
    email: string;
    deposit: number;
    currency: string;
    serviceArea: string;
    emergencyNote: string;
    acceptingEmergencies: boolean;
    slug: string;
    stripeConnected?: boolean;
    source?: string;
    demoKey?: string;
}

interface LinkedBusiness {
    name: string;
    connected: boolean;
    address?: string;
    category?: string;
}

export default function BookingPlots() {
    const [booting, setBooting] = useState(true);
    const [ready, setReady] = useState(false);
    const [linked, setLinked] = useState(false);
    const [linkedBusiness, setLinkedBusiness] = useState<LinkedBusiness | null>(null);
    const [tab, setTab] = useState<Tab>('dashboard');
    const [filter, setFilter] = useState<Filter>('active');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('slots');
    const [qrOpen, setQrOpen] = useState(false);
    const [customerFlowOpen, setCustomerFlowOpen] = useState(false);
    const [day, setDay] = useState(1);
    const [draft, setDraft] = useState({ startTime: '08:00', endTime: '11:00', label: 'Morning Slot', isEmergencyOnly: false });
    const [form, setForm] = useState({
        deposit: 45,
        currency: '£',
        name: '',
        businessName: '',
        tradeType: 'Heating Engineer',
        phone: '',
        email: '',
        serviceArea: '',
        emergencyNote: ''
    });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const applyData = (data: any) => {
        const isReady = Boolean(data.ready);
        setReady(isReady);
        setLinked(Boolean(data.linked));
        if (data.business) setLinkedBusiness(data.business);

        if (!isReady || !data.profile) {
            setProfile(null);
            setSlots([]);
            setBookings([]);
            return;
        }

        setProfile({
            name: data.name,
            businessName: data.businessName,
            tradeType: data.tradeType,
            phone: data.phone,
            email: data.email || '',
            deposit: data.deposit,
            currency: data.currency,
            serviceArea: data.serviceArea || '',
            emergencyNote: data.emergencyNote || '',
            acceptingEmergencies: data.acceptingEmergencies,
            slug: data.slug,
            stripeConnected: data.stripeConnected,
            source: data.source,
            demoKey: data.demoKey
        });
        setSlots(data.slots || []);
        setBookings(data.bookings || []);
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
        setError('');
    };

    const loadBooking = async () => {
        const data = await apiGet('/api/booking');
        applyData(data);
    };

    useEffect(() => {
        loadBooking()
            .catch((e) => setError(e.message))
            .finally(() => setBooting(false));
    }, []);

    const stats = useMemo(() => {
        const active = bookings.filter((b) => b.status !== 'done' && b.status !== 'cancelled');
        return {
            emergencies: active.filter((b) => b.isEmergency).length,
            standard: active.filter((b) => !b.isEmergency).length,
            active: active.length,
            all: bookings.length,
            done: bookings.filter((b) => b.status === 'done').length
        };
    }, [bookings]);

    const filtered = useMemo(() => {
        return bookings.filter((b) => {
            if (filter === 'all') return true;
            if (filter === 'done') return b.status === 'done';
            if (filter === 'emergencies') return b.isEmergency && b.status !== 'done' && b.status !== 'cancelled';
            if (filter === 'standard') return !b.isEmergency && b.status !== 'done' && b.status !== 'cancelled';
            return b.status !== 'done' && b.status !== 'cancelled';
        });
    }, [bookings, filter]);

    const bookUrl = `${window.location.origin}/book`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(bookUrl)}`;
    const daySlots = slots.filter((s) => s.dayOfWeek === day);

    const completeSetup = async (setup: SetupForm) => {
        setBusy(true);
        setError('');
        try {
            const data = await apiPost('/api/booking/setup', setup);
            applyData(data);
            setTab('dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const switchProfile = async () => {
        setBusy(true);
        try {
            const data = await apiPost('/api/booking/clear', { forcePicker: true });
            applyData(data);
            setSettingsOpen(false);
            setQrOpen(false);
            setTab('dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const refresh = async () => {
        await loadBooking();
    };

    const copyLink = async () => {
        await navigator.clipboard.writeText(bookUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const shareLink = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: profile?.businessName || 'Book online',
                    text: `Book ${profile?.businessName || 'our service'} online`,
                    url: bookUrl
                });
                return;
            } catch {
                /* fall through */
            }
        }
        await copyLink();
    };

    const openTestBooking = () => {
        setCustomerFlowOpen(true);
        setTab('dashboard');
        setQrOpen(false);
    };

    const closeTestBooking = async () => {
        setCustomerFlowOpen(false);
        await refresh();
        setFilter('active');
    };

    if (booting) {
        return (
            <div className="flex items-center justify-center py-24">
                <p className="font-bold text-[#12333C]">Loading Booking Plots...</p>
            </div>
        );
    }

    if (!ready || !profile) {
        return (
            <BookingSetupWizard
                linked={linked}
                linkedBusiness={linkedBusiness}
                busy={busy}
                error={error}
                onComplete={completeSetup}
            />
        );
    }

    const initial = profile.businessName.charAt(0).toUpperCase();
    const enabledSlots = slots.filter((s) => s.enabled).length;
    const emergencySlots = slots.filter((s) => s.enabled && s.isEmergencyOnly).length;
    const todayDow = new Date().getDay();
    const todaySlots = slots.filter((s) => s.dayOfWeek === todayDow && s.enabled);

    return (
        <div className="w-full space-y-4">
            {/* —— Header —— */}
            <div className="bg-[#12333C] rounded-2xl text-white px-4 py-4 lg:px-6 lg:py-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-[#C8D400] text-[#12333C] flex items-center justify-center font-black text-lg shrink-0">
                            {initial}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="font-black text-lg lg:text-xl truncate">{profile.businessName}</h1>
                                <span className="text-[10px] font-black bg-[#C8D400] text-[#12333C] px-2 py-0.5 rounded">PRO</span>
                            </div>
                            <p className="text-sm text-white/60 truncate">{profile.name} · {profile.tradeType}</p>
                            {profile.serviceArea && (
                                <p className="text-xs text-white/40 truncate mt-0.5 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 shrink-0" /> {profile.serviceArea}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                await apiPatch('/api/booking/settings', { acceptingEmergencies: !profile.acceptingEmergencies });
                                await refresh();
                            }}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border',
                                profile.acceptingEmergencies
                                    ? 'bg-red-950/50 border-red-500/50 text-red-300'
                                    : 'bg-white/5 border-white/15 text-white/50'
                            )}
                        >
                            <Flame className="w-3.5 h-3.5" />
                            Emergencies: {profile.acceptingEmergencies ? 'ON' : 'OFF'}
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                await apiPost('/api/booking/connect-stripe', {});
                                await refresh();
                            }}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border',
                                profile.stripeConnected
                                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                    : 'bg-white/5 border-white/15 text-white/50'
                            )}
                        >
                            <Wallet className="w-3.5 h-3.5" />
                            {profile.stripeConnected ? 'Payouts Active' : 'Payouts Off'}
                        </button>
                        <button type="button" onClick={() => setQrOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0C242B] text-[#C8D400] text-xs font-bold">
                            <QrCode className="w-3.5 h-3.5" /> QR
                        </button>
                        <button type="button" onClick={shareLink} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0C242B] text-white text-xs font-bold">
                            <Share2 className="w-3.5 h-3.5" /> Share
                        </button>
                        <Link to="/book" target="_blank" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C8D400] text-[#12333C] text-xs font-bold">
                            <ExternalLink className="w-3.5 h-3.5" /> Customer View
                        </Link>
                        <button
                            type="button"
                            onClick={() => { setSettingsTab('slots'); setSettingsOpen(true); }}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/15"
                            title="Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={switchProfile} className="p-2 rounded-xl bg-white/10 hover:bg-white/15" title="Start over">
                            <User className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* —— Stats row —— */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Emergencies" value={stats.emergencies} sub="Priority callouts" accent="bg-red-600 text-white" icon={<Zap className="w-4 h-4" />} />
                <StatCard label="Standard" value={stats.standard} sub="Regular schedule" icon={<Clock className="w-4 h-4 text-sky-600" />} />
                <StatCard label="Active" value={stats.active} sub="Open jobs" icon={<LayoutDashboard className="w-4 h-4 text-[#12333C]" />} />
                <StatCard label="Done" value={stats.done} sub="Completed" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} />
                <StatCard label="Deposit" value={`${profile.currency}${profile.deposit}`} sub="Per booking" icon={<span className="text-emerald-600 font-black">£</span>} />
                <StatCard label="Slots" value={enabledSlots} sub={`${emergencySlots} emergency`} icon={<Calendar className="w-4 h-4 text-[#12333C]" />} />
            </div>

            {/* —— Main content: bookings + sidebar —— */}
            <div className={cn('grid grid-cols-1 gap-4 items-start', customerFlowOpen ? '' : 'xl:grid-cols-[1fr_360px]')}>
                {/* Bookings panel */}
                <div className="bg-white rounded-2xl border border-[#E3E8EA] shadow-sm overflow-hidden flex flex-col min-h-[480px]">
                    {customerFlowOpen && profile ? (
                        <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
                            <CustomerBookingFlow
                                embedded
                                profile={{
                                    name: profile.name,
                                    businessName: profile.businessName,
                                    tradeType: profile.tradeType,
                                    phone: profile.phone,
                                    deposit: profile.deposit,
                                    currency: profile.currency,
                                    serviceArea: profile.serviceArea,
                                    emergencyNote: profile.emergencyNote,
                                    acceptingEmergencies: profile.acceptingEmergencies
                                }}
                                slots={slots}
                                onBack={closeTestBooking}
                                onSuccess={() => refresh()}
                            />
                        </div>
                    ) : (
                    <>
                    {/* Desktop tabs */}
                    <div className="hidden md:flex border-b border-[#E3E8EA] px-4 pt-3 gap-1">
                        <TabBtn active={tab === 'dashboard'} label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} onClick={() => setTab('dashboard')} horizontal />
                        <TabBtn
                            active={tab === 'slots' || settingsOpen}
                            label="Slots & Stripe"
                            icon={<Clock className="w-4 h-4" />}
                            onClick={() => { setTab('slots'); setSettingsTab('slots'); setSettingsOpen(true); }}
                            horizontal
                        />
                        <TabBtn active={tab === 'share'} label="Share Link" icon={<QrCode className="w-4 h-4" />} onClick={() => setTab('share')} horizontal />
                    </div>

                    <div className="flex-1 p-4 lg:p-5 space-y-3">
                        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

                        {tab === 'share' ? (
                            <SharePanel bookUrl={bookUrl} qrUrl={qrUrl} copied={copied} onCopy={copyLink} onShare={shareLink} onTestJob={openTestBooking} busy={busy} expanded />
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-1.5 bg-[#F5F7F8] rounded-xl p-1.5">
                                    {(
                                        [
                                            ['active', `Active (${stats.active})`],
                                            ['emergencies', `Emergencies (${stats.emergencies})`],
                                            ['standard', `Standard (${stats.standard})`],
                                            ['all', `All (${stats.all})`],
                                            ['done', `Done (${stats.done})`]
                                        ] as const
                                    ).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setFilter(key)}
                                            className={cn(
                                                'px-3 py-2 rounded-lg text-xs font-bold transition',
                                                filter === key
                                                    ? 'bg-white text-[#12333C] shadow-sm'
                                                    : key === 'emergencies'
                                                      ? 'text-red-600 hover:bg-red-50'
                                                      : 'text-[#5B6770] hover:bg-white/60'
                                            )}
                                        >
                                            {key === 'emergencies' && <Flame className="w-3 h-3 inline mr-1" />}
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {filtered.length === 0 ? (
                                    <div className="border border-dashed border-[#E3E8EA] rounded-2xl p-10 lg:p-16 text-center flex flex-col items-center justify-center min-h-[340px] bg-[#FAFBFC]">
                                        <div className="w-20 h-20 rounded-2xl bg-[#C8D400]/25 flex items-center justify-center mb-5">
                                            <Wrench className="w-10 h-10 text-[#12333C]" />
                                        </div>
                                        <h3 className="font-black text-xl text-[#12333C]">No bookings in this filter</h3>
                                        <p className="text-sm text-[#5B6770] mt-2 max-w-lg leading-relaxed">
                                            Share your public booking link or QR code with customers so they can book directly into your slots.
                                        </p>
                                        <div className="mt-6 flex flex-wrap gap-3 justify-center">
                                            <button type="button" onClick={() => setQrOpen(true)} className="px-5 py-3 rounded-xl bg-[#12333C] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:bg-[#0C242B] transition">
                                                <QrCode className="w-4 h-4 text-[#C8D400]" /> Show Booking QR
                                            </button>
                                            <button type="button" onClick={openTestBooking} className="px-5 py-3 rounded-xl bg-[#C8D400] text-[#12333C] text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:bg-[#d6e21a] transition">
                                                <Wrench className="w-4 h-4" /> Book Test Job
                                            </button>
                                        </div>
                                        <p className="text-xs text-[#5B6770] mt-4">Book Test Job opens the customer booking flow right here — no separate page.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {filtered.map((b) => (
                                            <JobCard
                                                key={b.id}
                                                booking={b}
                                                onConfirm={async () => {
                                                    await apiPatch(`/api/booking/bookings/${b.id}`, { status: 'confirmed', depositPaid: true });
                                                    await refresh();
                                                }}
                                                onDone={async () => {
                                                    await apiPatch(`/api/booking/bookings/${b.id}`, { status: 'done' });
                                                    await refresh();
                                                }}
                                                onCancel={async () => {
                                                    await apiPatch(`/api/booking/bookings/${b.id}`, { status: 'cancelled' });
                                                    await refresh();
                                                }}
                                                onReminder={async () => {
                                                    await apiPost('/api/booking/notify', { bookingId: b.id });
                                                    await refresh();
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Mobile bottom nav */}
                    <nav className="md:hidden border-t border-[#E3E8EA] px-1 py-1.5 flex bg-[#F5F7F8]">
                        <TabBtn active={tab === 'dashboard'} label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} onClick={() => setTab('dashboard')} />
                        <TabBtn active={tab === 'slots' || settingsOpen} label="Slots" icon={<Clock className="w-4 h-4" />} onClick={() => { setTab('slots'); setSettingsTab('slots'); setSettingsOpen(true); }} />
                        <TabBtn active={tab === 'share'} label="Share" icon={<QrCode className="w-4 h-4" />} onClick={() => setTab('share')} />
                    </nav>
                    </>
                    )}
                </div>

                {/* Right sidebar — hidden during test booking flow */}
                {!customerFlowOpen && (
                <aside className="hidden xl:block space-y-4 sticky top-0">
                    <SidebarShare bookUrl={bookUrl} qrUrl={qrUrl} copied={copied} onCopy={copyLink} onShare={shareLink} onTestJob={openTestBooking} busy={busy} onOpenQr={() => setQrOpen(true)} />
                    <div className="bg-white rounded-2xl border border-[#E3E8EA] p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#5B6770] mb-3">Today&apos;s slots</h3>
                        {todaySlots.length === 0 ? (
                            <p className="text-sm text-[#5B6770]">No slots configured for today.</p>
                        ) : (
                            <ul className="space-y-2">
                                {todaySlots.map((s) => (
                                    <li key={s.id} className={cn('rounded-lg px-3 py-2 text-xs font-medium border', s.isEmergencyOnly ? 'bg-red-50 border-red-100 text-red-800' : 'bg-[#F5F7F8] border-[#E3E8EA]')}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold">{s.label}</span>
                                            {s.isEmergencyOnly && <Flame className="w-3 h-3 text-red-500 shrink-0" />}
                                        </div>
                                        <span className="text-[#5B6770]">{s.startTime} – {s.endTime}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button
                            type="button"
                            onClick={() => { setSettingsTab('slots'); setSettingsOpen(true); }}
                            className="mt-3 w-full py-2 rounded-xl border border-[#E3E8EA] text-xs font-bold text-[#12333C] hover:bg-[#F5F7F8]"
                        >
                            Manage weekly slots
                        </button>
                    </div>
                    {profile.emergencyNote && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wide mb-1">
                                <ShieldCheck className="w-4 h-4" /> Emergency policy
                            </div>
                            <p className="text-sm text-amber-900">{profile.emergencyNote}</p>
                        </div>
                    )}
                </aside>
                )}
            </div>

            {qrOpen && (
                <QrModal
                    bookUrl={bookUrl}
                    qrUrl={qrUrl}
                    copied={copied}
                    onClose={() => setQrOpen(false)}
                    onCopy={copyLink}
                    onShare={shareLink}
                />
            )}

            {settingsOpen && (
                <SettingsModal
                    settingsTab={settingsTab}
                    setSettingsTab={setSettingsTab}
                    day={day}
                    setDay={setDay}
                    daySlots={daySlots}
                    slots={slots}
                    setSlots={setSlots}
                    draft={draft}
                    setDraft={setDraft}
                    form={form}
                    setForm={setForm}
                    profile={profile}
                    busy={busy}
                    onClose={() => setSettingsOpen(false)}
                    onSave={async () => {
                        setBusy(true);
                        try {
                            await apiPut('/api/booking/slots', { slots });
                            await apiPatch('/api/booking/settings', form);
                            await refresh();
                            setSettingsOpen(false);
                        } catch (e: any) {
                            setError(e.message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                    onConnectStripe={async () => {
                        await apiPost('/api/booking/connect-stripe', {});
                        await refresh();
                    }}
                />
            )}
        </div>
    );
}

function SharePanel({
    bookUrl,
    qrUrl,
    copied,
    onCopy,
    onShare,
    onTestJob,
    busy,
    expanded = false
}: {
    bookUrl: string;
    qrUrl: string;
    copied: boolean;
    onCopy: () => void;
    onShare: () => void;
    onTestJob: () => void;
    busy: boolean;
    expanded?: boolean;
}) {
    return (
        <div className={cn('space-y-4', expanded && 'lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0')}>
            <div className="bg-[#12333C] text-white rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                    <QrCode className="w-5 h-5 text-[#C8D400]" />
                    <h2 className="font-bold text-base">Your Public Booking Link</h2>
                </div>
                <p className="text-sm text-white/60 mb-4">Share link or QR so customers book into your slots.</p>
                <div className="flex gap-2">
                    <input readOnly value={bookUrl} className="flex-1 rounded-lg bg-white/10 border border-white/10 px-3 py-2.5 text-xs truncate" />
                    <button type="button" onClick={onCopy} className="px-3 rounded-lg bg-[#C8D400] text-[#12333C] text-xs font-bold inline-flex items-center gap-1 shrink-0">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={onShare} className="px-3 rounded-lg bg-white/10 text-white text-xs font-bold shrink-0">
                        <Share2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <div className="bg-[#F5F7F8] border border-[#E3E8EA] rounded-2xl p-5 flex flex-col items-center justify-center">
                <img src={qrUrl} alt="Booking QR" className="w-48 h-48 lg:w-56 lg:h-56 rounded-xl border border-[#E3E8EA] bg-white" />
                <p className="text-sm text-[#5B6770] mt-3 text-center">Scan to open customer booking</p>
                <Link to="/book" target="_blank" className="mt-3 text-sm font-bold text-[#12333C] underline">
                    Open customer page
                </Link>
            </div>
            <button type="button" disabled={busy} onClick={onTestJob} className={cn('w-full py-3 rounded-xl bg-[#C8D400] text-[#12333C] text-sm font-bold disabled:opacity-60', expanded && 'lg:col-span-2')}>
                Book Test Job
            </button>
        </div>
    );
}

function SidebarShare({
    bookUrl,
    qrUrl,
    copied,
    onCopy,
    onShare,
    onTestJob,
    busy,
    onOpenQr
}: {
    bookUrl: string;
    qrUrl: string;
    copied: boolean;
    onCopy: () => void;
    onShare: () => void;
    onTestJob: () => void;
    busy: boolean;
    onOpenQr: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-[#E3E8EA] overflow-hidden">
            <div className="bg-[#12333C] px-4 py-3">
                <div className="flex items-center gap-2 text-white">
                    <QrCode className="w-4 h-4 text-[#C8D400]" />
                    <h3 className="font-bold text-sm">Share & Book</h3>
                </div>
            </div>
            <div className="p-4 space-y-3">
                <button type="button" onClick={onOpenQr} className="w-full cursor-pointer">
                    <img src={qrUrl} alt="QR" className="w-full aspect-square max-w-[200px] mx-auto rounded-xl border border-[#E3E8EA] bg-white p-2" />
                </button>
                <div className="flex gap-1.5">
                    <input readOnly value={bookUrl} className="flex-1 min-w-0 rounded-lg border border-[#E3E8EA] bg-[#F5F7F8] px-2 py-2 text-[10px] truncate" />
                    <button type="button" onClick={onCopy} className="px-2.5 rounded-lg bg-[#12333C] text-white text-[10px] font-bold shrink-0">
                        {copied ? '✓' : 'Copy'}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={onShare} className="py-2 rounded-xl border border-[#E3E8EA] text-xs font-bold text-[#12333C] flex items-center justify-center gap-1">
                        <Share2 className="w-3.5 h-3.5" /> Share
                    </button>
                    <Link to="/book" target="_blank" className="py-2 rounded-xl bg-[#C8D400] text-[#12333C] text-xs font-bold flex items-center justify-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" /> Preview
                    </Link>
                </div>
                <button type="button" disabled={busy} onClick={onTestJob} className="w-full py-2.5 rounded-xl bg-[#12333C] text-white text-xs font-bold disabled:opacity-60">
                    Book Test Job
                </button>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    sub,
    accent,
    icon
}: {
    label: string;
    value: string | number;
    sub: string;
    accent?: string;
    icon?: ReactNode;
}) {
    return (
        <div className={cn('rounded-2xl border border-[#E3E8EA] p-4 relative overflow-hidden', accent || 'bg-white')}>
            {icon && <div className={cn('absolute top-3 right-3 opacity-80', !accent && 'text-[#5B6770]')}>{icon}</div>}
            <p className={cn('text-[10px] font-bold uppercase tracking-wider', accent ? 'opacity-90' : 'text-[#5B6770]')}>{label}</p>
            <p className={cn('text-2xl lg:text-3xl font-black mt-1 leading-none', accent ? '' : 'text-[#12333C]')}>{value}</p>
            <p className={cn('text-[10px] mt-1', accent ? 'opacity-80' : 'text-[#5B6770]')}>{sub}</p>
        </div>
    );
}

function QrModal({
    bookUrl,
    qrUrl,
    copied,
    onClose,
    onCopy,
    onShare
}: {
    bookUrl: string;
    qrUrl: string;
    copied: boolean;
    onClose: () => void;
    onCopy: () => void;
    onShare: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-[320px] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-[#12333C]">Booking QR Code</h3>
                    <button type="button" onClick={onClose}><X className="w-5 h-5 text-[#5B6770]" /></button>
                </div>
                <img src={qrUrl} alt="QR" className="w-full aspect-square rounded-xl border border-[#E3E8EA]" />
                <p className="text-[11px] text-[#5B6770] mt-2 text-center break-all">{bookUrl}</p>
                <div className="mt-3 flex gap-2">
                    <button type="button" onClick={onCopy} className="flex-1 py-2 rounded-xl bg-[#12333C] text-white text-xs font-bold flex items-center justify-center gap-1">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <button type="button" onClick={onShare} className="flex-1 py-2 rounded-xl bg-[#C8D400] text-[#12333C] text-xs font-bold flex items-center justify-center gap-1">
                        <Share2 className="w-3 h-3" /> Share
                    </button>
                </div>
            </div>
        </div>
    );
}

function TabBtn({
    active,
    label,
    icon,
    onClick,
    horizontal = false
}: {
    active: boolean;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    horizontal?: boolean;
}) {
    if (horizontal) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    'inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-xs font-bold border-b-2 -mb-px transition cursor-pointer',
                    active ? 'text-[#12333C] border-[#C8D400] bg-white' : 'text-[#5B6770] border-transparent hover:text-[#12333C]'
                )}
            >
                {icon}
                {label}
            </button>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer',
                active ? 'text-[#12333C]' : 'text-[#5B6770]'
            )}
        >
            <span className={cn('w-8 h-8 rounded-xl flex items-center justify-center', active && 'bg-[#C8D400]/35')}>
                {icon}
            </span>
            {label}
        </button>
    );
}

function JobCard({
    booking: b,
    onConfirm,
    onDone,
    onCancel,
    onReminder
}: {
    booking: Booking;
    onConfirm: () => void;
    onDone: () => void;
    onCancel: () => void;
    onReminder: () => void;
}) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`;
    return (
        <article className={cn('bg-white rounded-2xl overflow-hidden shadow-sm border', b.isEmergency ? 'border-red-300' : 'border-[#E3E8EA]')}>
            {b.isEmergency && (
                <div className="bg-red-600 text-white px-3 py-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Emergency Callout (Priority 1)
                    </span>
                    <span className="text-[9px] font-black bg-white text-red-600 px-1.5 py-0.5 rounded">URGENT</span>
                </div>
            )}
            <div className="p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-[#12333C]">{b.customerName}</h3>
                            <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{b.status}</span>
                        </div>
                        <p className="text-[11px] text-[#5B6770] mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {b.date}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {b.slotLabel}</span>
                        </p>
                    </div>
                    {!b.depositPaid && (
                        <span className="text-[9px] font-bold bg-[#F5F7F8] text-[#5B6770] px-2 py-1 rounded-lg shrink-0">
                            Deposit Unpaid ({b.currency}{b.depositAmount})
                        </span>
                    )}
                </div>
                <div className="bg-[#F5F7F8] rounded-xl px-2.5 py-2 flex items-start justify-between gap-2 text-xs">
                    <span className="flex items-start gap-1.5 text-[#5B6770]">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {b.address}
                    </span>
                    <a href={maps} target="_blank" rel="noreferrer" className="text-sky-600 font-bold shrink-0">Navigate</a>
                </div>
                <div className={cn('rounded-xl px-2.5 py-2 text-xs', b.isEmergency ? 'bg-red-50 border border-red-100 text-red-900' : 'bg-[#F5F7F8] text-[#1C2430]')}>
                    <span className="font-black uppercase text-[9px] tracking-wide opacity-70">Reported problem</span>
                    <p className="font-medium mt-0.5">{b.description}</p>
                </div>
                {b.status !== 'cancelled' && b.status !== 'done' && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-[#12333C] text-white text-[10px] font-bold">
                            <Phone className="w-3 h-3 text-[#C8D400]" /> {b.phone}
                        </a>
                        <button type="button" onClick={onReminder} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#E3E8EA] text-[10px] font-bold text-[#5B6770]">
                            <CheckCircle2 className="w-3 h-3" />
                            {b.reminderSent ? 'Reminder sent' : 'Send 24h Reminder'}
                        </button>
                        {b.status !== 'confirmed' ? (
                            <button type="button" onClick={onConfirm} className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-sky-600 text-white text-[10px] font-bold">
                                <Check className="w-3 h-3" /> Accept & Confirm
                            </button>
                        ) : (
                            <button type="button" onClick={onDone} className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-bold">
                                Mark Done
                            </button>
                        )}
                        <button type="button" onClick={onCancel} className="p-2 text-[#5B6770] hover:text-red-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}

function SettingsModal(props: {
    settingsTab: SettingsTab;
    setSettingsTab: (t: SettingsTab) => void;
    day: number;
    setDay: (d: number) => void;
    daySlots: Slot[];
    slots: Slot[];
    setSlots: Dispatch<SetStateAction<Slot[]>>;
    draft: { startTime: string; endTime: string; label: string; isEmergencyOnly: boolean };
    setDraft: Dispatch<SetStateAction<{ startTime: string; endTime: string; label: string; isEmergencyOnly: boolean }>>;
    form: any;
    setForm: Dispatch<SetStateAction<any>>;
    profile: Profile;
    busy: boolean;
    onClose: () => void;
    onSave: () => void;
    onConnectStripe: () => void;
}) {
    const { settingsTab, setSettingsTab, day, setDay, daySlots, slots, setSlots, draft, setDraft, form, setForm, profile, busy, onClose, onSave, onConnectStripe } = props;

    const tabs: { key: SettingsTab; label: string; icon: typeof Clock }[] = [
        { key: 'slots', label: 'Weekly Slots & Emergency', icon: Clock },
        { key: 'stripe', label: 'Stripe Connect', icon: CreditCard },
        { key: 'deposit', label: 'Deposit Amount', icon: Wallet },
        { key: 'twilio', label: 'Twilio SMS', icon: MessageSquare },
        { key: 'profile', label: 'Business Profile', icon: User }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/45 p-0 lg:p-6">
            <div className="bg-[#F5F7F8] w-full max-w-4xl max-h-[92dvh] rounded-t-2xl lg:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                <div className="bg-[#12333C] text-white px-4 py-3 flex justify-between items-start gap-2">
                    <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#C8D400]/20 flex items-center justify-center shrink-0">
                            <Settings className="w-4 h-4 text-[#C8D400]" />
                        </div>
                        <div>
                            <h2 className="font-bold text-sm">Booking & Schedule Settings</h2>
                            <p className="text-[11px] text-white/55 mt-0.5">Manage time slots, Stripe Connect payouts, and deposits</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                <div className="flex items-center gap-1 px-2 pt-2 border-b border-[#E3E8EA] bg-white">
                    <button type="button" className="p-1 text-[#5B6770]"><ChevronLeft className="w-4 h-4" /></button>
                    <div className="flex-1 flex gap-1 overflow-x-auto py-1">
                        {tabs.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSettingsTab(key)}
                                className={cn(
                                    'shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border-b-2',
                                    settingsTab === key
                                        ? 'text-[#12333C] border-[#C8D400] bg-[#C8D400]/10'
                                        : 'text-[#5B6770] border-transparent'
                                )}
                            >
                                <Icon className="w-3 h-3" /> {label}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="p-1 text-[#5B6770]"><ChevronRight className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {settingsTab === 'slots' && (
                        <>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3 text-sm text-amber-900">
                                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                                <div>
                                    <strong className="block text-[10px] uppercase tracking-wide">Strict Emergency Slot Routing</strong>
                                    Slots marked <strong>EMERGENCY ONLY</strong> only appear when customers choose an emergency booking.
                                </div>
                            </div>

                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B6770]">Select day to configure</p>
                            <div className="grid grid-cols-7 gap-1.5">
                                {DAYS.map((name, i) => {
                                    const count = slots.filter((s) => s.dayOfWeek === i && s.enabled).length;
                                    const emCount = slots.filter((s) => s.dayOfWeek === i && s.enabled && s.isEmergencyOnly).length;
                                    return (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => setDay(i)}
                                            className={cn(
                                                'shrink-0 min-w-[48px] rounded-xl px-2 py-2 text-center border text-[10px] font-bold',
                                                day === i ? 'bg-[#12333C] text-white border-[#12333C]' : 'bg-white border-[#E3E8EA] text-[#12333C]'
                                            )}
                                        >
                                            {name}
                                            <div className="text-sm font-black leading-none mt-0.5">{count}</div>
                                            {emCount > 0 && <Flame className="w-2.5 h-2.5 text-red-500 mx-auto mt-0.5" />}
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B6770]">
                                Slots for {DAYS[day]} ({daySlots.length})
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {daySlots.map((s) => (
                                <div
                                    key={s.id}
                                    className={cn(
                                        'bg-white border rounded-xl p-2.5 flex gap-2',
                                        s.isEmergencyOnly ? 'border-red-200 bg-red-50/50' : 'border-[#E3E8EA]'
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={s.enabled}
                                        onChange={() =>
                                            setSlots((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)))
                                        }
                                        className="mt-1 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="font-bold text-xs text-[#12333C]">{s.label}</p>
                                            <span
                                                className={cn(
                                                    'text-[8px] font-black uppercase px-1.5 py-0.5 rounded',
                                                    s.isEmergencyOnly ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-700'
                                                )}
                                            >
                                                {s.isEmergencyOnly ? 'Emergency Only' : 'Standard Slot'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-[#5B6770] mt-0.5">{s.startTime} – {s.endTime}</p>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSlots((prev) =>
                                                    prev.map((x) => (x.id === s.id ? { ...x, isEmergencyOnly: !x.isEmergencyOnly } : x))
                                                )
                                            }
                                            className={cn(
                                                'mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-lg border',
                                                s.isEmergencyOnly
                                                    ? 'bg-red-600 text-white border-red-600'
                                                    : 'bg-white text-[#5B6770] border-[#E3E8EA]'
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
                            ))}
                            </div>

                            <div className="bg-white border border-[#E3E8EA] rounded-xl p-4 space-y-3 lg:max-w-xl">
                                <p className="text-[10px] font-bold uppercase text-[#5B6770]">Add new slot</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[10px] font-bold text-[#5B6770]">
                                        Start
                                        <input type="time" value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} className="mt-0.5 w-full rounded-lg border border-[#E3E8EA] px-2 py-1.5 text-xs" />
                                    </label>
                                    <label className="text-[10px] font-bold text-[#5B6770]">
                                        End
                                        <input type="time" value={draft.endTime} onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))} className="mt-0.5 w-full rounded-lg border border-[#E3E8EA] px-2 py-1.5 text-xs" />
                                    </label>
                                </div>
                                <label className="block text-[10px] font-bold text-[#5B6770]">
                                    Slot label
                                    <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} className="mt-0.5 w-full rounded-lg border border-[#E3E8EA] px-2 py-1.5 text-xs" placeholder="Morning Slot" />
                                </label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSlots((prev) => [
                                            ...prev,
                                            { id: `slot_${Date.now()}`, dayOfWeek: day, ...draft, enabled: true }
                                        ])
                                    }
                                    className="w-full py-2.5 rounded-xl bg-[#12333C] text-white text-[10px] font-bold flex items-center justify-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> Add Slot
                                </button>
                            </div>
                        </>
                    )}

                    {settingsTab === 'stripe' && (
                        <div className="bg-white rounded-xl border border-[#E3E8EA] p-4 space-y-2 text-sm">
                            <p className="text-xs text-[#5B6770]">
                                Status: <strong className="text-[#12333C]">{profile.stripeConnected ? 'Connected — Payouts Active' : 'Not connected'}</strong>
                                <span className="block text-[10px] mt-1">Simulated until you add Stripe keys in backend .env</span>
                            </p>
                            <button type="button" onClick={onConnectStripe} className="w-full py-2.5 rounded-xl bg-[#12333C] text-white text-xs font-bold">
                                Connect Stripe
                            </button>
                        </div>
                    )}

                    {settingsTab === 'deposit' && (
                        <div className="bg-white rounded-xl border border-[#E3E8EA] p-4 grid grid-cols-3 gap-2">
                            <label className="text-[10px] font-bold text-[#5B6770] col-span-1">
                                Currency
                                <select value={form.currency} onChange={(e) => setForm((f: any) => ({ ...f, currency: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-2 py-1.5 text-sm">
                                    <option value="£">£</option>
                                    <option value="$">$</option>
                                    <option value="€">€</option>
                                </select>
                            </label>
                            <label className="text-[10px] font-bold text-[#5B6770] col-span-2">
                                Deposit amount
                                <input type="number" min={0} value={form.deposit} onChange={(e) => setForm((f: any) => ({ ...f, deposit: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-[#E3E8EA] px-2 py-1.5 text-sm" />
                            </label>
                        </div>
                    )}

                    {settingsTab === 'twilio' && (
                        <p className="bg-white rounded-xl border border-[#E3E8EA] p-4 text-xs text-[#5B6770]">
                            SMS / WhatsApp reminders are simulated in this demo. Job cards include “Send 24h Reminder”.
                        </p>
                    )}

                    {settingsTab === 'profile' && (
                        <div className="bg-white rounded-xl border border-[#E3E8EA] p-3 space-y-2">
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
                                <label key={key} className="block text-[10px] font-bold text-[#5B6770]">
                                    {label}
                                    <div className="relative mt-0.5">
                                        <Icon className="w-3.5 h-3.5 text-[#5B6770] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            value={form[key]}
                                            onChange={(e) =>
                                                setForm((f: any) => ({
                                                    ...f,
                                                    [key]: key === 'phone' ? restrictPhoneInput(e.target.value) : e.target.value
                                                }))
                                            }
                                            inputMode={key === 'phone' ? 'numeric' : undefined}
                                            maxLength={key === 'phone' ? 11 : undefined}
                                            className="w-full rounded-lg border border-[#E3E8EA] pl-9 pr-2 py-2 text-xs font-medium text-[#12333C] bg-[#F5F7F8] focus:bg-white focus:outline-none focus:border-[#12333C]"
                                        />
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t bg-white px-3 py-2.5 flex justify-between items-center">
                    <button type="button" onClick={onClose} className="text-xs font-bold text-[#5B6770]">Cancel</button>
                    <button type="button" disabled={busy} onClick={onSave} className="px-4 py-2 rounded-xl bg-[#C8D400] text-[#12333C] text-xs font-bold disabled:opacity-60">
                        Save All Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
