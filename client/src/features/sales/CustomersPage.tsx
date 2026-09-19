import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Search,
    RefreshCw,
    ChevronRight,
    ChevronDown,
    ArrowRight,
    Info,
    X,
    Briefcase,
    ListFilter,
    Check,
    CheckCircle2,
    Phone,
    Mail,
    MapPin,
    Globe,
    Calendar,
    ArrowUpRight,
    PhoneCall,
    Users
} from 'lucide-react';
import { fetchSalesCustomers, fetchSalesIndustries, type SalesUnifiedLead } from './salesApi';
import { cn } from '../../shared/utils';
import LogCallModal from './LogCallModal';

const PRESET_PILLS = [
    { label: 'All customers', value: 'all' },
    { label: 'Private tutors & tuition centres', value: 'Private tutors & tuition centres' },
    { label: 'Restaurants', value: 'Restaurants' },
    { label: 'Other industries', value: 'other' }
];

const SERVICE_STATUS_OPTIONS = [
    { label: 'All service statuses', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Pending onboarding', value: 'onboarding' },
    { label: 'Completed', value: 'completed' },
    { label: 'Inactive', value: 'inactive' }
];

export default function CustomersPage() {
    const [customers, setCustomers] = useState<SalesUnifiedLead[]>([]);
    const [industries, setIndustries] = useState<Array<{ name: string; count: number }>>([]);
    const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
    const [serviceStatus, setServiceStatus] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Dropdown popover states
    const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);
    const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
    const [explainerOpen, setExplainerOpen] = useState(false);

    // Quick call modal state
    const [callModalLead, setCallModalLead] = useState<SalesUnifiedLead | null>(null);

    const industryRef = useRef<HTMLDivElement | null>(null);
    const serviceRef = useRef<HTMLDivElement | null>(null);

    // Close dropdowns on outside click or escape
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (industryRef.current && !industryRef.current.contains(e.target as Node)) {
                setIndustryDropdownOpen(false);
            }
            if (serviceRef.current && !serviceRef.current.contains(e.target as Node)) {
                setServiceDropdownOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIndustryDropdownOpen(false);
                setServiceDropdownOpen(false);
                setExplainerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [custRes, indRes] = await Promise.all([
                fetchSalesCustomers({
                    industry: selectedIndustry !== 'other' ? selectedIndustry : undefined,
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

    // Client-side filtering for service status, industry, and search
    const filteredCustomers = useMemo(() => {
        return customers.filter((c) => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matches =
                    c.businessName?.toLowerCase().includes(q) ||
                    c.phone?.includes(q) ||
                    c.email?.toLowerCase().includes(q) ||
                    c.address?.toLowerCase().includes(q) ||
                    c.city?.toLowerCase().includes(q) ||
                    c.industry?.toLowerCase().includes(q) ||
                    c.website?.toLowerCase().includes(q);
                if (!matches) return false;
            }

            if (selectedIndustry !== 'all') {
                if (selectedIndustry === 'other') {
                    const topNames = ['Private tutors & tuition centres', 'Restaurants'];
                    if (c.industry && topNames.some((t) => c.industry?.toLowerCase().includes(t.toLowerCase()))) {
                        return false;
                    }
                } else if (!c.industry || !c.industry.toLowerCase().includes(selectedIndustry.toLowerCase())) {
                    return false;
                }
            }

            if (serviceStatus !== 'all') {
                const leadStatus = (c.status || '').toLowerCase();
                if (serviceStatus === 'active' && leadStatus !== 'converted' && leadStatus !== 'won' && leadStatus !== 'active') {
                    return false;
                }
                if (serviceStatus === 'onboarding' && !leadStatus.includes('onboard')) {
                    return false;
                }
                if (serviceStatus === 'completed' && !leadStatus.includes('complete')) {
                    return false;
                }
                if (serviceStatus === 'inactive' && !leadStatus.includes('inactive') && !leadStatus.includes('lost')) {
                    return false;
                }
            }

            return true;
        });
    }, [customers, searchQuery, selectedIndustry, serviceStatus]);

    // Available pills: combining presets with real industries
    const pillList = useMemo(() => {
        if (!industries.length) return PRESET_PILLS;
        const main = PRESET_PILLS.slice(0, 3);
        const hasOther = industries.length > 2;
        return hasOther ? [...main, { label: 'Other industries', value: 'other' }] : main;
    }, [industries]);

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                        Customers
                    </h1>
                    <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                        Manage converted accounts, contacts, and active services.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadData()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                >
                    <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin text-orange-500')} />
                    Refresh
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError('')} className="font-bold hover:underline">
                        Dismiss
                    </button>
                </div>
            )}

            {/* 3. Controls & Filter Bar (Matches Mockup) */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-2xs space-y-3.5">
                {/* Search, Dropdowns, and Count */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search business, phone, town, or website..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl placeholder:text-slate-400 text-slate-800 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                        {/* Industry Dropdown */}
                        <div className="relative" ref={industryRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIndustryDropdownOpen((v) => !v);
                                    setServiceDropdownOpen(false);
                                }}
                                className={cn(
                                    'px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer bg-[#F8FAFC]',
                                    industryDropdownOpen || selectedIndustry !== 'all'
                                        ? 'border-orange-500 text-slate-900 bg-white ring-2 ring-orange-500/10'
                                        : 'border-[#E2E8F0] text-slate-700 hover:bg-white hover:border-slate-300'
                                )}
                            >
                                <Briefcase className="w-4 h-4 text-slate-500" />
                                <span className="truncate max-w-[130px]">
                                    {selectedIndustry === 'all'
                                        ? 'Industry'
                                        : selectedIndustry === 'other'
                                        ? 'Other industries'
                                        : selectedIndustry}
                                </span>
                                <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform duration-200', industryDropdownOpen && 'rotate-180 text-orange-600')} />
                            </button>

                            {industryDropdownOpen && (
                                <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-64 bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 py-1.5">
                                        Filter by Industry
                                    </div>
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedIndustry('all');
                                                setIndustryDropdownOpen(false);
                                            }}
                                            className={cn(
                                                'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left cursor-pointer',
                                                selectedIndustry === 'all'
                                                    ? 'bg-orange-50 text-orange-700'
                                                    : 'hover:bg-slate-50 text-slate-700'
                                            )}
                                        >
                                            <span>All Industries</span>
                                            {selectedIndustry === 'all' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                                        </button>
                                        {industries.map((ind) => (
                                            <button
                                                key={ind.name}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedIndustry(ind.name);
                                                    setIndustryDropdownOpen(false);
                                                }}
                                                className={cn(
                                                    'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer',
                                                    selectedIndustry === ind.name
                                                        ? 'bg-orange-50 text-orange-700 font-bold'
                                                        : 'hover:bg-slate-50 text-slate-700'
                                                )}
                                            >
                                                <span className="truncate">{ind.name}</span>
                                                <span className="text-[10px] text-slate-400 tabular-nums ml-2">
                                                    {ind.count}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Service Status Dropdown */}
                        <div className="relative" ref={serviceRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setServiceDropdownOpen((v) => !v);
                                    setIndustryDropdownOpen(false);
                                }}
                                className={cn(
                                    'px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer bg-[#F8FAFC]',
                                    serviceDropdownOpen || serviceStatus !== 'all'
                                        ? 'border-orange-500 text-slate-900 bg-white ring-2 ring-orange-500/10'
                                        : 'border-[#E2E8F0] text-slate-700 hover:bg-white hover:border-slate-300'
                                )}
                            >
                                <ListFilter className="w-4 h-4 text-slate-500" />
                                <span className="truncate max-w-[130px]">
                                    {serviceStatus === 'all'
                                        ? 'Service status'
                                        : SERVICE_STATUS_OPTIONS.find((o) => o.value === serviceStatus)?.label || serviceStatus}
                                </span>
                                <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform duration-200', serviceDropdownOpen && 'rotate-180 text-orange-600')} />
                            </button>

                            {serviceDropdownOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 py-1.5">
                                        Service Status
                                    </div>
                                    <div className="space-y-1">
                                        {SERVICE_STATUS_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => {
                                                    setServiceStatus(opt.value);
                                                    setServiceDropdownOpen(false);
                                                }}
                                                className={cn(
                                                    'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer',
                                                    serviceStatus === opt.value
                                                        ? 'bg-orange-50 text-orange-700 font-bold'
                                                        : 'hover:bg-slate-50 text-slate-700'
                                                )}
                                            >
                                                <span>{opt.label}</span>
                                                {serviceStatus === opt.value && <Check className="w-3.5 h-3.5 text-orange-600" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Customer Count on the right */}
                        <div className="text-xs sm:text-sm font-bold text-slate-600 shrink-0 tabular-nums px-1">
                            {filteredCustomers.length} customer{filteredCustomers.length === 1 ? '' : 's'}
                        </div>
                    </div>
                </div>

                {/* Filter Pills Row (Matches Mockup) */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                    {pillList.map((pill) => {
                        const active = selectedIndustry === pill.value;
                        return (
                            <button
                                key={pill.value}
                                type="button"
                                onClick={() => setSelectedIndustry(pill.value)}
                                className={cn(
                                    'px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 select-none',
                                    active
                                        ? 'bg-[#F97316] text-white shadow-xs'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                )}
                            >
                                {pill.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 4. Customers List OR Empty State (Matches Mockup) */}
            {!filteredCustomers.length ? (
                /* Empty State (Exact mockup layout) */
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 sm:p-16 text-center shadow-2xs">
                    <div className="w-14 h-14 rounded-full bg-[#ECFDF5] text-[#10B981] flex items-center justify-center mx-auto mb-4 border border-emerald-100/80">
                        <Users className="w-7 h-7 text-[#10B981]" />
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-[#0F172A]">
                        No customers yet
                    </h3>
                    <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto mt-1">
                        {searchQuery || selectedIndustry !== 'all' || serviceStatus !== 'all'
                            ? 'No customers match your active search or filter criteria.'
                            : 'Customers appear here after a lead is marked Converted in your sales pipeline.'}
                    </p>

                    <div className="mt-5">
                        {searchQuery || selectedIndustry !== 'all' || serviceStatus !== 'all' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery('');
                                    setSelectedIndustry('all');
                                    setServiceStatus('all');
                                }}
                                className="inline-flex items-center gap-2 bg-[#0B132B] hover:bg-[#1E293B] text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer"
                            >
                                <span>Reset filters</span>
                            </button>
                        ) : (
                            <Link
                                to="/sales"
                                className="inline-flex items-center gap-2 bg-[#0B132B] hover:bg-[#1E293B] text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs"
                            >
                                <span>View leads & pipeline</span>
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>

                    <div className="mt-6 pt-5 border-t border-slate-100 max-w-xs mx-auto">
                        <button
                            type="button"
                            onClick={() => setExplainerOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors cursor-pointer"
                        >
                            <Info className="w-3.5 h-3.5 text-slate-400" />
                            <span className="hover:underline">How customer conversion works</span>
                        </button>
                    </div>
                </div>
            ) : (
                /* Customer Directory Table View */
                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-[#F8FAFC] text-[#64748B] text-[11px] font-bold uppercase tracking-wider border-b border-[#E2E8F0]">
                                    <th className="p-4">Customer & Business</th>
                                    <th className="p-4">Contact Info</th>
                                    <th className="p-4">Location</th>
                                    <th className="p-4">Website</th>
                                    <th className="p-4">Status & Converted</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9]">
                                {filteredCustomers.map((c) => (
                                    <tr key={c.id} className="hover:bg-[#F8FAFC]/80 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 font-black flex items-center justify-center text-sm border border-teal-200/50 shrink-0">
                                                    {(c.businessName || c.name || 'C').slice(0, 1).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-[#0F172A] text-sm truncate">
                                                            {c.businessName || c.name || 'Customer'}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                            Client
                                                        </span>
                                                    </div>
                                                    {c.industry && (
                                                        <span className="inline-block text-xs font-semibold text-[#64748B] mt-0.5">
                                                            {c.industry}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="p-4">
                                            <div className="space-y-1 text-xs">
                                                {c.phone ? (
                                                    <a
                                                        href={`tel:${c.phone}`}
                                                        className="flex items-center gap-1.5 font-bold text-[#0F172A] hover:text-orange-600 transition-colors"
                                                    >
                                                        <Phone className="w-3.5 h-3.5 text-orange-500" />
                                                        <span>{c.phone}</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[#94A3B8]">No phone</span>
                                                )}
                                                {c.email && (
                                                    <a
                                                        href={`mailto:${c.email}`}
                                                        className="flex items-center gap-1.5 text-[#64748B] hover:text-indigo-600 transition-colors"
                                                    >
                                                        <Mail className="w-3.5 h-3.5 text-[#94A3B8]" />
                                                        <span className="truncate max-w-[160px]">{c.email}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </td>

                                        <td className="p-4 text-xs text-[#64748B]">
                                            <div className="flex items-center gap-1.5 max-w-[180px] truncate">
                                                <MapPin className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                                                <span>{c.city || c.address || '—'}</span>
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
                                                    <span className="truncate">{c.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                                </a>
                                            ) : (
                                                <span className="text-[#94A3B8]">—</span>
                                            )}
                                        </td>

                                        <td className="p-4 text-xs text-[#64748B] font-medium">
                                            {c.convertedAt ? (
                                                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                                                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span>{new Date(c.convertedAt).toLocaleDateString()}</span>
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[11px] font-bold">
                                                    Active Service
                                                </span>
                                            )}
                                        </td>

                                        <td className="p-4 text-right">
                                            <div className="inline-flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setCallModalLead(c)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#FFF7ED] hover:bg-[#FFEDD5] text-orange-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                                    title="Log call with customer"
                                                >
                                                    <PhoneCall className="w-3.5 h-3.5" />
                                                    <span>Call</span>
                                                </button>
                                                <Link
                                                    to={`/sales/leads/${c.id}`}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#0F172A] text-xs font-bold rounded-xl transition-colors"
                                                >
                                                    <span>View CRM</span>
                                                    <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 5. "How customer conversion works" Explainer Modal */}
            {explainerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-2xl max-w-lg w-full p-6 sm:p-7 relative space-y-5 animate-in zoom-in-95 duration-150">
                        <button
                            type="button"
                            onClick={() => setExplainerOpen(false)}
                            className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center shrink-0 border border-emerald-100">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-[#0F172A]">
                                    How Customer Conversion Works
                                </h3>
                                <p className="text-xs text-[#64748B]">
                                    LocalPulse Sales Lifecycle & Directory
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3.5 text-xs sm:text-sm text-slate-600">
                            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="w-6 h-6 rounded-full bg-orange-500 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                                    1
                                </div>
                                <div>
                                    <p className="font-bold text-[#0F172A]">Prospecting & Outreach</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Contact leads in your sales pipeline, deliver AI local SEO audits, and complete assigned follow-ups.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                                    2
                                </div>
                                <div>
                                    <p className="font-bold text-[#0F172A]">Mark as Converted</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Once a client signs up or agrees to services, log the call with disposition <strong>Converted 🎉</strong> or click &ldquo;Convert to Customer&rdquo; in the lead view.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                                    3
                                </div>
                                <div>
                                    <p className="font-bold text-[#0F172A]">Active Customer Directory</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        The lead moves into this directory with active account status, assigned marketing services, and historical call archives.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setExplainerOpen(false)}
                                className="bg-[#0B132B] hover:bg-[#1E293B] text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 6. Quick Log Call Modal Integration */}
            {callModalLead && (
                <LogCallModal
                    isOpen={Boolean(callModalLead)}
                    leadId={callModalLead.id}
                    leadName={callModalLead.businessName || callModalLead.name || 'Customer'}
                    leadPhone={callModalLead.phone}
                    onClose={() => setCallModalLead(null)}
                    onSuccess={() => {
                        setCallModalLead(null);
                        loadData();
                    }}
                />
            )}
        </div>
    );
}
