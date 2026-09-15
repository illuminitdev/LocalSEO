import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ClipboardList,
    ExternalLink,
    RefreshCw,
    Search,
    CheckSquare,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { adminGet, fetchSalesAgents, type SalesAgent } from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { cn } from '../../shared/utils';

type ContactFilter = 'any' | 'email' | 'phone' | 'both';

type AdminLead = GrowthAuditLeadRef & {
    type?: string | null;
    status?: string | null;
    name?: string | null;
    service?: string | null;
    serviceLabel?: string | null;
    createdAt: string;
    auditId?: string | null;
};

const PAGE_SIZE = 10;

const TYPE_LABELS: Record<string, string> = {
    growth_audit_lead: 'Growth audit',
    contact: 'Contact',
    audit_intake: 'Start',
    visibility_check: 'Visibility',
    checkout_lead: 'Checkout'
};

function typeLabel(type?: string | null) {
    if (!type) return 'Lead';
    return TYPE_LABELS[type] || type;
}

function statusBadge(status?: string | null) {
    const s = String(status || '')
        .trim()
        .toLowerCase();
    if (s === 'otp_pending' || s === 'pending') {
        return { label: 'OTP pending', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    if (s === 'unverified') {
        return { label: 'Unverified', className: 'bg-orange-50 text-orange-800 border-orange-200' };
    }
    if (s === 'completed') {
        return { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    }
    if (s === 'converted') {
        return { label: 'Converted', className: 'bg-sky-50 text-sky-800 border-sky-200' };
    }
    if (s === 'submitted') {
        return { label: 'Submitted', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    if (!s) return null;
    return { label: s, className: 'bg-slate-100 text-slate-600 border-slate-200' };
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
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    } catch {
        return '—';
    }
}

export default function AdminGrowthAuditLeads() {
    const [leads, setLeads] = useState<AdminLead[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [draftQuery, setDraftQuery] = useState('');
    const [hasContact, setHasContact] = useState<ContactFilter>('any');
    const [page, setPage] = useState(1);

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

    const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageLeads = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return leads.slice(start, start + PAGE_SIZE);
    }, [leads, safePage]);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const rangeStart = leads.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, leads.length);

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

                {loading && !leads.length ? (
                    <p className="p-8 text-center text-sm text-[#64748B]">Loading leads…</p>
                ) : !leads.length ? (
                    <div className="p-10 text-center">
                        <ClipboardList className="w-8 h-8 text-[#CBD5E1] mx-auto mb-3" />
                        <p className="text-sm text-[#64748B]">No leads yet</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[920px] table-fixed">
                                <colgroup>
                                    <col className="w-[90px]" />
                                    <col className="w-[120px]" />
                                    <col className="w-[110px]" />
                                    <col className="w-[200px]" />
                                    <col className="w-[180px]" />
                                    <col className="w-[70px]" />
                                    <col className="w-[70px]" />
                                    <col className="w-[130px]" />
                                </colgroup>
                                <thead>
                                    <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B]">
                                        <th className="px-3 py-2.5 font-bold">Date</th>
                                        <th className="px-3 py-2.5 font-bold">Type</th>
                                        <th className="px-3 py-2.5 font-bold">Status</th>
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
                                            <tr key={lead.id} className="group">
                                                <td className="px-3 py-2.5 text-xs text-[#64748B] whitespace-nowrap truncate">
                                                    {fmtDate(lead.createdAt)}
                                                </td>
                                                <td className="px-3 py-2.5 text-xs font-semibold text-[#334155]">
                                                    <div className="truncate" title={typeLabel(lead.type)}>
                                                        {typeLabel(lead.type)}
                                                    </div>
                                                    {lead.source && lead.source !== lead.type ? (
                                                        <div
                                                            className="text-[10px] font-medium text-[#94A3B8] truncate"
                                                            title={lead.source}
                                                        >
                                                            {lead.source}
                                                        </div>
                                                    ) : null}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    {badge ? (
                                                        <span
                                                            className={cn(
                                                                'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border',
                                                                badge.className
                                                            )}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-[#94A3B8]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A] max-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveLead(lead)}
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
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveLead(lead)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold rounded-lg transition-colors"
                                                    >
                                                        <CheckSquare className="w-3.5 h-3.5 text-[#D97706]" />
                                                        Manage Tasks
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-3 sm:px-4 py-3 border-t border-[#E2E8F0] bg-[#FCFDFE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[#64748B]">
                                Showing {rangeStart}–{rangeEnd} of {leads.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Previous
                                </button>
                                <span className="text-xs font-bold text-[#475569] tabular-nums px-1">
                                    {safePage} / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {activeLead && (
                <LeadCrmDrawer
                    lead={activeLead}
                    salesAgents={salesAgents}
                    onClose={() => setActiveLead(null)}
                    onTaskUpdated={load}
                />
            )}
        </div>
    );
}
