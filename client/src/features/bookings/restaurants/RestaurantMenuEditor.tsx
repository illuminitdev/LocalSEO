import { useEffect, useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Trash2, Upload, Check, X } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, cn, formatCents } from '../../../shared/utils';

type MenuItem = {
    id: string;
    category: string;
    name: string;
    description: string;
    price_cents: number;
    sort_order: number;
    active: boolean;
};

type Props = {
    org: any;
    onOrgUpdated?: (org: any) => void;
    
    variant?: 'restaurant' | 'priceList';
    
    sections?: 'all' | 'form' | 'list';
};

const SAMPLE_CSV_RESTAURANT = `category,item_name,price_gbp,description,active
Starters,Soup of the Day,6.50,Ask server for today's soup,TRUE
Mains,Sunday Roast,18.50,Beef or chicken with all the trimmings,TRUE
Mains,Margherita Pizza,12.00,Tomato, mozzarella, basil,TRUE
Drinks,House Wine Glass,5.50,Red or white,TRUE
`;

const SAMPLE_CSV_PRICE_LIST = `category,item_name,price_gbp,description,active
Dental,Adult Routine Check-up,55,Standard adult check-up,TRUE
Dental,Comprehensive New Patient Exam,120,New patient assessment,TRUE
Dental,Scale & Polish,90,Hygiene appointment,TRUE
Facial Aesthetics,Botox 1 Area,180,Anti-wrinkle 1 area,TRUE
Facial Aesthetics,Botox 3 Areas,270,Anti-wrinkle 3 areas,TRUE
Facial Aesthetics,Lip Filler,250,Lip enhancement,TRUE
Facial Aesthetics,Profhilo Session,300,Skin hydration & lifting,TRUE
Cosmetic Dentistry,At-Home Teeth Whitening,350,Take-home whitening kit,TRUE
Laser Treatments,Laser Skin Rejuvenation,150,Skin rejuvenation session,TRUE
`;

function poundsToCents(value: string) {
    const n = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
}

function parseCsvText(text: string): Record<string, string>[] {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        if (!cols.some((c) => c.trim())) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
            row[h] = (cols[idx] || '').trim();
        });
        rows.push(row);
    }
    return rows;
}

function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

function rowsToImportItems(rows: Record<string, string>[]) {
    return rows
        .map((r, index) => {
            const name = r.item_name || r.name || '';
            const price = poundsToCents(r.price_gbp || r.price || '');
            if (!name || price == null) return null;
            return {
                category: r.category || '',
                name,
                description: r.description || '',
                priceCents: price,
                sortOrder: index,
                active: !(String(r.active || 'true').toLowerCase() === 'false' || r.active === '0')
            };
        })
        .filter(Boolean);
}

