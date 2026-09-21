import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Phone,
    Mail,
    Globe,
    Clock,
    CheckCircle2,
    Check,
    Calendar,
    MessageSquare,
    AlertCircle,
    CheckSquare,
    MapPin,
    ArrowUpRight,
    Shield,
    User,
    Bell,
    X,
    History
} from 'lucide-react';
import TaskCompletionModal, { type CrmTaskStatus } from '../shared/TaskCompletionModal';
import LeadStatusHistoryModal from '../admin/LeadStatusHistoryModal';
import {
    type SalesUnifiedLead,
    type SalesLeadTask,
    type SalesLeadActivity,
    type SalesTaskStatus,
    fetchSalesLeadCrm,
    updateSalesTask,
    convertLeadToCustomer,
    confirmAndShareFullAuditEmail,
    emailShareStatusLabel,
    emailShareStatusHint
} from './salesApi';
import { cn } from '../shared/utils';
import {
    Lightbulb,
    Bot,
    Store,
    Award
} from 'lucide-react';

export default function SalesLeadDetail() {
    const { id } = useParams<{ id: string }>();
    const [lead, setLead] = useState<SalesUnifiedLead | null>(null);
    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [activities, setActivities] = useState<SalesLeadActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [converting, setConverting] = useState(false);
    const [selectedHistoryTask, setSelectedHistoryTask] = useState<SalesLeadTask | null>(null);
    const [showLeadHistoryModal, setShowLeadHistoryModal] = useState(false);
    const [sharingAudit, setSharingAudit] = useState(false);

    const loadLead = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const data = await fetchSalesLeadCrm(id);
            setLead(data.lead);
            setTasks(data.tasks || []);
            setActivities(data.activities || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load lead CRM data');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLead();
    }, [loadLead]);

    // While waiting for open, poll so badge turns green without manual refresh
    useEffect(() => {
        if (lead?.emailShareStatus !== 'sent') return;
        const timer = window.setInterval(() => {
            loadLead();
        }, 8000);
        return () => window.clearInterval(timer);
    }, [lead?.emailShareStatus, loadLead]);

    
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: SalesLeadTask } | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    const handleOpenToggleModal = (task: SalesLeadTask) => {
        setConfirmModalTask({ task });
    };

    const handleConfirmToggleStatus = async (chosenStatus?: CrmTaskStatus, statusNotes?: string) => {
        if (!confirmModalTask) return;
        const { task } = confirmModalTask;
        setModalLoading(true);
        setError('');
        try {
            const nextStatus: SalesTaskStatus = (chosenStatus as SalesTaskStatus) || (task.status === 'completed' ? 'pending' : 'completed');
            await updateSalesTask(task.id, {
                status: nextStatus,
                notes: statusNotes !== undefined ? statusNotes : undefined
            });
            const statusLabels: Record<string, string> = {
                completed: 'Task marked as completed! 🎉',
                in_progress: 'Task set to In Progress 🟡',
                pending: 'Task moved to Pending 📋',
                cancelled: 'Task marked as Cancelled ❌'
            };
            setMsg(statusLabels[nextStatus] || 'Task status updated.');
            await loadLead();
            setConfirmModalTask(null);
        } catch (err: any) {
            setError(err.message || 'Failed to update task');
        } finally {
            setModalLoading(false);
        }
    };

    const handleConvertToCustomer = async () => {
        if (!id) return;
        if (!window.confirm(`Convert ${lead?.businessName || 'this lead'} into an active Customer?`)) return;

        setConverting(true);
        setError('');
        try {
            await convertLeadToCustomer(id, 'Converted to Customer from Sales Lead Detail');
            setMsg('🎉 Lead successfully converted to Customer!');
            await loadLead();
        } catch (err: any) {
            setError(err.message || 'Failed to convert lead');
        } finally {
            setConverting(false);
        }
    };

    const handleEmailAuditPdf = async () => {
        const auditId = String(lead?.auditId || '').trim();
        if (!auditId) return;
        setSharingAudit(true);
        setError('');
        setMsg('');
        try {
            const res = await confirmAndShareFullAuditEmail({
                auditId,
                businessName: lead?.businessName,
                email: lead?.email
            });
            if (!res) return;
            setMsg(
                res.attached === false
                    ? `Report emailed to ${res.to} (link only — PDF was too large to attach).`
                    : `Report emailed to ${res.to}.`
            );
            await loadLead();
        } catch (err: any) {
            setError(err.message || 'Could not email audit report');
        } finally {
            setSharingAudit(false);
        }
    };

    if (loading && !lead) {
        return (
            <div className="p-12 text-center text-[#64748B]">
                <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                <p className="text-sm font-semibold">Loading Lead CRM Details…</p>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="space-y-4 max-w-4xl mx-auto">
                <Link to="/sales" className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B] hover:text-[#0F172A]">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
                </Link>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-700">
                    {error || 'Lead not found or no permission.'}
                </div>
            </div>
        );
    }

    const bizName = lead.businessName || 'Lead';

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-300">
            {}
            <div className="flex items-center justify-between">
                <Link
                    to="/sales"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-xs font-bold text-[#475569] rounded-xl transition-colors shadow-2xs"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Dashboard
                </Link>

                <div className="flex items-center gap-2">
                    {lead.isCustomer ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">
                            <Award className="w-4 h-4 text-emerald-600" />
                            Active Customer
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={handleConvertToCustomer}
                            disabled={converting}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{converting ? 'Converting...' : 'Convert to Customer'}</span>
                        </button>
                    )}

                    {lead.reportUrl && (
                        <a
                            href={lead.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-colors shadow-2xs"
                        >
                            <span>View Live SEO Audit</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                    )}
                    {lead.auditId ? (
                        <>
                            {emailShareStatusLabel(lead.emailShareStatus) ? (
                                <span
                                    className={cn(
                                        'inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-xl border',
                                        lead.emailShareStatus === 'opened'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-slate-50 text-slate-600 border-slate-200'
                                    )}
                                    title={emailShareStatusHint(lead.emailShareStatus)}
                                >
                                    {emailShareStatusLabel(lead.emailShareStatus)}
                                </span>
                            ) : null}
                            <button
                                type="button"
                                onClick={handleEmailAuditPdf}
                                disabled={sharingAudit}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors shadow-2xs disabled:opacity-50"
                                title={
                                    lead.email
                                        ? `Email PDF to ${lead.email}`
                                        : 'Email PDF report to business'
                                }
                            >
                                <Mail className={cn('w-3.5 h-3.5', sharingAudit && 'animate-pulse')} />
                                <span>{sharingAudit ? 'Sending…' : 'Email PDF'}</span>
                            </button>
                        </>
                    ) : null}
                </div>
            </div>

            {}
            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{error}</span>
                </div>
            )}
            {msg && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{msg}</span>
                </div>
            )}

            {/* Lead Context Header Card */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <h1 className="text-2xl font-black text-[#0F172A] tracking-tight">{bizName}</h1>
                            {lead.industry && (
                                <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-lg">
                                    {lead.industry}
                                </span>
                            )}
                            {lead.scoreTotal != null && (
                                <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                                    Score: {lead.scoreTotal}/100
                                </span>
                            )}
                            {lead.source && (
                                <span className="bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                                    {lead.source}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-[#64748B]">CRM Lead Profile & Activity History</p>
                    </div>

                    {}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {lead.phone && (
                            <a
                                href={`tel:${lead.phone}`}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#0F172A] hover:text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm"
                            >
                                <Phone className="w-3.5 h-3.5" />
                                Call {lead.phone}
                            </a>
                        )}
                        <Link
                            to={`/sales/calls?leadId=${encodeURIComponent(id || '')}`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm"
                        >
                            <Phone className="w-3.5 h-3.5 text-[#F59E0B]" />
                            Log Call & Activity
                        </Link>
                    </div>
                </div>

                {/* Lead Opportunity & Pitch Angle Banner */}
                {(lead.leadOpportunity || lead.opportunityLevel) && (
                    <div className={cn(
                        "p-3.5 rounded-xl border flex items-start gap-3 text-xs",
                        lead.opportunityLevel === 'high'
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                            : lead.opportunityLevel === 'low'
                              ? "bg-slate-50 border-slate-200 text-slate-700"
                              : "bg-amber-50/80 border-amber-200 text-amber-950"
                    )}>
                        <Lightbulb className={cn(
                            "w-4 h-4 shrink-0 mt-0.5",
                            lead.opportunityLevel === 'high' ? "text-emerald-600" : "text-amber-600"
                        )} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className={cn(
                                    "font-black uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-md",
                                    lead.opportunityLevel === 'high'
                                        ? "bg-emerald-600 text-white"
                                        : "bg-amber-600 text-white"
                                )}>
                                    {lead.opportunityLevel?.toUpperCase() || 'MEDIUM'} OPPORTUNITY
                                </span>
                            </div>
                            <p className="font-semibold text-xs leading-relaxed">
                                {lead.leadOpportunity || 'Ready for audit pitch & booking system outreach.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Current Status & Latest Activity / Remarks Banner */}
                {(() => {
                    const latestAct = activities && activities.length > 0 ? activities[0] : null;
                    const activeNote = (lead as any).salesNotes || (lead as any).notes || latestAct?.note || '';
                    const activeStatus = (lead as any).status || latestAct?.disposition || '';
                    const activeDate = latestAct?.createdAt || (lead as any).updatedAt || (lead as any).createdAt;
                    const activeAuthor = latestAct?.authorName || (lead as any).assignedAgentName;

                    if (!activeStatus && !activeNote) return null;

                    return (
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300/80 text-xs text-amber-950 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                                        <Clock className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                                        Current Status & Sales Notes
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {activeStatus && (
                                        <button
                                            type="button"
                                            onClick={() => setShowLeadHistoryModal(true)}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shadow-2xs cursor-pointer hover:scale-105 transition-all group/badge',
                                                activeStatus.includes('convert') ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' :
                                                activeStatus.includes('progress') ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200' :
                                                'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                                            )}
                                            title="Click to view full lead status history timeline"
                                        >
                                            <span>{activeStatus.replace(/_/g, ' ')}</span>
                                            <History className="w-2.5 h-2.5 opacity-50 group-hover/badge:opacity-100" />
                                        </button>
                                    )}
                                    {activeDate && (
                                        <span className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-slate-400" />
                                            {new Date(activeDate).toLocaleString(undefined, {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {activeNote && (
                                <div className="flex items-start gap-2 bg-white/90 p-3 rounded-xl border border-amber-200/80 mt-1">
                                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-800 font-semibold text-xs leading-relaxed whitespace-pre-wrap">
                                            {activeNote}
                                        </p>
                                        {activeAuthor && (
                                            <p className="text-[10px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                                                <User className="w-3 h-3 text-slate-400" />
                                                Updated by <span className="text-slate-800 font-bold">{activeAuthor}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Contact Attributes Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[#F1F5F9]">
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Phone</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.phone || 'No phone provided'}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Email</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.email || 'No email provided'}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <Globe className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Website</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.website ? (
                                    <a
                                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 hover:underline"
                                    >
                                        {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                    </a>
                                ) : (
                                    'None'
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2.5">
                        <MapPin className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">Location</p>
                            <p className="text-xs font-bold text-[#0F172A] truncate">
                                {lead.address || lead.city || 'Not specified'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Observations Section — always show all three boxes (empty state when no notes) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                        <Store className="w-4 h-4 text-indigo-600" />
                        <span>GBP Observation</span>
                    </div>
                    <div
                        className={cn(
                            'text-xs whitespace-pre-line leading-relaxed p-3.5 rounded-xl border font-sans min-h-[4.5rem]',
                            lead.gbpObservation
                                ? 'text-slate-700 bg-slate-50 border-slate-100'
                                : 'text-slate-400 bg-slate-50/60 border-dashed border-slate-200 italic'
                        )}
                    >
                        {lead.gbpObservation || 'No GBP observation notes yet.'}
                    </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                        <Bot className="w-4 h-4 text-emerald-600" />
                        <span>AI Visibility Observation</span>
                    </div>
                    <div
                        className={cn(
                            'text-xs whitespace-pre-line leading-relaxed p-3.5 rounded-xl border font-sans min-h-[4.5rem]',
                            lead.aiVisibilityObservation
                                ? 'text-slate-700 bg-slate-50 border-slate-100'
                                : 'text-slate-400 bg-slate-50/60 border-dashed border-slate-200 italic'
                        )}
                    >
                        {lead.aiVisibilityObservation || 'No AI visibility notes yet.'}
                    </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2 md:col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                        <MessageSquare className="w-4 h-4 text-amber-600" />
                        <span>Conclusion Takeaway</span>
                    </div>
                    <div
                        className={cn(
                            'text-xs whitespace-pre-line leading-relaxed p-3.5 rounded-xl border font-sans min-h-[4.5rem]',
                            lead.notes
                                ? 'text-slate-700 bg-amber-50/50 border-amber-200/60'
                                : 'text-slate-400 bg-amber-50/30 border-dashed border-amber-200/50 italic'
                        )}
                    >
                        {lead.notes || 'No conclusion takeaway yet.'}
                    </div>
                </div>
            </div>

            {/* Two-Column CRM Workspace: Left = Tasks for this Lead, Right = Unified CRM Activity Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {}
                <div className="lg:col-span-6 space-y-6">
                    {}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-[#F59E0B]" />
                                <h2 className="text-base font-black text-[#0F172A]">Tasks for this Lead</h2>
                                <span className="bg-[#F1F5F9] text-[#475569] text-xs font-bold px-2 py-0.5 rounded-full">
                                    {tasks.length}
                                </span>
                            </div>
                            <Link
                                to={`/sales/reminders?leadId=${encodeURIComponent(id || '')}`}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F172A] hover:text-[#D97706] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-xl transition-colors hover:bg-white shadow-2xs"
                            >
                                <Bell className="w-3.5 h-3.5 text-[#F59E0B]" />
                                <span>+ Add Reminder</span>
                            </Link>
                        </div>

                        {}
                        {!tasks.length ? (
                            <p className="text-xs text-[#94A3B8] text-center py-4">No tasks assigned for this lead yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {tasks.map((t) => {
                                    const isDone = t.status === 'completed';
                                    return (
                                        <li
                                            key={t.id}
                                            className={cn(
                                                'p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors',
                                                isDone ? 'bg-emerald-50/50 border-emerald-300 shadow-xs' : 'bg-white border-[#E2E8F0]'
                                            )}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className={cn('text-xs font-bold', isDone ? 'text-emerald-950 font-bold' : 'text-[#0F172A]')}>
                                                        {t.title}
                                                    </p>
                                                    {t.createdByRole === 'admin' ? (
                                                        <span className="inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                                                            <Shield className="w-2.5 h-2.5 text-purple-600" />
                                                            Admin Assigned
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-100 text-slate-700 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                                                            <User className="w-2.5 h-2.5 text-slate-500" />
                                                            Self Created
                                                        </span>
                                                    )}
                                                </div>
                                                {t.dueDate && (
                                                    <p className={cn("text-[10px] mt-1 flex items-center gap-1", isDone ? "text-emerald-700" : "text-[#94A3B8]")}>
                                                        <Calendar className="w-3 h-3" />
                                                        Due: {new Date(t.dueDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                )}
                                            </div>

                                                                         {/* Status Badge & Actions */}
                                            <div className="shrink-0 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedHistoryTask(t)}
                                                    className={cn(
                                                        "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border cursor-pointer hover:shadow-xs hover:scale-105 transition-all group/badge",
                                                        t.status === 'completed' ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100" :
                                                        t.status === 'in_progress' ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100" :
                                                        t.status === 'cancelled' ? "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100" :
                                                        "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                                    )}
                                                    title="Click to view full lead status history timeline"
                                                >
                                                    {t.status === 'completed' && <Check className="w-3 h-3 text-emerald-600" />}
                                                    {t.status === 'in_progress' && <Clock className="w-3 h-3 text-amber-600" />}
                                                    {t.status === 'cancelled' && <X className="w-3 h-3 text-rose-600" />}
                                                    <span className="capitalize">{t.status.replace('_', ' ')}</span>
                                                    <History className="w-2.5 h-2.5 opacity-50 group-hover/badge:opacity-100 shrink-0 ml-0.5" />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenToggleModal(t)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs"
                                                    title="Update Status"
                                                >
                                                    <span>Update Status</span>
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {}
                <div className="lg:col-span-6 space-y-6">
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#F1F5F9]">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-[#F59E0B]" />
                                <h2 className="text-base font-black text-[#0F172A]">Activity Timeline</h2>
                            </div>
                            <Link
                                to={`/sales/calls?leadId=${encodeURIComponent(id || '')}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                            >
                                <Phone className="w-3 h-3 text-[#F59E0B]" />
                                <span>Log Call</span>
                            </Link>
                        </div>

                        {!activities.length ? (
                            <div className="text-center py-8 text-[#94A3B8]">
                                <Clock className="w-6 h-6 mx-auto mb-1 text-[#CBD5E1]" />
                                <p className="text-xs font-semibold">No activity logs recorded yet.</p>
                            </div>
                        ) : (
                            <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
                                {activities.map((act) => {
                                    const isCall = act.activityType === 'call_log';
                                    const isTask = act.activityType === 'task_event';
                                    const isDeleted = isTask && act.note?.toLowerCase().includes('deleted');

                                    return (
                                        <div key={act.id} className="relative pl-4">
                                            {}
                                            <span
                                                className={cn(
                                                    'absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white',
                                                    isCall ? 'bg-[#F59E0B]' : isDeleted ? 'bg-rose-500' : isTask ? 'bg-indigo-500' : 'bg-slate-400'
                                                )}
                                            />
                                            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-xs space-y-1">
                                                <div className="flex items-center justify-between gap-1 flex-wrap">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={cn(
                                                            'font-black uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded',
                                                            isCall ? 'bg-amber-100 text-amber-800' : isDeleted ? 'bg-rose-100 text-rose-800' : isTask ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'
                                                        )}>
                                                            {act.disposition?.replace('_', ' ') || act.activityType}
                                                        </span>
                                                        <span className="font-bold text-slate-800 text-[11px]">
                                                            {act.authorName || act.userName || 'Sales Agent'}
                                                        </span>
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
                                                    <p className="text-slate-600 font-medium whitespace-pre-wrap text-[11px] mt-1">
                                                        {act.note}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {}
            <TaskCompletionModal
                isOpen={!!confirmModalTask}
                onClose={() => setConfirmModalTask(null)}
                onConfirm={handleConfirmToggleStatus}
                taskTitle={confirmModalTask?.task.title || ''}
                leadName={lead?.businessName}
                priority={confirmModalTask?.task.priority}
                currentStatus={confirmModalTask?.task.status}
                initialNotes={confirmModalTask?.task.notes || ''}
                isCompleting={confirmModalTask ? confirmModalTask.task.status !== 'completed' : true}
                loading={modalLoading}
            />

            {/* Lead Status History Modal for Overall Lead Profile */}
            {showLeadHistoryModal && id && (
                <LeadStatusHistoryModal
                    isOpen={showLeadHistoryModal}
                    leadId={id}
                    leadName={lead?.businessName || 'Lead'}
                    currentStatus={(lead as any)?.status || (activities[0]?.disposition) || 'contacted'}
                    initialNote={(lead as any)?.salesNotes || (lead as any)?.notes || activities[0]?.note}
                    initialDate={activities[0]?.createdAt || (lead as any)?.updatedAt || (lead as any)?.createdAt}
                    authorName={activities[0]?.authorName || (lead as any)?.assignedAgentName}
                    readOnly={true}
                    onClose={() => setShowLeadHistoryModal(false)}
                    onStatusUpdated={async () => {
                        await loadLead();
                    }}
                />
            )}

            {/* Lead Status History Modal for Specific Task */}
            {selectedHistoryTask && (
                <LeadStatusHistoryModal
                    isOpen={Boolean(selectedHistoryTask)}
                    leadId={selectedHistoryTask.leadId || id || ''}
                    leadName={selectedHistoryTask.leadBusinessName || lead?.businessName || selectedHistoryTask.title}
                    currentStatus={selectedHistoryTask.status || 'pending'}
                    initialNote={selectedHistoryTask.notes}
                    initialDate={selectedHistoryTask.updatedAt || selectedHistoryTask.createdAt}
                    authorName={(selectedHistoryTask as any).assignedToName || undefined}
                    readOnly={true}
                    onClose={() => setSelectedHistoryTask(null)}
                    onStatusUpdated={async () => {
                        await loadLead();
                    }}
                />
            )}
        </div>
    );
}
