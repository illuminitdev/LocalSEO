import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Check, Trash2, Loader2 } from 'lucide-react';
import {
    type LeadTask,
    type TaskType,
    type TaskPriority,
    type TaskStatus,
    type SalesAgent,
    updateCrmTask,
    deleteCrmTask
} from './adminApi';
import { cn } from '../shared/utils';

interface EditTaskModalProps {
    isOpen: boolean;
    task: LeadTask | null;
    salesAgents: SalesAgent[];
    onClose: () => void;
    onSuccess: (updatedTask: LeadTask) => void;
    onDeleted?: (taskId: string) => void;
}

const TASK_TYPES: Array<{
    type: TaskType;
    label: string;
    icon: string;
    defaultTitle: string;
    defaultPriority: TaskPriority;
}> = [
    { type: 'prepare_audit', label: 'Prepare Audit', icon: '📊', defaultTitle: 'Prepare & Review Growth Audit', defaultPriority: 'high' },
    { type: 'follow_up_call', label: 'Follow-Up Call', icon: '📞', defaultTitle: 'Follow-up Call with Lead', defaultPriority: 'medium' },
    { type: 'send_proposal', label: 'Send Proposal', icon: '📄', defaultTitle: 'Send Service Proposal & Pricing', defaultPriority: 'high' },
    { type: 'onboard_customer', label: 'Onboard Customer', icon: '🚀', defaultTitle: 'Onboard as New Customer', defaultPriority: 'urgent' },
    { type: 'custom', label: 'Custom Task', icon: '📌', defaultTitle: 'Custom Task', defaultPriority: 'medium' },
];

function normalizeTaskType(type?: string): TaskType {
    if (!type) return 'follow_up_call';
    if (type === 'call' || type === 'follow_up') return 'follow_up_call';
    if (type === 'audit_review') return 'prepare_audit';
    if (type === 'proposal') return 'send_proposal';
    if (type === 'meeting' || type === 'email' || type === 'other') return 'custom';
    if (['prepare_audit', 'onboard_customer', 'follow_up_call', 'send_proposal', 'custom'].includes(type)) {
        return type as TaskType;
    }
    return 'custom';
}

const PRIORITIES: Array<{ value: TaskPriority; label: string; color: string }> = [
    { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'high', label: 'High', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { value: 'urgent', label: 'Urgent', color: 'bg-rose-50 text-rose-800 border-rose-200' },
];

const STATUSES: Array<{ value: TaskStatus; label: string; color: string }> = [
    { value: 'pending', label: 'Pending', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    { value: 'in_progress', label: 'In Progress', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { value: 'completed', label: 'Completed', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { value: 'cancelled', label: 'Cancelled', color: 'bg-rose-50 text-rose-800 border-rose-200' },
];

export default function EditTaskModal({
    isOpen,
    task,
    salesAgents,
    onClose,
    onSuccess,
    onDeleted
}: EditTaskModalProps) {
    const [title, setTitle] = useState('');
    const [taskType, setTaskType] = useState<TaskType>('follow_up_call');
    const [priority, setPriority] = useState<TaskPriority>('medium');
    const [status, setStatus] = useState<TaskStatus>('pending');
    const [assignedTo, setAssignedTo] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (task && isOpen) {
            setTitle(task.title || '');
            setTaskType(normalizeTaskType(task.taskType));
            setPriority(task.priority || 'medium');
            setStatus(task.status || 'pending');
            setAssignedTo(task.assignedToUserId || '');
            setNotes(task.notes || '');

            // Format date for datetime-local input
            if (task.dueDate) {
                try {
                    const d = new Date(task.dueDate);
                    if (!isNaN(d.getTime())) {
                        const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                            .toISOString()
                            .slice(0, 16);
                        setDueDate(localIso);
                    } else {
                        setDueDate('');
                    }
                } catch {
                    setDueDate('');
                }
            } else {
                setDueDate('');
            }
            setError(null);
        }
    }, [task, isOpen]);

    if (!isOpen || !task) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Task title is required.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const updated = await updateCrmTask(task.id, {
                title: title.trim(),
                task_type: taskType,
                priority,
                status,
                assigned_to_user_id: assignedTo || null,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                notes: notes.trim()
            });

            onSuccess(updated);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to update task.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTaskType = (preset: typeof TASK_TYPES[0]) => {
        setTaskType(preset.type);
        if (preset.defaultTitle) {
            setTitle(preset.defaultTitle);
        }
    };

    const handleDelete = async () => {
        if (!task) return;
        if (!window.confirm(`Are you sure you want to delete task "${task.title}"?`)) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteCrmTask(task.id);
            onDeleted?.(task.id);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to delete task');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
                            ✏️
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Edit CRM Task</h2>
                            <p className="text-[11px] text-slate-500">Update task details, schedule, or assignee</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                    {/* Task Type Presets */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                            Task Type
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {TASK_TYPES.map((t) => (
                                <button
                                    key={t.type}
                                    type="button"
                                    onClick={() => handleSelectTaskType(t)}
                                    className={cn(
                                        "px-2.5 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 text-xs",
                                        taskType === t.type
                                            ? "bg-amber-500 text-white border-amber-600 shadow-2xs font-semibold"
                                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                    )}
                                >
                                    <span>{t.icon}</span>
                                    <span>{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Task Title */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Task Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Call owner to discuss GBP audit"
                            required
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 font-medium"
                        />
                    </div>

                    {/* Status & Priority Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Status
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                            >
                                {STATUSES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Priority
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                            >
                                {PRIORITIES.map((p) => (
                                    <option key={p.value} value={p.value}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Assignee & Due Date Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Assigned Telecaller
                            </label>
                            <div className="relative">
                                <select
                                    value={assignedTo}
                                    onChange={(e) => setAssignedTo(e.target.value)}
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                                >
                                    <option value="">Unassigned</option>
                                    {salesAgents.map((agent) => (
                                        <option key={agent.id} value={agent.id}>
                                            {agent.name} {agent.role === 'admin' ? '(Admin)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Due Date & Time
                            </label>
                            <input
                                type="datetime-local"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                            />
                        </div>
                    </div>

                    {/* Notes / Description */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Notes / Context
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Add any specific context or instructions for this task..."
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 resize-none font-medium"
                        />
                    </div>

                    {/* Actions Footer */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            disabled={loading || deleting}
                            onClick={handleDelete}
                            className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                            title="Delete this task"
                        >
                            {deleting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Delete Task</span>
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || deleting}
                                className="px-5 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {loading ? (
                                    <span>Saving…</span>
                                ) : (
                                    <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Save Changes</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
