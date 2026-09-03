import { useEffect, useState } from 'react';
import { adminGet, adminPatch } from '../../lib/adminApi';
import { FEATURE_LABELS, PLANS, type FeatureKey } from '../../lib/planCatalog';

type AdminUser = {
    kind: 'user' | 'invite';
    userId: string | null;
    email: string;
    name: string;
    createdAt: string;
    mustChangePassword?: boolean;
    organization: {
        id: string;
        name: string;
        slug: string;
        tradeType: string;
        setupComplete: boolean;
    } | null;
    subscription: {
        planId: string;
        planName: string;
        status: string;
        priceLabel: string | null;
        periodStart?: string | null;
        periodEnd?: string | null;
        paidAt?: string | null;
        stripeSubscriptionId?: string | null;
        stripeCustomerId?: string | null;
    } | null;
    invite: {
        id: string;
        status: string;
        claimedAt: string | null;
        credentialsEmailedAt: string | null;
        createdAt: string;
    } | null;
    invoices: { count: number; totalCents: number; totalLabel: string };
    features: FeatureKey[];
    products: { id: string; name: string; enrolled: boolean }[];
};

function fmtDate(value?: string | null) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return '—';
    }
}

export default function AdminUsers() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [stage, setStage] = useState('');
    const [error, setError] = useState('');
    const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
    const [msg, setMsg] = useState('');

    const load = () => {
        adminGet('/api/admin/users')
            .then((data) => {
                setUsers(data.users || []);
                setStage(data.stage || '');
            })
            .catch((err: Error) => setError(err.message));
    };

    useEffect(() => {
        load();
    }, []);

    const assignPlan = async (orgId: string, planId: string) => {
        setBusyOrgId(orgId);
        setMsg('');
        setError('');
        try {
            await adminPatch(`/api/admin/organizations/${orgId}/subscription`, { planId: planId || null });
            setMsg('Plan updated.');
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusyOrgId(null);
        }
    };

    const registered = users.filter((u) => u.kind === 'user').length;
    const pending = users.filter((u) => u.kind === 'invite').length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-[#0F172A]">Users &amp; billing</h1>
                    <p className="text-sm text-[#64748B] mt-1">
                        Portal users from ZappSites checkout. Temp password email → claim login → change password.
                        {stage ? ` Viewing ${stage} environment.` : ''}
                    </p>
                </div>
                <div className="flex gap-3 text-sm">
                    <span className="rounded-lg bg-white border border-[#E2E8F0] px-3 py-1.5">
                        <strong>{registered}</strong> registered
                    </span>
                    <span className="rounded-lg bg-amber-50 border border-amber-100 text-amber-900 px-3 py-1.5">
                        <strong>{pending}</strong> awaiting claim
                    </span>
                </div>
            </div>

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>}
            {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">{msg}</p>}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[1100px]">
                        <thead>
                            <tr className="text-left text-[#64748B] bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                <th className="px-4 py-3 font-semibold">Customer</th>
                                <th className="px-4 py-3 font-semibold">Plan</th>
                                <th className="px-4 py-3 font-semibold">Paid / expires</th>
                                <th className="px-4 py-3 font-semibold">Invoices</th>
                                <th className="px-4 py-3 font-semibold">Services</th>
                                <th className="px-4 py-3 font-semibold">Invite</th>
                                <th className="px-4 py-3 font-semibold">Change plan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-[#64748B]">
                                        No portal users or paid invites yet. After ZappSites checkout they appear here.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr
                                        key={user.userId || user.invite?.id || user.email}
                                        className="border-b border-[#F8FAFC] align-top"
                                    >
                                        <td className="px-4 py-4">
                                            <p className="font-medium text-[#0F172A]">{user.name || '—'}</p>
                                            <p className="text-xs text-[#64748B] mt-0.5">{user.email}</p>
                                            {user.organization && (
                                                <p className="text-[10px] text-[#94A3B8] mt-1">
                                                    {user.organization.name} · /{user.organization.slug}
                                                </p>
                                            )}
                                            {user.kind === 'invite' && (
                                                <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                                    Not claimed yet
                                                </span>
                                            )}
                                            {user.mustChangePassword && user.kind === 'user' && (
                                                <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded">
                                                    Must change password
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            {user.subscription ? (
                                                <>
                                                    <p className="font-medium">{user.subscription.planName}</p>
                                                    {user.subscription.priceLabel && (
                                                        <p className="text-xs text-[#64748B]">{user.subscription.priceLabel}</p>
                                                    )}
                                                    <p className="text-[10px] text-[#94A3B8] mt-1 capitalize">
                                                        {user.subscription.status}
                                                    </p>
                                                </>
                                            ) : (
                                                <span className="text-amber-700 font-medium">No plan</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-xs text-[#334155]">
                                            <p>
                                                <span className="text-[#94A3B8]">Paid </span>
                                                {fmtDate(user.subscription?.paidAt || user.invite?.createdAt)}
                                            </p>
                                            <p className="mt-1">
                                                <span className="text-[#94A3B8]">Expires </span>
                                                {fmtDate(user.subscription?.periodEnd)}
                                            </p>
                                            {user.subscription?.stripeSubscriptionId && (
                                                <p className="mt-1 text-[10px] text-[#94A3B8] font-mono truncate max-w-[160px]" title={user.subscription.stripeSubscriptionId}>
                                                    {user.subscription.stripeSubscriptionId}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-xs">
                                            <p className="font-medium">{user.invoices.totalLabel}</p>
                                            <p className="text-[#64748B] mt-0.5">
                                                {user.invoices.count} booking invoice{user.invoices.count === 1 ? '' : 's'}
                                            </p>
                                        </td>
                                        <td className="px-4 py-4">
                                            {user.features.length ? (
                                                <ul className="space-y-1">
                                                    {user.features.map((f) => (
                                                        <li key={f} className="text-xs text-[#334155] flex items-center gap-1.5">
                                                            <span className="w-1 h-1 rounded-full bg-[#F59E0B]" />
                                                            {FEATURE_LABELS[f]}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <span className="text-xs text-[#94A3B8]">None in portal</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-xs text-[#64748B]">
                                            {user.invite ? (
                                                <>
                                                    <p>{user.invite.claimedAt ? 'Claimed' : 'Paid · awaiting login'}</p>
                                                    <p className="mt-1 text-[10px]">
                                                        Email {user.invite.credentialsEmailedAt ? fmtDate(user.invite.credentialsEmailedAt) : 'pending / logged'}
                                                    </p>
                                                </>
                                            ) : (
                                                <span className="text-[#94A3B8]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            {user.organization ? (
                                                <select
                                                    disabled={busyOrgId === user.organization.id}
                                                    value={user.subscription?.planId || ''}
                                                    onChange={(e) => assignPlan(user.organization!.id, e.target.value)}
                                                    className="w-full max-w-[200px] rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs bg-white"
                                                >
                                                    <option value="">— Remove plan —</option>
                                                    {PLANS.map((p) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-xs text-[#94A3B8]">Claim first</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
