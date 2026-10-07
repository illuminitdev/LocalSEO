import { useEffect, useState } from 'react';
import {
    BadgeCheck,
    CheckCircle2,
    AlertTriangle,
    MinusCircle,
    Database,
    Calendar,
    BookMarked,
    ListOrdered,
    FileText,
    Loader2
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';

export default function Citations() {
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);

    const applyPayload = (data: any) => {
        const runs = Array.isArray(data?.history) ? data.history : [];
        setHistory(runs);
        const latest = data?.scannedAt ? data : runs[0];
        if (latest?.scannedAt) setResult(latest);
    };

    useEffect(() => {
        apiGet('/api/ai/citations')
            .then(applyPayload)
            .catch(() => {})
            .finally(() => setReady(true));
    }, []);

    const runAudit = async () => {
        setLoading(true);
        setError('');
        const started = Date.now();
        try {
            while (Date.now() - started < 120000) {
                const data = await apiPost('/api/ai/citations', {});
                if (data?.retry) {
                    const seconds = Math.min(8, Math.max(3, Number(data.retryAfterSeconds) || 4));
                    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
                    continue;
                }
                applyPayload(data);
                await logDashboardActivity({
                    type: 'citations',
                    message: `Citation audit complete. ${data.found || 0} found, ${data.missing || 0} missing.`,
                    icon: 'Activity',
                    color: 'text-[#0F172A]'
                });
                return;
            }
            setError('The directory check is still running. Run it again in a little while.');
        } catch (err: any) {
            setError(err?.message || 'Citation search did not finish. Run it again.');
        } finally {
            setLoading(false);
        }
    };

    const statusBadge = (status: string) => {
        if (status === 'found' || status === 'consistent') {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Consistent
                </span>
            );
        }
        if (status === 'mismatch' || status === 'attention') {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Needs attention
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                <MinusCircle className="w-3.5 h-3.5 text-red-500" />
                Missing
            </span>
        );
    };

    const directoriesChecked = result ? (result.total || (result.citations ? result.citations.length : 0)) : 0;
    const consistentCount = result ? (result.found ?? 0) : 0;
    const needsAttentionCount = result ? (result.mismatch ?? 0) : 0;
    const lastScanLabel = result?.scannedAt
        ? new Date(result.scannedAt).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
          })
        : result
          ? 'Just now'
          : 'Not run';

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Citation tracker</h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
                        Checks live search results for your connected name, address, and phone. A directory is listed only when a real page is found.
                    </p>
                </div>

                <button
                    onClick={runAudit}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-70 shadow-xs cursor-pointer shrink-0"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                        <BadgeCheck className="w-4 h-4 text-emerald-400" />
                    )}
                    {loading ? 'Scanning directories...' : 'Run citation audit'}
                </button>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {/* Top 4 Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* 1. Directories checked */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Database className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Directories checked</p>
                        <p className="text-2xl font-bold text-[#0F172A]">{directoriesChecked}</p>
                    </div>
                </div>

                {/* 2. Consistent */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Consistent</p>
                        <p className="text-2xl font-bold text-[#0F172A]">{consistentCount}</p>
                    </div>
                </div>

                {/* 3. Needs attention */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Needs attention</p>
                        <p className="text-2xl font-bold text-[#0F172A]">{needsAttentionCount}</p>
                    </div>
                </div>

                {/* 4. Last scan */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Last scan</p>
                        <p className="text-lg font-bold text-[#0F172A]">{lastScanLabel}</p>
                    </div>
                </div>
            </div>

            {/* Empty State Banner (When Not Run) */}
            {!result && !loading && ready && (
                <div className="bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-10 md:p-14 flex flex-col items-center justify-center text-center shadow-xs mb-6">
                    <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-[var(--brand-primary)] mb-3">
                        <BookMarked className="w-6 h-6 text-[var(--brand-primary)]" />
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A] mb-1.5">No citation scan yet</h2>
                    <p className="text-xs text-gray-500 max-w-md mb-6 leading-relaxed">
                        Add your business details, then scan Google, Yelp, Apple Maps, Bing and other directories.
                    </p>
                    <button
                        type="button"
                        onClick={runAudit}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                    >
                        <BadgeCheck className="w-3.5 h-3.5" />
                        Run first audit
                    </button>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center shadow-xs mb-6">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-[var(--brand-primary)] rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm font-bold text-[#0F172A]">Scanning Citations & Directories...</p>
                    <p className="text-xs text-gray-400 mt-1">Checking Google, Bing, Yell, Yelp, Facebook and other directories...</p>
                </div>
            )}

            {/* Citation Results Table */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
                <div className="p-4 border-b border-[#E2E8F0] flex items-center gap-2 bg-white">
                    <ListOrdered className="w-4 h-4 text-gray-700" />
                    <h2 className="text-xs font-bold text-[#0F172A]">Citation results</h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] text-gray-500 border-b border-[#E2E8F0]">
                            <tr>
                                <th className="px-5 py-3 font-semibold">Directory</th>
                                <th className="px-5 py-3 font-semibold">Business name</th>
                                <th className="px-5 py-3 font-semibold">Address</th>
                                <th className="px-5 py-3 font-semibold">Phone</th>
                                <th className="px-5 py-3 font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                            {result && Array.isArray(result.citations) && result.citations.length > 0 ? (
                                result.citations.map((row: any, i: number) => (
                                    <tr key={i} className="hover:bg-gray-50/50">
                                        <td className="px-5 py-3.5 font-bold text-[#0F172A]">
                                            {row.url ? (
                                                <a
                                                    href={row.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="hover:text-[var(--brand-primary)] hover:underline"
                                                >
                                                    {row.directory}
                                                </a>
                                            ) : (
                                                row.directory
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-700 font-medium">
                                            {row.businessName || 'Not listed'}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-600">
                                            {row.address || 'Not listed'}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-600">{row.phone || 'Not listed'}</td>
                                        <td className="px-5 py-3.5">
                                            {statusBadge(row.status)}
                                            {row.note && row.status !== 'missing' ? (
                                                <p className="mt-1 text-[11px] text-gray-500 max-w-[220px]">{row.note}</p>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <FileText className="w-6 h-6 text-gray-300 mb-2" />
                                            <p className="text-xs text-gray-400">Results will appear here after your first scan.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {history.length > 0 && (
                <div className="mt-6 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-[#E2E8F0]">
                        <h2 className="text-xs font-bold text-[#0F172A]">Scan history</h2>
                    </div>
                    <ul className="divide-y divide-[#E2E8F0]">
                        {history.map((run) => {
                            const active = result?.scannedAt === run.scannedAt;
                            const when = run.scannedAt
                                ? new Date(run.scannedAt).toLocaleString('en-GB', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                  })
                                : 'Saved scan';
                            return (
                                <li key={run.scannedAt}>
                                    <button
                                        type="button"
                                        onClick={() => setResult(run)}
                                        className={`w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${
                                            active ? 'bg-[var(--brand-primary-soft)]' : 'hover:bg-[#F8FAFC]'
                                        }`}
                                    >
                                        <span className="font-bold text-[#0F172A]">{when}</span>
                                        <span className="text-emerald-700">{run.found ?? 0} consistent</span>
                                        <span className="text-amber-700">{run.mismatch ?? 0} needs attention</span>
                                        <span className="text-red-700">{run.missing ?? 0} missing</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
