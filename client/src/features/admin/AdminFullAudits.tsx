import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    CheckSquare,
    ClipboardCheck,
    Copy,
    Download,
    ExternalLink,
    Plus,
    RefreshCw,
    Share2,
    Trash2
} from 'lucide-react';
import {
    deleteFullAudit,
    downloadFullAuditPdf,
    fetchFullAudits,
    fetchSalesAgents,
    shareFullAuditEmail,
    type FullAuditListItem,
    type SalesAgent
} from './adminApi';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { cn } from '../../shared/utils';

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function auditToLeadRef(a: FullAuditListItem): GrowthAuditLeadRef {
    const report = a.shareUrl || a.reportUrl || null;
    return {
        id: a.id,
        createdAt: a.createdAt,
        businessName: a.businessName || null,
        city: a.city || null,
        website: a.website || null,
        email: a.email || null,
        phone: a.phone || null,
        scoreTotal: a.totalScore ?? null,
        sharePath: report ? `/audit-report/${a.id}` : null,
        reportUrl: report
    };
}

export default function AdminFullAudits() {
    const navigate = useNavigate();
    const [audits, setAudits] = useState<FullAuditListItem[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busyId, setBusyId] = useState('');
    const [busyAction, setBusyAction] = useState<'pdf' | 'share' | 'delete' | ''>('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        Promise.all([fetchFullAudits(), fetchSalesAgents().catch(() => [] as SalesAgent[])])
            .then(([list, agents]) => {
                setAudits(list);
                setSalesAgents(agents);
            })
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
        setBusyAction('pdf');
        setError('');
        setMessage('');
        try {
            await downloadFullAuditPdf(a.id, a.businessName);
            setMessage('PDF downloaded.');
        } catch (err: any) {
            setError(err.message || 'PDF download failed');
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    const onShare = async (a: FullAuditListItem) => {
        if (!a.email) {
            setError('This audit has no company email to share with.');
            return;
        }
        if (!a.published) {
            setError('Publish the audit before emailing the PDF report.');
            return;
        }
        const biz = a.businessName || 'this business';
        if (
            !window.confirm(
                `Email the audit report PDF to ${a.email} for “${biz}”?`
            )
        ) {
            return;
        }
        setBusyId(a.id);
        setBusyAction('share');
        setError('');
        setMessage('');
        try {
            const res = await shareFullAuditEmail(a.id);
            setMessage(
                res.attached === false
                    ? `Report emailed to ${res.to} (link only — PDF was too large to attach).`
                    : `Report emailed to ${res.to}.`
            );
        } catch (err: any) {
            setError(err.message || 'Could not email audit report');
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    const onDelete = async (a: FullAuditListItem) => {
        const name = a.businessName || 'this report';
        if (!window.confirm(`Delete “${name}”? This permanently removes the full crawl report.`)) {
            return;
        }
        setBusyId(a.id);
        setBusyAction('delete');
        setError('');
        try {
            await deleteFullAudit(a.id);
            setAudits((prev) => prev.filter((x) => x.id !== a.id));
            setMessage('Audit deleted.');
        } catch (err: any) {
            setError(err.message || 'Could not delete audit');
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    return (
        <div className="space-y-5 max-w-7xl">
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                <div className="px-5 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#FFFBEB] to-white flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF3C7] border border-[#FDE68A]">
                        <ClipboardCheck className="w-4 h-4 text-[#D97706]" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-[#0F172A]">Full audit history</h2>
                        <p className="text-[11px] text-[#94A3B8]">Deep crawl reports ready to share and assign</p>
                    </div>
                    <span className="text-xs font-semibold text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2.5 py-1 ml-auto">
                        {audits.length} reports
                    </span>
                </div>

                {loading ? <p className="p-6 text-sm text-[#64748B]">Loading…</p> : null}

                {!loading && audits.length === 0 ? (
                    <p className="p-6 text-sm text-[#64748B]">
                        No full crawl audits yet. Growth Audit reports stay on the public flow — they won&apos;t
                        appear here.
                    </p>
                ) : null}

                <ul className="divide-y divide-[#F1F5F9]">
                    {audits.map((a) => {
                        const share = a.shareUrl || a.reportUrl || '';
                        const busy = busyId === a.id;
                        const canShare = Boolean(a.email && a.published);
                        return (
                            <li
                                key={a.id}
                                className="group p-4 sm:p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between transition-colors"
                            >
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-base font-semibold text-[#0F172A] truncate group-hover:font-bold">
                                            {a.businessName || 'Untitled business'}
                                        </p>
                                        {a.totalScore != null ? (
                                            <span className="inline-flex items-center rounded-full bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 text-[11px] font-bold text-[#92400E]">
                                                {a.totalScore}/100
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-semibold text-[#475569]">
                                            Full crawl
                                        </span>
                                        <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-medium text-[#64748B]">
                                            {a.city || '—'}
                                        </span>
                                        <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-medium text-[#64748B]">
                                            {a.tradeId || '—'}
                                        </span>
                                        <span
                                            className={cn(
                                                'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                                                a.published
                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                            )}
                                        >
                                            {a.published ? 'Published' : 'Draft'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#94A3B8] truncate">
                                        {[a.email, a.phone].filter(Boolean).join(' · ') || 'No contact'}
                                        {a.website ? ` · ${a.website}` : ''}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <Link
                                        to={`/admin/full-audits/${a.id}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                    >
                                        Details
                                    </Link>
                                    {share ? (
                                        <>
                                            <a
                                                href={share}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                Open report
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => onCopy(share)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
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
                                            {busy && busyAction === 'pdf' ? 'Downloading…' : 'Download PDF'}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={busy || !canShare}
                                        onClick={() => onShare(a)}
                                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#D97706] hover:border-[#FDE68A] hover:bg-[#FFFBEB] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#64748B]"
                                        aria-label={`Email report to ${a.email || 'company'}`}
                                        title={
                                            !a.email
                                                ? 'No company email on this audit'
                                                : !a.published
                                                  ? 'Publish before sharing'
                                                  : `Email PDF to ${a.email}`
                                        }
                                    >
                                        <Share2
                                            className={cn(
                                                'w-4 h-4',
                                                busy && busyAction === 'share' && 'animate-pulse'
                                            )}
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onDelete(a)}
                                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#94A3B8] hover:text-red-600 hover:border-red-200 disabled:opacity-60"
                                        aria-label={`Delete ${a.businessName || 'audit'}`}
                                        title="Delete report"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveLead(auditToLeadRef(a))}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold shadow-xs transition-colors"
                                    >
                                        <CheckSquare className="w-3.5 h-3.5 text-[#D97706]" />
                                        Manage Task
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {activeLead ? (
                <LeadCrmDrawer
                    lead={activeLead}
                    salesAgents={salesAgents}
                    onClose={() => setActiveLead(null)}
                />
            ) : null}
        </div>
    );
}
