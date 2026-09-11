import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Phone,
    Mail,
    Globe,
    Clock,
    CheckCircle2,
    Check,
    Calendar,
    MessageSquare,
    AlertCircle,
    CheckSquare,
    MapPin,
    ArrowUpRight,
    Shield,
    User,
    Bell,
    X
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../../shared/TaskCompletionModal';
import {
    type SalesUnifiedLead,
    type SalesLeadTask,
    type SalesLeadActivity,
    type SalesTaskStatus,
    fetchSalesLeadCrm,
    updateSalesTask
} from './salesApi';
import { cn } from '../../shared/utils';

export default function SalesLeadDetail() {
    const { id } = useParams<{ id: string }>();
    const [lead, setLead] = useState<SalesUnifiedLead | null>(null);
    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [activities, setActivities] = useState<SalesLeadActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');

    const loadLead = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const data = await fetchSalesLeadCrm(id);
            setLead(data.lead);
            setTasks(data.tasks || []);
            setActivities(data.activities || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load lead CRM data');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLead();
    }, [loadLead]);

    // Confirmation Modal State
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: SalesLeadTask } | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    const handleOpenToggleModal = (task: SalesLeadTask) => {
        setConfirmModalTask({ task });
    };

    const handleConfirmToggleStatus = async (chosenStatus?: CrmTaskStatus) => {
        if (!confirmModalTask) return;
        const { task } = confirmModalTask;
        setModalLoading(true);
        setError('');
        try {
            const nextStatus: SalesTaskStatus = (chosenStatus as SalesTaskStatus) || (task.status === 'completed' ? 'pending' : 'completed');
            await updateSalesTask(task.id, { status: nextStatus });
            const statusLabels: Record<string, string> = {
                completed: 'Task marked as completed! 🎉',
                in_progress: 'Task set to In Progress 🟡',
                pending: 'Task moved to Pending 📋',
                cancelled: 'Task marked as Cancelled ❌'
            };
            setMsg(statusLabels[nextStatus] || 'Task status updated.');
            await loadLead();
            setConfirmModalTask(null);
        } catch (err: any) {
            setError(err.message || 'Failed to update task');
        } finally {
            setModalLoading(false);
        }
    };

    if (loading && !lead) {
        return (
            <div className="p-12 text-center text-[#64748B]">
                <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                <p className="text-sm font-semibold">Loading Lead CRM Details…</p>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="space-y-4 max-w-4xl mx-auto">
                <Link to="/sales" className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B] hover:text-[#0F172A]">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
                </Link>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-700">
                    {error || 'Lead not found or no permission.'}
                </div>
            </div>
        );
    }

    const bizName = lead.businessName || 'Lead';

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Top Back Nav */}
            <div className="flex items-center justify-between">
                <Link
                    to="/sales"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-bold text-[#475569] rounded-xl transition-colors shadow-2xs"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Dashboard
                </Link>

                {lead.reportUrl && (
                    <a
                        href={lead.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-colors shadow-2xs"
                    >
                        <span>View Live SEO Audit</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                )}
            </div>

            {/* Notification Messages */}
            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{error}</span>
                </div>
            )}
            {msg && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{msg}</span>
                </div>
            )}

            {/* Lead Context Header Card */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <h1 className="text-2xl font-black text-[#0F172A] tracking-tight">{bizName}</h1>
                            {lead.scoreTotal != null && (
                                <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                                    Score: {lead.scoreTotal}/100
                                </span>
                            )}
                            {lead.source && (
                                <span className="bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                                    {lead.source}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-[#64748B]">CRM Lead Profile & Activity History</p>
                    </div>

                    {/* Quick Action Dialing & Log Call Box */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {lead.phone && (
                            <a
                                href={`tel:${lead.phone}`}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] hover:text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm"
                            >
                                <Phone className="w-3.5 h-3.5" />
                                Call {lead.phone}
                            </a>
                        )}
                        <Link
                            to={`/sales/calls?leadId=${encodeURIComponent(id || '')}`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm"
                        >
                            <Phone className="w-3.5 h-3.5 text-[#F59E0B]" />
                            Log Call & Activity
                        </Link>
                    </div>
                </div>

                {/* Contact Attributes Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-[#F1F5F9]">
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Phone</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.phone || 'No phone provided'}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Email</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.email || 'No email provided'}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <Globe className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Website</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.website ? (
                                    <a
                                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 hover:underline"
                                    >
                                        {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                    </a>
                                ) : (
                                    'None'
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <MapPin className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Location</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.city || lead.address || 'Not specified'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Two-Column CRM Workspace: Left = Tasks for this Lead, Right = Unified CRM Activity Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Tasks */}
                <div className="lg:col-span-6 space-y-6">
                    {/* Tasks Section */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-[#F59E0B]" />
                                <h2 className="text-base font-black text-[#0F172A]">Tasks for this Lead</h2>
                                <span className="bg-[#F1F5F9] text-[#475569] text-xs font-bold px-2 py-0.5 rounded-full">
                                    {tasks.length}
                                </span>
                            </div>
                            <Link
                                to={`/sales/reminders?leadId=${encodeURIComponent(id || '')}`}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F172A] hover:text-[#D97706] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-xl transition-colors hover:bg-white shadow-2xs"
                            >
                                <Bell className="w-3.5 h-3.5 text-[#F59E0B]" />
                                <span>+ Add Reminder</span>
                            </Link>
                        </div>

                        {/* Task List */}
                        {!tasks.length ? (
                            <p className="text-xs text-[#94A3B8] text-center py-4">No tasks assigned for this lead yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {tasks.map((t) => {
                                    const isDone = t.status === 'completed';
                                    return (
                                        <li
                                            key={t.id}
                                            className={cn(
                                                'p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors',
                                                isDone ? 'bg-emerald-50/50 border-emerald-300 shadow-xs' : 'bg-white border-[#E2E8F0]'
                                            )}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className={cn('text-xs font-bold', isDone ? 'text-emerald-950 font-bold' : 'text-[#0F172A]')}>
                                                        {t.title}
                                                    </p>
                                                    {t.createdByRole === 'admin' ? (
                                                        <span className="inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                                                            <Shield className="w-2.5 h-2.5 text-purple-600" />
                                                            Admin Assigned
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-100 text-slate-700 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                                                            <User className="w-2.5 h-2.5 text-slate-500" />
                                                            Self Created
                                                        </span>
                                                    )}
                                                </div>
                                                {t.dueDate && (
                                                    <p className={cn("text-[10px] mt-1 flex items-center gap-1", isDone ? "text-emerald-700" : "text-[#94A3B8]")}>
                                                        <Calendar className="w-3 h-3" />
                                                        Due: {new Date(t.dueDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Status Badge + Update Status Button */}
                                            <div className="shrink-0 flex items-center gap-2">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border",
                                                    t.status === 'completed' ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                                                    t.status === 'in_progress' ? "bg-amber-50 text-amber-900 border-amber-300" :
                                                    t.status === 'cancelled' ? "bg-rose-50 text-rose-800 border-rose-200" :
                                                    "bg-slate-50 text-slate-700 border-slate-200"
                                                )}>
                                                    {t.status === 'completed' && <Check className="w-3 h-3 text-emerald-600" />}
                                                    {t.status === 'in_progress' && <Clock className="w-3 h-3 text-amber-600" />}
                                                    {t.status === 'cancelled' && <X className="w-3 h-3 text-rose-600" />}
                                                    <span className="capitalize">{t.status.replace('_', ' ')}</span>
                                                </span>

                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenToggleModal(t)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs"
                                                    title="Update Status"
                                                >
                                                    <span>Update Status</span>
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Right Column: Unified CRM Activity Timeline */}
                <div className="lg:col-span-6 space-y-6">
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#F1F5F9]">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-[#F59E0B]" />
                                <h2 className="text-base font-black text-[#0F172A]">Activity Timeline</h2>
                            </div>
                            <Link
                                to={`/sales/calls?leadId=${encodeURIComponent(id || '')}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                            >
                                <Phone className="w-3 h-3 text-[#F59E0B]" />
                                <span>Log Call</span>
                            </Link>
                        </div>

                        {!activities.length ? (
                            <div className="text-center py-8 text-[#94A3B8]">
                                <Clock className="w-6 h-6 mx-auto mb-1 text-[#CBD5E1]" />
                                <p className="text-xs font-semibold">No activity logs recorded yet.</p>
                            </div>
                        ) : (
                            <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
                                {activities.map((act) => {
                                    const isCall = act.activityType === 'call_log';
                                    const isTask = act.activityType === 'task_event';
                                    const isDeleted = isTask && act.note?.toLowerCase().includes('deleted');

                                    return (
                                        <div key={act.id} className="relative pl-4">
                                            {/* Dot */}
                                            <span
                                                className={cn(
                                                    'absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white',
                                                    isCall ? 'bg-[#F59E0B]' : isDeleted ? 'bg-rose-500' : isTask ? 'bg-indigo-500' : 'bg-slate-400'
                                                )}
                                            />
                                            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-xs space-y-1">
                                                <div className="flex items-center justify-between gap-1 flex-wrap">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {isTask && (
                                                            <span className={cn(
                                                                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[10px] uppercase border",
                                                                isDeleted
                                                                    ? "bg-rose-100 text-rose-800 border-rose-200"
                                                                    : "bg-purple-100 text-purple-800 border-purple-200"
                                                            )}>
                                                                <Shield className={cn("w-2.5 h-2.5", isDeleted ? "text-rose-600" : "text-purple-600")} />
                                                                {isDeleted ? 'Task Deleted' : 'Admin Task'}
                                                            </span>
                                                        )}
                                                        {act.disposition && (
                                                            <span className={cn(
                                                                "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                act.disposition === 'converted' ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                                                act.disposition === 'callback_requested' ? "bg-amber-100 text-amber-800 border border-amber-200" :
                                                                act.disposition === 'not_interested' ? "bg-rose-100 text-rose-800 border border-rose-200" :
                                                                "bg-amber-100 text-amber-900 border border-amber-200"
                                                            )}>
                                                                {act.disposition.replace('_', ' ')}
                                                            </span>
                                                        )}
                                                        <span className="font-extrabold text-[#0F172A]">
                                                            {act.authorName || act.userName || (isTask ? 'Admin' : 'Sales')}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-[#94A3B8]">
                                                        {new Date(act.createdAt).toLocaleString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                </div>

                                                <p className="text-[#475569] leading-relaxed whitespace-pre-wrap pt-0.5">
                                                    {act.note}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Task Completion Modal */}
            <TaskCompletionModal
                isOpen={!!confirmModalTask}
                onClose={() => setConfirmModalTask(null)}
                onConfirm={handleConfirmToggleStatus}
                taskTitle={confirmModalTask?.task.title || ''}
                leadName={lead?.businessName}
                priority={confirmModalTask?.task.priority}
                currentStatus={confirmModalTask?.task.status}
                isCompleting={confirmModalTask ? confirmModalTask.task.status !== 'completed' : true}
                loading={modalLoading}
            />
        </div>
    );
}
