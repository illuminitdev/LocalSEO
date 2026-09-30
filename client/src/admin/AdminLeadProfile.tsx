import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Bot,
    CheckSquare,
    Clock,
    Globe,
    Lightbulb,
    Mail,
    MapPin,
    MessageSquare,
    Pencil,
    Phone,
    Save,
    ShieldCheck,
    Store,
    User,
    X
} from 'lucide-react';
import {
    type AdminLeadCrmDetail,
    type SalesAgent,
    fetchAdminLeadCrm,
    fetchSalesAgents,
    updateAdminCrmLead
} from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { cn } from '../shared/utils';
import { useToast } from '../shared/Toast';
import {
    emailShareStatusHint,
    emailShareStatusLabel,
    emailShareStatusTimeLines
} from '../shared/emailShareStatus';

function formatTimestamp(isoString?: string | null) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString(undefined, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return '';
    }
}

type LeadProfile = AdminLeadCrmDetail['lead'] & {
    createdAt?: string | null;
};

type EditForm = {
    name: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    industry: string;
    notes: string;
    gbpObservation: string;
    aiVisibilityObservation: string;
    leadOpportunity: string;
    opportunityLevel: string;
    spreadsheetStatus1: string;
    spreadsheetStatus2: string;
    spreadsheetStatus3: string;
};

function formFromLead(lead: LeadProfile): EditForm {
    return {
        name: lead.businessName || '',
        phone: lead.phone || '',
        email: lead.email || '',
        website: lead.website || '',
        address: lead.address || '',
        industry: lead.industry || '',
        notes: lead.notes || '',
        gbpObservation: lead.gbpObservation || '',
        aiVisibilityObservation: lead.aiVisibilityObservation || '',
        leadOpportunity: lead.leadOpportunity || '',
        opportunityLevel: lead.opportunityLevel || '',
        spreadsheetStatus1: lead.spreadsheetStatus1 || '',
        spreadsheetStatus2: lead.spreadsheetStatus2 || '',
        spreadsheetStatus3: lead.spreadsheetStatus3 || ''
    };
}

function leadToDrawerRef(lead: LeadProfile): GrowthAuditLeadRef {
    return {
        id: lead.id,
        businessName: lead.businessName || null,
        name: lead.businessName || null,
        status: lead.status || null,
        industry: lead.industry || null,
        service: lead.industry || null,
        serviceLabel: lead.industry || null,
        address: lead.address || null,
        city: lead.city || null,
        website: lead.website || null,
        email: lead.email || null,
        phone: lead.phone || null,
        source: lead.source || null,
        gbpObservation: lead.gbpObservation || null,
        aiVisibilityObservation: lead.aiVisibilityObservation || null,
        leadOpportunity: lead.leadOpportunity || null,
        opportunityLevel: lead.opportunityLevel || null,
        isCustomer: lead.isCustomer || null,
        convertedAt: lead.convertedAt || null,
        scoreTotal: lead.scoreTotal ?? null,
        reportUrl: lead.reportUrl || null,
        notes: lead.notes || null,
        spreadsheetStatus: lead.spreadsheetStatus || null,
        assignedTo: lead.assignedTo || null,
        assignedAgentName: lead.assignedAgentName || null
    };
}

