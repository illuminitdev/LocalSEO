import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowRight,
    CheckCircle2,
    Copy,
    Download,
    HelpCircle,
    Loader2,
    MapPin,
    Printer,
    Star,
    XCircle
} from 'lucide-react';
import PlacesMap, { mapsJsConfigured } from '../../shared/PlacesMap';
import { downloadElementAsPdf } from '../../shared/downloadElementAsPdf';
import {
    fixPathForCheck,
    loadVisibilityAuditReport,
    type VisibilityAuditReport
} from './visibilityAudit';

function StatusIcon({ status }: { status: string }) {
    if (status === 'pass') return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    if (status === 'fail') return <XCircle className="w-5 h-5 text-red-500" />;
    return <HelpCircle className="w-5 h-5 text-amber-500" />;
}

function Donut({
    pass,
    fail,
    unknown,
    total
}: {
    pass: number;
    fail: number;
    unknown: number;
    total: number;
}) {
    const sum = Math.max(pass + fail + unknown, 1);
    const p = (pass / sum) * 100;
    const f = (fail / sum) * 100;
    const gradient = `conic-gradient(#10b981 0 ${p}%, #ef4444 ${p}% ${p + f}%, #f59e0b ${p + f}% 100%)`;
    return (
        <div className="relative w-40 h-40 mx-auto">
            <div className="w-full h-full rounded-full" style={{ background: gradient }} />
            <div className="absolute inset-4 rounded-full bg-white flex flex-col items-center justify-center border border-[#E2E8F0]">
                <span className="text-3xl font-black text-[#0F172A]">{total}</span>
                <span className="text-xs font-semibold text-gray-500">/ 100</span>
            </div>
        </div>
    );
}

