import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Send, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiDelete, cn, formatCents } from '../../shared/utils';

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
    const [searchTerm, setSearchTerm] = useState('');

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
    }, [status]);

    const filteredQuotes = quotes.filter((q) => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            (q.title || '').toLowerCase().includes(s) ||
            (q.client_name || '').toLowerCase().includes(s) ||
            String(q.id).toLowerCase().includes(s)
        );
    });

    const statusBadge = (s: string) => {
        switch (s) {
            case 'approved':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'sent':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'declined':
                return 'bg-red-50 text-red-700 border-red-200';
            case 'expired':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-4 pb-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Quotes</h1>
                    <p className="text-sm font-medium text-slate-500 mt-0.5">
                        Estimates with line items — send for online approve
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => navigate('/quotes/new')}
                    className="rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white px-5 py-2.5 text-sm font-bold transition shadow-sm hover:shadow active:scale-95 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                    <Plus className="w-4 h-4 stroke-[2.5]" /> New quote
                </button>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

            {/* Filter Pills & Search Bar Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Status Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                        { label: 'All', value: '' },
                        { label: 'Draft', value: 'draft' },
                        { label: 'Sent', value: 'sent' },
                        { label: 'Approved', value: 'approved' },
                        { label: 'Declined', value: 'declined' },
                        { label: 'Expired', value: 'expired' }
                    ].map((pill) => (
                        <button
                            key={pill.label}
                            type="button"
                            onClick={() => setStatus(pill.value)}
                            className={cn(
                                'px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer',
                                status === pill.value
                                    ? 'bg-[#FFF0DE] text-[#D97706]'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            )}
                        >
                            {pill.label}
                        </button>
                    ))}
                </div>

                {/* Search & Filter Trigger */}
                <div className="flex items-center gap-2">
                    <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 w-full sm:w-64 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-[#FF8800] transition">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-2" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search quotes..."
                            className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 p-2 rounded-xl transition"
                        title="Filter options"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Table / Empty State Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
                {/* Header columns */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Client</div>
                    <div className="col-span-3">Title</div>
                    <div className="col-span-2">Amount</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-1">Created</div>
                    <div className="col-span-1 text-right">Actions</div>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-sm font-semibold text-slate-400">Loading quotes…</div>
                ) : filteredQuotes.length === 0 ? (
                    /* Empty State matching screenshot */
                    <div className="py-20 px-4 text-center flex flex-col items-center justify-center">
                        <div className="relative w-14 h-14 mx-auto mb-3 flex items-center justify-center">
                            <svg
                                className="w-12 h-12 text-slate-300"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <line x1="10" y1="9" x2="8" y2="9" />
                            </svg>
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#FF8800] text-white flex items-center justify-center shadow-xs">
                                <Plus className="w-3 h-3 stroke-[3]" />
                            </div>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">No quotes yet</h3>
                        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm">
                            Create a quote for a client, then send it for approval.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/quotes/new')}
                            className="mt-5 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white px-6 py-2.5 text-sm font-bold transition shadow-sm hover:shadow active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                            <Plus className="w-4 h-4 stroke-[2.5]" /> New quote
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {filteredQuotes.map((q, idx) => (
                            <div
                                key={q.id}
                                onClick={() => navigate(`/quotes/${q.id}`)}
                                className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-4 items-center hover:bg-slate-50/80 transition cursor-pointer"
                            >
                                <div className="col-span-1 text-xs font-semibold text-slate-400">
                                    #{idx + 1}
                                </div>
                                <div className="col-span-3 min-w-0">
                                    <p className="font-bold text-sm text-slate-900 truncate">{q.client_name || 'Client'}</p>
                                    <p className="text-xs text-slate-400 truncate">{q.client_email || q.client_phone || ''}</p>
                                </div>
                                <div className="col-span-3 min-w-0">
                                    <p className="font-medium text-sm text-slate-800 truncate">{q.title}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="font-bold text-sm text-slate-900">{formatCents(q.subtotal_cents)}</p>
                                    {q.deposit_cents > 0 && (
                                        <p className="text-[11px] text-slate-400">
                                            Dep: {formatCents(q.deposit_cents)}
                                        </p>
                                    )}
                                </div>
                                <div className="col-span-1">
                                    <span
                                        className={cn(
                                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize',
                                            statusBadge(q.status)
                                        )}
                                    >
                                        {q.status}
                                    </span>
                                </div>
                                <div className="col-span-1 text-xs text-slate-500">
                                    {q.created_at ? new Date(q.created_at).toLocaleDateString() : '-'}
                                </div>
                                <div className="col-span-1 text-right">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/quotes/${q.id}`);
                                        }}
                                        className="text-xs font-bold text-[#FF8800] hover:underline"
                                    >
                                        View
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
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
                setInfo('Saved successfully');
                setTimeout(() => setInfo(''), 3000);
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
            setInfo('Quote emailed to client');
            setTimeout(() => setInfo(''), 3500);
        } catch (e: any) {
            setError(e.message || 'Send failed');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!id || !confirm('Are you sure you want to delete this quote?')) return;
        setBusy(true);
        try {
            await apiDelete(`/api/host/quotes/${id}`);
            navigate('/quotes');
        } catch (e: any) {
            setError(e.message || 'Delete failed');
            setBusy(false);
        }
    };

    const editable = status === 'draft' || status === 'sent';

    return (
        <div className="w-full max-w-4xl mx-auto space-y-5 pb-12">
            <button
                type="button"
                onClick={() => navigate('/quotes')}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Quotes
            </button>

            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {info && (
                <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span>{info}</span>
                    <button onClick={() => setInfo('')} className="text-emerald-400 hover:text-emerald-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <div>
                        <h1 className="font-black text-xl text-slate-900">{isNew ? 'New quote' : title}</h1>
                        <p className="text-xs text-slate-400 mt-0.5">Configure line items and terms</p>
                    </div>
                    <span className="text-xs font-bold uppercase px-3 py-1 rounded-full border border-slate-200 text-slate-600 bg-slate-50">
                        {status}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Client *</label>
                        <select
                            disabled={!isNew || !editable}
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF8800] transition"
                        >
                            <option value="">Select client</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} {c.email ? `(${c.email})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Property address</label>
                        <select
                            disabled={!editable}
                            value={propertyId}
                            onChange={(e) => setPropertyId(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF8800] transition"
                        >
                            <option value="">Default / first address</option>
                            {properties.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label || 'Address'}: {p.address}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Title</label>
                    <input
                        disabled={!editable}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Full Garden Maintenance"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF8800] transition"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Deposit (£)</label>
                        <input
                            disabled={!editable}
                            type="number"
                            min={0}
                            step="0.01"
                            value={depositPounds}
                            onChange={(e) => setDepositPounds(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF8800] transition"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Expiry date</label>
                        <input
                            disabled={!editable}
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF8800] transition"
                        />
                    </div>
                </div>

                {/* Line items table */}
                <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Line items</p>
                        {editable && (
                            <button
                                type="button"
                                onClick={() => setLines([...lines, emptyLine()])}
                                className="text-xs font-bold text-[#FF8800] hover:underline flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add line
                            </button>
                        )}
                    </div>

                    <div className="space-y-2">
                        {lines.map((li, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                                <div className="col-span-12 sm:col-span-6">
                                    <input
                                        disabled={!editable}
                                        placeholder="Item description"
                                        value={li.description}
                                        onChange={(e) => {
                                            const next = [...lines];
                                            next[idx] = { ...li, description: e.target.value };
                                            setLines(next);
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                                    />
                                </div>
                                <div className="col-span-4 sm:col-span-2">
                                    <input
                                        disabled={!editable}
                                        type="number"
                                        min={0.01}
                                        step="0.01"
                                        placeholder="Qty"
                                        value={li.quantity}
                                        onChange={(e) => {
                                            const next = [...lines];
                                            next[idx] = { ...li, quantity: Number(e.target.value) };
                                            setLines(next);
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                                    />
                                </div>
                                <div className="col-span-5 sm:col-span-3">
                                    <input
                                        disabled={!editable}
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        placeholder="Unit £"
                                        value={(li.unit_price_cents / 100).toFixed(2)}
                                        onChange={(e) => {
                                            const next = [...lines];
                                            next[idx] = {
                                                ...li,
                                                unit_price_cents: Math.round(parseFloat(e.target.value || '0') * 100)
                                            };
                                            setLines(next);
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                                    />
                                </div>
                                {editable && (
                                    <div className="col-span-3 sm:col-span-1 text-center">
                                        <button
                                            type="button"
                                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                                            className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg transition"
                                            title="Delete line"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Notes & Terms</label>
                    <textarea
                        disabled={!editable}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Add additional terms, requirements or client notes here..."
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF8800] transition"
                    />
                </div>

                {/* Subtotal summary */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Estimated Total</p>
                        <p className="text-2xl font-black text-slate-900">{formatCents(subtotal)}</p>
                    </div>
                    {publicToken && (
                        <div className="text-right">
                            <p className="text-xs text-slate-500">Public client approval link:</p>
                            <a
                                className="text-xs font-bold text-[#FF8800] hover:underline break-all"
                                href={`/quote/${publicToken}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                /quote/{publicToken}
                            </a>
                        </div>
                    )}
                </div>

                {/* Bottom Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                        {editable && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={save}
                                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-sm font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                                {busy ? 'Saving…' : 'Save'}
                            </button>
                        )}
                        {(status === 'draft' || status === 'sent') && !isNew && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={send}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white px-5 py-2.5 text-sm font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                                <Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send to client'}
                            </button>
                        )}
                        {isNew && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={save}
                                className="rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white px-5 py-2.5 text-sm font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                                {busy ? 'Creating…' : 'Create quote'}
                            </button>
                        )}
                    </div>

                    {!isNew && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={busy}
                            className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                        >
                            Delete quote
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
