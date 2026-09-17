import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Check, Users, Sparkles } from 'lucide-react';
import {
    type TaskType,
    type TaskPriority,
    type SalesAgent,
    bulkAssignAdminLeads
} from './adminApi';
import { cn } from '../../shared/utils';

interface BulkAssignTasksModalProps {
    isOpen: boolean;
    leadIds: string[];
    salesAgents: SalesAgent[];
    onClose: () => void;
    onSuccess: (result: { updatedCount: number; createdTasksCount?: number; agentName: string; message: string }) => void;
}

const TASK_PRESETS: Array<{
    type: TaskType;
    label: string;
    icon: string;
    defaultTitle: string;
    defaultPriority: TaskPriority;
}> = [
    { type: 'follow_up_call', label: 'Follow-Up Call', icon: '📞', defaultTitle: 'Follow-up Call with Lead', defaultPriority: 'medium' },
    { type: 'prepare_audit', label: 'Prepare Audit', icon: '📊', defaultTitle: 'Prepare & Review Growth Audit', defaultPriority: 'high' },
    { type: 'send_proposal', label: 'Send Proposal', icon: '📄', defaultTitle: 'Send Service Proposal & Pricing', defaultPriority: 'medium' },
    { type: 'onboard_customer', label: 'Onboard Customer', icon: '🚀', defaultTitle: 'Onboard as New Customer', defaultPriority: 'urgent' },
    { type: 'custom', label: 'Custom Task', icon: '📌', defaultTitle: 'Custom Task', defaultPriority: 'medium' }
];

const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

export default function BulkAssignTasksModal({
    isOpen,
    leadIds,
    salesAgents,
    onClose,
    onSuccess
}: BulkAssignTasksModalProps) {
    const [assignedTo, setAssignedTo] = useState<string>('');
    const [createTask, setCreateTask] = useState<boolean>(true);
    const [taskType, setTaskType] = useState<TaskType>('follow_up_call');
    const [taskTitle, setTaskTitle] = useState('Follow-up Call with Lead');
    const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
    const [taskDueDate, setTaskDueDate] = useState<string>('');
    const [taskNotes, setTaskNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setLoading(false);
            if (!assignedTo && salesAgents.length > 0) {
                setAssignedTo(salesAgents[0].id);
            }
        }
    }, [isOpen, salesAgents]);

    if (!isOpen || !leadIds.length) return null;

    const handleSelectPreset = (preset: typeof TASK_PRESETS[0]) => {
        setTaskType(preset.type);
        if (preset.defaultTitle) {
            setTaskTitle(preset.defaultTitle);
        }
        setTaskPriority(preset.defaultPriority);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (createTask && !taskTitle.trim()) {
            setError('Please enter a task title, or uncheck "Create follow-up task".');
            return;
        }

        setLoading(true);
        try {
            const taskPayload = createTask && taskTitle.trim() ? {
                title: taskTitle.trim(),
                taskType,
                priority: taskPriority,
                dueDate: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
                notes: taskNotes.trim() || undefined
            } : undefined;

            const res = await bulkAssignAdminLeads(
                leadIds,
                assignedTo || null,
                taskPayload
            );

            onSuccess(res);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to bulk assign leads');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-linear-to-r from-amber-500/10 via-amber-500/5 to-transparent">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-700 font-bold">
                            <Users className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Bulk Assign Leads
                            </h2>
                            <p className="text-xs text-slate-500 font-medium">
                                Assign <span className="font-bold text-amber-700">{leadIds.length}</span> selected lead{leadIds.length > 1 ? 's' : ''} to a telecaller
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Telecaller Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Assign to Telecaller / Agent <span className="text-rose-500">*</span>
                        </label>
                        <select
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-amber-500 font-medium"
                        >
                            <option value="">Unassigned (Remove Assignee)</option>
                            {salesAgents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                    {agent.name} {agent.platform_role === 'admin' ? '(Admin)' : ''} ({agent.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Create Task Toggle */}
                    <div className="pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={createTask}
                                onChange={(e) => setCreateTask(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800">
                                    Also create follow-up task for all selected leads
                                </span>
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            </div>
                        </label>
                    </div>

                    {createTask && (
                        <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 animate-in fade-in-50 duration-200">
                            {/* Task Presets */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                                    Quick Task Presets
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                    {TASK_PRESETS.map((preset) => {
                                        const isSelected = taskType === preset.type;
                                        return (
                                            <button
                                                key={preset.type}
                                                type="button"
                                                onClick={() => handleSelectPreset(preset)}
                                                className={cn(
                                                    'px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all text-left',
                                                    isSelected
                                                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-2xs font-bold'
                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                                )}
                                            >
                                                <span>{preset.icon}</span>
                                                <span className="truncate">{preset.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Task Title */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Task Title <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={taskTitle}
                                    onChange={(e) => setTaskTitle(e.target.value)}
                                    placeholder="e.g., Initial Discovery Call"
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                                />
                            </div>

                            {/* Priority & Due Date Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                        Priority
                                    </label>
                                    <div className="grid grid-cols-4 gap-1">
                                        {PRIORITIES.map((p) => {
                                            const isSelected = taskPriority === p.value;
                                            return (
                                                <button
                                                    key={p.value}
                                                    type="button"
                                                    onClick={() => setTaskPriority(p.value)}
                                                    className={cn(
                                                        'py-1.5 text-[11px] font-bold rounded-lg border text-center transition-all',
                                                        isSelected
                                                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                                    )}
                                                >
                                                    {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                        Due Date & Time (Optional)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="datetime-local"
                                            value={taskDueDate}
                                            onChange={(e) => setTaskDueDate(e.target.value)}
                                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Notes / Instructions */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                    Notes / Instructions for Telecaller
                                </label>
                                <textarea
                                    value={taskNotes}
                                    onChange={(e) => setTaskNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Add any specific context or guidance for this task..."
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 resize-none font-medium placeholder:text-slate-400"
                                />
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <span className="w-3.5 h-3.5 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
                                    <span>Assigning...</span>
                                </>
                            ) : (
                                <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>
                                        {createTask ? `Assign & Create Tasks (${leadIds.length})` : `Assign (${leadIds.length}) Leads`}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
