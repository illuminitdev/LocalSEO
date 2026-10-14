import { useEffect, useState, useCallback } from 'react';
import { X, History, User, MessageSquare, AlertCircle, Calendar, CheckSquare, Layers, RefreshCw } from 'lucide-react';
import { adminGet, type LeadActivity } from './adminApi';
import { apiGet, cn } from '../shared/utils';

interface LeadStatusHistoryModalProps {
    isOpen: boolean;
    leadId: string;
    leadName?: string | null;
    currentStatus?: string | null;
    initialNote?: string | null;
    initialDate?: string | null;
    authorName?: string | null;
    readOnly?: boolean;
    allowLogStatus?: boolean;
    defaultTab?: 'lead_status' | 'task_status' | 'all';
    onClose: () => void;
    onStatusUpdated?: (newStatus: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    new: { label: 'New', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    contacted: { label: 'Contacted', className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' },
    in_progress: { label: 'In Progress', className: 'bg-amber-50 text-amber-900 border-amber-300 font-bold' },
    not_interested: { label: 'Not Interested', className: 'bg-rose-50 text-rose-800 border-rose-200' },
    converted: { label: 'Converted 🎉', className: 'bg-purple-50 text-purple-800 border-purple-300 font-bold' },
    completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' },
    audit_scheduled: { label: 'Audit Scheduled', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    follow_up: { label: 'Follow Up', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    voicemail: { label: 'Voicemail', className: 'bg-blue-50 text-blue-800 border-blue-200' },
    reached: { label: 'Reached', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    no_answer: { label: 'No Answer', className: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export default function LeadStatusHistoryModal({
    isOpen,
    leadId,
    leadName,
    currentStatus,
    initialNote,
    initialDate,
    authorName,
    defaultTab = 'lead_status',
    onClose
}: LeadStatusHistoryModalProps) {
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Active timeline tab: lead status updates vs task status updates vs all
    const [activeTab, setActiveTab] = useState<'lead_status' | 'task_status' | 'all'>(defaultTab);

    const loadActivities = useCallback(async () => {
        if (!leadId) return;
        setLoading(true);
        setError(null);

        const normalizeActs = (arr: any[]): LeadActivity[] => {
            return (arr || []).map((a: any) => ({
                id: a.id,
                leadId: a.leadId || a.lead_id || leadId,
                activityType: a.activityType || a.activity_type || 'note',
                disposition: a.disposition,
                note: a.note || '',
                authorName: a.authorName || a.author_name || a.userName || a.user_name || 'Sales Agent',
                createdAt: a.createdAt || a.created_at || new Date().toISOString(),
                userName: a.userName || a.user_name,
                userEmail: a.userEmail || a.user_email
            }));
        };

        try {
            try {
                const res = await adminGet(`/api/admin/crm/leads/${encodeURIComponent(leadId)}/activities`);
                if (res && res.activities) {
                    setActivities(normalizeActs(res.activities));
                    return;
                }
            } catch (aErr) {
                // If not admin, try sales activities endpoint
                try {
                    const sRes = await apiGet(`/api/sales/leads/${encodeURIComponent(leadId)}/activities`);
                    if (sRes && sRes.activities) {
                        setActivities(normalizeActs(sRes.activities));
                        return;
                    }
                } catch {
                    const sCrm = await apiGet(`/api/sales/leads/${encodeURIComponent(leadId)}/crm`);
                    if (sCrm && sCrm.activities) {
                        setActivities(normalizeActs(sCrm.activities));
                        return;
                    }
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load status history');
        } finally {
            setLoading(false);
        }
    }, [leadId]);

    useEffect(() => {
        if (isOpen && leadId) {
            loadActivities();
            setActiveTab('lead_status');
        }
    }, [isOpen, leadId, loadActivities]);

    if (!isOpen) return null;

    const formatTimestamp = (isoString?: string) => {
        if (!isoString) return '—';
        try {
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            return d.toLocaleString(undefined, {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return isoString;
        }
    };

    // Build complete status & note history including fallback notes
    const statusHistory: LeadActivity[] = (() => {
        const list: LeadActivity[] = [...activities];
        if (initialNote && initialNote.trim()) {
            const cleanInitial = initialNote.trim().toLowerCase();
            const isObservationOrConclusion =
                cleanInitial.includes('gbp') ||
                cleanInitial.includes('observation') ||
                cleanInitial.includes('audit') ||
                cleanInitial.length > 80;
            if (!isObservationOrConclusion) {
                const hasMatch = list.some(a => (a.note || '').toLowerCase().includes(cleanInitial));
                if (!hasMatch) {
                    list.push({
                        id: 'lead-active-note',
                        leadId,
                        activityType: 'note',
                        disposition: currentStatus || 'in_progress',
                        note: initialNote,
                        authorName: authorName || 'Sales Agent',
                        createdAt: initialDate || new Date().toISOString()
                    } as LeadActivity);
                }
            }
        } else if (list.length === 0 && currentStatus) {
            list.push({
                id: 'lead-active-status',
                leadId,
                activityType: 'status_change',
                disposition: currentStatus,
                note: '',
                authorName: authorName || 'System',
                createdAt: initialDate || new Date().toISOString()
            } as LeadActivity);
        }
        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    })();

    const isTaskActivity = (item: LeadActivity): boolean => {
        const actType = item.activityType || (item as any).activity_type;
        if (actType === 'task_event') return true;
        const note = String(item.note || '').toLowerCase();
        if (
            note.includes('task') ||
            note.includes('assigned to telecaller') ||
            note.includes('assigned to agent') ||
            note.includes('assigned to sales') ||
            note.includes('assigned to admin') ||
            note.includes('unassigned') ||
            note.startsWith('assigned to')
        ) {
            return true;
        }
        const disp = String(item.disposition || '').toLowerCase();
        if (disp.includes('task') || disp.includes('assigned')) {
            return true;
        }
        return false;
    };

    const leadStatusHistory = statusHistory.filter(item => !isTaskActivity(item));
    const taskStatusHistory = statusHistory.filter(item => isTaskActivity(item));

    const displayedItems =
        activeTab === 'lead_status'
            ? leadStatusHistory
            : activeTab === 'task_status'
              ? taskStatusHistory
              : statusHistory;

    const effectiveStatus = currentStatus || leadStatusHistory[0]?.disposition || 'new';
    const activeBadge = STATUS_CONFIG[String(effectiveStatus || '').toLowerCase()] || {
        label: effectiveStatus ? String(effectiveStatus).replace(/_/g, ' ') : 'New',
        className: 'bg-slate-100 text-slate-700 border-slate-200'
    };

    const getBadgeInfo = (item: LeadActivity) => {
        if (isTaskActivity(item)) {
            const noteLower = (item.note || '').toLowerCase();
            const dispLower = (item.disposition || '').toLowerCase();
            if (noteLower.includes('created task') || dispLower.includes('created')) {
                return { label: 'Task Created', className: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' };
            }
            if (noteLower.includes('completed') || dispLower.includes('completed')) {
                return { label: 'Task Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
            }
            if (noteLower.includes('assigned') || dispLower.includes('assigned')) {
                return { label: 'Task Assigned', className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' };
            }
            if (noteLower.includes('cancelled') || dispLower.includes('cancelled')) {
                return { label: 'Task Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' };
            }
            return { label: 'Task Update', className: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' };
        }

        const rawStatus = (item.disposition || '').toLowerCase();
        if (rawStatus && STATUS_CONFIG[rawStatus]) {
            return STATUS_CONFIG[rawStatus];
        }
        const noteLower = (item.note || '').toLowerCase();
        if (noteLower.includes('in progress') || rawStatus.includes('in_progress')) {
            return { label: 'In Progress', className: 'bg-amber-50 text-amber-900 border-amber-300 font-bold' };
        }
        if (noteLower.includes('converted') || rawStatus.includes('converted')) {
            return { label: 'Converted', className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
        }
        if (noteLower.includes('completed') || rawStatus.includes('completed')) {
            return { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' };
        }
        if (noteLower.includes('not interested') || rawStatus.includes('not_interested')) {
            return { label: 'Not Interested', className: 'bg-rose-50 text-rose-800 border-rose-200' };
        }
        if (noteLower.includes('callback') || rawStatus.includes('callback')) {
            return { label: 'Callback', className: 'bg-amber-50 text-amber-800 border-amber-200' };
        }
        if (noteLower.includes('contacted') || rawStatus.includes('contacted')) {
            return { label: 'Contacted', className: 'bg-blue-50 text-blue-700 border-blue-200' };
        }
        if (item.activityType === 'call_log') {
            return { label: 'Call Log', className: 'bg-blue-50 text-blue-700 border-blue-200' };
        }
        return {
            label: item.disposition ? item.disposition.replace(/_/g, ' ') : 'Status Update',
            className: 'bg-slate-100 text-slate-700 border-slate-200'
        };
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-700 font-bold">
                            <History className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">
                                Status History & Timeline
                            </h2>
                            <p className="text-xs text-slate-500 font-medium truncate max-w-[280px]" title={leadName || undefined}>
                                {leadName || 'Lead'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                'inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs',
                                activeBadge.className
                            )}
                        >
                            {activeBadge.label}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[calc(85vh-140px)] overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                            <span>{error}</span>
                        </div>
                    )}



                    {/* Tabs to Separate Lead Status Updates vs Task Status Updates */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setActiveTab('lead_status')}
                            className={cn(
                                'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                                activeTab === 'lead_status'
                                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            )}
                        >
                            <History className="w-3.5 h-3.5 text-amber-600" />
                            <span>Lead Status</span>
                            <span
                                className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px] font-extrabold',
                                    activeTab === 'lead_status'
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-slate-200 text-slate-600'
                                )}
                            >
                                {leadStatusHistory.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('task_status')}
                            className={cn(
                                'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                                activeTab === 'task_status'
                                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            )}
                        >
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Task Updates</span>
                            <span
                                className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px] font-extrabold',
                                    activeTab === 'task_status'
                                        ? 'bg-indigo-100 text-indigo-900'
                                        : 'bg-slate-200 text-slate-600'
                                )}
                            >
                                {taskStatusHistory.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={cn(
                                'py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1',
                                activeTab === 'all'
                                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                            )}
                            title="View All Timeline"
                        >
                            <span>All</span>
                            <span
                                className={cn(
                                    'px-1.5 py-0.2 rounded-full text-[10px] font-extrabold',
                                    activeTab === 'all'
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-slate-200 text-slate-600'
                                )}
                            >
                                {statusHistory.length}
                            </span>
                        </button>
                    </div>

                    {/* Timeline List (Latest First) */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                {activeTab === 'lead_status' ? (
                                    <>
                                        <History className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Lead Status Timeline (Latest First)</span>
                                    </>
                                ) : activeTab === 'task_status' ? (
                                    <>
                                        <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Task Status Timeline (Latest First)</span>
                                    </>
                                ) : (
                                    <>
                                        <Layers className="w-3.5 h-3.5 text-slate-600" />
                                        <span>All Status & Task Timeline</span>
                                    </>
                                )}
                            </h3>
                            <span className="text-[11px] text-slate-400 font-medium">
                                {displayedItems.length} {displayedItems.length === 1 ? 'update' : 'updates'}
                            </span>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                                <span>Loading history…</span>
                            </div>
                        ) : displayedItems.length === 0 ? (
                            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200/80 text-center space-y-1">
                                <p className="text-xs font-semibold text-slate-600">
                                    {activeTab === 'lead_status'
                                        ? 'No lead status updates recorded yet.'
                                        : activeTab === 'task_status'
                                          ? 'No task status updates recorded yet for this lead.'
                                          : 'No history updates recorded.'}
                                </p>
                                {activeTab === 'lead_status' && (
                                    <p className="text-[11px] text-slate-400">
                                        Current active status: <span className="font-bold text-slate-700">{activeBadge.label}</span>
                                    </p>
                                )}
                                {activeTab === 'task_status' && (
                                    <p className="text-[11px] text-slate-400">
                                        Tasks created, assigned, or completed for this lead will appear here.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                {displayedItems.map((item, idx) => {
                                    const isTask = isTaskActivity(item);
                                    const badge = getBadgeInfo(item);
                                    const isCurrentLeadStatus = !isTask && idx === 0 && (activeTab === 'lead_status' || activeTab === 'all');

                                    return (
                                        <div key={item.id || idx} className="relative group">
                                            {/* Dot */}
                                            <div
                                                className={cn(
                                                    'absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 bg-white',
                                                    isCurrentLeadStatus
                                                        ? 'border-amber-500 bg-amber-500 ring-4 ring-amber-100'
                                                        : isTask
                                                          ? idx === 0 && activeTab === 'task_status'
                                                            ? 'border-indigo-500 bg-indigo-500 ring-4 ring-indigo-100'
                                                            : 'border-indigo-400 bg-indigo-50'
                                                          : 'border-slate-300'
                                                )}
                                            />

                                            <div className={cn(
                                                'bg-white p-3.5 rounded-xl border shadow-2xs transition-colors',
                                                isTask ? 'border-slate-200/80 hover:border-indigo-300' : 'border-slate-200/80 hover:border-amber-300'
                                            )}>
                                                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={cn(
                                                                'inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider',
                                                                badge.className
                                                            )}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                        {isCurrentLeadStatus && (
                                                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase">
                                                                Current Status
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded-md text-[11px] text-slate-700 font-semibold border border-slate-200">
                                                        <Calendar className="w-3 h-3 text-amber-600 shrink-0" />
                                                        <span>{formatTimestamp(item.createdAt)}</span>
                                                    </div>
                                                </div>

                                                {/* Author & Update Info */}
                                                <div className="flex items-center gap-1 text-[11px] text-slate-600 font-semibold mb-1">
                                                    <User className="w-3 h-3 text-slate-400" />
                                                    <span>Updated by <span className="text-slate-900">{item.authorName || item.userName || 'Sales Agent'}</span></span>
                                                </div>

                                                {/* Note / Remarks */}
                                                {item.note && (() => {
                                                    const raw = item.note || '';
                                                    // If updated by Excel Import, do not display full observation / audit conclusion as a status note
                                                    if (
                                                        item.authorName === 'Excel Import' &&
                                                        !raw.startsWith('Lead imported') &&
                                                        !raw.startsWith('Status updated') &&
                                                        !raw.startsWith('Updated from Excel')
                                                    ) {
                                                        return null;
                                                    }
                                                    const noteMatch = raw.match(/(?:—\s*Note:\s*|\|\s*Note:\s*|Note:\s*)["']?([\s\S]*?)["']?$/i);
                                                    const displayNote = noteMatch && noteMatch[1] ? noteMatch[1].replace(/["']$/, '').trim() : raw;
                                                    if (!displayNote) return null;

                                                    return (
                                                        <div className={cn(
                                                            'flex items-start gap-1.5 mt-2 pt-2 border-t border-slate-100 text-xs text-slate-700 p-2.5 rounded-lg',
                                                            isTask ? 'bg-indigo-50/50 border border-indigo-100/60' : 'bg-slate-50/70'
                                                        )}>
                                                            {isTask ? (
                                                                <CheckSquare className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                                                            ) : (
                                                                <MessageSquare className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                                            )}
                                                            <p className="whitespace-pre-line leading-relaxed break-words font-medium">
                                                                {displayNote}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs rounded-xl transition-colors shadow-2xs"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
