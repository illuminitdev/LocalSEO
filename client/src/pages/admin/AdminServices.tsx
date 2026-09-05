import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { adminGet } from '../../lib/adminApi';
import type { FeatureKey } from '../../lib/planCatalog';
import { cn } from '../../lib/utils';

type ServicesPayload = {
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
        return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>;
    }
    if (!data) {
        return <p className="text-sm text-[#64748B]">Loading plan guide…</p>;
    }

    return (
        <div className="space-y-6 max-w-6xl">
            <div className="rounded-2xl border border-[#FED7AA] bg-[#FFFBEB] px-4 py-3 text-sm text-amber-950">
                Customers only see tools that are <strong>On</strong> for their plan. Change a person’s plan under{' '}
                <strong>Customers</strong>.
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                    <h2 className="font-bold text-[#0F172A]">Plan × tool matrix</h2>
                    <p className="text-xs text-[#64748B] mt-1">Green check = included. Dash = not included.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead>
                            <tr className="bg-[#F8FAFC] text-left">
                                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wide text-[#64748B] sticky left-0 bg-[#F8FAFC]">
                                    Plan
                                </th>
                                <th className="px-3 py-3 font-bold text-xs uppercase tracking-wide text-[#64748B]">Price</th>
                                {data.services.map((svc) => (
                                    <th
                                        key={svc.key}
                                        className="px-3 py-3 font-bold text-[11px] text-[#64748B] text-center max-w-[7rem]"
                                    >
                                        {svc.label.replace(/\s*\(.*\)\s*$/, '')}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.plans.map((plan) => {
                                const keys = new Set(plan.features.map((f) => f.key));
                                return (
                                    <tr key={plan.id} className="border-t border-[#F1F5F9]">
                                        <td className="px-4 py-3.5 font-semibold text-[#0F172A] sticky left-0 bg-white">
                                            {plan.name}
                                        </td>
                                        <td className="px-3 py-3.5 text-[#64748B] whitespace-nowrap">{plan.priceLabel}</td>
                                        {data.services.map((svc) => {
                                            const on = keys.has(svc.key);
                                            return (
                                                <td key={svc.key} className="px-3 py-3.5 text-center">
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center justify-center w-7 h-7 rounded-lg',
                                                            on
                                                                ? 'bg-emerald-50 text-emerald-700'
                                                                : 'bg-[#F8FAFC] text-[#CBD5E1]'
                                                        )}
                                                        title={on ? 'Included' : 'Not included'}
                                                    >
                                                        {on ? <Check className="w-4 h-4" /> : <X className="w-3.5 h-3.5" />}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <h2 className="font-bold text-[#0F172A] mb-1">Tool details</h2>
                <p className="text-xs text-[#64748B] mb-4">Which plans include each portal module</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.services.map((svc) => (
                        <div key={svc.key} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
                            <p className="text-sm font-bold text-[#0F172A]">{svc.label}</p>
                            <p className="text-[10px] font-mono text-[#94A3B8] mt-0.5">{svc.key}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {svc.plans.length ? (
                                    svc.plans.map((p) => (
                                        <span
                                            key={p.id}
                                            className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 px-2 py-1 text-[11px] font-semibold"
                                        >
                                            {p.name}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs text-[#94A3B8]">Not on any plan</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
