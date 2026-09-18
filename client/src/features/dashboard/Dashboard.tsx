import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    MapPin,
    Building2,
    Star,
    Activity,
    CheckCircle,
    Clock,
    TrendingUp,
    CalendarClock,
    Search,
    Users,
    CalendarDays,
    Inbox,
    UtensilsCrossed,
    CreditCard
} from 'lucide-react';
import { apiGet, formatCents } from '../../shared/utils';
import GroundingModal from './GroundingModal';
import { useEntitlements } from '../../shared/EntitlementsContext';
import { hasRouteAccess } from '../../shared/planCatalog';
import { isBookingPlanId } from '../bookings/shared/bookingIndustryPresets';

const ICONS: Record<string, any> = {
    Activity,
    Clock,
    TrendingUp,
    CheckCircle
};

const PILLARS = [
    {
        to: '/rank-tracker',
        title: 'Track local visibility',
        body: 'See how you rank in the Local Pack, neighborhood by neighborhood, with a Local Search Grid.',
        icon: MapPin
    },
    {
        to: '/profile',
        title: 'Manage listings',
        body: 'Keep NAP accurate, audit citations, schedule GBP posts, and fill photo categories.',
        icon: Building2
    },
    {
        to: '/reviews',
        title: 'Grow online reputation',
        body: 'Monitor public reviews and answer customer questions from a knowledge base.',
        icon: Star
    },
    {
        to: '/booking',
        title: 'Booking Plots',
        body: 'Share time slots, take deposits, and manage jobs — simple booking for your trade.',
        icon: CalendarClock
    }
];

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
    foodOrdersOpen: number;
    money: {
        depositsPaid: number;
        bookedTotal: number;
        invoicesPaid: number;
        openBalance: number;
        expenses: number;
    };
};

