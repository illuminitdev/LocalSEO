import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    ChevronRight,
    Headphones,
    Plus,
    Search,
    Trash2,
    Users,
    UserRound,
    X
} from 'lucide-react';
import { adminDelete, adminGet, adminPost } from './adminApi';
import { PLANS } from '../../shared/planCatalog';
import { cn } from '../../shared/utils';

type AdminUser = {
    kind: 'user' | 'invite';
    userId: string | null;
    email: string;
    name: string;
    createdAt: string;
    platformRole?: 'customer' | 'sales_agent';
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

type RoleFilter = 'all' | 'customer' | 'sales_agent' | 'invite';

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

function roleOf(user: AdminUser): 'customer' | 'sales_agent' | 'invite' {
    if (user.kind === 'invite') return 'invite';
    return user.platformRole === 'sales_agent' ? 'sales_agent' : 'customer';
}

function roleLabel(user: AdminUser) {
    const r = roleOf(user);
    if (r === 'sales_agent') return 'Sales Agent';
    if (r === 'invite') return 'Pending invite';
    return 'User';
}

export default function AdminUsers() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
    const [addOpen, setAddOpen] = useState(false);
    const [addBusy, setAddBusy] = useState(false);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: '' as '' | 'customer' | 'sales_agent',
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

    const totalUsers = users.length;
    const portalUsers = users.filter((u) => roleOf(u) === 'customer').length;
    const salesAgents = users.filter((u) => roleOf(u) === 'sales_agent').length;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users.filter((u) => {
            const role = roleOf(u);
            if (roleFilter === 'customer' && role !== 'customer') return false;
            if (roleFilter === 'sales_agent' && role !== 'sales_agent') return false;
            if (roleFilter === 'invite' && role !== 'invite') return false;
            if (!q) return true;
            return (
                u.email.toLowerCase().includes(q) ||
                (u.name || '').toLowerCase().includes(q) ||
                (u.organization?.name || '').toLowerCase().includes(q) ||
                (u.subscription?.planName || '').toLowerCase().includes(q) ||
                roleLabel(u).toLowerCase().includes(q)
            );
        });
    }, [users, query, roleFilter]);

    const resetForm = () => {
        setForm({ name: '', email: '', password: '', role: '', businessName: '', planId: '' });
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
                role: form.role,
                businessName: form.businessName.trim() || undefined,
                planId: form.role === 'customer' && form.planId ? form.planId : undefined
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
        <div className="space-y-5 max-w-6xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">User Management</h2>
                    <p className="text-sm text-[#64748B] mt-1">Create and manage system users</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setError('');
                        setAddOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#1E293B] shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Create User
                </button>
            </div>

            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}
            {msg && (
                <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    {msg}
                </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-[#64748B]">Total Users</p>
                        <p className="text-3xl font-bold text-[#0F172A] mt-1 tabular-nums">{totalUsers}</p>
                        <p className="text-xs text-[#94A3B8] mt-1">All registered users</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-[#E2E8F0] text-[#475569] flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5" />
                    </div>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-sky-800/80">Users</p>
                        <p className="text-3xl font-bold text-sky-700 mt-1 tabular-nums">{portalUsers}</p>
                        <p className="text-xs text-sky-700/70 mt-1">Portal customers</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                        <UserRound className="w-5 h-5" />
                    </div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-emerald-800/80">Sales Agents</p>
                        <p className="text-3xl font-bold text-emerald-700 mt-1 tabular-nums">{salesAgents}</p>
                        <p className="text-xs text-emerald-700/70 mt-1">Telecallers</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Headphones className="w-5 h-5" />
                    </div>
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-4 border-b border-[#E2E8F0] space-y-4">
                    <div>
                        <h3 className="text-base font-bold text-[#0F172A]">All Users</h3>
                        <p className="text-xs text-[#64748B] mt-0.5">
                            {filtered.length} of {totalUsers} users
                        </p>
                    </div>
                    <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search users by name, email, or phone..."
                                className="w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                            />
                        </div>
                        <label className="block text-xs font-semibold text-[#64748B] lg:w-56 shrink-0">
                            Filter by Role
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                            >
                                <option value="all">All Roles</option>
                                <option value="customer">Users</option>
                                <option value="sales_agent">Sales Agents</option>
                                <option value="invite">Pending invites</option>
                            </select>
                        </label>
                    </div>
                </div>

                <div className="divide-y divide-[#F1F5F9]">
                    {filtered.length === 0 ? (
                        <div className="px-6 py-14 text-center">
                            <div className="mx-auto w-12 h-12 rounded-2xl bg-[#F1F5F9] text-[#94A3B8] flex items-center justify-center">
                                <Users className="w-6 h-6" />
                            </div>
                            <p className="mt-4 text-sm font-semibold text-[#334155]">No users found</p>
                            <p className="mt-1 text-sm text-[#64748B] max-w-sm mx-auto">
                                Try adjusting your search or filters, or add a new user.
                            </p>
                        </div>
                    ) : (
                        filtered.map((user) => {
                            const rowKey = user.userId || user.invite?.id || user.email;
                            const busy = deletingKey === rowKey;
                            const role = roleOf(user);
                            return (
                                <div
                                    key={rowKey}
                                    className="flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-[#F8FAFC] transition-colors group"
                                >
                                    <Link
                                        to={detailPath(user)}
                                        className="flex items-center gap-4 min-w-0 flex-1"
                                    >
                                        <div
                                            className={cn(
                                                'w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0',
                                                role === 'sales_agent'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : role === 'invite'
                                                      ? 'bg-amber-50 text-amber-800'
                                                      : 'bg-[#0F172A] text-[#F59E0B]'
                                            )}
                                        >
                                            {(user.name || user.email || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-bold text-[#0F172A] truncate">
                                                    {user.name || user.email}
                                                </p>
                                                <span
                                                    className={cn(
                                                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border',
                                                        role === 'sales_agent'
                                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            : role === 'invite'
                                                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                                                              : 'bg-sky-50 text-sky-800 border-sky-200'
                                                    )}
                                                >
                                                    {roleLabel(user)}
                                                </span>
                                                {user.kind === 'user' &&
                                                    role === 'customer' &&
                                                    (user.subscription?.status === 'active' ? (
                                                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                            Live
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                                            No plan
                                                        </span>
                                                    ))}
                                            </div>
                                            <p className="text-xs text-[#64748B] truncate mt-0.5">{user.email}</p>
                                            {role !== 'sales_agent' && (
                                                <p className="text-xs text-[#334155] mt-1.5">
                                                    {user.subscription?.planName || 'No plan'}
                                                    {user.subscription?.priceLabel
                                                        ? ` · ${user.subscription.priceLabel}`
                                                        : ''}
                                                    {user.subscription?.periodEnd
                                                        ? ` · ends ${fmtDate(user.subscription.periodEnd)}`
                                                        : ''}
                                                </p>
                                            )}
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
                            <h2 className="text-base font-black text-[#0F172A]">Create User</h2>
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
                                Password
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
                                Role
                                <select
                                    required
                                    value={form.role}
                                    onChange={(e) => {
                                        const role = e.target.value as '' | 'customer' | 'sales_agent';
                                        setForm((f) => ({
                                            ...f,
                                            role,
                                            planId: role === 'sales_agent' ? '' : f.planId,
                                            businessName: role === 'sales_agent' ? '' : f.businessName
                                        }));
                                    }}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                                >
                                    <option value="">Select role</option>
                                    <option value="customer">User</option>
                                    <option value="sales_agent">Sales Agent</option>
                                </select>
                            </label>
                            {form.role === 'customer' && (
                                <>
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
                                </>
                            )}
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
