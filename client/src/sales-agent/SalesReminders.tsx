import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
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
    Building2,
    X,
    Clock,
    History,
    FileText,
    Mail,
    Users,
    Send,
    ArrowUpDown,
    Info,
    CheckCircle2
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../shared/TaskCompletionModal';
import LeadStatusHistoryModal from '../admin/LeadStatusHistoryModal';
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
import { apiGet, cn } from '../shared/utils';

type SalesLead = {
    id: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    nextFollowUpAt?: string | null;
};

const REMINDER_TYPES: { type: SalesTaskType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { type: 'prepare_audit', label: 'Prepare Audit', icon: FileText },
    { type: 'follow_up_call', label: 'Follow-up Call', icon: Phone },
    { type: 'send_proposal', label: 'Send Proposal', icon: Mail },
    { type: 'onboard_customer', label: 'Onboard Customer', icon: Users },
    { type: 'custom', label: 'Custom Reminder', icon: Calendar }
];

type ReminderFormConfig = {
    description: string;
    titleLabel: string;
    titlePlaceholder: string;
    defaultTitle: string;
    defaultPriority: SalesTaskPriority;
    leadLabel: string;
    leadRequired: boolean;
    leadPlaceholder: string;
    dueLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    extraLabel: string;
    extraPlaceholder: string;
    submitLabel: string;
};

const REMINDER_FORM_CONFIG: Record<SalesTaskType, ReminderFormConfig> = {
    prepare_audit: {
        description: 'Prep the growth audit pack — note gaps to review before you share it.',
        titleLabel: 'Audit reminder title',
        titlePlaceholder: 'e.g. Finish GBP + AI visibility review for…',
        defaultTitle: 'Prepare & Review Growth Audit',
        defaultPriority: 'high',
        leadLabel: 'Which lead is this audit for?',
        leadRequired: true,
        leadPlaceholder: 'Select the lead for this audit…',
        dueLabel: 'Target ready-by date',
        notesLabel: 'Audit prep notes',
        notesPlaceholder: 'What to check: GBP gaps, reviews, website CTA, competitors…',
        extraLabel: 'Focus areas',
        extraPlaceholder: 'e.g. Local SEO score, listing photos, competitor comparison',
        submitLabel: 'Save Audit Reminder'
    },
    follow_up_call: {
        description: 'Schedule a call-back with talking points so you remember why you are dialing.',
        titleLabel: 'Call reminder title',
        titlePlaceholder: 'e.g. Call back regarding pricing proposal…',
        defaultTitle: 'Follow-up Call with Lead',
        defaultPriority: 'medium',
        leadLabel: 'Who are you calling?',
        leadRequired: true,
        leadPlaceholder: 'Select the lead to call…',
        dueLabel: 'Call back date & time',
        notesLabel: 'Talking points',
        notesPlaceholder: 'Objections to cover, questions to ask, last conversation notes…',
        extraLabel: 'Call goal',
        extraPlaceholder: 'e.g. Confirm interest, book demo, answer pricing questions',
        submitLabel: 'Save Call Reminder'
    },
    send_proposal: {
        description: 'Remind yourself to send pricing or a service proposal to a warm lead.',
        titleLabel: 'Proposal reminder title',
        titlePlaceholder: 'e.g. Send Local SEO proposal + pricing…',
        defaultTitle: 'Send Service Proposal & Pricing',
        defaultPriority: 'high',
        leadLabel: 'Send proposal to',
        leadRequired: true,
        leadPlaceholder: 'Select the lead for this proposal…',
        dueLabel: 'Target send date',
        notesLabel: 'Proposal notes',
        notesPlaceholder: 'Package details, discounts discussed, attachments to include…',
        extraLabel: 'Package / pricing to send',
        extraPlaceholder: 'e.g. Growth Starter · £299/mo · include audit PDF',
        submitLabel: 'Save Proposal Reminder'
    },
    onboard_customer: {
        description: 'Track post-conversion setup so the new customer gets a smooth handoff.',
        titleLabel: 'Onboarding reminder title',
        titlePlaceholder: 'e.g. Complete portal invite + kickoff call…',
        defaultTitle: 'Onboard as New Customer',
        defaultPriority: 'urgent',
        leadLabel: 'Customer / converted lead',
        leadRequired: true,
        leadPlaceholder: 'Select the converted lead…',
        dueLabel: 'Onboarding deadline',
        notesLabel: 'Onboarding notes',
        notesPlaceholder: 'Access needed, kickoff agenda, special requests…',
        extraLabel: 'Checklist to complete',
        extraPlaceholder: 'e.g. Invite to portal, collect branding, schedule kickoff',
        submitLabel: 'Save Onboarding Reminder'
    },
    custom: {
        description: 'Anything else you want to remember — fully freeform.',
        titleLabel: 'Reminder title',
        titlePlaceholder: 'e.g. Research competitor pricing before Monday…',
        defaultTitle: '',
        defaultPriority: 'medium',
        leadLabel: 'Attach to lead (optional)',
        leadRequired: false,
        leadPlaceholder: 'Select a lead (optional)…',
        dueLabel: 'Due date & time',
        notesLabel: 'Additional notes & context',
        notesPlaceholder: 'Any context, objections, or reminders for yourself…',
        extraLabel: 'Extra context',
        extraPlaceholder: 'Optional details you want saved with this reminder…',
        submitLabel: 'Save Self Reminder'
    }
};

