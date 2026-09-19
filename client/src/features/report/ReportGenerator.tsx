import { useEffect, useState } from 'react';
import {
    FileText,
    Download,
    Loader2,
    BarChart2,
    Users,
    Calendar,
    Lightbulb,
    BookOpen,
    X,
    Sparkles,
    CheckCircle2
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import { downloadElementAsPdf } from '../../shared/downloadElementAsPdf';

const REPORT_STORAGE_KEY = 'localpulse_strategy_report';

function loadSavedReport(): { reportData: any; businessName: string; reportDate?: string } | null {
    try {
        const raw = sessionStorage.getItem(REPORT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.reportData?.grade) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveReport(reportData: any, businessName: string, reportDate: string) {
    try {
        sessionStorage.setItem(
            REPORT_STORAGE_KEY,
            JSON.stringify({ reportData, businessName, reportDate, savedAt: new Date().toISOString() })
        );
    } catch {
        // ignore
    }
}

export default function ReportGenerator() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [reportReady, setReportReady] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const [error, setError] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [reportDate, setReportDate] = useState(() => new Date().toLocaleDateString());
    const [showHowItWorks, setShowHowItWorks] = useState(false);

    useEffect(() => {
        const saved = loadSavedReport();
        if (!saved) return;
        setReportData(saved.reportData);
        setBusinessName(saved.businessName || '');
        if (saved.reportDate) setReportDate(saved.reportDate);
        setReportReady(true);
    }, []);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError('');
        try {
            const business = await apiGet('/api/business');
            if (!business?.name?.trim()) {
                throw new Error('Save your business profile first (required fields on Business profile page).');
            }

            const stats = await apiGet('/api/dashboard/stats');
            const name = stats.businessName || business.name || '';
            setBusinessName(name);
            const data = await apiPost('/api/ai/strategy-report', stats);
            const dated = new Date().toLocaleDateString();
            setReportDate(dated);
            setReportData(data);
            setReportReady(true);
            saveReport(data, name, dated);
            await logDashboardActivity({
                type: 'report',
                message: `Generated strategy report. Grade: ${data.grade}.`,
                icon: 'CheckCircle',
                color: 'text-[#0F172A]'
            });
        } catch (err: any) {
            setError(err.message || 'Report failed');
            setReportReady(false);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        setError('');
        try {
            const safeName = (businessName || 'report').replace(/[^\w\-]+/g, '-').slice(0, 40);
            await downloadElementAsPdf('report-content', `zappsites-local-seo-${safeName}`);
        } catch (err: any) {
            setError(err?.message || 'PDF export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const sourceLabel = reportData?.source === 'fallback' ? 'Template report' : 'Gemini report';

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 print:hidden">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">AI Insights</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Turn rankings, listings, and reviews into a prioritized 30-day action plan.
                    </p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-70 shadow-xs cursor-pointer shrink-0"
                >
                    {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                        <FileText className="w-4 h-4" />
                    )}
                    {isGenerating ? 'Compiling Data...' : 'Generate New Report'}
                </button>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 print:hidden">
                    {error}
                </p>
            )}

            {/* 3 Pillar Summary Bar */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-[#E2E8F0] mb-6 print:hidden">
                {/* 1. Local rankings */}
                <div className="flex items-center gap-3.5 md:pr-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <BarChart2 className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-[#0F172A]">Local rankings</h3>
                        <p className="text-xs text-gray-500">Analyse your keyword positions</p>
                    </div>
                </div>

                {/* 2. Competitor activity */}
                <div className="flex items-center gap-3.5 pt-3 md:pt-0 md:px-4">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-[#FF8800]" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-[#0F172A]">Competitor activity</h3>
                        <p className="text-xs text-gray-500">See what your competitors are doing</p>
                    </div>
                </div>

                {/* 3. 30-day action plan */}
                <div className="flex items-center gap-3.5 pt-3 md:pt-0 md:pl-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-[#0F172A]">30-day action plan</h3>
                        <p className="text-xs text-gray-500">Get AI-powered recommendations</p>
                    </div>
                </div>
            </div>

            {/* Empty State / Loading State / Generated Report */}
            {!reportReady && !isGenerating && (
                <div className="bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-12 md:p-16 flex flex-col items-center justify-center text-center shadow-xs my-6">
                    <div className="w-16 h-16 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-center text-slate-400 mb-4">
                        <svg className="w-10 h-10 text-slate-400" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 8C12 5.79086 13.7909 4 16 4H28L36 12V40C36 42.2091 34.2091 44 32 44H16C13.7909 44 12 42.2091 12 40V8Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M28 4V12H36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M19 32V26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M24 32V21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M29 32V17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-[#0F172A] mb-2">No reports yet</h2>
                    <p className="text-xs md:text-sm text-gray-500 max-w-md mb-6 leading-relaxed">
                        Generate a report to get insights from your local SEO metrics, competitor activity and a personalized 30-day action plan.
                    </p>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#FF8800] hover:bg-[#E67A00] text-white rounded-xl text-sm font-bold shadow-xs cursor-pointer transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Generate your first report
                    </button>
                </div>
            )}

            {isGenerating && (
                <div className="bg-white p-12 md:p-16 rounded-2xl border border-[#E2E8F0] text-center shadow-xs my-6">
                    <div className="w-16 h-16 border-4 border-slate-100 border-t-[#FF8800] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-base font-bold text-[#0F172A]">Aggregating LocalPulse Data...</p>
                    <p className="text-xs text-gray-500 mt-1">Analyzing local rankings, reviews, and competitors...</p>
                </div>
            )}

            {reportReady && reportData && (
                <div
                    id="report-content"
                    className="bg-white p-6 md:p-8 rounded-2xl border border-[#E2E8F0] shadow-sm animate-in slide-in-from-bottom-4 duration-500 mb-6"
                >
                    <div className="mb-6 pb-4 border-b border-[#E2E8F0]">
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
                            <div className="flex items-center gap-2 print:hidden">
                                <button
                                    onClick={handleExport}
                                    disabled={isExporting}
                                    className="pdf-hide flex items-center gap-1.5 px-3 py-1.5 bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#0F172A] text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-70 shrink-0"
                                >
                                    {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    {isExporting ? 'Building…' : 'Export PDF'}
                                </button>
                                <button
                                    onClick={() => {
                                        setReportReady(false);
                                        setReportData(null);
                                        sessionStorage.removeItem(REPORT_STORAGE_KEY);
                                    }}
                                    className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-[#E2E8F0] text-gray-600 text-xs font-bold rounded-lg cursor-pointer"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                        <h2 className="text-xl font-black text-[#0F172A] uppercase tracking-tight leading-tight">
                            Local SEO Audit Report
                        </h2>
                        <p className="text-gray-500 mt-1 text-xs font-semibold">
                            {businessName || 'No listing'} • {reportDate}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="col-span-1 bg-[#F8FAFC] p-5 rounded-xl border border-[#E2E8F0] flex flex-col items-center justify-center text-center">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                Overall Grade
                            </span>
                            <div className="text-5xl font-black text-[#0F172A] mb-1">{reportData.grade}</div>
                            <p className="text-xs text-[#0F172A] font-bold bg-[#FF8800]/10 px-3 py-1 rounded-full border border-[#FF8800]/20">
                                {sourceLabel}
                            </p>
                        </div>

                        <div className="col-span-2 grid grid-cols-2 gap-3">
                            <div className="border border-[#E2E8F0] rounded-xl p-3.5">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Local Pack Rank</div>
                                <div className="text-xl font-bold text-[#0F172A]">
                                    {reportData.metrics?.localPackRank ?? '—'}
                                </div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-3.5">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Profile Completeness</div>
                                <div className="text-xl font-bold text-[#0F172A]">
                                    {reportData.metrics?.completeness ?? 0}%
                                </div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-3.5">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Review Response Rate</div>
                                <div className="text-xl font-bold text-[#0F172A]">
                                    {reportData.metrics?.reviewResponseRate ?? 0}%
                                </div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-3.5">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Missing Media</div>
                                <div className="text-xl font-bold text-[#0F172A]">
                                    {reportData.metrics?.missingMedia ?? '—'}
                                </div>
                            </div>
                            {reportData.metrics?.visibilityAuditScore != null && (
                                <div className="border border-[#E2E8F0] rounded-xl p-3.5 col-span-2">
                                    <div className="text-xs font-semibold text-gray-500 mb-1">Visibility Audit Score</div>
                                    <div className="text-xl font-bold text-[#0F172A]">
                                        {reportData.metrics.visibilityAuditScore}/100
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-[#0F172A] border-b-2 border-[#FF8800] pb-1.5 mb-3 inline-block">
                            Competitor Positioning
                        </h3>
                        <p className="text-gray-700 leading-relaxed text-xs">{reportData.positioningText}</p>
                        {Array.isArray(reportData.competitors) && reportData.competitors.length > 0 && (
                            <ul className="mt-3 space-y-1.5">
                                {reportData.competitors.map((c: any, i: number) => (
                                    <li
                                        key={`${c.name}-${i}`}
                                        className="flex flex-wrap items-center justify-between gap-2 text-xs border border-[#E2E8F0] rounded-lg px-3 py-2 bg-white"
                                    >
                                        <span className="font-semibold text-[#0F172A]">{c.name}</span>
                                        <span className="text-gray-600 font-semibold">
                                            {c.rating || '—'}★ · {c.reviews || 0} reviews
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-[#0F172A] border-b-2 border-[#0F172A] pb-1.5 mb-3 inline-block">
                            30-Day AI Roadmap
                        </h3>
                        <ul className="space-y-3">
                            {(reportData.roadmap || []).map((step: any) => (
                                <li key={step.id} className="flex gap-3 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                                    <div className="text-[#FF8800] font-bold text-base">{step.id}</div>
                                    <div>
                                        <h4 className="font-bold text-[#0F172A] text-xs">{step.title}</h4>
                                        <p className="text-xs text-gray-600 mt-0.5">{step.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Bottom Help Banner */}
            <div className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs print:hidden">
                <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-blue-500">
                        <Lightbulb className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h4 className="font-bold text-sm text-[#0F172A]">Not sure where to start?</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Our AI analyses your local presence and gives practical, prioritized recommendations to help you get more customers.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setShowHowItWorks(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold shrink-0 shadow-xs cursor-pointer transition-colors"
                >
                    <BookOpen className="w-4 h-4 text-gray-600" />
                    Learn how it works
                </button>
            </div>

            {/* "Learn how it works" Modal */}
            {showHowItWorks && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowHowItWorks(false);
                    }}
                >
                    <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 md:p-8 shadow-2xl border border-[#E2E8F0]">
                        <button
                            type="button"
                            onClick={() => setShowHowItWorks(false)}
                            className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-[#FF8800]/10 flex items-center justify-center text-[#FF8800]">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#0F172A]">How AI Insights Works</h3>
                                <p className="text-xs text-gray-500">Your automated 30-day growth engine</p>
                            </div>
                        </div>

                        <div className="space-y-3.5 my-6 text-xs text-gray-600">
                            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-[#0F172A] block mb-0.5">1. Multi-signal audit</strong>
                                    We analyze your Google Business Profile completeness, review velocity, local citations, and map rankings.
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-[#0F172A] block mb-0.5">2. Competitor benchmarking</strong>
                                    We inspect rival businesses in your exact service area to find gaps you can exploit.
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-[#0F172A] block mb-0.5">3. Prioritized 30-day action roadmap</strong>
                                    You receive concrete, step-by-step tasks to boost Local Pack visibility and convert more searchers.
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setShowHowItWorks(false);
                                handleGenerate();
                            }}
                            className="w-full py-2.5 px-4 bg-[#FF8800] hover:bg-[#E67A00] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                            Generate report now
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
