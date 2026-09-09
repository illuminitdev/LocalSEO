import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Phone, RefreshCw } from 'lucide-react';
import { apiGet, cn } from '../../shared/utils';

type SalesLead = {
    id: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    nextFollowUpAt?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
    new: 'New',
    contacted: 'Contacted',
    callback: 'Callback',
    interested: 'Interested',
    not_interested: 'Not interested',
    converted: 'Converted'
};

function fmtFollowUp(value?: string | null) {
    if (!value) return null;
    try {
        return new Date(value).toLocaleString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return null;
    }
}

export default function SalesQueue() {
    const [leads, setLeads] = useState<SalesLead[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [followUpToday, setFollowUpToday] = useState(false);

    const load = async (todayOnly = followUpToday) => {
        setBusy(true);
        setError('');
        try {
            const qs = todayOnly ? '?followUpToday=1' : '';
            const data = await apiGet(`/api/sales/leads${qs}`);
            setLeads(data.leads || []);
        } catch (err: any) {
            setError(err.message || 'Could not load work queue');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={() => {
                        const next = !followUpToday;
                        setFollowUpToday(next);
                        load(next);
                    }}
                    className={cn(
                        'rounded-xl border px-3 py-2 text-xs font-bold',
                        followUpToday
                            ? 'border-[#F59E0B] bg-[#F59E0B] text-[#0F172A]'
                            : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]'
                    )}
                >
                    Due today
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => load()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                    <RefreshCw className={cn('w-3.5 h-3.5', busy && 'animate-spin')} />
                    Refresh
                </button>
            </div>

            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                {!leads.length ? (
                    <p className="p-8 text-sm text-[#64748B] text-center">
                        {followUpToday
                            ? 'No follow-ups due today.'
                            : 'No leads assigned yet. Your manager will assign work from Admin CRM.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-[#F1F5F9]">
                        {leads.map((lead) => {
                            const followUp = fmtFollowUp(lead.nextFollowUpAt);
                            return (
                                <li key={lead.id}>
                                    <Link
                                        to={`/sales/leads/${lead.id}`}
                                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F8FAFC] group"
                                    >
                                        <div className="h-10 w-10 rounded-xl bg-[#F1F5F9] text-[#0F172A] flex items-center justify-center shrink-0">
                                            <Phone className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold truncate">{lead.name || 'Unnamed'}</p>
                                            <p className="text-xs text-[#64748B] truncate mt-0.5">
                                                {lead.phone || 'No phone'}
                                                {lead.email ? ` · ${lead.email}` : ''}
                                            </p>
                                            {followUp && (
                                                <p className="text-[11px] text-amber-700 mt-1">Follow up {followUp}</p>
                                            )}
                                        </div>
                                        <span className="shrink-0 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#475569]">
                                            {STATUS_LABEL[lead.status] || lead.status}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#0F172A] shrink-0" />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
