import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, ExternalLink, RefreshCw, Search, CheckSquare } from 'lucide-react';
import { adminGet, fetchSalesAgents, type SalesAgent } from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { cn } from '../../shared/utils';

type ContactFilter = 'any' | 'email' | 'phone' | 'both';

type GrowthAuditLead = {
    id: string;
    createdAt: string;
    businessName: string | null;
    service: string | null;
    serviceLabel: string | null;
    address: string | null;
    city: string | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    scoreTotal: number | null;
    sharePath: string | null;
    reportUrl: string | null;
    source: string | null;
    auditId: string | null;
};

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
    const [leads, setLeads] = useState<GrowthAuditLead[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [draftQuery, setDraftQuery] = useState('');
    const [hasContact, setHasContact] = useState<ContactFilter>('any');

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
                            placeholder="Search business, email, phone…"
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
                        <p className="text-sm text-[#64748B]">No growth audit leads yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[780px] table-fixed">
                            <colgroup>
                                <col className="w-[130px]" />
                                <col className="w-[220px]" />
                                <col className="w-[140px]" />
                                <col className="w-[200px]" />
                                <col className="w-[80px]" />
                                <col className="w-[80px]" />
                                <col className="w-[140px]" />
                            </colgroup>
                            <thead>
                                <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B]">
                                    <th className="px-3 py-2.5 font-bold">Date</th>
                                    <th className="px-3 py-2.5 font-bold">Business</th>
                                    <th className="px-3 py-2.5 font-bold">Service</th>
                                    <th className="px-3 py-2.5 font-bold">Email</th>
                                    <th className="px-3 py-2.5 font-bold">Score</th>
                                    <th className="px-3 py-2.5 font-bold">Report</th>
                                    <th className="px-3 py-2.5 font-bold text-right">CRM & Tasks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9]">
                                {leads.map((lead) => (
                                    <tr key={lead.id} className="group">
                                        <td className="px-3 py-2.5 text-xs text-[#64748B] whitespace-nowrap truncate">
                                            {fmtDate(lead.createdAt)}
                                        </td>
                                        <td className="px-3 py-2.5 text-sm font-semibold text-[#0F172A] max-w-0">
                                            <button
                                                type="button"
                                                onClick={() => setActiveLead(lead)}
                                                title={lead.businessName || undefined}
                                                className="block w-full text-left truncate group-hover:font-bold hover:text-[#D97706]"
                                            >
                                                {lead.businessName || '—'}
                                            </button>
                                        </td>
                                        <td
                                            className="px-3 py-2.5 text-sm text-[#334155] truncate"
                                            title={lead.serviceLabel || lead.service || undefined}
                                        >
                                            {lead.serviceLabel || lead.service || '—'}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {!loading && leads.length > 0 && (
                <p className="text-xs text-[#94A3B8]">
                    Showing {leads.length} lead{leads.length === 1 ? '' : 's'} (newest first).
                </p>
            )}

            {/* Slide-over CRM Drawer */}
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

