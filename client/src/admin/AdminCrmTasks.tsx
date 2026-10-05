import { useState, useEffect, useCallback, useMemo, useRef, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User,
    RefreshCw,
    Search,
    AlertCircle,
    CheckSquare,
    Clock,
    History,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    BarChart3,
    Phone,
    FileText,
    UserPlus,
    Plus,
    ListFilter,
    Mail,
    Eye,
    ClipboardCheck,
    ListTodo
} from 'lucide-react';
import {
    type LeadTask,
    type SalesAgent,
    fetchCrmTasks,
    fetchSalesAgents,
    adminGet
} from './adminApi';
import LeadStatusHistoryModal from './LeadStatusHistoryModal';
import {
    normalizeBusinessCategory,
    matchesStatusDateFilter,
    type StatusDateFilter
} from './AdminGrowthAuditLeads';
import { cn } from '../shared/utils';
import { emailShareStatusLabel, emailShareStatusHint } from '../shared/emailShareStatus';
import { getLeadStatusConfig } from '../sales-agent/SalesTasks';

type GrowthAuditLeadRef = {
    id: string;
    businessName?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    city?: string | null;
    address?: string | null;
    scoreTotal?: number | null;
    reportUrl?: string | null;
    source?: string | null;
    industry?: string | null;
    service?: string | null;
    serviceLabel?: string | null;
};

const TASK_TYPE_OPTIONS: Array<{ value: string; label: string; icon: ElementType }> = [
    { value: 'all', label: 'All Task Types', icon: ListFilter },
    { value: 'prepare_audit', label: 'Prepare Audit', icon: BarChart3 },
    { value: 'onboard_customer', label: 'Onboard Customer', icon: UserPlus },
    { value: 'follow_up_call', label: 'Follow-Up Call', icon: Phone },
    { value: 'send_proposal', label: 'Send Proposal', icon: FileText },
    { value: 'custom', label: 'Custom Task', icon: Plus }
];

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

const PAGE_SIZE = 10;

