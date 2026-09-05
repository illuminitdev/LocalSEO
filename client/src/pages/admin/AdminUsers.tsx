import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Mail, RefreshCw, Search, UserRound } from 'lucide-react';
import { adminGet } from '../../lib/adminApi';
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
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');

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
                <button
                    type="button"
                    onClick={load}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F8FAFC]"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
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
                        filtered.map((user) => (
                            <Link
                                key={user.userId || user.invite?.id || user.email}
                                to={detailPath(user)}
                                className="flex items-center gap-4 px-4 py-4 hover:bg-[#FFFBEB] transition-colors group"
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
                                        {user.subscription?.priceLabel ? ` · ${user.subscription.priceLabel}` : ''}
                                        {user.subscription?.periodEnd
                                            ? ` · ends ${fmtDate(user.subscription.periodEnd)}`
                                            : ''}
                                    </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-[#CBD5E1] group-hover:text-[#F59E0B] shrink-0" />
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
