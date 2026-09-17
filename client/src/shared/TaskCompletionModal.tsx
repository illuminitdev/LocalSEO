import { useState, useEffect } from 'react';
import {
    RotateCcw,
    X,
    User,
    Building2,
    Clock,
    XCircle,
    Check,
    FileText,
    StickyNote,
    Loader2
} from 'lucide-react';
import { cn } from './utils';

export type CrmTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface TaskCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (newStatus: CrmTaskStatus, notes?: string) => Promise<void> | void;
    taskTitle: string;
    leadName?: string | null;
    priority?: string | null;
    assignedTo?: string | null;
    currentStatus?: CrmTaskStatus | string;
    initialNotes?: string;
    isCompleting?: boolean;
    loading?: boolean;
}

const QUICK_NOTES: Record<CrmTaskStatus, string[]> = {
    completed: [
        'Audit prepared & emailed',
        'Call completed, positive feedback',
        'Customer onboarded',
        'Contract sent'
    ],
    in_progress: [
        'Working on audit report',
        'Called, left voicemail / awaiting callback',
        'Follow-up in progress'
    ],
    pending: [
        'Scheduled for next follow-up',
        'Reopened task'
    ],
    cancelled: [
        'No longer needed by client',
        'Duplicate lead / task'
    ]
};

