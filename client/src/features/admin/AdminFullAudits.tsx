import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ClipboardCheck,
    Copy,
    Download,
    ExternalLink,
    Plus,
    RefreshCw,
    Trash2
} from 'lucide-react';
import {
    deleteFullAudit,
    downloadFullAuditPdf,
    fetchFullAudits,
    type FullAuditListItem
} from './adminApi';
import { cn } from '../../shared/utils';

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export default function AdminFullAudits() {
    const navigate = useNavigate();
    const [audits, setAudits] = useState<FullAuditListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busyId, setBusyId] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        fetchFullAudits()
            .then(setAudits)
            .catch((err: Error) => {
                setAudits([]);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onCopy = async (url: string) => {
        const ok = await copyText(url);
        setMessage(ok ? 'Shareable link copied.' : url);
    };

    const onPdf = async (a: FullAuditListItem) => {
        setBusyId(a.id);
        setError('');
        setMessage('');
        try {
            await downloadFullAuditPdf(a.id, a.businessName, a.pdfUrl);
            setMessage('PDF downloaded.');
        } catch (err: any) {
            setError(err.message || 'PDF download failed');
        } finally {
            setBusyId('');
        }
    };

    const onDelete = async (a: FullAuditListItem) => {
        const name = a.businessName || 'this report';
        if (!window.confirm(`Delete “${name}”? This permanently removes the full crawl report.`)) {
            return;
        }
        setBusyId(a.id);
        setError('');
        try {
            await deleteFullAudit(a.id);
            setAudits((prev) => prev.filter((x) => x.id !== a.id));
            setMessage('Audit deleted.');
        } catch (err: any) {
            setError(err.message || 'Could not delete audit');
        } finally {
            setBusyId('');
        }
    };

    return (
        <div className="space-y-4 max-w-7xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[#64748B] max-w-xl">
                    Deep site crawls scored for Local SEO + AEO + GEO. History is the shared ZappSites{' '}
                    <code className="text-xs">audits</code> table (kind=deep) — not Growth Audit leads.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/full-audits/new')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F59E0B] text-sm font-bold text-[#0F172A] hover:bg-[#FBBF24]"
                    >
                        <Plus className="w-4 h-4" />
                        New full audit
                    </button>
                </div>
            </div>

            {error ? (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            ) : null}
            {message ? (
                <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    {message}
                </p>
            ) : null}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#FCFDFE] flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-[#F59E0B]" />
                    <h2 className="text-sm font-bold text-[#0F172A]">Full audit history</h2>
                    <span className="text-xs text-[#94A3B8] ml-auto">{audits.length} reports</span>
                </div>

                {loading ? <p className="p-6 text-sm text-[#64748B]">Loading…</p> : null}

                {!loading && audits.length === 0 ? (
                    <p className="p-6 text-sm text-[#64748B]">
                        No full crawl audits yet. Growth Audit reports stay on the public flow — they won&apos;t
                        appear here.
                    </p>
                ) : null}

                <ul className="divide-y divide-[#E2E8F0]">
                    {audits.map((a) => {
                        const share = a.shareUrl || a.reportUrl || '';
                        const busy = busyId === a.id;
                        return (
                            <li
                                key={a.id}
                                className="p-4 sm:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between hover:bg-[#FFFBEB]/60 transition-colors"
                            >
                                <div className="min-w-0">
                                    <p className="font-semibold text-[#0F172A] truncate">
                                        {a.businessName || 'Untitled business'}
                                    </p>
                                    <p className="text-xs text-[#64748B] mt-1">
                                        Full crawl · {a.city || '—'} · {a.tradeId || '—'} ·{' '}
                                        {a.published ? 'Published' : 'Draft'}
                                        {a.totalScore != null ? ` · ${a.totalScore}/100` : ''}
                                    </p>
                                    <p className="text-xs text-[#94A3B8] mt-0.5 truncate">
                                        {[a.email, a.phone].filter(Boolean).join(' · ') || 'No contact'}
                                        {a.website ? ` · ${a.website}` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <Link
                                        to={`/admin/full-audits/${a.id}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-white"
                                    >
                                        Details
                                    </Link>
                                    {share ? (
                                        <>
                                            <a
                                                href={share}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-white"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                Open report
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => onCopy(share)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-white"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Copy link
                                            </button>
                                        </>
                                    ) : null}
                                    {a.published ? (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onPdf(a)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F172A] text-xs font-bold text-white hover:bg-[#1E293B] disabled:opacity-60"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            {busy ? 'Downloading…' : 'Download PDF'}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onDelete(a)}
                                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] text-[#94A3B8] hover:text-red-600 hover:border-red-200"
                                        aria-label={`Delete ${a.businessName || 'audit'}`}
                                        title="Delete report"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
