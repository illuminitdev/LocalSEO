import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
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
    X,
    History,
    Pencil,
    Award,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import LeadStatusHistoryModal from './LeadStatusHistoryModal';
import EditTaskModal from './EditTaskModal';
import {
    type LeadTask,
    type LeadActivity,
    type SalesAgent,
    type AdminLeadCrmDetail,
    fetchAdminLeadCrm,
    fetchSalesAgents,
    convertAdminCrmLead,
    shareFullAuditEmail,
    confirmAndShareLeadObservationsEmail,
    updateCrmTask
} from './adminApi';
import { cn } from '../shared/utils';
import { useToast } from '../shared/Toast';
import {
    emailShareStatusLabel,
    emailShareStatusHint,
    emailShareStatusTimeLines
} from '../shared/emailShareStatus';
import TaskCompletionModal, { type CrmTaskStatus } from '../shared/TaskCompletionModal';

export default function AdminLeadDetail() {
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const navFrom = (location.state as { from?: string; fromLabel?: string } | null)?.from;
    const backTo = typeof navFrom === 'string' && navFrom.startsWith('/') ? navFrom : '/admin/tasks';
    const backLabel = (location.state as { fromLabel?: string } | null)?.fromLabel?.trim() || 'CRM';
    const { show } = useToast();
    const [lead, setLead] = useState<AdminLeadCrmDetail['lead'] | null>(null);
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [converting, setConverting] = useState(false);
    const [sharingAudit, setSharingAudit] = useState(false);
    const [sharingObservations, setSharingObservations] = useState(false);
    const [editingTask, setEditingTask] = useState<LeadTask | null>(null);
    const [selectedHistoryTask, setSelectedHistoryTask] = useState<LeadTask | null>(null);
    const [showLeadHistoryModal, setShowLeadHistoryModal] = useState(false);
    const [confirmModalTask, setConfirmModalTask] = useState<{ task: LeadTask } | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [taskPage, setTaskPage] = useState(1);
    const [activityPage, setActivityPage] = useState(1);

    const TASKS_PER_PAGE = 5;
    const ACTIVITIES_PER_PAGE = 5;

    const totalTaskPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
    const totalActivityPages = Math.max(1, Math.ceil(activities.length / ACTIVITIES_PER_PAGE));

    const currentTaskPage = Math.min(taskPage, totalTaskPages);
    const currentActivityPage = Math.min(activityPage, totalActivityPages);

    const paginatedTasks = tasks.slice((currentTaskPage - 1) * TASKS_PER_PAGE, currentTaskPage * TASKS_PER_PAGE);
    const paginatedActivities = activities.slice((currentActivityPage - 1) * ACTIVITIES_PER_PAGE, currentActivityPage * ACTIVITIES_PER_PAGE);

    const loadLead = useCallback(async (silent = false) => {
        if (!id) return;
        if (!silent) setLoading(true);
        setError('');
        try {
            const [data, agents] = await Promise.all([
                fetchAdminLeadCrm(id),
                fetchSalesAgents().catch(() => [] as SalesAgent[])
            ]);
            setLead(data.lead);
            setTasks(data.tasks || []);
            setActivities(data.activities || []);
            setSalesAgents(agents);
        } catch (err: any) {
            if (!silent) {
                setError(err.message || 'Failed to load lead CRM data');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLead();
    }, [loadLead]);

    // Scroll to tasks section if opened with hash #tasks or state scrollTo: 'tasks'
    useEffect(() => {
        if (location.hash === '#tasks' || (location.state as any)?.scrollTo === 'tasks') {
            const timer = setTimeout(() => {
                const el = document.getElementById('tasks-section');
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 250);
            return () => clearTimeout(timer);
        }
    }, [location.hash, location.state]);

    useEffect(() => {
        if (lead?.emailShareStatus !== 'sent' && lead?.observationEmailShareStatus !== 'sent') return;
        const timer = window.setInterval(() => {
            loadLead(true);
        }, 8000);
        return () => window.clearInterval(timer);
    }, [lead?.emailShareStatus, lead?.observationEmailShareStatus, loadLead]);

    const handleConfirmToggleStatus = async (chosenStatus?: CrmTaskStatus, statusNotes?: string) => {
        if (!confirmModalTask) return;
        const { task } = confirmModalTask;
        setModalLoading(true);
        setError('');
        try {
            const nextStatus = chosenStatus || (task.status === 'completed' ? 'pending' : 'completed');
            await updateCrmTask(task.id, {
                status: nextStatus as LeadTask['status'],
                notes: statusNotes !== undefined ? statusNotes : undefined
            });
            show('Task status updated.');
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
            await convertAdminCrmLead(id, 'Converted to Customer from Admin Lead Detail');
            show('Lead successfully converted to Customer.');
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
        const email = String(lead?.email || '').trim();
        if (!email || !email.includes('@')) {
            setError('A valid company email is required to share the report.');
            return;
        }
        if (!window.confirm(`Email the audit report PDF to ${email} for “${lead?.businessName || 'this business'}”?`)) {
            return;
        }
        setSharingAudit(true);
        setError('');
        try {
            const res = await shareFullAuditEmail(auditId, { email });
            show(
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

    const handleEmailObservations = async () => {
        if (!id) return;
        setSharingObservations(true);
        setError('');
        try {
            const res = await confirmAndShareLeadObservationsEmail({
                leadId: id,
                businessName: lead?.businessName,
                email: lead?.email
            });
            if (!res) return;
            show(`Observations emailed to ${res.to}.`);
            await loadLead();
        } catch (err: any) {
            setError(err.message || 'Could not email observations');
        } finally {
            setSharingObservations(false);
        }
    };

    if (loading && !lead) {
        return (
            <div className="p-12 text-center text-slate-500">
                <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                <p className="text-sm font-semibold">Loading Lead CRM Details…</p>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="space-y-4 max-w-4xl mx-auto">
                <Link to={backTo} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to {backLabel}
                </Link>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-700">
                    {error || 'Lead not found.'}
                </div>
            </div>
        );
    }

    const bizName = lead.businessName || 'Lead';
    const shareLabel = emailShareStatusLabel(lead.emailShareStatus);
    const auditTimes = {
        sentAt: lead.emailShareSentAt,
        openedAt: lead.emailShareOpenedAt
    };
    const obsTimes = {
        sentAt: lead.observationEmailSentAt,
        openedAt: lead.observationEmailOpenedAt
    };
    const auditTimeLines = emailShareStatusTimeLines(auditTimes);
    const obsTimeLines = emailShareStatusTimeLines(obsTimes);
    const latestAct = activities.length > 0 ? activities[0] : null;
    const status1 = String(lead.spreadsheetStatus1 || '').trim();
    const status2 = String(lead.spreadsheetStatus2 || '').trim();
    const status3 = String(lead.spreadsheetStatus3 || '').trim();
    const combinedSheet = String(lead.spreadsheetStatus || '').trim();
    const hasSheetStatuses = Boolean(status1 || status2 || status3 || combinedSheet);
    const crmStatus = String(lead.status || latestAct?.disposition || '').trim();
    const showCrmPill = Boolean(crmStatus && crmStatus.toLowerCase() !== 'new');
    const activeNote = latestAct?.note || lead.notes || '';
    const activeDate = latestAct?.createdAt || lead.updatedAt || null;
    const activeAuthor = latestAct?.authorName || lead.assignedAgentName || null;
    const taskNotes = tasks.filter((t) => String(t.notes || '').trim());

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-16">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        to={backTo}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 rounded-xl transition-colors shadow-2xs"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back to {backLabel}
                    </Link>
                    {id ? (
                        <Link
                            to={`/admin/leads/${encodeURIComponent(id)}`}
                            state={location.state}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold text-indigo-700 rounded-xl transition-colors shadow-2xs"
                        >
                            Lead profile
                        </Link>
                    ) : null}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
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
                            <span>View Audit</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                    )}

                    {emailShareStatusLabel(lead.observationEmailShareStatus) ? (
                        <div className="flex flex-col items-end gap-0.5">
                            <span
                                className={cn(
                                    'inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-xl border',
                                    lead.observationEmailShareStatus === 'opened'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                )}
                                title={emailShareStatusHint(lead.observationEmailShareStatus, obsTimes)}
                            >
                                Email: {emailShareStatusLabel(lead.observationEmailShareStatus)}
                            </span>
                            {obsTimeLines.map((line) => (
                                <span key={line} className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                                    {line}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleEmailObservations}
                        disabled={
                            sharingObservations ||
                            !(
                                String(lead.gbpObservation || '').trim() ||
                                String(lead.aiVisibilityObservation || '').trim()
                            )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-colors shadow-2xs disabled:opacity-50"
                        title={
                            !(
                                String(lead.gbpObservation || '').trim() ||
                                String(lead.aiVisibilityObservation || '').trim()
                            )
                                ? 'Add GBP or AI visibility observations before emailing'
                                : lead.email
                                  ? `Email observations to ${lead.email}`
                                  : 'Email GBP & AI visibility observations'
                        }
                    >
                        <Mail className={cn('w-3.5 h-3.5', sharingObservations && 'animate-pulse')} />
                        <span>{sharingObservations ? 'Sending…' : 'Email'}</span>
                    </button>

                    {lead.auditId ? (
                        <>
                            {shareLabel ? (
                                <div className="flex flex-col items-end gap-0.5">
                                    <span
                                        className={cn(
                                            'inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-xl border',
                                            lead.emailShareStatus === 'opened'
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-slate-50 text-slate-600 border-slate-200'
                                        )}
                                        title={emailShareStatusHint(lead.emailShareStatus, auditTimes)}
                                    >
                                        PDF: {shareLabel}
                                    </span>
                                    {auditTimeLines.map((line) => (
                                        <span key={line} className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                                            {line}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            <button
                                type="button"
                                onClick={handleEmailAuditPdf}
                                disabled={sharingAudit}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 text-xs font-bold rounded-xl transition-colors shadow-2xs disabled:opacity-50"
                            >
                                <Mail className={cn('w-3.5 h-3.5', sharingAudit && 'animate-pulse')} />
                                <span>{sharingAudit ? 'Sending…' : 'Email PDF'}</span>
                            </button>
                        </>
                    ) : null}
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{error}</span>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{bizName}</h1>
                            {lead.industry && (
                                <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-lg">
                                    {lead.industry}
                                </span>
                            )}
                            {lead.scoreTotal != null && (
                                <span className="bg-amber-500 text-white text-xs font-black px-2.5 py-0.5 rounded-lg">
                                    Score: {lead.scoreTotal}/100
                                </span>
                            )}
                            {lead.source && (
                                <span className="bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                                    {lead.source}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500">Admin CRM — status, notes, tasks & email tracking</p>
                    </div>

                    {lead.phone && (
                        <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs rounded-xl transition-colors shadow-sm"
                        >
                            <Phone className="w-3.5 h-3.5" />
                            Call {lead.phone}
                        </a>
                    )}
                </div>

                {(hasSheetStatuses || showCrmPill || activeNote || taskNotes.length > 0) && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300/80 text-xs text-amber-950 space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                                    <Clock className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                                    Current Status & Telecaller Notes
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {showCrmPill && (
                                    <button
                                        type="button"
                                        onClick={() => setShowLeadHistoryModal(true)}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shadow-2xs cursor-pointer hover:scale-105 transition-all group/badge',
                                            crmStatus.includes('convert')
                                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                : crmStatus.includes('progress')
                                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                                  : 'bg-white text-slate-800 border-slate-300'
                                        )}
                                    >
                                        <span>{crmStatus.replace(/_/g, ' ')}</span>
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
                                            minute: '2-digit'
                                        })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {hasSheetStatuses && (
                            <ul className="space-y-1.5 text-xs text-slate-800 font-semibold leading-relaxed list-none pl-0">
                                {status1 ? (
                                    <li>
                                        <span className="text-slate-500 font-bold">Status 1:</span> {status1}
                                    </li>
                                ) : null}
                                {status2 ? (
                                    <li>
                                        <span className="text-slate-500 font-bold">Status 2:</span>{' '}
                                        <span className="whitespace-pre-wrap font-medium">{status2}</span>
                                    </li>
                                ) : null}
                                {status3 ? (
                                    <li>
                                        <span className="text-slate-500 font-bold">Status 3:</span>{' '}
                                        <span className="whitespace-pre-wrap font-medium">{status3}</span>
                                    </li>
                                ) : null}
                                {!status1 && !status2 && !status3 && combinedSheet ? (
                                    <li className="whitespace-pre-wrap font-medium">{combinedSheet}</li>
                                ) : null}
                            </ul>
                        )}

                        {activeNote && (
                            <div className="flex items-start gap-2 bg-white/90 p-3 rounded-xl border border-amber-200/80">
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

                        {taskNotes.length > 0 && (
                            <div className="space-y-2 pt-1">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Task notes & updates
                                </p>
                                {taskNotes.map((t) => (
                                    <div
                                        key={t.id}
                                        className="flex items-start gap-2 bg-white/90 p-3 rounded-xl border border-slate-200"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-bold text-slate-700 mb-0.5">{t.title}</p>
                                            <p className="text-xs text-slate-700 whitespace-pre-wrap">{t.notes}</p>
                                            <p className="text-[10px] text-slate-400 mt-1 capitalize">
                                                {t.status.replace('_', ' ')}
                                                {t.updatedAt
                                                    ? ` · ${new Date(t.updatedAt).toLocaleString()}`
                                                    : ''}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Phone</p>
                            <p className="text-xs font-bold text-slate-900 truncate">{lead.phone || '—'}</p>
                        </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Email</p>
                            <p className="text-xs font-bold text-slate-900 truncate">{lead.email || '—'}</p>
                        </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                        <Globe className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Website</p>
                            <p className="text-xs font-bold text-slate-900 truncate">
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
                                    '—'
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                        <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Location</p>
                            <p className="text-xs font-bold text-slate-900 truncate">
                                {lead.address || lead.city || '—'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-6 space-y-6">
                    <div id="tasks-section" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs scroll-mt-6">
                        <div className="flex items-center gap-2 mb-4">
                            <CheckSquare className="w-4 h-4 text-amber-500" />
                            <h2 className="text-base font-black text-slate-900">Tasks for this Lead</h2>
                            {(() => {
                                const activeCount = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;
                                if (activeCount > 0) {
                                    return (
                                        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black px-2 py-0.5 rounded-full shadow-2xs tracking-tight">
                                            +{activeCount}
                                        </span>
                                    );
                                }
                                if (tasks.length > 0) {
                                    return (
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                                            All Done
                                        </span>
                                    );
                                }
                                return null;
                            })()}
                        </div>

                        {!tasks.length ? (
                            <p className="text-xs text-slate-400 text-center py-4">No tasks assigned for this lead yet.</p>
                        ) : (
                            <>
                                <ul className="space-y-2">
                                    {paginatedTasks.map((t) => {
                                        const isDone = t.status === 'completed';
                                        return (
                                            <li
                                                key={t.id}
                                                className={cn(
                                                    'p-3 rounded-xl border space-y-2',
                                                    isDone ? 'bg-emerald-50/50 border-emerald-300' : 'bg-white border-slate-200'
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <p className={cn('text-xs font-bold', isDone ? 'text-emerald-950' : 'text-slate-900')}>
                                                                {t.title}
                                                            </p>
                                                            {t.createdByRole === 'admin' ? (
                                                                <span className="inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                                                    <Shield className="w-2.5 h-2.5" />
                                                                    Admin
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                                                    <User className="w-2.5 h-2.5" />
                                                                    Agent
                                                                </span>
                                                            )}
                                                        </div>
                                                        {t.dueDate && (
                                                            <p className="text-[10px] mt-1 flex items-center gap-1 text-slate-400">
                                                                <Calendar className="w-3 h-3" />
                                                                Due: {new Date(t.dueDate).toLocaleString(undefined, { month: 'short', day: 'numeric' })}
                                                            </p>
                                                        )}
                                                        {t.notes && (
                                                            <p className="text-[11px] text-slate-600 mt-1.5 whitespace-pre-wrap flex items-start gap-1.5">
                                                                <MessageSquare className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                                                                <span>{t.notes}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedHistoryTask(t)}
                                                            className={cn(
                                                                'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border cursor-pointer',
                                                                t.status === 'completed'
                                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                                    : t.status === 'in_progress'
                                                                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                                                                      : t.status === 'cancelled'
                                                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                                            )}
                                                        >
                                                            {t.status === 'completed' && <Check className="w-3 h-3" />}
                                                            {t.status === 'in_progress' && <Clock className="w-3 h-3" />}
                                                            {t.status === 'cancelled' && <X className="w-3 h-3" />}
                                                            <span className="capitalize">{t.status.replace('_', ' ')}</span>
                                                            <History className="w-2.5 h-2.5 opacity-50" />
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingTask(t)}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-amber-50"
                                                            >
                                                                <Pencil className="w-3 h-3 text-amber-600" />
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmModalTask({ task: t })}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-white"
                                                            >
                                                                Update
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {totalTaskPages > 1 && (
                                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500">
                                        <span className="text-[11px] font-medium text-slate-500">
                                            Showing <span className="font-bold text-slate-700">{(currentTaskPage - 1) * TASKS_PER_PAGE + 1}</span>-
                                            <span className="font-bold text-slate-700">{Math.min(currentTaskPage * TASKS_PER_PAGE, tasks.length)}</span> of{' '}
                                            <span className="font-bold text-slate-700">{tasks.length}</span>
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                disabled={currentTaskPage <= 1}
                                                onClick={() => setTaskPage((p) => Math.max(1, p - 1))}
                                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                aria-label="Previous page of tasks"
                                            >
                                                <ChevronLeft className="w-3.5 h-3.5" />
                                            </button>
                                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                                {currentTaskPage} / {totalTaskPages}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={currentTaskPage >= totalTaskPages}
                                                onClick={() => setTaskPage((p) => Math.min(totalTaskPages, p + 1))}
                                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                aria-label="Next page of tasks"
                                            >
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-6 space-y-6">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                            <MessageSquare className="w-4 h-4 text-amber-500" />
                            <h2 className="text-base font-black text-slate-900">Activity Timeline</h2>
                        </div>

                        {!activities.length ? (
                            <div className="text-center py-8 text-slate-400">
                                <Clock className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                                <p className="text-xs font-semibold">No activity logs recorded yet.</p>
                            </div>
                        ) : (
                            <>
                                <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                    {paginatedActivities.map((act) => {
                                        const isCall = act.activityType === 'call_log';
                                        const isTask = act.activityType === 'task_event';
                                        const isDeleted = isTask && act.note?.toLowerCase().includes('deleted');
                                        return (
                                            <div key={act.id} className="relative pl-4">
                                                <span
                                                    className={cn(
                                                        'absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white',
                                                        isCall
                                                            ? 'bg-amber-500'
                                                            : isDeleted
                                                              ? 'bg-rose-500'
                                                              : isTask
                                                                ? 'bg-indigo-500'
                                                                : 'bg-slate-400'
                                                    )}
                                                />
                                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                                                    <div className="flex items-center justify-between gap-1 flex-wrap">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span
                                                                className={cn(
                                                                    'font-black uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded',
                                                                    isCall
                                                                        ? 'bg-amber-100 text-amber-800'
                                                                        : isDeleted
                                                                          ? 'bg-rose-100 text-rose-800'
                                                                          : isTask
                                                                            ? 'bg-indigo-100 text-indigo-800'
                                                                            : 'bg-slate-200 text-slate-700'
                                                                )}
                                                            >
                                                                {act.disposition?.replace('_', ' ') || act.activityType}
                                                            </span>
                                                            <span className="font-bold text-slate-800 text-[11px]">
                                                                {act.authorName || act.userName || 'Agent'}
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
                                {totalActivityPages > 1 && (
                                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500">
                                        <span className="text-[11px] font-medium text-slate-500">
                                            Showing <span className="font-bold text-slate-700">{(currentActivityPage - 1) * ACTIVITIES_PER_PAGE + 1}</span>-
                                            <span className="font-bold text-slate-700">{Math.min(currentActivityPage * ACTIVITIES_PER_PAGE, activities.length)}</span> of{' '}
                                            <span className="font-bold text-slate-700">{activities.length}</span>
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                disabled={currentActivityPage <= 1}
                                                onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                aria-label="Previous page of activities"
                                            >
                                                <ChevronLeft className="w-3.5 h-3.5" />
                                            </button>
                                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                                {currentActivityPage} / {totalActivityPages}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={currentActivityPage >= totalActivityPages}
                                                onClick={() => setActivityPage((p) => Math.min(totalActivityPages, p + 1))}
                                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                aria-label="Next page of activities"
                                            >
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

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

            {editingTask && (
                <EditTaskModal
                    isOpen={Boolean(editingTask)}
                    task={editingTask}
                    salesAgents={salesAgents}
                    onClose={() => setEditingTask(null)}
                    onSuccess={() => {
                        setEditingTask(null);
                        loadLead();
                    }}
                    onDeleted={() => {
                        setEditingTask(null);
                        loadLead();
                    }}
                />
            )}

            {showLeadHistoryModal && id && (
                <LeadStatusHistoryModal
                    isOpen={showLeadHistoryModal}
                    leadId={id}
                    leadName={lead?.businessName || 'Lead'}
                    currentStatus={lead?.status || activities[0]?.disposition || 'contacted'}
                    initialNote={lead?.notes || activities[0]?.note}
                    initialDate={activities[0]?.createdAt || lead?.updatedAt || undefined}
                    authorName={activities[0]?.authorName || lead?.assignedAgentName || undefined}
                    readOnly={true}
                    onClose={() => setShowLeadHistoryModal(false)}
                    onStatusUpdated={async () => {
                        await loadLead();
                    }}
                />
            )}

            {selectedHistoryTask && (
                <LeadStatusHistoryModal
                    isOpen={Boolean(selectedHistoryTask)}
                    leadId={selectedHistoryTask.leadId || id || ''}
                    leadName={selectedHistoryTask.leadBusinessName || lead?.businessName || selectedHistoryTask.title}
                    currentStatus={selectedHistoryTask.status || 'pending'}
                    initialNote={selectedHistoryTask.notes}
                    initialDate={selectedHistoryTask.updatedAt || selectedHistoryTask.createdAt}
                    authorName={selectedHistoryTask.assignedToName || undefined}
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
