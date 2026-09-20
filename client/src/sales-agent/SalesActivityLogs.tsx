import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
    Phone,
    RefreshCw,
    Search,
    Building2,
    Clock,
    ArrowUpRight,
    ArrowRight,
    CheckCircle2,
    Check,
    Calendar,
    AlertCircle,
    X
} from 'lucide-react';
import {
    type SalesLeadActivity,
    fetchSalesActivities,
    logSalesLeadActivity,
    fetchSalesLeadCrm
} from './salesApi';
import { apiGet, cn } from '../shared/utils';

const OUTCOMES: { value: string; label: string }[] = [
    { value: 'connected', label: 'Connected' },
    { value: 'callback_requested', label: 'Callback requested' },
    { value: 'voicemail', label: 'Voicemail' },
    { value: 'not_interested', label: 'Not interested' },
    { value: 'converted', label: 'Converted' },
    { value: 'other', label: 'Other' }
];

const DISPOSITION_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
    connected: { label: 'Connected', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
    callback_requested: { label: 'Callback requested', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
    voicemail: { label: 'Voicemail', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
    not_interested: { label: 'Not interested', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300' },
    converted: { label: 'Converted', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
    other: { label: 'Other', bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-300' }
};

export default function SalesActivityLogs() {
    const [searchParams] = useSearchParams();
    const queryLeadId = searchParams.get('leadId') || '';

    const [activities, setActivities] = useState<SalesLeadActivity[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Form states
    const [selectedLeadId, setSelectedLeadId] = useState<string>(queryLeadId);
    const [disposition, setDisposition] = useState<string>('connected');
    const [callNotes, setCallNotes] = useState('');
    const [nextFollowUp, setNextFollowUp] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Filters
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
                } catch { }
            }

            setLeads(fetchedLeads);

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

    const handleLogCall = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedLeadId) {
            setError('Please select a customer to log this call.');
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

    const filteredActivities = useMemo(() => {
        return activities.filter((a) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                (a.note && a.note.toLowerCase().includes(q)) ||
                (a.leadBusinessName && a.leadBusinessName.toLowerCase().includes(q)) ||
                (a.leadPhone && a.leadPhone.includes(q)) ||
                (a.disposition && a.disposition.toLowerCase().includes(q))
            );
        });
    }, [activities, searchQuery]);

    return (
        <div className="space-y-5 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                        Call Logs & Activity
                    </h1>
                    <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                        Log customer conversations, track call outcomes, and keep follow-ups organized.
                    </p>
                </div>

                <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadData()}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-bold rounded-xl transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                    <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', loading && 'animate-spin text-orange-500')} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-2xl flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="text-rose-600 hover:text-rose-950 cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Success Message */}
            {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{successMsg}</span>
                    </div>
                    <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-700 hover:text-emerald-950 cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Column: Log a call Form Card */}
                <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-2.5 pb-2">
                        <div className="w-8 h-8 rounded-full bg-orange-50/80 border border-orange-100 flex items-center justify-center text-[#F97316]">
                            <Phone className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm sm:text-base font-bold text-slate-900">Log a call</h2>
                    </div>

                    <form onSubmit={handleLogCall} className="space-y-4">
                        {/* Customer select */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Customer
                            </label>
                            {loading && leads.length === 0 ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400 p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                                    <span>Loading customers...</span>
                                </div>
                            ) : (
                                <select
                                    value={selectedLeadId}
                                    onChange={(e) => setSelectedLeadId(e.target.value)}
                                    className="w-full text-xs font-medium px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors cursor-pointer"
                                >
                                    <option value="">Select a customer</option>
                                    {leads.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.name} {l.phone ? `(${l.phone})` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}

                            {/* View profile button */}
                            <div className="flex justify-end mt-2">
                                {selectedLeadId ? (
                                    <Link
                                        to={`/sales/leads/${encodeURIComponent(selectedLeadId)}`}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F97316] hover:text-[#EA580C] bg-orange-50/60 hover:bg-orange-50 border border-orange-200/80 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                                    >
                                        <span>View profile</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg cursor-not-allowed">
                                        <span>View profile</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Call outcome selector (6 options in 2 columns) */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Call outcome
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {OUTCOMES.map((o) => {
                                    const isSelected = disposition === o.value;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() => setDisposition(o.value)}
                                            className={cn(
                                                'py-2 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center',
                                                isSelected
                                                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold shadow-2xs'
                                                    : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                            )}
                                        >
                                            {isSelected && (
                                                <div className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                </div>
                                            )}
                                            <span className="truncate">{o.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Call notes */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Call notes
                            </label>
                            <div className="relative">
                                <textarea
                                    id="call-notes-input"
                                    required
                                    rows={3}
                                    maxLength={500}
                                    value={callNotes}
                                    onChange={(e) => setCallNotes(e.target.value)}
                                    placeholder="Add a short summary, customer questions, and agreed next steps..."
                                    className="w-full text-xs p-3 pb-6 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                                />
                                <span className="absolute right-3 bottom-2 text-[10px] text-slate-400 font-medium">
                                    {callNotes.length}/500
                                </span>
                            </div>
                        </div>

                        {/* Schedule follow-up */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                Schedule follow-up (optional)
                            </label>
                            <div className="relative">
                                <input
                                    type="datetime-local"
                                    value={nextFollowUp}
                                    onChange={(e) => setNextFollowUp(e.target.value)}
                                    className="w-full text-xs pl-3 pr-8 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                                />
                                <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Creates a reminder in your queue.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={submitting || !selectedLeadId || !callNotes.trim()}
                            className="w-full py-3 bg-[#0A1628] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 mt-1"
                        >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{submitting ? 'Saving call log...' : 'Save call log'}</span>
                        </button>
                    </form>
                </div>

                {/* Right Column: Filter Bar + Recent Activity Card */}
                <div className="lg:col-span-7 space-y-3">
                    {/* Top Search & Filter Bar */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-3 shadow-xs">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search customer, phone, or notes..."
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F97316] focus:bg-white transition-colors"
                            />
                        </div>

                        <select
                            value={selectedDispositionFilter}
                            onChange={(e) => setSelectedDispositionFilter(e.target.value)}
                            className="px-3 py-1.5 text-xs font-semibold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-slate-800 focus:outline-none focus:border-[#F97316] cursor-pointer"
                        >
                            <option value="all">All outcomes</option>
                            {OUTCOMES.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Recent Activity Card */}
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-5">
                            <h2 className="text-sm sm:text-base font-bold text-slate-900">Recent activity</h2>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                {filteredActivities.length}
                            </span>
                        </div>

                        {/* Loading State */}
                        {loading && !activities.length ? (
                            <div className="py-16 text-center text-slate-500">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F97316]" />
                                <p className="text-xs font-semibold">Loading call logs...</p>
                            </div>
                        ) : !filteredActivities.length ? (
                            /* Empty State matching mockup exactly */
                            <div className="py-14 sm:py-16 text-center">
                                <div className="w-14 h-14 rounded-full bg-slate-100/80 flex items-center justify-center text-slate-400 mx-auto mb-3">
                                    <Phone className="w-6 h-6 stroke-[1.5] text-slate-400" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-900">No calls logged yet</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Your customer conversations will appear here once you save a call.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => document.getElementById('call-notes-input')?.focus()}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#F97316] hover:text-[#EA580C] hover:underline mt-4 cursor-pointer"
                                >
                                    <span>Log your first call</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            /* Feed of Logged Calls */
                            <div className="divide-y divide-slate-100 -mx-2 sm:-mx-3">
                                {filteredActivities.map((act) => {
                                    const dispConf = act.disposition
                                        ? DISPOSITION_CONFIG[act.disposition] || { label: act.disposition, bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' }
                                        : null;

                                    return (
                                        <div key={act.id} className="p-3 sm:p-4 hover:bg-[#F8FAFC] rounded-xl transition-colors">
                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {act.leadBusinessName && (
                                                        <Link
                                                            to={`/sales/leads/${encodeURIComponent(act.leadId)}`}
                                                            className="inline-flex items-center gap-1 font-bold text-xs text-[#F97316] hover:text-[#EA580C] hover:underline"
                                                        >
                                                            <Building2 className="w-3.5 h-3.5 text-[#F97316]" />
                                                            <span>{act.leadBusinessName}</span>
                                                            <ArrowUpRight className="w-3 h-3 text-[#F97316]" />
                                                        </Link>
                                                    )}

                                                    {dispConf && (
                                                        <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-lg border', dispConf.bg, dispConf.text, dispConf.border)}>
                                                            {dispConf.label}
                                                        </span>
                                                    )}

                                                    {act.leadPhone && (
                                                        <a
                                                            href={`tel:${act.leadPhone}`}
                                                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium bg-slate-100 px-2 py-0.5 rounded-md text-[11px]"
                                                        >
                                                            <Phone className="w-3 h-3" />
                                                            {act.leadPhone}
                                                        </a>
                                                    )}
                                                </div>

                                                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(act.createdAt).toLocaleString(undefined, {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>

                                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap pl-1">
                                                {act.note}
                                            </p>
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
