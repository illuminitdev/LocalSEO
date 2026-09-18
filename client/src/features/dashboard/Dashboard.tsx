import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    MapPin,
    Building2,
    Star,
    CalendarClock,
    Search,
    Users,
    CalendarDays,
    Mail,
    FileText,
    Wallet,
    CreditCard,
    DollarSign,
    MessageSquare,
    Link as LinkIcon,
    ArrowUp,
    ArrowDown,
    ChevronRight,
    TrendingUp,
    Store
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

export default function Dashboard() {
    const navigate = useNavigate();
    const [userName, setUserName] = useState('');
    const [data, setData] = useState<BookingOverview | null>(null);
    const [business, setBusiness] = useState<any>(null);
    const [locationModalOpen, setLocationModalOpen] = useState(false);
    const { hasFeature } = useEntitlements();
    const hasLocalPresence = hasFeature('local_presence');

    useEffect(() => {
        apiGet('/api/auth/me')
            .then((res) => {
                const name = res.user?.name || res.name || '';
                setUserName(name.split(' ')[0] || 'Karun');
            })
            .catch(() => setUserName('Karun'));

        apiGet('/api/host/overview')
            .then(setData)
            .catch(() => {});

        if (hasLocalPresence) {
            apiGet('/api/business').then(setBusiness).catch(() => {});
        }
    }, [hasLocalPresence]);

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
            value: data?.bookingsToday ?? 1,
            icon: CalendarDays,
            tone: 'bg-sky-50 text-sky-600',
            trend: '↑ 0% vs yesterday',
            trendPositive: true
        },
        {
            label: 'Upcoming',
            value: data?.upcoming ?? 1,
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
                {/* Background ambient lighting */}
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

                    {/* Right hero illustration / visual */}
                    <div className="hidden md:flex items-center justify-end gap-5 lg:gap-8 xl:gap-10 shrink-0 relative select-none">
                        {/* Vector Storefront + Map Pin + Magnifier + Review Badge Artwork */}
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

                            {/* Perspective map grid background roads in electric blue */}
                            <g stroke="#1D5BC6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
                                <path d="M 20 140 L 95 85 L 180 58 L 275 105 L 340 148" />
                                <path d="M 95 85 L 40 50 L 120 22 L 180 58" />
                                <path d="M 68 118 L 150 105 L 250 132" />
                                <path d="M 150 105 L 170 55 L 235 62" />
                                <path d="M 180 58 L 285 28 L 345 68 L 275 105" />
                                <path d="M -5 102 L 52 144 L 10 158" />
                                <path d="M 235 62 L 320 88" />
                            </g>
                            {/* Glow behind Pin */}
                            <ellipse cx="180" cy="22" rx="18" ry="24" fill="#FFA41C" fillOpacity="0.2" />

                            {/* ── Glossy Gradient Map Pin (Slim & Narrowed width) ── */}
                            <g>
                                <path
                                    d="M 180 4 C 171 4 164 11 164 20 C 164 30 177.5 49.5 178.8 51.5 Q 180 53 181.2 51.5 C 182.5 49.5 196 30 196 20 C 196 11 189 4 180 4 Z"
                                    fill="url(#pinGrad)"
                                    filter="drop-shadow(0px 4px 8px rgba(255, 120, 0, 0.45))"
                                />
                                {/* Pin Inner Circle Cutout */}
                                <circle cx="180" cy="20" r="5.5" fill="#091E47" />
                                {/* Sparkle glint on Pin */}
                                <path d="M 190 10 Q 190 13 193 13 Q 190 13 190 16 Q 190 13 187 13 Q 190 13 190 10 Z" fill="white" />
                            </g>

                            {/* ── Storefront Browser Card ── */}
                            <g filter="url(#cardShadow)">
                                {/* White App Frame Window */}
                                <rect x="122" y="56" width="116" height="84" rx="12" fill="white" stroke="#F1F5F9" strokeWidth="1" />

                                {/* Top bar with 3 dots */}
                                <rect x="122" y="56" width="116" height="14" rx="12" fill="#F8FAFC" />
                                <circle cx="132" cy="63" r="2.2" fill="#EF4444" />
                                <circle cx="138" cy="63" r="2.2" fill="#F59E0B" />
                                <circle cx="144" cy="63" r="2.2" fill="#10B981" />

                                {/* Scalloped Awning Canopy Base */}
                                <path
                                    d="M 116 68 L 244 68 L 241 88 Q 241 94 235 94 Q 229 94 229 88 Q 229 94 223 94 Q 217 94 217 88 Q 217 94 211 94 Q 205 94 205 88 Q 205 94 199 94 Q 193 94 193 88 Q 193 94 187 94 Q 181 94 181 88 Q 181 94 175 94 Q 169 94 169 88 Q 169 94 163 94 Q 157 94 157 88 Q 157 94 151 94 Q 145 94 145 88 Q 145 94 139 94 Q 133 94 133 88 Q 133 94 127 94 Q 121 94 121 88 Q 121 94 116 94 Z"
                                    fill="url(#awningGrad)"
                                />

                                {/* White Stripes on Canopy */}
                                <path d="M 127 68 L 139 68 L 139 88 Q 139 94 133 94 Q 127 94 127 88 Z" fill="white" />
                                <path d="M 151 68 L 163 68 L 163 88 Q 163 94 157 94 Q 151 94 151 88 Z" fill="white" />
                                <path d="M 175 68 L 187 68 L 187 88 Q 187 94 181 94 Q 175 94 175 88 Z" fill="white" />
                                <path d="M 199 68 L 211 68 L 211 88 Q 211 94 205 94 Q 199 94 199 88 Z" fill="white" />
                                <path d="M 223 68 L 235 68 L 233 88 Q 233 94 228 94 Q 223 94 223 88 Z" fill="white" />

                                {/* Store Display Window (Deep Glossy Blue Tint) */}
                                <rect x="134" y="98" width="92" height="32" rx="6" fill="#0A2D6C" />
                                {/* Specular Reflection Lines on Window */}
                                <path d="M 138 101 L 178 101 L 158 125 L 138 125 Z" fill="white" fillOpacity="0.18" />
                                <path d="M 184 101 L 196 101 L 180 125 L 168 125 Z" fill="white" fillOpacity="0.12" />

                                {/* Mini Orange Storefront / Bag on bottom right */}
                                <g transform="translate(206, 108)">
                                    {/* Mini canopy */}
                                    <path d="M -1 3 L 19 3 L 17 8 Q 14 11 10 11 Q 6 11 3 8 Q 0 11 -1 8 Z" fill="#FF8008" />
                                    <path d="M 3 3 L 9 3 L 7 8 Q 6 11 3 8 Z" fill="white" />
                                    <path d="M 11 3 L 17 3 L 15 8 Q 14 11 11 8 Z" fill="white" />
                                    {/* Mini base */}
                                    <rect x="1" y="8" width="16" height="15" rx="3" fill="#FF7000" />
                                    <rect x="4.5" y="12" width="9" height="7" rx="1.5" fill="white" fillOpacity="0.9" />
                                </g>
                            </g>

                            {/* ── Magnifying Glass (Separated on Left) ── */}
                            <g transform="translate(68, 92)" filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.22))">
                                <circle cx="15" cy="15" r="11" fill="white" stroke="#E2E8F0" strokeWidth="2.2" />
                                <circle cx="15" cy="15" r="8" fill="#38BDF8" fillOpacity="0.35" />
                                <path d="M 10 10 Q 15 7 20 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                                <line x1="22" y1="22" x2="33" y2="33" stroke="#FF9500" strokeWidth="4.5" strokeLinecap="round" />
                            </g>

                            {/* ── 5-Star Review Badge (Spaced on Right) ── */}
                            <g transform="translate(260, 66)" filter="url(#badgeShadow)">
                                <rect width="84" height="48" rx="10" fill="white" stroke="#E2E8F0" strokeWidth="1" />
                                {/* 5 Stars */}
                                <g transform="translate(8, 7)">
                                    <text x="0" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="11" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="22" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="33" y="8" fontSize="9" fill="#FFA41C">★</text>
                                    <text x="44" y="8" fontSize="9" fill="#CBD5E1">★</text>
                                </g>
                                {/* Profile avatar box */}
                                <rect x="8" y="21" width="14" height="14" rx="3.5" fill="#0284C7" />
                                <circle cx="15" cy="25.5" r="2.6" fill="white" />
                                <path d="M 10.5 32.5 Q 15 28.5 19.5 32.5" fill="white" />
                                {/* Review Text Bars */}
                                <rect x="27" y="23" width="44" height="3" rx="1.5" fill="#1E293B" />
                                <rect x="27" y="29" width="30" height="3" rx="1.5" fill="#94A3B8" />
                            </g>
                        </svg>

                        {/* Crisp HD Handwritten script highlights with smooth golden underline */}
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
                                {/* Crisp HD Double Golden brush underline */}
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

            {hasLocalPresence && (
                <GroundingModal
                    isOpen={locationModalOpen}
                    onClose={() => {
                        setLocationModalOpen(false);
                    }}
                />
            )}
        </div>
    );
}

