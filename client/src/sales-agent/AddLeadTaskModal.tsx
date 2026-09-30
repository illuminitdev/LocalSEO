import { useState, type FormEvent } from 'react';
import { Bell, X, Send, Clock, AlertCircle, Phone, FileText, UserPlus } from 'lucide-react';
import { createSalesTask, type SalesTaskPriority, type SalesTaskType } from './salesApi';
import { cn } from '../shared/utils';

interface AddLeadTaskModalProps {
    isOpen: boolean;
    leadId: string;
    leadName: string;
    onClose: () => void;
    onSuccess?: () => void;
}

const TASK_PRESETS: Array<{
    id: string;
    type: SalesTaskType;
    label: string;
    icon: any;
    defaultTitle: string;
}> = [
    { id: 'initial_call', type: 'follow_up_call', label: 'Initial Call', icon: Phone, defaultTitle: 'Initial Call' },
    { id: 'follow_up_call', type: 'follow_up_call', label: 'Follow-Up Call', icon: Phone, defaultTitle: 'Scheduled Follow-Up Call' },
    { id: 'send_proposal', type: 'send_proposal', label: 'Send Proposal', icon: FileText, defaultTitle: 'Send Pricing & Proposal' },
    { id: 'onboard_customer', type: 'onboard_customer', label: 'Onboard Customer', icon: UserPlus, defaultTitle: 'Onboard as Active Customer' },
    { id: 'custom', type: 'custom', label: 'Self Reminder', icon: Bell, defaultTitle: 'Self Follow-Up Reminder' }
];

export default function AddLeadTaskModal({
    isOpen,
    leadId,
    leadName,
    onClose,
    onSuccess
}: AddLeadTaskModalProps) {
    const [selectedPresetId, setSelectedPresetId] = useState<string>('initial_call');
    const [taskType, setTaskType] = useState<SalesTaskType>('follow_up_call');
    const [title, setTitle] = useState('Initial Call');
    const [priority, setPriority] = useState<SalesTaskPriority>('medium');
    const [dueDate, setDueDate] = useState(() => {
        // Default to tomorrow 11:00 AM
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(11, 0, 0, 0);
        return d.toISOString().slice(0, 16);
    });
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSelectPreset = (preset: typeof TASK_PRESETS[0]) => {
        setSelectedPresetId(preset.id);
        setTaskType(preset.type);
        setTitle(`${preset.defaultTitle} - ${leadName || 'Lead'}`);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Please enter a reminder/task title.');
            return;
        }

        setBusy(true);
        setError('');
        try {
            await createSalesTask({
                lead_id: leadId,
                task_type: taskType,
                title: title.trim(),
                notes: notes.trim() || undefined,
                priority,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                assigned_to_role: 'sales_agent'
            });
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create reminder');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div
                className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 relative animate-in zoom-in-95 duration-150 space-y-5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                            <Bell className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-[#0F172A]">Add Self Reminder / Task</h2>
                            <p className="text-xs text-[#64748B] mt-0.5">
                                For <strong className="text-[#0F172A]">{leadName}</strong>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Task Type Presets */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1.5">
                            Reminder Type
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {TASK_PRESETS.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleSelectPreset(p)}
                                    className={cn(
                                        'px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center gap-1',
                                        selectedPresetId === p.id
                                            ? 'bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-500/20'
                                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                                    )}
                                >
                                    <p.icon className="w-3.5 h-3.5 text-amber-600" />
                                    <span className="text-[10px] leading-tight truncate">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Task Title */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Reminder Title *
                        </label>
                        <input
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Scheduled Follow-Up Call"
                            className="w-full text-xs px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                        />
                    </div>

                    {/* Priority & Due Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Priority
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as SalesTaskPriority)}
                                className="w-full text-xs px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] font-semibold focus:outline-none focus:border-amber-500"
                            >
                                <option value="low">Low Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="high">High Priority</option>
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
                                className="w-full text-xs px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Notes / Agenda
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="What to discuss, client context, objections to address…"
                            className="w-full text-xs p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white"
                        />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="px-4 py-2 text-xs font-bold text-[#64748B] hover:text-[#0F172A] rounded-xl hover:bg-slate-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {busy ? (
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Send className="w-3.5 h-3.5" />
                            )}
                            <span>{busy ? 'Saving…' : 'Save Reminder'}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
