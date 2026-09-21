import { useEffect, useState, useCallback, useMemo } from 'react';
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
    History,
    Mail
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../shared/TaskCompletionModal';
import LeadStatusHistoryModal from '../admin/LeadStatusHistoryModal';
import {
    type SalesLeadTask,
    type SalesTaskPriority,
    type SalesTaskStatus,
    type SalesTaskType,
    fetchSalesTasks,
    fetchSalesIndustries,
    updateSalesTask,
    confirmAndShareFullAuditEmail,
    emailShareStatusLabel
} from './salesApi';
import { cn } from '../shared/utils';

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

function normalizeTaskIndustry(task: SalesLeadTask): string {
    const raw = String(task.leadIndustry || '').trim();
    return raw || 'General';
}


function industryKey(name: string): string {
    return String(name || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function displayIndustryName(name: string): string {
    const cleaned = String(name || '')
        .trim()
        .replace(/\s+/g, ' ');
    return cleaned || 'General';
}

export default function SalesTasks() {
    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [industries, setIndustries] = useState<Array<{ name: string; count: number }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successToast, setSuccessToast] = useState<string | null>(null);

    
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [leadKindFilter, setLeadKindFilter] = useState<'all' | 'full_audit' | 'leads'>('all');
    const [industryFilter, setIndustryFilter] = useState<string>('all');
    const [dueTodayOnly, setDueTodayOnly] = useState(false);

    // Pagination
    const TASKS_PER_PAGE = 10;
    const [currentPage, setCurrentPage] = useState(1);

    
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: SalesLeadTask; isCompleting: boolean } | null>(null);
    const [selectedHistoryTask, setSelectedHistoryTask] = useState<SalesLeadTask | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [sharingAuditId, setSharingAuditId] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [taskList, industryList] = await Promise.all([
                fetchSalesTasks({
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                    taskType: typeFilter !== 'all' ? typeFilter : undefined,
                    createdBy: 'admin',
                    dueToday: dueTodayOnly
                }),
                fetchSalesIndustries().catch(() => [] as Array<{ name: string; count: number }>)
            ]);

            setTasks(taskList);
            setIndustries(industryList);
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

    const handleConfirmToggleStatus = async (chosenStatus?: CrmTaskStatus, statusNotes?: string) => {
        if (!confirmModalTask) return;
        const { task, isCompleting } = confirmModalTask;
        setModalLoading(true);
        setError('');
        try {
            const nextStatus: SalesTaskStatus = chosenStatus || (isCompleting ? 'completed' : 'pending');
            await updateSalesTask(task.id, {
                status: nextStatus,
                notes: statusNotes !== undefined ? statusNotes : undefined
            });
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

    const handleEmailAuditPdf = async (task: SalesLeadTask, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const auditId = String(task.leadAuditId || '').trim();
        if (!auditId) return;
        setSharingAuditId(auditId);
        setError('');
        try {
            const res = await confirmAndShareFullAuditEmail({
                auditId,
                businessName: task.leadBusinessName,
                email: task.leadEmail
            });
            if (!res) return;
            setSuccessToast(
                res.attached === false
                    ? `Report emailed to ${res.to} (link only — PDF was too large to attach).`
                    : `Report emailed to ${res.to}.`
            );
            setTimeout(() => setSuccessToast(null), 4000);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Could not email audit report');
        } finally {
            setSharingAuditId('');
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

    const isFullAuditTask = (t: SalesLeadTask) =>
        String(t.leadSource || '').toLowerCase() === 'full_audit';

    const industryOptions = useMemo(() => {
        const byKey = new Map<string, string>();
        const preferName = (candidate: string) => {
            const display = displayIndustryName(candidate);
            const key = industryKey(display);
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, display);
                return;
            }
            if (display.length > existing.length || (display.length === existing.length && display < existing)) {
                byKey.set(key, display);
            }
        };
        for (const ind of industries) {
            preferName(String(ind.name || ''));
        }
        for (const t of tasks) {
            preferName(normalizeTaskIndustry(t));
        }
        return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [industries, tasks]);

    const industryScopedTasks = useMemo(() => {
        if (industryFilter === 'all') return tasks;
        const selected = industryKey(industryFilter);
        return tasks.filter((t) => industryKey(normalizeTaskIndustry(t)) === selected);
    }, [tasks, industryFilter]);

    const filteredTasks = industryScopedTasks.filter((t) => {
        if (leadKindFilter === 'full_audit' && !isFullAuditTask(t)) return false;
        if (leadKindFilter === 'leads' && isFullAuditTask(t)) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            (t.notes && t.notes.toLowerCase().includes(q)) ||
            (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
            (t.leadPhone && t.leadPhone.includes(q)) ||
            (t.leadEmail && t.leadEmail.toLowerCase().includes(q)) ||
            normalizeTaskIndustry(t).toLowerCase().includes(q)
        );
    });

    
    const totalPages = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const pagedTasks = filteredTasks.slice((safePage - 1) * TASKS_PER_PAGE, safePage * TASKS_PER_PAGE);

    const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

    const fullAuditCount = industryScopedTasks.filter(isFullAuditTask).length;
    const leadsOnlyCount = industryScopedTasks.length - fullAuditCount;

    const pendingCount = industryScopedTasks.filter((t) => t.status === 'pending').length;
    const inProgressCount = industryScopedTasks.filter((t) => t.status === 'in_progress').length;
    const completedCount = industryScopedTasks.filter((t) => t.status === 'completed').length;
    const dueTodayCount = industryScopedTasks.filter((t) => t.dueDate && t.status !== 'completed' && t.dueDate.startsWith(new Date().toISOString().slice(0, 10))).length;
    const totalAssignedCount = industryScopedTasks.length;

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                        Admin Assigned Tasks
                    </h1>
                    <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                        High-priority tasks and lead assignments directed by your administrators.
                    </p>
                </div>

                <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadData()}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] text-xs font-bold rounded-xl transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                    <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                    <span>Refresh</span>
                </button>
            </div>

            {}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-slate-300",
                        statusFilter === 'pending' && !dueTodayOnly ? "border-slate-800 ring-2 ring-slate-800/20 bg-slate-50/50" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Pending</span>
                        <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                            <ListTodo className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-1.5">{pendingCount}</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">Not started</p>
                </button>

                {/* In Progress */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-amber-300",
                        statusFilter === 'in_progress' && !dueTodayOnly ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">In Progress</span>
                        <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-amber-950 mt-1.5">{inProgressCount}</p>
                    <p className="text-[10px] text-amber-700 font-medium mt-0.5">Work started</p>
                </button>

                {/* Completed */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-emerald-300",
                        statusFilter === 'completed' && !dueTodayOnly ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Completed</span>
                        <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckSquare className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-emerald-950 mt-1.5">{completedCount}</p>
                    <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Finished items</p>
                </button>

                {/* Total Assigned */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter('all');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-purple-300",
                        statusFilter === 'all' && !dueTodayOnly ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800">Total Assigned</span>
                        <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Shield className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-1.5">{totalAssignedCount}</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">From admin team</p>
                </button>

                {/* Due Today */}
                <button
                    type="button"
                    onClick={() => {
                        setDueTodayOnly(!dueTodayOnly);
                        if (!dueTodayOnly) setStatusFilter('all');
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-rose-300",
                        dueTodayOnly ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Due Today</span>
                        <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-rose-950 mt-1.5">{dueTodayCount}</p>
                    <p className="text-[10px] text-rose-600 font-semibold mt-0.5">Requires action</p>
                </button>
            </div>

            {}
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

            {}
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

            {}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
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
                        onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Statuses ({industryScopedTasks.length})</option>
                        <option value="pending">Pending ({industryScopedTasks.filter((t) => t.status === 'pending').length})</option>
                        <option value="in_progress">In Progress ({industryScopedTasks.filter((t) => t.status === 'in_progress').length})</option>
                        <option value="completed">Completed ({industryScopedTasks.filter((t) => t.status === 'completed').length})</option>
                        <option value="cancelled">Cancelled ({industryScopedTasks.filter((t) => t.status === 'cancelled').length})</option>
                    </select>

                    <select
                        value={industryFilter}
                        onChange={(e) => { setIndustryFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none max-w-[200px]"
                        title="Filter by business / service industry"
                    >
                        <option value="all">All Industries ({industryOptions.length})</option>
                        {industryOptions.map((name) => (
                            <option key={industryKey(name)} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={priorityFilter}
                        onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
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
                        onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Task Types</option>
                        <option value="prepare_audit">Prepare Audit</option>
                        <option value="follow_up_call">Follow-Up Call</option>
                        <option value="send_proposal">Send Proposal</option>
                        <option value="onboard_customer">Onboard Customer</option>
                        <option value="custom">Custom Task</option>
                    </select>

                    <select
                        value={leadKindFilter}
                        onChange={(e) => {
                            setLeadKindFilter(e.target.value as 'all' | 'full_audit' | 'leads');
                            setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                        title="Filter by lead type"
                    >
                        <option value="all">All Types ({industryScopedTasks.length})</option>
                        <option value="full_audit">Full Audits ({fullAuditCount})</option>
                        <option value="leads">Leads ({leadsOnlyCount})</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => { setDueTodayOnly((v) => !v); setCurrentPage(1); }}
                        className={cn(
                            'px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors shrink-0',
                            dueTodayOnly
                                ? 'bg-[#F59E0B] text-[#0F172A] border-[#F59E0B]'
                                : 'bg-[#F8FAFC] text-[#0F172A] border-[#E2E8F0] hover:bg-white'
                        )}
                    >
                        Due Today Only
                    </button>
                </div>
            </div>

            {}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                {loading && !tasks.length ? (
                    <div className="p-12 text-center text-[#64748B]">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                        <p className="text-sm font-semibold">Loading admin assigned tasks…</p>
                    </div>
                ) : !filteredTasks.length ? (
                    <div className="p-12 text-center text-[#64748B]">
                        <CheckSquare className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                        <p className="text-sm font-bold text-[#0F172A]">No tasks found</p>
                        <p className="text-xs mt-1">
                            {statusFilter === 'pending'
                                ? 'You have completed all admin assigned tasks! Great job.'
                                : 'No tasks match the active filters.'}
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-[#F1F5F9]">
                        {pagedTasks.map((task) => {
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
                                        {}
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

                                        {/* Status Badge & Actions */}
                                        <div className="shrink-0 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedHistoryTask(task)}
                                                className={cn(
                                                    "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md border cursor-pointer hover:shadow-xs hover:scale-105 transition-all group/badge",
                                                    task.status === 'completed' ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100" :
                                                    task.status === 'in_progress' ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100" :
                                                    task.status === 'cancelled' ? "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100" :
                                                    "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                                )}
                                                title="Click to view full lead status history timeline"
                                            >
                                                {task.status === 'completed' && <Check className="w-3 h-3 text-emerald-600" />}
                                                {task.status === 'in_progress' && <Clock className="w-3 h-3 text-amber-600" />}
                                                {task.status === 'cancelled' && <X className="w-3 h-3 text-rose-600" />}
                                                <span className="capitalize">{task.status.replace('_', ' ')}</span>
                                                <History className="w-2.5 h-2.5 opacity-50 group-hover/badge:opacity-100 shrink-0 ml-0.5" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={(e) => handleOpenToggleModal(task, e)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs"
                                                title="Update Status"
                                            >
                                                <span>Update Status</span>
                                            </button>
                                        </div>
                                    </div>

                                        {/* Lead details link */}
                                        <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                                            <Link
                                                to={`/sales/leads/${encodeURIComponent(task.leadId)}`}
                                                className="inline-flex items-center gap-1.5 font-bold text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg hover:underline group/lead"
                                            >
                                                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                                                <span>{task.leadBusinessName || 'Open Lead Profile'}</span>
                                                <ArrowUpRight className="w-3 h-3 text-amber-500 group-hover/lead:translate-x-0.5 group-hover/lead:-translate-y-0.5 transition-transform" />
                                            </Link>

                                            <span className="inline-flex items-center gap-1 text-[#64748B] font-medium bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-0.5 rounded-md text-[11px]">
                                                {normalizeTaskIndustry(task)}
                                            </span>

                                            {task.leadPhone && (
                                                <a
                                                    href={`tel:${task.leadPhone}`}
                                                    className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#0F172A] font-medium bg-[#F1F5F9] px-2 py-0.5 rounded-md text-[11px]"
                                                >
                                                    <Phone className="w-3 h-3" />
                                                    {task.leadPhone}
                                                </a>
                                            )}

                                            {task.leadReportUrl && (
                                                <a
                                                    href={task.leadReportUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md text-[11px]"
                                                >
                                                    Audit Report
                                                    <ArrowUpRight className="w-3 h-3" />
                                                </a>
                                            )}

                                            {task.leadAuditId ? (
                                                <>
                                                    {emailShareStatusLabel(task.emailShareStatus) ? (
                                                        <span
                                                            className={cn(
                                                                'inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border',
                                                                task.emailShareStatus === 'opened'
                                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                                            )}
                                                            title={
                                                                task.emailShareStatus === 'opened'
                                                                    ? `Opened${task.emailShareOpenedAt ? ` · ${new Date(task.emailShareOpenedAt).toLocaleString()}` : ''}`
                                                                    : `Sent${task.emailShareSentAt ? ` · ${new Date(task.emailShareSentAt).toLocaleString()}` : ''}`
                                                            }
                                                        >
                                                            {emailShareStatusLabel(task.emailShareStatus)}
                                                        </span>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        disabled={sharingAuditId === task.leadAuditId}
                                                        onClick={(e) => handleEmailAuditPdf(task, e)}
                                                        className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-950 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-[11px] disabled:opacity-50"
                                                        title={
                                                            task.leadEmail
                                                                ? `Email PDF to ${task.leadEmail}`
                                                                : 'Email PDF report to business'
                                                        }
                                                    >
                                                        <Mail
                                                            className={cn(
                                                                'w-3 h-3',
                                                                sharingAuditId === task.leadAuditId && 'animate-pulse'
                                                            )}
                                                        />
                                                        Email PDF
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>
                                    </li>
                                );
                            })}
                    </ul>
                )}

                {/* Pagination Footer */}
                {filteredTasks.length > TASKS_PER_PAGE && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-[#F1F5F9] bg-[#F8FAFC]">
                        <p className="text-xs text-[#64748B] font-medium">
                            Showing{' '}
                            <span className="font-bold text-[#0F172A]">
                                {(safePage - 1) * TASKS_PER_PAGE + 1}–{Math.min(safePage * TASKS_PER_PAGE, filteredTasks.length)}
                            </span>{' '}
                            of{' '}
                            <span className="font-bold text-[#0F172A]">{filteredTasks.length}</span> tasks
                        </p>

                        <div className="flex items-center gap-1.5">
                            {/* Previous */}
                            <button
                                type="button"
                                disabled={safePage <= 1}
                                onClick={() => goToPage(safePage - 1)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                ← Prev
                            </button>

                            {/* Page numbers */}
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                                        acc.push('...');
                                    }
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((item, idx) =>
                                    item === '...' ? (
                                        <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-[#94A3B8] font-bold">…</span>
                                    ) : (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => goToPage(item as number)}
                                            className={cn(
                                                'min-w-[30px] h-[30px] flex items-center justify-center text-xs font-bold rounded-xl border transition-all',
                                                safePage === item
                                                    ? 'bg-[#F59E0B] text-white border-[#F59E0B] shadow-sm'
                                                    : 'bg-white text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9]'
                                            )}
                                        >
                                            {item}
                                        </button>
                                    )
                                )
                            }

                            {/* Next */}
                            <button
                                type="button"
                                disabled={safePage >= totalPages}
                                onClick={() => goToPage(safePage + 1)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Task Update Modal */}
            {confirmModalTask && (
                <TaskCompletionModal
                    isOpen={!!confirmModalTask}
                    taskTitle={confirmModalTask.task.title}
                    leadName={confirmModalTask.task.leadBusinessName}
                    priority={confirmModalTask.task.priority}
                    currentStatus={confirmModalTask.task.status}
                    initialNotes={confirmModalTask.task.notes || ''}
                    isCompleting={confirmModalTask.isCompleting}
                    loading={modalLoading}
                    onConfirm={handleConfirmToggleStatus}
                    onClose={() => setConfirmModalTask(null)}
                />
            )}

            {/* Lead Status History Modal */}
            {selectedHistoryTask && (
                <LeadStatusHistoryModal
                    isOpen={Boolean(selectedHistoryTask)}
                    leadId={selectedHistoryTask.leadId}
                    leadName={selectedHistoryTask.leadBusinessName || selectedHistoryTask.title}
                    currentStatus={selectedHistoryTask.status || 'pending'}
                    initialNote={selectedHistoryTask.notes}
                    initialDate={selectedHistoryTask.updatedAt || selectedHistoryTask.createdAt}
                    authorName={(selectedHistoryTask as any).assignedToName || undefined}
                    readOnly={true}
                    onClose={() => setSelectedHistoryTask(null)}
                    onStatusUpdated={async () => {
                        await loadData();
                    }}
                />
            )}
        </div>
    );
}
