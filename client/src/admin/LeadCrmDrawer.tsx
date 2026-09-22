import { useState, useEffect, useCallback, type ElementType } from 'react';
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
    AlertCircle,
    FileText,
    Pencil,
    CheckSquare,
    BarChart3,
    UserPlus
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
import EditTaskModal from './EditTaskModal';
import { cn } from '../shared/utils';

export type GrowthAuditLeadRef = {
    id: string;
    createdAt?: string;
    businessName: string | null;
    name?: string | null;
    type?: string | null;
    status?: string | null;
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
    industry?: string | null;
    gbpObservation?: string | null;
    aiVisibilityObservation?: string | null;
    leadOpportunity?: string | null;
    opportunityLevel?: string | null;
    isCustomer?: boolean | null;
    convertedAt?: string | null;
    scoreTotal?: number | null;
    leadScoreTotal?: number | null;
    sharePath?: string | null;
    reportUrl?: string | null;
    notes?: string | null;
    importBatchId?: string | null;
    importFileName?: string | null;
    importUploadedAt?: string | null;
    spreadsheetStatus?: string | null;
    latestActivity?: {
        type: string;
        disposition?: string;
        note?: string;
        authorName?: string;
        createdAt: string;
    } | null;
};

const NOTES_MAX = 500;

const TASK_PRESETS: Array<{
    type: TaskType;
    label: string;
    icon: ElementType;
    defaultTitle: string;
    defaultPriority: TaskPriority;
}> = [
    { type: 'prepare_audit', label: 'Prepare Audit', icon: BarChart3, defaultTitle: 'Prepare & Review Growth Audit', defaultPriority: 'high' },
    { type: 'follow_up_call', label: 'Follow-Up Call', icon: Phone, defaultTitle: 'Follow-up Call with Lead', defaultPriority: 'medium' },
    { type: 'send_proposal', label: 'Send Proposal', icon: FileText, defaultTitle: 'Send Service Proposal & Pricing', defaultPriority: 'high' },
    { type: 'onboard_customer', label: 'Onboard Customer', icon: UserPlus, defaultTitle: 'Onboard as New Customer', defaultPriority: 'urgent' },
    { type: 'custom', label: '+ Custom Task', icon: Plus, defaultTitle: 'Custom Task', defaultPriority: 'medium' }
];

interface LeadCrmDrawerProps {
    lead: GrowthAuditLeadRef;
    salesAgents: SalesAgent[];
    onClose: () => void;
    onTaskUpdated?: () => void;
    onViewDetails?: (lead: GrowthAuditLeadRef) => void;
}