export default function AdminCrmTasks() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [leads, setLeads] = useState<GrowthAuditLeadRef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [page, setPage] = useState(1);
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedPriority, setSelectedPriority] = useState<string>('all');
    const [selectedBusiness, setSelectedBusiness] = useState<string>('all');
    const [statusDateFilter, setStatusDateFilter] = useState<StatusDateFilter>('all');
    const [statusCustomDate, setStatusCustomDate] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [typeMenuOpen, setTypeMenuOpen] = useState(false);
    const typeMenuRef = useRef<HTMLDivElement>(null);

    const [selectedStatusTask, setSelectedStatusTask] = useState<LeadTask | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [tasksData, agentsData, leadsData] = await Promise.all([
                fetchCrmTasks({
                    assignedTo: selectedAgent !== 'all' ? selectedAgent : undefined,
                    taskType: selectedType !== 'all' ? selectedType : undefined,
                    status: selectedStatus !== 'all' ? selectedStatus : undefined,
                    priority: selectedPriority !== 'all' ? selectedPriority : undefined,
                    createdBy: 'admin'
                }),
                fetchSalesAgents().catch(() => []),
                adminGet('/api/admin/growth-audit-leads?limit=200').then((r: any) => r.leads || []).catch(() => [])
            ]);

            setTasks(tasksData);
            setSalesAgents(agentsData);
            setLeads(leadsData);
        } catch (err: any) {
            setError(err.message || 'Failed to load tasks');
        } finally {
            setLoading(false);
        }
    }, [selectedAgent, selectedType, selectedStatus, selectedPriority]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!typeMenuOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
                setTypeMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [typeMenuOpen]);

    const openLeadPage = (task: LeadTask, focusSection?: string) => {
        navigate(`/admin/crm/leads/${encodeURIComponent(task.leadId)}${focusSection ? `#${focusSection}` : ''}`, {
            state: { scrollTo: focusSection }
        });
    };

    const getLeadName = (leadId: string, task?: LeadTask) => {
        if (task?.leadBusinessName) return task.leadBusinessName;
        const match = leads.find((l) => l.id === leadId);
        return match?.businessName || `Lead #${leadId.slice(0, 8)}`;
    };

    const getTaskBusinessCategory = useCallback((task: LeadTask): string | null => {
        const matchedLead = leads.find((l) => l.id === task.leadId);
        const raw = task.leadIndustry || matchedLead?.industry || matchedLead?.service || matchedLead?.serviceLabel;
        return normalizeBusinessCategory(raw);
    }, [leads]);

    const businessFilterOptions = useMemo(() => {
        const set = new Set<string>();
        tasks.forEach((t) => {
            const cat = getTaskBusinessCategory(t);
            if (cat) set.add(cat);
        });
        leads.forEach((l) => {
            const cat = normalizeBusinessCategory(l.service || l.serviceLabel || l.industry);
            if (cat) set.add(cat);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [tasks, leads, getTaskBusinessCategory]);

    const filteredTasks = useMemo(() => {
        return tasks.filter((t) => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesQuery =
                    t.title.toLowerCase().includes(q) ||
                    (t.notes || '').toLowerCase().includes(q) ||
                    (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
                    (t.assignedToName && t.assignedToName.toLowerCase().includes(q));
                if (!matchesQuery) return false;
            }

            if (selectedBusiness !== 'all') {
                const cat = getTaskBusinessCategory(t);
                if (!cat || cat.toLowerCase().trim() !== selectedBusiness.toLowerCase().trim()) {
                    return false;
                }
            }

            const taskStatusDate = t.updatedAt || t.completedAt || t.createdAt;
            if (!matchesStatusDateFilter(taskStatusDate, statusDateFilter, statusCustomDate)) {
                return false;
            }

            return true;
        });
    }, [tasks, searchQuery, selectedBusiness, statusDateFilter, statusCustomDate, getTaskBusinessCategory]);

interface GroupedAdminTask {
    leadId: string;
    primaryTask: LeadTask;
    totalTasks: number;
    pendingTasks: number;
    tasks: LeadTask[];
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

function compareTasksForPrimary(a: LeadTask, b: LeadTask): number {
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

    const dedupedTasks = useMemo(() => {
        const groups = new Map<string, LeadTask[]>();
        for (const t of filteredTasks) {
            const key = t.leadId || t.id;
            const list = groups.get(key);
            if (list) {
                list.push(t);
            } else {
                groups.set(key, [t]);
            }
        }

        const result: GroupedAdminTask[] = [];
        for (const [key, list] of groups.entries()) {
            list.sort(compareTasksForPrimary);
            const pendingCount = list.filter(
                (t) => t.status !== 'completed' && t.status !== 'cancelled'
            ).length;
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

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const overdueCount = filteredTasks.filter(
        (t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now && !t.dueDate.startsWith(todayStr)
    ).length;
    const dueTodayCount = filteredTasks.filter(
        (t) => t.status !== 'completed' && t.dueDate && t.dueDate.startsWith(todayStr)
    ).length;
    const pendingCount = filteredTasks.filter((t) => t.status !== 'completed').length;
    const completedCount = filteredTasks.filter((t) => t.status === 'completed').length;

    const selectedTypeOption = TASK_TYPE_OPTIONS.find((o) => o.value === selectedType) || TASK_TYPE_OPTIONS[0];
    const SelectedTypeIcon = selectedTypeOption.icon;

    const totalPages = Math.max(1, Math.ceil(dedupedTasks.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageGroups = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return dedupedTasks.slice(start, start + PAGE_SIZE);
    }, [dedupedTasks, safePage]);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const rangeStart = dedupedTasks.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, dedupedTasks.length);

    return (
        <div className="space-y-6 max-w-7xl">
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button onClick={loadData} className="text-xs font-semibold underline">Retry</button>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">Overdue Tasks</p>
                    <p className={cn("text-2xl font-bold mt-1", overdueCount > 0 ? "text-rose-600" : "text-slate-900")}>
                        {overdueCount}
                    </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">Due Today</p>
                    <p className={cn("text-2xl font-bold mt-1", dueTodayCount > 0 ? "text-amber-600" : "text-slate-900")}>
                        {dueTodayCount}
                    </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">Total Open Tasks</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{pendingCount}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">Completed</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Search tasks, notes, or telecaller..."
                            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                    </div>

                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Business
                        </label>
                        <select
                            value={selectedBusiness}
                            onChange={(e) => {
                                setSelectedBusiness(e.target.value);
                                setPage(1);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            title="Filter by business category"
                        >
                            <option value="all">All Businesses</option>
                            {businessFilterOptions.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Sales Agent
                        </label>
                        <select
                            value={selectedAgent}
                            onChange={(e) => {
                                setSelectedAgent(e.target.value);
                                setPage(1);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                            <option value="all">All Agents</option>
                            <option value="unassigned">Unassigned</option>
                            {salesAgents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                    {agent.name || agent.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="relative" ref={typeMenuRef}>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Task Type
                        </label>
                        <button
                            type="button"
                            onClick={() => setTypeMenuOpen((o) => !o)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500 flex items-center justify-between gap-1.5"
                        >
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                <SelectedTypeIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="truncate">{selectedTypeOption.label}</span>
                            </span>
                            <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform', typeMenuOpen && 'rotate-180')} />
                        </button>
                        {typeMenuOpen && (
                            <div className="absolute z-30 mt-1 w-full min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
                                {TASK_TYPE_OPTIONS.map((opt) => {
                                    const Icon = opt.icon;
                                    const active = selectedType === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                setSelectedType(opt.value);
                                                setPage(1);
                                                setTypeMenuOpen(false);
                                            }}
                                            className={cn(
                                                'w-full px-2.5 py-1.5 text-xs flex items-center gap-2 text-left hover:bg-slate-50',
                                                active ? 'bg-amber-50 text-amber-900 font-semibold' : 'text-slate-800'
                                            )}
                                        >
                                            <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Status
                        </label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => {
                                setSelectedStatus(e.target.value);
                                setPage(1);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Status Date
                        </label>
                        <select
                            value={statusDateFilter}
                            onChange={(e) => {
                                setStatusDateFilter(e.target.value as StatusDateFilter);
                                setPage(1);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            title="Filter by status updated date"
                        >
                            <option value="all">All Dates</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="7days">Last 7 Days</option>
                            <option value="30days">Last 30 Days</option>
                            <option value="custom">Custom Date…</option>
                        </select>
                        {statusDateFilter === 'custom' && (
                            <input
                                type="date"
                                value={statusCustomDate}
                                onChange={(e) => {
                                    setStatusCustomDate(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full mt-1 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                            />
                        )}
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Priority
                        </label>
                        <select
                            value={selectedPriority}
                            onChange={(e) => {
                                setSelectedPriority(e.target.value);
                                setPage(1);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                            <option value="all">All Priorities</option>
                            <option value="urgent">Urgent</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-amber-500" />
                        Task Queue ({dedupedTasks.length})
                    </h2>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-sm text-slate-400">Loading tasks...</div>
                ) : dedupedTasks.length === 0 ? (
                    <div className="p-12 text-center">
                        <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-sm font-semibold text-slate-800">No tasks match your filters</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Try adjusting your filters or go to <strong>Leads</strong> to create a new task.
                        </p>
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full table-fixed text-left border-collapse text-sm min-w-[850px]">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                    <th className="py-3.5 pl-6 pr-4 w-[32%]">Lead / Business</th>
                                    <th className="py-3.5 px-4 w-[18%]">Assigned Agent</th>
                                    <th className="py-3.5 px-4 w-[12%]">Priority</th>
                                    <th className="py-3.5 px-4 w-[20%] text-center">Status</th>
                                    <th className="py-3.5 pr-6 pl-4 w-[18%] text-right">View Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pageGroups.map(({ primaryTask: task, pendingTasks }) => {
                                    const isDone = pendingTasks === 0;
                                    const leadName = task.leadBusinessName || getLeadName(task.leadId, task);
                                    const shareLabel = emailShareStatusLabel(task.emailShareStatus);
                                    const notesShareLabel = emailShareStatusLabel(
                                        task.observationEmailShareStatus
                                    );

                                    return (
                                        <tr
                                            key={task.leadId || task.id}
                                            className={cn(
                                                "transition-colors group",
                                                isDone ? "bg-emerald-50/40 hover:bg-emerald-50/70" : "hover:bg-slate-50/70"
                                            )}
                                        >
                                            <td className="py-4 px-5 align-middle overflow-hidden">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 max-w-full">
                                                        <button
                                                            type="button"
                                                            onClick={() => openLeadPage(task, 'tasks')}
                                                            className="text-sm font-semibold text-slate-900 hover:text-amber-600 transition-colors truncate text-left cursor-pointer"
                                                            title={`View ${leadName} tasks & details`}
                                                        >
                                                            {leadName}
                                                        </button>
                                                        {pendingTasks > 0 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openLeadPage(task, 'tasks')}
                                                                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-2xs tracking-tight transition-all hover:scale-105 cursor-pointer"
                                                                title={`${pendingTasks} active task${pendingTasks > 1 ? 's' : ''} remaining — Click to view tasks`}
                                                            >
                                                                <ListTodo className="w-3 h-3 text-amber-700 shrink-0" />
                                                                +{pendingTasks}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => openLeadPage(task, 'tasks')}
                                                                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-2xs transition-all hover:scale-105 cursor-pointer"
                                                                title="All assigned tasks completed for this lead — Click to view"
                                                            >
                                                                <CheckSquare className="w-3 h-3 text-emerald-600 shrink-0" />
                                                                Done
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        {/full audit/i.test(`${task.title || ''} ${task.notes || ''}`) ? (
                                                            <span
                                                                className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-800 border-indigo-200"
                                                                title="Assigned from Full Audit requests"
                                                            >
                                                                <ClipboardCheck className="w-2.5 h-2.5" />
                                                                Full Audit
                                                            </span>
                                                        ) : null}
                                                        {notesShareLabel ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                                                                    task.observationEmailShareStatus === 'opened'
                                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                                                )}
                                                                title={emailShareStatusHint(
                                                                    task.observationEmailShareStatus,
                                                                    {
                                                                        sentAt: task.observationEmailSentAt,
                                                                        openedAt: task.observationEmailOpenedAt
                                                                    }
                                                                )}
                                                            >
                                                                <Mail className="w-2.5 h-2.5" />
                                                                Email: {notesShareLabel}
                                                            </span>
                                                        ) : null}
                                                        {shareLabel ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                                                                    task.emailShareStatus === 'opened'
                                                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                        : 'bg-amber-50 text-amber-900 border-amber-200'
                                                                )}
                                                                title={emailShareStatusHint(task.emailShareStatus, {
                                                                    sentAt: task.emailShareSentAt,
                                                                    openedAt: task.emailShareOpenedAt
                                                                })}
                                                            >
                                                                <Mail className="w-2.5 h-2.5" />
                                                                Audit email: {shareLabel}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-4 px-5 align-middle overflow-hidden">
                                                {task.assignedToName ? (
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg max-w-full",
                                                        isDone ? "bg-emerald-100/70 text-emerald-800" : "bg-slate-100 text-slate-700"
                                                    )}>
                                                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                                                        <span className="truncate">{task.assignedToName}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Unassigned</span>
                                                )}
                                            </td>

                                            <td className="py-4 px-5 align-middle">
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase px-2.5 py-1 rounded-md",
                                                    task.priority === 'urgent' ? "bg-rose-100 text-rose-800" :
                                                    task.priority === 'high' ? "bg-amber-100 text-amber-800" :
                                                    task.priority === 'medium' ? "bg-blue-100 text-blue-800" :
                                                    "bg-slate-100 text-slate-700"
                                                )}>
                                                    {task.priority}
                                                </span>
                                            </td>

                                            <td className="py-4 px-4 align-middle text-center">
                                                {(() => {
                                                    const leadStatKey = String(task.leadStatus || 'new').toLowerCase().trim();
                                                    const statusConf = getLeadStatusConfig(leadStatKey);
                                                    return (
                                                        <div className="flex flex-col items-center justify-center min-w-0 gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedStatusTask(task)}
                                                                className={cn(
                                                                    "inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border cursor-pointer hover:shadow-xs transition-all group/badge whitespace-nowrap",
                                                                    statusConf.bg,
                                                                    statusConf.text,
                                                                    statusConf.border
                                                                )}
                                                                title="Click to view/update lead status history"
                                                            >
                                                                <span className="capitalize whitespace-nowrap">{statusConf.label}</span>
                                                                <History className="w-3 h-3 opacity-40 group-hover/badge:opacity-90 shrink-0" />
                                                            </button>
                                                            <div
                                                                className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-medium whitespace-nowrap"
                                                                title="Last updated"
                                                            >
                                                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                                                <span className="whitespace-nowrap">{fmtDate(task.updatedAt || task.createdAt)}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            <td className="py-4 pr-6 pl-4 align-middle text-right whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => openLeadPage(task)}
                                                    className="text-xs font-semibold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 shadow-2xs transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                                    title="Open lead status, notes, and updates"
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

                {!loading && dedupedTasks.length > 0 && (
                    <div className="p-3.5 sm:p-4 bg-slate-50/70 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                        <p>
                            Showing{' '}
                            <span className="font-semibold text-slate-800">
                                {rangeStart}
                            </span>{' '}
                            to{' '}
                            <span className="font-semibold text-slate-800">
                                {rangeEnd}
                            </span>{' '}
                            of{' '}
                            <span className="font-semibold text-slate-800">
                                {dedupedTasks.length}
                            </span>{' '}
                            leads
                        </p>
                        <div className="flex items-center justify-between sm:justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors bg-white shadow-2xs"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Previous
                            </button>
                            <span className="text-xs font-medium text-slate-600 px-1">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors bg-white shadow-2xs"
                            >
                                Next <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selectedStatusTask && (
                <LeadStatusHistoryModal
                    isOpen={Boolean(selectedStatusTask)}
                    leadId={selectedStatusTask.leadId}
                    leadName={selectedStatusTask.leadBusinessName || getLeadName(selectedStatusTask.leadId, selectedStatusTask)}
                    currentStatus={selectedStatusTask.leadStatus || 'new'}
                    initialNote={selectedStatusTask.notes}
                    initialDate={selectedStatusTask.updatedAt || selectedStatusTask.createdAt}
                    authorName={selectedStatusTask.assignedToName || undefined}
                    onClose={() => setSelectedStatusTask(null)}
                    onStatusUpdated={async () => {
                        await loadData();
                    }}
                />
            )}
        </div>
    );
}
