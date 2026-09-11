import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    CheckCircle2,
    Check,
    Clock,
    Phone,
    RefreshCw,
    Search,
    Calendar,
    AlertCircle,
    ChevronRight,
    CheckSquare,
    ListTodo,
    Users,
    ArrowUpRight,
    X,
    Shield,
    User
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../../shared/TaskCompletionModal';
import {
    type SalesLeadTask,
    type SalesTaskPriority,
    type SalesTaskStatus,
    type SalesTaskType,
    type SalesSummaryMetrics,
    fetchSalesTasks,
    updateSalesTask,
    fetchSalesSummary
} from './salesApi';
import { apiGet, cn } from '../../shared/utils';

type SalesLead = {
    id: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    nextFollowUpAt?: string | null;
};

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

const STATUS_LABEL: Record<string, string> = {
    new: 'New',
    contacted: 'Contacted',
    callback: 'Callback',
    interested: 'Interested',
    not_interested: 'Not interested',
    converted: 'Converted'
};

function formatDueDate(dueStr?: string | null) {
    if (!dueStr) return null;
    const due = new Date(dueStr);
    const now = new Date();
    const isPast = due < now && due.toDateString() !== now.toDateString();
    const isToday = due.toDateString() === now.toDateString();

    const formatted = due.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    if (isPast) {
        return { text: `Overdue (${formatted})`, style: 'text-red-700 bg-red-50 border-red-200 font-bold' };
    }
    if (isToday) {
        return { text: `Due Today (${due.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })})`, style: 'text-amber-900 bg-amber-50 border-amber-200 font-bold' };
    }
    return { text: formatted, style: 'text-[#64748B] bg-[#F8FAFC] border-[#E2E8F0]' };
}

