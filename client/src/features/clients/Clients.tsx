import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Search, UserRound, Calendar, FileText } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiDelete, cn, formatCents, restrictPhoneInput } from '../../shared/utils';

type ClientRow = {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    notes?: string;
    address?: string;
    booking_count?: number;
};

function statusBadge(status: string) {
    if (status === 'lead') return 'bg-amber-50 text-amber-800 border-amber-200';
    if (status === 'inactive') return 'bg-slate-100 text-slate-600 border-slate-200';
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
}

function ClientsList() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [clients, setClients] = useState<ClientRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [q, setQ] = useState(searchParams.get('q') || '');
    const [status, setStatus] = useState(searchParams.get('status') || '');
    const [showCreate, setShowCreate] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        status: 'lead',
        notes: ''
    });

    const load = async (query = q, st = status) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set('q', query.trim());
            if (st) params.set('status', st);
            const res = await apiGet(`/api/host/clients${params.toString() ? `?${params}` : ''}`);
            setClients(res.clients || []);
        } catch (e: any) {
            setError(e.message || 'Could not load clients');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const createClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setBusy(true);
        setError('');
        try {
            const res = await apiPost('/api/host/clients', {
                name: form.name.trim(),
                email: form.email.trim(),
                phone: form.phone.trim(),
                address: form.address.trim(),
                status: form.status,
                notes: form.notes.trim()
            });
            setShowCreate(false);
            setForm({ name: '', email: '', phone: '', address: '', status: 'lead', notes: '' });
            if (res.client?.id) navigate(`/clients/${res.client.id}`);
            else await load();
        } catch (err: any) {
            setError(err.message || 'Could not create client');
        } finally {
            setBusy(false);
        }
    };

    const runSearch = () => {
        const next = new URLSearchParams();
        if (q.trim()) next.set('q', q.trim());
        if (status) next.set('status', status);
        setSearchParams(next);
        load(q, status);
    };

    return (
        <div className="w-full space-y-4">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6 lg:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                    <h1 className="font-black text-xl">Clients</h1>
                    <p className="text-sm text-white/60 mt-1">Customer records linked to bookings and invoices</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowCreate((v) => !v)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2.5 text-sm font-bold"
                >
                    <Plus className="w-4 h-4" /> Add client
                </button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            {showCreate && (
                <form onSubmit={createClient} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                    <h2 className="font-bold text-[#0F172A]">New client</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-xs font-bold text-[#64748B]">
                            Name *
                            <input
                                required
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="text-xs font-bold text-[#64748B]">
                            Email
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="text-xs font-bold text-[#64748B]">
                            Phone
                            <input
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: restrictPhoneInput(e.target.value) }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="text-xs font-bold text-[#64748B]">
                            Status
                            <select
                                value={form.status}
                                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            >
                                <option value="lead">Lead</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </label>
                        <label className="text-xs font-bold text-[#64748B] sm:col-span-2">
                            Service address
                            <input
                                value={form.address}
                                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="text-xs font-bold text-[#64748B] sm:col-span-2">
                            Notes
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            />
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={busy}
                            className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                        >
                            {busy ? 'Saving…' : 'Save client'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreate(false)}
                            className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                        placeholder="Search name, email, phone"
                        className="w-full rounded-xl border border-[#E2E8F0] pl-9 pr-3 py-2.5 text-sm"
                    />
                </div>
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                >
                    <option value="">All statuses</option>
                    <option value="lead">Lead</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
                <button
                    type="button"
                    onClick={runSearch}
                    className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold"
                >
                    Search
                </button>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="p-8 text-center text-sm font-bold text-[#64748B]">Loading clients…</p>
                ) : !clients.length ? (
                    <div className="p-10 text-center">
                        <UserRound className="w-10 h-10 mx-auto text-[#CBD5E1]" />
                        <p className="font-bold text-[#0F172A] mt-3">No clients yet</p>
                        <p className="text-sm text-[#64748B] mt-1">
                            Clients are created when someone books, or add one manually.
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-[#F1F5F9]">
                        {clients.map((c) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/clients/${c.id}`)}
                                    className="w-full text-left px-4 py-3 hover:bg-[#F8FAFC] flex items-start justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold text-[#0F172A] truncate">{c.name}</p>
                                        <p className="text-xs text-[#64748B] truncate">
                                            {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact'}
                                        </p>
                                        {c.address && (
                                            <p className="text-xs text-[#94A3B8] truncate mt-0.5">{c.address}</p>
                                        )}
                                    </div>
                                    <div className="shrink-0 text-right space-y-1">
                                        <span
                                            className={cn(
                                                'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border',
                                                statusBadge(c.status)
                                            )}
                                        >
                                            {c.status}
                                        </span>
                                        <p className="text-[10px] text-[#64748B]">{c.booking_count || 0} jobs</p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function ClientDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [allClients, setAllClients] = useState<ClientRow[]>([]);
    const [mergeIntoId, setMergeIntoId] = useState('');
    const [edit, setEdit] = useState({
        name: '',
        email: '',
        phone: '',
        status: 'active',
        notes: '',
        address: ''
    });

    const load = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const res = await apiGet(`/api/host/clients/${id}`);
            setData(res);
            const prop = res.properties?.[0];
            setEdit({
                name: res.client.name || '',
                email: res.client.email || '',
                phone: res.client.phone || '',
                status: res.client.status || 'active',
                notes: res.client.notes || '',
                address: prop?.address || ''
            });
            const list = await apiGet('/api/host/clients');
            setAllClients((list.clients || []).filter((c: ClientRow) => c.id !== id));
            setError('');
        } catch (e: any) {
            setError(e.message || 'Client not found');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        setBusy(true);
        try {
            await apiPatch(`/api/host/clients/${id}`, edit);
            await load();
        } catch (err: any) {
            setError(err.message || 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    const bookings = data?.bookings || [];
    const quotes = data?.quotes || [];
    const invoices = useMemo(() => {
        const fromApi = data?.invoices || [];
        if (fromApi.length) return fromApi;
        // Fallback: invoice fields joined on bookings (older rows / pending Stripe)
        return (data?.bookings || [])
            .filter((b: any) => b.invoice_status || b.invoice_url || b.invoice_amount_cents)
            .map((b: any) => ({
                id: `booking-inv-${b.id}`,
                amount_cents: b.invoice_amount_cents || 0,
                status: b.invoice_status || 'linked',
                stripe_hosted_url: b.invoice_url || null,
                booking_start: b.start_at
            }));
    }, [data]);

    if (loading) return <p className="py-16 text-center font-bold text-[#64748B]">Loading client…</p>;
    if (error && !data) {
        return (
            <div className="py-10 text-center space-y-3">
                <p className="text-red-600">{error}</p>
                <button type="button" onClick={() => navigate('/clients')} className="text-sm font-bold underline">
                    Back to clients
                </button>
            </div>
        );
    }

    return (
        <div className="w-full space-y-4">
            <button
                type="button"
                onClick={() => navigate('/clients')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
                <ArrowLeft className="w-4 h-4" /> Clients
            </button>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <form onSubmit={save} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="font-black text-xl text-[#0F172A]">{data.client.name}</h1>
                    <span
                        className={cn(
                            'text-[10px] font-bold uppercase px-2 py-1 rounded-full border',
                            statusBadge(data.client.status)
                        )}
                    >
                        {data.client.status}
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-[#64748B]">
                        Name
                        <input
                            value={edit.name}
                            onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-xs font-bold text-[#64748B]">
                        Email
                        <input
                            value={edit.email}
                            onChange={(e) => setEdit((f) => ({ ...f, email: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-xs font-bold text-[#64748B]">
                        Phone
                        <input
                            value={edit.phone}
                            onChange={(e) => setEdit((f) => ({ ...f, phone: restrictPhoneInput(e.target.value) }))}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="text-xs font-bold text-[#64748B]">
                        Status
                        <select
                            value={edit.status}
                            onChange={(e) => setEdit((f) => ({ ...f, status: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        >
                            <option value="lead">Lead</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </label>
                    <label className="text-xs font-bold text-[#64748B] sm:col-span-2">
                        Notes
                        <textarea
                            value={edit.notes}
                            onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))}
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap gap-2">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                    {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        if (!id) return;
                        setBusy(true);
                        setError('');
                        try {
                            const res = await apiPost(`/api/host/clients/${id}/portal-link`, { emailClient: true });
                            setError('');
                            alert(
                                res.portalUrl
                                    ? `Client hub link emailed (if SES delivers).\n\n${res.portalUrl}`
                                    : 'Portal link created'
                            );
                        } catch (err: any) {
                            setError(err.message || 'Could not create portal link');
                        } finally {
                            setBusy(false);
                        }
                    }}
                    className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold text-[#0F172A]"
                >
                    Email client hub link
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        if (!id) return;
                        setBusy(true);
                        try {
                            const res = await apiPost(`/api/host/clients/${id}/referral-code`, {});
                            alert(`Referral code: ${res.client?.referral_code}`);
                            await load();
                        } catch (err: any) {
                            setError(err.message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                    className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-bold text-[#0F172A]"
                >
                    Referral code
                </button>
                </div>
            </form>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-bold uppercase text-[#64748B]">Merge into…</h2>
                <p className="text-sm text-[#64748B]">
                    Move this client’s properties, bookings, quotes, invoices, and threads into another client, then delete this
                    duplicate.
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                    <select
                        value={mergeIntoId}
                        onChange={(e) => setMergeIntoId(e.target.value)}
                        className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm min-w-[200px]"
                    >
                        <option value="">Select keep client…</option>
                        {allClients.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                                {c.email ? ` (${c.email})` : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={busy || !mergeIntoId}
                        onClick={async () => {
                            if (!id || !mergeIntoId) return;
                            const keep = allClients.find((c) => c.id === mergeIntoId);
                            if (
                                !confirm(
                                    `Merge “${data.client.name}” into “${keep?.name || 'selected client'}”? This deletes the current client.`
                                )
                            ) {
                                return;
                            }
                            setBusy(true);
                            setError('');
                            try {
                                await apiPost('/api/host/clients/merge', {
                                    keepClientId: mergeIntoId,
                                    mergeClientId: id
                                });
                                navigate(`/clients/${mergeIntoId}`);
                            } catch (err: any) {
                                setError(err.message || 'Merge failed');
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-xl bg-amber-500 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                    >
                        Merge
                    </button>
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-bold uppercase text-[#64748B]">Properties</h2>
                <ul className="space-y-2">
                    {(data?.properties || []).map((p: any) => (
                        <li key={p.id} className="rounded-xl border border-[#F1F5F9] px-3 py-2 text-sm flex justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-bold text-[#0F172A]">{p.label || 'Service address'}</p>
                                <p className="text-xs text-[#64748B]">{p.address}</p>
                            </div>
                            <button
                                type="button"
                                className="text-xs font-bold text-red-600 shrink-0"
                                onClick={async () => {
                                    if (!id || !confirm('Remove this property?')) return;
                                    try {
                                        await apiDelete(`/api/host/clients/${id}/properties/${p.id}`);
                                        await load();
                                    } catch (err: any) {
                                        setError(err.message);
                                    }
                                }}
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
                <PropertyAddForm
                    clientId={id!}
                    onAdded={load}
                    onError={setError}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1.5 mb-3">
                        <Calendar className="w-3.5 h-3.5" /> Jobs / bookings
                    </h2>
                    {!bookings.length ? (
                        <p className="text-sm text-[#64748B]">No bookings linked yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {bookings.map((b: any) => (
                                <li key={b.id} className="rounded-xl border border-[#F1F5F9] px-3 py-2 text-sm">
                                    <div className="flex justify-between gap-2">
                                        <span className="font-bold text-[#0F172A]">{b.event_name || 'Job'}</span>
                                        <span className="text-[10px] font-bold uppercase text-[#64748B]">
                                            {b.job_status || b.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#64748B] mt-0.5">
                                        {new Date(b.start_at).toLocaleString('en-GB')}
                                    </p>
                                    <Link to="/booking" className="text-[11px] font-bold text-[#F59E0B]">
                                        Open board
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1.5 mb-3">
                        <FileText className="w-3.5 h-3.5" /> Invoices
                    </h2>
                    {!invoices.length ? (
                        <p className="text-sm text-[#64748B]">
                            No invoices yet. Saving client details does not create an invoice — mark a job done or use
                            Invoice on the booking board after a completed job.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {invoices.map((inv: any) => (
                                <li key={inv.id} className="rounded-xl border border-[#F1F5F9] px-3 py-2 text-sm flex justify-between gap-2">
                                    <div>
                                        <p className="font-bold text-[#0F172A]">{formatCents(inv.amount_cents)}</p>
                                        <p className="text-xs text-[#64748B]">{inv.status}</p>
                                    </div>
                                    {inv.stripe_hosted_url && (
                                        <a
                                            href={inv.stripe_hosted_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs font-bold text-[#0F172A] underline"
                                        >
                                            View
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-xs font-bold uppercase text-[#64748B] flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Quotes
                    </h2>
                    <Link
                        to={`/quotes/new?clientId=${id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#F59E0B]"
                    >
                        <Plus className="w-3.5 h-3.5" /> New quote
                    </Link>
                </div>
                {!quotes.length ? (
                    <p className="text-sm text-[#64748B]">No quotes yet for this client.</p>
                ) : (
                    <ul className="space-y-2">
                        {quotes.map((q: any) => (
                            <li key={q.id} className="rounded-xl border border-[#F1F5F9] px-3 py-2 text-sm">
                                <div className="flex justify-between gap-2">
                                    <span className="font-bold text-[#0F172A]">{q.title}</span>
                                    <span className="text-[10px] font-bold uppercase text-[#64748B]">{q.status}</span>
                                </div>
                                <p className="text-xs text-[#64748B] mt-0.5">{formatCents(q.subtotal_cents)}</p>
                                <Link to={`/quotes/${q.id}`} className="text-[11px] font-bold text-[#F59E0B]">
                                    Open quote
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function PropertyAddForm({
    clientId,
    onAdded,
    onError
}: {
    clientId: string;
    onAdded: () => Promise<void> | void;
    onError: (msg: string) => void;
}) {
    const [label, setLabel] = useState('Service address');
    const [address, setAddress] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[#F1F5F9]">
            <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm sm:w-36"
            />
            <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="New property address"
                className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
            />
            <button
                type="button"
                disabled={busy}
                onClick={async () => {
                    if (!address.trim()) return;
                    setBusy(true);
                    try {
                        await apiPost(`/api/host/clients/${clientId}/properties`, { label, address });
                        setAddress('');
                        await onAdded();
                    } catch (err: any) {
                        onError(err.message || 'Could not add property');
                    } finally {
                        setBusy(false);
                    }
                }}
                className="rounded-xl bg-[#0F172A] text-white px-3 py-2 text-sm font-bold"
            >
                Add
            </button>
        </div>
    );
}

export default function ClientsPage() {
    const { id } = useParams();
    return id ? <ClientDetail /> : <ClientsList />;
}

export function ClientsListPage() {
    return <ClientsList />;
}

export function ClientDetailPage() {
    return <ClientDetail />;
}
