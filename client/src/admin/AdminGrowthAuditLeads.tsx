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
    Download,
    Plus,
    Phone,
    Mail,
    Globe,
    Trash2,
    Eye,
    User,
    UserCheck,
    CheckCircle2,
    X,
    History,
    Clock
} from 'lucide-react';
import {
    adminGet,
    fetchSalesAgents,
    type SalesAgent,
    bulkImportAdminCrmLeads,
    createAdminCrmLead,
    deleteAdminExcelLeads,
    deleteAdminCrmLead,
    bulkDeleteAdminCrmLeads,
    fetchAdminExcelBatches,
    type ExcelImportBatch
} from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import LeadDetailsModal from './LeadDetailsModal';
import BulkAssignTasksModal from './BulkAssignTasksModal';
import LeadStatusHistoryModal from './LeadStatusHistoryModal';
import ExcelLeadUploadModal, { downloadLeadsExcelTemplate } from '../sales-agent/ExcelLeadUploadModal';
import AddLeadModal from '../sales-agent/AddLeadModal';
import { cn } from '../shared/utils';

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
    updatedAt?: string | null;
    auditId?: string | null;
    salesNotes?: string | null;
    assignedAgentName?: string | null;
    importBatchId?: string | null;
    importFileName?: string | null;
    importUploadedAt?: string | null;
    spreadsheetStatus?: string | null;
    spreadsheetStatus1?: string | null;
    spreadsheetStatus2?: string | null;
    spreadsheetStatus3?: string | null;
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
    // Excel Status 1 / Status 2 free text (e.g. Phone/enquiry)
    const label = raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
    return { label, className: 'bg-indigo-50 text-indigo-800 border-indigo-200 font-semibold' };
}