export default function SalesQueue() {
    const [activeTab, setActiveTab] = useState<'tasks' | 'leads'>('tasks');
    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [leads, setLeads] = useState<SalesLead[]>([]);
    const [summary, setSummary] = useState<SalesSummaryMetrics>({
        pendingTasksCount: 0,
        dueTodayTasksCount: 0,
        callsTodayCount: 0,
        completedTasksCount: 0,
        leadsCount: 0
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successToast, setSuccessToast] = useState<string | null>(null);

    // Confirmation Modal State
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: SalesLeadTask; isCompleting: boolean } | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    // Task filters
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [creatorFilter, setCreatorFilter] = useState<string>('all');
    const [dueTodayOnly, setDueTodayOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [taskList, summaryData, leadsRes] = await Promise.all([
                fetchSalesTasks({
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                    taskType: typeFilter !== 'all' ? typeFilter : undefined,
                    createdBy: creatorFilter !== 'all' ? creatorFilter : undefined,
                    dueToday: dueTodayOnly
                }),
                fetchSalesSummary().catch(() => ({
                    pendingTasksCount: 0,
                    dueTodayTasksCount: 0,
                    callsTodayCount: 0,
                    completedTasksCount: 0,
                    leadsCount: 0
                })),
                apiGet('/api/sales/leads').catch(() => ({ leads: [] }))
            ]);

            setTasks(taskList);
            setSummary(summaryData);
            setLeads(leadsRes.leads || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load work queue');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, priorityFilter, typeFilter, creatorFilter, dueTodayOnly]);

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

    const filteredTasks = tasks.filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
            (t.leadPhone && t.leadPhone.includes(q)) ||
            (t.leadEmail && t.leadEmail.toLowerCase().includes(q)) ||
            (t.notes && t.notes.toLowerCase().includes(q))
        );
    });

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-300">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Pending Tasks</span>
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#F59E0B] flex items-center justify-center">
                            <ListTodo className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{summary.pendingTasksCount}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">Assigned by admin & self</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Due Today</span>
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{summary.dueTodayTasksCount}</p>
                    <p className="text-[11px] text-rose-600 font-semibold mt-0.5">Requires action today</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Calls Logged Today</span>
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Phone className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{summary.callsTodayCount}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">CRM activities logged</p>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Completed Tasks</span>
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckSquare className="w-4 h-4" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-2">{summary.completedTasksCount}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">Finished work items</p>
                </div>
            </div>

            {/* Success Notification */}
            {successToast && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between gap-3 text-sm text-emerald-800 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                        <span className="font-medium">{successToast}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSuccessToast(null)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-sm text-red-700">
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
                    <span>{error}</span>
                </div>
            )}

            {/* Main Tabs Navigation */}
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('tasks')}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
                            activeTab === 'tasks'
                                ? 'bg-[#0F172A] text-white shadow-sm'
                                : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]'
                        )}
                    >
                        <ListTodo className="w-4 h-4" />
                        <span>Assigned Tasks</span>
                        <span className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-black',
                            activeTab === 'tasks' ? 'bg-[#F59E0B] text-[#0F172A]' : 'bg-[#F1F5F9] text-[#64748B]'
                        )}>
                            {summary.pendingTasksCount}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('leads')}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
                            activeTab === 'leads'
                                ? 'bg-[#0F172A] text-white shadow-sm'
                                : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]'
                        )}
                    >
                        <Users className="w-4 h-4" />
                        <span>My Leads & Pipeline</span>
                        <span className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-black',
                            activeTab === 'leads' ? 'bg-[#F59E0B] text-[#0F172A]' : 'bg-[#F1F5F9] text-[#64748B]'
                        )}>
                            {leads.length}
                        </span>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadData()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors shadow-2xs"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Content: Assigned Tasks Tab */}
            {activeTab === 'tasks' && (
                <div className="space-y-4">
                    {/* Filters Bar */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                            <div className="relative flex-1 min-w-[200px] max-w-sm">
                                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search task title, lead, phone…"
                                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                                />
                            </div>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                            >
                                <option value="all">All Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
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
                            </select>

                            <select
                                value={creatorFilter}
                                onChange={(e) => setCreatorFilter(e.target.value as 'all' | 'admin' | 'self')}
                                className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                            >
                                <option value="all">All Creators</option>
                                <option value="admin">🛡️ Assigned by Admin</option>
                                <option value="self">👤 Self Created</option>
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
                                <p className="text-sm font-semibold">Loading assigned tasks…</p>
                            </div>
                        ) : !filteredTasks.length ? (
                            <div className="p-12 text-center text-[#64748B]">
                                <ListTodo className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                                <p className="text-sm font-bold text-[#0F172A]">No tasks found</p>
                                <p className="text-xs mt-1">
                                    {statusFilter === 'pending'
                                        ? 'You have completed all pending tasks! Great job.'
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

                                                        {task.createdByRole === 'admin' ? (
                                                            <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 text-purple-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                                                <Shield className="w-3 h-3 text-purple-600" />
                                                                Assigned by Admin
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                                                <User className="w-3 h-3 text-slate-500" />
                                                                Self Created
                                                            </span>
                                                        )}

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
                                                            'text-sm font-bold hover:text-[#D97706] transition-colors block truncate',
                                                            isDone ? 'text-emerald-950 font-bold' : 'text-[#0F172A]'
                                                        )}
                                                    >
                                                        {task.title}
                                                    </Link>

                                                    {task.notes && (
                                                        <p className={cn("text-xs mt-1 line-clamp-2 leading-relaxed", isDone ? "text-emerald-800/70" : "text-[#64748B]")}>
                                                            {task.notes}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Status Badge + Update Status Button */}
                                                <div className="shrink-0 flex items-center gap-2">
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border",
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
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs"
                                                        title="Update Status"
                                                    >
                                                        <span>Update Status</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Lead Context Bar */}
                                            <div className="mt-2.5 pt-2 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    <span className="font-bold text-[#0F172A]">
                                                        🏢 {task.leadBusinessName || 'Lead'}
                                                    </span>
                                                    {task.leadPhone && (
                                                        <a
                                                            href={`tel:${task.leadPhone}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-[#475569] hover:text-[#0F172A] font-semibold flex items-center gap-1"
                                                        >
                                                            <Phone className="w-3 h-3 text-[#F59E0B]" />
                                                            {task.leadPhone}
                                                        </a>
                                                    )}
                                                    {task.leadScoreTotal != null && (
                                                        <span className="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-black">
                                                            Audit Score: {task.leadScoreTotal}/100
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {task.leadReportUrl && (
                                                        <a
                                                            href={task.leadReportUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-0.5 px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-lg"
                                                        >
                                                            Audit Report
                                                            <ArrowUpRight className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                    <Link
                                                        to={`/sales/leads/${encodeURIComponent(task.leadId)}`}
                                                        className="text-[11px] font-bold text-[#0F172A] hover:bg-[#F1F5F9] px-2.5 py-1 bg-white border border-[#E2E8F0] rounded-lg inline-flex items-center gap-1 shadow-2xs"
                                                    >
                                                        Open CRM
                                                        <ChevronRight className="w-3 h-3 text-[#94A3B8]" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Content: My Leads & Pipeline Tab */}
            {activeTab === 'leads' && (
                <div className="space-y-4">
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                        {!leads.length ? (
                            <div className="p-12 text-center text-[#64748B]">
                                <Users className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                                <p className="text-sm font-bold text-[#0F172A]">No leads in pipeline</p>
                                <p className="text-xs mt-1">Your manager will assign growth audit leads from Admin CRM.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-[#F1F5F9]">
                                {leads.map((lead) => (
                                    <li key={lead.id}>
                                        <Link
                                            to={`/sales/leads/${encodeURIComponent(lead.id)}`}
                                            className="flex items-center gap-3.5 px-5 py-4 hover:bg-[#F8FAFC] group transition-colors"
                                        >
                                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7] text-[#D97706] border border-[#FED7AA] flex items-center justify-center shrink-0 shadow-2xs font-bold text-sm">
                                                {lead.name ? lead.name.charAt(0).toUpperCase() : 'L'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold text-[#0F172A] truncate group-hover:text-[#D97706] transition-colors">
                                                        {lead.name || 'Unnamed Lead'}
                                                    </p>
                                                    <span className="shrink-0 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#475569]">
                                                        {STATUS_LABEL[lead.status] || lead.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-[#64748B] truncate mt-0.5">
                                                    {lead.phone || 'No phone'}
                                                    {lead.email ? ` · ${lead.email}` : ''}
                                                </p>
                                                {lead.nextFollowUpAt && (
                                                    <p className="text-[11px] text-amber-700 font-medium mt-1 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Follow up: {new Date(lead.nextFollowUpAt).toLocaleString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#0F172A] group-hover:translate-x-0.5 transition-all shrink-0" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Task Completion Modal */}
            <TaskCompletionModal
                isOpen={!!confirmModalTask}
                onClose={() => setConfirmModalTask(null)}
                onConfirm={handleConfirmToggleStatus}
                taskTitle={confirmModalTask?.task.title || ''}
                leadName={confirmModalTask?.task.leadBusinessName}
                priority={confirmModalTask?.task.priority}
                currentStatus={confirmModalTask?.task.status}
                isCompleting={confirmModalTask?.isCompleting ?? true}
                loading={modalLoading}
            />
        </div>
    );
}
