import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Award,
    Phone,
    Mail,
    Globe,
    MapPin,
    Search,
    RefreshCw,
    ChevronRight,
    ArrowUpRight,
    Calendar,
    Users,
    CheckCircle2
} from 'lucide-react';
import { fetchSalesCustomers, fetchSalesIndustries, type SalesUnifiedLead } from './salesApi';
import { cn } from '../../shared/utils';

export default function CustomersPage() {
    const [customers, setCustomers] = useState<SalesUnifiedLead[]>([]);
    const [industries, setIndustries] = useState<Array<{ name: string; count: number }>>([]);
    const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [custRes, indRes] = await Promise.all([
                fetchSalesCustomers({
                    industry: selectedIndustry,
                    q: searchQuery
                }),
                fetchSalesIndustries()
            ]);
            setCustomers(custRes);
            setIndustries(indRes);
        } catch (err: any) {
            console.error('Failed to load customers:', err);
            setError(err.message || 'Failed to load customers');
        } finally {
            setLoading(false);
        }
    }, [selectedIndustry, searchQuery]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredCustomers = useMemo(() => {
        if (!searchQuery.trim()) return customers;
        const q = searchQuery.toLowerCase();
        return customers.filter(
            (c) =>
                c.businessName?.toLowerCase().includes(q) ||
                c.phone?.includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                c.address?.toLowerCase().includes(q) ||
                c.industry?.toLowerCase().includes(q)
        );
    }, [customers, searchQuery]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-emerald-900 to-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-lg">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                        <Award className="w-3.5 h-3.5" />
                        <span>Converted Accounts & Clients</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Customers Directory</h1>
                    <p className="text-sm text-slate-300 max-w-xl">
                        View all leads that have converted into paying clients. Track contact history, assigned services, and active accounts.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center">
                        <div className="text-2xl font-black text-emerald-400">{customers.length}</div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Total Customers</div>
                    </div>
                    <button
                        type="button"
                        onClick={loadData}
                        className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
                        title="Refresh customers"
                    >
                        <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    {error}
                </div>
            )}

            {/* Filters Bar: Search & Industry Categories */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[260px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        <input
                            type="text"
                            placeholder="Search by business name, phone, town or website..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                    </div>

                    <div className="text-xs text-slate-500 font-medium">
                        Showing <strong className="text-slate-800">{filteredCustomers.length}</strong> customer{filteredCustomers.length === 1 ? '' : 's'}
                    </div>
                </div>

                {/* Industry Category Pills */}
                {industries.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setSelectedIndustry('all')}
                            className={cn(
                                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                                selectedIndustry === 'all'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            )}
                        >
                            All Industries
                        </button>
                        {industries.map((ind) => (
                            <button
                                key={ind.name}
                                type="button"
                                onClick={() => setSelectedIndustry(ind.name)}
                                className={cn(
                                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5',
                                    selectedIndustry === ind.name
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                )}
                            >
                                <span>{ind.name}</span>
                                <span className={cn(
                                    "text-[10px] px-1.5 py-0.2 rounded-full",
                                    selectedIndustry === ind.name ? "bg-white/20 text-white" : "bg-white text-slate-500"
                                )}>
                                    {ind.count}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Customers Table / Grid */}
            {!filteredCustomers.length ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                        <Users className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No Customers Found</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {searchQuery || selectedIndustry !== 'all'
                            ? 'No customers match your active search or industry filter.'
                            : 'When leads are marked as Converted in your sales queue or CRM, they will appear here as active customers.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                                    <th className="p-4">Customer & Business</th>
                                    <th className="p-4">Contact Info</th>
                                    <th className="p-4">Location</th>
                                    <th className="p-4">Website</th>
                                    <th className="p-4">Converted</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredCustomers.map((c) => (
                                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="p-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 text-sm">
                                                        {c.businessName || c.name || 'Customer'}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                        Customer
                                                    </span>
                                                </div>
                                                {c.industry && (
                                                    <div className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                                                        {c.industry}
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        <td className="p-4">
                                            <div className="space-y-1 text-xs">
                                                {c.phone ? (
                                                    <a
                                                        href={`tel:${c.phone}`}
                                                        className="flex items-center gap-1.5 font-bold text-slate-800 hover:text-emerald-600"
                                                    >
                                                        <Phone className="w-3.5 h-3.5 text-amber-500" />
                                                        <span>{c.phone}</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-400">No phone</span>
                                                )}
                                                {c.email && (
                                                    <a
                                                        href={`mailto:${c.email}`}
                                                        className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600"
                                                    >
                                                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                                                        <span>{c.email}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </td>

                                        <td className="p-4 text-xs text-slate-600">
                                            <div className="flex items-center gap-1.5 max-w-[180px] truncate">
                                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span>{c.address || c.city || '—'}</span>
                                            </div>
                                        </td>

                                        <td className="p-4 text-xs">
                                            {c.website ? (
                                                <a
                                                    href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline max-w-[160px] truncate font-medium"
                                                >
                                                    <Globe className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{c.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                                                </a>
                                            ) : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </td>

                                        <td className="p-4 text-xs text-slate-500 font-medium">
                                            {c.convertedAt ? (
                                                <div className="flex items-center gap-1 text-emerald-800 font-semibold">
                                                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span>{new Date(c.convertedAt).toLocaleDateString()}</span>
                                                </div>
                                            ) : (
                                                <span>Active</span>
                                            )}
                                        </td>

                                        <td className="p-4 text-right">
                                            <Link
                                                to={`/sales/leads/${c.id}`}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                                            >
                                                <span>View CRM</span>
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