export default function VisibilityAuditReport() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [copied, setCopied] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const report = useMemo(() => loadVisibilityAuditReport(), []) as VisibilityAuditReport | null;

    const handleDownloadPdf = async () => {
        if (!report) return;
        setIsExporting(true);
        setExportError('');
        try {
            const safe = (report.input.businessName || 'audit').replace(/[^\w\-]+/g, '-').slice(0, 40);
            await downloadElementAsPdf('audit-report-content', `zappsites-visibility-audit-${safe}`);
        } catch (err: any) {
            setExportError(err?.message || 'PDF download failed');
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        if (!report) return;
        if (searchParams.get('download') !== '1') return;
        const t = window.setTimeout(() => {
            handleDownloadPdf().catch(() => undefined);
        }, 500);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when opened with ?download=1
    }, [report, searchParams]);

    if (!report) {
        return (
            <div className="max-w-3xl mx-auto py-16 text-center">
                <h1 className="text-2xl font-bold text-[#0F172A]">No audit report yet</h1>
                <p className="text-gray-500 mt-2">Run a Free Local Visibility Audit from Local Search Grid.</p>
                <button
                    type="button"
                    onClick={() => navigate('/rank-tracker')}
                    className="mt-6 px-5 py-2.5 bg-[#0F172A] text-white rounded-xl font-bold cursor-pointer"
                >
                    Go to Local Search Grid
                </button>
            </div>
        );
    }

    const score = report.score;
    const ai = report.aiReport;
    const localRank = report.gbpLookup?.localRank;
    const failed = (score?.checks || []).filter((c: any) => c.status === 'fail');
    const mapMarkers = (localRank?.results || [])
        .filter((r: any) => r.lat != null && r.lng != null)
        .slice(0, 10)
        .map((r: any) => ({
            lat: r.lat,
            lng: r.lng,
            label: String(r.position),
            title: r.name,
            highlight: Boolean(r.isThisBusiness)
        }));

    const glance = [
        {
            label: report.websiteCheck?.reachable ? 'Website live' : 'Needs a website',
            status: report.websiteCheck?.status || 'fail',
            detail: report.websiteCheck?.note
        },
        {
            label: report.gbpLookup?.found ? 'On Google Maps' : 'Not on Google Maps',
            status: report.gbpLookup?.found ? 'pass' : 'fail',
            detail: report.gbpLookup?.mapsUrl || undefined
        },
        {
            label: 'NAP match',
            status: report.napCompare?.overall || 'unknown',
            detail: undefined
        },
        {
            label: 'Reviews',
            status: report.gbpLookup?.reviewCount > 0 ? 'pass' : 'fail',
            detail:
                report.gbpLookup?.rating != null
                    ? `${report.gbpLookup.rating}★ · ${report.gbpLookup.reviewCount} reviews`
                    : undefined
        },
        {
            label: 'Owner replies',
            status: report.gbpLookup?.ownerRepliesStatus || 'unknown',
            detail: 'Check Maps — API does not expose replies'
        },
        {
            label: '“Near me” place',
            status: localRank?.measured
                ? localRank.position != null && localRank.position <= 3
                    ? 'pass'
                    : 'fail'
                : 'unknown',
            detail: localRank?.measured
                ? localRank.position != null
                    ? `#${localRank.position} for “${localRank.query}”`
                    : `Not in the top 10 for “${localRank.query}”`
                : 'Not measured'
        }
    ];

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href.split('?')[0]);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in duration-500 pb-16">
            {exportError && (
                <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 print:hidden">
                    {exportError}
                </p>
            )}

            <div id="audit-report-content" className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                <div className="px-6 md:px-8 pt-6 pb-4 border-b border-[#E2E8F0]">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <img
                            src="/localseo.png"
                            alt="ZappSites Local SEO"
                            width={120}
                            height={28}
                            className="block shrink-0"
                            style={{
                                height: 28,
                                width: 'auto',
                                maxWidth: 120,
                                maxHeight: 28,
                                minWidth: 0,
                                objectFit: 'contain'
                            }}
                        />
                        <div className="pdf-hide print:hidden flex flex-wrap gap-2 shrink-0 justify-end">
                            <button
                                type="button"
                                disabled={isExporting}
                                onClick={handleDownloadPdf}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0F172A] hover:bg-[#111827] text-white font-semibold text-sm cursor-pointer disabled:opacity-70"
                            >
                                {isExporting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                {isExporting ? 'Building…' : 'Download PDF'}
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#0F172A] font-semibold text-sm cursor-pointer"
                            >
                                <Printer className="w-4 h-4" /> Print
                            </button>
                            <button
                                type="button"
                                onClick={copyLink}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#0F172A] font-semibold text-sm cursor-pointer"
                            >
                                <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy link'}
                            </button>
                        </div>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
                        Free Local Visibility Audit
                    </p>
                    <h1 className="text-xl md:text-2xl font-black text-[#0F172A] leading-tight mt-0.5">
                        {ai?.headline || `${report.input.businessName} Visibility Score`}
                    </h1>
                    <p className="mt-3 text-sm text-gray-600">
                        {report.input.businessName}
                        {report.input.city ? ` · ${report.input.city}` : ''}
                        {report.input.website ? ` · ${report.input.website}` : ''}
                        {report.input.service ? ` · ${report.input.service}` : ''}
                    </p>
                    <div className="mt-4 flex flex-wrap items-end gap-4">
                        <div>
                            <div className="text-5xl font-black tracking-tight text-[#0F172A]">
                                {score?.total ?? '—'}
                                <span className="text-xl font-bold text-gray-400"> / 100</span>
                            </div>
                            <p className="mt-1 font-semibold text-amber-700">{score?.bandLabel}</p>
                            {ai?.overallVerdict && (
                                <p className="text-sm text-gray-600 mt-0.5">{ai.overallVerdict}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-8">
                    <section className="grid md:grid-cols-2 gap-6 mb-10">
                        <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-6">
                            <h2 className="font-bold text-[#0F172A] mb-4">Score breakdown</h2>
                            <Donut
                                pass={score?.passCount || 0}
                                fail={score?.failCount || 0}
                                unknown={score?.unknownCount || 0}
                                total={score?.total || 0}
                            />
                            <div className="flex justify-center gap-4 mt-4 text-xs font-semibold text-gray-600">
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> OK
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Needs work
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Check
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-4 leading-relaxed">{report.scoreNote}</p>
                        </div>
                        <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-6">
                            <h2 className="font-bold text-[#0F172A] mb-4">Pillars</h2>
                            <div className="space-y-3">
                                {(score?.pillars || []).map((p: any) => (
                                    <div key={p.id}>
                                        <div className="flex justify-between text-sm font-semibold mb-1">
                                            <span>{p.name}</span>
                                            <span>
                                                {p.score}/{p.max}
                                            </span>
                                        </div>
                                        <div className="h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[#F59E0B]"
                                                style={{ width: `${(p.score / 10) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-xl font-bold text-[#0F172A] mb-4">At a glance</h2>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {glance.map((g) => (
                                <div
                                    key={g.label}
                                    className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 flex gap-3"
                                >
                                    <StatusIcon status={g.status} />
                                    <div>
                                        <p className="font-semibold text-[#0F172A] text-sm">{g.label}</p>
                                        {g.detail && (
                                            <p className="text-xs text-gray-500 mt-0.5 break-all">{g.detail}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {failed.length > 0 && (
                        <section className="mb-10">
                            <h2 className="text-xl font-bold text-[#0F172A] mb-4">What’s wrong</h2>
                            <ol className="space-y-3 list-decimal list-inside">
                                {failed.map((c: any, idx: number) => {
                                    const fix = fixPathForCheck(c.id);
                                    return (
                                        <li
                                            key={c.id}
                                            className="bg-[#F8FAFC] border border-red-100 rounded-xl px-4 py-3 text-sm"
                                        >
                                            <span className="font-semibold text-[#0F172A]">
                                                {idx + 1}. {c.label}
                                            </span>
                                            {c.evidence && <span className="text-gray-500"> — {c.evidence}</span>}
                                            <Link
                                                to={fix.path}
                                                className="pdf-hide ml-2 inline-flex items-center gap-1 text-amber-700 font-bold hover:underline"
                                            >
                                                Fix this <ArrowRight className="w-3.5 h-3.5" />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    )}

                    <section className="mb-10 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-[#0F172A] mb-2">If someone searches nearby</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Query tested: “{localRank?.query || `${report.input.service} near ${report.input.city}`}”
                        </p>
                        <p className="text-3xl font-black text-[#0F172A] mb-2">
                            {localRank?.position != null
                                ? `Appears at #${localRank.position}`
                                : localRank?.measured
                                  ? 'Not in the top 10'
                                  : 'Not measured'}
                        </p>
                        {mapsJsConfigured() && mapMarkers.length > 0 && (
                            <div className="pdf-hide mb-4">
                                <PlacesMap markers={mapMarkers} height={280} title="Near me results" />
                            </div>
                        )}
                        <ul className="divide-y divide-[#E2E8F0]">
                            {(localRank?.top5 || []).map((r: any) => (
                                <li
                                    key={`${r.placeId}-${r.position}`}
                                    className={`py-3 flex items-start gap-3 text-sm ${r.isThisBusiness ? 'bg-amber-50 -mx-2 px-2 rounded-lg' : ''}`}
                                >
                                    <span className="font-black text-[#F59E0B] w-6">#{r.position}</span>
                                    <div>
                                        <p className="font-semibold text-[#0F172A]">
                                            {r.name}
                                            {r.isThisBusiness && (
                                                <span className="ml-2 text-xs bg-[#F59E0B] text-white px-2 py-0.5 rounded font-bold">
                                                    This business
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-gray-500 text-xs">{r.address}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="mb-10 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-[#0F172A] mb-2">Owner replies to reviews?</h2>
                        <span className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                            Unknown — check Google Maps
                        </span>
                        <p className="text-sm text-gray-500 mt-2">
                            Places API does not expose owner replies. Open the Maps profile to verify.
                        </p>
                        {report.gbpLookup?.mapsUrl && (
                            <a
                                href={report.gbpLookup.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="pdf-hide inline-flex items-center gap-2 mt-3 text-sm font-bold text-[#0F172A] underline"
                            >
                                <MapPin className="w-4 h-4" /> Open Google Maps profile
                            </a>
                        )}
                        <div className="mt-4 space-y-3">
                            {(report.gbpLookup?.reviewsSample || []).map((r: any, i: number) => (
                                <div key={i} className="border border-[#E2E8F0] bg-white rounded-xl p-3 text-sm">
                                    <div className="flex items-center gap-2 font-semibold">
                                        <Star className="w-4 h-4 text-amber-500" /> {r.rating}★ · {r.date || 'Recent'}
                                    </div>
                                    <p className="text-gray-600 mt-1">{r.text || 'No snippet'}</p>
                                    <p className="text-xs text-gray-400 mt-1">Owner replied? Unknown</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {ai && (
                        <section className="mb-10">
                            <h2 className="text-xl font-bold text-[#0F172A] mb-3">Plain-English summary</h2>
                            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-6">
                                <p className="text-gray-700 leading-relaxed">{ai.executiveSummary}</p>
                                <p className="text-sm text-gray-500 mt-3">{ai.scoreComment}</p>
                            </div>
                        </section>
                    )}

                    {ai?.priorityFixes?.length > 0 && (
                        <section className="mb-6">
                            <h2 className="text-xl font-bold text-[#0F172A] mb-4">How we can fix it</h2>
                            <div className="grid md:grid-cols-3 gap-4">
                                {ai.priorityFixes.slice(0, 3).map((fix: any, i: number) => (
                                    <div key={i} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5">
                                        <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                                            Priority {i + 1}
                                        </p>
                                        <h3 className="font-bold text-[#0F172A] mt-1">{fix.title}</h3>
                                        <p className="text-sm text-gray-600 mt-2">
                                            <span className="font-semibold">Why:</span> {fix.why}
                                        </p>
                                        <p className="text-sm text-gray-600 mt-2">
                                            <span className="font-semibold">Action:</span> {fix.action}
                                        </p>
                                        <p className="text-xs font-semibold text-[#0F172A] mt-3">
                                            Suggested: {fix.suggestedPackage}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>

            <section className="mt-8 rounded-2xl border border-[#E2E8F0] bg-gradient-to-r from-amber-50 to-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden pdf-hide">
                <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">Ready to fix these gaps?</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        {ai?.offerLine ||
                            'Use Local Presence and Local Growth tools to close the checks above — no hard sell, just the next step.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {failed.slice(0, 1).map((c: any) => {
                        const fix = fixPathForCheck(c.id);
                        return (
                            <Link
                                key={c.id}
                                to={fix.path}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] text-white rounded-xl font-bold text-sm"
                            >
                                Start fixing <ArrowRight className="w-4 h-4" />
                            </Link>
                        );
                    })}
                    <Link
                        to="/rank-tracker"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-[#E2E8F0] text-[#0F172A] rounded-xl font-bold text-sm"
                    >
                        Back to Grid
                    </Link>
                </div>
            </section>
        </div>
    );
}
