import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Calendar, History, Trash2, X } from 'lucide-react';


export type HistoryRow = { id: string; date: string; summary: ReactNode; badge?: ReactNode; change?: ReactNode };

export const historyDate = (iso?: string | null) =>
    iso
        ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Saved check';

/** "History (3)" button for the top of a page. */
export function HistoryButton({ count, onClick }: { count: number; onClick: () => void }) {
    if (!count) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer print:hidden"
        >
            <History className="w-3.5 h-3.5" />
            History ({count})
        </button>
    );
}

/** Popup listing past runs. Clicking a row opens that run on the page and closes the popup. */
export function HistoryModal({
    open,
    title,
    rows,
    viewingId,
    latestId,
    onView,
    onDelete,
    onClose,
    note
}: {
    open: boolean;
    title: string;
    rows: HistoryRow[];
    viewingId?: string | null;
    latestId?: string | null;
    onView: (id: string) => void;
    onDelete?: (id: string) => void;
    onClose: () => void;
    note?: string;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
                    <div>
                        <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            {rows.length} saved {rows.length === 1 ? 'check' : 'checks'}. Click one to open it.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <ul className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
                    {rows.map((r) => {
                        const isViewing = r.id === viewingId;
                        const isLatest = r.id === latestId;
                        return (
                            <li key={r.id} className={`flex items-center ${isViewing ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-[#F8FAFC]'}`}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onView(r.id);
                                        onClose();
                                    }}
                                    className="flex-1 min-w-0 text-left px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs cursor-pointer"
                                >
                                    <span className="flex items-center gap-2 min-w-[11rem]">
                                        {r.badge}
                                        <span className="font-bold text-[#0F172A]">{r.date}</span>
                                        {isLatest && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-wider">Latest</span>
                                        )}
                                    </span>
                                    <span className="flex-1 min-w-0 text-gray-600">{r.summary}</span>
                                    {r.change && <span className="shrink-0">{r.change}</span>}
                                    <span className={`shrink-0 font-bold ${isViewing ? 'text-[#0F172A]' : 'text-[var(--brand-primary)]'}`}>
                                        {isViewing ? 'Viewing' : 'Open →'}
                                    </span>
                                </button>
                                {onDelete && (
                                    <button
                                        type="button"
                                        title="Delete this check"
                                        aria-label="Delete this check"
                                        onClick={() => onDelete(r.id)}
                                        className="p-2.5 mr-3 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {note && <p className="px-5 py-3 border-t border-[#E2E8F0] text-[11px] text-gray-500 bg-[#F8FAFC]">{note}</p>}
            </div>
        </div>,
        document.body
    );
}

/** Shown at the top of a page while an older saved run is open, so it is not mistaken for the latest. */
export function ViewingOldBanner({ date, onBack }: { date: string; onBack: () => void }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
            <p className="flex items-center gap-2 text-xs text-amber-900">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>
                    You are viewing an older check from <strong>{date}</strong>. This is not your latest result.
                </span>
            </p>
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-[11px] font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
            >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to latest
            </button>
        </div>
    );
}