const TASK_TYPE_CONFIG: Record<SalesTaskType, { label: string; icon: React.ComponentType<{ className?: string }>; bg: string; text: string }> = {
    prepare_audit: { label: 'Prepare Audit', icon: FileText, bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700' },
    follow_up_call: { label: 'Follow-Up Call', icon: Phone, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
    send_proposal: { label: 'Send Proposal', icon: Mail, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
    onboard_customer: { label: 'Onboard Customer', icon: Users, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800' },
    custom: { label: 'Custom Reminder', icon: Calendar, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' }
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
    const [selectedHistoryTask, setSelectedHistoryTask] = useState<SalesLeadTask | null>(null);
    const [showLearnMore, setShowLearnMore] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [dueTodayOnly, setDueTodayOnly] = useState(false);
    const [sortNewestFirst, setSortNewestFirst] = useState(true);

    // Create Reminder Form State
    const [taskType, setTaskType] = useState<SalesTaskType>('follow_up_call');
    const [title, setTitle] = useState(REMINDER_FORM_CONFIG.follow_up_call.defaultTitle);
    const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId);
    const [priority, setPriority] = useState<SalesTaskPriority>(REMINDER_FORM_CONFIG.follow_up_call.defaultPriority);
    const [dueDateDate, setDueDateDate] = useState('');
    const [dueDateTime, setDueDateTime] = useState('');
    const [notes, setNotes] = useState('');
    const [extraContext, setExtraContext] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const formConfig = REMINDER_FORM_CONFIG[taskType];

    const handleSelectReminderType = (nextType: SalesTaskType) => {
        const prevDefault = REMINDER_FORM_CONFIG[taskType].defaultTitle;
        const nextConfig = REMINDER_FORM_CONFIG[nextType];
        setTaskType(nextType);
        setPriority(nextConfig.defaultPriority);
        setExtraContext('');
        // Replace title when empty or still the previous type's default
        if (!title.trim() || title.trim() === prevDefault) {
            setTitle(nextConfig.defaultTitle);
        }
    };

    // Modals
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

    const handleCreateReminder = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        if (formConfig.leadRequired && !selectedLeadId) {
            setError(`Please select a lead for this ${TASK_TYPE_CONFIG[taskType].label.toLowerCase()}.`);
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            let combinedDueDate: string | null = null;
            if (dueDateDate) {
                if (dueDateTime) {
                    combinedDueDate = new Date(`${dueDateDate}T${dueDateTime}`).toISOString();
                } else {
                    combinedDueDate = new Date(`${dueDateDate}T09:00:00`).toISOString();
                }
            }

            const noteParts = [notes.trim(), extraContext.trim() ? `${formConfig.extraLabel}: ${extraContext.trim()}` : '']
                .filter(Boolean)
                .join('\n\n');

            await createSalesTask({
                lead_id: selectedLeadId || undefined,
                task_type: taskType,
                title: title.trim(),
                notes: noteParts,
                priority,
                due_date: combinedDueDate
            });

            setTitle(REMINDER_FORM_CONFIG[taskType].defaultTitle);
            setNotes('');
            setExtraContext('');
            setDueDateDate('');
            setDueDateTime('');
            setSelectedLeadId('');
            setPriority(REMINDER_FORM_CONFIG[taskType].defaultPriority);
            setSuccessToast('Self reminder created successfully! 🔔');
            setTimeout(() => setSuccessToast(null), 3500);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to create reminder');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenToggleModal = (task: SalesLeadTask, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmModalTask({
            task,
            isCompleting: task.status !== 'completed'
        });
    };

    const handleConfirmToggleStatus = async (chosenStatus?: CrmTaskStatus, statusNotes?: string) => {
        if (!confirmModalTask) return;
        const { task, isCompleting } = confirmModalTask;
        setModalLoading(true);
        setError('');
        try {
            const nextStatus: SalesTaskStatus = (chosenStatus as SalesTaskStatus) || (isCompleting ? 'completed' : 'pending');
            await updateSalesTask(task.id, {
                status: nextStatus,
                notes: statusNotes !== undefined ? statusNotes : undefined
            });
            setSuccessToast(`Reminder marked as ${nextStatus.replace('_', ' ')}!`);
            setTimeout(() => setSuccessToast(null), 3000);
            await loadData();
            setConfirmModalTask(null);
        } catch (err: any) {
            setError(err.message || 'Failed to update reminder status');
        } finally {
            setModalLoading(false);
        }
    };

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

    const filteredTasks = useMemo(() => {
        let result = tasks.filter((t) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                t.title.toLowerCase().includes(q) ||
                (t.notes && t.notes.toLowerCase().includes(q)) ||
                (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
                (t.leadPhone && t.leadPhone.includes(q))
            );
        });

        result.sort((a, b) => {
            if (!sortNewestFirst) {
                const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                return dueA - dueB;
            }
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateB - dateA;
        });

        return result;
    }, [tasks, searchQuery, sortNewestFirst]);

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                        Self Reminders & Follow-Ups
                    </h1>
                    <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                        Your personal follow-up tasks, custom reminders, and scheduled calls.
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

            {/* 2. Create a new self reminder Card */}
            <form
                onSubmit={handleCreateReminder}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 transition-all"
            >
                {/* Form Title */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-[#F97316] flex items-center justify-center text-white text-xs font-black shadow-xs">
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-900">Create a new self reminder</h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg self-start">
                        <Users className="w-3 h-3" />
                        Visible in your work queue
                    </span>
                </div>

                {/* Reminder Type Selectors */}
                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                        Reminder type
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        {REMINDER_TYPES.map((item) => {
                            const IconComponent = item.icon;
                            const isSelected = taskType === item.type;
                            return (
                                <button
                                    key={item.type}
                                    type="button"
                                    onClick={() => handleSelectReminderType(item.type)}
                                    className={cn(
                                        'py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer text-center',
                                        isSelected
                                            ? 'border-2 border-[#F97316] bg-[#FFFBF7] text-slate-900 font-bold shadow-2xs'
                                            : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                    )}
                                >
                                    <IconComponent className={cn('w-4 h-4 shrink-0', isSelected ? 'text-[#F97316]' : 'text-slate-500')} />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-3 rounded-xl border border-orange-100 bg-[#FFF7ED] px-3.5 py-2.5 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-orange-900/80 leading-relaxed">
                            <span className="font-bold text-orange-950">{TASK_TYPE_CONFIG[taskType].label}:</span>{' '}
                            {formConfig.description}
                        </p>
                    </div>
                </div>

                {/* Row 1: Reminder title & Attach to lead */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {formConfig.titleLabel} <span className="text-rose-500">*</span>
                        </label>
                        <input
                            required
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={formConfig.titlePlaceholder}
                            className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {formConfig.leadLabel}
                            {formConfig.leadRequired ? (
                                <span className="text-rose-500"> *</span>
                            ) : (
                                <span className="text-slate-400 font-medium"> (optional)</span>
                            )}
                        </label>
                        <select
                            required={formConfig.leadRequired}
                            value={selectedLeadId}
                            onChange={(e) => setSelectedLeadId(e.target.value)}
                            className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                        >
                            <option value="">{formConfig.leadPlaceholder}</option>
                            {leads.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name} {l.phone ? `(${l.phone})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Row 2: Priority & Due date & time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Priority
                        </label>
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as SalesTaskPriority)}
                            className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {formConfig.dueLabel}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                                <input
                                    type="date"
                                    value={dueDateDate}
                                    onChange={(e) => setDueDateDate(e.target.value)}
                                    className="w-full text-xs pl-3 pr-8 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                                />
                                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <div className="relative">
                                <input
                                    type="time"
                                    value={dueDateTime}
                                    onChange={(e) => setDueDateTime(e.target.value)}
                                    className="w-full text-xs pl-3 pr-8 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                                />
                                <Clock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Type-specific extra context */}
                {taskType !== 'custom' && (
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {formConfig.extraLabel} <span className="text-slate-400 font-medium">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={extraContext}
                            onChange={(e) => setExtraContext(e.target.value)}
                            placeholder={formConfig.extraPlaceholder}
                            className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                        />
                    </div>
                )}

                {/* Row 3: Additional notes & context */}
                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {formConfig.notesLabel} <span className="text-slate-400 font-medium">(optional)</span>
                    </label>
                    <div className="relative">
                        <textarea
                            rows={3}
                            maxLength={500}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={formConfig.notesPlaceholder}
                            className="w-full text-xs p-3 pb-6 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                        />
                        <span className="absolute right-3 bottom-2 text-[10px] text-slate-400 font-medium">
                            {notes.length}/500
                        </span>
                    </div>
                </div>

                {/* Bottom Action: Save Reminder */}
                <div className="flex justify-end pt-1">
                    <button
                        type="submit"
                        disabled={submitting || !title.trim() || (formConfig.leadRequired && !selectedLeadId)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                        <Send className="w-3.5 h-3.5 rotate-45" />
                        <span>{submitting ? 'Saving...' : formConfig.submitLabel}</span>
                    </button>
                </div>
            </form>

            {/* 3. Filter Controls Bar */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search reminder title, lead, phone..."
                            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] cursor-pointer"
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
                        className="px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] cursor-pointer"
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
                        className="px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] cursor-pointer"
                    >
                        <option value="all">All Types</option>
                        <option value="follow_up_call">Follow-Up Call</option>
                        <option value="prepare_audit">Prepare Audit</option>
                        <option value="send_proposal">Send Proposal</option>
                        <option value="onboard_customer">Onboard Customer</option>
                        <option value="custom">Custom Reminder</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => setDueTodayOnly((v) => !v)}
                        className={cn(
                            'px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer',
                            dueTodayOnly
                                ? 'bg-[#0A1628] text-white border-[#0A1628]'
                                : 'bg-[#F8FAFC] text-slate-700 border-[#E2E8F0] hover:bg-slate-100'
                        )}
                    >
                        Due Today Only
                    </button>
                </div>

                {/* Sort Toggle Button */}
                <button
                    type="button"
                    onClick={() => setSortNewestFirst((v) => !v)}
                    className="p-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shrink-0"
                    title={sortNewestFirst ? 'Sorted by: Newest First (Click to sort by Due Date)' : 'Sorted by: Due Date (Click to sort by Newest)'}
                >
                    <ArrowUpDown className="w-4 h-4" />
                </button>
            </div>

            {/* 4. Reminders List / Empty State */}
            {loading && !tasks.length ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center text-slate-500 shadow-xs">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F97316]" />
                    <p className="text-sm font-semibold">Loading your self reminders...</p>
                </div>
            ) : !filteredTasks.length ? (
                /* Empty state matching mockup */
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center shadow-xs">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 text-slate-400">
                        <Bell className="w-7 h-7 stroke-[1.5]" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">No reminders yet</h3>
                    <p className="text-xs text-slate-500 mt-1">Create a reminder above or adjust your filters.</p>
                    <div className="mt-4 flex items-center justify-center">
                        <button
                            type="button"
                            onClick={() => setShowLearnMore(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                        >
                            <Info className="w-3.5 h-3.5 text-slate-500" />
                            <span>Learn more about reminders</span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xs overflow-hidden divide-y divide-slate-100">
                    {filteredTasks.map((task) => {
                        const isDone = task.status === 'completed';
                        const typeConf = TASK_TYPE_CONFIG[task.taskType] || TASK_TYPE_CONFIG.custom;
                        const prioConf = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.medium;
                        const dueBadge = formatDueDate(task.dueDate);
                        const TypeIcon = typeConf.icon;

                        return (
                            <div
                                key={task.id}
                                className={cn(
                                    'p-4 sm:p-5 transition-colors group',
                                    isDone
                                        ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-4 border-l-emerald-500'
                                        : 'hover:bg-[#F8FAFC]'
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                            {/* Type Badge */}
                                            <span className={cn(
                                                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px] font-bold',
                                                typeConf.bg,
                                                typeConf.text
                                            )}>
                                                <TypeIcon className="w-3 h-3" />
                                                <span>{typeConf.label}</span>
                                            </span>

                                            {/* Priority Badge */}
                                            <span className={cn(
                                                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                                                prioConf.bg,
                                                prioConf.text
                                            )}>
                                                <span className={cn('w-1.5 h-1.5 rounded-full', prioConf.dot)} />
                                                {prioConf.label}
                                            </span>

                                            {/* Due Date Badge */}
                                            {dueBadge && (
                                                <span className={cn(
                                                    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px]',
                                                    dueBadge.style
                                                )}>
                                                    <Calendar className="w-3 h-3 shrink-0" />
                                                    {dueBadge.text}
                                                </span>
                                            )}
                                        </div>

                                        {/* Reminder Title */}
                                        <h3 className={cn(
                                            'text-sm font-bold',
                                            isDone ? 'text-emerald-950 line-through opacity-80' : 'text-slate-900'
                                        )}>
                                            {task.title}
                                        </h3>

                                        {/* Notes */}
                                        {task.notes && (
                                            <p className={cn(
                                                'text-xs mt-1 leading-relaxed',
                                                isDone ? 'text-emerald-800/80' : 'text-slate-500'
                                            )}>
                                                {task.notes}
                                            </p>
                                        )}

                                        {/* Attached Lead */}
                                        {task.leadId && task.leadId !== 'general' && (
                                            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                                                <Link
                                                    to={`/sales/leads/${encodeURIComponent(task.leadId)}`}
                                                    className="inline-flex items-center gap-1.5 font-bold text-[#F97316] hover:text-[#EA580C] bg-orange-50 border border-orange-200/80 px-2.5 py-1 rounded-lg hover:underline group/lead"
                                                >
                                                    <Building2 className="w-3.5 h-3.5 text-[#F97316]" />
                                                    <span>{task.leadBusinessName || 'Open Lead Profile'}</span>
                                                    <ArrowUpRight className="w-3 h-3 text-[#F97316] group-hover/lead:translate-x-0.5 group-hover/lead:-translate-y-0.5 transition-transform" />
                                                </Link>

                                                {task.leadPhone && (
                                                    <a
                                                        href={`tel:${task.leadPhone}`}
                                                        className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium bg-slate-100 px-2 py-0.5 rounded-md text-[11px]"
                                                    >
                                                        <Phone className="w-3 h-3" />
                                                        {task.leadPhone}
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Status Badge & Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedHistoryTask(task);
                                            }}
                                            className={cn(
                                                'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border cursor-pointer hover:shadow-xs transition-all group/badge',
                                                task.status === 'completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' :
                                                task.status === 'in_progress' ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' :
                                                task.status === 'cancelled' ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100' :
                                                'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#0A1628] hover:bg-slate-800 text-white transition-all shadow-2xs cursor-pointer"
                                            title="Update Status"
                                        >
                                            <span>Update Status</span>
                                        </button>

                                        <button
                                            type="button"
                                            disabled={deletingId === task.id}
                                            onClick={(e) => handleDeleteReminder(task.id, e)}
                                            className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg transition-colors cursor-pointer"
                                            title="Delete Reminder"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Learn More Modal */}
            {showLearnMore && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#F97316] flex items-center justify-center">
                                    <Bell className="w-4 h-4" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-900">About Self Reminders</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowLearnMore(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-slate-800">Direct Notification Sync</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Tasks with due dates automatically trigger alerts in your top navigation notification bell.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-slate-800">Lead Context & Direct Calling</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Attach reminders to any sales lead to keep full call outcome logs and quick phone dialing handy.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-slate-800">Timeline & Activity History</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Click any status pill to view the timestamped audit log of all status transitions.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowLearnMore(false)}
                                className="px-4 py-2 bg-[#0A1628] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                                Got It
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Completion Modal */}
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
