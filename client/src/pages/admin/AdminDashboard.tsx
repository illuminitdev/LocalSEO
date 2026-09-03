import { useEffect, useState } from 'react';
import { adminGet } from '../../lib/adminApi';
import { FEATURE_LABELS, type FeatureKey } from '../../lib/planCatalog';

type Overview = {
    totals: {
        users: number;
        organizations: number;
        activeSubscriptions: number;
        organizationsWithoutPlan: number;
        bookings: number;
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
        return <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>;
    }

    if (!data) {
        return <p className="text-sm text-[#64748B]">Loading overview…</p>;
    }

    const stats = [
        { label: 'Total users', value: data.totals.users },
        { label: 'Organizations', value: data.totals.organizations },
        { label: 'Active plans', value: data.totals.activeSubscriptions },
        { label: 'Invites awaiting claim', value: (data.totals as any).invitesUnclaimed ?? 0 },
        { label: 'Bookings (active)', value: data.totals.bookings }
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[#0F172A]">Platform overview</h1>
                <p className="text-sm text-[#64748B] mt-1">Users and subscriptions across the Local SEO portal. More ZappSites products will appear here when connected.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {stats.map((s) => (
                    <div key={s.label} className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                        <p className="text-xs font-semibold text-[#64748B]">{s.label}</p>
                        <p className="text-2xl font-black text-[#0F172A] mt-1">{s.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                    <h2 className="font-bold text-[#0F172A] mb-4">Subscriptions by plan</h2>
                    {data.subscriptionsByPlan.length ? (
                        <div className="space-y-2">
                            {data.subscriptionsByPlan.map((row) => (
                                <div key={row.plan_id} className="flex items-center justify-between text-sm py-2 border-b border-[#F1F5F9] last:border-0">
                                    <span className="font-medium">{row.plan_name}</span>
                                    <span className="text-[#64748B]">{row.count} org{row.count === 1 ? '' : 's'}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-[#64748B]">No active subscriptions yet.</p>
                    )}
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                    <h2 className="font-bold text-[#0F172A] mb-4">ZappSites products</h2>
                    <div className="space-y-3">
                        {data.products.map((product) => (
                            <div key={product.id} className="rounded-xl border border-[#E2E8F0] p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">{product.name}</p>
                                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                        product.status === 'active'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-[#F1F5F9] text-[#64748B]'
                                    }`}>
                                        {product.status}
                                    </span>
                                </div>
                                <p className="text-xs text-[#64748B] mt-1">{product.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 overflow-x-auto">
                <h2 className="font-bold text-[#0F172A] mb-4">Plan catalog</h2>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                            <th className="pb-2 pr-4 font-semibold">Plan</th>
                            <th className="pb-2 pr-4 font-semibold">Price</th>
                            <th className="pb-2 font-semibold">Services included</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.plans.map((plan) => (
                            <tr key={plan.id} className="border-b border-[#F8FAFC]">
                                <td className="py-3 pr-4 font-medium">{plan.name}</td>
                                <td className="py-3 pr-4 text-[#64748B]">{plan.priceLabel}</td>
                                <td className="py-3 text-[#64748B]">
                                    {plan.features.length
                                        ? plan.features.map((f) => FEATURE_LABELS[f]).join(' · ')
                                        : 'Website only (no portal tools)'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
