import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
    Briefcase,
    Building2,
    Car,
    ChevronLeft,
    ChevronRight,
    Dumbbell,
    Droplets,
    Flame,
    Home,
    Loader2,
    Pencil,
    Plus,
    Scissors,
    Search,
    ShieldAlert,
    Smile,
    Sparkles,
    Store,
    Trash2,
    Trees,
    Utensils,
    Wrench,
    X,
    Zap
} from 'lucide-react';
import { adminGet, adminPatch, adminPost } from './adminApi';
import { cn } from '../shared/utils';

type Industry = {
    id: string;
    name: string;
    shortName: string;
    icon: string;
    sortOrder: number;
    active: boolean;
    navSlug: string | null;
    demoReady: boolean;
};

const PAGE_SIZE = 10;

const INDUSTRY_ICON_OPTIONS: { name: string; Icon: ComponentType<{ className?: string }> }[] = [
    { name: 'Building2', Icon: Building2 },
    { name: 'Flame', Icon: Flame },
    { name: 'Zap', Icon: Zap },
    { name: 'Sparkles', Icon: Sparkles },
    { name: 'Car', Icon: Car },
    { name: 'Droplets', Icon: Droplets },
    { name: 'ShieldAlert', Icon: ShieldAlert },
    { name: 'Trees', Icon: Trees },
    { name: 'Smile', Icon: Smile },
    { name: 'Utensils', Icon: Utensils },
    { name: 'Scissors', Icon: Scissors },
    { name: 'Dumbbell', Icon: Dumbbell },
    { name: 'Briefcase', Icon: Briefcase },
    { name: 'Wrench', Icon: Wrench },
    { name: 'Home', Icon: Home },
    { name: 'Store', Icon: Store }
];

const emptyForm = {
    id: '',
    name: '',
    shortName: '',
    icon: 'Building2',
    sortOrder: 200,
    active: true,
    navSlug: '',
    demoReady: false
};

