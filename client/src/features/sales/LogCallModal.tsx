import { useState, type FormEvent } from 'react';
import { Phone, X, Send } from 'lucide-react';
import { logSalesLeadActivity } from './salesApi';
import { cn } from '../../shared/utils';

export const DISPOSITIONS = [
    { value: 'connected', label: 'Connected', bg: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
    { value: 'callback_requested', label: 'Callback Requested', bg: 'bg-amber-50 border-amber-300 text-amber-800' },
    { value: 'voicemail', label: 'Voicemail', bg: 'bg-blue-50 border-blue-300 text-blue-800' },
    { value: 'not_interested', label: 'Not Interested', bg: 'bg-rose-50 border-rose-300 text-rose-800' },
    { value: 'converted', label: 'Converted 🎉', bg: 'bg-purple-50 border-purple-300 text-purple-800 font-bold' },
    { value: 'other', label: 'Other', bg: 'bg-slate-50 border-slate-300 text-slate-800' }
] as const;

interface LogCallModalProps {
    isOpen: boolean;
    leadId: string;
    leadName: string;
    leadPhone?: string | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function LogCallModal({
    isOpen,
    leadId,
    leadName,
    leadPhone,
    onClose,
    onSuccess
}: LogCallModalProps) {
    const [disposition, setDisposition] = useState<string>('connected');
    const [callNote, setCallNote] = useState('');
    const [nextFollowUp, setNextFollowUp] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!leadId || !callNote.trim()) return;
        setBusy(true);
        setError('');
        try {
            await logSalesLeadActivity(leadId, {
                disposition,
                note: callNote.trim(),
                nextFollowUpAt: nextFollowUp ? new Date(nextFollowUp).toISOString() : null
            });
            setCallNote('');
            setNextFollowUp('');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to log call activity');
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
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#F59E0B]">
                            <Phone className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-[#0F172A]">Log Call & Activity</h2>
                            <p className="text-xs text-[#64748B] mt-0.5">
                                For <strong className="text-[#0F172A]">{leadName}</strong> {leadPhone ? `(${leadPhone})` : ''}
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
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Call Disposition */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1.5">
                            Call Disposition
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {DISPOSITIONS.map((d) => (
                                <button
                                    key={d.value}
                                    type="button"
                                    onClick={() => setDisposition(d.value)}
                                    className={cn(
                                        'px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left truncate',
                                        disposition === d.value
                                            ? `${d.bg} ring-2 ring-[#0F172A]`
                                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                                    )}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Discussion Summary */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Call Notes & Discussion Summary *
                        </label>
                        <textarea
                            required
                            rows={3}
                            value={callNote}
                            onChange={(e) => setCallNote(e.target.value)}
                            placeholder="Summary of what the customer said, objections, next steps…"
                            className="w-full text-xs p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                        />
                    </div>

                    {/* Schedule Follow-Up */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Schedule Next Follow-Up (Auto-creates Self Reminder)
                        </label>
                        <input
                            type="datetime-local"
                            value={nextFollowUp}
                            onChange={(e) => setNextFollowUp(e.target.value)}
                            className="w-full text-xs px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#F59E0B]"
                        />
                    </div>

                    {/* Actions */}
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
                            disabled={busy || !callNote.trim()}
                            className="px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
                        >
                            <Send className="w-3.5 h-3.5" />
                            {busy ? 'Logging…' : 'Log Activity to CRM'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
