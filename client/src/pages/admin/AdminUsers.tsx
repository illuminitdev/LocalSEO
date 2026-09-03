import { useEffect, useMemo, useState } from 'react';
import { adminGet, adminPatch } from '../../lib/adminApi';
import { FEATURE_LABELS, PLANS, type FeatureKey } from '../../lib/planCatalog';
import { cn } from '../../lib/utils';

type ServiceModule = { id: string; name: string; feature: string; enrolled: boolean };

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
        daysLeft?: number | null;
        paidAt?: string | null;
        stripeSubscriptionId?: string | null;
        stripeCustomerId?: string | null;
        cancelAtPeriodEnd?: boolean;
        autopayEnabled?: boolean;
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
    services?: ServiceModule[];
    products: { id: string; name: string; enrolled: boolean }[];
};

type FilterKey = 'all' | 'active' | 'expiring' | 'autopay_off' | 'unclaimed';

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

function userKey(user: AdminUser) {
    return user.userId || user.invite?.id || user.email;
}

export default function AdminUsers() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [stage, setStage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const load = () => {
        adminGet('/api/admin/users')
            .then((data) => {
                const next = data.users || [];
                setUsers(next);
                setStage(data.stage || '');
                setSelectedKey((prev) => {
                    if (prev && next.some((u: AdminUser) => userKey(u) === prev)) return prev;
                    return next[0] ? userKey(next[0]) : null;
                });
            })
            .catch((err: Error) => setError(err.message));
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users.filter((u) => {
            if (filter === 'unclaimed' && u.kind !== 'invite') return false;
            if (filter === 'active' && u.subscription?.status !== 'active') return false;
            if (filter === 'autopay_off' && u.subscription?.autopayEnabled !== false) return false;
            if (filter === 'expiring') {
                const days = u.subscription?.daysLeft;
                if (days == null || days > 7 || days < 0) return false;
            }
            if (!q) return true;
            return (
                u.email.toLowerCase().includes(q) ||
                (u.name || '').toLowerCase().includes(q) ||
                (u.organization?.name || '').toLowerCase().includes(q) ||
                (u.subscription?.planName || '').toLowerCase().includes(q)
            );
        });
    }, [users, query, filter]);

    const selected = filtered.find((u) => userKey(u) === selectedKey) || filtered[0] || null;

    const assignPlan = async (orgId: string, planId: string) => {
        setBusy(true);
        setMsg('');
        setError('');
        try {
            await adminPatch(`/api/admin/organizations/${orgId}/subscription`, { planId: planId || null });
            setMsg('Plan updated.');
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const toggleAutopay = async (orgId: string, enabled: boolean) => {
        setBusy(true);
        setMsg('');
        setError('');
        try {
            await adminPatch(`/api/admin/organizations/${orgId}/subscription`, { autopayEnabled: enabled });
            setMsg(enabled ? 'Autopay turned on.' : 'Autopay turned off. Access continues until period end.');
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const registered = users.filter((u) => u.kind === 'user').length;
    const pending = users.filter((u) => u.kind === 'invite').length;

    return (
        <div className="h-full flex flex-col gap-4 min-h-0">
            <div className="flex flex-wrap items-end justify-between gap-3 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-[#0F172A]">Users &amp; billing</h1>
                    <p className="text-sm text-[#64748B] mt-1">
                        Plan, renew date, autopay, and portal services per customer.
                        {stage ? ` Viewing ${stage}.` : ''}
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

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2 shrink-0">{error}</p>}
            {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 shrink-0">{msg}</p>}

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden flex flex-col min-h-[420px]">
                    <div className="p-3 border-b border-[#E2E8F0] space-y-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search name, email, plan…"
                            className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-1">
                            {(
                                [
                                    ['all', 'All'],
                                    ['active', 'Active'],
                                    ['expiring', 'Expiring'],
                                    ['autopay_off', 'Autopay off'],
                                    ['unclaimed', 'Unclaimed']
                                ] as const
                            ).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setFilter(id)}
                                    className={cn(
                                        'px-2 py-1 rounded-md text-[11px] font-semibold',
                                        filter === id
                                            ? 'bg-[#0F172A] text-white'
                                            : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#E2E8F0]'
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filtered.length === 0 ? (
                            <p className="p-4 text-sm text-[#64748B]">No matching customers.</p>
                        ) : (
                            filtered.map((user) => {
                                const key = userKey(user);
                                const active = selected && userKey(selected) === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSelectedKey(key)}
                                        className={cn(
                                            'w-full text-left px-4 py-3 border-b border-[#F1F5F9] transition-colors',
                                            active ? 'bg-[#FFFBEB] border-l-2 border-l-[#F59E0B]' : 'hover:bg-[#F8FAFC]'
                                        )}
                                    >
                                        <p className="text-sm font-semibold text-[#0F172A] truncate">{user.name || user.email}</p>
                                        <p className="text-xs text-[#64748B] truncate mt-0.5">{user.email}</p>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <span className="text-[10px] font-medium text-[#334155]">
                                                {user.subscription?.planName || 'No plan'}
                                            </span>
                                            {user.kind === 'invite' && (
                                                <span className="text-[10px] font-bold uppercase text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                                                    Invite
                                                </span>
                                            )}
                                            {user.subscription?.autopayEnabled === false && (
                                                <span className="text-[10px] font-bold uppercase text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                    Autopay off
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden min-h-[420px]">
                    {!selected ? (
                        <div className="h-full flex items-center justify-center p-8 text-sm text-[#64748B]">
                            Select a customer to see plan and services.
                        </div>
                    ) : (
                        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
                            <div>
                                <h2 className="text-xl font-bold text-[#0F172A]">{selected.name || 'Customer'}</h2>
                                <p className="text-sm text-[#64748B] mt-1">{selected.email}</p>
                                {selected.organization && (
                                    <p className="text-xs text-[#94A3B8] mt-1">
                                        {selected.organization.name} · /{selected.organization.slug}
                                        {selected.organization.tradeType ? ` · ${selected.organization.tradeType}` : ''}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Plan</p>
                                    <p className="text-lg font-bold mt-1">{selected.subscription?.planName || 'None'}</p>
                                    <p className="text-xs text-[#64748B] mt-1">
                                        {selected.subscription?.priceLabel || '—'} ·{' '}
                                        <span className="capitalize">{selected.subscription?.status || 'n/a'}</span>
                                    </p>
                                </div>
                                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Billing window</p>
                                    <p className="text-sm mt-2">
                                        <span className="text-[#94A3B8]">Paid </span>
                                        {fmtDate(selected.subscription?.paidAt || selected.invite?.createdAt)}
                                    </p>
                                    <p className="text-sm mt-1">
                                        <span className="text-[#94A3B8]">Renews / expires </span>
                                        {fmtDate(selected.subscription?.periodEnd)}
                                        {selected.subscription?.daysLeft != null && selected.subscription.daysLeft >= 0 && (
                                            <span className="text-[#64748B]"> ({selected.subscription.daysLeft}d left)</span>
                                        )}
                                    </p>
                                    <p className="text-sm mt-2">
                                        Autopay:{' '}
                                        <strong>
                                            {selected.subscription
                                                ? selected.subscription.autopayEnabled === false
                                                    ? 'Off'
                                                    : 'On'
                                                : '—'}
                                        </strong>
                                    </p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-[#0F172A] mb-2">Portal services</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(selected.services || []).map((s) => (
                                        <div
                                            key={s.id}
                                            className={cn(
                                                'rounded-lg border px-3 py-2 text-sm',
                                                s.enrolled
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]'
                                            )}
                                        >
                                            {s.enrolled ? '✓ ' : '– '}
                                            {s.name}
                                        </div>
                                    ))}
                                    {!selected.services?.length && selected.features.length > 0 && (
                                        <ul className="col-span-2 space-y-1">
                                            {selected.features.map((f) => (
                                                <li key={f} className="text-sm text-[#334155]">
                                                    · {FEATURE_LABELS[f]}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <h3 className="text-sm font-bold mb-1">Invite / login</h3>
                                    {selected.invite ? (
                                        <>
                                            <p>{selected.invite.claimedAt ? 'Claimed' : 'Paid · awaiting first login'}</p>
                                            <p className="text-xs text-[#64748B] mt-1">
                                                Credentials email:{' '}
                                                {selected.invite.credentialsEmailedAt
                                                    ? fmtDate(selected.invite.credentialsEmailedAt)
                                                    : 'pending / logged on ZappSites'}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-[#64748B]">No invite record</p>
                                    )}
                                    {selected.mustChangePassword && selected.kind === 'user' && (
                                        <p className="text-xs text-sky-800 mt-2">Must change password</p>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold mb-1">Booking invoices</h3>
                                    <p>{selected.invoices.totalLabel}</p>
                                    <p className="text-xs text-[#64748B] mt-1">
                                        {selected.invoices.count} invoice{selected.invoices.count === 1 ? '' : 's'}
                                    </p>
                                </div>
                            </div>

                            {selected.organization ? (
                                <div className="pt-2 border-t border-[#E2E8F0] space-y-3">
                                    <h3 className="text-sm font-bold">Admin actions</h3>
                                    <div className="flex flex-wrap gap-3 items-center">
                                        <select
                                            disabled={busy}
                                            value={selected.subscription?.planId || ''}
                                            onChange={(e) => assignPlan(selected.organization!.id, e.target.value)}
                                            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm bg-white min-w-[200px]"
                                        >
                                            <option value="">— Remove plan —</option>
                                            {PLANS.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name}
                                                </option>
                                            ))}
                                        </select>
                                        {selected.subscription && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    toggleAutopay(
                                                        selected.organization!.id,
                                                        selected.subscription?.autopayEnabled === false
                                                    )
                                                }
                                                className="px-3 py-2 rounded-lg text-sm font-bold bg-[#0F172A] text-white disabled:opacity-50"
                                            >
                                                {selected.subscription.autopayEnabled === false
                                                    ? 'Turn autopay on'
                                                    : 'Turn autopay off'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-[#64748B] border-t border-[#E2E8F0] pt-4">
                                    Customer must claim their invite (first login) before you can change plan here.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
