import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Calendar,
    CalendarClock,
    CheckCircle2,
    CheckSquare,
    Circle,
    CreditCard,
    ListTodo,
    ShieldCheck
} from 'lucide-react';
import {
    adminGet,
    adminPatch,
    fetchCrmTasks,
    type LeadTask,
    type TaskPriority,
    type TaskStatus
} from './adminApi';
import { FEATURE_LABELS, PLANS, type FeatureKey } from '../../shared/planCatalog';
import { cn } from '../../shared/utils';
import {
    getBookingPreset,
    isBookingPlanId,
    bookingIndustryLabel
} from '../bookings/bookingIndustryPresets';

type ServiceModule = { id: string; name: string; enrolled: boolean };

type AdminUser = {
    kind: 'user' | 'invite';
    userId: string | null;
    email: string;
    name: string;
    createdAt?: string;
    mustChangePassword?: boolean;
    platformRole?: 'customer' | 'sales_agent';
    organization: {
        id: string;
        name: string;
        slug: string;
        tradeType: string;
        bookingIndustryId?: string | null;
    } | null;
    subscription: {
        planId: string;
        planName: string;
        status: string;
        priceLabel: string | null;
        periodEnd?: string | null;
        daysLeft?: number | null;
        paidAt?: string | null;
        autopayEnabled?: boolean;
    } | null;
    invite: {
        id: string;
        claimedAt: string | null;
        credentialsEmailedAt: string | null;
    } | null;
    invoices: { count: number; totalLabel: string };
    features: FeatureKey[];
    services?: ServiceModule[];
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

function fmtDateTime(value?: string | null) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '—';
    }
}

function statusLabel(status: TaskStatus) {
    if (status === 'completed') return 'Completed';
    if (status === 'in_progress') return 'In progress';
    if (status === 'cancelled') return 'Cancelled';
    return 'Pending';
}

