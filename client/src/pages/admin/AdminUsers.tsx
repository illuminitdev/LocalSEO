import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Mail, Plus, RefreshCw, Search, Trash2, UserRound, X } from 'lucide-react';
import { adminDelete, adminGet, adminPost } from '../../lib/adminApi';
import { PLANS } from '../../lib/planCatalog';
import { cn } from '../../lib/utils';

type AdminUser = {
    kind: 'user' | 'invite';
    userId: string | null;
    email: string;
    name: string;
    createdAt: string;
    organization: { id: string; name: string; tradeType: string } | null;
    subscription: {
        planName: string;
        status: string;
        priceLabel: string | null;
        periodEnd?: string | null;
        daysLeft?: number | null;
        autopayEnabled?: boolean;
    } | null;
    invite: { id: string } | null;
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

function detailPath(user: AdminUser) {
    if (user.kind === 'user' && user.userId) return `/admin/users/user/${user.userId}`;
    if (user.invite?.id) return `/admin/users/invite/${user.invite.id}`;
    return '/admin/users';
}

export default function AdminUsers() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [addOpen, setAddOpen] = useState(false);
    const [addBusy, setAddBusy] = useState(false);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        businessName: '',
        planId: ''
    });

    const load = () => {
        adminGet('/api/admin/users')
            .then((data) => {
                setUsers(data.users || []);
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

    const registered = users.filter((u) => u.kind === 'user').length;
    const pending = users.filter((u) => u.kind === 'invite').length;

    const resetForm = () => {
        setForm({ name: '', email: '', password: '', businessName: '', planId: '' });
    };

    const handleAddUser = async (e: FormEvent) => {
        e.preventDefault();
        setAddBusy(true);
        setError('');
        setMsg('');
        try {
            await adminPost('/api/admin/users', {
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password,
                businessName: form.businessName.trim() || undefined,
                planId: form.planId || undefined
            });
            setMsg('User created.');
            setAddOpen(false);
            resetForm();
            load();
        } catch (err: any) {
            setError(err.message || 'Could not create user');
        } finally {
            setAddBusy(false);
        }
    };

    const handleDelete = async (user: AdminUser, e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const label = user.name || user.email;
        if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

        const key = user.userId || user.invite?.id || user.email;
        setDeletingKey(key);
        setError('');
        setMsg('');
        try {
            if (user.kind === 'user' && user.userId) {
                await adminDelete(`/api/admin/users/user/${user.userId}`);
            } else if (user.invite?.id) {
                await adminDelete(`/api/admin/users/invite/${user.invite.id}`);
            } else {
                throw new Error('Nothing to delete.');
            }
            setMsg(`Deleted ${label}.`);
            load();
        } catch (err: any) {
            setError(err.message || 'Could not delete');
        } finally {
            setDeletingKey(null);
        }
    };

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-sm">
                    <span className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#E2E8F0] px-3 py-2 shadow-sm">
                        <UserRound className="w-4 h-4 text-[#F59E0B]" />
                        <strong>{registered}</strong> logged in
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 px-3 py-2">
                        <Mail className="w-4 h-4" />
                        <strong>{pending}</strong> waiting to claim
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setError('');
                            setAddOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] text-white px-3 py-2 text-sm font-semibold hover:bg-[#1E293B]"
                    >
                        <Plus className="w-4 h-4" />
                        Add User
                    </button>
                    <button
                        type="button"
                        onClick={load}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F8FAFC]"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}
            {msg && (
                <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    {msg}
                </p>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[#E2E8F0] space-y-3 bg-[#FCFDFE]">
                    <div className="relative">
                        <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search name, email, plan…"
                            className="w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {(
                            [
                                ['all', 'All'],
                                ['active', 'Paying'],
                                ['expiring', 'Ends soon'],
                                ['autopay_off', 'No autopay'],
                                ['unclaimed', 'Not logged in']
                            ] as const
                        ).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setFilter(id)}
                                className={cn(
                                    'px-2.5 py-1 rounded-lg text-[11px] font-bold',
                                    filter === id
                                        ? 'bg-[#0F172A] text-white'
                                        : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="divide-y divide-[#F1F5F9]">
                    {filtered.length === 0 ? (
                        <p className="p-8 text-center text-sm text-[#64748B]">No customers match.</p>
                    ) : (
                        filtered.map((user) => {
                            const rowKey = user.userId || user.invite?.id || user.email;
                            const busy = deletingKey === rowKey;
                            return (
                                <div
                                    key={rowKey}
                                    className="flex items-center gap-3 px-4 py-4 hover:bg-[#FFFBEB] transition-colors group"
                                >
                                    <Link
                                        to={detailPath(user)}
                                        className="flex items-center gap-4 min-w-0 flex-1"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#0F172A] text-[#F59E0B] flex items-center justify-center font-bold shrink-0">
                                            {(user.name || user.email || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-bold text-[#0F172A] truncate">
                                                    {user.name || user.email}
                                                </p>
                                                {user.kind === 'invite' ? (
                                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                                        Not logged in
                                                    </span>
                                                ) : user.subscription?.status === 'active' ? (
                                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        Live
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                                        No plan
                                                    </span>
                                                )}
                                                {user.subscription?.autopayEnabled === false && (
                                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                                        Autopay off
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-[#64748B] truncate mt-0.5">{user.email}</p>
                                            <p className="text-xs text-[#334155] mt-1.5">
                                                {user.subscription?.planName || 'No plan'}
                                                {user.subscription?.priceLabel
                                                    ? ` · ${user.subscription.priceLabel}`
                                                    : ''}
                                                {user.subscription?.periodEnd
                                                    ? ` · ends ${fmtDate(user.subscription.periodEnd)}`
                                                    : ''}
                                            </p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[#CBD5E1] group-hover:text-[#F59E0B] shrink-0 hidden sm:block" />
                                    </Link>
                                    <button
                                        type="button"
                                        title="Delete"
                                        disabled={busy}
                                        onClick={(e) => handleDelete(user, e)}
                                        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {addOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8F0] shadow-xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
                            <h2 className="text-base font-black text-[#0F172A]">Add User</h2>
                            <button
                                type="button"
                                onClick={() => !addBusy && setAddOpen(false)}
                                className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleAddUser} className="p-5 space-y-3">
                            <label className="block text-xs font-semibold text-[#475569]">
                                Name
                                <input
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-[#475569]">
                                Email
                                <input
                                    required
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-[#475569]">
                                Temporary password
                                <input
                                    required
                                    type="text"
                                    minLength={8}
                                    value={form.password}
                                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-[#475569]">
                                Business name (optional)
                                <input
                                    value={form.businessName}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, businessName: e.target.value }))
                                    }
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-[#475569]">
                                Plan (optional)
                                <select
                                    value={form.planId}
                                    onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                                >
                                    <option value="">No plan</option>
                                    {PLANS.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    disabled={addBusy}
                                    onClick={() => setAddOpen(false)}
                                    className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-semibold hover:bg-[#F8FAFC]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addBusy}
                                    className="rounded-xl bg-[#0F172A] text-white px-3 py-2 text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-50"
                                >
                                    {addBusy ? 'Creating…' : 'Create user'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
