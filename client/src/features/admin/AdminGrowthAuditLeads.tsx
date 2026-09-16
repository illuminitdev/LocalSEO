import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ClipboardList,
    MessageSquare,
    ExternalLink,
    RefreshCw,
    Search,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    FileSpreadsheet,
    Plus,
    Phone,
    Mail,
    Globe,
    Trash2,
    Eye
} from 'lucide-react';
import {
    adminGet,
    fetchSalesAgents,
    type SalesAgent,
    bulkImportAdminCrmLeads,
    createAdminCrmLead,
    deleteAdminExcelLeads,
    deleteAdminCrmLead
} from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import LeadDetailsModal from './LeadDetailsModal';
import ExcelLeadUploadModal from '../sales/ExcelLeadUploadModal';
import AddLeadModal from '../sales/AddLeadModal';
import { cn } from '../../shared/utils';

type ContactFilter = 'any' | 'email' | 'phone' | 'both';
type SourceCategoryFilter = 'all' | 'growth_audit' | 'added';

type AdminLead = GrowthAuditLeadRef & {
    type?: string | null;
    sourceCategory?: 'growth_audit' | 'added';
    status?: string | null;
    name?: string | null;
    service?: string | null;
    serviceLabel?: string | null;
    createdAt: string;
    auditId?: string | null;
    salesNotes?: string | null;
    assignedAgentName?: string | null;
    latestActivity?: {
        type?: string;
        disposition?: string | null;
        note?: string | null;
        authorName?: string | null;
        createdAt?: string;
    } | null;
};

const PAGE_SIZE = 10;

const TYPE_LABELS: Record<string, string> = {
    growth_audit_lead: 'Growth audit',
    growth_audit_quick: 'Growth audit',
    contact: 'Contact',
    audit_intake: 'Start',
    visibility_check: 'Visibility',
    checkout_lead: 'Checkout',
    checkout: 'Checkout',
    added_lead: 'Added Lead',
    excel_import: 'Excel Import',
    manual: 'Manual Lead'
};

function isLeadAdded(lead: AdminLead) {
    return (
        lead.sourceCategory === 'added' ||
        lead.type === 'added_lead' ||
        lead.type === 'excel_import' ||
        lead.type === 'manual' ||
        String(lead.source || '').toLowerCase().includes('excel') ||
        String(lead.source || '').toLowerCase().includes('manual')
    );
}

function typeLabel(type?: string | null) {
    if (!type) return 'Lead';
    return TYPE_LABELS[type] || type;
}

function getDistinctSourceSubtext(type?: string | null, source?: string | null): string | null {
    if (!source) return null;
    const cleanSource = source.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanType = (type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanLabel = typeLabel(type).toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!cleanSource || cleanSource === cleanType || cleanSource === cleanLabel) {
        return null;
    }
    // Also suppress generic labels that replicate the type
    if (cleanSource.includes('growthquick') || cleanSource.includes('excelimport') || cleanSource.includes('checkout') || cleanSource.includes('manual')) {
        return null;
    }
    return source;
}

