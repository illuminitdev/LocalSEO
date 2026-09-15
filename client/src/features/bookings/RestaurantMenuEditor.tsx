import { useEffect, useState, type FormEvent } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, cn, formatCents } from '../../shared/utils';

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
};

const SAMPLE_CSV = `category,item_name,price_gbp,description,active
Starters,Soup of the Day,6.50,Ask server for today's soup,TRUE
Mains,Sunday Roast,18.50,Beef or chicken with all the trimmings,TRUE
Mains,Margherita Pizza,12.00,Tomato, mozzarella, basil,TRUE
Drinks,House Wine Glass,5.50,Red or white,TRUE
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

export default function RestaurantMenuEditor({ org, onOrgUpdated }: Props) {
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
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
        if (!confirm('Delete this menu item?')) return;
        try {
            await apiDelete(`/api/host/menu-items/${id}`);
            await load();
        } catch (err: any) {
            setError(err.message || 'Delete failed');
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
        const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'restaurant-menu-sample.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return <p className="text-sm text-[#64748B]">Loading menu…</p>;
    }

    return (
        <div className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
                <div>
                    <h2 className="font-bold text-[#0F172A]">Food menu</h2>
                    <p className="text-sm text-[#64748B] mt-1">
                        Guests see these items when they choose Order food. Add manually or upload CSV / Excel.
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
                        placeholder="Category (e.g. Mains)"
                        value={form.category}
                        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    />
                    <input
                        className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                        placeholder="Item name *"
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

                <div className="space-y-2">
                    {items.length === 0 && (
                        <p className="text-sm text-[#64748B]">No menu items yet. Upload a spreadsheet or add one above.</p>
                    )}
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={cn(
                                'flex items-start justify-between gap-3 rounded-xl border px-4 py-3',
                                item.active ? 'border-[#E2E8F0] bg-white' : 'border-[#E2E8F0] bg-[#F8FAFC] opacity-70'
                            )}
                        >
                            <div>
                                <p className="text-[10px] font-bold uppercase text-[#64748B]">{item.category || 'Menu'}</p>
                                <p className="font-bold text-[#0F172A]">{item.name}</p>
                                {item.description && <p className="text-sm text-[#64748B] mt-0.5">{item.description}</p>}
                                <p className="text-sm font-black text-[#F59E0B] mt-1">{formatCents(item.price_cents)}</p>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => toggleActive(item)}
                                    className="text-[10px] font-bold uppercase text-[#64748B] hover:text-[#0F172A]"
                                >
                                    {item.active ? 'Hide' : 'Show'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    className="inline-flex items-center justify-center text-red-500"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

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
        </div>
    );
}