export default function LeadCrmDrawer({
    lead,
    salesAgents,
    onClose,
    onTaskUpdated,
    onViewDetails
}: LeadCrmDrawerProps) {
    const [activeTab, setActiveTab] = useState<'tasks' | 'activities'>('tasks');
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    
    const [taskType, setTaskType] = useState<TaskType>('prepare_audit');
    const [taskTitle, setTaskTitle] = useState(TASK_PRESETS[0].defaultTitle);
    const [taskNotes, setTaskNotes] = useState('');
    const [taskAssignee, setTaskAssignee] = useState<string>('');
    const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
    const [taskDueDate, setTaskDueDate] = useState<string>('');
    const [submittingTask, setSubmittingTask] = useState(false);

    
    const [successToast, setSuccessToast] = useState<string | null>(null);

    
    const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
    const [editingTask, setEditingTask] = useState<LeadTask | null>(null);

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

    const bizName = lead.businessName || lead.name || 'Lead Details';
    const displayScore = lead.scoreTotal ?? lead.leadScoreTotal;
    const websiteLabel = lead.website
        ? lead.website.replace(/^https?:\/\/(www\.)?/, '')
        : null;
    const contactPillClass =
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50/70 text-sky-800 text-xs font-medium hover:bg-sky-50 transition-colors';

    return (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm flex justify-end transition-opacity">
            <div className="w-full max-w-2xl sm:max-w-3xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900 truncate">
                                {bizName}
                            </h2>
                            {displayScore != null && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Score: {displayScore}/100
                                </span>
                            )}
                        </div>

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            {lead.email && (
                                <a href={`mailto:${lead.email}`} className={contactPillClass}>
                                    <Mail className="w-3.5 h-3.5 text-sky-500" />
                                    {lead.email}
                                </a>
                            )}
                            {lead.website && (
                                <a
                                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={contactPillClass}
                                >
                                    <Globe className="w-3.5 h-3.5 text-sky-500" />
                                    {websiteLabel}
                                </a>
                            )}
                            {lead.reportUrl && (
                                <a
                                    href={lead.reportUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={contactPillClass}
                                >
                                    <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                                    Audit Report
                                </a>
                            )}
                            {!lead.email && !lead.website && !lead.reportUrl && onViewDetails && (
                                <button
                                    type="button"
                                    onClick={() => onViewDetails(lead)}
                                    className={contactPillClass}
                                >
                                    View details
                                </button>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex border-b border-slate-200 bg-white px-6 shrink-0">
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={cn(
                            'py-3 px-1 mr-6 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors',
                            activeTab === 'tasks'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        )}
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Tasks & Assignment
                    </button>
                    <button
                        onClick={() => setActiveTab('activities')}
                        className={cn(
                            'py-3 px-1 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors',
                            activeTab === 'activities'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        )}
                    >
                        <Clock className="w-4 h-4" />
                        Call Logs & History
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

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'tasks' ? (
                        <>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-slate-500" />
                                        Assign task
                                    </h3>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Create a new task for this lead or assign an existing workflow step.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {TASK_PRESETS.map((preset) => {
                                        const Icon = preset.icon;
                                        const selected = taskType === preset.type;
                                        return (
                                            <button
                                                key={preset.type}
                                                type="button"
                                                onClick={() => handleSelectPreset(preset)}
                                                className={cn(
                                                    'text-xs px-3 py-2 rounded-lg border font-medium transition-all flex items-center gap-1.5',
                                                    selected
                                                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                                )}
                                            >
                                                {preset.type !== 'custom' && (
                                                    <Icon className={cn('w-3.5 h-3.5', selected ? 'text-white' : 'text-slate-400')} />
                                                )}
                                                <span>{preset.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <form onSubmit={handleCreateTask} className="space-y-3.5">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            Task Title
                                        </label>
                                        <input
                                            type="text"
                                            value={taskTitle}
                                            onChange={(e) => setTaskTitle(e.target.value)}
                                            placeholder="What needs to be done?"
                                            required
                                            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                            Notes & Context (Optional)
                                        </label>
                                        <div className="relative">
                                            <textarea
                                                value={taskNotes}
                                                onChange={(e) => setTaskNotes(e.target.value.slice(0, NOTES_MAX))}
                                                rows={3}
                                                maxLength={NOTES_MAX}
                                                placeholder="Additional context or requirements..."
                                                className="w-full px-3 py-2.5 pb-7 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                                            />
                                            <span className="absolute bottom-2.5 right-3 text-[11px] text-slate-400 tabular-nums">
                                                {taskNotes.length}/{NOTES_MAX}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                                Assignee
                                            </label>
                                            <select
                                                value={taskAssignee}
                                                onChange={(e) => setTaskAssignee(e.target.value)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                                            <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                                Priority
                                            </label>
                                            <select
                                                value={taskPriority}
                                                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="urgent">Urgent</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                                Due Date
                                            </label>
                                            <input
                                                type="date"
                                                value={taskDueDate}
                                                onChange={(e) => setTaskDueDate(e.target.value)}
                                                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-1">
                                        <button
                                            type="submit"
                                            disabled={submittingTask || !taskTitle.trim()}
                                            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {submittingTask ? 'Assigning...' : 'Assign task'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Lead tasks ({tasks.length})
                                </h3>

                                {loading ? (
                                    <div className="py-8 text-center text-xs text-slate-400">Loading tasks...</div>
                                ) : tasks.length === 0 ? (
                                    <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                                        <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-sm text-slate-500">
                                            No tasks assigned yet. Use the buttons above to assign &apos;Prepare Audit&apos; or &apos;Onboard Customer&apos;.
                                        </p>
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
                                                        'p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3',
                                                        isDone
                                                            ? 'bg-emerald-50/60 border-emerald-200'
                                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                                    )}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={cn(
                                                                'text-sm font-semibold',
                                                                isDone ? 'text-emerald-900' : 'text-slate-900'
                                                            )}>
                                                                {task.title}
                                                            </span>
                                                            <span className={cn(
                                                                'text-[10px] font-bold uppercase px-2 py-0.5 rounded-md',
                                                                task.priority === 'urgent' ? 'bg-rose-100 text-rose-800' :
                                                                task.priority === 'high' ? 'bg-amber-100 text-amber-800' :
                                                                task.priority === 'medium' ? 'bg-sky-100 text-sky-800' :
                                                                'bg-slate-100 text-slate-700'
                                                            )}>
                                                                {task.priority}
                                                            </span>
                                                        </div>

                                                        {task.notes && (
                                                            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                                                                {task.notes}
                                                            </p>
                                                        )}

                                                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                                            {task.assignedToName ? (
                                                                <span className="flex items-center gap-1 font-medium text-slate-600">
                                                                    <User className="w-3 h-3 text-slate-400" />
                                                                    {task.assignedToName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 italic">Unassigned</span>
                                                            )}

                                                            {task.dueDate && (
                                                                <span className={cn(
                                                                    'flex items-center gap-1 font-medium',
                                                                    isOverdue ? 'text-rose-600' : isDone ? 'text-emerald-700' : 'text-slate-600'
                                                                )}>
                                                                    <Calendar className="w-3 h-3" />
                                                                    {isOverdue ? 'Overdue: ' : 'Due: '}
                                                                    {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className={cn(
                                                            'inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md',
                                                            task.status === 'completed' ? 'bg-emerald-50 text-emerald-800' :
                                                            task.status === 'in_progress' ? 'bg-amber-50 text-amber-800' :
                                                            task.status === 'cancelled' ? 'bg-rose-50 text-rose-800' :
                                                            'bg-slate-50 text-slate-600'
                                                        )}>
                                                            {task.status === 'completed' && <Check className="w-3 h-3" />}
                                                            {task.status === 'in_progress' && <Clock className="w-3 h-3" />}
                                                            {task.status === 'cancelled' && <X className="w-3 h-3" />}
                                                            <span className="capitalize">{task.status.replace('_', ' ')}</span>
                                                        </span>

                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingTask(task)}
                                                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                            title="Edit Task"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={deletingTaskId === task.id}
                                                            onClick={() => handleDeleteTask(task.id)}
                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
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
                            {(() => {
                                const displayActivities: LeadActivity[] = (() => {
                                    const list: LeadActivity[] = [...activities];
                                    const initialNote = (lead as any).salesNotes || (lead as any).latestActivity?.note || lead.notes;
                                    const initialStatus = lead.status || (lead as any).latestActivity?.disposition;
                                    const initialDate = (lead as any).latestActivity?.createdAt || (lead as any).updatedAt || lead.createdAt;
                                    const author = (lead as any).latestActivity?.authorName || (lead as any).assignedAgentName;

                                    if (initialNote && String(initialNote).trim()) {
                                        const cleanInitial = String(initialNote).trim().toLowerCase();
                                        const hasMatch = list.some(a => (a.note || '').toLowerCase().includes(cleanInitial));
                                        if (!hasMatch) {
                                            list.unshift({
                                                id: 'lead-drawer-initial-note',
                                                leadId: lead.id,
                                                activityType: 'note',
                                                disposition: initialStatus || 'in_progress',
                                                note: initialNote,
                                                authorName: author || 'Sales Agent',
                                                createdAt: initialDate || new Date().toISOString()
                                            } as LeadActivity);
                                        }
                                    } else if (list.length === 0 && initialStatus) {
                                        list.push({
                                            id: 'lead-drawer-initial-status',
                                            leadId: lead.id,
                                            activityType: 'status_change',
                                            disposition: initialStatus,
                                            note: '',
                                            authorName: author || 'System',
                                            createdAt: initialDate || new Date().toISOString()
                                        } as LeadActivity);
                                    }
                                    return list;
                                })();

                                return (
                                    <>
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                Activity & Call History
                                            </h3>
                                            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                                {displayActivities.length} {displayActivities.length === 1 ? 'Event' : 'Events'}
                                            </span>
                                        </div>

                                        {loading ? (
                                            <div className="py-12 text-center text-xs text-slate-400">Loading activity history…</div>
                                        ) : displayActivities.length === 0 ? (
                                            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-400 space-y-1">
                                                <Clock className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                                                <p className="font-semibold text-slate-600">No call logs or activity recorded yet.</p>
                                                <p className="text-[11px] text-slate-400">Calls logged by assigned telecallers will appear here in real-time.</p>
                                            </div>
                                        ) : (
                                            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                                {displayActivities.map((act) => {
                                                    const isCall = act.activityType === 'call_log';
                                                    const isTask = act.activityType === 'task_event';
                                                    const isDeleted = isTask && act.note?.toLowerCase().includes('deleted');

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
                                                                        {(() => {
                                                                            const raw = act.note || '';
                                                                            const noteMatch = raw.match(/—\s*Note:\s*["']?([\s\S]*?)["']?$/i);
                                                                            if (noteMatch && noteMatch[1]) {
                                                                                return noteMatch[1].trim();
                                                                            }
                                                                            return raw;
                                                                        })()}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Task Modal */}
            {editingTask && (
                <EditTaskModal
                    isOpen={Boolean(editingTask)}
                    task={editingTask}
                    salesAgents={salesAgents}
                    onClose={() => setEditingTask(null)}
                    onSuccess={() => {
                        setEditingTask(null);
                        setSuccessToast('Task updated successfully');
                        loadLeadData();
                        if (onTaskUpdated) onTaskUpdated();
                    }}
                    onDeleted={() => {
                        setEditingTask(null);
                        setSuccessToast('Task deleted successfully');
                        loadLeadData();
                        if (onTaskUpdated) onTaskUpdated();
                    }}
                />
            )}
        </div>
    );
}