function priorityLabel(priority: TaskPriority) {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function SalesAgentDetailBody({ user }: { user: AdminUser }) {
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [taskError, setTaskError] = useState('');

    const loadTasks = useCallback(() => {
        if (!user.userId) {
            setTasks([]);
            setLoadingTasks(false);
            return;
        }
        setLoadingTasks(true);
        setTaskError('');
        fetchCrmTasks({ assignedTo: user.userId })
            .then(setTasks)
            .catch((err: Error) => {
                setTasks([]);
                setTaskError(err.message);
            })
            .finally(() => setLoadingTasks(false));
    }, [user.userId]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const assigned = tasks.length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const open = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;

    return (
        <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                    <div className="flex items-center gap-2 text-[#64748B]">
                        <ListTodo className="w-4 h-4 text-[#F59E0B]" />
                        <span className="text-[11px] font-bold uppercase">Assigned</span>
                    </div>
                    <p className="text-2xl font-bold mt-2 text-[#0F172A]">{loadingTasks ? '—' : assigned}</p>
                    <p className="text-xs text-[#64748B] mt-1">Total tasks on this agent</p>
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                    <div className="flex items-center gap-2 text-[#64748B]">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-[11px] font-bold uppercase">Completed</span>
                    </div>
                    <p className="text-2xl font-bold mt-2 text-[#0F172A]">{loadingTasks ? '—' : completed}</p>
                    <p className="text-xs text-[#64748B] mt-1">Finished tasks</p>
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                    <div className="flex items-center gap-2 text-[#64748B]">
                        <Circle className="w-4 h-4 text-[#F59E0B]" />
                        <span className="text-[11px] font-bold uppercase">Open</span>
                    </div>
                    <p className="text-2xl font-bold mt-2 text-[#0F172A]">{loadingTasks ? '—' : open}</p>
                    <p className="text-xs text-[#64748B] mt-1">Pending or in progress</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-[#E2E8F0] p-4">
                    <h3 className="text-xs font-bold uppercase text-[#94A3B8]">Account</h3>
                    <p className="mt-2 font-semibold text-[#0F172A]">
                        {user.kind === 'invite' ? 'Waiting for first login' : 'Active sales agent'}
                    </p>
                    {user.mustChangePassword ? (
                        <p className="text-xs text-amber-800 mt-1">Must change temp password</p>
                    ) : (
                        <p className="text-xs text-[#64748B] mt-1">Telecaller / CRM assignee</p>
                    )}
                </div>
                <div className="rounded-2xl border border-[#E2E8F0] p-4">
                    <h3 className="text-xs font-bold uppercase text-[#94A3B8]">Joined</h3>
                    <p className="mt-2 font-semibold text-[#0F172A]">{fmtDate(user.createdAt)}</p>
                    <p className="text-xs text-[#64748B] mt-1">{user.email}</p>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-[#0F172A] flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-[#D97706]" />
                        Tasks
                    </h3>
                    <button
                        type="button"
                        onClick={loadTasks}
                        disabled={loadingTasks}
                        className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                    >
                        Refresh
                    </button>
                </div>

                {taskError ? (
                    <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                        {taskError}
                    </p>
                ) : null}

                {loadingTasks ? (
                    <p className="text-sm text-[#64748B] py-4">Loading tasks…</p>
                ) : null}

                {!loadingTasks && tasks.length === 0 ? (
                    <p className="text-sm text-[#64748B] rounded-xl border border-dashed border-[#E2E8F0] px-4 py-6 text-center">
                        No tasks assigned to this agent yet.
                    </p>
                ) : null}

                {!loadingTasks && tasks.length > 0 ? (
                    <ul className="divide-y divide-[#F1F5F9] rounded-2xl border border-[#E2E8F0] overflow-hidden bg-white">
                        {tasks.map((task) => (
                            <li key={task.id} className="px-4 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-semibold text-[#0F172A] truncate">{task.title}</p>
                                    <p className="text-xs text-[#94A3B8]">
                                        Lead #{task.leadId.slice(0, 8)}
                                        {task.taskType ? ` · ${task.taskType.replace(/_/g, ' ')}` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <span
                                        className={cn(
                                            'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                                            task.status === 'completed'
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                : task.status === 'cancelled'
                                                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                                                  : 'bg-amber-50 border-amber-200 text-amber-900'
                                        )}
                                    >
                                        {statusLabel(task.status)}
                                    </span>
                                    <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-medium text-[#64748B]">
                                        {priorityLabel(task.priority)}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-[#94A3B8]">
                                        <Calendar className="w-3 h-3" />
                                        {task.dueDate ? fmtDateTime(task.dueDate) : 'No due date'}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </div>
    );
}

export default function AdminUserDetail() {
    const { kind, id } = useParams<{ kind: string; id: string }>();
    const [user, setUser] = useState<AdminUser | null>(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const load = () => {
        if (!kind || !id) return;
        const path =
            kind === 'invite' ? `/api/admin/users/invite/${id}` : `/api/admin/users/user/${id}`;
        setError('');
        adminGet(path)
            .then((data) => setUser(data.user))
            .catch((err: Error) => setError(err.message));
    };

    useEffect(() => {
        load();
    }, [kind, id]);

    const assignPlan = async (planId: string) => {
        if (!user?.organization?.id) return;
        setBusy(true);
        setMsg('');
        setError('');
        try {
            await adminPatch(`/api/admin/organizations/${user.organization.id}/subscription`, {
                planId: planId || null
            });
            setMsg('Plan updated.');
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (error && !user) {
        return (
            <div className="max-w-3xl space-y-4">
                <Link to="/admin/users" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                    <ArrowLeft className="w-4 h-4" /> Back to users
                </Link>
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
            </div>
        );
    }

    if (!user) {
        return <p className="text-sm text-[#64748B]">Loading user…</p>;
    }

    const isSalesAgent = user.platformRole === 'sales_agent';
    const autopayOn = user.subscription ? user.subscription.autopayEnabled !== false : null;
    const onServices = (user.services || []).filter((s) => s.enrolled);
    const offServices = (user.services || []).filter((s) => !s.enrolled);

    return (
        <div className="max-w-4xl space-y-5 pb-8">
            <Link
                to="/admin/users"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
                <ArrowLeft className="w-4 h-4" /> Back to users
            </Link>

            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}
            {msg && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    {msg}
                </p>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#F59E0B]">
                        {isSalesAgent ? 'Sales agent' : 'User'}
                    </p>
                    <h2 className="text-2xl font-bold mt-1">{user.name || 'User'}</h2>
                    <p className="text-sm text-white/70 mt-1">{user.email}</p>
                    {!isSalesAgent && user.organization && (
                        <p className="text-xs text-white/50 mt-2">
                            {user.organization.name}
                            {user.organization.bookingIndustryId
                                ? ` · ${bookingIndustryLabel(user.organization.bookingIndustryId) || user.organization.tradeType}`
                                : user.organization.tradeType
                                  ? ` · ${user.organization.tradeType}`
                                  : ''}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-4">
                        {isSalesAgent && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-amber-400/20 text-amber-100 border border-amber-300/30">
                                Telecaller
                            </span>
                        )}
                        {user.kind === 'invite' && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-amber-400/20 text-amber-100 border border-amber-300/30">
                                Not logged in yet
                            </span>
                        )}
                        {!isSalesAgent && user.subscription?.status === 'active' && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                                Plan active
                            </span>
                        )}
                        {!isSalesAgent && autopayOn === true && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-sky-400/20 text-sky-100">
                                Autopay on
                            </span>
                        )}
                        {!isSalesAgent && autopayOn === false && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-white/10 text-white/80">
                                Autopay off
                            </span>
                        )}
                    </div>
                </div>

                {isSalesAgent ? (
                    <SalesAgentDetailBody user={user} />
                ) : (
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                <div className="flex items-center gap-2 text-[#64748B]">
                                    <CreditCard className="w-4 h-4 text-[#F59E0B]" />
                                    <span className="text-[11px] font-bold uppercase">Plan</span>
                                </div>
                                <p className="text-lg font-bold mt-2">{user.subscription?.planName || 'None'}</p>
                                <p className="text-sm text-[#64748B] mt-1">{user.subscription?.priceLabel || '—'}</p>
                            </div>
                            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                <div className="flex items-center gap-2 text-[#64748B]">
                                    <CalendarClock className="w-4 h-4 text-[#F59E0B]" />
                                    <span className="text-[11px] font-bold uppercase">When it ends</span>
                                </div>
                                <p className="text-lg font-bold mt-2">{fmtDate(user.subscription?.periodEnd)}</p>
                                <p className="text-sm text-[#64748B] mt-1">
                                    Paid {fmtDate(user.subscription?.paidAt)}
                                    {user.subscription?.daysLeft != null && user.subscription.daysLeft >= 0
                                        ? ` · ${user.subscription.daysLeft}d left`
                                        : ''}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                <div className="flex items-center gap-2 text-[#64748B]">
                                    <ShieldCheck className="w-4 h-4 text-[#F59E0B]" />
                                    <span className="text-[11px] font-bold uppercase">Autopay</span>
                                </div>
                                <p className="text-lg font-bold mt-2">
                                    {user.subscription ? (autopayOn ? 'On' : 'Off') : '—'}
                                </p>
                                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                                    {user.subscription
                                        ? autopayOn
                                            ? 'Charges each month and keeps tools on.'
                                            : 'No more charges. Tools stop on the end date.'
                                        : 'Assign a plan first.'}
                                </p>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-[#0F172A]">Portal tools</h3>
                                <span className="text-xs text-[#64748B]">
                                    {onServices.length} on · {offServices.length} off
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(user.services || []).map((s) => (
                                    <div
                                        key={s.id}
                                        className={cn(
                                            'rounded-xl border px-3 py-2.5 text-sm flex justify-between',
                                            s.enrolled
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                                                : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]'
                                        )}
                                    >
                                        <span className="font-medium">{s.name}</span>
                                        <span className="text-[10px] font-bold uppercase">
                                            {s.enrolled ? 'On' : 'Off'}
                                        </span>
                                    </div>
                                ))}
                                {!user.services?.length &&
                                    user.features.map((f) => (
                                        <div
                                            key={f}
                                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm"
                                        >
                                            {FEATURE_LABELS[f]}
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {user.subscription &&
                            isBookingPlanId(user.subscription.planId) &&
                            (user.organization?.bookingIndustryId || user.organization?.tradeType) && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-[#0F172A]">Booking industry / services</h3>
                                        <span className="text-xs text-[#64748B]">
                                            {bookingIndustryLabel(user.organization.bookingIndustryId) ||
                                                getBookingPreset(
                                                    user.organization.bookingIndustryId ||
                                                        user.organization.tradeType
                                                ).name}
                                        </span>
                                    </div>
                                    <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 mb-2 text-sm text-[#64748B]">
                                        Industry id:{' '}
                                        <span className="font-semibold text-[#0F172A]">
                                            {user.organization.bookingIndustryId ||
                                                getBookingPreset(user.organization.tradeType).id}
                                        </span>
                                    </div>
                                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {getBookingPreset(
                                            user.organization.bookingIndustryId || user.organization.tradeType
                                        ).services.map((svc) => (
                                            <li
                                                key={svc}
                                                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A]"
                                            >
                                                {svc}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-2xl border border-[#E2E8F0] p-4">
                                <h3 className="text-xs font-bold uppercase text-[#94A3B8]">Login</h3>
                                <p className="mt-2 font-semibold">
                                    {user.kind === 'invite'
                                        ? 'Waiting for first login'
                                        : user.invite?.claimedAt
                                          ? 'Has logged in'
                                          : 'Registered'}
                                </p>
                                {user.mustChangePassword && (
                                    <p className="text-xs text-amber-800 mt-1">Must change temp password</p>
                                )}
                            </div>
                            <div className="rounded-2xl border border-[#E2E8F0] p-4">
                                <h3 className="text-xs font-bold uppercase text-[#94A3B8]">Booking invoices</h3>
                                <p className="mt-2 text-lg font-bold">{user.invoices.totalLabel}</p>
                                <p className="text-xs text-[#64748B] mt-1">{user.invoices.count} invoices</p>
                            </div>
                        </div>

                        {user.organization ? (
                            <form
                                className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3"
                                onSubmit={(e: FormEvent) => e.preventDefault()}
                            >
                                <h3 className="font-bold text-[#0F172A]">Manage this user</h3>
                                <label className="block">
                                    <span className="text-[11px] font-bold uppercase text-[#64748B]">Change plan</span>
                                    <select
                                        disabled={busy}
                                        value={user.subscription?.planId || ''}
                                        onChange={(e) => assignPlan(e.target.value)}
                                        className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm"
                                    >
                                        <option value="">Remove plan</option>
                                        {PLANS.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {user.subscription && (
                                    <div className="flex justify-between gap-3 py-2.5 border-t border-[#E2E8F0] text-sm">
                                        <span className="text-[#64748B]">Autopay</span>
                                        <span className="font-semibold text-[#0F172A]">
                                            {autopayOn ? 'On' : 'Off'}
                                        </span>
                                    </div>
                                )}
                            </form>
                        ) : (
                            <p className="text-sm text-[#64748B] rounded-xl border border-dashed border-[#E2E8F0] px-4 py-3">
                                User must log in once before you can change plan here.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
