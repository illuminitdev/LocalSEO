import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { downloadFullAuditPdf, fetchFullAudit } from './adminApi';

export default function AdminFullAuditDetail() {
    const { id = '' } = useParams();
    const [audit, setAudit] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [pdfBusy, setPdfBusy] = useState(false);

    const load = useCallback(() => {
        if (!id) return;
        setLoading(true);
        setError('');
        fetchFullAudit(id)
            .then((res) => setAudit(res.data || null))
            .catch((err: Error) => {
                setAudit(null);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const shareUrl =
        audit?.shareUrl ||
        audit?.reportUrl ||
        (audit?.id ? `https://www.zappsites.com/audit-report/${audit.id}` : '');
    const score = audit?.score?.total ?? audit?.totalScore;
    const businessName = audit?.business?.businessName || audit?.businessName || 'Full audit';

    const onCopy = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setMessage('Shareable link copied.');
        } catch {
            setMessage(shareUrl);
        }
    };

    const onPdf = async () => {
        if (!audit?.id && !id) return;
        setPdfBusy(true);
        setError('');
        setMessage('');
        try {
            await downloadFullAuditPdf(String(audit?.id || id), businessName);
            setMessage('PDF downloaded.');
        } catch (err: any) {
            setError(err.message || 'PDF download failed');
        } finally {
            setPdfBusy(false);
        }
    };

    return (
        <div className="space-y-4 max-w-3xl">
            <Link
                to="/admin/full-audits"
                className="inline-flex text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
                ← Back to Full Audit
            </Link>

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

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
                {loading ? <p className="text-sm text-[#64748B]">Loading…</p> : null}
                {!loading && !audit ? (
                    <p className="text-sm text-[#64748B]">Audit not found.</p>
                ) : null}

                {audit ? (
                    <>
                        <div>
                            <h2 className="text-lg font-bold text-[#0F172A]">{businessName}</h2>
                            <p className="text-sm text-[#64748B] mt-1">
                                {audit.business?.city || audit.city || '—'}
                                {audit.published || audit.status === 'published'
                                    ? ' · Published'
                                    : ' · Draft'}
                                {score != null ? ` · ${score}/100` : ''}
                            </p>
                            <p className="text-xs text-[#94A3B8] mt-1 break-all">
                                {[audit.business?.email || audit.email, audit.business?.phone || audit.phone]
                                    .filter(Boolean)
                                    .join(' · ') || 'No contact'}
                                {audit.business?.website || audit.website
                                    ? ` · ${audit.business?.website || audit.website}`
                                    : ''}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase tracking-wide text-[#94A3B8]">
                                Shareable link
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    readOnly
                                    value={shareUrl}
                                    className="flex-1 px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#0F172A] bg-[#F8FAFC]"
                                />
                                <button
                                    type="button"
                                    onClick={onCopy}
                                    disabled={!shareUrl}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                >
                                    <Copy className="w-4 h-4" />
                                    Copy link
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            {shareUrl ? (
                                <a
                                    href={shareUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open report
                                </a>
                            ) : null}
                            {(audit.published || audit.status === 'published') && (
                                <button
                                    type="button"
                                    disabled={pdfBusy}
                                    onClick={onPdf}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F172A] text-sm font-bold text-white hover:bg-[#1E293B] disabled:opacity-60"
                                >
                                    <Download className="w-4 h-4" />
                                    {pdfBusy ? 'Downloading…' : 'Download PDF'}
                                </button>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
