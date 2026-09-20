import React, { useEffect, useState, useCallback } from 'react';
import { X, History, User, MessageSquare, Plus, RefreshCw, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
import { adminGet, updateAdminCrmLead, type LeadActivity } from './adminApi';
import { apiGet, apiPatch, cn } from '../shared/utils';

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

function getLocalIsoString() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
}

export default function LeadStatusHistoryModal({
    isOpen,
    leadId,
    leadName,
    currentStatus,
    initialNote,
    initialDate,
    authorName,
    readOnly = false,
    allowLogStatus,
    onClose,
    onStatusUpdated
}: LeadStatusHistoryModalProps) {
    const canLogStatus = !readOnly && allowLogStatus !== false;
    const [activities, setActivities] = useState<LeadActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // New status update form state
    const [isAddingStatus, setIsAddingStatus] = useState(false);
    const [newStatus, setNewStatus] = useState<string>(currentStatus || 'contacted');
    const [statusDate, setStatusDate] = useState<string>(getLocalIsoString());
    const [statusNote, setStatusNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const loadActivities = useCallback(async () => {
        if (!leadId) return;
        setLoading(true);
        setError(null);
        try {
            try {
                const res = await adminGet(`/api/admin/crm/leads/${encodeURIComponent(leadId)}/activities`);
                if (res && res.activities) {
                    setActivities(res.activities);
                    return;
                }
            } catch (aErr) {
                // If not admin, try sales activities endpoint
                try {
                    const sRes = await apiGet(`/api/sales/leads/${encodeURIComponent(leadId)}/activities`);
                    if (sRes && sRes.activities) {
                        setActivities(sRes.activities);
                        return;
                    }
                } catch {
                    const sCrm = await apiGet(`/api/sales/leads/${encodeURIComponent(leadId)}/crm`);
                    if (sCrm && sCrm.activities) {
                        setActivities(sCrm.activities);
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
            setNewStatus(currentStatus || 'contacted');
            setStatusDate(getLocalIsoString());
            setStatusNote('');
            setIsAddingStatus(false);
            setSuccessMessage(null);
        }
    }, [isOpen, leadId, currentStatus, loadActivities]);

    if (!isOpen) return null;

    const handleUpdateStatus = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStatus) return;

        setSubmitting(true);
        setError(null);
        try {
            const parsedDate = statusDate ? new Date(statusDate).toISOString() : new Date().toISOString();
            try {
                await updateAdminCrmLead(leadId, {
                    status: newStatus,
                    notes: statusNote.trim() || undefined,
                    createdAt: parsedDate
                } as any);
            } catch (adminErr) {
                await apiPatch(`/api/sales/leads/${encodeURIComponent(leadId)}`, {
                    status: newStatus,
                    notes: statusNote.trim() || undefined
                });
            }

            setSuccessMessage(`Status updated to "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
            setStatusNote('');
            setIsAddingStatus(false);
            if (onStatusUpdated) {
                onStatusUpdated(newStatus);
            }
            await loadActivities();
            setTimeout(() => setSuccessMessage(null), 3500);
        } catch (err: any) {
            setError(err.message || 'Failed to update status');
        } finally {
            setSubmitting(false);
        }
    };

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

    const effectiveStatus = statusHistory[0]?.disposition || currentStatus;
    const activeBadge = STATUS_CONFIG[String(effectiveStatus || '').toLowerCase()] || {
        label: effectiveStatus ? String(effectiveStatus).replace(/_/g, ' ') : 'New',
        className: 'bg-slate-100 text-slate-700 border-slate-200'
    };

    const getBadgeInfo = (item: LeadActivity) => {
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
        if (item.activityType === 'task_event') {
            return { label: 'Task Update', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
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

                    {successMessage && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Add Status Update Button / Form */}
                    {canLogStatus && (
                        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                            {!isAddingStatus ? (
                                <button
                                    type="button"
                                    onClick={() => setIsAddingStatus(true)}
                                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-200 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                                >
                                    <Plus className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Log New Status Update</span>
                                </button>
                            ) : (
                                <form onSubmit={handleUpdateStatus} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-800">Update Lead Status</span>
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingStatus(false)}
                                            className="text-[11px] text-slate-500 hover:text-slate-800"
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                                Select New Status
                                            </label>
                                            <select
                                                value={newStatus}
                                                onChange={(e) => setNewStatus(e.target.value)}
                                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                                            >
                                                <option value="new">New</option>
                                                <option value="contacted">Contacted</option>
                                                <option value="in_progress">In Progress</option>
                                                <option value="callback">Callback Requested</option>
                                                <option value="interested">Interested</option>
                                                <option value="not_interested">Not Interested</option>
                                                <option value="converted">Converted</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                                Update Date & Time
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={statusDate}
                                                onChange={(e) => setStatusDate(e.target.value)}
                                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                            Update Note / Remark
                                        </label>
                                        <textarea
                                            value={statusNote}
                                            onChange={(e) => setStatusNote(e.target.value)}
                                            rows={2}
                                            placeholder="Add notes about the call or reason for status change…"
                                            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-500 font-medium placeholder:text-slate-400 resize-none"
                                        />
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-1">
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all disabled:opacity-50 shadow-2xs inline-flex items-center gap-1.5"
                                        >
                                            {submitting ? (
                                                <>
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    <span>Saving…</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>Save Status Update</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Timeline List (Latest First) */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Status Timeline (Latest First)
                            </h3>
                            <span className="text-[11px] text-slate-400 font-medium">
                                {statusHistory.length} {statusHistory.length === 1 ? 'update' : 'updates'}
                            </span>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                                <span>Loading status history…</span>
                            </div>
                        ) : statusHistory.length === 0 ? (
                            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200/80 text-center space-y-1">
                                <p className="text-xs font-semibold text-slate-600">No previous status updates recorded.</p>
                                <p className="text-[11px] text-slate-400">Current active status: <span className="font-bold text-slate-700">{activeBadge.label}</span></p>
                            </div>
                        ) : (
                            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                                {statusHistory.map((item, idx) => {
                                    const badge = getBadgeInfo(item);
                                    const isLatest = idx === 0;

                                    return (
                                        <div key={item.id || idx} className="relative group">
                                            {/* Dot */}
                                            <div
                                                className={cn(
                                                    'absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 bg-white',
                                                    isLatest
                                                        ? 'border-amber-500 bg-amber-500 ring-4 ring-amber-100'
                                                        : 'border-slate-300'
                                                )}
                                            />

                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-amber-300 transition-colors">
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
                                                        {isLatest && (
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
                                                {item.note && (
                                                    <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-slate-100 text-xs text-slate-700 bg-slate-50/70 p-2.5 rounded-lg">
                                                        <MessageSquare className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                                                        <p className="whitespace-pre-line leading-relaxed break-words font-medium">
                                                            {(() => {
                                                                const raw = item.note || '';
                                                                const noteMatch = raw.match(/(?:—\s*Note:\s*|\|\s*Note:\s*|Note:\s*)["']?([\s\S]*?)["']?$/i);
                                                                if (noteMatch && noteMatch[1]) {
                                                                    return noteMatch[1].replace(/["']$/, '').trim();
                                                                }
                                                                return raw;
                                                            })()}
                                                        </p>
                                                    </div>
                                                )}
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