/** Prefer Excel Status 1 (short) while CRM status is still new; otherwise show CRM status. */
function displayLeadStatus(lead: {
    status?: string | null;
    spreadsheetStatus?: string | null;
    spreadsheetStatus1?: string | null;
}) {
    const sheet = String(lead.spreadsheetStatus1 || lead.spreadsheetStatus || '').trim();
    const crm = String(lead.status || '').trim() || 'new';
    if (sheet && (!crm || crm.toLowerCase() === 'new')) return sheet;
    return crm;
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

function formatDateParts(value?: string | null) {
    if (!value) return { date: '—', time: '' };
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${min}` };
    } catch {
        return { date: '—', time: '' };
    }
}

function fmtDate(value?: string | null) {
    const { date, time } = formatDateParts(value);
    return time ? `${date} ${time}` : date;
}

export type StatusDateFilter = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom';

export function matchesStatusDateFilter(
    dateStr: string | null | undefined,
    filter: StatusDateFilter,
    customDate?: string
): boolean {
    if (filter === 'all' || !dateStr) return true;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetTime = d.getTime();

    if (filter === 'today') {
        return targetTime >= todayStart;
    }
    if (filter === 'yesterday') {
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
        return targetTime >= yesterdayStart && targetTime < todayStart;
    }
    if (filter === '7days') {
        const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
        return targetTime >= sevenDaysAgo;
    }
    if (filter === '30days') {
        const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;
        return targetTime >= thirtyDaysAgo;
    }
    if (filter === 'custom' && customDate) {
        const targetIso = d.toISOString().slice(0, 10);
        return targetIso === customDate;
    }
    return true;
}

export function normalizeBusinessCategory(raw?: string | null): string | null {
    if (!raw) return null;
    const clean = String(raw).trim().replace(/\s+/g, ' ');
    if (!clean || /^sheet\s*\d+$/i.test(clean)) return null;

    const lower = clean.toLowerCase();

    if (lower === 'garage' || lower === 'garages') return 'Garage';
    if (lower.includes('dog grooming') || lower.includes('pet service')) return 'Dog Grooming Pet Services';
    if (lower.includes('plumb')) return 'Plumbing';
    if (lower.includes('beauty') || lower.includes('aesthetics') || lower.includes('hair')) return 'Beauty Hair Aesthetics';
    if (lower.includes('physio') || lower.includes('sports therapy')) return 'Physiotherapy Sports Therapy';
    if (lower.includes('driving school') || lower.includes('driving instructor')) return 'Driving Schools';
    if (lower.includes('pest')) return 'Pestcontrol';
    if (lower.includes('landscap') || lower.includes('garden')) return 'Landscaping';
    if (lower.includes('dent')) return 'Dental';
    if (lower.includes('damp')) return 'Dampproofing';
    if (lower.includes('skin')) return 'Skin Care';
    if (lower.includes('care home') || lower.includes('nursing home')) return 'Care Homes';
    if (lower.includes('personal trainer') || lower.includes('fitness trainer')) return 'Personal Trainers';
    if (lower.includes('clean')) return 'Cleaning Services';
    if (lower.includes('electric')) return 'Electricians';
    if (lower.includes('tutor') || lower.includes('tuition')) return 'Private Tutors & Tuition Centre';

    return clean
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

const DEFAULT_BUSINESS_CATEGORIES = [
    'Plumbing',
    'Beauty Hair Aesthetics',
    'Physiotherapy Sports Therapy',
    'Driving Schools',
    'Pestcontrol',
    'Landscaping',
    'Dental',
    'Dampproofing',
    'Skin Care',
    'Care Homes',
    'Personal Trainers',
    'Cleaning Services',
    'Electricians',
    'Dog Grooming Pet Services',
    'Private Tutors & Tuition Centre',
    'Garage'
];

export function getLeadBusinessCategory(lead: {
    service?: string | null;
    serviceLabel?: string | null;
    industry?: string | null;
}): string | null {
    const raw = String(lead.service || lead.serviceLabel || lead.industry || '').trim();
    return normalizeBusinessCategory(raw);
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
    const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
    const [selectedStatusLead, setSelectedStatusLead] = useState<AdminLead | null>(null);
    const [excelBatches, setExcelBatches] = useState<ExcelImportBatch[]>([]);
    const [excelBatchFilter, setExcelBatchFilter] = useState<string>('all');
    const [businessFilter, setBusinessFilter] = useState<string>('all');
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedPriority, setSelectedPriority] = useState<string>('all');
    const [statusDateFilter, setStatusDateFilter] = useState<StatusDateFilter>('all');
    const [statusCustomDate, setStatusCustomDate] = useState<string>('');

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
            fetchSalesAgents().catch(() => []),
            fetchAdminExcelBatches().catch(() => [] as ExcelImportBatch[])
        ])
            .then(([data, agents, batches]) => {
                setLeads(data.leads || []);
                setSalesAgents(agents);
                setExcelBatches(batches);
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
        if (excelBatchFilter !== 'all' && !excelBatches.some((b) => b.batchId === excelBatchFilter)) {
            setExcelBatchFilter('all');
        }
    }, [excelBatches, excelBatchFilter]);

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

    const selectedExcelBatch = useMemo(
        () => excelBatches.find((b) => b.batchId === excelBatchFilter) || null,
        [excelBatches, excelBatchFilter]
    );

    const leadMatchesExcelBatch = (lead: AdminLead, batchId: string) => {
        if (batchId === 'legacy') {
            return (
                isLeadAdded(lead) &&
                String(lead.source || '').toLowerCase().includes('excel') &&
                !lead.importBatchId
            );
        }
        return String(lead.importBatchId || '') === batchId;
    };

    const businessFilterOptions = useMemo(() => {
        const set = new Set<string>();
        DEFAULT_BUSINESS_CATEGORIES.forEach((cat) => set.add(cat));
        leads.forEach((l) => {
            const cat = getLeadBusinessCategory(l);
            if (cat) {
                const existing = Array.from(set).find((item) => item.toLowerCase() === cat.toLowerCase());
                if (!existing) {
                    set.add(cat);
                }
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [leads]);

    const filteredLeads = useMemo(() => {
        return leads.filter((lead) => {
            const added = isLeadAdded(lead);
            if (sourceCategory === 'growth_audit') return !added;
            if (sourceCategory === 'added') {
                if (!added) return false;
            }
            if (excelBatchFilter !== 'all') {
                if (!leadMatchesExcelBatch(lead, excelBatchFilter)) return false;
            }
            if (businessFilter !== 'all') {
                const cat = getLeadBusinessCategory(lead);
                if (!cat || cat.toLowerCase().trim() !== businessFilter.toLowerCase().trim()) {
                    return false;
                }
            }
            if (selectedAgent !== 'all') {
                if (selectedAgent === 'unassigned') {
                    if (lead.assignedAgentName || (lead as any).assignedToUserId) return false;
                } else {
                    const agent = salesAgents.find((a) => a.id === selectedAgent);
                    const agentName = agent?.name || agent?.email || '';
                    const leadAgentName = lead.assignedAgentName || (lead as any).assignedToName || '';
                    const leadAgentId = (lead as any).assignedToUserId || '';
                    if (
                        leadAgentId !== selectedAgent &&
                        (!agentName || !leadAgentName.toLowerCase().includes(agentName.toLowerCase()))
                    ) {
                        return false;
                    }
                }
            }
            if (selectedStatus !== 'all') {
                const leadStat = (displayLeadStatus(lead) || lead.status || '').toLowerCase().trim().replace(/[-\s]/g, '_');
                const target = selectedStatus.toLowerCase().trim().replace(/[-\s]/g, '_');
                if (target === 'new') {
                    if (leadStat && leadStat !== 'new' && leadStat !== 'submitted') return false;
                } else if (!leadStat.includes(target) && leadStat !== target) {
                    return false;
                }
            }
            if (selectedPriority !== 'all') {
                const prio = ((lead as any).priority || '').toLowerCase().trim();
                if (prio && prio !== selectedPriority) return false;
            }
            const statusDate = lead.latestActivity?.createdAt || lead.updatedAt || lead.createdAt;
            if (!matchesStatusDateFilter(statusDate, statusDateFilter, statusCustomDate)) {
                return false;
            }
            return true;
        });
    }, [
        leads,
        sourceCategory,
        excelBatchFilter,
        businessFilter,
        selectedAgent,
        selectedStatus,
        selectedPriority,
        statusDateFilter,
        statusCustomDate,
        salesAgents
    ]);

    const excelBatchLeadIds = useMemo(() => {
        if (excelBatchFilter === 'all') return [] as string[];
        return filteredLeads.map((l) => l.id);
    }, [filteredLeads, excelBatchFilter]);

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

    // Bulk selection state
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [bulkAssignLeadIds, setBulkAssignLeadIds] = useState<string[]>([]);
    const [bulkSuccessToast, setBulkSuccessToast] = useState<string | null>(null);

    const isAllPageSelected = pageLeads.length > 0 && pageLeads.every((l) => selectedLeadIds.has(l.id));
    const isAllFilteredSelected =
        filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.has(l.id));

    const handleToggleSelectAllPage = () => {
        setSelectedLeadIds((prev) => {
            const next = new Set(prev);
            if (isAllFilteredSelected) {
                filteredLeads.forEach((l) => next.delete(l.id));
            } else {
                filteredLeads.forEach((l) => next.add(l.id));
            }
            return next;
        });
    };

    const handleToggleLeadSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedLeadIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const [isDeletingExcel, setIsDeletingExcel] = useState(false);

    const handleDeleteExcelLeads = async () => {
        if (excelBatchFilter === 'all' || !selectedExcelBatch) {
            setError('Select one Excel file from the filter before deleting.');
            return;
        }
        const label = selectedExcelBatch.fileName || 'this Excel upload';
        const count = selectedExcelBatch.leadCount;
        if (
            !window.confirm(
                `Delete ${count} lead(s) from “${label}” only? Other Excel uploads will not be deleted. This cannot be undone.`
            )
        ) {
            return;
        }
        setIsDeletingExcel(true);
        setError('');
        try {
            await deleteAdminExcelLeads(excelBatchFilter);
            setExcelBatchFilter('all');
            setSelectedLeadIds(new Set());
            await load();
        } catch (err: any) {
            setError(err.message || 'Failed to delete excel leads');
        } finally {
            setIsDeletingExcel(false);
        }
    };

    const handleAssignThisExcel = () => {
        if (excelBatchFilter === 'all' || !excelBatchLeadIds.length) {
            setError('Select one Excel file that has leads to assign.');
            return;
        }
        setSelectedLeadIds(new Set(excelBatchLeadIds));
        setBulkAssignLeadIds(excelBatchLeadIds);
        setIsBulkAssignModalOpen(true);
    };

    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const handleBulkDeleteSelected = async () => {
        const ids = Array.from(selectedLeadIds);
        if (!ids.length) return;
        if (
            !window.confirm(
                `Delete ${ids.length} selected lead(s)? This also removes their tasks/activity and cannot be undone.`
            )
        ) {
            return;
        }
        setIsBulkDeleting(true);
        setError('');
        try {
            const res = await bulkDeleteAdminCrmLeads(ids);
            setBulkSuccessToast(res.message || `Deleted ${res.count} lead(s).`);
            setSelectedLeadIds(new Set());
            setBulkAssignLeadIds([]);
            await load();
            setTimeout(() => setBulkSuccessToast(null), 4000);
        } catch (err: any) {
            setError(err.message || 'Failed to delete selected leads');
        } finally {
            setIsBulkDeleting(false);
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

    return (
        <div className="space-y-3 w-full min-w-0">
            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}

            {bulkSuccessToast && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{bulkSuccessToast}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setBulkSuccessToast(null)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                {/* Search Bar & Filter Controls Header (Matches Admin CRM Task layout) */}
                <div className="p-3 sm:p-4 border-b border-[#E2E8F0] bg-[#FCFDFE] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="relative flex-1 max-w-md min-w-0">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                            <input
                                value={draftQuery}
                                onChange={(e) => setDraftQuery(e.target.value)}
                                placeholder="Search tasks, notes, or telecaller..."
                                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-slate-50 focus:bg-white"
                            />
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {excelBatchFilter !== 'all' && excelBatchLeadIds.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleAssignThisExcel}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 transition-colors shadow-2xs"
                                    title="Assign all leads from this Excel to one agent"
                                >
                                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Assign this Excel</span>
                                </button>
                            )}

                            {excelBatchFilter !== 'all' && selectedExcelBatch && (
                                <button
                                    type="button"
                                    disabled={isDeletingExcel}
                                    onClick={handleDeleteExcelLeads}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors shadow-2xs"
                                    title="Delete only leads from the selected Excel file"
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                    <span>{isDeletingExcel ? 'Deleting...' : 'Delete this Excel'}</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => downloadLeadsExcelTemplate()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 transition-colors shadow-2xs"
                                title="Download Excel template with column headers and two example rows"
                            >
                                <Download className="w-3.5 h-3.5 text-sky-600" />
                                <span>Template</span>
                            </button>

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

                            <button
                                type="button"
                                onClick={load}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* Filter Grid (Matches Admin CRM filters: Business, Sales Agent, Task Type/Source, Status, Status Date, Priority) */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-2.5 border-t border-slate-100">
                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                Business
                            </label>
                            <select
                                value={businessFilter}
                                onChange={(e) => {
                                    setBusinessFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                                title="Filter by Business category"
                            >
                                <option value="all">All Businesses</option>
                                {businessFilterOptions.map((cat) => {
                                    const count = leads.filter((l) => {
                                        const c = getLeadBusinessCategory(l);
                                        return c && c.toLowerCase().trim() === cat.toLowerCase().trim();
                                    }).length;
                                    return (
                                        <option key={cat} value={cat}>
                                            {cat} {count > 0 ? `(${count})` : ''}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                Sales Agent
                            </label>
                            <select
                                value={selectedAgent}
                                onChange={(e) => {
                                    setSelectedAgent(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            >
                                <option value="all">All Agents</option>
                                <option value="unassigned">Unassigned</option>
                                {salesAgents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                        {agent.name || agent.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                Task Type
                            </label>
                            <select
                                value={excelBatchFilter !== 'all' ? excelBatchFilter : sourceCategory}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'all' || val === 'added' || val === 'growth_audit') {
                                        handleSetSourceCategory(val as SourceCategoryFilter);
                                        setExcelBatchFilter('all');
                                    } else {
                                        setExcelBatchFilter(val);
                                        setSourceCategory('added');
                                    }
                                    setPage(1);
                                    setSelectedLeadIds(new Set());
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            >
                                <option value="all">All Task Types</option>
                                <option value="added">Added / Uploaded Leads ({addedCount})</option>
                                <option value="growth_audit">Growth Audit & Funnels ({growthAuditCount})</option>
                                {excelBatches.map((b) => (
                                    <option key={b.batchId} value={b.batchId}>
                                        Excel: {b.fileName} ({b.leadCount})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                Status
                            </label>
                            <select
                                value={selectedStatus}
                                onChange={(e) => {
                                    setSelectedStatus(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            >
                                <option value="all">All Statuses</option>
                                <option value="new">New</option>
                                <option value="in_progress">In Progress</option>
                                <option value="contacted">Contacted</option>
                                <option value="follow_up">Follow Up</option>
                                <option value="interested">Interested</option>
                                <option value="not_interested">Not Interested</option>
                                <option value="converted">Converted</option>
                                <option value="completed">Completed</option>
                                <option value="voicemail">Voicemail</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                Status Date
                            </label>
                            <select
                                value={statusDateFilter}
                                onChange={(e) => {
                                    setStatusDateFilter(e.target.value as StatusDateFilter);
                                    setPage(1);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                                title="Filter leads by updated status date"
                            >
                                <option value="all">📅 All Dates</option>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="7days">Last 7 Days</option>
                                <option value="30days">Last 30 Days</option>
                                <option value="custom">Custom Date…</option>
                            </select>
                            {statusDateFilter === 'custom' && (
                                <input
                                    type="date"
                                    value={statusCustomDate}
                                    onChange={(e) => {
                                        setStatusCustomDate(e.target.value);
                                        setPage(1);
                                    }}
                                    className="w-full mt-1 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                                />
                            )}
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                Priority
                            </label>
                            <select
                                value={selectedPriority !== 'all' ? selectedPriority : hasContact !== 'any' ? `contact_${hasContact}` : 'all'}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.startsWith('contact_')) {
                                        setHasContact(val.replace('contact_', '') as ContactFilter);
                                        setSelectedPriority('all');
                                    } else {
                                        setSelectedPriority(val);
                                        setHasContact('any');
                                    }
                                    setPage(1);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            >
                                <option value="all">All Priorities</option>
                                <option value="urgent">Urgent</option>
                                <option value="high">High Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="low">Low Priority</option>
                                <option value="contact_email">Has Email</option>
                                <option value="contact_phone">Has Phone</option>
                                <option value="contact_both">Both Email & Phone</option>
                            </select>
                        </div>
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
                                <table className="w-full text-left text-sm min-w-[1360px] table-fixed">
                                    <colgroup>
                                        <col className="w-[38px]" />
                                        <col className="w-[105px]" />
                                        <col className="w-[125px]" />
                                        <col className="w-[160px]" />
                                        <col className="w-[230px]" />
                                        <col className="w-[185px]" />
                                        <col className="w-[110px]" />
                                        <col className="w-[135px]" />
                                        <col className="w-[272px]" />
                                    </colgroup>
                                    <thead>
                                        <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B] bg-slate-50/50">
                                            <th className="px-3 py-2.5 font-bold">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllFilteredSelected || isAllPageSelected}
                                                    onChange={handleToggleSelectAllPage}
                                                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                                    title="Select / Deselect all on this page"
                                                />
                                            </th>
                                            <th className="px-3 py-2.5 font-bold">Date</th>
                                            <th className="px-3 py-2.5 font-bold">Type & Source</th>
                                            <th className="px-3 py-2.5 font-bold">Status & Notes</th>
                                            <th className="px-3 py-2.5 font-bold">Name / Business</th>
                                            <th className="px-3 py-2.5 font-bold">Contact Info</th>
                                            <th className="px-3 py-2.5 font-bold text-center">Score / Report</th>
                                            <th className="px-3 py-2.5 font-bold">Assigned To</th>
                                            <th className="px-3 py-2.5 font-bold text-right">CRM & Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F1F5F9]">
                                        {pageLeads.map((lead) => {
                                             const badge = statusBadge(displayLeadStatus(lead));
                                             const title = displayName(lead);
                                             const isSelected = selectedLeadIds.has(lead.id);
                                             return (
                                                 <tr
                                                     key={lead.id}
                                                     onClick={(e) => {
                                                         if ((e.target as HTMLElement).closest('a, button, input')) return;
                                                         setViewingLeadDetails(lead);
                                                     }}
                                                     className={cn(
                                                         "group cursor-pointer transition-colors",
                                                         isSelected ? "bg-amber-50/60 hover:bg-amber-50/90" : "hover:bg-slate-50/80"
                                                     )}
                                                 >
                                                     <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                         <input
                                                             type="checkbox"
                                                             checked={isSelected}
                                                             onChange={(e) => handleToggleLeadSelect(lead.id, e as any)}
                                                             className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                                         />
                                                     </td>
                                                     <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                                         {(() => {
                                                             const { date, time } = formatDateParts(lead.createdAt);
                                                             return (
                                                                 <div>
                                                                     <div className="font-medium text-slate-700">{date}</div>
                                                                     {time ? <div className="text-[10px] text-[#94A3B8] mt-0.5">{time}</div> : null}
                                                                 </div>
                                                             );
                                                         })()}
                                                     </td>
                                                     <td className="px-3 py-2.5 text-xs font-semibold text-[#334155]">
                                                         <div>
                                                             <span className="truncate max-w-[140px] block" title={typeLabel(lead.type)}>
                                                                 {typeLabel(lead.type)}
                                                             </span>
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
                                                         <button
                                                             type="button"
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 setSelectedStatusLead(lead);
                                                             }}
                                                             className={cn(
                                                                 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:shadow-xs hover:scale-105 transition-all text-left group/badge',
                                                                 badge ? badge.className : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                                             )}
                                                             title="Click to view full status history timeline"
                                                         >
                                                             <span>{badge ? badge.label : 'New'}</span>
                                                             <History className="w-2.5 h-2.5 opacity-60 group-hover/badge:opacity-100 shrink-0" />
                                                         </button>
                                                         <div
                                                             className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mt-1 whitespace-nowrap"
                                                             title="Date when status was last updated"
                                                         >
                                                             <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                                             <span>{fmtDate(lead.latestActivity?.createdAt || lead.updatedAt || lead.createdAt)}</span>
                                                         </div>
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
                                                     </td>
                                                     <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A] overflow-hidden">
                                                         <div className="w-full min-w-0 pr-1.5">
                                                             <button
                                                                 type="button"
                                                                 onClick={() => setViewingLeadDetails(lead)}
                                                                 title={title !== '—' ? title : undefined}
                                                                 className="block text-left truncate w-full group-hover:font-bold hover:text-[#D97706]"
                                                             >
                                                                 {title}
                                                             </button>
                                                             {(() => {
                                                                 const cat = getLeadBusinessCategory(lead);
                                                                 if (!cat) return null;
                                                                 return (
                                                                     <div className="mt-1">
                                                                         <span
                                                                             className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200"
                                                                             title={`Business: ${cat}`}
                                                                         >
                                                                             {cat}
                                                                         </span>
                                                                     </div>
                                                                 );
                                                             })()}
                                                             {lead.address ? (
                                                                 <div className="text-[11px] font-normal text-[#64748B] truncate w-full mt-0.5" title={lead.address}>
                                                                     {lead.address}
                                                                 </div>
                                                             ) : null}
                                                         </div>
                                                     </td>
                                                     <td className="px-3 py-2.5 text-xs text-[#334155] overflow-hidden">
                                                         <div className="space-y-1 w-full min-w-0">
                                                             {lead.phone ? (
                                                                 <a
                                                                     href={`tel:${lead.phone}`}
                                                                     className="flex items-center gap-1.5 font-semibold text-slate-800 hover:text-indigo-600 w-full min-w-0"
                                                                     title={lead.phone}
                                                                 >
                                                                     <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                                     <span className="truncate">{lead.phone}</span>
                                                                 </a>
                                                             ) : null}
                                                             {lead.email ? (
                                                                 <a
                                                                     href={`mailto:${lead.email}`}
                                                                     className="flex items-center gap-1.5 text-[#64748B] hover:text-indigo-600 w-full min-w-0"
                                                                     title={lead.email}
                                                                 >
                                                                     <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                                     <span className="truncate">{lead.email}</span>
                                                                 </a>
                                                             ) : null}
                                                             {lead.website ? (
                                                                 <a
                                                                     href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                                                     target="_blank"
                                                                     rel="noreferrer"
                                                                     className="flex items-center gap-1.5 text-[11px] text-indigo-600 hover:underline w-full min-w-0"
                                                                     title={lead.website}
                                                                 >
                                                                     <Globe className="w-3 h-3 text-indigo-400 shrink-0" />
                                                                     <span className="truncate">{lead.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                                 </a>
                                                             ) : null}
                                                             {!lead.phone && !lead.email && !lead.website && <span className="text-[#94A3B8]">—</span>}
                                                         </div>
                                                     </td>
                                                     <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                         {lead.scoreTotal != null ? (
                                                             <div className="space-y-1">
                                                                 <span className={cn(
                                                                     'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs',
                                                                     lead.scoreTotal >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                     lead.scoreTotal >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                     'bg-rose-50 text-rose-700 border-rose-200'
                                                                 )}>
                                                                     Score: {lead.scoreTotal}/100
                                                                 </span>
                                                                 {lead.reportUrl ? (
                                                                     <div>
                                                                         <a
                                                                             href={lead.reportUrl}
                                                                             target="_blank"
                                                                             rel="noreferrer"
                                                                             className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F59E0B] hover:underline"
                                                                         >
                                                                             Report <ExternalLink className="w-2.5 h-2.5" />
                                                                         </a>
                                                                     </div>
                                                                 ) : null}
                                                             </div>
                                                         ) : lead.reportUrl ? (
                                                             <a
                                                                 href={lead.reportUrl}
                                                                 target="_blank"
                                                                 rel="noreferrer"
                                                                 className="inline-flex items-center gap-1 text-xs font-bold text-[#F59E0B] hover:underline"
                                                             >
                                                                 Open Report <ExternalLink className="w-3 h-3" />
                                                             </a>
                                                         ) : (
                                                             <span className="text-xs text-[#94A3B8]">—</span>
                                                         )}
                                                     </td>
                                                     <td className="px-3 py-2.5 whitespace-nowrap">
                                                         {lead.assignedAgentName ? (
                                                             <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-semibold text-xs" title={`Assigned to ${lead.assignedAgentName}`}>
                                                                 <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                 <span className="truncate max-w-[100px]">{lead.assignedAgentName}</span>
                                                             </span>
                                                         ) : (
                                                             <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-medium">
                                                                 Unassigned
                                                             </span>
                                                         )}
                                                     </td>
                                                     <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                         <div className="flex items-center justify-end gap-1.5">
                                                             <button
                                                                 type="button"
                                                                 onClick={() => setViewingLeadDetails(lead)}
                                                                 className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors shadow-2xs shrink-0"
                                                                 title="View lead details & observations"
                                                             >
                                                                 <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                                                 <span>View Details</span>
                                                             </button>
                                                             <button
                                                                 type="button"
                                                                 onClick={() => setActiveLead(lead)}
                                                                 className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold rounded-lg transition-colors shadow-2xs shrink-0"
                                                                 title="Assign tasks & manage CRM notes"
                                                             >
                                                                 <CheckSquare className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                                                                 <span>Assign Tasks</span>
                                                             </button>
                                                             <button
                                                                 type="button"
                                                                 onClick={() => handleDeleteSingleLead(lead.id, title)}
                                                                 className="inline-flex items-center justify-center p-1.5 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors shrink-0 shadow-2xs"
                                                                 title="Delete this lead"
                                                                 aria-label="Delete this lead"
                                                             >
                                                                 <Trash2 className="w-3.5 h-3.5 text-red-600 shrink-0" />
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
                                <table className="w-full text-left text-sm min-w-[1360px] table-fixed">
                                    <colgroup>
                                        <col className="w-[38px]" />
                                        <col className="w-[105px]" />
                                        <col className="w-[125px]" />
                                        <col className="w-[160px]" />
                                        <col className="w-[230px]" />
                                        <col className="w-[185px]" />
                                        <col className="w-[110px]" />
                                        <col className="w-[135px]" />
                                        <col className="w-[272px]" />
                                    </colgroup>
                                    <thead>
                                        <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B] bg-slate-50/50">
                                            <th className="px-3 py-2.5 font-bold">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllFilteredSelected || isAllPageSelected}
                                                    onChange={handleToggleSelectAllPage}
                                                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                                    title="Select / Deselect all on this page"
                                                />
                                            </th>
                                            <th className="px-3 py-2.5 font-bold">Date</th>
                                            <th className="px-3 py-2.5 font-bold">Type & Source</th>
                                            <th className="px-3 py-2.5 font-bold">Status & Notes</th>
                                            <th className="px-3 py-2.5 font-bold">Name / Business</th>
                                            <th className="px-3 py-2.5 font-bold">Contact Info</th>
                                            <th className="px-3 py-2.5 font-bold text-center">Opportunity</th>
                                            <th className="px-3 py-2.5 font-bold">Assigned To</th>
                                            <th className="px-3 py-2.5 font-bold text-right">CRM & Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#F1F5F9]">
                                        {pageLeads.map((lead) => {
                                            const badge = statusBadge(displayLeadStatus(lead));
                                            const title = displayName(lead);
                                            const oppLevel = String(lead.opportunityLevel || '').toLowerCase();
                                            const isSelected = selectedLeadIds.has(lead.id);

                                            return (
                                                <tr
                                                    key={lead.id}
                                                    onClick={(e) => {
                                                        if ((e.target as HTMLElement).closest('a, button, input')) return;
                                                        setViewingLeadDetails(lead);
                                                    }}
                                                    className={cn(
                                                        "group cursor-pointer transition-colors",
                                                        isSelected ? "bg-amber-50/60 hover:bg-amber-50/90" : "hover:bg-slate-50/80"
                                                    )}
                                                >
                                                    <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => handleToggleLeadSelect(lead.id, e as any)}
                                                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                                        {(() => {
                                                            const { date, time } = formatDateParts(lead.createdAt);
                                                            return (
                                                                <div>
                                                                    <div className="font-medium text-slate-700">{date}</div>
                                                                    {time ? <div className="text-[10px] text-[#94A3B8] mt-0.5">{time}</div> : null}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs font-semibold text-[#334155]">
                                                        <div>
                                                            <span className="truncate max-w-[140px] block" title={typeLabel(lead.type)}>
                                                                {typeLabel(lead.type)}
                                                            </span>
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
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedStatusLead(lead);
                                                            }}
                                                            className={cn(
                                                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:shadow-xs hover:scale-105 transition-all text-left group/badge',
                                                                badge ? badge.className : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                                            )}
                                                            title="Click to view full status history timeline"
                                                        >
                                                            <span>{badge ? badge.label : 'New'}</span>
                                                            <History className="w-2.5 h-2.5 opacity-60 group-hover/badge:opacity-100 shrink-0" />
                                                        </button>
                                                        <div
                                                            className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mt-1 whitespace-nowrap"
                                                            title="Date when status was last updated"
                                                        >
                                                            <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                                            <span>{fmtDate(lead.latestActivity?.createdAt || lead.updatedAt || lead.createdAt)}</span>
                                                        </div>
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
                                                    </td>
                                                    <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A] overflow-hidden">
                                                        <div className="w-full min-w-0 pr-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setViewingLeadDetails(lead)}
                                                                title={title !== '—' ? title : undefined}
                                                                className="block text-left truncate w-full group-hover:font-bold hover:text-[#D97706]"
                                                            >
                                                                {title}
                                                            </button>
                                                            {lead.address ? (
                                                                <div className="text-[11px] font-normal text-[#64748B] truncate w-full mt-0.5" title={lead.address}>
                                                                    {lead.address}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-xs text-[#334155] overflow-hidden">
                                                        <div className="space-y-1 w-full min-w-0">
                                                            {lead.phone ? (
                                                                <a
                                                                    href={`tel:${lead.phone}`}
                                                                    className="flex items-center gap-1.5 font-semibold text-slate-800 hover:text-indigo-600 w-full min-w-0"
                                                                    title={lead.phone}
                                                                >
                                                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span className="truncate">{lead.phone}</span>
                                                                </a>
                                                            ) : null}
                                                            {lead.email ? (
                                                                <a
                                                                    href={`mailto:${lead.email}`}
                                                                    className="flex items-center gap-1.5 text-[#64748B] hover:text-indigo-600 w-full min-w-0"
                                                                    title={lead.email}
                                                                >
                                                                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                                    <span className="truncate">{lead.email}</span>
                                                                </a>
                                                            ) : null}
                                                            {lead.website ? (
                                                                <a
                                                                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="flex items-center gap-1.5 text-[11px] text-indigo-600 hover:underline w-full min-w-0"
                                                                    title={lead.website}
                                                                >
                                                                    <Globe className="w-3 h-3 text-indigo-400 shrink-0" />
                                                                    <span className="truncate">{lead.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                                </a>
                                                            ) : null}
                                                            {!lead.phone && !lead.email && !lead.website && <span className="text-[#94A3B8]">—</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                        {lead.opportunityLevel ? (
                                                            <span className={cn(
                                                                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-2xs',
                                                                oppLevel === 'high' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                oppLevel === 'low' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                                                'bg-amber-50 text-amber-700 border-amber-200'
                                                            )}>
                                                                {lead.opportunityLevel}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[#94A3B8] text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                                        {lead.assignedAgentName ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-semibold text-xs" title={`Assigned to ${lead.assignedAgentName}`}>
                                                                <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                <span className="truncate max-w-[100px]">{lead.assignedAgentName}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-medium shrink-0">
                                                                Unassigned
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setViewingLeadDetails(lead)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors shadow-2xs shrink-0"
                                                                title="View lead details & observations"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                                                <span>View Details</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveLead(lead)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold rounded-lg transition-colors shadow-2xs shrink-0"
                                                                title="Assign tasks & manage CRM notes"
                                                            >
                                                                <CheckSquare className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                                                                <span>Assign Tasks</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteSingleLead(lead.id, title)}
                                                                className="inline-flex items-center justify-center p-1.5 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors shrink-0 shadow-2xs"
                                                                title="Delete this lead"
                                                                aria-label="Delete this lead"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 text-red-600 shrink-0" />
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

            {/* Floating Bulk Actions Toolbar */}
            {selectedLeadIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3.5 animate-in slide-in-from-bottom-5 duration-200">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs">
                            {selectedLeadIds.size}
                        </span>
                        <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
                            {selectedLeadIds.size === 1 ? 'lead selected' : 'leads selected'}
                        </span>
                    </div>

                    <div className="h-5 w-px bg-slate-700/80 shrink-0" />

                    <button
                        type="button"
                        onClick={() => {
                            setBulkAssignLeadIds(Array.from(selectedLeadIds));
                            setIsBulkAssignModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm whitespace-nowrap"
                    >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Assign to Telecaller & Create Tasks</span>
                    </button>

                    <button
                        type="button"
                        disabled={isBulkDeleting}
                        onClick={handleBulkDeleteSelected}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-400 text-white font-bold text-xs rounded-xl transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isBulkDeleting ? 'Deleting…' : `Delete selected (${selectedLeadIds.size})`}</span>
                    </button>

                    <div className="h-5 w-px bg-slate-700/80 shrink-0" />

                    <button
                        type="button"
                        onClick={() => setSelectedLeadIds(new Set())}
                        className="text-xs font-semibold text-slate-400 hover:text-white transition-colors whitespace-nowrap px-1"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Bulk Assign & Task Creation Modal */}
            <BulkAssignTasksModal
                isOpen={isBulkAssignModalOpen}
                leadIds={bulkAssignLeadIds}
                salesAgents={salesAgents}
                onClose={() => setIsBulkAssignModalOpen(false)}
                onSuccess={async (res) => {
                    setBulkSuccessToast(res.message);
                    setSelectedLeadIds(new Set());
                    setBulkAssignLeadIds([]);
                    await load();
                    setTimeout(() => setBulkSuccessToast(null), 4000);
                }}
            />

            {/* Lead Status History Modal */}
            {selectedStatusLead && (
                <LeadStatusHistoryModal
                    isOpen={Boolean(selectedStatusLead)}
                    leadId={selectedStatusLead.id}
                    leadName={displayName(selectedStatusLead)}
                    currentStatus={selectedStatusLead.status || 'new'}
                    initialNote={getCleanSalesNote(selectedStatusLead)}
                    initialDate={selectedStatusLead.latestActivity?.createdAt || selectedStatusLead.updatedAt || selectedStatusLead.createdAt}
                    authorName={selectedStatusLead.latestActivity?.authorName || (selectedStatusLead as any).assignedAgentName}
                    onClose={() => setSelectedStatusLead(null)}
                    onStatusUpdated={async () => {
                        await load();
                    }}
                />
            )}
        </div>
    );
}
