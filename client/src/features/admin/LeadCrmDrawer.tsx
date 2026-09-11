import { useState, useEffect, useCallback } from 'react';
import {
    X,
    CheckCircle2,
    Check,
    Calendar,
    User,
    Phone,
    Mail,
    Globe,
    ExternalLink,
    Clock,
    Plus,
    Trash2,
    MessageSquare,
    AlertCircle,
    Sparkles
} from 'lucide-react';
import {
    type LeadTask,
    type LeadActivity,
    type SalesAgent,
    type TaskType,
    type TaskPriority,
    fetchCrmTasks,
    createCrmTask,
    deleteCrmTask,
    fetchLeadActivities
} from './adminApi';
import { cn } from '../../shared/utils';

export type GrowthAuditLeadRef = {
    id: string;
    createdAt?: string;
    businessName: string | null;
    service?: string | null;
    serviceLabel?: string | null;
    address?: string | null;
    city?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    rating?: number | null;
    ratingTotal?: number | null;
    source?: string | null;
    scoreTotal?: number | null;
    leadScoreTotal?: number | null;
    sharePath?: string | null;
    reportUrl?: string | null;
};

const TASK_PRESETS: Array<{ type: TaskType; label: string; icon: string; defaultTitle: string; defaultPriority: TaskPriority }> = [
    { type: 'prepare_audit', label: 'Prepare Audit', icon: '📊', defaultTitle: 'Prepare SEO Growth Audit', defaultPriority: 'high' },
    { type: 'follow_up_call', label: 'Follow-Up Call', icon: '📞', defaultTitle: 'Call to review audit proposal', defaultPriority: 'medium' },
    { type: 'send_proposal', label: 'Send Proposal', icon: '📄', defaultTitle: 'Send SEO contract and proposal', defaultPriority: 'high' },
    { type: 'onboard_customer', label: 'Onboard Customer', icon: '🚀', defaultTitle: 'Onboard new customer', defaultPriority: 'urgent' },
    { type: 'custom', label: 'Custom Task', icon: '📌', defaultTitle: '', defaultPriority: 'medium' }
];

interface LeadCrmDrawerProps {
    lead: GrowthAuditLeadRef;
    salesAgents: SalesAgent[];
    onClose: () => void;
    onTaskUpdated?: () => void;
}

