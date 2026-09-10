import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../shared/utils';

const STATUSES = [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'callback', label: 'Callback' },
    { value: 'interested', label: 'Interested' },
    { value: 'not_interested', label: 'Not interested' },
    { value: 'converted', label: 'Converted' }
];

const OUTCOMES = [
    { value: 'no_answer', label: 'No answer' },
    { value: 'reached', label: 'Reached' },
    { value: 'callback', label: 'Callback' },
    { value: 'interested', label: 'Interested' },
    { value: 'not_interested', label: 'Not interested' }
];

type CallLog = {
    id: string;
    outcome: string;
    notes: string;
    createdAt: string;
};

type Lead = {
    id: string;
    name: string;
    phone: string;
    email: string;
    notes: string;
    status: string;
    source: string;
    nextFollowUpAt?: string | null;
};

function fmtWhen(value?: string | null) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString(undefined, {
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

function toDatetimeLocal(value?: string | null) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SalesLeadDetail() {
    const { id } = useParams<{ id: string }>();
    const [lead, setLead] = useState<Lead | null>(null);
    const [calls, setCalls] = useState<CallLog[]>([]);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('new');
    const [notes, setNotes] = useState('');
    const [outcome, setOutcome] = useState('reached');
    const [callNotes, setCallNotes] = useState('');
    const [followUp, setFollowUp] = useState('');

    const load = async () => {
        if (!id) return;
        setError('');
        try {
            const data = await apiGet(`/api/sales/leads/${id}`);
            setLead(data.lead);
            setCalls(data.calls || []);
            setStatus(data.lead?.status || 'new');
            setNotes(data.lead?.notes || '');
            setFollowUp(toDatetimeLocal(data.lead?.nextFollowUpAt));
        } catch (err: any) {
            setError(err.message || 'Could not load lead');
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const saveLead = async (e: FormEvent) => {
        e.preventDefault();
        if (!id) return;
        setBusy(true);
        setError('');
        setMsg('');
        try {
            const data = await apiPatch(`/api/sales/leads/${id}`, {
                status,
                notes,
                nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null
            });
            setLead(data.lead);
            setMsg('Lead updated.');
        } catch (err: any) {
            setError(err.message || 'Could not update lead');
        } finally {
            setBusy(false);
        }
    };

    const submitCall = async (e: FormEvent) => {
        e.preventDefault();
        if (!id) return;
        setBusy(true);
        setError('');
        setMsg('');
        try {
            const data = await apiPost(`/api/sales/leads/${id}/calls`, {
                outcome,
                notes: callNotes,
                nextFollowUpAt: followUp ? new Date(followUp).toISOString() : undefined
            });
            setLead(data.lead);
            setStatus(data.lead?.status || status);
            setCallNotes('');
            setMsg('Call logged.');
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not log call');
        } finally {
            setBusy(false);
        }
    };

    if (!lead && !error) {
        return <p className="text-sm text-[#64748B]">Loading lead…</p>;
    }

    if (!lead) {
        return (
            <div className="space-y-3">
                <Link to="/sales" className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B]">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
                </Link>
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Link to="/sales" className="inline-flex items-center gap-1 text-xs font-bold text-[#64748B] hover:text-[#0F172A]">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-black">{lead.name || 'Unnamed lead'}</h1>
                        <p className="text-sm text-[#64748B] mt-1">
                            {lead.source ? `Source: ${lead.source}` : 'No source'}
                        </p>
                    </div>
                    {lead.phone ? (
                        <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F172A] text-white px-3 py-2 text-xs font-bold hover:bg-[#1E293B]"
                        >
                            <Phone className="w-3.5 h-3.5" />
                            {lead.phone}
                        </a>
                    ) : null}
                </div>
                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Email</dt>
                        <dd className="mt-0.5 text-[#334155]">{lead.email || '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Phone</dt>
                        <dd className="mt-0.5 text-[#334155]">{lead.phone || '—'}</dd>
                    </div>
                </dl>
            </div>

            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>
            )}
            {msg && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                    {msg}
                </p>
            )}

            <form onSubmit={submitCall} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-black">Log call</h2>
                <label className="block text-xs font-semibold text-[#475569]">
                    Outcome
                    <select
                        required
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]/15 focus:border-[#0F172A]"
                    >
                        {OUTCOMES.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-xs font-semibold text-[#475569]">
                    Call notes
                    <textarea
                        value={callNotes}
                        onChange={(e) => setCallNotes(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]/15 focus:border-[#0F172A]"
                    />
                </label>
                <label className="block text-xs font-semibold text-[#475569]">
                    Next follow-up (optional)
                    <input
                        type="datetime-local"
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]/15 focus:border-[#0F172A]"
                    />
                </label>
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[#0F172A] text-white px-3 py-2 text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-50"
                >
                    {busy ? 'Saving…' : 'Save call'}
                </button>
            </form>

            <form onSubmit={saveLead} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-black">Lead status</h2>
                <label className="block text-xs font-semibold text-[#475569]">
                    Status
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]/15 focus:border-[#0F172A]"
                    >
                        {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-xs font-semibold text-[#475569]">
                    Notes
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F172A]/15 focus:border-[#0F172A]"
                    />
                </label>
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-semibold hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                    Update lead
                </button>
            </form>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E2E8F0]">
                    <h2 className="text-sm font-black">Call history</h2>
                </div>
                {!calls.length ? (
                    <p className="p-5 text-sm text-[#64748B]">No calls logged yet.</p>
                ) : (
                    <ul className="divide-y divide-[#F1F5F9]">
                        {calls.map((c) => (
                            <li key={c.id} className="px-5 py-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
                                    {OUTCOMES.find((o) => o.value === c.outcome)?.label || c.outcome}
                                    <span className="font-medium normal-case tracking-normal text-[#94A3B8]">
                                        {' '}
                                        · {fmtWhen(c.createdAt)}
                                    </span>
                                </p>
                                {c.notes ? <p className="text-sm text-[#334155] mt-1">{c.notes}</p> : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
