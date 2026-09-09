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

function fmtDateTime(value?: string | null) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '—';
    }
}

function townLine(lead: GrowthAuditLead) {
    const parts = [lead.city, lead.address].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
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
        <div className="space-y-4 max-w-7xl">
            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#FCFDFE] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                        <input
                            value={draftQuery}
                            onChange={(e) => setDraftQuery(e.target.value)}
                            placeholder="Search business, email, phone…"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25 bg-white"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                        <table className="w-full text-left min-w-[950px]">
                            <thead>
                                <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B]">
                                    <th className="px-4 py-3 font-bold">Date</th>
                                    <th className="px-4 py-3 font-bold">Business</th>
                                    <th className="px-4 py-3 font-bold">Service</th>
                                    <th className="px-4 py-3 font-bold">Town / address</th>
                                    <th className="px-4 py-3 font-bold">Email</th>
                                    <th className="px-4 py-3 font-bold">Phone</th>
                                    <th className="px-4 py-3 font-bold">Score</th>
                                    <th className="px-4 py-3 font-bold">Report</th>
                                    <th className="px-4 py-3 font-bold text-right">CRM & Tasks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9]">
                                {leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-[#FFFBEB] transition-colors">
                                        <td className="px-4 py-3 text-xs text-[#64748B] whitespace-nowrap">
                                            {fmtDateTime(lead.createdAt)}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">
                                            <button
                                                type="button"
                                                onClick={() => setActiveLead(lead)}
                                                className="text-left hover:text-[#F59E0B] hover:underline"
                                            >
                                                {lead.businessName || '—'}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[#334155]">
                                            {lead.serviceLabel || lead.service || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[#64748B] max-w-[200px]">
                                            <span className="line-clamp-2">{townLine(lead)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[#334155]">
                                            {lead.email || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[#334155] whitespace-nowrap">
                                            {lead.phone || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-bold text-[#0F172A] whitespace-nowrap">
                                            {lead.scoreTotal != null ? `${lead.scoreTotal}/100` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
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
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setActiveLead(lead)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold rounded-xl shadow-xs transition-colors"
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

