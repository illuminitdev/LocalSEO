import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckSquare,
    Phone,
    RefreshCw,
    Search,
    AlertCircle,
    ListTodo,
    X,
    Shield,
    Clock,
    History,
    Mail,
    Eye,
    Globe,
    ChevronLeft,
    ChevronRight,
    Calendar
} from 'lucide-react';
import LeadStatusHistoryModal from '../admin/LeadStatusHistoryModal';
import {
    matchesStatusDateFilter,
    type StatusDateFilter
} from '../admin/AdminGrowthAuditLeads';
import {
    type SalesLeadTask,
    type SalesTaskPriority,
    fetchSalesTasks,
    fetchSalesIndustries
} from './salesApi';
import { cn } from '../shared/utils';

function formatDateParts(value?: string | null) {
    if (!value) return { date: '—', time: '' };
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${min}` };
    } catch {
        return { date: '—', time: '' };
    }
}

function fmtDate(value?: string | null) {
    const { date, time } = formatDateParts(value);
    return time ? `${date} ${time}` : date;
}

const PRIORITY_BADGES: Record<SalesTaskPriority, { label: string; bg: string; text: string; dot: string }> = {
    urgent: { label: 'Urgent', bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
    high: { label: 'High', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
    medium: { label: 'Medium', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    low: { label: 'Low', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' }
};

export const LEAD_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
    new: { label: 'New', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
    contacted: { label: 'Contacted', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    follow_up: { label: 'Follow Up', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
    callback: { label: 'Callback', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
    in_progress: { label: 'In Progress', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', dot: 'bg-amber-500' },
    interested: { label: 'Interested', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-500' },
    not_interested: { label: 'Not Interested', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-400' },
    converted: { label: 'Converted 🎉', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300', dot: 'bg-purple-500' },
    completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-500' },
    pending: { label: 'New', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' }
};

export function getLeadStatusConfig(status?: string | null) {
    const raw = String(status || 'new').toLowerCase().trim().replace(/[-\s]/g, '_');
    return LEAD_STATUS_CONFIG[raw] || {
        label: (status || 'New').replace(/[_]/g, ' '),
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400'
    };
}

function normalizeTaskIndustry(task: SalesLeadTask): string {
    const raw = String(task.leadIndustry || '').trim();
    if (!raw || /^sheet\s*\d+$/i.test(raw)) return 'General';
    return raw;
}


function industryKey(name: string): string {
    return String(name || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function displayIndustryName(name: string): string {
    const cleaned = String(name || '')
        .trim()
        .replace(/\s+/g, ' ');
    return cleaned || 'General';
}

export default function SalesTasks() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<SalesLeadTask[]>([]);
    const [industries, setIndustries] = useState<Array<{ name: string; count: number }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [leadKindFilter, setLeadKindFilter] = useState<'all' | 'full_audit' | 'leads'>('all');
    const [industryFilter, setIndustryFilter] = useState<string>('all');
    const [statusDateFilter, setStatusDateFilter] = useState<StatusDateFilter>('all');
    const [statusCustomDate, setStatusCustomDate] = useState<string>('');
    const [dueTodayOnly, setDueTodayOnly] = useState(false);

    const TASKS_PER_PAGE = 10;
    const [currentPage, setCurrentPage] = useState(1);

    const [selectedHistoryTask, setSelectedHistoryTask] = useState<SalesLeadTask | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [taskList, industryList] = await Promise.all([
                fetchSalesTasks({}),
                fetchSalesIndustries().catch(() => [] as Array<{ name: string; count: number }>)
            ]);

            setTasks(taskList);
            setIndustries(industryList);
        } catch (err: any) {
            setError(err.message || 'Failed to load assigned tasks');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const handler = () => {
            loadData();
        };
        window.addEventListener('sales:task-updated', handler);
        return () => {
            window.removeEventListener('sales:task-updated', handler);
        };
    }, [loadData]);

    const openLeadDetails = (task: SalesLeadTask, focusSection?: string) => {
        navigate(`/sales/leads/${encodeURIComponent(task.leadId)}${focusSection ? `#${focusSection}` : ''}`, {
            state: { from: '/sales/tasks', fromLabel: 'Tasks', scrollTo: focusSection }
        });
    };

    const isFullAuditTask = (t: SalesLeadTask) =>
        String(t.leadSource || '').toLowerCase() === 'full_audit';

    const industryOptions = useMemo(() => {
        const byKey = new Map<string, string>();
        const preferName = (candidate: string) => {
            const display = displayIndustryName(candidate);
            const key = industryKey(display);
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, display);
                return;
            }
            if (display.length > existing.length || (display.length === existing.length && display < existing)) {
                byKey.set(key, display);
            }
        };
        for (const ind of industries) {
            preferName(String(ind.name || ''));
        }
        for (const t of tasks) {
            preferName(normalizeTaskIndustry(t));
        }
        return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [industries, tasks]);

interface GroupedSalesTask {
    leadId: string;
    primaryTask: SalesLeadTask;
    totalTasks: number;
    pendingTasks: number;
    tasks: SalesLeadTask[];
}

const STATUS_PRIORITY_ORDER: Record<string, number> = {
    in_progress: 0,
    pending: 1,
    cancelled: 2,
    completed: 3
};

const TASK_PRIORITY_ORDER: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3
};

function compareTasksForPrimary(a: SalesLeadTask, b: SalesLeadTask): number {
    const sA = STATUS_PRIORITY_ORDER[a.status] ?? 99;
    const sB = STATUS_PRIORITY_ORDER[b.status] ?? 99;
    if (sA !== sB) return sA - sB;

    const pA = TASK_PRIORITY_ORDER[a.priority] ?? 99;
    const pB = TASK_PRIORITY_ORDER[b.priority] ?? 99;
    if (pA !== pB) return pA - pB;

    if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    const dateA = new Date(a.updatedAt || a.createdAt).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt).getTime();
    return dateB - dateA;
}

    const industryScopedTasks = useMemo(() => {
        if (industryFilter === 'all') return tasks;
        const selected = industryKey(industryFilter);
        return tasks.filter((t) => industryKey(normalizeTaskIndustry(t)) === selected);
    }, [tasks, industryFilter]);

    const filteredTasks = useMemo(() => {
        return industryScopedTasks.filter((t) => {
            // 1. Lead Status
            if (statusFilter !== 'all') {
                const stat = String(t.leadStatus || 'new').toLowerCase().trim().replace(/[-\s]/g, '_');
                const target = statusFilter.toLowerCase().trim().replace(/[-\s]/g, '_');
                if (target === 'new') {
                    const isNew = stat === 'new' || stat === 'pending' || stat === 'submitted' || !stat;
                    if (!isNew) return false;
                } else if (target === 'follow_up' || target === 'callback') {
                    if (!stat.includes('follow') && !stat.includes('callback')) return false;
                } else if (target === 'interested') {
                    if (!stat.includes('interested') || stat.includes('not_interested')) return false;
                } else if (target === 'not_interested') {
                    if (!stat.includes('not_interested') && !stat.includes('rejected') && !stat.includes('declined')) return false;
                } else if (target === 'contacted') {
                    if (!stat.includes('contacted') && !stat.includes('called') && !stat.includes('connected')) return false;
                } else if (target === 'converted') {
                    if (!stat.includes('converted') && !stat.includes('won')) return false;
                } else if (target === 'completed') {
                    if (!stat.includes('complete') && !stat.includes('done')) return false;
                } else if (stat !== target && !stat.includes(target)) {
                    return false;
                }
            }

            // 2. Priority
            if (priorityFilter !== 'all') {
                const prio = String(t.priority || 'medium').toLowerCase().trim();
                if (prio !== priorityFilter.toLowerCase().trim()) return false;
            }

            // 3. Task Type
            if (typeFilter !== 'all') {
                if (t.taskType !== typeFilter) return false;
            }

            // 4. Lead Kind
            if (leadKindFilter === 'full_audit' && !isFullAuditTask(t)) return false;
            if (leadKindFilter === 'leads' && isFullAuditTask(t)) return false;

            // 5. Due Today Only
            if (dueTodayOnly) {
                const todayStr = new Date().toISOString().slice(0, 10);
                const isDueToday = Boolean(t.dueDate && t.status !== 'completed' && t.dueDate.startsWith(todayStr));
                if (!isDueToday) return false;
            }

            // 6. Status Date
            const taskStatusDate = t.updatedAt || t.completedAt || t.createdAt;
            if (!matchesStatusDateFilter(taskStatusDate, statusDateFilter, statusCustomDate)) {
                return false;
            }

            // 7. Search Query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matches =
                    (t.title || '').toLowerCase().includes(q) ||
                    (t.notes && t.notes.toLowerCase().includes(q)) ||
                    (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
                    (t.leadPhone && t.leadPhone.includes(q)) ||
                    (t.leadEmail && t.leadEmail.toLowerCase().includes(q)) ||
                    (t.leadStatus && t.leadStatus.toLowerCase().includes(q)) ||
                    normalizeTaskIndustry(t).toLowerCase().includes(q);
                if (!matches) return false;
            }

            return true;
        });
    }, [
        industryScopedTasks,
        statusFilter,
        priorityFilter,
        typeFilter,
        leadKindFilter,
        dueTodayOnly,
        statusDateFilter,
        statusCustomDate,
        searchQuery
    ]);

    const dedupedTasks = useMemo(() => {
        const groups = new Map<string, SalesLeadTask[]>();
        for (const t of filteredTasks) {
            const key = t.leadId || t.id;
            const list = groups.get(key);
            if (list) {
                list.push(t);
            } else {
                groups.set(key, [t]);
            }
        }

        const result: GroupedSalesTask[] = [];
        for (const [key, list] of groups.entries()) {
            list.sort(compareTasksForPrimary);
            const pendingCount = list.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;
            result.push({
                leadId: key,
                primaryTask: list[0],
                totalTasks: list.length,
                pendingTasks: pendingCount,
                tasks: list
            });
        }
        return result;
    }, [filteredTasks]);

    const totalPages = Math.max(1, Math.ceil(dedupedTasks.length / TASKS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const pagedGroups = dedupedTasks.slice((safePage - 1) * TASKS_PER_PAGE, safePage * TASKS_PER_PAGE);

    const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

    const fullAuditCount = industryScopedTasks.filter(isFullAuditTask).length;
    const leadsOnlyCount = industryScopedTasks.length - fullAuditCount;

    const newLeadsCount = industryScopedTasks.filter((t) => (t.leadStatus || 'new') === 'new').length;
    const contactedCount = industryScopedTasks.filter((t) => t.leadStatus === 'contacted').length;
    const followUpCount = industryScopedTasks.filter((t) => t.leadStatus === 'follow_up' || t.leadStatus === 'callback').length;
    const interestedCount = industryScopedTasks.filter((t) => t.leadStatus === 'interested').length;
    const convertedCount = industryScopedTasks.filter((t) => t.leadStatus === 'converted').length;
    const dueTodayCount = industryScopedTasks.filter((t) => t.dueDate && t.status !== 'completed' && t.dueDate.startsWith(new Date().toISOString().slice(0, 10))).length;

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                        Admin Assigned Tasks
                    </h1>
                    <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
                        High-priority tasks and lead assignments directed by your administrators.
                    </p>
                </div>

                <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadData()}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] text-xs font-bold rounded-xl transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                    <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* New */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'new' ? 'all' : 'new');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-slate-300",
                        statusFilter === 'new' && !dueTodayOnly ? "border-slate-800 ring-2 ring-slate-800/20 bg-slate-50/50" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">New</span>
                        <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                            <ListTodo className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-[#0F172A] mt-1.5">{newLeadsCount}</p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">Fresh leads</p>
                </button>

                {/* Contacted */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'contacted' ? 'all' : 'contacted');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-blue-300",
                        statusFilter === 'contacted' && !dueTodayOnly ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Contacted</span>
                        <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Phone className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-blue-950 mt-1.5">{contactedCount}</p>
                    <p className="text-[10px] text-blue-700 font-medium mt-0.5">Outreach made</p>
                </button>

                {/* Follow Up */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'follow_up' ? 'all' : 'follow_up');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-amber-300",
                        statusFilter === 'follow_up' && !dueTodayOnly ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Follow Up</span>
                        <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-amber-950 mt-1.5">{followUpCount}</p>
                    <p className="text-[10px] text-amber-700 font-medium mt-0.5">Callbacks pending</p>
                </button>

                {/* Interested */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'interested' ? 'all' : 'interested');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-emerald-300",
                        statusFilter === 'interested' && !dueTodayOnly ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Interested</span>
                        <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckSquare className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-emerald-950 mt-1.5">{interestedCount}</p>
                    <p className="text-[10px] text-emerald-700 font-medium mt-0.5">High intent</p>
                </button>

                {/* Converted */}
                <button
                    type="button"
                    onClick={() => {
                        setStatusFilter(statusFilter === 'converted' ? 'all' : 'converted');
                        setDueTodayOnly(false);
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-purple-300",
                        statusFilter === 'converted' && !dueTodayOnly ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800">Converted</span>
                        <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Shield className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-purple-950 mt-1.5">{convertedCount}</p>
                    <p className="text-[10px] text-purple-700 font-medium mt-0.5">Customers 🎉</p>
                </button>

                {/* Due Today */}
                <button
                    type="button"
                    onClick={() => {
                        setDueTodayOnly(!dueTodayOnly);
                        if (!dueTodayOnly) setStatusFilter('all');
                        setCurrentPage(1);
                    }}
                    className={cn(
                        "bg-white border rounded-2xl p-3.5 shadow-xs text-left transition-all hover:border-rose-300",
                        dueTodayOnly ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/30" : "border-[#E2E8F0]"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Due Today</span>
                        <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <p className="text-2xl font-black text-rose-950 mt-1.5">{dueTodayCount}</p>
                    <p className="text-[10px] text-rose-600 font-semibold mt-0.5">Tasks due today</p>
                </button>
            </div>

            {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 font-bold shadow-xs">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="text-rose-600 hover:text-rose-900">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search tasks, lead, notes…"
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#F59E0B] focus:bg-white"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Lead Statuses ({industryScopedTasks.length})</option>
                        <option value="new">New ({newLeadsCount})</option>
                        <option value="contacted">Contacted ({contactedCount})</option>
                        <option value="follow_up">Follow Up ({followUpCount})</option>
                        <option value="interested">Interested ({interestedCount})</option>
                        <option value="converted">Converted ({convertedCount})</option>
                        <option value="not_interested">Not Interested ({industryScopedTasks.filter((t) => t.leadStatus === 'not_interested').length})</option>
                    </select>

                    <select
                        value={industryFilter}
                        onChange={(e) => { setIndustryFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none max-w-[200px]"
                        title="Filter by business / service industry"
                    >
                        <option value="all">All Industries ({industryOptions.length})</option>
                        {industryOptions.map((name) => (
                            <option key={industryKey(name)} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={priorityFilter}
                        onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Priorities</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                        <div className="relative">
                            <Calendar className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                                value={statusDateFilter}
                                onChange={(e) => {
                                    setStatusDateFilter(e.target.value as StatusDateFilter);
                                    setCurrentPage(1);
                                }}
                                className="pl-8 pr-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                                title="Filter by status updated date"
                            >
                                <option value="all">Status Date: All</option>
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="7days">Last 7 Days</option>
                                <option value="30days">Last 30 Days</option>
                                <option value="custom">Custom Date…</option>
                            </select>
                        </div>
                        {statusDateFilter === 'custom' && (
                            <input
                                type="date"
                                value={statusCustomDate}
                                onChange={(e) => {
                                    setStatusCustomDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="px-2 py-1 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                            />
                        )}
                    </div>

                    <select
                        value={typeFilter}
                        onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                    >
                        <option value="all">All Task Types</option>
                        <option value="prepare_audit">Prepare Audit</option>
                        <option value="follow_up_call">Follow-Up Call</option>
                        <option value="send_proposal">Send Proposal</option>
                        <option value="onboard_customer">Onboard Customer</option>
                        <option value="custom">Custom Task</option>
                    </select>

                    <select
                        value={leadKindFilter}
                        onChange={(e) => {
                            setLeadKindFilter(e.target.value as 'all' | 'full_audit' | 'leads');
                            setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 text-xs font-bold bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] focus:outline-none"
                        title="Filter by lead type"
                    >
                        <option value="all">All Types ({industryScopedTasks.length})</option>
                        <option value="full_audit">Full Audits ({fullAuditCount})</option>
                        <option value="leads">Leads ({leadsOnlyCount})</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => { setDueTodayOnly((v) => !v); setCurrentPage(1); }}
                        className={cn(
                            'px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors shrink-0',
                            dueTodayOnly
                                ? 'bg-[#F59E0B] text-[#0F172A] border-[#F59E0B]'
                                : 'bg-[#F8FAFC] text-[#0F172A] border-[#E2E8F0] hover:bg-white'
                        )}
                    >
                        Due Today Only
                    </button>
                </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[#F1F5F9] flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-amber-500" />
                        Task Queue ({dedupedTasks.length})
                    </h2>
                </div>

                {loading && !tasks.length ? (
                    <div className="p-12 text-center text-[#64748B]">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F59E0B]" />
                        <p className="text-sm font-semibold">Loading admin assigned tasks…</p>
                    </div>
                ) : !dedupedTasks.length ? (
                    <div className="p-12 text-center text-[#64748B]">
                        <CheckSquare className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" />
                        <p className="text-sm font-bold text-[#0F172A]">No tasks found</p>
                        <p className="text-xs mt-1">
                            {statusFilter === 'pending'
                                ? 'You have completed all admin assigned tasks! Great job.'
                                : 'No tasks match the active filters.'}
                        </p>
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full table-fixed text-left border-collapse text-sm min-w-[800px]">
                            <thead>
                                <tr className="border-b border-[#E2E8F0] bg-slate-50/60 text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                                    <th className="py-4 pl-6 pr-4 w-[32%]">Name / Business</th>
                                    <th className="py-4 px-4 w-[24%]">Contact Info</th>
                                    <th className="py-4 px-4 w-[11%]">Priority</th>
                                    <th className="py-4 px-4 w-[18%] text-center">Status</th>
                                    <th className="py-4 pr-6 pl-4 w-[15%] text-right">View Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F1F5F9]">
                                {pagedGroups.map(({ primaryTask: task, pendingTasks }) => {
                                    const isDone = pendingTasks === 0;
                                    const prioConf = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.medium;
                                    const businessName = task.leadBusinessName || 'Lead';
                                    const industry = normalizeTaskIndustry(task);
                                    return (
                                        <tr
                                            key={task.leadId || task.id}
                                            className={cn(
                                                'transition-colors group',
                                                isDone
                                                    ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                                                    : 'hover:bg-slate-50/60'
                                            )}
                                        >
                                            <td className="py-5 pl-6 pr-4 align-middle overflow-hidden">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 max-w-full">
                                                        <button
                                                            type="button"
                                                            onClick={() => openLeadDetails(task, 'tasks')}
                                                            className="truncate font-semibold text-[#0F172A] hover:text-amber-600 transition-colors text-sm text-left cursor-pointer"
                                                            title={`View ${businessName} tasks & details`}
                                                        >
                                                            {businessName}
                                                        </button>
                                                        {pendingTasks > 0 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openLeadDetails(task, 'tasks')}
                                                                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-2xs tracking-tight transition-all hover:scale-105 cursor-pointer"
                                                                title={`${pendingTasks} active task${pendingTasks > 1 ? 's' : ''} remaining — Click to view tasks`}
                                                            >
                                                                <ListTodo className="w-3 h-3 text-amber-700 shrink-0" />
                                                                +{pendingTasks}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => openLeadDetails(task, 'tasks')}
                                                                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-2xs transition-all hover:scale-105 cursor-pointer"
                                                                title="All assigned tasks completed for this lead — Click to view"
                                                            >
                                                                <CheckSquare className="w-3 h-3 text-emerald-600 shrink-0" />
                                                                Done
                                                            </button>
                                                        )}
                                                    </div>
                                                    <span className="block text-[11px] text-[#64748B] truncate mt-1">
                                                        {industry}
                                                        {task.leadAddress
                                                            ? ` · ${task.leadAddress}`
                                                            : task.leadCity
                                                            ? ` · ${task.leadCity}`
                                                            : ''}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="py-5 px-4 align-middle overflow-hidden">
                                                <div className="space-y-1.5 min-w-0">
                                                    {task.leadPhone ? (
                                                        <a
                                                            href={`tel:${task.leadPhone}`}
                                                            className="flex items-center gap-1.5 font-semibold text-slate-800 hover:text-indigo-600 min-w-0"
                                                            title={task.leadPhone}
                                                        >
                                                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span className="truncate text-xs">{task.leadPhone}</span>
                                                        </a>
                                                    ) : null}
                                                    {task.leadEmail ? (
                                                        <a
                                                            href={`mailto:${task.leadEmail}`}
                                                            className="flex items-center gap-1.5 text-[#64748B] hover:text-indigo-600 min-w-0"
                                                            title={task.leadEmail}
                                                        >
                                                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span className="truncate text-xs">{task.leadEmail}</span>
                                                        </a>
                                                    ) : null}
                                                    {task.leadWebsite ? (
                                                        <a
                                                            href={
                                                                task.leadWebsite.startsWith('http')
                                                                    ? task.leadWebsite
                                                                    : `https://${task.leadWebsite}`
                                                            }
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="flex items-center gap-1.5 text-[11px] text-indigo-600 hover:underline min-w-0"
                                                            title={task.leadWebsite}
                                                        >
                                                            <Globe className="w-3 h-3 text-indigo-400 shrink-0" />
                                                            <span className="truncate">
                                                                {task.leadWebsite.replace(/^https?:\/\/(www\.)?/, '')}
                                                            </span>
                                                        </a>
                                                    ) : null}
                                                    {!task.leadPhone && !task.leadEmail && !task.leadWebsite ? (
                                                        <span className="text-xs text-[#94A3B8]">—</span>
                                                    ) : null}
                                                </div>
                                            </td>

                                            <td className="py-5 px-4 align-middle">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center text-[10px] font-bold uppercase px-2.5 py-1 rounded-md border',
                                                        prioConf.bg,
                                                        prioConf.text
                                                    )}
                                                >
                                                    {prioConf.label}
                                                </span>
                                            </td>

                                            <td className="py-5 px-4 align-middle text-center">
                                                {(() => {
                                                    const leadStatKey = String(task.leadStatus || 'new').toLowerCase().trim();
                                                    const statusConf = getLeadStatusConfig(leadStatKey);
                                                    return (
                                                        <div className="flex flex-col items-center justify-center min-w-0 gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedHistoryTask(task)}
                                                                className={cn(
                                                                    'inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border cursor-pointer hover:shadow-xs transition-all group/badge whitespace-nowrap',
                                                                    statusConf.bg,
                                                                    statusConf.text,
                                                                    statusConf.border
                                                                )}
                                                                title="Click to view/update lead status timeline"
                                                            >
                                                                <span className="capitalize whitespace-nowrap">
                                                                    {statusConf.label}
                                                                </span>
                                                                <History className="w-3 h-3 opacity-40 group-hover/badge:opacity-90 shrink-0" />
                                                            </button>
                                                            <div
                                                                className="flex items-center justify-center gap-1 text-[10px] text-[#94A3B8] font-medium whitespace-nowrap"
                                                                title="Last updated"
                                                            >
                                                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                                                <span className="whitespace-nowrap">
                                                                    {fmtDate(task.updatedAt || task.completedAt || task.createdAt)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            <td className="py-5 pr-6 pl-4 align-middle text-right whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => openLeadDetails(task)}
                                                    className="text-xs font-semibold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 shadow-2xs transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                                    title="Open full lead details"
                                                >
                                                    <Eye className="w-3.5 h-3.5 shrink-0" />
                                                    <span>View Details</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {dedupedTasks.length > 0 && (
                    <div className="p-3.5 sm:p-4 bg-slate-50/70 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64748B]">
                        <p>
                            Showing{' '}
                            <span className="font-semibold text-[#0F172A]">
                                {(safePage - 1) * TASKS_PER_PAGE + 1}
                            </span>{' '}
                            to{' '}
                            <span className="font-semibold text-[#0F172A]">
                                {Math.min(safePage * TASKS_PER_PAGE, dedupedTasks.length)}
                            </span>{' '}
                            of{' '}
                            <span className="font-semibold text-[#0F172A]">{dedupedTasks.length}</span> leads
                        </p>
                        {dedupedTasks.length > TASKS_PER_PAGE ? (
                            <div className="flex items-center justify-between sm:justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => goToPage(safePage - 1)}
                                    disabled={safePage <= 1}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#475569] hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors bg-white shadow-2xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                                </button>
                                <span className="text-xs font-medium text-[#64748B] px-1">
                                    Page {safePage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => goToPage(safePage + 1)}
                                    disabled={safePage >= totalPages}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#475569] hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors bg-white shadow-2xs"
                                >
                                    Next <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            {selectedHistoryTask && (
                <LeadStatusHistoryModal
                    isOpen={Boolean(selectedHistoryTask)}
                    leadId={selectedHistoryTask.leadId}
                    leadName={selectedHistoryTask.leadBusinessName || selectedHistoryTask.title}
                    currentStatus={selectedHistoryTask.leadStatus || 'new'}
                    initialNote={selectedHistoryTask.notes}
                    initialDate={selectedHistoryTask.updatedAt || selectedHistoryTask.createdAt}
                    authorName={(selectedHistoryTask as any).assignedToName || undefined}
                    readOnly={false}
                    onClose={() => setSelectedHistoryTask(null)}
                    onStatusUpdated={async () => {
                        await loadData();
                    }}
                />
            )}
        </div>
    );
}
