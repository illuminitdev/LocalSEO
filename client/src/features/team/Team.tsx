import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Filter,
    Lightbulb,
    MoreVertical,
    Pencil,
    Plus,
    Search,
    Trash2,
    UserCheck,
    UserPlus,
    UserRound,
    Users,
    X
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPut, apiDelete, cn } from '../../shared/utils';
import { useToast } from '../../shared/Toast';
import { parseTimeToMinutes } from '../bookings/shared/bookingUtils';

const AVATAR_COLORS = [
    { bg: 'bg-orange-100', text: 'text-orange-800' },
    { bg: 'bg-purple-100', text: 'text-purple-800' },
    { bg: 'bg-blue-100', text: 'text-blue-800' },
    { bg: 'bg-emerald-100', text: 'text-emerald-800' },
    { bg: 'bg-rose-100', text: 'text-rose-800' },
    { bg: 'bg-amber-100', text: 'text-amber-800' }
];

const DAY_OPTIONS = [
    { day: 1, label: 'Mon' },
    { day: 2, label: 'Tue' },
    { day: 3, label: 'Wed' },
    { day: 4, label: 'Thu' },
    { day: 5, label: 'Fri' },
    { day: 6, label: 'Sat' },
    { day: 0, label: 'Sun' }
] as const;

function getAvatarStyle(name: string) {
    const charCode = (name || 'T').charCodeAt(0);
    return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
}

function isOwnerMember(m: { role?: string }) {
    return String(m.role || '')
        .trim()
        .toLowerCase() === 'owner';
}

const ROLE_SUGGESTIONS = ['Admin', 'Dispatcher', 'Tech', 'Staff', 'Stylist', 'Therapist', 'Receptionist'];
const CUSTOM_ROLES_KEY = 'localpulse_team_custom_roles';
const CUSTOM_ROLE_VALUE = '__custom__';

function loadCustomRoles(): string[] {
    try {
        const raw = localStorage.getItem(CUSTOM_ROLES_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list)
            ? list.map((r) => String(r).trim()).filter((r) => r && r.toLowerCase() !== 'owner')
            : [];
    } catch {
        return [];
    }
}

function saveCustomRoles(roles: string[]) {
    localStorage.setItem(CUSTOM_ROLES_KEY, JSON.stringify(roles.slice(0, 40)));
}

type OverlapItem = {
    memberName: string;
    dayName: string;
    theirStart: string;
    theirEnd: string;
    yourStart: string;
    yourEnd: string;
    message: string;
};

