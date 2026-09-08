import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Send, FileText } from 'lucide-react';
import { apiGet, apiPatch, apiPost, cn, formatCents } from '../../shared/utils';

type LineItem = { description: string; quantity: number; unit_price_cents: number };

function emptyLine(): LineItem {
    return { description: '', quantity: 1, unit_price_cents: 0 };
}

function QuotesList() {
    const navigate = useNavigate();
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const params = status ? `?status=${encodeURIComponent(status)}` : '';
            const res = await apiGet(`/api/host/quotes${params}`);
            setQuotes(res.quotes || []);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Could not load quotes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    return (
        <div className="w-full space-y-4">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6 lg:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                    <h1 className="font-black text-xl">Quotes</h1>
                    <p className="text-sm text-white/60 mt-1">Estimates with line items — send for online approve</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/quotes/new')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2.5 text-sm font-bold"
                >
                    <Plus className="w-4 h-4" /> New quote
                </button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <div className="flex flex-wrap gap-2">
                {['', 'draft', 'sent', 'approved', 'declined', 'expired'].map((s) => (
                    <button
                        key={s || 'all'}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-bold border capitalize',
                            status === s ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-[#64748B] border-[#E2E8F0]'
                        )}
                    >
                        {s || 'all'}
                    </button>
                ))}
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="p-8 text-center text-sm font-bold text-[#64748B]">Loading quotes…</p>
                ) : !quotes.length ? (
                    <div className="p-10 text-center">
                        <FileText className="w-10 h-10 mx-auto text-[#CBD5E1]" />
                        <p className="font-bold text-[#0F172A] mt-3">No quotes yet</p>
                        <p className="text-sm text-[#64748B] mt-1">Create a quote for a client, then send it for approval.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-[#F1F5F9]">
                        {quotes.map((q) => (
                            <li key={q.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/quotes/${q.id}`)}
                                    className="w-full text-left px-4 py-3 hover:bg-[#F8FAFC] flex justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold text-[#0F172A] truncate">{q.title}</p>
                                        <p className="text-xs text-[#64748B] truncate">{q.client_name}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-bold">{formatCents(q.subtotal_cents)}</p>
                                        <p className="text-[10px] font-bold uppercase text-[#64748B]">{q.status}</p>
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

function QuoteEditor({ isNew }: { isNew?: boolean }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preClientId = searchParams.get('clientId') || '';
    const [clients, setClients] = useState<any[]>([]);
    const [clientId, setClientId] = useState(preClientId);
    const [propertyId, setPropertyId] = useState('');
    const [properties, setProperties] = useState<any[]>([]);
    const [title, setTitle] = useState('Quote');
    const [notes, setNotes] = useState('');
    const [depositPounds, setDepositPounds] = useState('0');
    const [expiryDate, setExpiryDate] = useState('');
    const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
    const [status, setStatus] = useState('draft');
    const [publicToken, setPublicToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');

    const subtotal = useMemo(
        () => lines.reduce((s, li) => s + Math.round((Number(li.quantity) || 0) * (Number(li.unit_price_cents) || 0)), 0),
        [lines]
    );

    useEffect(() => {
        apiGet('/api/host/clients')
            .then((r) => setClients(r.clients || []))
            .catch(() => setClients([]));
    }, []);

    useEffect(() => {
        if (!clientId) {
            setProperties([]);
            return;
        }
        apiGet(`/api/host/clients/${clientId}`)
            .then((d) => setProperties(d.properties || []))
            .catch(() => setProperties([]));
    }, [clientId]);

    useEffect(() => {
        if (isNew || !id) return;
        apiGet(`/api/host/quotes/${id}`)
            .then((data) => {
                const q = data.quote;
                setClientId(q.client_id);
                setPropertyId(q.property_id || '');
                setTitle(q.title || 'Quote');
                setNotes(q.notes || '');
                setDepositPounds(String(((q.deposit_cents || 0) / 100).toFixed(2)));
                setExpiryDate(q.expiry_date ? String(q.expiry_date).slice(0, 10) : '');
                setStatus(q.status);
                setPublicToken(q.public_token || '');
                setLines(
                    (data.lineItems || []).map((li: any) => ({
                        description: li.description,
                        quantity: Number(li.quantity),
                        unit_price_cents: li.unit_price_cents
                    })) || [emptyLine()]
                );
            })
            .catch((e: any) => setError(e.message));
    }, [id, isNew]);

    const payload = () => ({
        clientId,
        propertyId: propertyId || null,
        title,
        notes,
        depositCents: Math.round(parseFloat(depositPounds || '0') * 100) || 0,
        expiryDate: expiryDate || null,
        lineItems: lines.map((li) => ({
            description: li.description,
            quantity: Number(li.quantity) || 1,
            unit_price_cents: Math.round(Number(li.unit_price_cents) || 0)
        }))
    });

    const save = async () => {
        if (!clientId) {
            setError('Select a client');
            return;
        }
        setBusy(true);
        setError('');
        try {
            if (isNew) {
                const data = await apiPost('/api/host/quotes', payload());
                navigate(`/quotes/${data.quote.id}`, { replace: true });
            } else {
                const data = await apiPatch(`/api/host/quotes/${id}`, payload());
                setStatus(data.quote.status);
                setInfo('Saved');
            }
        } catch (e: any) {
            setError(e.message || 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    const send = async () => {
        setBusy(true);
        setError('');
        try {
            let quoteId = id;
            if (isNew || !quoteId) {
                if (!clientId) {
                    setError('Select a client');
                    setBusy(false);
                    return;
                }
                const created = await apiPost('/api/host/quotes', payload());
                quoteId = created.quote.id;
                navigate(`/quotes/${quoteId}`, { replace: true });
            } else if (status === 'draft') {
                await apiPatch(`/api/host/quotes/${quoteId}`, payload());
            }
            const data = await apiPost(`/api/host/quotes/${quoteId}/send`, {});
            setStatus(data.quote.status);
            setPublicToken(data.quote.public_token);
            setInfo('Quote emailed to client (or logged if SES unavailable)');
        } catch (e: any) {
            setError(e.message || 'Send failed');
        } finally {
            setBusy(false);
        }
    };

    const editable = status === 'draft' || status === 'sent';

    return (
        <div className="w-full space-y-4 max-w-3xl">
            <button
                type="button"
                onClick={() => navigate('/quotes')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
                <ArrowLeft className="w-4 h-4" /> Quotes
            </button>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-4 py-2">{info}</p>}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <div className="flex justify-between gap-2 items-start">
                    <h1 className="font-black text-xl text-[#0F172A]">{isNew ? 'New quote' : title}</h1>
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full border border-[#E2E8F0] text-[#64748B]">
                        {status}
                    </span>
                </div>

                <label className="block text-xs font-bold text-[#64748B]">
                    Client *
                    <select
                        disabled={!isNew || !editable}
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    >
                        <option value="">Select client</option>
                        {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} {c.email ? `(${c.email})` : ''}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block text-xs font-bold text-[#64748B]">
                    Property
                    <select
                        disabled={!editable}
                        value={propertyId}
                        onChange={(e) => setPropertyId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    >
                        <option value="">Default / first address</option>
                        {properties.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label || 'Address'}: {p.address}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block text-xs font-bold text-[#64748B]">
                    Title
                    <input
                        disabled={!editable}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs font-bold text-[#64748B]">
                        Deposit (£)
                        <input
                            disabled={!editable}
                            type="number"
                            min={0}
                            step="0.01"
                            value={depositPounds}
                            onChange={(e) => setDepositPounds(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="block text-xs font-bold text-[#64748B]">
                        Expiry date
                        <input
                            disabled={!editable}
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        />
                    </label>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase text-[#64748B]">Line items</p>
                    {lines.map((li, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                            <label className="col-span-12 sm:col-span-6 text-xs font-bold text-[#64748B]">
                                Description
                                <input
                                    disabled={!editable}
                                    value={li.description}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = { ...li, description: e.target.value };
                                        setLines(next);
                                    }}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="col-span-4 sm:col-span-2 text-xs font-bold text-[#64748B]">
                                Qty
                                <input
                                    disabled={!editable}
                                    type="number"
                                    min={0.01}
                                    step="0.01"
                                    value={li.quantity}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = { ...li, quantity: Number(e.target.value) };
                                        setLines(next);
                                    }}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="col-span-5 sm:col-span-3 text-xs font-bold text-[#64748B]">
                                Unit £
                                <input
                                    disabled={!editable}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={(li.unit_price_cents / 100).toFixed(2)}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = {
                                            ...li,
                                            unit_price_cents: Math.round(parseFloat(e.target.value || '0') * 100)
                                        };
                                        setLines(next);
                                    }}
                                    className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                />
                            </label>
                            {editable && (
                                <button
                                    type="button"
                                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                                    className="col-span-3 sm:col-span-1 text-xs font-bold text-red-600 py-2"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                    {editable && (
                        <button
                            type="button"
                            onClick={() => setLines([...lines, emptyLine()])}
                            className="text-xs font-bold text-[#0F172A] underline"
                        >
                            + Add line
                        </button>
                    )}
                </div>

                <label className="block text-xs font-bold text-[#64748B]">
                    Notes
                    <textarea
                        disabled={!editable}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    />
                </label>

                <p className="text-sm font-bold text-[#0F172A]">Total {formatCents(subtotal)}</p>

                {publicToken && (
                    <p className="text-xs text-[#64748B]">
                        Public link:{' '}
                        <a className="text-[#F59E0B] font-bold break-all" href={`/quote/${publicToken}`} target="_blank" rel="noreferrer">
                            /quote/{publicToken}
                        </a>
                    </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                    {editable && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={save}
                            className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                        >
                            {busy ? 'Saving…' : 'Save'}
                        </button>
                    )}
                    {(status === 'draft' || status === 'sent') && !isNew && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={send}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 text-sm font-bold disabled:opacity-50"
                        >
                            <Send className="w-3.5 h-3.5" /> {busy ? '…' : 'Send to client'}
                        </button>
                    )}
                    {isNew && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={save}
                            className="rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 text-sm font-bold disabled:opacity-50"
                        >
                            {busy ? '…' : 'Create quote'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function QuotesListPage() {
    return <QuotesList />;
}

export function QuoteNewPage() {
    return <QuoteEditor isNew />;
}

export function QuoteDetailPage() {
    return <QuoteEditor />;
}

export default function QuotesPage() {
    const { id } = useParams();
    if (!id) return <QuotesList />;
    if (id === 'new') return <QuoteEditor isNew />;
    return <QuoteEditor />;
}