export default function AdminLeadProfile() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { show } = useToast();
    const [lead, setLead] = useState<LeadProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<EditForm | null>(null);
    const [assignOpen, setAssignOpen] = useState(false);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);

    const loadLead = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const [data, agents] = await Promise.all([
                fetchAdminLeadCrm(id),
                fetchSalesAgents().catch(() => [] as SalesAgent[])
            ]);
            setLead(data.lead);
            setForm(formFromLead(data.lead));
            setSalesAgents(agents);
        } catch (err: any) {
            setError(err.message || 'Failed to load lead details');
            setLead(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLead();
    }, [loadLead]);

    useEffect(() => {
        if (lead?.observationEmailShareStatus !== 'sent' && lead?.emailShareStatus !== 'sent') return;
        const timer = window.setInterval(() => {
            loadLead();
        }, 8000);
        return () => window.clearInterval(timer);
    }, [lead?.observationEmailShareStatus, lead?.emailShareStatus, loadLead]);

    const handleSave = async () => {
        if (!id || !form) return;
        setSaving(true);
        setError('');
        try {
            await updateAdminCrmLead(id, {
                name: form.name,
                phone: form.phone,
                email: form.email,
                website: form.website,
                address: form.address,
                industry: form.industry,
                notes: form.notes,
                gbpObservation: form.gbpObservation,
                aiVisibilityObservation: form.aiVisibilityObservation,
                leadOpportunity: form.leadOpportunity,
                opportunityLevel: form.opportunityLevel,
                spreadsheetStatus1: form.spreadsheetStatus1,
                spreadsheetStatus2: form.spreadsheetStatus2,
                spreadsheetStatus3: form.spreadsheetStatus3
            } as any);
            show('Lead details saved.');
            setEditing(false);
            await loadLead();
        } catch (err: any) {
            setError(err.message || 'Failed to save lead');
        } finally {
            setSaving(false);
        }
    };

    if (loading && !lead) {
        return (
            <div className="p-12 text-center text-slate-500">
                <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                <p className="text-sm font-semibold">Loading lead details…</p>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="space-y-4 max-w-4xl mx-auto">
                <Link
                    to="/admin/growth-audit-leads"
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Leads
                </Link>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-700">
                    {error || 'Lead not found.'}
                </div>
            </div>
        );
    }

    const bizName = lead.businessName || 'Lead';
    const cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
    const oppLevel = String(lead.opportunityLevel || '').toLowerCase();
    const status1 = String(lead.spreadsheetStatus1 || '').trim();
    const status2 = String(lead.spreadsheetStatus2 || '').trim();
    const status3 = String(lead.spreadsheetStatus3 || '').trim();
    const combinedSheet = String(lead.spreadsheetStatus || '').trim();
    const hasSheetStatuses = Boolean(status1 || status2 || status3 || combinedSheet);
    const conclusion = String(lead.notes || '').trim();
    const crmStatus = String(lead.status || '').trim();
    const showCrmStatus = Boolean(crmStatus && crmStatus.toLowerCase() !== 'new');
    const obsLabel = emailShareStatusLabel(lead.observationEmailShareStatus);
    const auditLabel = emailShareStatusLabel(lead.emailShareStatus);
    const obsTimes = {
        sentAt: lead.observationEmailSentAt,
        openedAt: lead.observationEmailOpenedAt
    };
    const auditTimes = {
        sentAt: lead.emailShareSentAt,
        openedAt: lead.emailShareOpenedAt
    };
    const obsTimeLines = emailShareStatusTimeLines(obsTimes);
    const auditTimeLines = emailShareStatusTimeLines(auditTimes);

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-16">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <Link
                    to="/admin/growth-audit-leads"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 rounded-xl transition-colors shadow-2xs"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Leads
                </Link>
                <div className="flex items-center gap-2 flex-wrap">
                    {obsLabel ? (
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
                                Email: {obsLabel}
                            </span>
                            {obsTimeLines.map((line) => (
                                <span key={line} className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                                    {line}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {auditLabel ? (
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
                                Audit email: {auditLabel}
                            </span>
                            {auditTimeLines.map((line) => (
                                <span key={line} className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                                    {line}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {!editing ? (
                        <button
                            type="button"
                            onClick={() => {
                                setForm(formFromLead(lead));
                                setEditing(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors shadow-2xs"
                        >
                            <Pencil className="w-3.5 h-3.5 text-amber-600" />
                            Edit
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditing(false);
                                    setForm(formFromLead(lead));
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl"
                            >
                                <X className="w-3.5 h-3.5" />
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-xl disabled:opacity-50"
                            >
                                <Save className="w-3.5 h-3.5" />
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={() => setAssignOpen(true)}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors shadow-2xs border',
                            lead.assignedTo || lead.assignedAgentName
                                ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                        )}
                        title={
                            lead.assignedAgentName
                                ? `Assigned to ${lead.assignedAgentName} — click to view / reassign`
                                : 'Assign task to a sales agent'
                        }
                    >
                        <CheckSquare
                            className={cn(
                                'w-3.5 h-3.5',
                                lead.assignedTo || lead.assignedAgentName
                                    ? 'text-indigo-600'
                                    : 'text-amber-600'
                            )}
                        />
                        {lead.assignedTo || lead.assignedAgentName ? (
                            <span className="truncate max-w-[160px]">
                                Assigned
                                {lead.assignedAgentName ? ` · ${lead.assignedAgentName}` : ''}
                            </span>
                        ) : (
                            'Assign task'
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(`/admin/crm/leads/${encodeURIComponent(lead.id)}`)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-xl transition-colors shadow-2xs"
                    >
                        Open in CRM
                    </button>
                </div>
            </div>

            {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {editing && form ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                    <h2 className="text-base font-black text-slate-900">Edit lead details</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(
                            [
                                ['name', 'Business name'],
                                ['phone', 'Phone'],
                                ['email', 'Email'],
                                ['website', 'Website'],
                                ['address', 'Address'],
                                ['industry', 'Industry'],
                                ['opportunityLevel', 'Priority']
                            ] as Array<[keyof EditForm, string]>
                        ).map(([key, label]) => (
                            <label key={key} className="block text-xs space-y-1">
                                <span className="font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                                <input
                                    value={form[key]}
                                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-900"
                                />
                            </label>
                        ))}
                    </div>
                    {(
                        [
                            ['gbpObservation', 'GBP observations'],
                            ['aiVisibilityObservation', 'AI visibility observations'],
                            ['leadOpportunity', 'Lead opportunity / pitch'],
                            ['notes', 'Conclusion & audit notes'],
                            ['spreadsheetStatus1', 'Status 1'],
                            ['spreadsheetStatus2', 'Status 2'],
                            ['spreadsheetStatus3', 'Status 3']
                        ] as Array<[keyof EditForm, string]>
                    ).map(([key, label]) => (
                        <label key={key} className="block text-xs space-y-1">
                            <span className="font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                            <textarea
                                value={form[key]}
                                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                rows={key.startsWith('spreadsheet') ? 2 : 4}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-900"
                            />
                        </label>
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                    <div className="px-5 sm:px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{bizName}</h1>
                            {lead.industry ? (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {lead.industry}
                                </span>
                            ) : null}
                            {lead.source ? (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    {lead.source}
                                </span>
                            ) : null}
                            {showCrmStatus ? (
                                <span
                                    className={cn(
                                        'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border',
                                        crmStatus.includes('convert')
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : crmStatus.includes('progress')
                                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                                              : 'bg-slate-100 text-slate-700 border-slate-200'
                                    )}
                                >
                                    {crmStatus.replace(/_/g, ' ')}
                                </span>
                            ) : null}
                            {lead.isCustomer ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Customer
                                </span>
                            ) : null}
                        </div>
                        <p className="text-xs text-slate-500 mb-3">
                            Lead profile — Excel / form details, observations, status & notes
                        </p>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                            {lead.phone ? (
                                <a
                                    href={`tel:${cleanPhone}`}
                                    className="inline-flex items-center gap-1.5 font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"
                                >
                                    <Phone className="w-3.5 h-3.5 text-amber-600" />
                                    {lead.phone}
                                </a>
                            ) : null}
                            {lead.email ? (
                                <a
                                    href={`mailto:${lead.email}`}
                                    className="inline-flex items-center gap-1.5 font-medium text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                                >
                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                    {lead.email}
                                </a>
                            ) : null}
                            {lead.website ? (
                                <a
                                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-bold text-indigo-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                                >
                                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                                    {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                </a>
                            ) : null}
                        </div>
                    </div>

                    <div className="p-5 sm:p-6 space-y-5 bg-slate-50/50">
                        {(hasSheetStatuses || showCrmStatus || conclusion) && (
                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300/80 text-xs text-amber-950 space-y-2.5">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center">
                                            <Clock className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                                            Status & Notes
                                        </span>
                                    </div>
                                    {lead.updatedAt ? (
                                        <span className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            {formatTimestamp(lead.updatedAt)}
                                        </span>
                                    ) : null}
                                </div>
                                {hasSheetStatuses ? (
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
                                ) : null}
                                {conclusion ? (
                                    <div className="flex items-start gap-2 bg-white/90 p-3 rounded-xl border border-amber-200/80">
                                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-slate-800 font-semibold text-xs leading-relaxed whitespace-pre-wrap">
                                                {conclusion}
                                            </p>
                                            {lead.assignedAgentName ? (
                                                <p className="text-[10px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                                                    <User className="w-3 h-3 text-slate-400" />
                                                    Assigned:{' '}
                                                    <span className="text-slate-800 font-bold">{lead.assignedAgentName}</span>
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {(lead.address || lead.city) && (
                            <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs flex items-center gap-2 text-slate-700">
                                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="font-medium">{lead.address || lead.city}</span>
                            </div>
                        )}

                        {(lead.leadOpportunity || lead.opportunityLevel) && (
                            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border border-emerald-200 text-xs text-emerald-950 space-y-2">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                                            <Lightbulb className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="font-bold text-emerald-900 uppercase tracking-wider text-[11px]">
                                            Lead Opportunity & Sales Pitch
                                        </span>
                                    </div>
                                    {lead.opportunityLevel ? (
                                        <span
                                            className={cn(
                                                'font-black uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full border',
                                                oppLevel === 'high'
                                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                                    : oppLevel === 'low'
                                                      ? 'bg-slate-200 text-slate-700 border-slate-300'
                                                      : 'bg-amber-500 text-white border-amber-600'
                                            )}
                                        >
                                            {lead.opportunityLevel} Opportunity
                                        </span>
                                    ) : null}
                                </div>
                                {lead.leadOpportunity ? (
                                    <p className="text-emerald-900 font-semibold leading-relaxed text-sm pt-1 whitespace-pre-wrap">
                                        {lead.leadOpportunity}
                                    </p>
                                ) : null}
                            </div>
                        )}

                        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                                <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Store className="w-3.5 h-3.5" />
                                </div>
                                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    Google Business Profile (GBP) Observations
                                </h2>
                            </div>
                            {lead.gbpObservation ? (
                                <div className="text-slate-700 text-xs whitespace-pre-line leading-relaxed pl-1 pt-1">
                                    {lead.gbpObservation}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-xs italic pl-1">No GBP observations recorded.</p>
                            )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                                <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Bot className="w-3.5 h-3.5" />
                                </div>
                                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    AI Visibility Observations (Search / Perplexity / Gemini)
                                </h2>
                            </div>
                            {lead.aiVisibilityObservation ? (
                                <div className="text-slate-700 text-xs whitespace-pre-line leading-relaxed pl-1 pt-1">
                                    {lead.aiVisibilityObservation}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-xs italic pl-1">No AI visibility observations recorded.</p>
                            )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                                <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                </div>
                                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    Conclusion & Audit Notes
                                </h2>
                            </div>
                            {conclusion ? (
                                <div className="text-slate-700 text-xs whitespace-pre-line leading-relaxed pl-1 pt-1">
                                    {conclusion}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-xs italic pl-1">No conclusion notes recorded.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {assignOpen && lead ? (
                <LeadCrmDrawer
                    lead={leadToDrawerRef(lead)}
                    salesAgents={salesAgents}
                    onClose={() => setAssignOpen(false)}
                    onTaskUpdated={() => {
                        loadLead();
                    }}
                    onViewDetails={() => setAssignOpen(false)}
                />
            ) : null}
        </div>
    );
}
