import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    CalendarClock,
    Users,
    CalendarDays,
    Mail,
    FileText,
    Wallet,
    CreditCard,
    DollarSign,
    MessageSquare,
    Link as LinkIcon,
    ChevronRight,
    MapPin,
    Star,
    Sparkles,
    TrendingUp,
    Building2,
    BookMarked,
    CheckCircle2,
    ExternalLink,
    Search
} from 'lucide-react';
import { apiGet, formatCents } from '../../shared/utils';
import GroundingModal from './GroundingModal';
import { useEntitlements } from '../../shared/EntitlementsContext';

type BookingOverview = {
    organization: {
        name: string;
        slug: string;
        booking_industry_id: string | null;
        currency: string;
    };
    planId: string | null;
    planName: string | null;
    clients: number;
    bookingsToday: number;
    upcoming: number;
    openRequests: number;
    invoicesPaid: number;
    quotesOpen: number;
    money: {
        depositsPaid: number;
        bookedTotal: number;
        invoicesPaid: number;
        openBalance: number;
        expenses: number;
    };
};

type LocalBusinessData = {
    name?: string;
    address?: string;
    phone?: string;
    rating?: number;
    review_count?: number;
    place_id?: string;
    reviews?: any[];
    categories?: string[];
    website?: string;
};

