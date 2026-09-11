import {
    RotateCcw,
    X,
    User,
    Building2,
    Clock,
    XCircle,
    Check
} from 'lucide-react';
import { cn } from './utils';

export type CrmTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface TaskCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (newStatus?: CrmTaskStatus) => Promise<void> | void;
    taskTitle: string;
    leadName?: string | null;
    priority?: string | null;
    assignedTo?: string | null;
    currentStatus?: CrmTaskStatus | string;
    isCompleting?: boolean; // backwards compatibility fallback
    loading?: boolean;
}

export default function TaskCompletionModal({
    isOpen,
    onClose,
    onConfirm,
    taskTitle,
    leadName,
    priority,
    assignedTo,
    currentStatus = 'pending',
    loading = false
}: TaskCompletionModalProps) {
    if (!isOpen) return null;

    const handleSelectStatus = async (status: CrmTaskStatus) => {
        await onConfirm(status);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div
                className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 relative animate-in zoom-in-95 duration-150 space-y-5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header Title */}
                <div>
                    <h3 className="text-lg font-bold text-slate-900">
                        Update Task Status
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Select the new status for this task to update across Admin and Sales.
                    </p>
                </div>

                {/* Task Preview Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Task
                        </span>
                        {priority && (
                            <span
                                className={cn(
                                    'text-[10px] font-bold uppercase px-2 py-0.5 rounded-md',
                                    priority === 'urgent'
                                        ? 'bg-rose-100 text-rose-800'
                                        : priority === 'high'
                                        ? 'bg-amber-100 text-amber-800'
                                        : priority === 'medium'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-700'
                                    )}
                            >
                                {priority}
                            </span>
                        )}
                    </div>

                    <p className="text-sm font-semibold text-slate-900 leading-snug">
                        {taskTitle}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap pt-1.5 border-t border-slate-200/60">
                        {leadName && (
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {leadName}
                            </span>
                        )}
                        {assignedTo && (
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                {assignedTo}
                            </span>
                        )}
                    </div>
                </div>

                {/* 4 Status Choice Buttons */}
                <div className="space-y-2 pt-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Choose New Status:
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                        {/* Completed */}
                        <button
                            type="button"
                            onClick={() => handleSelectStatus('completed')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                                currentStatus === 'completed'
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                    : "bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 border-emerald-200 hover:border-emerald-300"
                            )}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                currentStatus === 'completed' ? "bg-white/20 text-white" : "bg-emerald-200 text-emerald-800"
                            )}>
                                <Check className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <div className="leading-none">Completed</div>
                                <div className={cn("text-[10px] mt-0.5 font-normal", currentStatus === 'completed' ? "text-emerald-100" : "text-emerald-700")}>Finished work</div>
                            </div>
                        </button>

                        {/* In Progress */}
                        <button
                            type="button"
                            onClick={() => handleSelectStatus('in_progress')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                                currentStatus === 'in_progress'
                                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                    : "bg-amber-50/70 hover:bg-amber-100 text-amber-900 border-amber-200 hover:border-amber-300"
                            )}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                currentStatus === 'in_progress' ? "bg-white/20 text-white" : "bg-amber-200 text-amber-800"
                            )}>
                                <Clock className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <div className="leading-none">In Progress</div>
                                <div className={cn("text-[10px] mt-0.5 font-normal", currentStatus === 'in_progress' ? "text-amber-100" : "text-amber-700")}>Work started</div>
                            </div>
                        </button>

                        {/* Pending */}
                        <button
                            type="button"
                            onClick={() => handleSelectStatus('pending')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                                currentStatus === 'pending'
                                    ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                                    : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300"
                            )}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                currentStatus === 'pending' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                            )}>
                                <RotateCcw className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <div className="leading-none">Pending</div>
                                <div className={cn("text-[10px] mt-0.5 font-normal", currentStatus === 'pending' ? "text-slate-200" : "text-slate-500")}>Not started</div>
                            </div>
                        </button>

                        {/* Cancelled */}
                        <button
                            type="button"
                            onClick={() => handleSelectStatus('cancelled')}
                            disabled={loading}
                            className={cn(
                                "flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left",
                                currentStatus === 'cancelled'
                                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                    : "bg-rose-50/70 hover:bg-rose-100 text-rose-900 border-rose-200 hover:border-rose-300"
                            )}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                currentStatus === 'cancelled' ? "bg-white/20 text-white" : "bg-rose-200 text-rose-800"
                            )}>
                                <XCircle className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <div className="leading-none">Cancelled</div>
                                <div className={cn("text-[10px] mt-0.5 font-normal", currentStatus === 'cancelled' ? "text-rose-100" : "text-rose-700")}>No longer needed</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Footer Cancel */}
                <div className="flex items-center justify-end pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
