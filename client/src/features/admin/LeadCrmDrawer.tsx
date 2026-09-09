import { useState, useEffect, useCallback } from 'react';
import {
    X,
    CheckCircle2,
    Circle,
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
    Sparkles,
    Send
} from 'lucide-react';
import {
    type LeadTask,
    type LeadActivity,
    type SalesAgent,
    type TaskType,
    type TaskPriority,
    type TaskStatus,
    fetchCrmTasks,
    createCrmTask,
    updateCrmTask,
    deleteCrmTask,
    fetchLeadActivities,
    createLeadActivity
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
    scoreTotal?: number | null;
    sharePath?: string | null;
    reportUrl?: string | null;
};

interface LeadCrmDrawerProps {
    lead: GrowthAuditLeadRef | null;
    onClose: () => void;
    salesAgents: SalesAgent[];
    onTaskUpdated?: () => void;
}

const TASK_PRESETS: { type: TaskType; label: string; icon: string; defaultTitle: (biz: string) => string }[] = [
    {
        type: 'prepare_audit',
        label: 'Prepare Audit',
        icon: '📊',
        defaultTitle: (b) => `Prepare custom SEO audit report for ${b}`
    },
    {
        type: 'onboard_customer',
        label: 'Onboard Customer',
        icon: '🚀',
        defaultTitle: (b) => `Onboard ${b} & configure account`
    },
    {
        type: 'follow_up_call',
        label: 'Follow-Up Call',
        icon: '📞',
        defaultTitle: (b) => `Follow-up call with ${b}`
    },
    {
        type: 'send_proposal',
        label: 'Send Proposal',
        icon: '📄',
        defaultTitle: (b) => `Send quote & plan proposal to ${b}`
    }
];

