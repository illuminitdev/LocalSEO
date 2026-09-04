import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    CalendarDays,
    CreditCard,
    MailWarning,
    Users,
    ArrowRight,
    Sparkles
} from 'lucide-react';
import { adminGet } from '../../lib/adminApi';
import { FEATURE_LABELS, type FeatureKey } from '../../lib/planCatalog';

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
        { label: 'Logged in', value: data.totals.users, icon: Users, tone: 'bg-[#FFF7ED] text-[#D97706]' },
        { label: 'Businesses', value: data.totals.organizations, icon: Building2, tone: 'bg-sky-50 text-sky-700' },
        { label: 'Paying plans', value: data.totals.activeSubscriptions, icon: CreditCard, tone: 'bg-emerald-50 text-emerald-700' },
        { label: 'Waiting login', value: data.totals.invitesUnclaimed ?? 0, icon: MailWarning, tone: 'bg-amber-50 text-amber-800' },
        { label: 'Bookings', value: data.totals.bookings, icon: CalendarDays, tone: 'bg-violet-50 text-violet-700' }
    ];

    const maxPlanCount = Math.max(1, ...data.subscriptionsByPlan.map((r) => Number(r.count || 0)));

    return (
        <div className="space-y-6 max-w-6xl">
            <div className="relative overflow-hidden rounded-3xl bg-[#0F172A] text-white px-6 py-7 shadow-sm">
                <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-[#F59E0B]/20 blur-2xl" />
                <div className="absolute right-16 bottom-0 w-24 h-24 rounded-full bg-sky-400/10 blur-xl" />
                <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#F59E0B]">
                            <Sparkles className="w-3.5 h-3.5" /> Today
                        </p>
                        <h2 className="text-2xl font-bold mt-2 tracking-tight">Portal at a glance</h2>
                        <p className="text-sm text-white/60 mt-2 max-w-md">
                            See how many customers are paying, then open Customers to manage one plan at a time.
                        </p>
                    </div>
                    <Link
                        to="/admin/users"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F59E0B] text-[#0F172A] px-5 py-3 text-sm font-bold hover:bg-[#FBBF24] shrink-0"
                    >
                        Open customers <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
                            <p className="text-3xl font-black text-[#0F172A] mt-3 tracking-tight">{s.value}</p>
                            <p className="text-xs font-semibold text-[#64748B] mt-1">{s.label}</p>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-[#0F172A]">Plans in use</h2>
                    <p className="text-xs text-[#64748B] mt-1 mb-5">Active subscriptions</p>
                    {data.subscriptionsByPlan.length ? (
                        <div className="space-y-4">
                            {data.subscriptionsByPlan.map((row) => (
                                <div key={row.plan_id}>
                                    <div className="flex items-center justify-between text-sm mb-1.5">
                                        <span className="font-medium">{row.plan_name}</span>
                                        <span className="font-bold text-[#0F172A]">{row.count}</span>
                                    </div>
                                    <div className="h-2.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]"
                                            style={{ width: `${(Number(row.count) / maxPlanCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-[#64748B]">No active plans yet.</p>
                    )}
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-[#0F172A]">Products</h2>
                    <p className="text-xs text-[#64748B] mt-1 mb-5">What this admin covers</p>
                    <div className="space-y-3">
                        {data.products.map((product) => (
                            <div key={product.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-bold">{product.name}</p>
                                    <span
                                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                            product.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                : 'bg-white text-[#64748B] border border-[#E2E8F0]'
                                        }`}
                                    >
                                        {product.status === 'active' ? 'Live' : 'Later'}
                                    </span>
                                </div>
                                <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">{product.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm overflow-x-auto">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                    <div>
                        <h2 className="font-bold text-[#0F172A]">Plan cheat sheet</h2>
                        <p className="text-xs text-[#64748B] mt-1">Quick view of what each plan unlocks</p>
                    </div>
                    <Link to="/admin/services" className="text-sm font-bold text-[#0F172A] hover:underline">
                        Full guide →
                    </Link>
                </div>
                <table className="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                            <th className="pb-2.5 pr-4 font-bold text-xs uppercase tracking-wide">Plan</th>
                            <th className="pb-2.5 pr-4 font-bold text-xs uppercase tracking-wide">Price</th>
                            <th className="pb-2.5 font-bold text-xs uppercase tracking-wide">Includes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.plans.map((plan) => (
                            <tr key={plan.id} className="border-b border-[#F1F5F9] last:border-0">
                                <td className="py-3.5 pr-4 font-semibold">{plan.name}</td>
                                <td className="py-3.5 pr-4 text-[#64748B] whitespace-nowrap">{plan.priceLabel}</td>
                                <td className="py-3.5 text-[#475569]">
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
