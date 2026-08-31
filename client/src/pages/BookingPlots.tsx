import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    ExternalLink,
    Flame,
    LayoutDashboard,
    MapPin,
    Phone,
    QrCode,
    Settings,
    ShieldCheck,
    Share2,
    User,
    Wallet,
    Wrench,
    X,
    Zap
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, cn } from '../lib/utils';
import CustomerBookingFlow from '../components/CustomerBookingFlow';
import BookingSetupWizard, { type SetupForm } from '../components/BookingSetupWizard';

type Tab = 'dashboard' | 'share';
type Filter = 'active' | 'emergencies' | 'standard' | 'all' | 'done';

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
    const [paymentsMode, setPaymentsMode] = useState<'stripe' | 'simulated'>('simulated');
    const [qrOpen, setQrOpen] = useState(false);
    const [customerFlowOpen, setCustomerFlowOpen] = useState(false);
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
            setPaymentsMode('simulated');
            return;
        }

        setPaymentsMode(data.paymentsMode === 'stripe' ? 'stripe' : 'simulated');
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
                <p className="font-bold text-[#0F172A]">Loading Booking Plots...</p>
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
            {/* â€”â€” Header â€”â€” */}
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6 lg:py-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-[#F59E0B] text-white flex items-center justify-center font-black text-lg shrink-0">
                            {initial}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="font-black text-lg lg:text-xl truncate">{profile.businessName}</h1>
                                <span className="text-[10px] font-black bg-[#F59E0B] text-white px-2 py-0.5 rounded">PRO</span>
                            </div>
                            <p className="text-sm text-white/60 truncate">{profile.name} Â· {profile.tradeType}</p>
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
                        <button type="button" onClick={() => setQrOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111827] text-[#F59E0B] text-xs font-bold">
                            <QrCode className="w-3.5 h-3.5" /> QR
                        </button>
                        <button type="button" onClick={shareLink} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111827] text-white text-xs font-bold">
                            <Share2 className="w-3.5 h-3.5" /> Share
                        </button>
                        <Link to="/book" target="_blank" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold">
                            <ExternalLink className="w-3.5 h-3.5" /> Customer View
                        </Link>
                        <Link
                            to="/booking/settings"
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 inline-flex"
                            title="Schedule settings"
                        >
                            <Settings className="w-4 h-4" />
                        </Link>
                        <button type="button" onClick={switchProfile} className="p-2 rounded-xl bg-white/10 hover:bg-white/15" title="Start over">
                            <User className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* â€”â€” Stats row â€”â€” */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Emergencies" value={stats.emergencies} sub="Priority callouts" accent="bg-red-600 text-white" icon={<Zap className="w-4 h-4" />} />
                <StatCard label="Standard" value={stats.standard} sub="Regular schedule" icon={<Clock className="w-4 h-4 text-sky-600" />} />
                <StatCard label="Active" value={stats.active} sub="Open jobs" icon={<LayoutDashboard className="w-4 h-4 text-[#0F172A]" />} />
                <StatCard label="Done" value={stats.done} sub="Completed" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} />
                <StatCard label="Deposit" value={`${profile.currency}${profile.deposit}`} sub="Per booking" icon={<span className="text-emerald-600 font-black">£</span>} />
                <StatCard label="Slots" value={enabledSlots} sub={`${emergencySlots} emergency`} icon={<Calendar className="w-4 h-4 text-[#0F172A]" />} />
            </div>

            {/* â€”â€” Main content: bookings + sidebar â€”â€” */}
            <div className={cn('grid grid-cols-1 gap-4 items-start', customerFlowOpen ? '' : 'xl:grid-cols-[1fr_360px]')}>
                {/* Bookings panel */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col min-h-[480px]">
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
                                    acceptingEmergencies: profile.acceptingEmergencies,
                                    paymentsMode
                                }}
                                slots={slots}
                                onBack={closeTestBooking}
                                onSuccess={() => refresh()}
                            />
                        </div>
                    ) : (
                    <>
                    {/* Desktop tabs */}
                    <div className="hidden md:flex border-b border-[#E2E8F0] px-4 pt-3 gap-1">
                        <TabBtn active={tab === 'dashboard'} label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} onClick={() => setTab('dashboard')} horizontal />
                        <Link
                            to="/booking/settings"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition"
                        >
                            <Clock className="w-4 h-4" /> Slots & Stripe
                        </Link>
                        <TabBtn active={tab === 'share'} label="Share Link" icon={<QrCode className="w-4 h-4" />} onClick={() => setTab('share')} horizontal />
                    </div>

                    <div className="flex-1 p-4 lg:p-5 space-y-3">
                        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

                        {tab === 'share' ? (
                            <SharePanel bookUrl={bookUrl} qrUrl={qrUrl} copied={copied} onCopy={copyLink} onShare={shareLink} onTestJob={openTestBooking} busy={busy} expanded />
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-1.5 bg-[#F8FAFC] rounded-xl p-1.5">
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
                                                    ? 'bg-white text-[#0F172A] shadow-sm'
                                                    : key === 'emergencies'
                                                      ? 'text-red-600 hover:bg-red-50'
                                                      : 'text-[#64748B] hover:bg-white/60'
                                            )}
                                        >
                                            {key === 'emergencies' && <Flame className="w-3 h-3 inline mr-1" />}
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {filtered.length === 0 ? (
                                    <div className="border border-dashed border-[#E2E8F0] rounded-2xl p-10 lg:p-16 text-center flex flex-col items-center justify-center min-h-[340px] bg-[#FAFBFC]">
                                        <div className="w-20 h-20 rounded-2xl bg-[#F59E0B]/25 flex items-center justify-center mb-5">
                                            <Wrench className="w-10 h-10 text-[#0F172A]" />
                                        </div>
                                        <h3 className="font-black text-xl text-[#0F172A]">No bookings in this filter</h3>
                                        <p className="text-sm text-[#64748B] mt-2 max-w-lg leading-relaxed">
                                            Share your public booking link or QR code with customers so they can book directly into your slots.
                                        </p>
                                        <div className="mt-6 flex flex-wrap gap-3 justify-center">
                                            <button type="button" onClick={() => setQrOpen(true)} className="px-5 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:bg-[#111827] transition">
                                                <QrCode className="w-4 h-4 text-[#F59E0B]" /> Show Booking QR
                                            </button>
                                            <button type="button" onClick={openTestBooking} className="px-5 py-3 rounded-xl bg-[#F59E0B] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:bg-[#D97706] transition">
                                                <Wrench className="w-4 h-4" /> Book Test Job
                                            </button>
                                        </div>
                                        <p className="text-xs text-[#64748B] mt-4">Book Test Job opens the customer booking flow right here â€” no separate page.</p>
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
                    <nav className="md:hidden border-t border-[#E2E8F0] px-1 py-1.5 flex bg-[#F8FAFC]">
                        <TabBtn active={tab === 'dashboard'} label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} onClick={() => setTab('dashboard')} />
                        <Link to="/booking/settings" className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold text-[#64748B]">
                            <Clock className="w-4 h-4" /> Slots
                        </Link>
                        <TabBtn active={tab === 'share'} label="Share" icon={<QrCode className="w-4 h-4" />} onClick={() => setTab('share')} />
                    </nav>
                    </>
                    )}
                </div>

                {/* Right sidebar â€” hidden during test booking flow */}
                {!customerFlowOpen && (
                <aside className="hidden xl:block space-y-4 sticky top-0">
                    <SidebarShare bookUrl={bookUrl} qrUrl={qrUrl} copied={copied} onCopy={copyLink} onShare={shareLink} onTestJob={openTestBooking} busy={busy} onOpenQr={() => setQrOpen(true)} />
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">Today&apos;s slots</h3>
                        {todaySlots.length === 0 ? (
                            <p className="text-sm text-[#64748B]">No slots configured for today.</p>
                        ) : (
                            <ul className="space-y-2">
                                {todaySlots.map((s) => (
                                    <li key={s.id} className={cn('rounded-lg px-3 py-2 text-xs font-medium border', s.isEmergencyOnly ? 'bg-red-50 border-red-100 text-red-800' : 'bg-[#F8FAFC] border-[#E2E8F0]')}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-bold">{s.label}</span>
                                            {s.isEmergencyOnly && <Flame className="w-3 h-3 text-red-500 shrink-0" />}
                                        </div>
                                        <span className="text-[#64748B]">{s.startTime} â€“ {s.endTime}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Link
                            to="/booking/settings"
                            className="mt-3 w-full py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC] block text-center"
                        >
                            Manage weekly slots
                        </Link>
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
            <div className="bg-[#0F172A] text-white rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                    <QrCode className="w-5 h-5 text-[#F59E0B]" />
                    <h2 className="font-bold text-base">Your Public Booking Link</h2>
                </div>
                <p className="text-sm text-white/60 mb-4">Share link or QR so customers book into your slots.</p>
                <div className="flex gap-2">
                    <input readOnly value={bookUrl} className="flex-1 rounded-lg bg-white/10 border border-white/10 px-3 py-2.5 text-xs truncate" />
                    <button type="button" onClick={onCopy} className="px-3 rounded-lg bg-[#F59E0B] text-white text-xs font-bold inline-flex items-center gap-1 shrink-0">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={onShare} className="px-3 rounded-lg bg-white/10 text-white text-xs font-bold shrink-0">
                        <Share2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5 flex flex-col items-center justify-center">
                <img src={qrUrl} alt="Booking QR" className="w-48 h-48 lg:w-56 lg:h-56 rounded-xl border border-[#E2E8F0] bg-white" />
                <p className="text-sm text-[#64748B] mt-3 text-center">Scan to open customer booking</p>
                <Link to="/book" target="_blank" className="mt-3 text-sm font-bold text-[#0F172A] underline">
                    Open customer page
                </Link>
            </div>
            <button type="button" disabled={busy} onClick={onTestJob} className={cn('w-full py-3 rounded-xl bg-[#F59E0B] text-white text-sm font-bold disabled:opacity-60', expanded && 'lg:col-span-2')}>
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
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
            <div className="bg-[#0F172A] px-4 py-3">
                <div className="flex items-center gap-2 text-white">
                    <QrCode className="w-4 h-4 text-[#F59E0B]" />
                    <h3 className="font-bold text-sm">Share & Book</h3>
                </div>
            </div>
            <div className="p-4 space-y-3">
                <button type="button" onClick={onOpenQr} className="w-full cursor-pointer">
                    <img src={qrUrl} alt="QR" className="w-full aspect-square max-w-[200px] mx-auto rounded-xl border border-[#E2E8F0] bg-white p-2" />
                </button>
                <div className="flex gap-1.5">
                    <input readOnly value={bookUrl} className="flex-1 min-w-0 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-2 text-[10px] truncate" />
                    <button type="button" onClick={onCopy} className="px-2.5 rounded-lg bg-[#0F172A] text-white text-[10px] font-bold shrink-0">
                        {copied ? 'âœ“' : 'Copy'}
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={onShare} className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#0F172A] flex items-center justify-center gap-1">
                        <Share2 className="w-3.5 h-3.5" /> Share
                    </button>
                    <Link to="/book" target="_blank" className="py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold flex items-center justify-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" /> Preview
                    </Link>
                </div>
                <button type="button" disabled={busy} onClick={onTestJob} className="w-full py-2.5 rounded-xl bg-[#0F172A] text-white text-xs font-bold disabled:opacity-60">
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
        <div className={cn('rounded-2xl border border-[#E2E8F0] p-4 relative overflow-hidden', accent || 'bg-white')}>
            {icon && <div className={cn('absolute top-3 right-3 opacity-80', !accent && 'text-[#64748B]')}>{icon}</div>}
            <p className={cn('text-[10px] font-bold uppercase tracking-wider', accent ? 'opacity-90' : 'text-[#64748B]')}>{label}</p>
            <p className={cn('text-2xl lg:text-3xl font-black mt-1 leading-none', accent ? '' : 'text-[#0F172A]')}>{value}</p>
            <p className={cn('text-[10px] mt-1', accent ? 'opacity-80' : 'text-[#64748B]')}>{sub}</p>
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
                    <h3 className="font-bold text-[#0F172A]">Booking QR Code</h3>
                    <button type="button" onClick={onClose}><X className="w-5 h-5 text-[#64748B]" /></button>
                </div>
                <img src={qrUrl} alt="QR" className="w-full aspect-square rounded-xl border border-[#E2E8F0]" />
                <p className="text-[11px] text-[#64748B] mt-2 text-center break-all">{bookUrl}</p>
                <div className="mt-3 flex gap-2">
                    <button type="button" onClick={onCopy} className="flex-1 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold flex items-center justify-center gap-1">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <button type="button" onClick={onShare} className="flex-1 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold flex items-center justify-center gap-1">
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
                    active ? 'text-[#0F172A] border-[#F59E0B] bg-white' : 'text-[#64748B] border-transparent hover:text-[#0F172A]'
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
                active ? 'text-[#0F172A]' : 'text-[#64748B]'
            )}
        >
            <span className={cn('w-8 h-8 rounded-xl flex items-center justify-center', active && 'bg-[#F59E0B]/35')}>
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
        <article className={cn('bg-white rounded-2xl overflow-hidden shadow-sm border', b.isEmergency ? 'border-red-300' : 'border-[#E2E8F0]')}>
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
                            <h3 className="font-bold text-[#0F172A]">{b.customerName}</h3>
                            <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{b.status}</span>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {b.date}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {b.slotLabel}</span>
                        </p>
                    </div>
                    {!b.depositPaid && (
                        <span className="text-[9px] font-bold bg-[#F8FAFC] text-[#64748B] px-2 py-1 rounded-lg shrink-0">
                            Deposit Unpaid ({b.currency}{b.depositAmount})
                        </span>
                    )}
                </div>
                <div className="bg-[#F8FAFC] rounded-xl px-2.5 py-2 flex items-start justify-between gap-2 text-xs">
                    <span className="flex items-start gap-1.5 text-[#64748B]">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {b.address}
                    </span>
                    <a href={maps} target="_blank" rel="noreferrer" className="text-sky-600 font-bold shrink-0">Navigate</a>
                </div>
                <div className={cn('rounded-xl px-2.5 py-2 text-xs', b.isEmergency ? 'bg-red-50 border border-red-100 text-red-900' : 'bg-[#F8FAFC] text-[#0F172A]')}>
                    <span className="font-black uppercase text-[9px] tracking-wide opacity-70">Reported problem</span>
                    <p className="font-medium mt-0.5">{b.description}</p>
                </div>
                {b.status !== 'cancelled' && b.status !== 'done' && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-[#0F172A] text-white text-[10px] font-bold">
                            <Phone className="w-3 h-3 text-[#F59E0B]" /> {b.phone}
                        </a>
                        <button type="button" onClick={onReminder} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#E2E8F0] text-[10px] font-bold text-[#64748B]">
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
                        <button type="button" onClick={onCancel} className="p-2 text-[#64748B] hover:text-red-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}

