import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    BarChart3,
    Building2,
    CalendarDays,
    CreditCard,
    ExternalLink,
    Mail,
    Users
} from 'lucide-react';
import { adminGet } from './adminApi';
import { FEATURE_LABELS, type FeatureKey } from '../shared/planCatalog';

type Overview = {
    totals: {
        users: number;
        organizations: number;
        activeSubscriptions: number;
        organizationsWithoutPlan: number;
        bookings: number;
        invitesUnclaimed?: number;
    };
    subscriptionsByPlan: { plan_id: string; plan_name: string; count: number }[];
    products: { id: string; name: string; status: string; description: string }[];
    plans: { id: string; name: string; priceLabel: string; features: FeatureKey[] }[];
};

export default function AdminDashboard() {
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        adminGet('/api/admin/overview')
            .then(setData)
            .catch((err: Error) => setError(err.message));
    }, []);

    if (error) {
        return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>;
    }

    if (!data) {
        return <p className="text-sm text-[#64748B]">Loading overview…</p>;
    }

    const stats = [
        { label: 'Logged in', value: data.totals.users, icon: Users, tone: 'bg-[#FFF1EB] text-[#F97316]' },
        { label: 'Businesses', value: data.totals.organizations, icon: Building2, tone: 'bg-[#E0F2FE] text-[#0284C7]' },
        { label: 'Paying plans', value: data.totals.activeSubscriptions, icon: CreditCard, tone: 'bg-[#DCFCE7] text-[#16A34A]' },
        { label: 'Waiting login', value: data.totals.invitesUnclaimed ?? 0, icon: Mail, tone: 'bg-[#FEE2E2] text-[#EF4444]' },
        { label: 'Bookings', value: data.totals.bookings, icon: CalendarDays, tone: 'bg-[#F3E8FF] text-[#9333EA]' }
    ];

    const maxPlanCount = Math.max(1, ...data.subscriptionsByPlan.map((r) => Number(r.count || 0)));

    return (
        <div className="space-y-5 sm:space-y-6 max-w-7xl">
            {/* Dark Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-[#0F1E36] text-white px-6 py-6 sm:px-8 sm:py-7 shadow-sm">
                <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                    <div>
                        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                            <CalendarDays className="w-4 h-4 text-[#F59E0B]" /> TODAY
                        </p>
                        <h2 className="text-2xl sm:text-3xl font-bold mt-2 tracking-tight text-white">Portal at a glance</h2>
                        <p className="text-sm text-slate-300/80 mt-1 max-w-lg leading-relaxed">
                            See how many users are paying, then open Users to manage one plan at a time.
                        </p>
                    </div>

                    <div className="flex items-center gap-6 self-start sm:self-center shrink-0">
                        {/* Translucent Bar Chart Silhouettes */}
                        <div className="hidden md:flex items-end gap-1.5 opacity-20 pointer-events-none select-none" aria-hidden="true">
                            <div className="w-3.5 h-6 bg-white rounded-t-sm" />
                            <div className="w-3.5 h-10 bg-white rounded-t-sm" />
                            <div className="w-3.5 h-14 bg-white rounded-t-sm" />
                            <div className="w-3.5 h-18 bg-white rounded-t-sm" />
                        </div>

                        <Link
                            to="/admin/users"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F59E0B] text-[#0F172A] px-5 py-3 text-sm font-bold hover:bg-[#FBBF24] transition-colors shadow-sm shrink-0"
                        >
                            Open users <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.label}
                            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 shadow-sm hover:border-slate-300 transition-colors"
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.tone}`}>
                                <Icon className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <p className="text-3xl font-extrabold text-[#0F172A] mt-3 tracking-tight">{s.value}</p>
                            <p className="text-xs font-semibold text-[#64748B] mt-1">{s.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Plans in use & Products */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Plans in use */}
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-sm">
                    <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Plans in use</h3>
                    <p className="text-xs text-[#64748B] mt-0.5 mb-5">Active subscriptions</p>
                    {data.subscriptionsByPlan.length ? (
                        <div className="space-y-4">
                            {data.subscriptionsByPlan.map((row) => {
                                const fillPercentage = Math.min(
                                    100,
                                    Math.max(8, Math.round((Number(row.count) / (maxPlanCount * 1.6)) * 100))
                                );
                                return (
                                    <div key={row.plan_id}>
                                        <div className="flex items-center justify-between text-sm mb-1.5">
                                            <span className="font-bold text-[#0F172A]">{row.plan_name}</span>
                                            <span className="font-bold text-[#0F172A]">{row.count}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[#F97316] transition-all duration-500"
                                                style={{ width: `${fillPercentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-[#64748B]">No active plans yet.</p>
                    )}
                </div>

                {/* Products */}
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-sm">
                    <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Products</h3>
                    <p className="text-xs text-[#64748B] mt-0.5 mb-5">What this admin covers</p>
                    <div className="space-y-3">
                        {data.products.map((product) => {
                            const isLive = product.status === 'active';
                            const isLocalSeo = product.id === 'local_seo' || product.name.toLowerCase().includes('seo');
                            return (
                                <div
                                    key={product.id}
                                    className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:border-slate-300 transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className="shrink-0">
                                            {isLocalSeo ? (
                                                <BarChart3 className="w-5 h-5 text-[#F97316]" strokeWidth={2.2} />
                                            ) : (
                                                <ExternalLink className="w-5 h-5 text-[#2563EB]" strokeWidth={2} />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-[#0F172A] leading-snug">{product.name}</p>
                                            <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed truncate sm:whitespace-normal">
                                                {product.description}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 ${
                                            isLive
                                                ? 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'
                                                : 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]'
                                        }`}
                                    >
                                        {isLive ? 'LIVE' : 'LATER'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Plan Cheat Sheet */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-sm overflow-x-auto">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                    <div>
                        <h3 className="text-base sm:text-lg font-bold text-[#0F172A]">Plan cheat sheet</h3>
                        <p className="text-xs text-[#64748B] mt-0.5">Quick view of what each plan unlocks</p>
                    </div>
                    <Link
                        to="/admin/services"
                        className="text-sm font-bold text-[#F97316] hover:text-[#EA580C] hover:underline flex items-center gap-1 transition-colors"
                    >
                        Full guide →
                    </Link>
                </div>
                <table className="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr className="text-left border-b border-[#E2E8F0]">
                            <th className="pb-3 pr-4 font-bold text-[11px] uppercase tracking-wider text-[#64748B]">Plan</th>
                            <th className="pb-3 pr-4 font-bold text-[11px] uppercase tracking-wider text-[#64748B]">Price</th>
                            <th className="pb-3 font-bold text-[11px] uppercase tracking-wider text-[#64748B]">Includes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.plans.map((plan) => (
                            <tr key={plan.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]/50 transition-colors">
                                <td className="py-3.5 pr-4 font-bold text-[#0F172A] text-sm">{plan.name}</td>
                                <td className="py-3.5 pr-4 text-[#64748B] whitespace-nowrap font-medium text-sm">{plan.priceLabel}</td>
                                <td className="py-3.5 text-[#475569] text-xs sm:text-sm leading-relaxed">
                                    {plan.features.length
                                        ? plan.features.map((f) => FEATURE_LABELS[f]).join(' · ')
                                        : 'Website only'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
