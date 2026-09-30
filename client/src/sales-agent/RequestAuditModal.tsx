import { useState, type FormEvent } from 'react';
import {
    BarChart3,
    X,
    Send,
    Clock,
    AlertCircle,
    ShieldCheck,
    Globe,
    Phone,
    Calendar,
    Sparkles,
    CheckCircle2
} from 'lucide-react';
import { createSalesTask, type SalesTaskPriority } from './salesApi';
import { cn } from '../shared/utils';

interface RequestAuditModalProps {
    isOpen: boolean;
    leadId: string;
    leadName: string;
    leadWebsite?: string;
    leadPhone?: string;
    onClose: () => void;
    onSuccess?: () => void;
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
    const [priority, setPriority] = useState<SalesTaskPriority>('high');
    const [dueDate, setDueDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 2);
        d.setHours(17, 0, 0, 0);
        return d.toISOString().slice(0, 16);
    });
    const [notes, setNotes] = useState('');
    const [assignedRole, setAssignedRole] = useState<'developer_seo' | 'seo' | 'developer'>('developer_seo');
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
            await createSalesTask({
                lead_id: leadId,
                task_type: 'prepare_audit',
                title: title.trim(),
                notes: notes.trim() || undefined,
                priority,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                assigned_to_role: assignedRole
            });
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit audit request to Admin');
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

                    {/* Assign To Role */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1.5">
                            Assign Technical Team
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { role: 'developer_seo' as const, label: 'Admin & SEO Team', icon: ShieldCheck, badge: 'Recommended' },
                                { role: 'seo' as const, label: 'SEO Specialist', icon: BarChart3 },
                                { role: 'developer' as const, label: 'Technical / Dev', icon: Clock }
                            ].map((item) => (
                                <button
                                    key={item.role}
                                    type="button"
                                    onClick={() => setAssignedRole(item.role)}
                                    className={cn(
                                        'px-2.5 py-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center gap-1 cursor-pointer',
                                        assignedRole === item.role
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-950 ring-2 ring-indigo-500/20 shadow-2xs'
                                            : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                                    )}
                                >
                                    <item.icon className="w-3.5 h-3.5 text-indigo-600" />
                                    <span className="text-[11px] leading-tight font-extrabold">{item.label}</span>
                                    {item.badge && (
                                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100/60 px-1.5 py-0.2 rounded-md">
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Priority & Target Delivery Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase text-[#94A3B8] mb-1">
                                Priority Level
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as SalesTaskPriority)}
                                className="w-full text-xs px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] font-bold focus:outline-none focus:border-indigo-500"
                            >
                                <option value="urgent">🔥 Urgent (Same Day / Today)</option>
                                <option value="high">⚡ High Priority (1-2 Days)</option>
                                <option value="medium">Standard Priority</option>
                                <option value="low">Low Priority</option>
                            </select>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-bold uppercase text-[#94A3B8]">
                                    Target Due Date
                                </label>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setQuickDueDate(1)}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                                    >
                                        +1d
                                    </button>
                                    <span className="text-slate-300">·</span>
                                    <button
                                        type="button"
                                        onClick={() => setQuickDueDate(2)}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                                    >
                                        +2d
                                    </button>
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