export default function LeadCrmDrawer({
    lead,
    salesAgents,
    onClose,
    onTaskUpdated
}: LeadCrmDrawerProps) {
    const [activeTab, setActiveTab] = useState<'tasks' | 'activities'>('tasks');
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Task Creation Form State
    const [taskType, setTaskType] = useState<TaskType>('prepare_audit');
    const [taskTitle, setTaskTitle] = useState('');
    const [taskNotes, setTaskNotes] = useState('');
    const [taskAssignee, setTaskAssignee] = useState<string>('');
    const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
    const [taskDueDate, setTaskDueDate] = useState<string>('');
    const [submittingTask, setSubmittingTask] = useState(false);

    // Action Toast
    const [successToast, setSuccessToast] = useState<string | null>(null);

    // Deleting task state
    const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

    const loadLeadData = useCallback(async () => {
        if (!lead?.id) return;
        setLoading(true);
        setError('');
        try {
            const [tasksData, activitiesData] = await Promise.all([
                fetchCrmTasks({ leadId: lead.id, createdBy: 'admin' }),
                fetchLeadActivities(lead.id)
            ]);
            setTasks(tasksData);
            setActivities(activitiesData);
        } catch (err: any) {
            setError(err.message || 'Failed to load CRM data');
        } finally {
            setLoading(false);
        }
    }, [lead?.id]);

    useEffect(() => {
        loadLeadData();
    }, [loadLeadData]);

    const handleSelectPreset = (preset: typeof TASK_PRESETS[0]) => {
        setTaskType(preset.type);
        if (preset.defaultTitle) {
            setTaskTitle(preset.defaultTitle);
        }
        setTaskPriority(preset.defaultPriority);
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskTitle.trim()) return;

        setSubmittingTask(true);
        setError('');
        try {
            await createCrmTask({
                lead_id: lead.id,
                title: taskTitle.trim(),
                task_type: taskType,
                priority: taskPriority,
                assigned_to_user_id: taskAssignee || undefined,
                due_date: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
                notes: taskNotes.trim() || undefined
            });

            // Reset form
            setTaskTitle('');
            setTaskNotes('');
            setTaskDueDate('');

            await loadLeadData();
            onTaskUpdated?.();
            setSuccessToast('Task assigned successfully!');
            setTimeout(() => setSuccessToast(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to create task');
        } finally {
            setSubmittingTask(false);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('Are you sure you want to delete this task?')) return;
        setDeletingTaskId(taskId);
        setError('');
        try {
            await deleteCrmTask(taskId);
            await loadLeadData();
            onTaskUpdated?.();
        } catch (err: any) {
            setError(err.message || 'Failed to delete task');
        } finally {
            setDeletingTaskId(null);
        }
    };

    if (!lead) return null;

    const bizName = lead.businessName || 'Lead Details';
    const cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
    const displayScore = lead.scoreTotal ?? lead.leadScoreTotal;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm flex justify-end transition-opacity">
            <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900 truncate">
                                {bizName}
                            </h2>
                            {displayScore != null && (
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-semibold",
                                    displayScore >= 70 ? "bg-emerald-100 text-emerald-800" :
                                    displayScore >= 40 ? "bg-amber-100 text-amber-800" :
                                    "bg-rose-100 text-rose-800"
                                )}>
                                    Score: {displayScore}/100
                                </span>
                            )}
                        </div>

                        {/* Quick Contact Bar */}
                        <div className="mt-2.5 flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                            {lead.phone && (
                                <a
                                    href={`tel:${cleanPhone}`}
                                    className="inline-flex items-center gap-1.5 font-medium text-amber-700 hover:text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/60"
                                >
                                    <Phone className="w-3.5 h-3.5" />
                                    {lead.phone}
                                </a>
                            )}
                            {lead.phone && (
                                <a
                                    href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    WhatsApp
                                </a>
                            )}
                            {lead.email && (
                                <a
                                    href={`mailto:${lead.email}`}
                                    className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                                >
                                    <Mail className="w-3.5 h-3.5" />
                                    {lead.email}
                                </a>
                            )}
                            {lead.website && (
                                <a
                                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                                >
                                    <Globe className="w-3.5 h-3.5" />
                                    Website
                                </a>
                            )}
                            {lead.reportUrl && (
                                <a
                                    href={lead.reportUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Audit Report
                                </a>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-white px-6 shrink-0">
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={cn(
                            "py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors",
                            activeTab === 'tasks'
                                ? "border-amber-500 text-amber-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Tasks & Assignment
                        {tasks.filter(t => t.status !== 'completed').length > 0 && (
                            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold">
                                {tasks.filter(t => t.status !== 'completed').length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('activities')}
                        className={cn(
                            "py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors",
                            activeTab === 'activities'
                                ? "border-amber-500 text-amber-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Clock className="w-4 h-4" />
                        Call Logs & History
                        {activities.length > 0 && (
                            <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold">
                                {activities.length}
                            </span>
                        )}
                    </button>
                </div>

                {successToast && (
                    <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2 font-medium">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{successToast}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSuccessToast(null)}
                            className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'tasks' ? (
                        <>
                            {/* Create Task Form */}
                            <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" />
                                        Assign / Create Task
                                    </h3>
                                </div>

                                {/* Preset Action Pills */}
                                <div className="flex flex-wrap gap-1.5">
                                    {TASK_PRESETS.map((preset) => (
                                        <button
                                            key={preset.type}
                                            type="button"
                                            onClick={() => handleSelectPreset(preset)}
                                            className={cn(
                                                "text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5",
                                                taskType === preset.type
                                                    ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                                                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                                            )}
                                        >
                                            <span>{preset.icon}</span>
                                            <span>{preset.label}</span>
                                        </button>
                                    ))}
                                </div>

                                <form onSubmit={handleCreateTask} className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                            Task Title
                                        </label>
                                        <input
                                            type="text"
                                            value={taskTitle}
                                            onChange={(e) => setTaskTitle(e.target.value)}
                                            placeholder="What needs to be done?"
                                            required
                                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 font-medium"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                            Notes & Context (Optional)
                                        </label>
                                        <textarea
                                            value={taskNotes}
                                            onChange={(e) => setTaskNotes(e.target.value)}
                                            rows={2}
                                            placeholder="Additional context or requirements..."
                                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 resize-none font-medium"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                                Assignee
                                            </label>
                                            <select
                                                value={taskAssignee}
                                                onChange={(e) => setTaskAssignee(e.target.value)}
                                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-amber-500 font-medium"
                                            >
                                                <option value="">Unassigned</option>
                                                {salesAgents.map((agent) => (
                                                    <option key={agent.id} value={agent.id}>
                                                        {agent.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                                Priority
                                            </label>
                                            <select
                                                value={taskPriority}
                                                onChange={(e) => setTaskPriority(e.target.value as any)}
                                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-amber-500 font-medium"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="urgent">Urgent</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                                Due Date
                                            </label>
                                            <input
                                                type="date"
                                                value={taskDueDate}
                                                onChange={(e) => setTaskDueDate(e.target.value)}
                                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-amber-500 font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={submittingTask || !taskTitle.trim()}
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {submittingTask ? 'Assigning...' : 'Assign Task'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Task List */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Lead Tasks ({tasks.length})
                                </h3>

                                {loading ? (
                                    <div className="py-8 text-center text-xs text-slate-400">Loading tasks...</div>
                                ) : tasks.length === 0 ? (
                                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                                        <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-sm font-medium text-slate-600">No tasks assigned yet</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Use the buttons above to assign "Prepare Audit" or "Onboard Customer".</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {tasks.map((task) => {
                                            const isDone = task.status === 'completed';
                                            const isOverdue = task.dueDate && !isDone && new Date(task.dueDate) < new Date();

                                            return (
                                                <div
                                                    key={task.id}
                                                    className={cn(
                                                        "p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3",
                                                        isDone
                                                            ? "bg-emerald-50/60 border-emerald-300 shadow-xs"
                                                            : "bg-white border-slate-200 shadow-sm hover:border-slate-300"
                                                    )}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={cn(
                                                                "text-sm font-semibold",
                                                                isDone ? "text-emerald-950 font-bold" : "text-slate-900"
                                                            )}>
                                                                {task.title}
                                                            </span>

                                                            {/* Priority Badge */}
                                                            <span className={cn(
                                                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md",
                                                                task.priority === 'urgent' ? "bg-rose-100 text-rose-800" :
                                                                task.priority === 'high' ? "bg-amber-100 text-amber-800" :
                                                                task.priority === 'medium' ? "bg-blue-100 text-blue-800" :
                                                                "bg-slate-100 text-slate-700"
                                                            )}>
                                                                {task.priority}
                                                            </span>
                                                        </div>

                                                        {task.notes && (
                                                            <p className={cn("mt-1 text-xs line-clamp-2", isDone ? "text-emerald-800/70" : "text-slate-600")}>
                                                                {task.notes}
                                                            </p>
                                                        )}

                                                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                                            {task.assignedToName ? (
                                                                <span className={cn(
                                                                    "flex items-center gap-1 font-medium px-2 py-0.5 rounded",
                                                                    isDone ? "text-emerald-800 bg-emerald-100/60" : "text-slate-700 bg-slate-100"
                                                                )}>
                                                                    <User className="w-3 h-3 text-slate-400" />
                                                                    {task.assignedToName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 italic">Unassigned</span>
                                                            )}

                                                            {task.dueDate && (
                                                                <span className={cn(
                                                                    "flex items-center gap-1 font-medium",
                                                                    isOverdue ? "text-rose-600 font-bold" : isDone ? "text-emerald-700" : "text-slate-600"
                                                                )}>
                                                                    <Calendar className="w-3 h-3" />
                                                                    {isOverdue ? 'Overdue: ' : 'Due: '}
                                                                    {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border",
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
                                                            disabled={deletingTaskId === task.id}
                                                            onClick={() => handleDeleteTask(task.id)}
                                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                                                            title="Delete Task"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                                    Activity & Call History
                                </h3>
                                <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                    {activities.length} {activities.length === 1 ? 'Event' : 'Events'}
                                </span>
                            </div>

                            {loading ? (
                                <div className="py-12 text-center text-xs text-slate-400">Loading activity history…</div>
                            ) : activities.length === 0 ? (
                                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-400 space-y-1">
                                    <Clock className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                                    <p className="font-semibold text-slate-600">No call logs or activity recorded yet.</p>
                                    <p className="text-[11px] text-slate-400">Calls logged by assigned telecallers will appear here in real-time.</p>
                                </div>
                            ) : (
                                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                    {activities.map((act) => {
                                        const isCall = act.activityType === 'call_log';
                                        const isTask = act.activityType === 'task_event';
                                        const isDeleted = isTask && act.note.toLowerCase().includes('deleted');

                                        return (
                                            <div key={act.id} className="relative group">
                                                <div className={cn(
                                                    "absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-xs",
                                                    isCall ? "bg-amber-500" : isDeleted ? "bg-rose-500" : isTask ? "bg-indigo-500" : "bg-slate-400"
                                                )} />
                                                <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:border-slate-300 transition-colors">
                                                    <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                                                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                                            {isTask && (
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                                                                    isDeleted
                                                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                                                        : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                                )}>
                                                                    {isDeleted ? 'Task Deleted' : 'Admin Task'}
                                                                </span>
                                                            )}
                                                            {act.disposition && (
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                    act.disposition === 'converted' ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                                                    act.disposition === 'callback_requested' ? "bg-amber-100 text-amber-800 border border-amber-200" :
                                                                    act.disposition === 'not_interested' ? "bg-rose-100 text-rose-800 border border-rose-200" :
                                                                    "bg-slate-100 text-slate-700 border border-slate-200"
                                                                )}>
                                                                    {act.disposition.replace('_', ' ')}
                                                                </span>
                                                            )}
                                                            <span className="font-bold text-slate-900">{act.authorName || 'Sales Agent'}</span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            {new Date(act.createdAt).toLocaleString(undefined, {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    {act.note && (
                                                        <p className="mt-2 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                            {act.note}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
