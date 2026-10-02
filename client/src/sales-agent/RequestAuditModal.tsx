import { useState, type FormEvent } from 'react';
import {
    BarChart3,
    X,
    Send,
    Clock,
    AlertCircle,
    Globe,
    Phone
} from 'lucide-react';
import { requestSalesAuditFromAdmin } from './salesApi';

interface RequestAuditModalProps {
    isOpen: boolean;
    leadId: string;
    leadName: string;
    leadWebsite?: string;
    leadPhone?: string;
    onClose: () => void;
    onSuccess?: (msg?: string) => void;
}

export default function RequestAuditModal({
    isOpen,
    leadId,
    leadName,
    leadWebsite,
    leadPhone,
    onClose,
    onSuccess
}: RequestAuditModalProps) {
    const [title, setTitle] = useState(`Full Growth Audit for ${leadName || 'Lead'}`);
    const [priority, setPriority] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const setQuickDueDate = (daysFromNow: number) => {
        const d = new Date();
        d.setDate(d.getDate() + daysFromNow);
        d.setHours(17, 0, 0, 0);
        setDueDate(d.toISOString().slice(0, 16));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Please enter an audit request title.');
            return;
        }

        setBusy(true);
        setError('');
        try {
            const res = await requestSalesAuditFromAdmin(leadId, {
                title: title.trim(),
                notes: notes.trim() || undefined,
                priority: priority || undefined,
                dueDate: dueDate ? new Date(dueDate).toISOString() : null
            });
            onSuccess?.(res.message);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit audit request');
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
                <div className="flex items-start justify-between pb-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-[#0F172A]">Request Growth Audit from Admin</h2>
                            <p className="text-xs text-[#64748B] mt-0.5">
                                Submits request to <strong className="text-indigo-700">Admin & SEO Technical Team</strong>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                        title="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2 shadow-2xs">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Lead Info Banner */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-[#0F172A] text-sm truncate">{leadName}</span>
                            <span className="shrink-0 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                                Full Audit Request
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#64748B] flex-wrap">
                            {leadWebsite && (
                                <a
                                    href={leadWebsite.startsWith('http') ? leadWebsite : `https://${leadWebsite}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
                                >
                                    <Globe className="w-3 h-3 text-indigo-400" />
                                    <span>{leadWebsite.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                </a>
                            )}
                            {leadPhone && (
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    <span>{leadPhone}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Task Title */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Request / Audit Title *
                        </label>
                        <input
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Full Growth Audit for Acme Corp"
                            className="w-full text-xs px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                        />
                    </div>

                    {/* Priority & Target Delivery Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Priority Level <span className="text-[10px] font-normal lowercase text-slate-400">(optional)</span>
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="w-full text-xs px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] font-bold focus:outline-none focus:border-indigo-500"
                            >
                                <option value="">Standard / Default (Optional)</option>
                                <option value="urgent">🔥 Urgent (Same Day / Today)</option>
                                <option value="high">⚡ High Priority (1-2 Days)</option>
                                <option value="medium">Medium Priority</option>
                                <option value="low">Low Priority</option>
                            </select>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-bold uppercase text-[#94A3B8]">
                                    Target Due Date <span className="text-[10px] font-normal lowercase text-slate-400">(optional)</span>
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setQuickDueDate(1)}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                        title="Set due date to tomorrow"
                                    >
                                        +1d
                                    </button>
                                    <span className="text-slate-300">·</span>
                                    <button
                                        type="button"
                                        onClick={() => setQuickDueDate(2)}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                        title="Set due date to 2 days from now"
                                    >
                                        +2d
                                    </button>
                                    {dueDate && (
                                        <>
                                            <span className="text-slate-300">·</span>
                                            <button
                                                type="button"
                                                onClick={() => setDueDate('')}
                                                className="text-[10px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                                                title="Clear due date"
                                            >
                                                Clear
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <input
                                type="datetime-local"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] font-semibold focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Special Instructions / Notes */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                            Client Requirements & Special Notes
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Competitor URLs to compare against, specific GBP issues mentioned by client, target keywords, or customization notes…"
                            className="w-full text-xs p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white text-[#0F172A]"
                        />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
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
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition-all hover:shadow-indigo-500/25 disabled:opacity-50 cursor-pointer"
                        >
                            {busy ? (
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Send className="w-3.5 h-3.5" />
                            )}
                            <span>{busy ? 'Submitting to Admin…' : 'Submit Audit Request'}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
