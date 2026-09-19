import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertCircle,
    ArrowRight,
    Bell,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock,
    ListTodo,
    Phone,
    PhoneCall,
    RefreshCw,
    Users,
    X
} from 'lucide-react';
import {
    type SalesLeadActivity,
    type SalesLeadTask,
    type SalesSummaryMetrics,
    type SalesUnifiedLead,
    fetchSalesActivities,
    fetchSalesCustomers,
    fetchSalesLeads,
    fetchSalesSummary,
    fetchSalesTasks
} from './salesApi';
import { cn } from '../../shared/utils';

type DateFilterMode = 'today' | 'tomorrow' | 'this_week' | 'all' | 'custom';

function formatPillDate(d: Date): string {
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const day = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = d.getFullYear();
    const monthFormatted = month === 'Sep' ? 'Sept' : month;
    return `${weekday}, ${day} ${monthFormatted} ${year}`;
}

const PRIORITY_DOT: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-rose-500',
    medium: 'bg-amber-500',
    low: 'bg-slate-400'
};

function formatDueLabel(dueStr?: string | null) {
    if (!dueStr) return null;
    const due = new Date(dueStr);
    if (isNaN(due.getTime())) return null;
    const now = new Date();
    const isPast = due < now && due.toDateString() !== now.toDateString();
    const isToday = due.toDateString() === now.toDateString();
    if (isPast) return { text: 'Overdue', tone: 'text-rose-600 bg-rose-50 border-rose-200' };
    if (isToday) {
        return {
            text: `Today ${due.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
            tone: 'text-amber-700 bg-amber-50 border-amber-200'
        };
    }
    return {
        text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tone: 'text-slate-600 bg-slate-50 border-slate-200'
    };
}

function formatRelativeTime(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SalesQueue() {
    const [summary, setSummary] = useState<SalesSummaryMetrics>({
        pendingTasksCount: 0,
        inProgressTasksCount: 0,
        dueTodayTasksCount: 0,
        callsTodayCount: 0,
        completedTasksCount: 0,
        leadsCount: 0
    });
    const [allTasks, setAllTasks] = useState<SalesLeadTask[]>([]);
    const [allCalls, setAllCalls] = useState<SalesLeadActivity[]>([]);
    const [recentLeads, setRecentLeads] = useState<SalesUnifiedLead[]>([]);
    const [customersCount, setCustomersCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Date Filter State
    const [dateFilter, setDateFilter] = useState<DateFilterMode>('today');
    const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const datePickerRef = useRef<HTMLDivElement | null>(null);

    // Close date picker on click outside or escape key
    useEffect(() => {
        if (!datePickerOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
                setDatePickerOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDatePickerOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [datePickerOpen]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [summaryData, tasks, leads, activities, customers] = await Promise.all([
                fetchSalesSummary().catch(() => ({
                    pendingTasksCount: 0,
                    inProgressTasksCount: 0,
                    dueTodayTasksCount: 0,
                    callsTodayCount: 0,
                    completedTasksCount: 0,
                    leadsCount: 0
                })),
                fetchSalesTasks().catch(() => [] as SalesLeadTask[]),
                fetchSalesLeads().catch(() => [] as SalesUnifiedLead[]),
                fetchSalesActivities().catch(() => [] as SalesLeadActivity[]),
                fetchSalesCustomers().catch(() => [] as SalesUnifiedLead[])
            ]);

            setSummary(summaryData);
            setAllTasks(tasks);
            setAllCalls(activities);
            setRecentLeads(leads.filter((l) => !l.isCustomer).slice(0, 5));
            setCustomersCount(customers.length);
        } catch (err: any) {
            setError(err.message || 'Failed to load dashboard overview');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const pillLabel = useMemo(() => {
        const now = new Date();
        if (dateFilter === 'today') {
            return formatPillDate(now);
        }
        if (dateFilter === 'tomorrow') {
            const tom = new Date(now);
            tom.setDate(tom.getDate() + 1);
            return `Tomorrow · ${tom.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
        }
        if (dateFilter === 'this_week') {
            return 'Next 7 Days';
        }
        if (dateFilter === 'custom' && customDate) {
            const parts = customDate.split('-');
            if (parts.length === 3) {
                const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                return formatPillDate(d);
            }
            return customDate;
        }
        return 'All Dates';
    }, [dateFilter, customDate]);

    // Dynamically filter open tasks by selected date filter
    const displayedTasks = useMemo(() => {
        const openTasks = allTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);

        const tom = new Date(now);
        tom.setDate(tom.getDate() + 1);
        const tomStr = tom.toISOString().slice(0, 10);

        const next7 = new Date(now);
        next7.setDate(next7.getDate() + 7);
        const next7Str = next7.toISOString().slice(0, 10);

        if (dateFilter === 'today') {
            return openTasks
                .filter((t) => {
                    if (!t.dueDate) return true;
                    return t.dueDate.slice(0, 10) <= todayStr;
                })
                .sort((a, b) => {
                    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    const aUrgent = a.dueDate && a.dueDate.slice(0, 10) <= todayStr ? 0 : 1;
                    const bUrgent = b.dueDate && b.dueDate.slice(0, 10) <= todayStr ? 0 : 1;
                    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
                    return aDue - bDue;
                })
                .slice(0, 6);
        }

        if (dateFilter === 'tomorrow') {
            return openTasks
                .filter((t) => t.dueDate && t.dueDate.slice(0, 10) === tomStr)
                .sort((a, b) => {
                    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    return aDue - bDue;
                })
                .slice(0, 6);
        }

        if (dateFilter === 'this_week') {
            return openTasks
                .filter((t) => t.dueDate && t.dueDate.slice(0, 10) >= todayStr && t.dueDate.slice(0, 10) <= next7Str)
                .sort((a, b) => {
                    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    return aDue - bDue;
                })
                .slice(0, 6);
        }

        if (dateFilter === 'custom' && customDate) {
            return openTasks
                .filter((t) => t.dueDate && t.dueDate.slice(0, 10) === customDate)
                .sort((a, b) => {
                    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
                    return aDue - bDue;
                })
                .slice(0, 6);
        }

        return [...openTasks]
            .sort((a, b) => {
                const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
                const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
                const aUrgent = a.dueDate && a.dueDate.slice(0, 10) <= todayStr ? 0 : 1;
                const bUrgent = b.dueDate && b.dueDate.slice(0, 10) <= todayStr ? 0 : 1;
                if (aUrgent !== bUrgent) return aUrgent - bUrgent;
                return aDue - bDue;
            })
            .slice(0, 6);
    }, [allTasks, dateFilter, customDate]);

    // Dynamically filter calls by selected date filter
    const displayedCalls = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const callLogs = allCalls.filter((a) => a.activityType === 'call_log');

        if (dateFilter === 'today') {
            const todayCalls = callLogs.filter((c) => c.createdAt && c.createdAt.slice(0, 10) === todayStr);
            return todayCalls.length > 0 ? todayCalls.slice(0, 5) : callLogs.slice(0, 5);
        }
        if (dateFilter === 'custom' && customDate) {
            const customCalls = callLogs.filter((c) => c.createdAt && c.createdAt.slice(0, 10) === customDate);
            return customCalls.length > 0 ? customCalls.slice(0, 5) : callLogs.slice(0, 5);
        }
        return callLogs.slice(0, 5);
    }, [allCalls, dateFilter, customDate]);

    const dueMetricValue = useMemo(() => {
        if (dateFilter === 'today') {
            return summary.dueTodayTasksCount;
        }
        return displayedTasks.length;
    }, [dateFilter, summary.dueTodayTasksCount, displayedTasks.length]);

    const metricCards = [
        {
            label: 'Pending',
            value: summary.pendingTasksCount,
            hint: 'Not started',
            icon: ListTodo,
            tone: 'bg-slate-100 text-slate-700',
            to: '/sales/tasks'
        },
        {
            label: 'In progress',
            value: summary.inProgressTasksCount ?? 0,
            hint: 'Work started',
            icon: Clock,
            tone: 'bg-amber-50 text-amber-600',
            to: '/sales/tasks'
        },
        {
            label: dateFilter === 'today' ? 'Due today' : 'Due (' + (dateFilter === 'tomorrow' ? 'Tomorrow' : 'Selected') + ')',
            value: dueMetricValue,
            hint: dateFilter === 'today' ? 'Action needed' : 'Filtered view',
            icon: Calendar,
            tone: 'bg-rose-50 text-rose-600',
            to: '/sales/tasks'
        },
        {
            label: 'Calls today',
            value: summary.callsTodayCount,
            hint: 'Logged today',
            icon: Phone,
            tone: 'bg-blue-50 text-blue-600',
            to: '/sales/calls'
        },
        {
            label: 'Active leads',
            value: summary.leadsCount,
            hint: 'In your pipeline',
            icon: Users,
            tone: 'bg-orange-50 text-orange-600',
            to: '/sales/customers'
        }
    ];

    const shortcuts = [
        {
            title: 'Admin tasks',
            desc: 'Work assigned by administrators',
            to: '/sales/tasks',
            icon: ListTodo,
            count: summary.pendingTasksCount + (summary.inProgressTasksCount ?? 0)
        },
        {
            title: 'Self reminders',
            desc: 'Your follow-ups and scheduled calls',
            to: '/sales/reminders',
            icon: Bell,
            count: null
        },
        {
            title: 'Call logs',
            desc: 'Conversation history & dispositions',
            to: '/sales/calls',
            icon: PhoneCall,
            count: summary.callsTodayCount
        },
        {
            title: 'Customers',
            desc: 'Converted accounts you manage',
            to: '/sales/customers',
            icon: Users,
            count: customersCount
        }
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                        Sales overview
                    </h2>
                    <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                        A snapshot of your pipeline, priorities, and today&apos;s activity.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    {/* Workable Interactive Date Pill */}
                    <div className="relative" ref={datePickerRef}>
                        <button
                            type="button"
                            onClick={() => setDatePickerOpen((prev) => !prev)}
                            className={cn(
                                'text-xs sm:text-sm font-semibold bg-white border px-3.5 py-1.5 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer select-none group',
                                datePickerOpen
                                    ? 'border-orange-500 ring-2 ring-orange-500/10 text-[#0F172A]'
                                    : dateFilter !== 'today'
                                    ? 'border-orange-300 bg-orange-50/40 text-orange-900 hover:bg-orange-50'
                                    : 'border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                            )}
                            title="Click to filter by date"
                            aria-expanded={datePickerOpen}
                        >
                            <Calendar className={cn('w-3.5 h-3.5 transition-colors', datePickerOpen || dateFilter !== 'today' ? 'text-orange-600' : 'text-[#94A3B8] group-hover:text-[#64748B]')} />
                            <span>{pillLabel}</span>
                            <ChevronDown className={cn('w-3.5 h-3.5 text-[#94A3B8] transition-transform duration-200', datePickerOpen && 'rotate-180 text-orange-600')} />
                        </button>

                        {/* Date Picker Popover */}
                        {datePickerOpen && (
                            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#F1F5F9]">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-[#64748B]">Date View Filter</span>
                                    {dateFilter !== 'today' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDateFilter('today');
                                                setDatePickerOpen(false);
                                            }}
                                            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer"
                                        >
                                            Reset to Today
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDateFilter('today');
                                            setDatePickerOpen(false);
                                        }}
                                        className={cn(
                                            'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                                            dateFilter === 'today'
                                                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                                : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-transparent'
                                        )}
                                    >
                                        <span>Today</span>
                                        {dateFilter === 'today' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDateFilter('tomorrow');
                                            setDatePickerOpen(false);
                                        }}
                                        className={cn(
                                            'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                                            dateFilter === 'tomorrow'
                                                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                                : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-transparent'
                                        )}
                                    >
                                        <span>Tomorrow</span>
                                        {dateFilter === 'tomorrow' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDateFilter('this_week');
                                            setDatePickerOpen(false);
                                        }}
                                        className={cn(
                                            'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                                            dateFilter === 'this_week'
                                                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                                : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-transparent'
                                        )}
                                    >
                                        <span>Next 7 Days</span>
                                        {dateFilter === 'this_week' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDateFilter('all');
                                            setDatePickerOpen(false);
                                        }}
                                        className={cn(
                                            'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
                                            dateFilter === 'all'
                                                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                                : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] border border-transparent'
                                        )}
                                    >
                                        <span>All Dates</span>
                                        {dateFilter === 'all' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                                    </button>
                                </div>

                                <div className="pt-2.5 border-t border-[#F1F5F9]">
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-[#64748B] mb-1.5">
                                        Custom Date
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={customDate}
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    setCustomDate(e.target.value);
                                                    setDateFilter('custom');
                                                    setDatePickerOpen(false);
                                                }
                                            }}
                                            className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-semibold text-[#0F172A] focus:outline-none focus:border-orange-500 focus:bg-white transition-colors"
                                        />
                                        {dateFilter === 'custom' && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDateFilter('today');
                                                    setDatePickerOpen(false);
                                                }}
                                                className="p-2 text-[#94A3B8] hover:text-[#0F172A] rounded-xl hover:bg-[#F1F5F9] transition-colors cursor-pointer"
                                                title="Reset to today"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => loadData()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin text-orange-500')} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-sm text-red-700">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="font-bold text-red-600 hover:underline">
                        Dismiss
                    </button>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {metricCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link
                            key={card.label}
                            to={card.to}
                            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-2xs hover:shadow-xs hover:border-orange-200 transition-all group"
                        >
                            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', card.tone)}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mt-3">
                                {card.label}
                            </p>
                            <p className="text-2xl font-black text-[#0F172A] mt-0.5 tabular-nums">
                                {loading ? '—' : card.value}
                            </p>
                            <p className="text-xs text-[#94A3B8] mt-0.5 flex items-center gap-1 group-hover:text-orange-600 transition-colors">
                                {card.hint}
                                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </p>
                        </Link>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {shortcuts.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 hover:border-orange-300 hover:bg-[#FFFBF5] transition-all group"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="w-10 h-10 rounded-xl bg-[#FFF7ED] text-orange-600 flex items-center justify-center">
                                    <Icon className="w-5 h-5" />
                                </div>
                                {item.count != null && (
                                    <span className="text-xs font-black tabular-nums text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded-lg">
                                        {loading ? '—' : item.count}
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 text-sm font-black text-[#0F172A] group-hover:text-orange-700 transition-colors">
                                {item.title}
                            </p>
                            <p className="text-xs text-[#64748B] mt-0.5">{item.desc}</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                Open <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                        </Link>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Needs attention */}
                <section className="lg:col-span-1 bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-black text-[#0F172A]">Needs attention</h3>
                            <p className="text-[11px] text-[#64748B]">
                                {dateFilter === 'today'
                                    ? 'Due today & open tasks'
                                    : dateFilter === 'tomorrow'
                                    ? 'Tasks due tomorrow'
                                    : dateFilter === 'this_week'
                                    ? 'Tasks due next 7 days'
                                    : dateFilter === 'custom'
                                    ? `Tasks due ${pillLabel}`
                                    : 'All pending & open tasks'}
                            </p>
                        </div>
                        <Link
                            to="/sales/tasks"
                            className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                        >
                            All tasks <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="divide-y divide-[#F1F5F9]">
                        {loading && !displayedTasks.length ? (
                            <p className="px-4 py-8 text-sm text-[#64748B] text-center">Loading…</p>
                        ) : !displayedTasks.length ? (
                            <div className="px-4 py-8 text-center">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                                <p className="text-sm font-bold text-[#0F172A]">You&apos;re clear</p>
                                <p className="text-xs text-[#64748B] mt-1">
                                    {dateFilter === 'today'
                                        ? 'No open tasks need attention right now.'
                                        : `No tasks due for ${pillLabel}.`}
                                </p>
                                {dateFilter !== 'today' && (
                                    <button
                                        type="button"
                                        onClick={() => setDateFilter('today')}
                                        className="mt-2.5 text-xs font-bold text-orange-600 hover:underline cursor-pointer"
                                    >
                                        Show Today
                                    </button>
                                )}
                            </div>
                        ) : (
                            displayedTasks.map((task) => {
                                const due = formatDueLabel(task.dueDate);
                                return (
                                    <Link
                                        key={task.id}
                                        to={`/sales/leads/${encodeURIComponent(task.leadId)}`}
                                        className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors"
                                    >
                                        <span
                                            className={cn(
                                                'mt-1.5 w-2 h-2 rounded-full shrink-0',
                                                PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium
                                            )}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{task.title}</p>
                                            <p className="text-xs text-[#64748B] truncate mt-0.5">
                                                {task.leadBusinessName || 'Lead'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] capitalize">
                                                    {task.status.replace('_', ' ')}
                                                </span>
                                                {due && (
                                                    <span
                                                        className={cn(
                                                            'text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                                                            due.tone
                                                        )}
                                                    >
                                                        {due.text}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-[#CBD5E1] shrink-0 mt-1" />
                                    </Link>
                                );
                            })
                        )}
                    </div>
                </section>

                {/* Pipeline snapshot */}
                <section className="lg:col-span-1 bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-black text-[#0F172A]">Pipeline snapshot</h3>
                            <p className="text-[11px] text-[#64748B]">Recent leads in your queue</p>
                        </div>
                        <Link
                            to="/sales/customers"
                            className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                        >
                            Customers <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="divide-y divide-[#F1F5F9]">
                        {loading && !recentLeads.length ? (
                            <p className="px-4 py-8 text-sm text-[#64748B] text-center">Loading…</p>
                        ) : !recentLeads.length ? (
                            <p className="px-4 py-8 text-sm text-[#64748B] text-center">No active leads yet.</p>
                        ) : (
                            recentLeads.map((lead) => (
                                <Link
                                    key={lead.id}
                                    to={`/sales/leads/${encodeURIComponent(lead.id)}`}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-[#FFF7ED] text-orange-700 flex items-center justify-center text-xs font-black shrink-0">
                                        {(lead.businessName || lead.name || '?').slice(0, 1).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-[#0F172A] truncate">
                                            {lead.businessName || lead.name || 'Untitled lead'}
                                        </p>
                                        <p className="text-xs text-[#64748B] truncate mt-0.5">
                                            {[lead.city, lead.industry].filter(Boolean).join(' · ') || lead.phone || '—'}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] capitalize shrink-0">
                                        {(lead.status || 'new').replace('_', ' ')}
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                </section>

                {/* Recent calls */}
                <section className="lg:col-span-1 bg-white border border-[#E2E8F0] rounded-2xl shadow-2xs overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-black text-[#0F172A]">Recent calls</h3>
                            <p className="text-[11px] text-[#64748B]">
                                {dateFilter === 'today'
                                    ? 'Logged today'
                                    : dateFilter === 'custom'
                                    ? `Calls for ${pillLabel}`
                                    : 'Latest logged conversations'}
                            </p>
                        </div>
                        <Link
                            to="/sales/calls"
                            className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                        >
                            Call logs <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <div className="divide-y divide-[#F1F5F9]">
                        {loading && !displayedCalls.length ? (
                            <p className="px-4 py-8 text-sm text-[#64748B] text-center">Loading…</p>
                        ) : !displayedCalls.length ? (
                            <p className="px-4 py-8 text-sm text-[#64748B] text-center">No calls logged for this date.</p>
                        ) : (
                            displayedCalls.map((act) => (
                                <Link
                                    key={act.id}
                                    to={`/sales/leads/${encodeURIComponent(act.leadId)}`}
                                    className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        <PhoneCall className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-[#0F172A] truncate">
                                            {act.leadBusinessName || 'Lead call'}
                                        </p>
                                        <p className="text-xs text-[#64748B] truncate mt-0.5">
                                            {act.disposition
                                                ? act.disposition.replace(/_/g, ' ')
                                                : act.note || 'Call logged'}
                                        </p>
                                        <p className="text-[10px] font-semibold text-[#94A3B8] mt-1">
                                            {formatRelativeTime(act.createdAt)}
                                        </p>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </section>
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-orange-300">Completed</p>
                    <p className="text-2xl font-black mt-1 tabular-nums">{loading ? '—' : summary.completedTasksCount}</p>
                    <p className="text-sm text-white/60 mt-1">Tasks finished across your queue. Keep the momentum going.</p>
                </div>
                <Link
                    to="/sales/tasks"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 text-white px-5 py-3 text-sm font-bold hover:bg-orange-400 shrink-0"
                >
                    Go to tasks <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
}
