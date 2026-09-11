import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
    Phone,
    PhoneCall,
    RefreshCw,
    Search,
    Sparkles,
    Building2,
    Clock,
    Send,
    ArrowUpRight,
    CheckCircle2
} from 'lucide-react';
import {
    type SalesLeadActivity,
    fetchSalesActivities,
    logSalesLeadActivity,
    fetchSalesLeadCrm
} from './salesApi';
import { apiGet, cn } from '../../shared/utils';
import { DISPOSITIONS } from './LogCallModal';

const DISPOSITION_CONFIG: Record<string, { label: string; bg: string }> = {
    connected: { label: 'Connected', bg: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
    callback_requested: { label: 'Callback Requested', bg: 'bg-amber-50 border-amber-300 text-amber-800' },
    voicemail: { label: 'Voicemail', bg: 'bg-blue-50 border-blue-300 text-blue-800' },
    not_interested: { label: 'Not Interested', bg: 'bg-rose-50 border-rose-300 text-rose-800' },
    converted: { label: 'Converted 🎉', bg: 'bg-purple-50 border-purple-300 text-purple-800 font-bold' },
    other: { label: 'Other', bg: 'bg-slate-50 border-slate-300 text-slate-800' }
};

export default function SalesActivityLogs() {
    const [searchParams] = useSearchParams();
    const queryLeadId = searchParams.get('leadId') || '';

    const [activities, setActivities] = useState<SalesLeadActivity[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Inline Log Call Form state
    const [selectedLeadId, setSelectedLeadId] = useState<string>(queryLeadId);
    const [disposition, setDisposition] = useState<string>('connected');
    const [callNotes, setCallNotes] = useState('');
    const [nextFollowUp, setNextFollowUp] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Filters for Timeline
    const [selectedDispositionFilter, setSelectedDispositionFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [activityList, leadsRes] = await Promise.all([
                fetchSalesActivities({
                    disposition: selectedDispositionFilter !== 'all' ? selectedDispositionFilter : undefined
                }),
                apiGet('/api/sales/leads').catch(() => ({ leads: [] }))
            ]);

            setActivities(activityList);
            let fetchedLeads: any[] = leadsRes.leads || [];

            // If queryLeadId was provided in URL and is not in list, fetch its CRM profile specifically
            if (queryLeadId && !fetchedLeads.some((l) => l.id === queryLeadId)) {
                try {
                    const crmData = await fetchSalesLeadCrm(queryLeadId);
                    if (crmData?.lead) {
                        fetchedLeads = [
                            {
                                id: crmData.lead.id,
                                name: crmData.lead.businessName || 'Lead',
                                phone: crmData.lead.phone || '',
                                email: crmData.lead.email || ''
                            },
                            ...fetchedLeads
                        ];
                    }
                } catch { /* ignore fallback */ }
            }

            setLeads(fetchedLeads);

            // Maintain or select target lead
            if (queryLeadId) {
                setSelectedLeadId(queryLeadId);
            } else if (!selectedLeadId && fetchedLeads.length > 0) {
                setSelectedLeadId(fetchedLeads[0].id);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load call logs');
        } finally {
            setLoading(false);
        }
    }, [selectedDispositionFilter, queryLeadId, selectedLeadId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handle Inline Log Call Submission
    const handleLogCall = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedLeadId) {
            setError('Please select a lead to log this call.');
            return;
        }
        if (!callNotes.trim()) {
            setError('Please enter call notes & discussion summary.');
            return;
        }

        setSubmitting(true);
        setError('');
        setSuccessMsg('');
        try {
            await logSalesLeadActivity(selectedLeadId, {
                disposition,
                note: callNotes.trim(),
                nextFollowUpAt: nextFollowUp ? new Date(nextFollowUp).toISOString() : null
            });

            setCallNotes('');
            setNextFollowUp('');
            setSuccessMsg('Call activity logged successfully to CRM!');
            setTimeout(() => setSuccessMsg(''), 4000);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to log call activity.');
        } finally {
            setSubmitting(false);
        }
    };

    const currentSelectedLead = leads.find((l) => l.id === selectedLeadId);

    const filteredActivities = activities.filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (a.note && a.note.toLowerCase().includes(q)) ||
            (a.leadBusinessName && a.leadBusinessName.toLowerCase().includes(q)) ||
            (a.leadPhone && a.leadPhone.includes(q)) ||
            (a.disposition && a.disposition.toLowerCase().includes(q))
        );
    });

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#334155] text-white p-6 rounded-3xl shadow-sm">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                            <PhoneCall className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-white">Call Logs & Activity</h1>
                            <p className="text-xs text-slate-300 mt-0.5">
                                Log customer conversations, track call dispositions, and manage communication history.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadData()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-2xs"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl">
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* 2-Column Layout: Left = Log Call & Activity Form Card, Right = Call Logs Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Log Call & Activity Card */}
                <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm sticky top-6">
                    <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-[#F1F5F9]">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#F59E0B]">
                            <Phone className="w-4 h-4" />
                        </div>
                        <h2 className="text-base font-black text-[#0F172A]">Log Call & Activity</h2>
                    </div>

                    <form onSubmit={handleLogCall} className="space-y-4">
                        {/* Lead Selection */}
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                                Target Lead *
                            </label>
                            {loading && leads.length === 0 ? (
                                <div className="flex items-center gap-2 text-xs text-[#94A3B8] p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F59E0B]" />
                                    <span>Loading assigned leads…</span>
                                </div>
                            ) : leads.length === 0 ? (
                                <div className="text-xs text-[#64748B] p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1">
                                    <p className="font-bold text-[#0F172A]">No assigned leads found</p>
                                    <p className="text-[11px] text-[#94A3B8]">
                                        You don't have assigned leads in your queue yet.{' '}
                                        <Link to="/sales" className="text-amber-700 font-bold hover:underline">
                                            View Dashboard
                                        </Link>
                                    </p>
                                </div>
                            ) : (
                                <select
                                    value={selectedLeadId}
                                    onChange={(e) => setSelectedLeadId(e.target.value)}
                                    className="w-full text-xs font-bold px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                                >
                                    {leads.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.name} {l.phone ? `(${l.phone})` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}

                            {currentSelectedLead && (
                                <div className="mt-2 p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-[#0F172A] truncate">
                                            {currentSelectedLead.name}
                                        </p>
                                        {currentSelectedLead.phone && (
                                            <a
                                                href={`tel:${currentSelectedLead.phone}`}
                                                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-800 hover:underline"
                                            >
                                                <Phone className="w-3 h-3 text-amber-600" />
                                                {currentSelectedLead.phone}
                                            </a>
                                        )}
                                    </div>
                                    <Link
                                        to={`/sales/leads/${encodeURIComponent(currentSelectedLead.id)}`}
                                        className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-white border border-amber-200 px-2.5 py-1 rounded-lg shrink-0 inline-flex items-center gap-0.5 shadow-2xs hover:bg-amber-100/50"
                                    >
                                        Profile
                                        <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                </div>
                            )}
                        </div>

                        {/* Call Disposition */}
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                                Call Disposition
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {DISPOSITIONS.map((d) => (
                                    <button
                                        key={d.value}
                                        type="button"
                                        onClick={() => setDisposition(d.value)}
                                        className={cn(
                                            'px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate',
                                            disposition === d.value
                                                ? `${d.bg} ring-2 ring-[#0F172A] font-extrabold shadow-2xs`
                                                : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] hover:bg-white hover:border-[#CBD5E1]'
                                        )}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                                Call Notes & Discussion Summary *
                            </label>
                            <textarea
                                required
                                rows={3}
                                value={callNotes}
                                onChange={(e) => setCallNotes(e.target.value)}
                                placeholder="Summary of what the customer said, objections, next steps…"
                                className="w-full text-xs p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                            />
                        </div>

                        {/* Schedule Next Follow-Up */}
                        <div>
                            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                                Schedule Next Follow-Up (Optional)
                            </label>
                            <input
                                type="datetime-local"
                                value={nextFollowUp}
                                onChange={(e) => setNextFollowUp(e.target.value)}
                                className="w-full text-xs px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                            />
                            <p className="text-[10px] text-[#94A3B8] mt-1">
                                Automatically creates a Self Reminder in your queue.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={submitting || !selectedLeadId || !callNotes.trim()}
                            className="w-full py-3 bg-[#0F172A] hover:bg-[#1E293B] text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-2"
                        >
                            <Send className="w-3.5 h-3.5 text-[#F59E0B]" />
                            <span>{submitting ? 'Logging to CRM…' : 'Log Activity to CRM'}</span>
                        </button>
                    </form>
                </div>

                {/* Right Column: Activities Timeline & History */}
                <div className="lg:col-span-7 space-y-4">
                    {/* Filters Bar */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                            <div className="relative flex-1 min-w-[180px]">
                                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search notes, lead, phone…"
                                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                                />
                            </div>

                            <select
                                value={selectedDispositionFilter}
                                onChange={(e) => setSelectedDispositionFilter(e.target.value)}
                                className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                            >
                                <option value="all">All Dispositions ({activities.length})</option>
                                {DISPOSITIONS.map((d) => (
                                    <option key={d.value} value={d.value}>
                                        {d.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Timeline List */}
                    <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#F1F5F9]">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[#F59E0B]" />
                                <h3 className="text-sm font-black text-[#0F172A]">Logged Call History</h3>
                                <span className="bg-[#F1F5F9] text-[#475569] text-xs font-bold px-2 py-0.5 rounded-full">
                                    {filteredActivities.length}
                                </span>
                            </div>
                        </div>

                        {loading && !activities.length ? (
                            <div className="p-12 text-center text-[#64748B]">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                                <p className="text-sm font-semibold">Loading call logs…</p>
                            </div>
                        ) : !filteredActivities.length ? (
                            <div className="p-12 text-center text-[#64748B]">
                                <Sparkles className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                                <p className="text-sm font-bold text-[#0F172A]">No call activities found</p>
                                <p className="text-xs mt-1 text-[#94A3B8]">
                                    {selectedDispositionFilter === 'all'
                                        ? 'Use the Log Call & Activity form on the left to record your customer conversations.'
                                        : 'No call logs match the selected disposition filter.'}
                                </p>
                            </div>
                        ) : (
                            <div className="relative pl-4 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
                                {filteredActivities.map((act) => {
                                    const dispConf = act.disposition ? DISPOSITION_CONFIG[act.disposition] : null;

                                    return (
                                        <div key={act.id} className="relative group">
                                            <span className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-[#F59E0B] border-2 border-white shadow-xs" />
                                            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 transition-all group-hover:border-[#CBD5E1] group-hover:bg-white shadow-2xs">
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {act.leadBusinessName && (
                                                            <Link
                                                                to={`/sales/leads/${encodeURIComponent(act.leadId)}`}
                                                                className="inline-flex items-center gap-1 font-extrabold text-xs text-amber-700 hover:text-amber-800 hover:underline"
                                                            >
                                                                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                                                                <span>{act.leadBusinessName}</span>
                                                                <ArrowUpRight className="w-3 h-3 text-amber-500" />
                                                            </Link>
                                                        )}

                                                        {dispConf && (
                                                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border', dispConf.bg)}>
                                                                {dispConf.label}
                                                            </span>
                                                        )}

                                                        {act.leadPhone && (
                                                            <a
                                                                href={`tel:${act.leadPhone}`}
                                                                className="inline-flex items-center gap-1 text-[#64748B] hover:text-[#0F172A] font-medium bg-white px-2 py-0.5 rounded border text-[11px]"
                                                            >
                                                                <Phone className="w-3 h-3" />
                                                                {act.leadPhone}
                                                            </a>
                                                        )}
                                                    </div>

                                                    <span className="text-[11px] text-[#94A3B8] font-medium flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(act.createdAt).toLocaleString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                </div>

                                                <p className="text-xs text-[#0F172A] font-medium whitespace-pre-wrap leading-relaxed">
                                                    {act.note}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