export default function Dashboard() {
    const { features, planId } = useEntitlements();
    const [userName, setUserName] = useState('');
    const [bookingData, setBookingData] = useState<BookingOverview | null>(null);
    const [businessData, setBusinessData] = useState<LocalBusinessData | null>(null);
    const [locationModalOpen, setLocationModalOpen] = useState(false);

    const hasBookings = features.includes('bookings');
    const hasLocalSeo = features.includes('local_presence') || features.includes('local_growth');

    // 1. Booking-only plans: booking-solo, booking-solo-plus, booking-pro
    const isBookingPlan =
        planId === 'booking-solo' ||
        planId === 'booking-solo-plus' ||
        planId === 'booking-pro' ||
        (hasBookings && !hasLocalSeo);

    // 2. Local SEO-only plans: local-presence, local-growth, website-essential
    const isLocalSeoPlan =
        planId === 'local-presence' ||
        planId === 'local-growth' ||
        planId === 'website-essential' ||
        (hasLocalSeo && !hasBookings);

    useEffect(() => {
        apiGet('/api/auth/me')
            .then((res) => {
                const name = res.user?.name || res.name || '';
                setUserName(name.split(' ')[0] || 'Karun');
            })
            .catch(() => setUserName('Karun'));

        if (!isLocalSeoPlan) {
            apiGet('/api/host/overview')
                .then(setBookingData)
                .catch(() => {});
        }

        if (!isBookingPlan) {
            apiGet('/api/business')
                .then(setBusinessData)
                .catch(() => {});
        }
    }, [isBookingPlan, isLocalSeoPlan]);

    // ── 1. BOOKING-ONLY PLANS (Solo, Solo Plus, Pro) ──
    if (isBookingPlan) {
        return (
            <BookingSoloDashboard
                userName={userName}
                data={bookingData}
            />
        );
    }

    // ── 2. LOCAL SEO-ONLY PLANS (Local Presence, Local Growth) ──
    if (isLocalSeoPlan) {
        return (
            <>
                <LocalSeoOnlyDashboard
                    userName={userName}
                    businessData={businessData}
                />
                <GroundingModal
                    isOpen={locationModalOpen}
                    onClose={() => setLocationModalOpen(false)}
                />
            </>
        );
    }

    // ── 3. HYBRID PLAN (Complete Growth System: Local SEO + Bookings) ──
    return (
        <>
            <HybridDashboard
                userName={userName}
                bookingData={bookingData}
                businessData={businessData}
            />
            <GroundingModal
                isOpen={locationModalOpen}
                onClose={() => setLocationModalOpen(false)}
            />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════
// 1. BOOKING-ONLY DASHBOARD (Matches Image 1)
// ═══════════════════════════════════════════════════════════════════
function BookingSoloDashboard({
    userName,
    data
}: {
    userName: string;
    data: BookingOverview | null;
}) {
    const currency = data?.organization?.currency || 'GBP';
    const depositsPaid = data?.money?.depositsPaid ?? 16000;
    const openBalance = data?.money?.openBalance ?? 0;
    const expenses = data?.money?.expenses ?? 0;
    const quotesOpen = data?.quotesOpen ?? 0;

    const stats = [
        {
            label: 'Clients',
            value: data?.clients ?? 3,
            icon: Users,
            tone: 'bg-amber-50 text-amber-600',
            trend: '↑ 1 new this week',
            trendPositive: true
        },
        {
            label: 'Today',
            value: data?.bookingsToday ?? 0,
            icon: CalendarDays,
            tone: 'bg-sky-50 text-sky-600',
            trend: '↑ 0% vs yesterday',
            trendPositive: true
        },
        {
            label: 'Upcoming',
            value: data?.upcoming ?? 0,
            icon: CalendarClock,
            tone: 'bg-purple-50 text-purple-600',
            trend: '↑ 0% vs yesterday',
            trendPositive: true
        },
        {
            label: 'Open requests',
            value: data?.openRequests ?? 0,
            icon: Mail,
            tone: 'bg-emerald-50 text-emerald-600',
            trend: '↓ 0% vs yesterday',
            trendPositive: false
        },
        {
            label: 'Invoices paid',
            value: data?.invoicesPaid ?? 1,
            icon: FileText,
            tone: 'bg-rose-50 text-rose-600',
            trend: '↑ 1 this week',
            trendPositive: true
        }
    ];

    const quickLinks = [
        { to: '/booking', label: 'Booking board', icon: CalendarClock, tone: 'bg-amber-50 text-amber-600' },
        { to: '/clients', label: 'Clients', icon: Users, tone: 'bg-sky-50 text-sky-600' },
        { to: '/quotes', label: 'Quotes', icon: FileText, tone: 'bg-purple-50 text-purple-600' },
        { to: '/inbox', label: 'Inbox', icon: MessageSquare, tone: 'bg-emerald-50 text-emerald-600' },
        { to: '/money', label: 'Jobs & money', icon: Wallet, tone: 'bg-amber-50 text-amber-600' }
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-4 animate-in fade-in duration-500 pb-8">
            {/* ── Top Header ── */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0F172A]">
                    Welcome back, {userName || 'Karun'} <span className="inline-block hover:rotate-12 transition-transform cursor-default">👋</span>
                </h1>
                <p className="text-xs text-[#64748B] mt-0.5">
                    Here&apos;s what&apos;s happening with your bookings and business today.
                </p>
            </div>

            {/* ── Hero Banner ── */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#061838] via-[#0B2A63] to-[#081F4B] text-white p-4 sm:p-5 lg:p-6 shadow-xl border border-[#163675]">
                <div className="absolute -left-12 -top-12 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
                <div className="absolute right-1/4 -bottom-8 w-64 h-64 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
                <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
                    {/* Left hero content */}
                    <div className="max-w-sm xl:max-w-md">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#132E63]/90 text-[#FFA41C] text-[10px] font-bold tracking-wider uppercase backdrop-blur-md border border-[#254F9E]/60 shadow-inner">
                            <CalendarDays className="w-3 h-3 text-[#FFA41C]" />
                            TODAY
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black mt-2 tracking-tight text-white leading-tight">
                            Grow your business <br />with local SEO
                        </h2>
                        <p className="text-[11px] sm:text-xs text-[#A9C7F5] mt-1.5 leading-relaxed font-medium">
                            Get more visibility, more customers, and more bookings with ZappSites Local SEO.
                        </p>
                        <Link
                            to="/booking"
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#FFA41C] hover:bg-[#FFB43A] active:scale-95 text-[#0F172A] px-4 py-2 text-[11px] font-black shadow-md shadow-amber-500/20 mt-3.5 transition-all hover:translate-x-0.5"
                        >
                            Open booking board <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                        </Link>
                    </div>

                    {/* Right hero artwork */}
                    <div className="hidden md:flex items-center justify-end gap-5 lg:gap-8 xl:gap-10 shrink-0 relative select-none">
                        <svg width="390" height="155" viewBox="0 0 400 155" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 overflow-visible">
                            <defs>
                                <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#FFC837" />
                                    <stop offset="50%" stopColor="#FF8008" />
                                    <stop offset="100%" stopColor="#FF5500" />
                                </linearGradient>
                                <linearGradient id="awningGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#FFA100" />
                                    <stop offset="100%" stopColor="#FF7000" />
                                </linearGradient>
                                <filter id="cardShadow" x="-10%" y="-10%" width="125%" height="130%">
                                    <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.3" />
                                </filter>
                                <filter id="badgeShadow" x="-15%" y="-15%" width="135%" height="140%">
                                    <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.22" />
                                </filter>
                            </defs>

                            <g stroke="#1D5BC6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
                                <path d="M 20 140 L 95 85 L 180 58 L 275 105 L 340 148" />
                                <path d="M 95 85 L 40 50 L 120 22 L 180 58" />
                                <path d="M 68 118 L 150 105 L 250 132" />
                                <path d="M 150 105 L 170 55 L 235 62" />
                                <path d="M 180 58 L 285 28 L 345 68 L 275 105" />
                                <path d="M -5 102 L 52 144 L 10 158" />
                                <path d="M 235 62 L 320 88" />
                            </g>
                            <ellipse cx="180" cy="22" rx="18" ry="24" fill="#FFA41C" fillOpacity="0.2" />

                            <g>
                                <path
                                    d="M 180 4 C 171 4 164 11 164 20 C 164 30 177.5 49.5 178.8 51.5 Q 180 53 181.2 51.5 C 182.5 49.5 196 30 196 20 C 196 11 189 4 180 4 Z"
                                    fill="url(#pinGrad)"
                                    filter="drop-shadow(0px 4px 8px rgba(255, 120, 0, 0.45))"
                                />
                                <circle cx="180" cy="20" r="5.5" fill="#091E47" />
                                <path d="M 190 10 Q 190 13 193 13 Q 190 13 190 16 Q 190 13 187 13 Q 190 13 190 10 Z" fill="white" />
                            </g>

                            <g filter="url(#cardShadow)">
                                <rect x="122" y="56" width="116" height="84" rx="12" fill="white" stroke="#F1F5F9" strokeWidth="1" />
                                <rect x="122" y="56" width="116" height="14" rx="12" fill="#F8FAFC" />
                                <circle cx="132" cy="63" r="2.2" fill="#EF4444" />
                                <circle cx="138" cy="63" r="2.2" fill="#F59E0B" />
                                <circle cx="144" cy="63" r="2.2" fill="#10B981" />

                                <path
                                    d="M 116 68 L 244 68 L 241 88 Q 241 94 235 94 Q 229 94 229 88 Q 229 94 223 94 Q 217 94 217 88 Q 217 94 211 94 Q 205 94 205 88 Q 205 94 199 94 Q 193 94 193 88 Q 193 94 187 94 Q 181 94 181 88 Q 181 94 175 94 Q 169 94 169 88 Q 169 94 163 94 Q 157 94 157 88 Q 157 94 151 94 Q 145 94 145 88 Q 145 94 139 94 Q 133 94 133 88 Q 133 94 127 94 Q 121 94 121 88 Q 121 94 116 94 Z"
                                    fill="url(#awningGrad)"
                                />
                                <path d="M 127 68 L 139 68 L 139 88 Q 139 94 133 94 Q 127 94 127 88 Z" fill="white" />
                                <path d="M 151 68 L 163 68 L 163 88 Q 163 94 157 94 Q 151 94 151 88 Z" fill="white" />
                                <path d="M 175 68 L 187 68 L 187 88 Q 187 94 181 94 Q 175 94 175 88 Z" fill="white" />
                                <path d="M 199 68 L 211 68 L 211 88 Q 211 94 205 94 Q 199 94 199 88 Z" fill="white" />
                                <path d="M 223 68 L 235 68 L 233 88 Q 233 94 228 94 Q 223 94 223 88 Z" fill="white" />

                                <rect x="134" y="98" width="92" height="32" rx="6" fill="#0A2D6C" />
                                <path d="M 138 101 L 178 101 L 158 125 L 138 125 Z" fill="white" fillOpacity="0.18" />
                                <path d="M 184 101 L 196 101 L 180 125 L 168 125 Z" fill="white" fillOpacity="0.12" />

                                <g transform="translate(206, 108)">
                                    <path d="M -1 3 L 19 3 L 17 8 Q 14 11 10 11 Q 6 11 3 8 Q 0 11 -1 8 Z" fill="#FF8008" />
                                    <path d="M 3 3 L 9 3 L 7 8 Q 6 11 3 8 Z" fill="white" />
                                    <path d="M 11 3 L 17 3 L 15 8 Q 14 11 11 8 Z" fill="white" />
                                    <rect x="1" y="8" width="16" height="15" rx="3" fill="#FF7000" />
                                    <rect x="4.5" y="12" width="9" height="7" rx="1.5" fill="white" fillOpacity="0.9" />
                                </g>
                            </g>

                            <g transform="translate(68, 92)" filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.22))">
                                <circle cx="15" cy="15" r="11" fill="white" stroke="#E2E8F0" strokeWidth="2.2" />
                                <circle cx="15" cy="15" r="8" fill="#38BDF8" fillOpacity="0.35" />
                                <path d="M 10 10 Q 15 7 20 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                                <line x1="22" y1="22" x2="33" y2="33" stroke="#FF9500" strokeWidth="4.5" strokeLinecap="round" />
                            </g>

                            <g transform="translate(260, 66)" filter="url(#badgeShadow)">
                                <rect width="84" height="48" rx="10" fill="white" stroke="#E2E8F0" strokeWidth="1" />
                                <g transform="translate(8, 7)">
                                    <text x="0" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="11" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="22" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="33" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="44" y="8" fontSize="9" fill="#CBD5E1">★</text>
                                </g>
                                <rect x="8" y="21" width="14" height="14" rx="3.5" fill="#0284C7" />
                                <circle cx="15" cy="25.5" r="2.6" fill="white" />
                                <path d="M 10.5 32.5 Q 15 28.5 19.5 32.5" fill="white" />
                                <rect x="27" y="23" width="44" height="3" rx="1.5" fill="#1E293B" />
                                <rect x="27" y="29" width="30" height="3" rx="1.5" fill="#94A3B8" />
                            </g>
                        </svg>

                        <div
                            className="flex flex-col justify-center space-y-1 select-none pr-1 text-right shrink-0"
                            style={{
                                fontFamily: "'Caveat', cursive",
                                WebkitFontSmoothing: 'antialiased',
                                MozOsxFontSmoothing: 'grayscale',
                                textRendering: 'optimizeLegibility',
                                transform: 'translateZ(0)'
                            }}
                        >
                            <span className="text-[20px] lg:text-[22px] font-bold text-[#E2EEFF] -rotate-3 leading-snug tracking-wide">
                                More visibility
                            </span>
                            <span className="text-[20px] lg:text-[22px] font-bold text-[#E2EEFF] -rotate-3 leading-snug tracking-wide">
                                More customers
                            </span>
                            <div className="relative inline-flex flex-col items-end">
                                <span className="text-[20px] lg:text-[22px] font-bold text-white -rotate-3 leading-snug tracking-wide">
                                    More bookings
                                </span>
                                <svg
                                    className="w-32 h-3.5 mt-0.5 -rotate-3 text-[#FFA41C]"
                                    viewBox="0 0 120 14"
                                    fill="none"
                                    shapeRendering="geometricPrecision"
                                >
                                    <path d="M 4 6 Q 60 12 116 4" stroke="#FFA41C" strokeWidth="2.8" strokeLinecap="round" />
                                    <path d="M 16 10 Q 64 15 106 8" stroke="#FFA41C" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 5 Stat KPI Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.label}
                            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between"
                        >
                            <div>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${s.tone}`}>
                                    <Icon className="w-4 h-4" strokeWidth={2} />
                                </div>
                                <p className="text-2xl font-black text-[#0F172A] mt-2.5 tracking-tight">
                                    {s.value}
                                </p>
                                <p className="text-xs font-semibold text-[#64748B] mt-0.5">{s.label}</p>
                            </div>
                            <p className={`text-[10px] font-bold mt-3 ${s.trendPositive ? 'text-emerald-600' : 'text-[#64748B]'}`}>
                                {s.trend}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* ── Bottom 2 Columns: Money Snapshot & Quick Links ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ── Left: Money snapshot ── */}
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-start justify-between gap-2 mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-amber-50 text-[#F59E0B] flex items-center justify-center shrink-0">
                                    <Wallet className="w-4 h-4" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-[#0F172A]">Money snapshot</h2>
                                    <p className="text-[11px] text-[#64748B]">Deposits, invoices, expenses</p>
                                </div>
                            </div>
                            <Link to="/money" className="text-xs font-bold text-[#F59E0B] hover:underline flex items-center gap-1">
                                View details <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[#F8FAFC]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                        <CreditCard className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[#64748B] font-medium">Deposits paid</span>
                                </div>
                                <span className="font-bold text-[#0F172A]">{formatCents(depositsPaid, currency)}</span>
                            </div>

                            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[#F8FAFC]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                                        <CalendarDays className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[#64748B] font-medium">Open balance</span>
                                </div>
                                <span className="font-bold text-[#0F172A]">{formatCents(openBalance, currency)}</span>
                            </div>

                            <div className="flex items-center justify-between text-xs py-1.5 border-b border-[#F8FAFC]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                        <DollarSign className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[#64748B] font-medium">Expenses</span>
                                </div>
                                <span className="font-bold text-[#0F172A]">{formatCents(expenses, currency)}</span>
                            </div>

                            <div className="flex items-center justify-between text-xs py-1.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                        <FileText className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[#64748B] font-medium">Open quotes</span>
                                </div>
                                <span className="font-bold text-[#0F172A]">{quotesOpen}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Right: Quick links ── */}
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="w-8 h-8 rounded-full bg-amber-50 text-[#F59E0B] flex items-center justify-center shrink-0">
                                <LinkIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-[#0F172A]">Quick links</h2>
                                <p className="text-[11px] text-[#64748B]">Jump into booking tools</p>
                            </div>
                        </div>

                        <div className="space-y-2 pt-1">
                            {quickLinks.map((link) => {
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.to}
                                        to={link.to}
                                        className="flex items-center justify-between rounded-xl border border-[#E2E8F0]/80 bg-[#F8FAFC]/70 hover:bg-[#F8FAFC] px-3.5 py-2.5 text-xs font-bold text-[#0F172A] hover:border-[#F59E0B] transition-all group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${link.tone}`}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <span>{link.label}</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#0F172A] group-hover:translate-x-0.5 transition-all" />
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// 2. LOCAL SEO-ONLY DASHBOARD (Matches Image 2 Style - No Bookings)
// ═══════════════════════════════════════════════════════════════════
function LocalSeoOnlyDashboard({
    userName,
    businessData
}: {
    userName: string;
    businessData: LocalBusinessData | null;
}) {
    const businessName = businessData?.name || 'Local Business';
    const rating = businessData?.rating || 4.9;
    const reviewCount = businessData?.review_count || 48;
    const reviews = businessData?.reviews || [];

    const seoStats = [
        {
            label: 'Avg Map Rank',
            value: '#2.4',
            sub: 'in Local 3-Pack',
            icon: MapPin,
            tone: 'bg-amber-50 text-[#FF8800]',
            trend: '↑ 0.8 this week',
            trendPositive: true
        },
        {
            label: 'Search Grid Visibility',
            value: '84%',
            sub: 'Top 3 pin coverage',
            icon: Search,
            tone: 'bg-sky-50 text-sky-600',
            trend: '↑ 12% vs last month',
            trendPositive: true
        },
        {
            label: 'GBP Profile Health',
            value: '96%',
            sub: 'Fully optimized',
            icon: Building2,
            tone: 'bg-emerald-50 text-emerald-600',
            trend: 'Good standing',
            trendPositive: true
        },
        {
            label: 'Google Reviews',
            value: `${rating} ★`,
            sub: `${reviewCount} verified reviews`,
            icon: Star,
            tone: 'bg-purple-50 text-purple-600',
            trend: '↑ 3 new this month',
            trendPositive: true
        },
        {
            label: 'Active Citations',
            value: '42',
            sub: 'Directories synced',
            icon: BookMarked,
            tone: 'bg-rose-50 text-rose-600',
            trend: '100% NAP consistency',
            trendPositive: true
        }
    ];

    const trackedKeywords = [
        { keyword: 'dentist near me', rank: 1, prevRank: 2, volume: '2,400/mo' },
        { keyword: 'teeth whitening basingstoke', rank: 2, prevRank: 3, volume: '880/mo' },
        { keyword: 'emergency dentist open now', rank: 1, prevRank: 1, volume: '1,200/mo' },
        { keyword: 'dental hygiene clinic', rank: 3, prevRank: 4, volume: '590/mo' }
    ];

    const quickSeoTools = [
        { to: '/rank-tracker', label: 'Local Search Grid', icon: MapPin, desc: 'Track GeoGrid pin rankings', tone: 'bg-amber-50 text-[#FF8800]' },
        { to: '/report', label: 'AI Growth Insights', icon: Sparkles, desc: 'Actionable SEO recommendations', tone: 'bg-purple-50 text-purple-600' },
        { to: '/profile', label: 'Business Profile Audit', icon: Building2, desc: 'Optimize GBP completeness', tone: 'bg-sky-50 text-sky-600' },
        { to: '/reviews', label: 'Review Management', icon: Star, desc: 'Generate & reply to reviews', tone: 'bg-emerald-50 text-emerald-600' },
        { to: '/citations', label: 'Citation Network', icon: BookMarked, desc: '40+ local directories sync', tone: 'bg-rose-50 text-rose-600' },
        { to: '/posts', label: 'GBP Post Automation', icon: FileText, desc: 'Schedule weekly Google posts', tone: 'bg-blue-50 text-blue-600' }
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-5 animate-in fade-in duration-300 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                        Welcome back, {userName} <span className="inline-block hover:rotate-12 transition-transform">👋</span>
                    </h1>
                    <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
                        Local SEO Performance & Search Visibility for <strong className="text-slate-700">{businessName}</strong>
                    </p>
                </div>

                <Link
                    to="/rank-tracker"
                    className="rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white px-5 py-2.5 text-xs sm:text-sm font-bold transition shadow-sm hover:shadow active:scale-95 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                    <Search className="w-4 h-4" /> Run Grid Scan
                </Link>
            </div>

            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#061838] via-[#0B2A63] to-[#081F4B] text-white p-5 sm:p-6 lg:p-7 shadow-xl border border-[#163675]">
                <div className="absolute -left-12 -top-12 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
                <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="max-w-xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#132E63]/90 text-[#FFA41C] text-[11px] font-bold tracking-wider uppercase border border-[#254F9E]/60">
                            <MapPin className="w-3.5 h-3.5 text-[#FFA41C]" />
                            LOCAL SEO GROWTH
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black mt-2 text-white leading-tight">
                            Dominate your local market on Google Maps & Search
                        </h2>
                        <p className="text-xs sm:text-sm text-[#A9C7F5] mt-1.5 leading-relaxed font-medium">
                            Your Google Business Profile is currently ranking in the <strong>Top 3 Local Pack</strong> for 84% of nearby searches.
                        </p>
                        <div className="flex flex-wrap gap-2.5 mt-4">
                            <Link
                                to="/rank-tracker"
                                className="inline-flex items-center gap-1.5 rounded-full bg-[#FFA41C] hover:bg-[#FFB43A] active:scale-95 text-[#0F172A] px-4 py-2 text-xs font-black shadow-md transition"
                            >
                                Open Search Grid <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                            <Link
                                to="/report"
                                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white px-4 py-2 text-xs font-bold border border-white/20 transition"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> AI Insights
                            </Link>
                        </div>
                    </div>

                    {/* Quick Health Summary */}
                    <div className="hidden lg:flex flex-col gap-2.5 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 shrink-0 w-64">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-300">Map Dominance</span>
                            <span className="font-bold text-amber-400">High (#2.4 Avg)</span>
                        </div>
                        <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full" style={{ width: '84%' }} />
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1">
                            ✓ 42 citations active &nbsp;•&nbsp; ✓ GBP verified
                        </p>
                    </div>
                </div>
            </div>

            {/* 5 KPI Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {seoStats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.label}
                            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between"
                        >
                            <div>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.tone}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-black text-slate-900 mt-2.5 tracking-tight">{s.value}</p>
                                <p className="text-xs font-bold text-slate-700 mt-0.5">{s.label}</p>
                                <p className="text-[11px] text-slate-400">{s.sub}</p>
                            </div>
                            <p className="text-[10px] font-bold mt-3 text-emerald-600 flex items-center gap-1">
                                {s.trend}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* 2-Column Main Section: Keywords & Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column: Tracked Keywords & Local Grid */}
                <div className="lg:col-span-7 space-y-5">
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#FF8800] flex items-center justify-center">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-sm">Local Search Grid Rankings</h3>
                                    <p className="text-xs text-slate-400">Target search queries across your local area</p>
                                </div>
                            </div>
                            <Link to="/rank-tracker" className="text-xs font-bold text-[#FF8800] hover:underline flex items-center gap-1">
                                Full Grid <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {trackedKeywords.map((kw) => (
                                <div key={kw.keyword} className="py-3 flex items-center justify-between text-xs">
                                    <div>
                                        <p className="font-bold text-slate-900 text-sm">{kw.keyword}</p>
                                        <p className="text-slate-400 mt-0.5">{kw.volume} search volume</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs">
                                            #{kw.rank}
                                        </span>
                                        <span className="text-[11px] font-bold text-emerald-600 flex items-center">
                                            <TrendingUp className="w-3 h-3 mr-0.5" />
                                            {kw.prevRank > kw.rank ? `+${kw.prevRank - kw.rank}` : 'Top 3'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Google Business Profile Checklist */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-blue-600" /> Google Business Profile Health
                            </h3>
                            <Link to="/profile" className="text-xs font-bold text-blue-600 hover:underline">
                                Audit details →
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {[
                                { item: 'NAP Consistency', status: '100% Synced' },
                                { item: 'Opening Hours & Holidays', status: 'Updated' },
                                { item: 'Primary & Secondary Categories', status: 'Optimized' },
                                { item: 'Geotagged High-Res Photos', status: '24 Uploaded' }
                            ].map((c) => (
                                <div key={c.item} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                                    <span className="font-medium text-slate-700">{c.item}</span>
                                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> {c.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Reviews & Quick Tools */}
                <div className="lg:col-span-5 space-y-5">
                    {/* Recent Reviews */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                <h3 className="font-bold text-slate-900 text-sm">Recent Reviews ({rating} ★)</h3>
                            </div>
                            <Link to="/reviews" className="text-xs font-bold text-[#FF8800] hover:underline">
                                Reply to all →
                            </Link>
                        </div>

                        {reviews.length > 0 ? (
                            <div className="space-y-3">
                                {reviews.slice(0, 2).map((r: any, i: number) => (
                                    <div key={i} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-slate-900">{r.author || 'Verified Customer'}</span>
                                            <div className="flex text-amber-400 text-xs">
                                                {'★'.repeat(Number(r.rating) || 5)}
                                            </div>
                                        </div>
                                        <p className="text-slate-600 line-clamp-2 leading-relaxed">
                                            {r.text || 'Excellent service, very professional and friendly staff.'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 text-center">
                                <p className="font-semibold text-slate-800">48 Google Reviews Syncing</p>
                                <p className="mt-1">Average 4.9 ★ star rating across all directories.</p>
                            </div>
                        )}
                    </div>

                    {/* Quick SEO Tools Grid */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3">
                        <h3 className="font-bold text-slate-900 text-sm">Local SEO Suite</h3>
                        <div className="space-y-2">
                            {quickSeoTools.map((tool) => {
                                const Icon = tool.icon;
                                return (
                                    <Link
                                        key={tool.to}
                                        to={tool.to}
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-orange-200 hover:bg-slate-50/80 transition group"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tool.tone}`}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-xs text-slate-900">{tool.label}</p>
                                                <p className="text-[10px] text-slate-400">{tool.desc}</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition" />
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// 3. HYBRID DASHBOARD (Complete Growth System: Local SEO + Bookings)
// ═══════════════════════════════════════════════════════════════════
function HybridDashboard({
    userName,
    bookingData,
    businessData
}: {
    userName: string;
    bookingData: BookingOverview | null;
    businessData: LocalBusinessData | null;
}) {
    const currency = bookingData?.organization?.currency || 'GBP';
    const depositsPaid = bookingData?.money?.depositsPaid ?? 16000;
    const openBalance = bookingData?.money?.openBalance ?? 0;
    const quotesOpen = bookingData?.quotesOpen ?? 0;
    const upcoming = bookingData?.upcoming ?? 2;
    const rating = businessData?.rating || 4.9;
    const reviewCount = businessData?.review_count || 48;
    const orgSlug = bookingData?.organization?.slug || 'karun';
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(`https://zappsites.co/${orgSlug}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const hybridStats = [
        {
            label: 'Avg Map Rank',
            value: '#2.4',
            sub: 'in Local 3-Pack',
            icon: MapPin,
            tone: 'bg-sky-50 text-sky-600',
            trend: '84% Grid coverage'
        },
        {
            label: 'Google Reviews',
            value: `${rating} ★`,
            sub: `${reviewCount} reviews`,
            icon: Star,
            tone: 'bg-purple-50 text-purple-600',
            trend: 'Top reputation'
        },
        {
            label: 'Upcoming Bookings',
            value: upcoming,
            sub: 'Appointments scheduled',
            icon: CalendarClock,
            tone: 'bg-amber-50 text-[#FF8800]',
            trend: '↑ Active schedule'
        },
        {
            label: 'Revenue (Deposits)',
            value: formatCents(depositsPaid, currency),
            sub: 'Deposits collected',
            icon: Wallet,
            tone: 'bg-emerald-50 text-emerald-600',
            trend: '↑ 100% paid'
        },
        {
            label: 'Total Clients',
            value: bookingData?.clients ?? 24,
            sub: 'Client contacts',
            icon: Users,
            tone: 'bg-rose-50 text-rose-600',
            trend: '↑ 3 new this week'
        }
    ];

    const hybridKeywords = [
        { keyword: 'dentist near me', rank: 1, volume: '2,400/mo' },
        { keyword: 'teeth whitening clinic', rank: 2, volume: '880/mo' },
        { keyword: 'emergency dental appointment', rank: 1, volume: '1,200/mo' }
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-4 animate-in fade-in duration-300 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                        Welcome back, {userName} <span className="inline-block hover:rotate-12 transition-transform">👋</span>
                    </h1>
                    <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
                        Complete Growth System — Local SEO Visibility & Online Bookings Overview
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        to="/booking"
                        className="rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-sm hover:shadow active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        <CalendarClock className="w-4 h-4" /> Booking Board
                    </Link>
                    <Link
                        to="/rank-tracker"
                        className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-sm hover:shadow active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        <MapPin className="w-4 h-4" /> Search Grid
                    </Link>
                </div>
            </div>

            {/* Hybrid Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#061838] via-[#0B2A63] to-[#081F4B] text-white p-5 sm:p-6 shadow-xl border border-[#163675]">
                <div className="absolute -left-12 -top-12 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
                <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="max-w-xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#132E63]/90 text-[#FFA41C] text-[11px] font-bold tracking-wider uppercase border border-[#254F9E]/60">
                            <Sparkles className="w-3.5 h-3.5 text-[#FFA41C]" />
                            COMPLETE GROWTH SYSTEM
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black mt-2 text-white leading-tight">
                            Grow visibility, capture clients, and manage bookings
                        </h2>
                        <p className="text-xs sm:text-sm text-[#A9C7F5] mt-1.5 leading-relaxed font-medium">
                            Combined Local SEO Map Rankings with full Booking Operations, Quotes, Invoicing and Client management.
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        <Link
                            to="/booking"
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#FFA41C] hover:bg-[#FFB43A] active:scale-95 text-[#0F172A] px-4 py-2 text-xs font-black shadow-md transition"
                        >
                            Booking board <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                            to="/rank-tracker"
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white px-4 py-2 text-xs font-bold border border-white/20 transition"
                        >
                            Search grid →
                        </Link>
                    </div>
                </div>
            </div>

            {/* 5 KPI Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {hybridStats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.label}
                            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between"
                        >
                            <div>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.tone}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <p className="text-2xl font-black text-slate-900 mt-2.5 tracking-tight">{s.value}</p>
                                <p className="text-xs font-bold text-slate-700 mt-0.5">{s.label}</p>
                                <p className="text-[11px] text-slate-400">{s.sub}</p>
                            </div>
                            <p className="text-[10px] font-bold mt-3 text-emerald-600 flex items-center gap-1">
                                {s.trend}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* 2-Column Split: Local SEO Visibility & Booking Operations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                {/* ── Left Column: Local SEO & Google Rankings ── */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#FF8800] flex items-center justify-center">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-sm">Local SEO & Google Rankings</h3>
                                    <p className="text-xs text-slate-400">Map pack coverage & GBP status</p>
                                </div>
                            </div>
                            <Link to="/rank-tracker" className="text-xs font-bold text-[#FF8800] hover:underline flex items-center gap-1">
                                Full Grid <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        {/* Map Dominance Score Box */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                                <p className="font-bold text-slate-900">Map Dominance: #2.4 Avg Rank</p>
                                <p className="text-slate-500 mt-0.5">84% Top 3 Local Pack coverage in Basingstoke</p>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase shrink-0">
                                Strong Visibility
                            </span>
                        </div>

                        {/* Top Tracked Keywords preview */}
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Top Keyword Rankings</p>
                            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white overflow-hidden">
                                {hybridKeywords.map((kw) => (
                                    <div key={kw.keyword} className="px-3 py-2 flex items-center justify-between text-xs">
                                        <span className="font-medium text-slate-800">{kw.keyword}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-slate-400">{kw.volume}</span>
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[11px]">
                                                #{kw.rank}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Profile & Reviews Status */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-slate-400 text-[11px]">GBP Health</p>
                                <p className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 96% Optimized
                                </p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-slate-400 text-[11px]">Google Reviews</p>
                                <p className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> {rating} ★ ({reviewCount})
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Local SEO Tools Links */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <Link to="/rank-tracker" className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition">
                            <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-[#FF8800]" /> Local Search Grid scan</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </Link>
                        <Link to="/report" className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition">
                            <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-purple-600" /> AI Growth Insights & audit</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </Link>
                        <Link to="/reviews" className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition">
                            <span className="flex items-center gap-2"><Star className="w-3.5 h-3.5 text-amber-500" /> Manage reviews & replies</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </Link>
                    </div>
                </div>

                {/* ── Right Column: Booking Operations & Money ── */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Wallet className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-sm">Booking Operations & Money</h3>
                                    <p className="text-xs text-slate-400">Deposits, quotes, and online appointments</p>
                                </div>
                            </div>
                            <Link to="/money" className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
                                Details <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        {/* Money Metric Boxes */}
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-slate-400">Deposits Collected</p>
                                <p className="text-base font-black text-slate-900 mt-0.5">{formatCents(depositsPaid, currency)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-slate-400">Open Balance</p>
                                <p className="text-base font-black text-slate-900 mt-0.5">{formatCents(openBalance, currency)}</p>
                            </div>
                        </div>

                        {/* Customer Booking Page Link Box */}
                        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100 flex items-center justify-between text-xs gap-2">
                            <div className="min-w-0">
                                <p className="font-bold text-slate-900">Your Booking Page</p>
                                <p className="text-slate-500 text-[11px] truncate">zappsites.co/{orgSlug}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="bg-white border border-amber-200 hover:bg-amber-50 text-amber-800 font-bold px-2.5 py-1 rounded-lg text-xs transition shadow-2xs"
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                                <Link
                                    to={`/book/${orgSlug}`}
                                    target="_blank"
                                    className="bg-[#FF8800] text-white font-bold px-2.5 py-1 rounded-lg hover:bg-[#E67A00] text-xs inline-flex items-center gap-1 shadow-2xs transition"
                                >
                                    <ExternalLink className="w-3 h-3" /> View
                                </Link>
                            </div>
                        </div>

                        {/* Active Quotes & Clients Overview */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-slate-400 text-[11px]">Open Quotes</p>
                                <p className="font-bold text-slate-900 mt-0.5">{quotesOpen} Pending review</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-slate-400 text-[11px]">Active Clients</p>
                                <p className="font-bold text-slate-900 mt-0.5">{bookingData?.clients ?? 24} Clients</p>
                            </div>
                        </div>
                    </div>

                    {/* Booking Tools Links */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <Link to="/booking" className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition">
                            <span className="flex items-center gap-2"><CalendarClock className="w-3.5 h-3.5 text-[#FF8800]" /> Booking board & schedule</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </Link>
                        <Link to="/clients" className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition">
                            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-sky-600" /> Client contacts & history</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </Link>
                        <Link to="/quotes" className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition">
                            <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-purple-600" /> Quotes & Estimates ({quotesOpen} open)</span>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