export default function TaskCompletionModal({
    isOpen,
    onClose,
    onConfirm,
    taskTitle,
    leadName,
    priority,
    assignedTo,
    currentStatus = 'pending',
    initialNotes = '',
    isCompleting,
    loading = false
}: TaskCompletionModalProps) {
    const [selectedStatus, setSelectedStatus] = useState<CrmTaskStatus>(() => {
        if (currentStatus === 'completed' || currentStatus === 'in_progress' || currentStatus === 'pending' || currentStatus === 'cancelled') {
            return currentStatus;
        }
        return isCompleting ? 'completed' : 'pending';
    });
    const [statusNotes, setStatusNotes] = useState<string>(initialNotes || '');

    useEffect(() => {
        if (isOpen) {
            if (currentStatus === 'completed' || currentStatus === 'in_progress' || currentStatus === 'pending' || currentStatus === 'cancelled') {
                setSelectedStatus(currentStatus);
            } else {
                setSelectedStatus(isCompleting ? 'completed' : 'pending');
            }
            setStatusNotes(initialNotes || '');
        }
    }, [isOpen, currentStatus, initialNotes, isCompleting]);

    if (!isOpen) return null;

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        await onConfirm(selectedStatus, statusNotes.trim());
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div
                className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-4 sm:p-5 relative animate-in zoom-in-95 duration-150 space-y-3.5 max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {}
                <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="pr-6">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                        Update Task Status
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Choose status & optional note visible to Admin and Sales.
                    </p>
                </div>

                {/* Task Context Card - Compact */}
                <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-2.5 sm:p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                            Task
                        </span>
                        {priority && (
                            <span
                                className={cn(
                                    'text-[9px] font-black uppercase px-1.5 py-0.2 rounded',
                                    priority === 'urgent'
                                        ? 'bg-rose-100 text-rose-800'
                                        : priority === 'high'
                                        ? 'bg-amber-100 text-amber-800'
                                        : priority === 'medium'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-200 text-slate-700'
                                )}
                            >
                                {priority}
                            </span>
                        )}
                    </div>

                    <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        {taskTitle}
                    </p>

                    {(leadName || assignedTo) && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap pt-1 border-t border-slate-200/70">
                            {leadName && (
                                <span className="flex items-center gap-1 font-semibold text-slate-800 truncate max-w-[200px]">
                                    <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                    {leadName}
                                </span>
                            )}
                            {assignedTo && (
                                <span className="flex items-center gap-1 font-medium text-slate-600 truncate max-w-[150px]">
                                    <User className="w-3 h-3 text-slate-400 shrink-0" />
                                    {assignedTo}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Status Options */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                        Choose New Status:
                    </label>

                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        {/* Completed */}
                        <button
                            type="button"
                            onClick={() => setSelectedStatus('completed')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all text-left",
                                selectedStatus === 'completed'
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-600/30"
                                    : "bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200"
                            )}
                        >
                            <div className={cn(
                                "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 shadow-2xs",
                                selectedStatus === 'completed' ? "bg-white/20 text-white" : "bg-emerald-200 text-emerald-800"
                            )}>
                                <Check className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                                <div className="leading-tight text-xs font-bold truncate">Completed</div>
                                <div className={cn("text-[9px] font-normal leading-none truncate", selectedStatus === 'completed' ? "text-emerald-100" : "text-emerald-700")}>Finished work</div>
                            </div>
                        </button>

                        {}
                        <button
                            type="button"
                            onClick={() => setSelectedStatus('in_progress')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all text-left",
                                selectedStatus === 'in_progress'
                                    ? "bg-amber-500 text-white border-amber-500 shadow-sm ring-2 ring-amber-500/30"
                                    : "bg-amber-50/60 hover:bg-amber-100/70 text-amber-950 border-amber-200"
                            )}
                        >
                            <div className={cn(
                                "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 shadow-2xs",
                                selectedStatus === 'in_progress' ? "bg-white/20 text-white" : "bg-amber-200 text-amber-800"
                            )}>
                                <Clock className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                                <div className="leading-tight text-xs font-bold truncate">In Progress</div>
                                <div className={cn("text-[9px] font-normal leading-none truncate", selectedStatus === 'in_progress' ? "text-amber-100" : "text-amber-700")}>Work started</div>
                            </div>
                        </button>

                        {}
                        <button
                            type="button"
                            onClick={() => setSelectedStatus('pending')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all text-left",
                                selectedStatus === 'pending'
                                    ? "bg-slate-800 text-white border-slate-800 shadow-sm ring-2 ring-slate-800/30"
                                    : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                            )}
                        >
                            <div className={cn(
                                "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 shadow-2xs",
                                selectedStatus === 'pending' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                            )}>
                                <RotateCcw className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                                <div className="leading-tight text-xs font-bold truncate">Pending</div>
                                <div className={cn("text-[9px] font-normal leading-none truncate", selectedStatus === 'pending' ? "text-slate-200" : "text-slate-500")}>Not started</div>
                            </div>
                        </button>

                        {}
                        <button
                            type="button"
                            onClick={() => setSelectedStatus('cancelled')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition-all text-left",
                                selectedStatus === 'cancelled'
                                    ? "bg-rose-600 text-white border-rose-600 shadow-sm ring-2 ring-rose-600/30"
                                    : "bg-rose-50/60 hover:bg-rose-100/70 text-rose-950 border-rose-200"
                            )}
                        >
                            <div className={cn(
                                "w-5 h-5 rounded-lg flex items-center justify-center shrink-0 shadow-2xs",
                                selectedStatus === 'cancelled' ? "bg-white/20 text-white" : "bg-rose-200 text-rose-800"
                            )}>
                                <XCircle className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                                <div className="leading-tight text-xs font-bold truncate">Cancelled</div>
                                <div className={cn("text-[9px] font-normal leading-none truncate", selectedStatus === 'cancelled' ? "text-rose-100" : "text-rose-700")}>No longer needed</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Status Description / Note Textarea */}
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-slate-400" />
                            Status Description & Work Notes
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">Visible to Admin</span>
                    </label>

                    <textarea
                        value={statusNotes}
                        onChange={(e) => setStatusNotes(e.target.value)}
                        placeholder={`Details for ${selectedStatus.replace('_', ' ')} (outcomes, next steps)...`}
                        rows={2}
                        disabled={loading}
                        className="w-full px-3 py-2 text-xs bg-slate-50/70 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all resize-none font-medium leading-normal"
                    />

                    {/* Quick suggestion tags */}
                    {QUICK_NOTES[selectedStatus] && QUICK_NOTES[selectedStatus].length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="text-[9px] font-bold text-slate-400 mr-0.5 flex items-center gap-0.5">
                                <StickyNote className="w-2.5 h-2.5 text-amber-500" /> Quick notes:
                            </span>
                            {QUICK_NOTES[selectedStatus].map((phrase) => (
                                <button
                                    key={phrase}
                                    type="button"
                                    onClick={() => {
                                        setStatusNotes((prev) => prev ? `${prev}. ${phrase}` : phrase);
                                    }}
                                    className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-600 font-medium border border-slate-200 transition-colors"
                                >
                                    + {phrase}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={loading}
                        className={cn(
                            "px-4 py-2 rounded-xl text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5",
                            selectedStatus === 'completed'
                                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                                : selectedStatus === 'in_progress'
                                ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                                : selectedStatus === 'cancelled'
                                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                                : "bg-slate-900 hover:bg-slate-800 shadow-slate-900/20"
                        )}
                    >
                        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Update Status & Notes</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