export default function Team() {
    const { show } = useToast();
    const [members, setMembers] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [actionMenuPos, setActionMenuPos] = useState<{ top: number; left: number } | null>(null);
    const actionMenuRef = useRef<HTMLDivElement | null>(null);
    const actionBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [busy, setBusy] = useState(false);
    const [teamsEnabled, setTeamsEnabled] = useState(false);

    const [addForm, setAddForm] = useState({
        name: '',
        email: '',
        role: 'Staff',
        bookable: true
    });
    const [addRolePick, setAddRolePick] = useState('Staff');
    const [addCustomRole, setAddCustomRole] = useState('');
    const [customRoles, setCustomRoles] = useState<string[]>(() => loadCustomRoles());
    const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
    const [rowRolePick, setRowRolePick] = useState<Record<string, string>>({});
    const [editMember, setEditMember] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({
        name: '',
        email: '',
        role: 'Staff',
        bookable: true
    });
    const [editRolePick, setEditRolePick] = useState('Staff');
    const [editCustomRole, setEditCustomRole] = useState('');

    const [scheduleMember, setScheduleMember] = useState<any | null>(null);
    const [scheduleDays, setScheduleDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
    const [scheduleStart, setScheduleStart] = useState('09:00');
    const [scheduleEnd, setScheduleEnd] = useState('17:00');
    const [scheduleBusy, setScheduleBusy] = useState(false);
    const [scheduleError, setScheduleError] = useState('');
    const [overlapWarn, setOverlapWarn] = useState<OverlapItem[] | null>(null);

    const load = async () => {
        try {
            const res = await apiGet('/api/host/team').catch(() => ({
                members: [],
                invites: [],
                teamsEnabled: false
            }));
            setMembers(res.members || []);
            setTeamsEnabled(Boolean(res.teamsEnabled));
            setError('');
        } catch (e: any) {
            setError(e.message || 'Could not load team members');
        }
    };

    useEffect(() => {
        load();
        const onFocus = () => load();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    const closeActionMenu = () => {
        setActiveActionId(null);
        setActionMenuPos(null);
    };

    const openActionMenu = (id: string) => {
        if (activeActionId === id) {
            closeActionMenu();
            return;
        }
        const btn = actionBtnRefs.current[id];
        if (!btn) {
            setActiveActionId(id);
            return;
        }
        const rect = btn.getBoundingClientRect();
        const menuWidth = 208; // w-52
        const gap = 4;
        const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
        // Open downward by default; flip up if near bottom of viewport
        const estimatedHeight = 180;
        const openUp = rect.bottom + gap + estimatedHeight > window.innerHeight;
        const top = openUp ? Math.max(8, rect.top - estimatedHeight - gap) : rect.bottom + gap;
        setActionMenuPos({ top, left });
        setActiveActionId(id);
    };

    useEffect(() => {
        if (!activeActionId) return;
        const onPointerDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (actionMenuRef.current?.contains(t)) return;
            const btn = actionBtnRefs.current[activeActionId];
            if (btn?.contains(t)) return;
            closeActionMenu();
        };
        const onReposition = () => closeActionMenu();
        document.addEventListener('mousedown', onPointerDown);
        window.addEventListener('scroll', onReposition, true);
        window.addEventListener('resize', onReposition);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('scroll', onReposition, true);
            window.removeEventListener('resize', onReposition);
        };
    }, [activeActionId]);

    const actionMenuMember = useMemo(
        () => members.find((m) => (m.user_id || m.membership_id) === activeActionId) || null,
        [members, activeActionId]
    );

    const metrics = useMemo(() => {
        const total = members.length;
        const active = members.filter((m) => m.active !== false).length;
        const bookable = members.filter((m) => m.bookable).length;
        const activePct = total > 0 ? Math.round((active / total) * 100) : 100;
        return { total, active, activePct, bookable };
    }, [members]);

    /** Previous + suggested roles for dropdowns (Owner excluded). */
    const roleOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        const push = (raw: string) => {
            const role = String(raw || '').trim();
            if (!role || role.toLowerCase() === 'owner') return;
            const key = role.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(role);
        };
        for (const m of members) push(m.role);
        for (const r of customRoles) push(r);
        for (const r of ROLE_SUGGESTIONS) push(r);
        return out.sort((a, b) => a.localeCompare(b));
    }, [members, customRoles]);

    const rememberCustomRole = (role: string) => {
        const trimmed = String(role || '').trim();
        if (!trimmed || trimmed.toLowerCase() === 'owner') return trimmed;
        setCustomRoles((prev) => {
            if (prev.some((r) => r.toLowerCase() === trimmed.toLowerCase())) return prev;
            const next = [trimmed, ...prev].slice(0, 40);
            saveCustomRoles(next);
            return next;
        });
        return trimmed;
    };

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

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addForm.name.trim()) {
            setError('Name is required');
            return;
        }
        const role =
            addRolePick === CUSTOM_ROLE_VALUE
                ? rememberCustomRole(addCustomRole)
                : rememberCustomRole(addRolePick || addForm.role);
        if (!role) {
            setError('Role is required');
            return;
        }
        if (role.toLowerCase() === 'owner') {
            setError('Owner cannot be assigned to new team members');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/host/team/members', {
                name: addForm.name.trim(),
                email: addForm.email.trim() || undefined,
                role,
                bookable: addForm.bookable
            });
            setShowAddModal(false);
            setAddForm({ name: '', email: '', role: 'Staff', bookable: true });
            setAddRolePick('Staff');
            setAddCustomRole('');
            show('Team member added.');
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not add team member');
        } finally {
            setBusy(false);
        }
    };

    const openEdit = (m: any) => {
        closeActionMenu();
        setError('');
        const role = String(m.role || 'Staff');
        const email = String(m.email || '');
        const cleanEmail = email.includes('@team.localpulse.local') ? '' : email;
        setEditMember(m);
        setEditForm({
            name: String(m.name || m.display_name || '').trim(),
            email: cleanEmail,
            role,
            bookable: Boolean(m.bookable)
        });
        if (isOwnerMember(m)) {
            setEditRolePick('Owner');
        } else if (roleOptions.some((r) => r.toLowerCase() === role.toLowerCase())) {
            setEditRolePick(
                roleOptions.find((r) => r.toLowerCase() === role.toLowerCase()) || role
            );
            setEditCustomRole('');
        } else {
            setEditRolePick(CUSTOM_ROLE_VALUE);
            setEditCustomRole(role);
        }
    };

    const handleEditMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editMember) return;
        const id = editMember.user_id || editMember.membership_id;
        const name = editForm.name.trim();
        if (!name) {
            setError('Name is required');
            return;
        }
        const isOwner = isOwnerMember(editMember);
        let role = 'owner';
        if (!isOwner) {
            role =
                editRolePick === CUSTOM_ROLE_VALUE
                    ? rememberCustomRole(editCustomRole)
                    : rememberCustomRole(editRolePick || editForm.role);
            if (!role) {
                setError('Role is required');
                return;
            }
            if (role.toLowerCase() === 'owner') {
                setError('Owner cannot be assigned here');
                return;
            }
        }
        setBusy(true);
        setError('');
        try {
            const payload: Record<string, unknown> = {
                edit: true,
                name,
                displayName: name,
                role: isOwner ? 'owner' : role
            };
            if (!isOwner) payload.email = editForm.email.trim() || '';
            if (teamsEnabled) payload.bookable = editForm.bookable;

            const res = await apiPatch(`/api/host/team/members/${id}`, payload);
            const updated = res.member;
            if (updated) {
                setMembers((prev) =>
                    prev.map((item) =>
                        (item.user_id || item.membership_id) === id
                            ? {
                                  ...item,
                                  ...updated,
                                  name: updated.name || name,
                                  display_name: updated.display_name || updated.name || name,
                                  email: updated.email ?? item.email,
                                  role: updated.role || (isOwner ? 'owner' : role),
                                  bookable:
                                      updated.bookable !== undefined ? updated.bookable : item.bookable
                              }
                            : item
                    )
                );
            }
            setEditMember(null);
            show('Team member updated.');
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not update team member');
        } finally {
            setBusy(false);
        }
    };

    const openSchedule = async (m: any) => {
        closeActionMenu();
        setScheduleError('');
        setOverlapWarn(null);
        setScheduleMember(m);
        setScheduleDays(new Set([1, 2, 3, 4, 5]));
        setScheduleStart('09:00');
        setScheduleEnd('17:00');
        try {
            const res = await apiGet(`/api/host/availability?userId=${encodeURIComponent(m.user_id)}`);
            const rules = (res.weeklyRules || []).filter((r: any) => r.enabled !== false);
            if (rules.length) {
                setScheduleDays(
                    new Set(rules.map((r: any) => Number(r.day_of_week ?? r.dayOfWeek)).filter((d: number) => !Number.isNaN(d)))
                );
                const first = rules[0];
                setScheduleStart(String(first.start_time || first.startTime || '09:00').slice(0, 5));
                setScheduleEnd(String(first.end_time || first.endTime || '17:00').slice(0, 5));
            }
        } catch (err: any) {
            setScheduleError(err.message || 'Could not load this member’s schedule');
        }
    };

    const buildWeeklyRules = () =>
        [...scheduleDays]
            .sort((a, b) => a - b)
            .map((dayOfWeek) => ({
                dayOfWeek,
                startTime: scheduleStart,
                endTime: scheduleEnd,
                enabled: true
            }));

    const applyMemberSchedule = async (force = false) => {
        if (!scheduleMember) return;
        if (!scheduleDays.size) {
            setScheduleError('Select at least one working day.');
            return;
        }
        if (parseTimeToMinutes(scheduleEnd) <= parseTimeToMinutes(scheduleStart)) {
            setScheduleError('End time must be after start time.');
            return;
        }

        const weeklyRules = buildWeeklyRules();
        setScheduleBusy(true);
        setScheduleError('');
        try {
            if (!force) {
                const check = await apiPost('/api/host/availability/check-overlaps', {
                    userId: scheduleMember.user_id,
                    weeklyRules
                });
                if (check.hasOverlaps && check.overlaps?.length) {
                    setOverlapWarn(check.overlaps);
                    setScheduleBusy(false);
                    return;
                }
            }

            await apiPut('/api/host/availability', {
                weeklyRules,
                dateRules: [],
                userId: scheduleMember.user_id
            });
            setOverlapWarn(null);
            setScheduleMember(null);
            show(`Schedule saved for ${scheduleMember.display_name || scheduleMember.name}.`);
        } catch (err: any) {
            setScheduleError(err.message || 'Could not save schedule');
            setOverlapWarn(null);
        } finally {
            setScheduleBusy(false);
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
    };

    const changeRole = async (m: any, newRole: string) => {
        if (isOwnerMember(m)) {
            setError('Owner role is fixed and cannot be changed');
            return;
        }
        const trimmed = String(newRole || '').trim();
        if (!trimmed) {
            setError('Role is required');
            load();
            return;
        }
        if (trimmed.toLowerCase() === 'owner') {
            setError('Owner role is fixed — use a different role for team members');
            load();
            return;
        }
        const id = m.user_id || m.membership_id;
        setMembers((prev) =>
            prev.map((item) =>
                (item.user_id || item.membership_id) === id ? { ...item, role: trimmed } : item
            )
        );
        setRoleDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

        try {
            await apiPatch(`/api/host/team/members/${id}`, {
                role: trimmed,
                active: m.active !== false,
                bookable: Boolean(m.bookable),
                displayName: m.display_name || m.name || ''
            });
        } catch (err: any) {
            setError(err.message || 'Could not change role');
            load();
        }
    };

    const toggleActive = async (m: any) => {
        closeActionMenu();
        if (isOwnerMember(m)) {
            setError('Owner account cannot be deactivated');
            return;
        }
        const id = m.user_id || m.membership_id;
        const nextActive = m.active === false;

        setMembers((prev) =>
            prev.map((item) =>
                (item.user_id || item.membership_id) === id ? { ...item, active: nextActive } : item
            )
        );

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
    };

    const deleteMember = async (m: any) => {
        closeActionMenu();
        if (isOwnerMember(m)) {
            setError('Owner account cannot be removed from the team');
            return;
        }
        if (!window.confirm(`Remove ${m.display_name || m.name || m.email} from the team?`)) return;
        const id = m.user_id || m.membership_id;

        setMembers((prev) => prev.filter((item) => (item.user_id || item.membership_id) !== id));

        try {
            await apiDelete(`/api/host/team/members/${id}`);
            show('Team member removed.');
        } catch (err: any) {
            setError(err.message || 'Could not remove member');
            load();
        }
    };

    return (
        <div className="w-full space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">Team</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
                        Add team members manually, mark them bookable, and set each person’s weekly hours here.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setError('');
                        const defaultRole = roleOptions.includes('Staff')
                            ? 'Staff'
                            : roleOptions[0] || 'Staff';
                        setAddForm({ name: '', email: '', role: defaultRole, bookable: true });
                        setAddRolePick(defaultRole);
                        setAddCustomRole('');
                        setShowAddModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] active:bg-[var(--brand-primary-active)] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition shrink-0"
                >
                    <Plus className="w-4 h-4" /> Add team member
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100">
                        <Users className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500">Total members</p>
                        <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.total}</p>
                    </div>
                </div>

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

                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                        <UserPlus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-500">Bookable</p>
                        <p className="text-2xl font-black text-slate-900 leading-tight">{metrics.bookable}</p>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">Shown on booking page</p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs">
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <p className="text-xs font-bold text-slate-800">Team members</p>

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

                        <input
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            list="team-role-filter-suggestions"
                            placeholder="Filter by role..."
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-hidden min-w-[140px]"
                        />
                        <datalist id="team-role-filter-suggestions">
                            <option value="Owner" />
                            {ROLE_SUGGESTIONS.map((r) => (
                                <option key={r} value={r} />
                            ))}
                            {[...new Set(members.map((m) => String(m.role || '').trim()).filter(Boolean))].map(
                                (r) => (
                                    <option key={`m-${r}`} value={r} />
                                )
                            )}
                        </datalist>

                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
                        >
                            <Filter className="w-3.5 h-3.5 text-slate-500" /> Filter
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[860px]">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                <th className="py-3 px-5">Name</th>
                                <th className="py-3 px-5">Email</th>
                                <th className="py-3 px-5">Role</th>
                                <th className="py-3 px-5">Status</th>
                                <th className="py-3 px-5">Bookable</th>
                                <th className="py-3 px-5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!filteredMembers.length ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center">
                                        <UserRound className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                        <p className="font-bold text-slate-800 text-sm">No team members yet</p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Add staff manually — they appear on the booking board when bookable.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filteredMembers.map((m) => {
                                    const name =
                                        String(m.name || '').trim() ||
                                        String(m.display_name || '').trim() ||
                                        'Team member';
                                    const email = String(m.email || '').trim();
                                    const showEmail =
                                        email &&
                                        !email.includes('@team.localpulse.local') &&
                                        !Boolean(m.is_manual);
                                    const avatar = getAvatarStyle(name);
                                    const isActive = m.active !== false;
                                    const id = m.user_id || m.membership_id;
                                    return (
                                        <tr key={id} className="hover:bg-slate-50/60 transition">
                                            <td className="py-4 px-5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div
                                                        className={cn(
                                                            'w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0',
                                                            avatar.bg,
                                                            avatar.text
                                                        )}
                                                    >
                                                        {(name || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm text-slate-900 truncate">
                                                            {name}
                                                        </p>
                                                        {isOwnerMember(m) && (
                                                            <p className="text-[11px] text-slate-400 truncate">
                                                                Account owner
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-5">
                                                <p className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">
                                                    {showEmail ? email : '—'}
                                                </p>
                                            </td>
                                            <td className="py-4 px-5">
                                                {isOwnerMember(m) ? (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                                                        Owner
                                                    </span>
                                                ) : (
                                                    <div className="space-y-1.5 min-w-[8rem] max-w-[11rem]">
                                                        <select
                                                            value={
                                                                rowRolePick[id] === CUSTOM_ROLE_VALUE
                                                                    ? CUSTOM_ROLE_VALUE
                                                                    : String(m.role || roleOptions[0] || 'Staff')
                                                            }
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                if (v === CUSTOM_ROLE_VALUE) {
                                                                    setRowRolePick((prev) => ({
                                                                        ...prev,
                                                                        [id]: CUSTOM_ROLE_VALUE
                                                                    }));
                                                                    setRoleDrafts((prev) => ({ ...prev, [id]: '' }));
                                                                    return;
                                                                }
                                                                setRowRolePick((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[id];
                                                                    return next;
                                                                });
                                                                if (v !== String(m.role || '').trim()) {
                                                                    void changeRole(m, rememberCustomRole(v));
                                                                }
                                                            }}
                                                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
                                                        >
                                                            {m.role &&
                                                                !roleOptions.some(
                                                                    (r) =>
                                                                        r.toLowerCase() ===
                                                                        String(m.role).toLowerCase()
                                                                ) && (
                                                                    <option value={String(m.role)}>{m.role}</option>
                                                                )}
                                                            {roleOptions.map((r) => (
                                                                <option key={r} value={r}>
                                                                    {r}
                                                                </option>
                                                            ))}
                                                            <option value={CUSTOM_ROLE_VALUE}>
                                                                + Add custom role…
                                                            </option>
                                                        </select>
                                                        {rowRolePick[id] === CUSTOM_ROLE_VALUE && (
                                                            <input
                                                                autoFocus
                                                                value={roleDrafts[id] || ''}
                                                                onChange={(e) =>
                                                                    setRoleDrafts((prev) => ({
                                                                        ...prev,
                                                                        [id]: e.target.value
                                                                    }))
                                                                }
                                                                onBlur={(e) => {
                                                                    const next = e.target.value.trim();
                                                                    setRowRolePick((prev) => {
                                                                        const copy = { ...prev };
                                                                        delete copy[id];
                                                                        return copy;
                                                                    });
                                                                    setRoleDrafts((prev) => {
                                                                        const copy = { ...prev };
                                                                        delete copy[id];
                                                                        return copy;
                                                                    });
                                                                    if (next) {
                                                                        void changeRole(m, rememberCustomRole(next));
                                                                    }
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        (e.target as HTMLInputElement).blur();
                                                                    }
                                                                }}
                                                                placeholder="Type role"
                                                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-4 px-5">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                                                    <span
                                                        className={cn(
                                                            'w-1.5 h-1.5 rounded-full',
                                                            isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                                        )}
                                                    />
                                                    {isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-5">
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={Boolean(m.bookable)}
                                                    onClick={() => toggleBookable(m)}
                                                    className={cn(
                                                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden',
                                                        m.bookable ? 'bg-[var(--brand-primary)]' : 'bg-slate-200'
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
                                            <td className="py-4 px-5 text-right">
                                                <button
                                                    type="button"
                                                    ref={(el) => {
                                                        actionBtnRefs.current[id] = el;
                                                    }}
                                                    onClick={() => openActionMenu(id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                                    aria-haspopup="menu"
                                                    aria-expanded={activeActionId === id}
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <p>
                        Showing 1 to {filteredMembers.length} of {filteredMembers.length}{' '}
                        {filteredMembers.length === 1 ? 'member' : 'members'}
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 disabled:opacity-40"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 font-bold text-xs border border-orange-200 flex items-center justify-center"
                        >
                            1
                        </button>
                        <button
                            type="button"
                            disabled
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 disabled:opacity-40"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--brand-primary-soft)] border border-[#FDE68A]/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-100/70 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200">
                        <Lightbulb className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-900 text-sm">Per-member hours</h2>
                        <p className="text-xs text-slate-600 mt-0.5">
                            Use <span className="font-bold">Set availability</span> on a member for days like Mon–Wed.
                            Those days show that person on the Schedule settings calendar. Organisation opening hours
                            stay separate.
                            {!teamsEnabled ? ' Bookable-on-page still needs Booking Pro.' : ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* Add team member */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <form
                        onSubmit={handleAddMember}
                        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-md space-y-4 shadow-2xl relative"
                    >
                        <button
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Add team member</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Saved to your team immediately — no invite link required. They can be selected on the
                                booking board when bookable.
                            </p>
                        </div>

                        <div className="space-y-3 pt-1">
                            <label className="block text-xs font-bold text-slate-700">
                                Full name *
                                <input
                                    required
                                    value={addForm.name}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Karun"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <label className="block text-xs font-bold text-slate-700">
                                Email (optional)
                                <input
                                    type="email"
                                    value={addForm.email}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                                    placeholder="Optional — for contact only"
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-700">
                                    Role *
                                    <select
                                        value={addRolePick}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setAddRolePick(v);
                                            if (v !== CUSTOM_ROLE_VALUE) {
                                                setAddForm((prev) => ({ ...prev, role: v }));
                                                setAddCustomRole('');
                                            }
                                        }}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    >
                                        {roleOptions.map((r) => (
                                            <option key={r} value={r}>
                                                {r}
                                            </option>
                                        ))}
                                        <option value={CUSTOM_ROLE_VALUE}>+ Add custom role…</option>
                                    </select>
                                </label>
                                {addRolePick === CUSTOM_ROLE_VALUE && (
                                    <input
                                        required
                                        autoFocus
                                        value={addCustomRole}
                                        onChange={(e) => {
                                            setAddCustomRole(e.target.value);
                                            setAddForm((prev) => ({ ...prev, role: e.target.value }));
                                        }}
                                        placeholder="Type a new role, e.g. Stylist"
                                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                )}
                                <p className="text-[11px] font-medium text-slate-400">
                                    Pick a previous role, or add a custom one. Owner cannot be assigned here.
                                </p>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Bookable on booking page</p>
                                    <p className="text-[11px] text-slate-500">
                                        Allow customers to choose this member
                                        {!teamsEnabled ? ' (needs Booking Pro)' : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={addForm.bookable}
                                    onClick={() => setAddForm((prev) => ({ ...prev, bookable: !prev.bookable }))}
                                    className={cn(
                                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                                        addForm.bookable ? 'bg-[var(--brand-primary)]' : 'bg-slate-200'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                                            addForm.bookable ? 'translate-x-5' : 'translate-x-0'
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2.5 pt-3 border-t border-slate-100 justify-end">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={busy}
                                className="px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                            >
                                {busy ? 'Adding…' : 'Add member'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit team member */}
            {editMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <form
                        onSubmit={handleEditMember}
                        className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-md space-y-4 shadow-2xl relative"
                    >
                        <button
                            type="button"
                            onClick={() => setEditMember(null)}
                            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Edit team member</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Update name{isOwnerMember(editMember) ? '' : ', email, and role'}.
                                {isOwnerMember(editMember) ? ' Owner role stays Owner.' : ''}
                            </p>
                        </div>

                        <div className="space-y-3 pt-1">
                            <label className="block text-xs font-bold text-slate-700">
                                Full name *
                                <input
                                    required
                                    value={editForm.name}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                />
                            </label>

                            {!isOwnerMember(editMember) && (
                                <label className="block text-xs font-bold text-slate-700">
                                    Email (optional)
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({ ...prev, email: e.target.value }))
                                        }
                                        placeholder="Optional"
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>
                            )}

                            {isOwnerMember(editMember) ? (
                                <div>
                                    <p className="text-xs font-bold text-slate-700">Role</p>
                                    <span className="mt-1 inline-flex px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                                        Owner
                                    </span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-700">
                                        Role *
                                        <select
                                            value={editRolePick}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setEditRolePick(v);
                                                if (v !== CUSTOM_ROLE_VALUE) {
                                                    setEditForm((prev) => ({ ...prev, role: v }));
                                                    setEditCustomRole('');
                                                }
                                            }}
                                            className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                        >
                                            {roleOptions.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                            <option value={CUSTOM_ROLE_VALUE}>+ Add custom role…</option>
                                        </select>
                                    </label>
                                    {editRolePick === CUSTOM_ROLE_VALUE && (
                                        <input
                                            required
                                            value={editCustomRole}
                                            onChange={(e) => {
                                                setEditCustomRole(e.target.value);
                                                setEditForm((prev) => ({ ...prev, role: e.target.value }));
                                            }}
                                            placeholder="Type a new role"
                                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                        />
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Bookable on booking page</p>
                                    <p className="text-[11px] text-slate-500">
                                        Allow customers to choose this member
                                        {!teamsEnabled ? ' (needs Booking Pro)' : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={editForm.bookable}
                                    onClick={() =>
                                        setEditForm((prev) => ({ ...prev, bookable: !prev.bookable }))
                                    }
                                    className={cn(
                                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                                        editForm.bookable ? 'bg-[var(--brand-primary)]' : 'bg-slate-200'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                                            editForm.bookable ? 'translate-x-5' : 'translate-x-0'
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2.5 pt-3 border-t border-slate-100 justify-end">
                            <button
                                type="button"
                                onClick={() => setEditMember(null)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={busy}
                                className="px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                            >
                                {busy ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Member weekly availability */}
            {scheduleMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-lg space-y-4 shadow-2xl relative">
                        <button
                            type="button"
                            onClick={() => {
                                setScheduleMember(null);
                                setOverlapWarn(null);
                            }}
                            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">
                                Availability — {scheduleMember.display_name || scheduleMember.name}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Pick days (e.g. Thu &amp; Fri) and one timing. Applies every week for this member only —
                                organisation hours stay unchanged.
                            </p>
                        </div>

                        {scheduleError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                {scheduleError}
                            </p>
                        )}

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-700">Working days</p>
                                <button
                                    type="button"
                                    onClick={() => setScheduleDays(new Set([1, 2, 3, 4, 5, 6]))}
                                    className="text-[11px] font-bold text-[var(--brand-primary)] hover:underline"
                                >
                                    Mon–Sat
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {DAY_OPTIONS.map((d) => {
                                    const on = scheduleDays.has(d.day);
                                    return (
                                        <button
                                            key={d.day}
                                            type="button"
                                            onClick={() => {
                                                setScheduleDays((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(d.day)) next.delete(d.day);
                                                    else next.add(d.day);
                                                    return next;
                                                });
                                                setScheduleError('');
                                            }}
                                            className={cn(
                                                'min-w-[3rem] px-3 py-2 rounded-xl border text-xs font-bold transition',
                                                on
                                                    ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                                                    : 'bg-white text-slate-700 border-slate-200'
                                            )}
                                        >
                                            {d.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-bold text-slate-700 mb-2">Hours</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="time"
                                    value={scheduleStart}
                                    onChange={(e) => setScheduleStart(e.target.value)}
                                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold"
                                />
                                <span className="text-slate-400 text-xs font-bold">to</span>
                                <input
                                    type="time"
                                    value={scheduleEnd}
                                    onChange={(e) => setScheduleEnd(e.target.value)}
                                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2.5 pt-2 border-t border-slate-100 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setScheduleMember(null);
                                    setOverlapWarn(null);
                                }}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={scheduleBusy}
                                onClick={() => applyMemberSchedule(false)}
                                className="px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-bold disabled:opacity-50"
                            >
                                {scheduleBusy ? 'Applying…' : 'Apply for this member'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Overlap warning */}
            {overlapWarn && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-3xl border border-amber-200 p-6 w-full max-w-md space-y-4 shadow-2xl">
                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Schedule overlap</h2>
                            <p className="text-xs text-slate-500 mt-1">
                                These times align with another team member. Review before applying.
                            </p>
                        </div>
                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                            {overlapWarn.map((o, i) => (
                                <li
                                    key={`${o.memberName}-${o.dayName}-${i}`}
                                    className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
                                >
                                    {o.message}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2.5 justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => setOverlapWarn(null)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                            >
                                Edit times
                            </button>
                            <button
                                type="button"
                                disabled={scheduleBusy}
                                onClick={() => applyMemberSchedule(true)}
                                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
                            >
                                Apply anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeActionId &&
                actionMenuPos &&
                actionMenuMember &&
                createPortal(
                    <div
                        ref={actionMenuRef}
                        role="menu"
                        className="fixed z-[9999] w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
                        style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => openEdit(actionMenuMember)}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                            Edit member
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => openSchedule(actionMenuMember)}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            Set availability
                        </button>
                        {!isOwnerMember(actionMenuMember) && (
                            <>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => toggleActive(actionMenuMember)}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                >
                                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                                    {actionMenuMember.active === false ? 'Activate' : 'Deactivate'}
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => deleteMember(actionMenuMember)}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Remove
                                </button>
                            </>
                        )}
                    </div>,
                    document.body
                )}
        </div>
    );
}