export default function LeadCrmDrawer({ lead, onClose, salesAgents, onTaskUpdated }: LeadCrmDrawerProps) {
    const [activeTab, setActiveTab] = useState<'tasks' | 'logs'>('tasks');
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Task Creation Form State
    const [taskType, setTaskType] = useState<TaskType>('prepare_audit');
    const [taskTitle, setTaskTitle] = useState('');
    const [taskNotes, setTaskNotes] = useState('');
    const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
    const [taskAssignee, setTaskAssignee] = useState<string>('');
    const [taskDueDate, setTaskDueDate] = useState<string>('');
    const [submittingTask, setSubmittingTask] = useState(false);

    // Activity / Call Log Form State
    const [logDisposition, setLogDisposition] = useState<'connected' | 'callback_requested' | 'voicemail' | 'not_interested' | 'converted' | 'other'>('connected');
    const [logNote, setLogNote] = useState('');
    const [submittingLog, setSubmittingLog] = useState(false);

    const bizName = lead?.businessName || 'Lead';

    const loadLeadData = useCallback(async () => {
        if (!lead?.id) return;
        setLoading(true);
        setError('');
        try {
            const [taskList, actList] = await Promise.all([
                fetchCrmTasks({ leadId: lead.id }),
                fetchLeadActivities(lead.id)
            ]);
            setTasks(taskList);
            setActivities(actList);
        } catch (err: any) {
            setError(err.message || 'Failed to load lead details');
        } finally {
            setLoading(false);
        }
    }, [lead?.id]);

    useEffect(() => {
        if (lead) {
            loadLeadData();
            // Default first preset
            setTaskType('prepare_audit');
            setTaskTitle(`Prepare custom SEO audit report for ${lead.businessName || 'Lead'}`);
            setTaskNotes('');
            setTaskPriority('medium');
            setTaskAssignee(salesAgents[0]?.id || '');
            setTaskDueDate('');
            setLogNote('');
        }
    }, [lead, loadLeadData, salesAgents]);

    const handleSelectPreset = (preset: typeof TASK_PRESETS[0]) => {
        setTaskType(preset.type);
        setTaskTitle(preset.defaultTitle(bizName));
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lead?.id || !taskTitle.trim()) return;
        setSubmittingTask(true);
        setError('');
        try {
            await createCrmTask({
                lead_id: lead.id,
                task_type: taskType,
                title: taskTitle.trim(),
                notes: taskNotes.trim(),
                priority: taskPriority,
                assigned_to_user_id: taskAssignee || null,
                due_date: taskDueDate ? new Date(taskDueDate).toISOString() : null
            });
            await loadLeadData();
            onTaskUpdated?.();
            // Reset form
            setTaskTitle(`Follow-up call with ${bizName}`);
            setTaskType('follow_up_call');
            setTaskNotes('');
            setTaskDueDate('');
        } catch (err: any) {
            setError(err.message || 'Failed to create task');
        } finally {
            setSubmittingTask(false);
        }
    };

    const handleToggleTaskStatus = async (task: LeadTask) => {
        const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
        try {
            await updateCrmTask(task.id, { status: newStatus });
            await loadLeadData();
            onTaskUpdated?.();
        } catch (err: any) {
            setError(err.message || 'Failed to update task');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('Are you sure you want to delete this task?')) return;
        try {
            await deleteCrmTask(taskId);
            await loadLeadData();
            onTaskUpdated?.();
        } catch (err: any) {
            setError(err.message || 'Failed to delete task');
        }
    };

    const handleCreateLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lead?.id || !logNote.trim()) return;
        setSubmittingLog(true);
        setError('');
        try {
            await createLeadActivity(lead.id, {
                activity_type: 'call_log',
                disposition: logDisposition,
                note: logNote.trim(),
                author_name: 'Admin'
            });
            await loadLeadData();
            setLogNote('');
        } catch (err: any) {
            setError(err.message || 'Failed to save call log');
        } finally {
            setSubmittingLog(false);
        }
    };

    if (!lead) return null;

    const cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');

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
                            {lead.scoreTotal != null && (
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-semibold",
                                    lead.scoreTotal >= 70 ? "bg-emerald-100 text-emerald-800" :
                                    lead.scoreTotal >= 40 ? "bg-amber-100 text-amber-800" :
                                    "bg-rose-100 text-rose-800"
                                )}>
                                    Score: {lead.scoreTotal}/100
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
                        onClick={() => setActiveTab('logs')}
                        className={cn(
                            "py-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors",
                            activeTab === 'logs'
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
                                        <input
                                            type="text"
                                            value={taskTitle}
                                            onChange={(e) => setTaskTitle(e.target.value)}
                                            placeholder="Task title (e.g. Prepare audit report, Onboard customer...)"
                                            required
                                            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        {/* Assignee */}
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                                Assign To (Sales Agent)
                                            </label>
                                            <select
                                                value={taskAssignee}
                                                onChange={(e) => setTaskAssignee(e.target.value)}
                                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                                            >
                                                <option value="">Unassigned</option>
                                                {salesAgents.map((agent) => (
                                                    <option key={agent.id} value={agent.id}>
                                                        {agent.name || agent.email}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Priority */}
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                                Priority
                                            </label>
                                            <select
                                                value={taskPriority}
                                                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="urgent">Urgent</option>
                                            </select>
                                        </div>

                                        {/* Due Date */}
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                                Due Date
                                            </label>
                                            <input
                                                type="date"
                                                value={taskDueDate}
                                                onChange={(e) => setTaskDueDate(e.target.value)}
                                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <textarea
                                            value={taskNotes}
                                            onChange={(e) => setTaskNotes(e.target.value)}
                                            rows={2}
                                            placeholder="Add instructions, checklist or call notes (optional)..."
                                            className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                        />
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
                                                        "p-3.5 rounded-xl border transition-all flex items-start gap-3",
                                                        isDone
                                                            ? "bg-slate-50 border-slate-200 opacity-60"
                                                            : "bg-white border-slate-200 shadow-sm hover:border-slate-300"
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleTaskStatus(task)}
                                                        className="mt-0.5 text-slate-400 hover:text-amber-500 transition-colors"
                                                    >
                                                        {isDone ? (
                                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                        ) : (
                                                            <Circle className="w-5 h-5 text-slate-300 hover:text-amber-500" />
                                                        )}
                                                    </button>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={cn(
                                                                "text-sm font-semibold",
                                                                isDone ? "line-through text-slate-500" : "text-slate-900"
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
                                                            <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                                                                {task.notes}
                                                            </p>
                                                        )}

                                                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                                            {task.assignedToName ? (
                                                                <span className="flex items-center gap-1 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                                                    <User className="w-3 h-3 text-slate-400" />
                                                                    {task.assignedToName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 italic">Unassigned</span>
                                                            )}

                                                            {task.dueDate && (
                                                                <span className={cn(
                                                                    "flex items-center gap-1 font-medium",
                                                                    isOverdue ? "text-rose-600 font-bold" : "text-slate-600"
                                                                )}>
                                                                    <Calendar className="w-3 h-3" />
                                                                    {isOverdue ? 'Overdue: ' : 'Due: '}
                                                                    {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteTask(task.id)}
                                                        className="text-slate-300 hover:text-rose-500 p-1 rounded-lg transition-colors"
                                                        title="Delete Task"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Log Call / Outcome Form */}
                            <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5" />
                                    Log Call Outcome / Note
                                </h3>

                                <form onSubmit={handleCreateLog} className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                            Call Outcome / Disposition
                                        </label>
                                        <select
                                            value={logDisposition}
                                            onChange={(e) => setLogDisposition(e.target.value as any)}
                                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-amber-500 font-medium"
                                        >
                                            <option value="connected">Connected (Spoke with Decision Maker)</option>
                                            <option value="callback_requested">Callback Requested</option>
                                            <option value="voicemail">Left Voicemail / Not Answered</option>
                                            <option value="converted">Converted / Agreed to Onboard 🎉</option>
                                            <option value="not_interested">Not Interested</option>
                                            <option value="other">General Note / Other</option>
                                        </select>
                                    </div>

                                    <div>
                                        <textarea
                                            value={logNote}
                                            onChange={(e) => setLogNote(e.target.value)}
                                            rows={3}
                                            placeholder="What did the client say? What are the next steps?..."
                                            required
                                            className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                        />
                                    </div>

                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={submittingLog || !logNote.trim()}
                                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                            {submittingLog ? 'Saving...' : 'Save Call Log'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Activity Timeline */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Activity History ({activities.length})
                                </h3>

                                {loading ? (
                                    <div className="py-8 text-center text-xs text-slate-400">Loading activity...</div>
                                ) : activities.length === 0 ? (
                                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
                                        No call logs or activity recorded yet.
                                    </div>
                                ) : (
                                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                        {activities.map((act) => (
                                            <div key={act.id} className="relative">
                                                <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-white bg-amber-500 shadow-sm" />
                                                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                                                    <div className="flex items-center justify-between gap-2 text-xs">
                                                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                                            {act.disposition && (
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                    act.disposition === 'converted' ? "bg-emerald-100 text-emerald-800" :
                                                                    act.disposition === 'callback_requested' ? "bg-amber-100 text-amber-800" :
                                                                    act.disposition === 'not_interested' ? "bg-rose-100 text-rose-800" :
                                                                    "bg-slate-100 text-slate-700"
                                                                )}>
                                                                    {act.disposition.replace('_', ' ')}
                                                                </span>
                                                            )}
                                                            <span>{act.authorName}</span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400">
                                                            {new Date(act.createdAt).toLocaleString('en-GB', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    {act.note && (
                                                        <p className="mt-1.5 text-xs text-slate-700 whitespace-pre-wrap">
                                                            {act.note}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
