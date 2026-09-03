import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { adminGet } from '../../lib/adminApi';
import type { FeatureKey } from '../../lib/planCatalog';

type ServicesPayload = {
    stage?: string;
    services: {
        key: FeatureKey;
        label: string;
        plans: { id: string; name: string; priceLabel: string }[];
    }[];
    plans: {
        id: string;
        name: string;
        priceLabel: string;
        features: { key: string; label: string }[];
    }[];
};

export default function AdminServices() {
    const [data, setData] = useState<ServicesPayload | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        adminGet('/api/admin/services')
            .then(setData)
            .catch((err: Error) => setError(err.message));
    }, []);

    if (error) {
        return <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>;
    }
    if (!data) {
        return <p className="text-sm text-[#64748B]">Loading services…</p>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[#0F172A]">Services catalog</h1>
                <p className="text-sm text-[#64748B] mt-1">
                    Portal modules gated by ZappSites plan features. Customers only see what their paid plan includes.
                    {data.stage ? ` (${data.stage})` : ''}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.services.map((svc) => (
                    <div key={svc.key} className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-[#F59E0B] flex items-center justify-center shrink-0">
                                <Layers className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-[#0F172A]">{svc.label}</p>
                                <p className="text-[10px] font-mono text-[#94A3B8] mt-0.5">{svc.key}</p>
                                <p className="text-xs text-[#64748B] mt-3 mb-1.5">Included in</p>
                                {svc.plans.length ? (
                                    <ul className="space-y-1">
                                        {svc.plans.map((p) => (
                                            <li key={p.id} className="text-sm text-[#334155] flex justify-between gap-2">
                                                <span>{p.name}</span>
                                                <span className="text-[#94A3B8] shrink-0">{p.priceLabel}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-[#94A3B8]">Not included in any plan</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 overflow-x-auto">
                <h2 className="font-bold text-[#0F172A] mb-4">Plans → services</h2>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
                            <th className="pb-2 pr-4 font-semibold">Plan</th>
                            <th className="pb-2 pr-4 font-semibold">Price</th>
                            <th className="pb-2 font-semibold">Portal services</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.plans.map((plan) => (
                            <tr key={plan.id} className="border-b border-[#F8FAFC]">
                                <td className="py-3 pr-4 font-medium">{plan.name}</td>
                                <td className="py-3 pr-4 text-[#64748B]">{plan.priceLabel}</td>
                                <td className="py-3 text-[#64748B]">
                                    {plan.features.length
                                        ? plan.features.map((f) => f.label).join(' · ')
                                        : 'Website only — no Local SEO modules'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