function BookingPlanDashboard() {
    const [data, setData] = useState<BookingOverview | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/host/overview')
            .then(setData)
            .catch((err: Error) => setError(err.message || 'Could not load overview'));
    }, []);

    if (error) {
        return (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
            </p>
        );
    }

    if (!data) {
        return <p className="text-sm text-[#64748B]">Loading dashboard…</p>;
    }

    const currency = data.organization.currency || 'GBP';
    const isRestaurant = data.organization.booking_industry_id === 'restaurants';
    const stats = [
        {
            label: 'Clients',
            value: data.clients,
            icon: Users,
            tone: 'bg-[#FFF7ED] text-[#D97706]'
        },
        {
            label: 'Today',
            value: data.bookingsToday,
            icon: CalendarDays,
            tone: 'bg-sky-50 text-sky-700'
        },
        {
            label: 'Upcoming',
            value: data.upcoming,
            icon: CalendarClock,
            tone: 'bg-violet-50 text-violet-700'
        },
        {
            label: 'Open requests',
            value: data.openRequests,
            icon: Inbox,
            tone: 'bg-amber-50 text-amber-800'
        },
        {
            label: 'Invoices paid',
            value: data.invoicesPaid,
            icon: CreditCard,
            tone: 'bg-emerald-50 text-emerald-700'
        }
    ];

    const quickLinks = [
        { to: '/booking', label: 'Booking board' },
        { to: '/clients', label: 'Clients' },
        { to: '/quotes', label: 'Quotes' },
        { to: '/inbox', label: 'Inbox' },
        { to: '/money', label: 'Jobs & money' }
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">
                    Zappsites · Booking
                </p>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
                    {data.organization.name || 'Your workspace'}
                </h1>
                <p className="text-[#64748B] mt-2 text-sm max-w-2xl">
                    Quick health check for your booking business
                    {data.planName ? ` · ${data.planName}` : ''}.
                </p>
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-[#0F172A] text-white px-6 py-7 shadow-sm">
                <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-[#F59E0B]/20 blur-2xl" />
                <div className="absolute right-16 bottom-0 w-24 h-24 rounded-full bg-sky-400/10 blur-xl" />
                <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#F59E0B]">
                            <CalendarDays className="w-3.5 h-3.5" /> Today
                        </p>
                        <h2 className="text-2xl font-bold mt-2 tracking-tight">Booking at a glance</h2>
                        <p className="text-sm text-white/60 mt-2 max-w-md">
                            See clients, today&apos;s schedule, and open work — then jump into the booking
                            board.
                        </p>
                    </div>
                    <Link
                        to="/booking"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F59E0B] text-[#0F172A] px-5 py-3 text-sm font-bold hover:bg-[#FBBF24] shrink-0"
                    >
                        Open booking board <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.label}
                            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm hover:border-[#F59E0B]/40 transition-colors"
                        >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.tone}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <p className="text-3xl font-black text-[#0F172A] mt-3 tracking-tight">
                                {s.value}
                            </p>
                            <p className="text-xs font-semibold text-[#64748B] mt-1">{s.label}</p>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-5">
                        <div>
                            <h2 className="font-bold text-[#0F172A]">Money snapshot</h2>
                            <p className="text-xs text-[#64748B] mt-1">Deposits, invoices, expenses</p>
                        </div>
                        <Link to="/money" className="text-xs font-bold text-[#F59E0B] hover:underline">
                            View money
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {[
                            { label: 'Deposits paid', value: formatCents(data.money.depositsPaid, currency) },
                            { label: 'Open balance', value: formatCents(data.money.openBalance, currency) },
                            { label: 'Expenses', value: formatCents(data.money.expenses, currency) },
                            {
                                label: 'Open quotes',
                                value: String(data.quotesOpen)
                            }
                        ].map((row) => (
                            <div
                                key={row.label}
                                className="flex items-center justify-between text-sm border-b border-[#F1F5F9] pb-2 last:border-0 last:pb-0"
                            >
                                <span className="text-[#64748B]">{row.label}</span>
                                <span className="font-bold text-[#0F172A]">{row.value}</span>
                            </div>
                        ))}
                        {isRestaurant && (
                            <div className="flex items-center justify-between text-sm pt-1">
                                <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                                    <UtensilsCrossed className="w-3.5 h-3.5" /> Open food orders
                                </span>
                                <span className="font-bold text-[#0F172A]">{data.foodOrdersOpen}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-[#0F172A]">Quick links</h2>
                    <p className="text-xs text-[#64748B] mt-1 mb-5">Jump into booking tools</p>
                    <div className="space-y-2">
                        {quickLinks.map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#0F172A] hover:border-[#F59E0B] transition-colors"
                            >
                                {link.label}
                                <ArrowRight className="w-4 h-4 text-[#64748B]" />
                            </Link>
                        ))}
                        {isRestaurant && (
                            <Link
                                to="/booking?filter=food"
                                className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#0F172A] hover:border-[#F59E0B] transition-colors"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <UtensilsCrossed className="w-4 h-4 text-[#F59E0B]" />
                                    Food orders
                                    {data.foodOrdersOpen > 0 ? (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                            {data.foodOrdersOpen} open
                                        </span>
                                    ) : null}
                                </span>
                                <ArrowRight className="w-4 h-4 text-[#64748B]" />
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [business, setBusiness] = useState<any>(null);
    const [locationModalOpen, setLocationModalOpen] = useState(false);
    const { features, hasFeature, planId } = useEntitlements();
    const hasReporting = hasFeature('reporting');
    const hasLocalPresence = hasFeature('local_presence');
    const isBookingOnlyPlan = isBookingPlanId(String(planId || ''));

    const loadBusiness = () => {
        if (!hasLocalPresence) return;
        apiGet('/api/business').then(setBusiness).catch(() => {});
    };

    useEffect(() => {
        if (isBookingOnlyPlan) return;
        if (hasReporting) {
            apiGet('/api/dashboard/stats')
                .then(setStats)
                .catch(() => setStats({ activities: [], completenessScore: 0 }));
        }
        loadBusiness();
    }, [hasReporting, hasLocalPresence, isBookingOnlyPlan]);

    if (isBookingOnlyPlan) {
        return <BookingPlanDashboard />;
    }

    const visiblePillars = PILLARS.filter((p) => hasRouteAccess(features, p.to));

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">
                        Zappsites · Local SEO
                    </p>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
                        {business?.name || 'Your workspace'}
                    </h1>
                    <p className="text-[#64748B] mt-2 text-sm max-w-2xl">
                        Track visibility, manage listings, grow reputation, and take bookings — all in one
                        workspace.
                        {hasLocalPresence && !business?.connected && (
                            <>
                                {' '}
                                Connect a real business with{' '}
                                <span className="font-semibold text-[#0F172A]">Add location</span> to power
                                local lookups.
                            </>
                        )}
                    </p>
                </div>
                {hasLocalPresence && (
                    <button
                        type="button"
                        onClick={() => setLocationModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#F59E0B] text-white text-sm font-bold hover:bg-[#D97706] shrink-0"
                    >
                        <Search className="w-4 h-4" />
                        {business?.connected ? 'Change location' : 'Add location'}
                    </button>
                )}
            </div>

            {!hasReporting && (
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                    <p className="text-sm text-[#64748B]">
                        Reporting insights are not included on your current plan.{' '}
                        <Link to="/account" className="font-semibold text-[#0F172A] hover:underline">
                            View your plan
                        </Link>{' '}
                        to see what is available.
                    </p>
                </div>
            )}

            {hasReporting && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        {
                            label: 'Avg Local Pack rank',
                            value: stats?.visibilityRank ? `#${stats.visibilityRank}` : '—'
                        },
                        { label: 'Top 3 coverage', value: `${stats?.top3Percentage || 0}%` },
                        { label: 'Profile completeness', value: `${stats?.completenessScore || 0}%` },
                        { label: 'Review reply rate', value: `${stats?.reviewResponseRate || 0}%` }
                    ].map((kpi) => (
                        <div key={kpi.label} className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                            <p className="text-xs font-semibold text-[#64748B]">{kpi.label}</p>
                            <p className="text-2xl font-black text-[#0F172A] mt-1">{kpi.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {visiblePillars.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    {visiblePillars.map((pillar) => {
                        const Icon = pillar.icon;
                        return (
                            <Link
                                key={pillar.to}
                                to={pillar.to}
                                className="bg-white border border-[#E2E8F0] rounded-2xl p-6 hover:border-[#F59E0B] hover:shadow-md transition-all group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-[#0F172A] text-[#F59E0B] flex items-center justify-center mb-4">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <h2 className="font-bold text-lg">{pillar.title}</h2>
                                <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{pillar.body}</p>
                                <span className="inline-flex items-center gap-1 text-sm font-bold text-[#0F172A] mt-4 group-hover:gap-2 transition-all">
                                    Open <ArrowRight className="w-4 h-4" />
                                </span>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 text-center">
                    <p className="text-sm text-[#64748B]">
                        No local tools are included on your current plan.{' '}
                        <Link to="/account" className="font-semibold text-[#0F172A] hover:underline">
                            View your plan
                        </Link>
                        .
                    </p>
                </div>
            )}

            {hasReporting && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
                    <h2 className="font-bold mb-4">Recent activity</h2>
                    {stats?.activities?.length ? (
                        <div className="space-y-4">
                            {stats.activities.map((activity: any) => {
                                const Icon = ICONS[activity.icon] || CheckCircle;
                                return (
                                    <div key={activity.id} className="flex gap-3">
                                        <Icon className="w-4 h-4 mt-0.5 text-[#0F172A]" />
                                        <div>
                                            <p className="text-sm font-medium">{activity.message}</p>
                                            <p className="text-xs text-[#64748B]">{activity.time}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-[#64748B]">
                            No activity yet. Add a location, then run a grid scan or citation audit.
                        </p>
                    )}
                </div>
            )}

            <GroundingModal
                isOpen={locationModalOpen}
                onClose={() => {
                    setLocationModalOpen(false);
                    loadBusiness();
                }}
            />
        </div>
    );
}