export default function AdminIndustries() {
    const [industries, setIndustries] = useState<Industry[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [form, setForm] = useState({ ...emptyForm });
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const load = () => {
        setLoading(true);
        setError('');
        adminGet('/api/admin/industries')
            .then((data) => setIndustries(data.industries || []))
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return industries;
        return industries.filter((row) => {
            const hay = [
                row.id,
                row.name,
                row.shortName,
                row.icon,
                row.navSlug || '',
                row.active ? 'on active' : 'off inactive',
                row.demoReady ? 'ready' : 'generic'
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [industries, query]);

    useEffect(() => {
        setPage(1);
    }, [query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);
    const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...emptyForm });
        setShowAdvanced(false);
        setShowForm(true);
        setError('');
    };

    const openEdit = (row: Industry) => {
        setEditingId(row.id);
        setForm({
            id: row.id,
            name: row.name,
            shortName: row.shortName,
            icon: row.icon,
            sortOrder: row.sortOrder,
            active: row.active,
            navSlug: row.navSlug || '',
            demoReady: row.demoReady
        });
        setShowAdvanced(false);
        setShowForm(true);
        setError('');
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const body = {
                name: form.name.trim(),
                shortName: form.shortName.trim() || form.name.trim(),
                icon: form.icon.trim() || 'Building2',
                sortOrder: Number(form.sortOrder) || 200,
                active: form.active,
                navSlug: form.navSlug.trim() || null,
                demoReady: form.demoReady
            };
            if (!body.name) {
                setError('Name is required');
                return;
            }
            if (editingId) {
                await adminPatch(`/api/admin/industries/${encodeURIComponent(editingId)}`, body);
            } else {
                await adminPost('/api/admin/industries', {
                    ...body,
                    id: form.id.trim() || undefined
                });
            }
            setShowForm(false);
            load();
        } catch (err: any) {
            setError(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const softDelete = async () => {
        if (!editingId) return;
        const ok = window.confirm(
            `Remove “${form.name || editingId}” from ZappSites? This turns Active off (no hard delete).`
        );
        if (!ok) return;
        setSaving(true);
        setError('');
        try {
            await adminPatch(`/api/admin/industries/${encodeURIComponent(editingId)}`, {
                active: false
            });
            setShowForm(false);
            load();
        } catch (err: any) {
            setError(err.message || 'Could not remove industry');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="font-bold text-[#0F172A]">Booking industries</h2>
                    <p className="text-xs text-[#64748B] mt-0.5">
                        {industries.length} industr{industries.length === 1 ? 'y' : 'ies'} in catalog
                        {query.trim() ? ` · ${filtered.length} match` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] text-white px-4 py-2 text-xs font-bold hover:bg-[#1E293B]"
                >
                    <Plus className="w-4 h-4" /> Add industry
                </button>
            </div>

            {!showForm && (
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, id, short name, icon…"
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-3 py-2.5 text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/30"
                />
            </div>
            )}

            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    {error}
                </p>
            )}

            {showForm && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-[#0F172A] text-sm">
                            {editingId ? `Edit ${editingId}` : 'New industry'}
                        </h3>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#F1F5F9]"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-3 text-xs">
                        <label className="flex flex-col gap-1.5 font-semibold text-[#334155]">
                            Name *
                            <input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Roofers"
                                className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm font-medium"
                                autoFocus
                            />
                        </label>
                        {!editingId && (
                            <p className="text-[11px] text-[#94A3B8]">
                                Id, short name, icon, and link are filled in automatically from the name.
                            </p>
                        )}
                        <div className="flex flex-col gap-2 pt-1">
                            <span className="font-semibold text-[#334155]">Icon</span>
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                {INDUSTRY_ICON_OPTIONS.map(({ name, Icon }) => {
                                    const selected = form.icon === name;
                                    return (
                                        <button
                                            key={name}
                                            type="button"
                                            title={name}
                                            onClick={() => setForm((f) => ({ ...f, icon: name }))}
                                            className={cn(
                                                'flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 transition-colors',
                                                selected
                                                    ? 'border-[#FF8800] bg-[#FFF7ED] text-[#C2410C]'
                                                    : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]'
                                            )}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span className="text-[9px] font-bold truncate max-w-full">
                                                {name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <label className="flex flex-col gap-1 font-medium text-[#64748B]">
                                Or type Lucide name
                                <input
                                    value={form.icon}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, icon: e.target.value }))
                                    }
                                    placeholder="Building2"
                                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 font-medium text-[#0F172A]"
                                />
                            </label>
                        </div>

                        <div className="flex flex-col gap-3 pt-1">
                            <label className="flex items-center gap-2.5 font-semibold text-[#334155]">
                                <input
                                    type="checkbox"
                                    checked={form.active}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, active: e.target.checked }))
                                    }
                                    className="h-4 w-4 shrink-0 rounded border-[#CBD5E1]"
                                />
                                <span>Active (show on ZappSites)</span>
                            </label>
                            <label className="flex items-center gap-2.5 font-semibold text-[#334155]">
                                <input
                                    type="checkbox"
                                    checked={form.demoReady}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, demoReady: e.target.checked }))
                                    }
                                    className="h-4 w-4 shrink-0 rounded border-[#CBD5E1]"
                                />
                                <span>
                                    Demo ready
                                    <span className="ml-1.5 font-medium text-[#94A3B8]">
                                        ({form.demoReady ? 'Ready' : 'Generic board'})
                                    </span>
                                </span>
                            </label>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="block text-[11px] font-bold text-[#64748B] hover:text-[#0F172A] pt-1"
                        >
                            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                        </button>

                        {showAdvanced && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#F1F5F9]">
                                {!editingId && (
                                    <label className="flex flex-col gap-1.5 font-semibold text-[#334155]">
                                        Id (slug)
                                        <input
                                            value={form.id}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, id: e.target.value }))
                                            }
                                            placeholder="auto from name if empty"
                                            className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 font-medium"
                                        />
                                    </label>
                                )}
                                <label className="flex flex-col gap-1.5 font-semibold text-[#334155]">
                                    Short name (nav)
                                    <input
                                        value={form.shortName}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, shortName: e.target.value }))
                                        }
                                        placeholder="Same as name if empty"
                                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 font-medium"
                                    />
                                </label>
                                <label className="flex flex-col gap-1.5 font-semibold text-[#334155] sm:col-span-2">
                                    Who We Help link (nav slug)
                                    <input
                                        value={form.navSlug}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, navSlug: e.target.value }))
                                        }
                                        placeholder="/booking-demo?industry=…"
                                        className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 font-medium"
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                        {editingId ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={softDelete}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                                title="Turn off Active (soft remove)"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </button>
                        ) : (
                            <span />
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={save}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8800] text-white text-xs font-bold disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                {editingId ? 'Save changes' : 'Create industry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!showForm && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                {loading ? (
                    <p className="px-5 py-8 text-sm text-[#64748B] flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading industries…
                    </p>
                ) : filtered.length === 0 ? (
                    <p className="px-5 py-8 text-sm text-[#64748B]">
                        {query.trim()
                            ? 'No industries match your search.'
                            : 'No industries yet. Add one to get started.'}
                    </p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[720px]">
                                <thead>
                                    <tr className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-[#64748B]">
                                        <th className="px-4 py-3 font-bold">Id</th>
                                        <th className="px-4 py-3 font-bold">Name</th>
                                        <th className="px-4 py-3 font-bold">Short</th>
                                        <th className="px-4 py-3 font-bold">Active</th>
                                        <th className="px-4 py-3 font-bold">Demo</th>
                                        <th className="px-4 py-3 font-bold" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map((row) => (
                                        <tr key={row.id} className="border-t border-[#F1F5F9]">
                                            <td className="px-4 py-3 font-mono text-xs text-[#64748B]">
                                                {row.id}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-[#0F172A]">
                                                {row.name}
                                            </td>
                                            <td className="px-4 py-3 text-[#64748B]">{row.shortName}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={cn(
                                                        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold',
                                                        row.active
                                                            ? 'bg-emerald-50 text-emerald-800'
                                                            : 'bg-slate-100 text-slate-500'
                                                    )}
                                                >
                                                    {row.active ? 'On' : 'Off'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-[#64748B]">
                                                {row.demoReady ? 'Ready' : 'Generic'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(row)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" /> Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 sm:px-5 py-3 border-t border-[#E2E8F0] bg-[#FCFDFE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[#64748B]">
                                Showing {rangeStart}–{rangeEnd} of {filtered.length}
                                <span className="text-[#94A3B8]"> · {PAGE_SIZE} per page</span>
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Previous
                                </button>
                                <span className="text-xs font-bold text-[#475569] tabular-nums px-1">
                                    {safePage} / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            )}
        </div>
    );
}
