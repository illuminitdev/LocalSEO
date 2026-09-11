import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    CheckSquare,
    Check,
    Phone,
    RefreshCw,
    Search,
    Calendar,
    AlertCircle,
    ListTodo,
    ArrowUpRight,
    Building2,
    X,
    Shield,
    Clock,
    Sparkles
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../../shared/TaskCompletionModal';
import {
    type SalesLeadTask,
    type SalesTaskPriority,
    type SalesTaskStatus,
    type SalesTaskType,
    fetchSalesTasks,
    updateSalesTask
} from './salesApi';
import { cn } from '../../shared/utils';

const TASK_TYPE_CONFIG: Record<SalesTaskType, { label: string; icon: string; bg: string; text: string }> = {
    prepare_audit: { label: 'Prepare Audit', icon: '📊', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
    follow_up_call: { label: 'Follow-Up Call', icon: '📞', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
    send_proposal: { label: 'Send Proposal', icon: '📄', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
    onboard_customer: { label: 'Onboard Customer', icon: '🚀', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800' },
    custom: { label: 'Task', icon: '📌', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' }
};

const PRIORITY_BADGES: Record<SalesTaskPriority, { label: string; bg: string; text: string; dot: string }> = {
    urgent: { label: 'Urgent', bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
    high: { label: 'High', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
    medium: { label: 'Medium', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    low: { label: 'Low', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' }
};

export default function SalesTasks() {
    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successToast, setSuccessToast] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [dueTodayOnly, setDueTodayOnly] = useState(false);

    // Modal state
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: SalesLeadTask; isCompleting: boolean } | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const taskList = await fetchSalesTasks({
                status: statusFilter !== 'all' ? statusFilter : undefined,
                priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                taskType: typeFilter !== 'all' ? typeFilter : undefined,
                createdBy: 'admin',
                dueToday: dueTodayOnly
            });

            setTasks(taskList);
        } catch (err: any) {
            setError(err.message || 'Failed to load assigned tasks');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, priorityFilter, typeFilter, dueTodayOnly]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleOpenToggleModal = (task: SalesLeadTask, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const isCompleting = task.status !== 'completed';
        setConfirmModalTask({ task, isCompleting });
    };

    const handleConfirmToggleStatus = async (chosenStatus?: CrmTaskStatus) => {
        if (!confirmModalTask) return;
        const { task, isCompleting } = confirmModalTask;
        setModalLoading(true);
        setError('');
        try {
            const nextStatus: SalesTaskStatus = chosenStatus || (isCompleting ? 'completed' : 'pending');
            await updateSalesTask(task.id, { status: nextStatus });
            await loadData();
            setSuccessToast(
                nextStatus === 'completed'
                    ? 'Task marked as completed! 🎉'
                    : nextStatus === 'in_progress'
                    ? 'Task marked as in progress ⏳'
                    : nextStatus === 'cancelled'
                    ? 'Task marked as cancelled ❌'
                    : 'Task reopened and marked as pending'
            );
            setTimeout(() => setSuccessToast(null), 3500);
            setConfirmModalTask(null);
        } catch (err: any) {
            setError(err.message || 'Could not update task');
        } finally {
            setModalLoading(false);
        }
    };

    const formatDueDate = (due: string | null) => {
        if (!due) return null;
        const d = new Date(due);
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const isToday = due.startsWith(todayStr);
        const isOverdue = d < now && !isToday;

        let style = 'bg-slate-100 text-slate-700 border-slate-200';
        let text = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        if (isOverdue) {
            style = 'bg-red-50 text-red-700 border-red-200 font-bold';
            text = `Overdue • ${text}`;
        } else if (isToday) {
            style = 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
            text = `Today • ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        return { style, text };
    };

    const filteredTasks = tasks.filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            (t.notes && t.notes.toLowerCase().includes(q)) ||
            (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
            (t.leadPhone && t.leadPhone.includes(q)) ||
            (t.leadEmail && t.leadEmail.toLowerCase().includes(q))
        );
    });

    const pendingCount = tasks.filter((t) => t.status === 'pending').length;
    const completedCount = tasks.filter((t) => t.status === 'completed').length;

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Header & Stats Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#334155] text-white p-6 rounded-3xl shadow-sm">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white">Admin Assigned Tasks</h1>
                            <p className="text-xs text-slate-300 mt-0.5">
                                High-priority tasks and lead assignments directed by your administrators.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadData()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-2xs"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Pending</span>
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#F59E0B] flex items-center justify-center">
                            <ListTodo className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{pendingCount}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">Assigned by admin</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Completed</span>
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckSquare className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{completedCount}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">Finished items</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Total Assigned</span>
                        <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Shield className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{tasks.length}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">From admin team</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Due Today</span>
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">
                        {tasks.filter((t) => t.dueDate && t.status === 'pending' && t.dueDate.startsWith(new Date().toISOString().slice(0, 10))).length}
                    </p>
                    <p className="text-[11px] text-rose-600 font-semibold mt-0.5">Requires prompt action</p>
                </div>
            </div>

            {/* Success Toast */}
            {successToast && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-bold shadow-xs animate-in fade-in">
                    <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>{successToast}</span>
                    </div>
                    <button type="button" onClick={() => setSuccessToast(null)} className="text-emerald-700 hover:text-emerald-950">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 font-bold shadow-xs">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="text-rose-600 hover:text-rose-900">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Filters Bar */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search tasks, lead, notes…"
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Statuses ({tasks.length})</option>
                        <option value="pending">Pending ({tasks.filter((t) => t.status === 'pending').length})</option>
                        <option value="in_progress">In Progress ({tasks.filter((t) => t.status === 'in_progress').length})</option>
                        <option value="completed">Completed ({tasks.filter((t) => t.status === 'completed').length})</option>
                        <option value="cancelled">Cancelled ({tasks.filter((t) => t.status === 'cancelled').length})</option>
                    </select>

                    <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Priorities</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>

                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Task Types</option>
                        <option value="prepare_audit">Prepare Audit</option>
                        <option value="follow_up_call">Follow-Up Call</option>
                        <option value="send_proposal">Send Proposal</option>
                        <option value="onboard_customer">Onboard Customer</option>
                        <option value="custom">Custom Task</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={() => setDueTodayOnly((v) => !v)}
                    className={cn(
                        'px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors',
                        dueTodayOnly
                            ? 'bg-[#F59E0B] text-[#0F172A] border-[#F59E0B]'
                            : 'bg-white text-[#64748B] border-[#E2E8F0] hover:bg-[#F8FAFC]'
                    )}
                >
                    Due Today Only
                </button>
            </div>

            {/* Task List */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                {loading && !tasks.length ? (
                    <div className="p-12 text-center text-[#64748B]">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                        <p className="text-sm font-semibold">Loading admin assigned tasks…</p>
                    </div>
                ) : !filteredTasks.length ? (
                    <div className="p-12 text-center text-[#64748B]">
                        <Sparkles className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                        <p className="text-sm font-bold text-[#0F172A]">No tasks found</p>
                        <p className="text-xs mt-1">
                            {statusFilter === 'pending'
                                ? 'You have completed all admin assigned tasks! Great job.'
                                : 'No tasks match the active filters.'}
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-[#F1F5F9]">
                        {filteredTasks.map((task) => {
                            const isDone = task.status === 'completed';
                            const typeConf = TASK_TYPE_CONFIG[task.taskType] || TASK_TYPE_CONFIG.custom;
                            const prioConf = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.medium;
                            const dueBadge = formatDueDate(task.dueDate);

                            return (
                                <li
                                    key={task.id}
                                    className={cn(
                                        'p-4 sm:p-5 transition-colors group',
                                        isDone
                                            ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-4 border-l-emerald-500'
                                            : 'hover:bg-[#F8FAFC]'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        {/* Main Task Info */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                <span className={cn(
                                                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                                                    typeConf.bg,
                                                    typeConf.text
                                                )}>
                                                    <span>{typeConf.icon}</span>
                                                    <span>{typeConf.label}</span>
                                                </span>

                                                <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 text-purple-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                                    <Shield className="w-3 h-3 text-purple-600" />
                                                    Assigned by Admin
                                                </span>

                                                <span className={cn(
                                                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                                                    prioConf.bg,
                                                    prioConf.text
                                                )}>
                                                    <span className={cn('w-1.5 h-1.5 rounded-full', prioConf.dot)} />
                                                    {prioConf.label}
                                                </span>

                                                {dueBadge && (
                                                    <span className={cn(
                                                        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px]',
                                                        dueBadge.style
                                                    )}>
                                                        <Calendar className="w-3 h-3 shrink-0" />
                                                        {dueBadge.text}
                                                    </span>
                                                )}
                                            </div>

                                            <Link
                                                to={`/sales/leads/${encodeURIComponent(task.leadId)}`}
                                                className={cn(
                                                    'text-sm font-bold hover:text-amber-600 transition-colors inline-block',
                                                    isDone ? 'text-emerald-950' : 'text-[#0F172A]'
                                                )}
                                            >
                                                {task.title}
                                            </Link>

                                            {task.notes && (
                                                <p className={cn(
                                                    'text-xs mt-1',
                                                    isDone ? 'text-emerald-800/80' : 'text-[#64748B]'
                                                )}>
                                                    {task.notes}
                                                </p>
                                            )}
                                        </div>

                                        {/* Status Badge + Update Status Button */}
                                        <div className="shrink-0 flex items-center gap-2">
                                            <span className={cn(
                                                "inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-md border",
                                                task.status === 'completed' ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                                                task.status === 'in_progress' ? "bg-amber-50 text-amber-900 border-amber-300" :
                                                task.status === 'cancelled' ? "bg-rose-50 text-rose-800 border-rose-200" :
                                                "bg-slate-50 text-slate-700 border-slate-200"
                                            )}>
                                                {task.status === 'completed' && <Check className="w-3 h-3 text-emerald-600" />}
                                                {task.status === 'in_progress' && <Clock className="w-3 h-3 text-amber-600" />}
                                                {task.status === 'cancelled' && <X className="w-3 h-3 text-rose-600" />}
                                                <span className="capitalize">{task.status.replace('_', ' ')}</span>
                                            </span>

                                            <button
                                                type="button"
                                                onClick={(e) => handleOpenToggleModal(task, e)}
                                                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs"
                                                title="Update Status"
                                            >
                                                <span>Update Status</span>
                                            </button>
                                        </div>
                                    </div>

                                        {/* Lead Link */}
                                        <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                                            <Link
                                                to={`/sales/leads/${encodeURIComponent(task.leadId)}`}
                                                className="inline-flex items-center gap-1.5 font-bold text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg hover:underline group/lead"
                                            >
                                                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                                                <span>{task.leadBusinessName || 'Open Lead Profile'}</span>
                                                <ArrowUpRight className="w-3 h-3 text-amber-500 group-hover/lead:translate-x-0.5 group-hover/lead:-translate-y-0.5 transition-transform" />
                                            </Link>

                                            {task.leadPhone && (
                                                <a
                                                    href={`tel:${task.leadPhone}`}
                                                    className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#0F172A] font-medium bg-[#F1F5F9] px-2 py-0.5 rounded-md text-[11px]"
                                                >
                                                    <Phone className="w-3 h-3" />
                                                    {task.leadPhone}
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                    </ul>
                )}
            </div>

            {/* Task Completion Modal */}
            {confirmModalTask && (
                <TaskCompletionModal
                    isOpen={!!confirmModalTask}
                    taskTitle={confirmModalTask.task.title}
                    leadName={confirmModalTask.task.leadBusinessName}
                    priority={confirmModalTask.task.priority}
                    currentStatus={confirmModalTask.task.status}
                    isCompleting={confirmModalTask.isCompleting}
                    loading={modalLoading}
                    onConfirm={handleConfirmToggleStatus}
                    onClose={() => setConfirmModalTask(null)}
                />
            )}
        </div>
    );
}