export default function RestaurantMenuEditor({
    org,
    onOrgUpdated,
    variant = 'restaurant',
    sections = 'all'
}: Props) {
    const isPriceList = variant === 'priceList';
    const showForm = sections === 'all' || sections === 'form';
    const showList = sections === 'all' || sections === 'list';
    const sampleCsv = isPriceList ? SAMPLE_CSV_PRICE_LIST : SAMPLE_CSV_RESTAURANT;
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState({
        category: '',
        name: '',
        description: '',
        pricePounds: ''
    });
    const [form, setForm] = useState({
        category: '',
        name: '',
        description: '',
        pricePounds: '',
        active: true
    });
    const [delivery, setDelivery] = useState({
        foodDeliveryEnabled: org?.food_delivery_enabled !== false,
        foodPickupEnabled: org?.food_pickup_enabled !== false,
        deliveryFeePounds: ((Number(org?.delivery_fee_cents) || 0) / 100).toFixed(2),
        deliveryMinOrderPounds: ((Number(org?.delivery_min_order_cents) || 0) / 100).toFixed(2),
        deliveryNotes: org?.delivery_notes || ''
    });

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiGet('/api/host/menu-items');
            setItems(data.items || []);
        } catch (e: any) {
            setError(e.message || 'Could not load menu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        setDelivery({
            foodDeliveryEnabled: org?.food_delivery_enabled !== false,
            foodPickupEnabled: org?.food_pickup_enabled !== false,
            deliveryFeePounds: ((Number(org?.delivery_fee_cents) || 0) / 100).toFixed(2),
            deliveryMinOrderPounds: ((Number(org?.delivery_min_order_cents) || 0) / 100).toFixed(2),
            deliveryNotes: org?.delivery_notes || ''
        });
    }, [org]);

    const addItem = async (e: FormEvent) => {
        e.preventDefault();
        const priceCents = poundsToCents(form.pricePounds);
        if (!form.name.trim() || priceCents == null) {
            setError('Name and price are required');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/host/menu-items', {
                category: form.category,
                name: form.name.trim(),
                description: form.description,
                priceCents,
                active: form.active
            });
            setForm({ category: '', name: '', description: '', pricePounds: '', active: true });
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not add item');
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async (item: MenuItem) => {
        try {
            await apiPatch(`/api/host/menu-items/${item.id}`, { active: !item.active });
            await load();
        } catch (err: any) {
            setError(err.message || 'Update failed');
        }
    };

    const removeItem = async (id: string) => {
        if (!confirm(isPriceList ? 'Delete this price list item?' : 'Delete this menu item?')) return;
        try {
            await apiDelete(`/api/host/menu-items/${id}`);
            if (editingId === id) setEditingId(null);
            await load();
        } catch (err: any) {
            setError(err.message || 'Delete failed');
        }
    };

    const startEdit = (item: MenuItem) => {
        setEditingId(item.id);
        setEditDraft({
            category: item.category || '',
            name: item.name || '',
            description: item.description || '',
            pricePounds: ((Number(item.price_cents) || 0) / 100).toFixed(2).replace(/\.00$/, '')
        });
    };

    const saveEdit = async (item: MenuItem) => {
        const priceCents = poundsToCents(editDraft.pricePounds);
        if (!editDraft.name.trim() || priceCents == null) {
            setError('Name and price are required');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await apiPatch(`/api/host/menu-items/${item.id}`, {
                category: editDraft.category,
                name: editDraft.name.trim(),
                description: editDraft.description,
                priceCents
            });
            setEditingId(null);
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not save item');
        } finally {
            setBusy(false);
        }
    };

    const onFile = async (file: File | null) => {
        if (!file) return;
        setBusy(true);
        setError('');
        try {
            let rows: Record<string, string>[] = [];
            const name = file.name.toLowerCase();
            if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                const XLSX = await import('xlsx');
                const buf = await file.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
                rows = json.map((r) => {
                    const out: Record<string, string> = {};
                    for (const [k, v] of Object.entries(r)) {
                        out[String(k).trim().toLowerCase()] = String(v ?? '').trim();
                    }
                    return out;
                });
            } else {
                const text = await file.text();
                rows = parseCsvText(text);
            }
            const itemsPayload = rowsToImportItems(rows);
            if (!itemsPayload.length) {
                setError('No valid rows found. Use columns: category, item_name, price_gbp, description, active');
                return;
            }
            const mode = confirm(
                `Import ${itemsPayload.length} items?\nOK = Replace entire menu\nCancel = Append to existing`
            )
                ? 'replace'
                : 'append';
            await apiPost('/api/host/menu-items/import', { items: itemsPayload, mode });
            await load();
        } catch (err: any) {
            setError(err.message || 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    const saveDelivery = async () => {
        setBusy(true);
        setError('');
        try {
            const fee = poundsToCents(delivery.deliveryFeePounds) ?? 0;
            const min = poundsToCents(delivery.deliveryMinOrderPounds) ?? 0;
            const updated = await apiPatch('/api/host/organization', {
                foodDeliveryEnabled: delivery.foodDeliveryEnabled,
                foodPickupEnabled: delivery.foodPickupEnabled,
                deliveryFeeCents: fee,
                deliveryMinOrderCents: min,
                deliveryNotes: delivery.deliveryNotes
            });
            onOrgUpdated?.(updated);
        } catch (err: any) {
            setError(err.message || 'Could not save delivery settings');
        } finally {
            setBusy(false);
        }
    };

    const downloadSample = () => {
        const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = isPriceList ? 'price-list-sample.csv' : 'restaurant-menu-sample.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return <p className="text-sm text-[#64748B]">Loading {isPriceList ? 'price list' : 'menu'}…</p>;
    }

    const listBlock = showList && (
        <div className={cn(showForm ? 'space-y-2' : 'space-y-4')}>
            {!showForm && (
                <div>
                    <h2 className="font-bold text-[#0F172A]">{isPriceList ? 'Price list items' : 'Menu items'}</h2>
                    <p className="text-sm text-[#64748B] mt-1">
                        {isPriceList
                            ? 'Treatments guests pick on the booking start page. Add more under the Price list tab.'
                            : 'Items guests can order.'}
                    </p>
                </div>
            )}
            {items.length === 0 && (
                <p className="text-sm text-[#64748B] border border-dashed border-[#E2E8F0] rounded-xl px-4 py-6 text-center">
                    {isPriceList
                        ? showForm
                            ? 'No price list items yet. Upload a spreadsheet or add one above.'
                            : 'No price list items yet — add them under the Price list tab.'
                        : 'No menu items yet. Upload a spreadsheet or add one above.'}
                </p>
            )}
            <div
                className={cn(
                    !showForm && isPriceList
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
                        : 'space-y-2'
                )}
            >
                {items.map((item) => {
                    const isEditing = editingId === item.id;
                    if (!showForm && isPriceList) {
                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    'rounded-xl border p-4 flex flex-col gap-2 bg-white border-[#E2E8F0]',
                                    !item.active && 'opacity-70'
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase text-[#64748B]">
                                            {item.category || 'Treatment'}
                                        </p>
                                        <p className="font-bold text-[#0F172A] truncate">{item.name}</p>
                                    </div>
                                    {!isEditing && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(item)}
                                                className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:border-[#0F172A]/30"
                                                title="Edit"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.id)}
                                                className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {isEditing ? (
                                    <div className="space-y-2 pt-1">
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                            placeholder="Category"
                                            value={editDraft.category}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                                        />
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-bold"
                                            placeholder="Name"
                                            value={editDraft.name}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                                        />
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-bold">£</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                className="w-full rounded-xl border border-[#E2E8F0] pl-8 pr-3 py-2 text-sm font-bold"
                                                value={editDraft.pricePounds}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, pricePounds: e.target.value }))}
                                            />
                                        </div>
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                            placeholder="Description"
                                            value={editDraft.description}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => saveEdit(item)}
                                                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-bold"
                                            >
                                                <Check className="w-3.5 h-3.5" /> Save
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingId(null)}
                                                className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B]"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {item.description && (
                                            <p className="text-xs text-[#64748B] line-clamp-2">{item.description}</p>
                                        )}
                                        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
                                            <p className="text-[10px] font-bold uppercase text-[#64748B]">Price</p>
                                            <p className="text-xl font-black text-[#F59E0B]">
                                                {formatCents(item.price_cents)}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div
                            key={item.id}
                            className={cn(
                                'flex items-start justify-between gap-3 rounded-xl border px-4 py-3',
                                item.active ? 'border-[#E2E8F0] bg-white' : 'border-[#E2E8F0] bg-[#F8FAFC] opacity-70'
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                            placeholder="Category"
                                            value={editDraft.category}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}
                                        />
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-bold"
                                            placeholder="Name"
                                            value={editDraft.name}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                                        />
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                            placeholder="Price £"
                                            value={editDraft.pricePounds}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, pricePounds: e.target.value }))}
                                        />
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                                            placeholder="Description"
                                            value={editDraft.description}
                                            onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => saveEdit(item)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F172A] text-white text-xs font-bold"
                                            >
                                                <Check className="w-3.5 h-3.5" /> Save
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingId(null)}
                                                className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-bold text-[#64748B]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-[10px] font-bold uppercase text-[#64748B]">
                                            {item.category || (isPriceList ? 'Treatment' : 'Menu')}
                                        </p>
                                        <p className="font-bold text-[#0F172A]">{item.name}</p>
                                        {item.description && (
                                            <p className="text-sm text-[#64748B] mt-0.5">{item.description}</p>
                                        )}
                                        <p className="text-sm font-black text-[#F59E0B] mt-1">
                                            {formatCents(item.price_cents)}
                                        </p>
                                    </>
                                )}
                            </div>
                            {!isEditing && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => startEdit(item)}
                                        className="p-2 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]"
                                        title="Edit"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleActive(item)}
                                        className="text-[10px] font-bold uppercase text-[#64748B] hover:text-[#0F172A] px-2"
                                    >
                                        {item.active ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.id)}
                                        className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            {showForm && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                    <div>
                        <h2 className="font-bold text-[#0F172A]">{isPriceList ? 'Price list' : 'Food menu'}</h2>
                        <p className="text-sm text-[#64748B] mt-1">
                            {isPriceList
                                ? 'Add treatments and prices (manual or CSV / Excel). They appear on Event types and on the guest booking start page.'
                                : 'Guests see these items when they choose Order food. Add manually or upload CSV / Excel.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={downloadSample}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B]"
                        >
                            <Download className="w-3.5 h-3.5" /> Sample CSV
                        </button>
                        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold cursor-pointer">
                            <Upload className="w-3.5 h-3.5" /> Upload CSV / Excel
                            <input
                                type="file"
                                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                className="hidden"
                                disabled={busy}
                                onChange={(e) => onFile(e.target.files?.[0] || null)}
                            />
                        </label>
                    </div>

                    <form onSubmit={addItem} className="grid sm:grid-cols-2 gap-3 border-t border-[#E2E8F0] pt-4">
                        <input
                            className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            placeholder={
                                isPriceList
                                    ? 'Category (e.g. Dental, Facial Aesthetics)'
                                    : 'Category (e.g. Mains)'
                            }
                            value={form.category}
                            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        />
                        <input
                            className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            placeholder={isPriceList ? 'Treatment / item name *' : 'Item name *'}
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            required
                        />
                        <input
                            className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                            placeholder="Price £ *"
                            value={form.pricePounds}
                            onChange={(e) => setForm((f) => ({ ...f, pricePounds: e.target.value }))}
                            required
                        />
                        <input
                            className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm sm:col-span-2"
                            placeholder="Description"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        />
                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 text-sm font-bold sm:col-span-2"
                        >
                            <Plus className="w-4 h-4" /> Add item
                        </button>
                    </form>

                    {sections === 'all' && listBlock}
                </div>
            )}

            {showList && !showForm && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">{listBlock}</div>
            )}

            {!isPriceList && showForm && (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                <div>
                    <h2 className="font-bold text-[#0F172A]">Delivery & pickup</h2>
                    <p className="text-sm text-[#64748B] mt-1">Controls for the Order food guest path.</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                    <input
                        type="checkbox"
                        checked={delivery.foodDeliveryEnabled}
                        onChange={(e) => setDelivery((d) => ({ ...d, foodDeliveryEnabled: e.target.checked }))}
                    />
                    Enable home delivery
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                    <input
                        type="checkbox"
                        checked={delivery.foodPickupEnabled}
                        onChange={(e) => setDelivery((d) => ({ ...d, foodPickupEnabled: e.target.checked }))}
                    />
                    Enable collection / pickup
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs font-bold text-[#64748B] uppercase space-y-1">
                        Delivery fee £
                        <input
                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#0F172A]"
                            value={delivery.deliveryFeePounds}
                            onChange={(e) => setDelivery((d) => ({ ...d, deliveryFeePounds: e.target.value }))}
                        />
                    </label>
                    <label className="text-xs font-bold text-[#64748B] uppercase space-y-1">
                        Min delivery order £
                        <input
                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#0F172A]"
                            value={delivery.deliveryMinOrderPounds}
                            onChange={(e) => setDelivery((d) => ({ ...d, deliveryMinOrderPounds: e.target.value }))}
                        />
                    </label>
                </div>
                <textarea
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Delivery notes (e.g. within 3 miles of Basingstoke)"
                    value={delivery.deliveryNotes}
                    onChange={(e) => setDelivery((d) => ({ ...d, deliveryNotes: e.target.value }))}
                />
                <button
                    type="button"
                    disabled={busy}
                    onClick={saveDelivery}
                    className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold"
                >
                    Save delivery settings
                </button>
            </div>
            )}
        </div>
    );
}
