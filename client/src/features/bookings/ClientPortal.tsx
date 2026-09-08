import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, FileText, Plus, ShieldCheck } from 'lucide-react';
import { apiGet, apiPost, cn, formatCents } from '../../shared/utils';

export default function ClientPortal() {
    const { token } = useParams();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showRequest, setShowRequest] = useState(false);
    const [busy, setBusy] = useState(false);
    const [info, setInfo] = useState('');
    const [form, setForm] = useState({ eventSlug: '', preferredAt: '', description: '', photoUrl: '' });

    const load = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await apiGet(`/api/public/portal/${token}`);
            setData(res);
            setForm((f) => ({
                ...f,
                eventSlug: f.eventSlug || res.eventTypes?.[0]?.slug || ''
            }));
            setError('');
        } catch (e: any) {
            setError(e.message || 'Portal link invalid or expired');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const upcoming = useMemo(() => {
        const now = Date.now();
        return (data?.bookings || []).filter((b: any) => {
            if (b.status === 'cancelled' || b.job_status === 'cancelled') return false;
            if (b.job_status === 'completed' || b.job_status === 'invoiced' || b.status === 'done') return false;
            return new Date(b.start_at).getTime() >= now || b.job_status === 'requested';
        });
    }, [data]);

    const history = useMemo(() => {
        return (data?.bookings || []).filter((b: any) => {
            return (
                b.status === 'cancelled' ||
                b.job_status === 'cancelled' ||
                b.job_status === 'completed' ||
                b.job_status === 'invoiced' ||
                b.status === 'done' ||
                new Date(b.start_at).getTime() < Date.now()
            );
        });
    }, [data]);

    const openInvoices = useMemo(() => {
        return (data?.invoices || []).filter((i: any) => i.status !== 'paid' && i.stripe_hosted_url);
    }, [data]);

    const submitRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token || !form.eventSlug) return;
        setBusy(true);
        setInfo('');
        setError('');
        try {
            await apiPost(`/api/public/portal/${token}/request`, {
                eventSlug: form.eventSlug,
                preferredAt: form.preferredAt || undefined,
                description: form.description.trim(),
                photoUrls: form.photoUrl.trim() ? [form.photoUrl.trim()] : []
            });
            setShowRequest(false);
            setForm((f) => ({ ...f, preferredAt: '', description: '', photoUrl: '' }));
            setInfo('Request submitted — the business will confirm a time.');
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not submit request');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center font-bold text-[#64748B]">Loading your hub…</div>;
    }

    if (error && !data) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
                <p className="text-red-600 font-bold">{error}</p>
                <p className="text-sm text-[#64748B] mt-2">Ask the business to send a fresh client hub link.</p>
            </div>
        );
    }

    const org = data.organization;
    const client = data.client;

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-8 px-4">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="bg-[#0F172A] text-white rounded-2xl px-5 py-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">Client hub</p>
                    <h1 className="text-2xl font-black mt-1">{org.name}</h1>
                    <p className="text-sm text-white/70 mt-1">
                        Signed in as <strong className="text-white">{client.name}</strong>
                        {client.email ? ` · ${client.email}` : ''}
                    </p>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-4 py-2">{info}</p>}

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setShowRequest((v) => !v)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2.5 text-sm font-bold"
                    >
                        <Plus className="w-4 h-4" /> New work request
                    </button>
                    {org.slug && (
                        <Link
                            to={`/book/${org.slug}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-bold text-[#0F172A]"
                        >
                            Open booking page
                        </Link>
                    )}
                </div>

                {showRequest && (
                    <form onSubmit={submitRequest} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                        <h2 className="font-bold text-[#0F172A]">Request a visit</h2>
                        <label className="block text-xs font-bold text-[#64748B]">
                            Service
                            <select
                                required
                                value={form.eventSlug}
                                onChange={(e) => setForm((f) => ({ ...f, eventSlug: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            >
                                {(data.eventTypes || []).map((et: any) => (
                                    <option key={et.slug} value={et.slug}>
                                        {et.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-xs font-bold text-[#64748B]">
                            Preferred date & time
                            <input
                                type="datetime-local"
                                value={form.preferredAt}
                                onChange={(e) => setForm((f) => ({ ...f, preferredAt: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="block text-xs font-bold text-[#64748B]">
                            Description
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                rows={3}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="block text-xs font-bold text-[#64748B]">
                            Photo URL (optional)
                            <input
                                type="url"
                                value={form.photoUrl}
                                onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={busy}
                            className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                        >
                            {busy ? 'Sending…' : 'Submit request'}
                        </button>
                    </form>
                )}

                {openInvoices.length > 0 && (
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                        <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1.5 mb-3">
                            <FileText className="w-3.5 h-3.5" /> Pay invoices
                        </h2>
                        <ul className="space-y-2">
                            {openInvoices.map((inv: any) => (
                                <li
                                    key={inv.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[#F1F5F9] px-3 py-2"
                                >
                                    <div>
                                        <p className="font-bold text-[#0F172A]">{formatCents(inv.amount_cents, org.currency)}</p>
                                        <p className="text-xs text-[#64748B]">{inv.status}</p>
                                    </div>
                                    <a
                                        href={inv.stripe_hosted_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg bg-[#F59E0B] text-[#0F172A] px-3 py-1.5 text-xs font-bold"
                                    >
                                        Pay now
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1.5 mb-3">
                        <Calendar className="w-3.5 h-3.5" /> Upcoming
                    </h2>
                    {!upcoming.length ? (
                        <p className="text-sm text-[#64748B]">No upcoming appointments.</p>
                    ) : (
                        <ul className="space-y-2">
                            {upcoming.map((b: any) => (
                                <li key={b.id} className="rounded-xl border border-[#F1F5F9] px-3 py-2">
                                    <div className="flex justify-between gap-2">
                                        <p className="font-bold text-[#0F172A]">{b.event_name || 'Appointment'}</p>
                                        <span className="text-[10px] font-bold uppercase text-[#64748B]">
                                            {b.job_status || b.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#64748B] mt-0.5">
                                        {new Date(b.start_at).toLocaleString('en-GB')}
                                    </p>
                                    {b.manage_token && (
                                        <Link
                                            to={`/book/manage/${b.manage_token}`}
                                            className="text-[11px] font-bold text-[#F59E0B]"
                                        >
                                            Manage booking
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] mb-3">History</h2>
                    {!history.length ? (
                        <p className="text-sm text-[#64748B]">No past jobs yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {history.slice(0, 20).map((b: any) => (
                                <li key={b.id} className="rounded-xl border border-[#F1F5F9] px-3 py-2 text-sm">
                                    <div className="flex justify-between gap-2">
                                        <span className="font-medium text-[#0F172A]">{b.event_name || 'Job'}</span>
                                        <span className={cn('text-[10px] font-bold uppercase', 'text-[#64748B]')}>
                                            {b.job_status || b.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#64748B]">{new Date(b.start_at).toLocaleString('en-GB')}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <p className="text-center text-[11px] text-[#94A3B8] flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Magic-link access — keep this URL private
                </p>
            </div>
        </div>
    );
}
