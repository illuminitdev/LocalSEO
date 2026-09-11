import { useState, useEffect, useCallback } from 'react';
import {
    Check,
    Calendar,
    User,
    RefreshCw,
    Search,
    AlertCircle,
    CheckSquare,
    Sparkles,
    ExternalLink,
    X,
    Clock
} from 'lucide-react';
import {
    type LeadTask,
    type SalesAgent,
    fetchCrmTasks,
    fetchSalesAgents,
    adminGet
} from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { cn } from '../../shared/utils';

export default function AdminCrmTasks() {
    const [tasks, setTasks] = useState<LeadTask[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [leads, setLeads] = useState<GrowthAuditLeadRef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [selectedPriority, setSelectedPriority] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Selected lead for CRM drawer
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);

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

    const openLeadDrawerForTask = (task: LeadTask) => {
        const matched = leads.find((l) => l.id === task.leadId);
        if (matched) {
            setActiveLead(matched);
        } else {
            // Fallback object with lead ID and backend-enriched lead fields
            setActiveLead({
                id: task.leadId,
                businessName: task.leadBusinessName || 'Lead #' + task.leadId.slice(0, 8),
                phone: task.leadPhone || null,
                email: task.leadEmail || null,
                website: task.leadWebsite || null,
                city: task.leadCity || null,
                address: task.leadAddress || null,
                scoreTotal: task.leadScoreTotal ?? null,
                reportUrl: task.leadReportUrl || null,
                source: task.leadSource || null
            });
        }
    };

    // Calculate KPI Stats
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const overdueCount = tasks.filter(
        (t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now && !t.dueDate.startsWith(todayStr)
    ).length;
    const dueTodayCount = tasks.filter(
        (t) => t.status !== 'completed' && t.dueDate && t.dueDate.startsWith(todayStr)
    ).length;
    const pendingCount = tasks.filter((t) => t.status !== 'completed').length;
    const completedCount = tasks.filter((t) => t.status === 'completed').length;

    // Filter by search query
    const filteredTasks = tasks.filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            t.notes.toLowerCase().includes(q) ||
            (t.leadBusinessName && t.leadBusinessName.toLowerCase().includes(q)) ||
            (t.assignedToName && t.assignedToName.toLowerCase().includes(q))
        );
    });

    const getLeadName = (leadId: string, task?: LeadTask) => {
        if (task?.leadBusinessName) return task.leadBusinessName;
        const match = leads.find((l) => l.id === leadId);
        return match?.businessName || `Lead #${leadId.slice(0, 8)}`;
    };

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

            {/* KPI Cards */}
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

            {/* Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
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

                {/* Filters Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
                    {/* Sales Agent Filter */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Sales Agent
                        </label>
                        <select
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                            <option value="all">All Agents</option>
                            {salesAgents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                    {agent.name || agent.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Task Type Filter */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Task Type
                        </label>
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                            <option value="all">All Task Types</option>
                            <option value="prepare_audit">📊 Prepare Audit</option>
                            <option value="onboard_customer">🚀 Onboard Customer</option>
                            <option value="follow_up_call">📞 Follow-Up Call</option>
                            <option value="send_proposal">📄 Send Proposal</option>
                            <option value="custom">✏️ Custom Task</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Status
                        </label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    {/* Priority Filter */}
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Priority
                        </label>
                        <select
                            value={selectedPriority}
                            onChange={(e) => setSelectedPriority(e.target.value)}
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

            {/* Task Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-amber-500" />
                        Task Queue ({filteredTasks.length})
                    </h2>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-sm text-slate-400">Loading tasks...</div>
                ) : filteredTasks.length === 0 ? (
                    <div className="p-12 text-center">
                        <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-sm font-semibold text-slate-800">No tasks match your filters</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Try adjusting your filters or go to <strong>Growth Leads</strong> to create a new task.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                    <th className="py-3.5 px-4 min-w-[260px] max-w-sm">Task</th>
                                    <th className="py-3.5 px-4 w-56 max-w-[220px]">Lead / Business</th>
                                    <th className="py-3.5 px-4 w-40">Assigned Agent</th>
                                    <th className="py-3.5 px-4 w-32">Priority</th>
                                    <th className="py-3.5 px-4 w-32">Due Date</th>
                                    <th className="py-3.5 px-4 w-36 text-center">Status</th>
                                    <th className="py-3.5 px-4 w-28 text-right">Manage</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTasks.map((task) => {
                                    const isDone = task.status === 'completed';
                                    const isOverdue = task.dueDate && !isDone && new Date(task.dueDate) < now && !task.dueDate.startsWith(todayStr);
                                    const isDueToday = task.dueDate && !isDone && task.dueDate.startsWith(todayStr);
                                    const leadName = task.leadBusinessName || getLeadName(task.leadId, task);

                                    return (
                                        <tr
                                            key={task.id}
                                            className={cn(
                                                "transition-colors group",
                                                isDone ? "bg-emerald-50/40 hover:bg-emerald-50/70" : "hover:bg-slate-50/70"
                                            )}
                                        >
                                            {/* Title & Notes & Creator */}
                                            <td className="py-3.5 px-4 align-middle">
                                                <div
                                                    className={cn("font-semibold truncate max-w-md", isDone ? "text-emerald-950 font-bold" : "text-slate-900")}
                                                    title={task.title}
                                                >
                                                    {task.title}
                                                </div>
                                                {task.notes && (
                                                    <div className={cn("text-xs truncate max-w-md mt-1", isDone ? "text-emerald-800/70" : "text-slate-500")} title={task.notes}>
                                                        {task.notes}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Lead / Business */}
                                            <td className="py-3.5 px-4 align-middle max-w-[220px]">
                                                <button
                                                    type="button"
                                                    onClick={() => openLeadDrawerForTask(task)}
                                                    title={leadName}
                                                    className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1.5 max-w-full truncate group/lead"
                                                >
                                                    <span className="truncate">{leadName}</span>
                                                    <ExternalLink className="w-3 h-3 text-amber-500 shrink-0 opacity-70 group-hover/lead:opacity-100" />
                                                </button>
                                            </td>

                                            {/* Assigned Agent */}
                                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                                                {task.assignedToName ? (
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg",
                                                        isDone ? "bg-emerald-100/70 text-emerald-800" : "bg-slate-100 text-slate-700"
                                                    )}>
                                                        <User className="w-3 h-3 text-slate-400" />
                                                        {task.assignedToName}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Unassigned</span>
                                                )}
                                            </td>

                                            {/* Priority */}
                                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
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

                                            {/* Due Date */}
                                            <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                                                {task.dueDate ? (
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 text-xs font-medium",
                                                        isOverdue ? "text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded" :
                                                        isDueToday ? "text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded" :
                                                        isDone ? "text-emerald-700" :
                                                        "text-slate-600"
                                                    )}>
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                        {isOverdue && ' (Overdue)'}
                                                        {isDueToday && ' (Today)'}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-3.5 px-4 text-center align-middle whitespace-nowrap">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border",
                                                    task.status === 'completed' ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                                                    task.status === 'in_progress' ? "bg-amber-50 text-amber-900 border-amber-300" :
                                                    task.status === 'cancelled' ? "bg-rose-50 text-rose-800 border-rose-200" :
                                                    "bg-slate-50 text-slate-700 border-slate-200"
                                                )}>
                                                    {task.status === 'completed' && <Check className="w-3 h-3 text-emerald-600" />}
                                                    {task.status === 'in_progress' && <Clock className="w-3 h-3 text-amber-600" />}
                                                    {task.status === 'cancelled' && <X className="w-3 h-3 text-rose-600" />}
                                                    <span className="capitalize">{task.status.replace('_', ' ')}</span>
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3.5 px-4 align-middle text-right whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => openLeadDrawerForTask(task)}
                                                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition-all hover:border-slate-300"
                                                >
                                                    Manage
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Slide-over CRM Drawer */}
            {activeLead && (
                <LeadCrmDrawer
                    lead={activeLead}
                    salesAgents={salesAgents}
                    onClose={() => setActiveLead(null)}
                    onTaskUpdated={loadData}
                />
            )}
        </div>
    );
}