function statusBadge(status?: string | null) {
    const raw = String(status || '').trim();
    const s = raw.toLowerCase().replace(/-/g, '_');
    if (!s || s === 'new') {
        return { label: 'New', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    if (s.includes('converted')) {
        return { label: 'Converted', className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
    }
    if (s === 'completed' || s.includes('complete')) {
        return { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
    }
    // Check not_interested before interested to avoid false match
    if (s.includes('not_interested') || s.includes('not interested')) {
        return { label: 'Not Interested', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
    if (s.includes('interested')) {
        return { label: 'Interested', className: 'bg-purple-50 text-purple-700 border-purple-200' };
    }
    if (s.includes('in_progress') || s.includes('in progress')) {
        return { label: 'In Progress', className: 'bg-amber-50 text-amber-900 border-amber-300 font-bold' };
    }
    if (s.includes('callback') || s.includes('follow')) {
        return { label: 'Follow Up', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    if (s.includes('contacted') || s.includes('called') || s.includes('connected')) {
        return { label: 'Contacted', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    if (s === 'voicemail') {
        return { label: 'Voicemail', className: 'bg-sky-50 text-sky-700 border-sky-200' };
    }
    if (s.includes('cancelled') || s.includes('canceled')) {
        return { label: 'Cancelled', className: 'bg-rose-50 text-rose-800 border-rose-200' };
    }
    if (s === 'otp_pending') {
        return { label: 'OTP Pending', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    if (s === 'pending') {
        return { label: 'Pending', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    if (s === 'unverified') {
        return { label: 'Unverified', className: 'bg-orange-50 text-orange-800 border-orange-200' };
    }
    if (s === 'submitted') {
        return { label: 'Submitted', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    const label = raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
    return { label, className: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function getCleanSalesNote(lead: AdminLead): string {
    const raw = lead.salesNotes || lead.latestActivity?.note || '';
    if (!raw) return '';
    const note = raw.trim();
    const colonIdx = note.indexOf(': ');
    if (colonIdx !== -1 && (note.startsWith('Task "') || note.startsWith('Note added to task'))) {
        const afterColon = note.substring(colonIdx + 2).trim();
        if (afterColon) return afterColon;
    }
    return note;
}

function displayName(lead: AdminLead) {
    return lead.businessName || lead.name || '—';
}

function fmtDate(value?: string | null) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch {
        return '—';
    }
}

export default function AdminGrowthAuditLeads() {
    const [leads, setLeads] = useState<AdminLead[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);
    const [viewingLeadDetails, setViewingLeadDetails] = useState<GrowthAuditLeadRef | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [draftQuery, setDraftQuery] = useState('');
    const [hasContact, setHasContact] = useState<ContactFilter>('any');
    const [sourceCategory, setSourceCategory] = useState<SourceCategoryFilter>(() => {
        try {
            const saved = localStorage.getItem('localpulse_admin_leads_source_tab');
            if (saved === 'all' || saved === 'growth_audit' || saved === 'added') return saved;
        } catch {}
        return 'all';
    });
    const [page, setPage] = useState(1);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);

    const handleSetSourceCategory = (cat: SourceCategoryFilter) => {
        setSourceCategory(cat);
        try {
            localStorage.setItem('localpulse_admin_leads_source_tab', cat);
        } catch {}
        setPage(1);
    };

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (hasContact !== 'any') params.set('hasContact', hasContact);
        const qs = params.toString();

        Promise.all([
            adminGet(`/api/admin/growth-audit-leads${qs ? `?${qs}` : ''}`),
            fetchSalesAgents().catch(() => [])
        ])
            .then(([data, agents]) => {
                setLeads(data.leads || []);
                setSalesAgents(agents);
                setPage(1);
            })
            .catch((err: Error) => {
                setLeads([]);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, [query, hasContact]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const t = window.setTimeout(() => setQuery(draftQuery), 300);
        return () => window.clearTimeout(t);
    }, [draftQuery]);

    const growthAuditCount = useMemo(
        () => leads.filter((l) => !isLeadAdded(l)).length,
        [leads]
    );
    const addedCount = useMemo(
        () => leads.filter((l) => isLeadAdded(l)).length,
        [leads]
    );

    const filteredLeads = useMemo(() => {
        return leads.filter((lead) => {
            const added = isLeadAdded(lead);
            if (sourceCategory === 'growth_audit') return !added;
            if (sourceCategory === 'added') return added;
            return true;
        });
    }, [leads, sourceCategory]);

    const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageLeads = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filteredLeads.slice(start, start + PAGE_SIZE);
    }, [filteredLeads, safePage]);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const rangeStart = filteredLeads.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, filteredLeads.length);

    const [isDeletingExcel, setIsDeletingExcel] = useState(false);

    const handleDeleteExcelLeads = async () => {
        if (!window.confirm('Are you sure you want to delete all leads imported from Excel/spreadsheets? This action cannot be undone.')) {
            return;
        }
        setIsDeletingExcel(true);
        setError('');
        try {
            await deleteAdminExcelLeads();
            await load();
        } catch (err: any) {
            setError(err.message || 'Failed to delete excel leads');
        } finally {
            setIsDeletingExcel(false);
        }
    };

    const handleDeleteSingleLead = async (leadId: string, leadTitle: string) => {
        if (!window.confirm(`Are you sure you want to delete lead "${leadTitle}"? This will also remove any assigned tasks.`)) {
            return;
        }
        setError('');
        try {
            await deleteAdminCrmLead(leadId);
            await load();
        } catch (err: any) {
            setError(err.message || 'Failed to delete lead');
        }
    };

    const filters: { key: ContactFilter; label: string }[] = [
        { key: 'any', label: 'All' },
        { key: 'email', label: 'Has email' },
        { key: 'phone', label: 'Has phone' },
        { key: 'both', label: 'Both' }
    ];

    return (
        <div className="space-y-3 w-full min-w-0">
            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                {/* Source Category Segmented Bar & Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-4 py-3 bg-slate-50/80 border-b border-[#E2E8F0]">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#64748B] mr-1 hidden sm:inline">Source:</span>

                        <button
                            type="button"
                            onClick={() => handleSetSourceCategory('all')}
                            className={cn(
                                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5',
                                sourceCategory === 'all'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'bg-white text-[#475569] border border-[#E2E8F0] hover:bg-slate-100 hover:text-slate-900'
                            )}
                        >
                            <span>All Leads</span>
                            <span
                                className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px]',
                                    sourceCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                                )}
                            >
                                {leads.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSetSourceCategory('added')}
                            className={cn(
                                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5',
                                sourceCategory === 'added'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-white text-[#475569] border border-[#E2E8F0] hover:bg-indigo-50 hover:text-indigo-800'
                            )}
                        >
                            <span>Added / Uploaded Leads</span>
                            <span
                                className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px]',
                                    sourceCategory === 'added' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                                )}
                            >
                                {addedCount}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSetSourceCategory('growth_audit')}
                            className={cn(
                                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5',
                                sourceCategory === 'growth_audit'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-white text-[#475569] border border-[#E2E8F0] hover:bg-amber-50 hover:text-amber-800'
                            )}
                        >
                            <span>Growth Audit & Funnels</span>
                            <span
                                className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px]',
                                    sourceCategory === 'growth_audit' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'
                                )}
                            >
                                {growthAuditCount}
                            </span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {addedCount > 0 && (
                            <button
                                type="button"
                                disabled={isDeletingExcel}
                                onClick={handleDeleteExcelLeads}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors shadow-2xs"
                                title="Delete all leads uploaded from Excel spreadsheets"
                            >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>{isDeletingExcel ? 'Deleting...' : 'Delete Excel Data'}</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setIsUploadModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Upload Excel</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsAddLeadModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#F59E0B] text-white hover:bg-[#D97706] transition-colors shadow-2xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Lead</span>
                        </button>
                    </div>
                </div>

                <div className="p-3 sm:p-4 border-b border-[#E2E8F0] bg-[#FCFDFE] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1 max-w-md min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                        <input
                            value={draftQuery}
                            onChange={(e) => setDraftQuery(e.target.value)}
                            placeholder="Search name, business, email, phone…"
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25 bg-white"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {filters.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setHasContact(f.key)}
                                className={cn(
                                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                                    hasContact === f.key
                                        ? 'bg-[#0F172A] text-white'
                                        : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
                                )}
                            >
                                {f.label}
                            </button>
                        ))}

                        <button
                            type="button"
                            onClick={load}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                            Refresh
                        </button>
                    </div>
                </div>

                {loading && !filteredLeads.length ? (
                    <p className="p-8 text-center text-sm text-[#64748B]">Loading leads…</p>
                ) : !filteredLeads.length ? (
                    <div className="p-10 text-center">
                        <ClipboardList className="w-8 h-8 text-[#CBD5E1] mx-auto mb-3" />
                        <p className="text-sm text-[#64748B]">No leads in this category</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            {sourceCategory === 'growth_audit' ? (
                                /* 1. ORIGINAL GROWTH AUDIT COLUMNS VIEW */
                                <table className="w-full text-left text-sm min-w-[920px] table-fixed">
                                    <colgroup>
                                        <col className="w-[90px]" />
                                        <col className="w-[130px]" />
                                        <col className="w-[170px]" />
                                        <col className="w-[180px]" />
                                        <col className="w-[170px]" />
                                        <col className="w-[65px]" />
                                        <col className="w-[65px]" />
                                        <col className="w-[130px]" />
                                    </colgroup>
                                    <thead>
                                        <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B]">
                                            <th className="px-3 py-2.5 font-bold">Date</th>
                                            <th className="px-3 py-2.5 font-bold">Type & Source</th>
                                            <th className="px-3 py-2.5 font-bold">Status & Notes</th>
                                            <th className="px-3 py-2.5 font-bold">Name / Business</th>
                                            <th className="px-3 py-2.5 font-bold">Email</th>
                                            <th className="px-3 py-2.5 font-bold">Score</th>
                                            <th className="px-3 py-2.5 font-bold">Report</th>
                                            <th className="px-3 py-2.5 font-bold text-right">CRM & Tasks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F1F5F9]">
                                        {pageLeads.map((lead) => {
                                            const badge = statusBadge(lead.status);
                                            const title = displayName(lead);
                                            return (
                                                <tr
                                                    key={lead.id}
                                                    onClick={(e) => {
                                                        if ((e.target as HTMLElement).closest('a, button')) return;
                                                        setActiveLead(lead);
                                                    }}
                                                    className="group hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-3 py-2.5 text-xs text-[#64748B] whitespace-nowrap truncate">
                                                        {fmtDate(lead.createdAt)}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs font-semibold text-[#334155]">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="truncate" title={typeLabel(lead.type)}>
                                                                {typeLabel(lead.type)}
                                                            </span>
                                                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                                Audit
                                                            </span>
                                                        </div>
                                                        {getDistinctSourceSubtext(lead.type, lead.source) ? (
                                                            <div
                                                                className="text-[10px] font-medium text-[#94A3B8] truncate mt-0.5"
                                                                title={lead.source || undefined}
                                                            >
                                                                {lead.source}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2.5 align-top">
                                                        {badge ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border',
                                                                    badge.className
                                                                )}
                                                                title={lead.status || undefined}
                                                            >
                                                                {badge.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-[#94A3B8]">—</span>
                                                        )}
                                                        {(() => {
                                                            const note = getCleanSalesNote(lead);
                                                            if (!note) return null;
                                                            return (
                                                                <div
                                                                    className="flex items-start gap-1 mt-1 max-w-[200px]"
                                                                    title={note}
                                                                >
                                                                    <MessageSquare className="w-2.5 h-2.5 text-indigo-400 shrink-0 mt-0.5" />
                                                                    <span className="text-[10px] text-slate-600 leading-tight line-clamp-3 break-words">
                                                                        {note}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                        {lead.assignedAgentName && (
                                                            <div className="text-[10px] text-indigo-600 font-semibold mt-1 truncate max-w-[180px]">
                                                                👤 {lead.assignedAgentName}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A] max-w-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewingLeadDetails(lead)}
                                                            title={title !== '—' ? title : undefined}
                                                            className="block w-full text-left truncate group-hover:font-bold hover:text-[#D97706]"
                                                        >
                                                            {title}
                                                        </button>
                                                    </td>
                                                    <td
                                                        className="px-3 py-2.5 text-sm text-[#334155] truncate"
                                                        title={lead.email || undefined}
                                                    >
                                                        {lead.email || '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-sm font-bold text-[#0F172A] whitespace-nowrap">
                                                        {lead.scoreTotal != null ? `${lead.scoreTotal}/100` : '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                                        {lead.reportUrl ? (
                                                            <a
                                                                href={lead.reportUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-[#F59E0B] hover:underline"
                                                            >
                                                                Open <ExternalLink className="w-3.5 h-3.5" />
                                                            </a>
                                                        ) : (
                                                            <span className="text-xs text-[#94A3B8]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setViewingLeadDetails(lead)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors shadow-2xs"
                                                                title="View lead details & observations"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                                                <span>View Details</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveLead(lead)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold rounded-lg transition-colors shadow-2xs"
                                                                title="Manage tasks and call logs"
                                                            >
                                                                <CheckSquare className="w-3.5 h-3.5 text-[#D97706]" />
                                                                <span>Manage Tasks</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                /* 2. SPREADSHEET / ADDED LEADS DETAILED COLUMNS VIEW */
                                <table className="w-full text-left text-sm min-w-[1400px]">
                                    <thead>
                                        <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B] bg-slate-50/50">
                                            <th className="px-3 py-2.5 font-bold w-[85px]">Date</th>
                                            <th className="px-3 py-2.5 font-bold w-[120px]">Type & Source</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[170px] w-[190px]">Status & Notes</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[160px]">Name / Business</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[140px]">Contact Info</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[130px]">Business Category</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[130px]">Website / Domain</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[130px]">Opportunity</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[150px]">GBP Observation</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[150px]">AI Visibility</th>
                                            <th className="px-3 py-2.5 font-bold min-w-[150px]">Conclusion</th>
                                            <th className="px-3 py-2.5 font-bold text-right min-w-[200px]">CRM & Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F1F5F9]">
                                        {pageLeads.map((lead) => {
                                            const badge = statusBadge(lead.status);
                                            const title = displayName(lead);
                                            const isAdded = isLeadAdded(lead);
                                            const oppLevel = String(lead.opportunityLevel || '').toLowerCase();
                                            const industryVal = lead.industry || lead.serviceLabel || lead.service;

                                            return (
                                                <tr
                                                    key={lead.id}
                                                    onClick={(e) => {
                                                        if ((e.target as HTMLElement).closest('a, button')) return;
                                                        setViewingLeadDetails(lead);
                                                    }}
                                                    className="group hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-3 py-2.5 text-xs text-[#64748B] whitespace-nowrap">
                                                        {fmtDate(lead.createdAt)}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs font-semibold text-[#334155]">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="truncate max-w-[90px]" title={typeLabel(lead.type)}>
                                                                {typeLabel(lead.type)}
                                                            </span>
                                                            {isAdded ? (
                                                                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                                    Added
                                                                </span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                                    Audit
                                                                </span>
                                                            )}
                                                        </div>
                                                        {getDistinctSourceSubtext(lead.type, lead.source) ? (
                                                            <div
                                                                className="text-[10px] font-medium text-[#94A3B8] truncate max-w-[120px] mt-0.5"
                                                                title={lead.source || undefined}
                                                            >
                                                                {lead.source}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2.5 align-top">
                                                        {badge ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border',
                                                                    badge.className
                                                                )}
                                                                title={lead.status || undefined}
                                                            >
                                                                {badge.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-[#94A3B8]">—</span>
                                                        )}
                                                        {(() => {
                                                            const note = getCleanSalesNote(lead);
                                                            if (!note) return null;
                                                            return (
                                                                <div
                                                                    className="flex items-start gap-1 mt-1 max-w-[200px]"
                                                                    title={note}
                                                                >
                                                                    <MessageSquare className="w-2.5 h-2.5 text-indigo-400 shrink-0 mt-0.5" />
                                                                    <span className="text-[10px] text-slate-600 leading-tight line-clamp-3 break-words">
                                                                        {note}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                        {lead.assignedAgentName && (
                                                            <div className="text-[10px] text-indigo-600 font-semibold mt-1 truncate max-w-[180px]">
                                                                👤 {lead.assignedAgentName}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A]">
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewingLeadDetails(lead)}
                                                            title={title !== '—' ? title : undefined}
                                                            className="block text-left truncate max-w-[220px] group-hover:font-bold hover:text-[#D97706]"
                                                        >
                                                            {title}
                                                        </button>
                                                        {lead.address ? (
                                                            <div className="text-[11px] font-normal text-[#64748B] truncate max-w-[220px] mt-0.5">
                                                                {lead.address}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        <div className="space-y-0.5">
                                                            {lead.phone ? (
                                                                <a
                                                                    href={`tel:${lead.phone}`}
                                                                    className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-indigo-600 truncate max-w-[160px]"
                                                                    title={lead.phone}
                                                                >
                                                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span>{lead.phone}</span>
                                                                </a>
                                                            ) : null}
                                                            {lead.email ? (
                                                                <a
                                                                    href={`mailto:${lead.email}`}
                                                                    className="inline-flex items-center gap-1 text-[#64748B] hover:text-indigo-600 truncate max-w-[160px]"
                                                                    title={lead.email}
                                                                >
                                                                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span>{lead.email}</span>
                                                                </a>
                                                            ) : null}
                                                            {!lead.phone && !lead.email && <span className="text-[#94A3B8]">—</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        {industryVal ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={industryVal}>
                                                                {industryVal}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[#94A3B8]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        {lead.website ? (
                                                            <a
                                                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline max-w-[140px] truncate"
                                                                title={lead.website}
                                                            >
                                                                <Globe className="w-3 h-3 text-indigo-400 shrink-0" />
                                                                <span className="truncate">{lead.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                            </a>
                                                        ) : (
                                                            <span className="text-[#94A3B8]">—</span>
                                                        )}
                                                    </td>
                                                    {/* 1. Opportunity Column */}
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        <div className="space-y-1 max-w-[160px]">
                                                            {lead.opportunityLevel && (
                                                                <span className={cn(
                                                                    'inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider',
                                                                    oppLevel === 'high' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                                    oppLevel === 'low' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                                                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                                                )}>
                                                                    {lead.opportunityLevel}
                                                                </span>
                                                            )}
                                                            {lead.leadOpportunity ? (
                                                                <div className="text-[11px] text-[#475569] font-medium line-clamp-2" title={lead.leadOpportunity}>
                                                                    {lead.leadOpportunity}
                                                                </div>
                                                            ) : !lead.opportunityLevel ? (
                                                                <span className="text-[#94A3B8]">—</span>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    {/* 2. GBP Observation Column */}
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        {lead.gbpObservation ? (
                                                            <div className="text-[11px] text-[#475569] line-clamp-2 max-w-[180px]" title={lead.gbpObservation}>
                                                                {lead.gbpObservation}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[#94A3B8]">—</span>
                                                        )}
                                                    </td>
                                                    {/* 3. AI Visibility Column */}
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        {lead.aiVisibilityObservation ? (
                                                            <div className="text-[11px] text-[#475569] line-clamp-2 max-w-[180px]" title={lead.aiVisibilityObservation}>
                                                                {lead.aiVisibilityObservation}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[#94A3B8]">—</span>
                                                        )}
                                                    </td>
                                                    {/* 4. Conclusion Column */}
                                                    <td className="px-3 py-2.5 text-xs text-[#334155]">
                                                        {(lead.notes || (lead as any).conclusion || (lead as any).auditConclusion) ? (
                                                            <div className="text-[11px] text-[#475569] line-clamp-2 max-w-[180px]" title={lead.notes || (lead as any).conclusion || (lead as any).auditConclusion}>
                                                                {lead.notes || (lead as any).conclusion || (lead as any).auditConclusion}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[#94A3B8]">—</span>
                                                        )}
                                                    </td>
                                                    {/* Actions */}
                                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setViewingLeadDetails(lead)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors shadow-2xs"
                                                                title="View lead details & spreadsheet observations"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                                                <span>View Details</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveLead(lead)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold rounded-lg transition-colors shadow-2xs"
                                                                title="Assign tasks & manage CRM notes"
                                                            >
                                                                <CheckSquare className="w-3.5 h-3.5 text-[#D97706]" />
                                                                <span>Assign Tasks</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteSingleLead(lead.id, title)}
                                                                className="inline-flex items-center p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
                                                                title="Delete this lead"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="px-3 sm:px-4 py-3 border-t border-[#E2E8F0] bg-[#FCFDFE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[#64748B]">
                                Showing{' '}
                                <span className="font-semibold text-[#0F172A]">
                                    {rangeStart}
                                </span>{' '}
                                to{' '}
                                <span className="font-semibold text-[#0F172A]">
                                    {rangeEnd}
                                </span>{' '}
                                of{' '}
                                <span className="font-semibold text-[#0F172A]">
                                    {filteredLeads.length}
                                </span>{' '}
                                leads
                            </p>
                            <div className="flex items-center justify-between sm:justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                                </button>
                                <span className="text-xs font-medium text-[#475569] px-1">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                >
                                    Next <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Separate Lead Details Viewer */}
            {viewingLeadDetails && (
                <LeadDetailsModal
                    isOpen={Boolean(viewingLeadDetails)}
                    lead={viewingLeadDetails}
                    onClose={() => setViewingLeadDetails(null)}
                    onOpenManageTasks={(lead) => {
                        setViewingLeadDetails(null);
                        setActiveLead(lead);
                    }}
                />
            )}

            {/* Manage Tasks & Call Logs Modal */}
            {activeLead && (
                <LeadCrmDrawer
                    lead={activeLead}
                    salesAgents={salesAgents}
                    onClose={() => setActiveLead(null)}
                    onTaskUpdated={load}
                    onViewDetails={(lead) => {
                        setActiveLead(null);
                        setViewingLeadDetails(lead);
                    }}
                />
            )}

            {/* Excel Upload Modal */}
            <ExcelLeadUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onImportSuccess={() => {
                    load();
                }}
                importEndpoint={bulkImportAdminCrmLeads}
            />

            {/* Manual Add Lead Modal */}
            <AddLeadModal
                isOpen={isAddLeadModalOpen}
                onClose={() => setIsAddLeadModalOpen(false)}
                onSuccess={() => {
                    load();
                }}
                createLeadHandler={createAdminCrmLead}
            />
        </div>
    );
}
