import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Filter,
    Lightbulb,
    Mail,
    MoreVertical,
    Plus,
    Search,
    Trash2,
    UserCheck,
    UserPlus,
    UserRound,
    Users,
    X
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiDelete, cn } from '../../shared/utils';

const AVATAR_COLORS = [
    { bg: 'bg-orange-100', text: 'text-orange-800' },
    { bg: 'bg-purple-100', text: 'text-purple-800' },
    { bg: 'bg-blue-100', text: 'text-blue-800' },
    { bg: 'bg-emerald-100', text: 'text-emerald-800' },
    { bg: 'bg-rose-100', text: 'text-rose-800' },
    { bg: 'bg-amber-100', text: 'text-amber-800' }
];

function getAvatarStyle(name: string) {
    const charCode = (name || 'T').charCodeAt(0);
    return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
}

export default function Team() {
    const navigate = useNavigate();
    const [members, setMembers] = useState<any[]>([]);
    const [invites, setInvites] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [activeTab, setActiveTab] = useState<'members' | 'invites'>('members');
    const [q, setQ] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [inviteForm, setInviteForm] = useState({
        name: '',
        email: '',
        role: 'owner',
        bookable: true
    });

    const load = async () => {
        try {
            const res = await apiGet('/api/host/team').catch(() => ({ members: [], invites: [] }));
            const fetchedMembers = res.members || [];
            const fetchedInvites = res.invites || [];

            setMembers(fetchedMembers);
            setInvites(fetchedInvites);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Could not load team members');
        }
    };

    useEffect(() => {
        load();
    }, []);

    const metrics = useMemo(() => {
        const total = members.length;
        const active = members.filter((m) => m.active !== false).length;
        const activePct = total > 0 ? Math.round((active / total) * 100) : 100;
        const pending = invites.length;
        const pendingPct = total > 0 ? Math.round((pending / total) * 100) : 0;

        return {
            total,
            active,
            activePct,
            pending,
            pendingPct
        };
    }, [members, invites]);

    const filteredMembers = useMemo(() => {
        return members.filter((m) => {
            const role = String(m.role || 'staff').toLowerCase();
            if (roleFilter && role !== roleFilter.toLowerCase()) return false;
            if (q.trim()) {
                const term = q.toLowerCase();
                const name = (m.display_name || m.name || '').toLowerCase();
                const email = (m.email || '').toLowerCase();
                if (!name.includes(term) && !email.includes(term)) return false;
            }
            return true;
        });
    }, [members, q, roleFilter]);

    const filteredInvites = useMemo(() => {
        return invites.filter((i) => {
            const role = String(i.role || 'staff').toLowerCase();
            if (roleFilter && role !== roleFilter.toLowerCase()) return false;
            if (q.trim()) {
                const term = q.toLowerCase();
                const email = (i.email || '').toLowerCase();
                if (!email.includes(term)) return false;
            }
            return true;
        });
    }, [invites, q, roleFilter]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteForm.email.trim()) return;
        setBusy(true);
        setError('');
        try {
            const res = await apiPost('/api/host/team/invites', {
                email: inviteForm.email.trim(),
                role: inviteForm.role,
                name: inviteForm.name.trim() || undefined,
                bookable: inviteForm.bookable
            });
            setShowInviteModal(false);
            setInfo(res.link ? `Invite created: ${res.link}` : 'Invite sent successfully.');
            setInviteForm({ name: '', email: '', role: 'owner', bookable: true });
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not send invite');
        } finally {
            setBusy(false);
        }
    };

    const toggleBookable = async (m: any) => {
        const id = m.user_id || m.membership_id;
        const nextBookable = !m.bookable;

        setMembers((prev) =>
            prev.map((item) =>
                (item.user_id || item.membership_id) === id ? { ...item, bookable: nextBookable } : item
            )
        );

        if (!String(id).startsWith('team-demo-')) {
            try {
                await apiPatch(`/api/host/team/members/${id}`, {
                    role: m.role,
                    active: m.active !== false,
                    bookable: nextBookable,
                    displayName: m.display_name || m.name || ''
                });
            } catch (err: any) {
                setError(err.message || 'Could not update bookable setting');
                load();
            }
        }
    };

    const changeRole = async (m: any, newRole: string) => {
        const id = m.user_id || m.membership_id;
        setMembers((prev) =>
            prev.map((item) =>
                (item.user_id || item.membership_id) === id ? { ...item, role: newRole } : item
            )
        );

        if (!String(id).startsWith('team-demo-')) {
            try {
                await apiPatch(`/api/host/team/members/${id}`, {
                    role: newRole,
                    active: m.active !== false,
                    bookable: Boolean(m.bookable),
                    displayName: m.display_name || m.name || ''
                });
            } catch (err: any) {
                setError(err.message || 'Could not change role');
                load();
            }
        }
    };

    const toggleActive = async (m: any) => {
        setActiveActionId(null);
        const id = m.user_id || m.membership_id;
        const nextActive = m.active === false;

        setMembers((prev) =>
            prev.map((item) =>
                (item.user_id || item.membership_id) === id ? { ...item, active: nextActive } : item
            )
        );

        if (!String(id).startsWith('team-demo-')) {
            try {
                await apiPatch(`/api/host/team/members/${id}`, {
                    role: m.role,
                    active: nextActive,
                    bookable: Boolean(m.bookable),
                    displayName: m.display_name || m.name || ''
                });
            } catch (err: any) {
                setError(err.message || 'Could not update member status');
                load();
            }
        }
    };

    const deleteMember = async (m: any) => {
        setActiveActionId(null);
        if (!window.confirm(`Remove ${m.display_name || m.name || m.email} from the team?`)) return;
        const id = m.user_id || m.membership_id;

        setMembers((prev) =>
            prev.filter((item) => (item.user_id || item.membership_id) !== id)
        );

        if (!String(id).startsWith('team-demo-')) {
            try {
                await apiDelete(`/api/host/team/members/${id}`);
            } catch (err) {
                console.error(err);
            }
        }
    };

    return (
        <div className="w-full space-y-5">
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">
                        Team
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
                        Invite staff, mark them bookable, and set each member’s schedule under Booking → Availability
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    className="inline-flex items-center gap-1.5 bg-[#FF8800] hover:bg-[#E67A00] active:bg-[#CC6D00] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition shrink-0"
                >
                    <Plus className="w-4 h-4" /> Invite team member
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                    {error}
                </div>
            )}
            {info && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium break-all">
                    {info}
                </div>
            )}

            {/* 3. 3 KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Card 1: Total members */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100">
                        <Users className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500">Total members</p>
                        <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.total}</p>
                        <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">+0 this month</p>
                    </div>
                </div>

                {/* Card 2: Active */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500">Active</p>
                        <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.active}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">{metrics.activePct}% of total</p>
                    </div>
                </div>

                {/* Card 3: Pending invites */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                        <UserPlus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500">Pending invites</p>
                        <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.pending}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">{metrics.pendingPct}% of total</p>
                    </div>
                </div>
            </div>

            {/* 4. Main Data Card Container */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
                {/* Tabs & Filters Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Left: Tab Switcher */}
                    <div className="flex items-center gap-6 border-b md:border-b-0 border-slate-100 -mb-px">
                        <button
                            type="button"
                            onClick={() => setActiveTab('members')}
                            className={cn(
                                'pb-3 text-xs font-bold transition relative',
                                activeTab === 'members'
                                    ? 'text-orange-600 border-b-2 border-orange-500'
                                    : 'text-slate-500 hover:text-slate-800'
                            )}
                        >
                            Team members
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('invites')}
                            className={cn(
                                'pb-3 text-xs font-bold transition relative',
                                activeTab === 'invites'
                                    ? 'text-orange-600 border-b-2 border-orange-500'
                                    : 'text-slate-500 hover:text-slate-800'
                            )}
                        >
                            Pending invites {invites.length > 0 && `(${invites.length})`}
                        </button>
                    </div>

                    {/* Right: Search & Role Filter */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative min-w-[220px]">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search by name or email..."
                                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                            />
                        </div>

                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-hidden"
                        >
                            <option value="">All roles</option>
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="dispatcher">Dispatcher</option>
                            <option value="tech">Tech</option>
                            <option value="staff">Staff</option>
                        </select>

                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
                        >
                            <Filter className="w-3.5 h-3.5 text-slate-500" /> Filter
                        </button>
                    </div>
                </div>

                {/* Table View */}
                {activeTab === 'members' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                <tr>
                                    <th className="py-3.5 px-5 font-bold text-slate-500">
                                        <div className="flex items-center gap-1 cursor-pointer">
                                            Name <span className="text-slate-300">⇅</span>
                                        </div>
                                    </th>
                                    <th className="py-3.5 px-5 font-bold text-slate-500">
                                        <div className="flex items-center gap-1 cursor-pointer">
                                            Email <span className="text-slate-300">⇅</span>
                                        </div>
                                    </th>
                                    <th className="py-3.5 px-5 font-bold text-slate-500">
                                        <div className="flex items-center gap-1 cursor-pointer">
                                            Role <span className="text-slate-300">⇅</span>
                                        </div>
                                    </th>
                                    <th className="py-3.5 px-5 font-bold text-slate-500">
                                        <div className="flex items-center gap-1 cursor-pointer">
                                            Status <span className="text-slate-300">⇅</span>
                                        </div>
                                    </th>
                                    <th className="py-3.5 px-5 font-bold text-slate-500">
                                        <div className="flex items-center gap-1 cursor-pointer">
                                            Bookable <span className="text-slate-300">⇅</span>
                                        </div>
                                    </th>
                                    <th className="py-3.5 px-5 font-bold text-slate-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {!filteredMembers.length ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-slate-400">
                                            <UserRound className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                            <p className="font-bold text-slate-800 text-sm">No team members found</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Try adjusting your filters or invite staff.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMembers.map((m) => {
                                        const avatar = getAvatarStyle(m.display_name || m.name || 'T');
                                        const initial = (m.display_name || m.name || 'T').charAt(0).toUpperCase();
                                        const isActive = m.active !== false;

                                        return (
                                            <tr key={m.user_id || m.membership_id} className="hover:bg-slate-50/80 transition-colors">
                                                {/* Name + Avatar */}
                                                <td className="py-4 px-5">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={cn(
                                                                'w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0',
                                                                avatar.bg,
                                                                avatar.text
                                                            )}
                                                        >
                                                            {initial}
                                                        </div>
                                                        <span className="font-bold text-slate-900 text-xs">
                                                            {m.display_name || m.name || 'Team member'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Email */}
                                                <td className="py-4 px-5 text-slate-600 font-medium">
                                                    {m.email || '—'}
                                                </td>

                                                {/* Role Select Pill */}
                                                <td className="py-4 px-5">
                                                    <select
                                                        value={m.role || 'owner'}
                                                        onChange={(e) => changeRole(m, e.target.value)}
                                                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 capitalize focus:outline-hidden focus:ring-2 focus:ring-orange-500 shadow-2xs"
                                                    >
                                                        <option value="owner">Owner</option>
                                                        <option value="admin">Admin</option>
                                                        <option value="dispatcher">Dispatcher</option>
                                                        <option value="tech">Tech</option>
                                                        <option value="staff">Staff</option>
                                                    </select>
                                                </td>

                                                {/* Status Badge */}
                                                <td className="py-4 px-5">
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border',
                                                            isActive
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-slate-100 text-slate-600 border-slate-200'
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'w-1.5 h-1.5 rounded-full',
                                                                isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                                            )}
                                                        />
                                                        {isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>

                                                {/* Bookable iOS Toggle Switch */}
                                                <td className="py-4 px-5">
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={Boolean(m.bookable)}
                                                        onClick={() => toggleBookable(m)}
                                                        className={cn(
                                                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden',
                                                            m.bookable ? 'bg-[#FF8800]' : 'bg-slate-200'
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                                                                m.bookable ? 'translate-x-5' : 'translate-x-0'
                                                            )}
                                                        />
                                                    </button>
                                                </td>

                                                {/* Actions 3-dots */}
                                                <td className="py-4 px-5 text-right relative">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setActiveActionId(
                                                                activeActionId === (m.user_id || m.membership_id)
                                                                    ? null
                                                                    : m.user_id || m.membership_id
                                                            )
                                                        }
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                                    >
                                                        <MoreVertical className="w-4 h-4" />
                                                    </button>

                                                    {activeActionId === (m.user_id || m.membership_id) && (
                                                        <div className="absolute right-5 mt-1 w-48 rounded-2xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 text-xs text-slate-800 space-y-1 text-left">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setActiveActionId(null);
                                                                    navigate('/booking?panel=settings&tab=availability');
                                                                }}
                                                                className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                            >
                                                                <Calendar className="w-3.5 h-3.5 text-orange-500" />
                                                                <span>Manage Availability</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleActive(m)}
                                                                className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                            >
                                                                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                                                                <span>{m.active === false ? 'Activate member' : 'Deactivate member'}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteMember(m)}
                                                                className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-red-50 flex items-center gap-2 text-red-600 border-t border-slate-100 mt-1"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                <span>Remove member</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-6">
                        {!filteredInvites.length ? (
                            <div className="py-10 text-center text-slate-400">
                                <Mail className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                <p className="font-bold text-slate-800 text-sm">No pending invites</p>
                                <p className="text-xs text-slate-400 mt-0.5">Invited team members who haven't accepted will appear here.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredInvites.map((i) => (
                                    <div key={i.id || i.email} className="py-3 flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-xs text-slate-900">{i.email}</p>
                                            <p className="text-[11px] text-slate-400 capitalize">Role: {i.role || 'Staff'}</p>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                                            Pending
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer Pagination */}
                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <p>
                        Showing 1 to {filteredMembers.length} of {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
                    </p>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 font-bold text-xs border border-orange-200 flex items-center justify-center shadow-xs"
                        >
                            1
                        </button>
                        <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 5. Bottom Callout Banner: Manage Schedules */}
            <div className="bg-[#FFF9F2] border border-[#FDE68A]/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200">
                        <Lightbulb className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-900 text-sm">Manage schedules</h2>
                        <p className="text-xs text-slate-600 mt-0.5">
                            Set each team member’s working hours, service areas and availability under Booking → Availability.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/booking?panel=settings&tab=availability')}
                    className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition shrink-0"
                >
                    <Calendar className="w-4 h-4 text-slate-500" /> Go to Schedule settings
                </button>
            </div>

            {/* Modal: Invite Team Member */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <form
                        onSubmit={handleInvite}
                        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-md space-y-4 shadow-2xl relative"
                    >
                        <button
                            type="button"
                            onClick={() => setShowInviteModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Invite Team Member</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Send an invitation link for staff or stylists to join your workspace.
                            </p>
                        </div>

                        <div className="space-y-3 pt-1">
                            <label className="block text-xs font-bold text-slate-700">
                                Full Name (Optional)
                                <input
                                    value={inviteForm.name}
                                    onChange={(e) => setInviteForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Karun"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <label className="block text-xs font-bold text-slate-700">
                                Email Address *
                                <input
                                    required
                                    type="email"
                                    value={inviteForm.email}
                                    onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                                    placeholder="e.g. member@email.com"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <label className="block text-xs font-bold text-slate-700">
                                Role
                                <select
                                    value={inviteForm.role}
                                    onChange={(e) => setInviteForm((prev) => ({ ...prev, role: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="owner">Owner</option>
                                    <option value="admin">Admin</option>
                                    <option value="dispatcher">Dispatcher</option>
                                    <option value="tech">Tech</option>
                                    <option value="staff">Staff</option>
                                </select>
                            </label>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Bookable on booking page</p>
                                    <p className="text-[11px] text-slate-500">Allow customers to choose this member</p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={inviteForm.bookable}
                                    onClick={() => setInviteForm((prev) => ({ ...prev, bookable: !prev.bookable }))}
                                    className={cn(
                                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                                        inviteForm.bookable ? 'bg-[#FF8800]' : 'bg-slate-200'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                                            inviteForm.bookable ? 'translate-x-5' : 'translate-x-0'
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2.5 pt-3 border-t border-slate-100 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowInviteModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={busy}
                                className="px-5 py-2.5 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                            >
                                {busy ? 'Sending…' : 'Send Invite'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
