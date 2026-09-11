import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    Bell,
    Check,
    Phone,
    RefreshCw,
    Search,
    Calendar,
    AlertCircle,
    ArrowUpRight,
    Plus,
    Trash2,
    Sparkles,
    Building2,
    X,
    User,
    Clock
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../../shared/TaskCompletionModal';
import {
    type SalesLeadTask,
    type SalesTaskPriority,
    type SalesTaskStatus,
    type SalesTaskType,
    fetchSalesTasks,
    createSalesTask,
    updateSalesTask,
    deleteSalesTask
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
    custom: { label: 'Custom Reminder', icon: '📌', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' }
};

const PRIORITY_BADGES: Record<SalesTaskPriority, { label: string; bg: string; text: string; dot: string }> = {
    urgent: { label: 'Urgent', bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
    high: { label: 'High', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
    medium: { label: 'Medium', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    low: { label: 'Low', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' }
};

export default function SalesReminders() {
    const [searchParams] = useSearchParams();
    const initialLeadId = searchParams.get('leadId') || '';

    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [leads, setLeads] = useState<SalesLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successToast, setSuccessToast] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [dueTodayOnly, setDueTodayOnly] = useState(false);

    // Creation Form State
    const [formOpen, setFormOpen] = useState(true);
    const [taskType, setTaskType] = useState<SalesTaskType>('follow_up_call');
    const [title, setTitle] = useState('');
    const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId);
    const [priority, setPriority] = useState<SalesTaskPriority>('medium');
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Modal & Action states
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: SalesLeadTask; isCompleting: boolean } | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [taskList, leadsRes] = await Promise.all([
                fetchSalesTasks({
                    status: statusFilter !== 'all' ? statusFilter : undefined,
                    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
                    taskType: typeFilter !== 'all' ? typeFilter : undefined,
                    createdBy: 'self',
                    dueToday: dueTodayOnly
                }),
                apiGet('/api/sales/leads').catch(() => ({ leads: [] }))
            ]);

            setTasks(taskList);
            setLeads(leadsRes.leads || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load self reminders');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, priorityFilter, typeFilter, dueTodayOnly]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handle create new self reminder
    const handleCreateReminder = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        // If no lead is selected, default to the first lead if available, or allow custom
        const targetLeadId = selectedLeadId || (leads[0]?.id || '');
        if (!targetLeadId) {
            setError('Please select or assign a lead for this reminder.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            await createSalesTask({
                lead_id: targetLeadId,
                task_type: taskType,
                title: title.trim(),
                notes: notes.trim(),
                priority,
                due_date: dueDate ? new Date(dueDate).toISOString() : null
            });

            setTitle('');
            setNotes('');
            setDueDate('');
            setSuccessToast('Self reminder created successfully! 🔔');
            setTimeout(() => setSuccessToast(null), 3500);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to create reminder');
        } finally {
            setSubmitting(false);
        }
    };

    // Modal Toggle Complete/Reopen
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
                    ? 'Reminder marked as completed! 🎉'
                    : nextStatus === 'in_progress'
                    ? 'Reminder marked as in progress ⏳'
                    : nextStatus === 'cancelled'
                    ? 'Reminder marked as cancelled ❌'
                    : 'Reminder reopened as pending'
            );
            setTimeout(() => setSuccessToast(null), 3500);
            setConfirmModalTask(null);
        } catch (err: any) {
            setError(err.message || 'Could not update reminder');
        } finally {
            setModalLoading(false);
        }
    };

    // Delete Self Reminder
    const handleDeleteReminder = async (taskId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this reminder?')) return;

        setDeletingId(taskId);
        setError('');
        try {
            await deleteSalesTask(taskId);
            setSuccessToast('Reminder deleted.');
            setTimeout(() => setSuccessToast(null), 3000);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to delete reminder');
        } finally {
            setDeletingId(null);
        }
    };

    // Format Due Date helper
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

    // Filter tasks by search query
    const filteredTasks = tasks.filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            (t.notes && t.notes.toLowerCase().includes(q)) ||
            (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
            (t.leadPhone && t.leadPhone.includes(q))
        );
    });

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-16">
            {/* Header & Stats Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white p-6 rounded-3xl shadow-sm">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center text-[#F59E0B]">
                            <Bell className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white">Self Reminders & Follow-Ups</h1>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Your personal follow-up tasks, custom reminders, and scheduled calls.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setFormOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] font-black text-xs transition-all shadow-sm"
                    >
                        {formOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {formOpen ? 'Hide Form' : 'New Reminder'}
                    </button>

                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadData()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                        Refresh
                    </button>
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

            {/* Create Reminder Form Card */}
            {formOpen && (
                <form
                    onSubmit={handleCreateReminder}
                    className="bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm space-y-5 transition-all"
                >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <Plus className="w-4 h-4 text-[#F59E0B]" />
                            <h2 className="text-sm font-black text-[#0F172A]">Create New Self Reminder</h2>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            👤 Visible in Your Work Queue
                        </span>
                    </div>

                    {/* Task Type Presets */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-2">
                            Reminder Type
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {(Object.keys(TASK_TYPE_CONFIG) as SalesTaskType[]).map((t) => {
                                const conf = TASK_TYPE_CONFIG[t];
                                const isSel = taskType === t;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTaskType(t)}
                                        className={cn(
                                            'p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center gap-2',
                                            isSel
                                                ? `${conf.bg} ${conf.text} ring-2 ring-[#0F172A]`
                                                : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                                        )}
                                    >
                                        <span>{conf.icon}</span>
                                        <span className="truncate">{conf.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Title & Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Reminder Title *
                            </label>
                            <input
                                required
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Call back regarding pricing proposal…"
                                className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Attach to Lead (Optional)
                            </label>
                            <select
                                value={selectedLeadId}
                                onChange={(e) => setSelectedLeadId(e.target.value)}
                                className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                            >
                                <option value="">Select a lead (optional)…</option>
                                {leads.map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {l.name} {l.phone ? `(${l.phone})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Priority
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as SalesTaskPriority)}
                                className="w-full text-xs px-3.5 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Due Date & Time
                            </label>
                            <input
                                type="datetime-local"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full text-xs px-3.5 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Additional Notes & Context (Optional)
                        </label>
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any context, objections, or reminders for yourself…"
                            className="w-full text-xs p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={submitting || !title.trim()}
                            className="px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            {submitting ? 'Creating…' : 'Save Self Reminder'}
                        </button>
                    </div>
                </form>
            )}

            {/* Reminders List & Filters */}
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
                                placeholder="Search reminder title, lead, phone…"
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                        >
                            <option value="all">All Reminders ({tasks.length})</option>
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
                            <option value="all">All Types</option>
                            <option value="follow_up_call">Follow-Up Call</option>
                            <option value="prepare_audit">Prepare Audit</option>
                            <option value="send_proposal">Send Proposal</option>
                            <option value="onboard_customer">Onboard Customer</option>
                            <option value="custom">Custom Reminder</option>
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

                {/* Reminders List */}
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                    {loading && !tasks.length ? (
                        <div className="p-12 text-center text-[#64748B]">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                            <p className="text-sm font-semibold">Loading your self reminders…</p>
                        </div>
                    ) : !filteredTasks.length ? (
                        <div className="p-12 text-center text-[#64748B]">
                            <Sparkles className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                            <p className="text-sm font-bold text-[#0F172A]">No self reminders found</p>
                            <p className="text-xs mt-1">
                                {statusFilter === 'pending'
                                    ? 'You have no pending reminders! Use the form above to schedule your next follow-up.'
                                    : 'No reminders match the active filters.'}
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
                                            {/* Main Reminder Info */}
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

                                                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                                        <User className="w-3 h-3 text-slate-500" />
                                                        Self Created
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

                                                <h3 className={cn(
                                                    'text-sm font-bold',
                                                    isDone ? 'text-emerald-950 font-bold' : 'text-[#0F172A]'
                                                )}>
                                                    {task.title}
                                                </h3>

                                                {task.notes && (
                                                    <p className={cn(
                                                        'text-xs mt-1',
                                                        isDone ? 'text-emerald-800/80' : 'text-[#64748B]'
                                                    )}>
                                                        {task.notes}
                                                    </p>
                                                )}

                                                {/* Associated Lead Link */}
                                                {task.leadId && (
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
                                                )}
                                            </div>

                                            {/* Action Buttons: Status Badge + Update Status + Delete */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border",
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
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs"
                                                    title="Update Status"
                                                >
                                                    <span>Update Status</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={deletingId === task.id}
                                                    onClick={(e) => handleDeleteReminder(task.id, e)}
                                                    className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg transition-colors"
                                                    title="Delete Reminder"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
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
