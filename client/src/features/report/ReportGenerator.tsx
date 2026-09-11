import { useEffect, useState } from 'react';
import { FileText, Download, BarChart3, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { apiGet, apiPost, logDashboardActivity } from '../../shared/utils';

const REPORT_STORAGE_KEY = 'localpulse_strategy_report';

function loadSavedReport(): { reportData: any; businessName: string } | null {
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

function saveReport(reportData: any, businessName: string) {
    try {
        sessionStorage.setItem(
            REPORT_STORAGE_KEY,
            JSON.stringify({ reportData, businessName, savedAt: new Date().toISOString() })
        );
    } catch {
        /* ignore */
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

    useEffect(() => {
        const saved = loadSavedReport();
        if (!saved) return;
        setReportData(saved.reportData);
        setBusinessName(saved.businessName || '');
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
            saveReport(data, name);
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
        const el = document.getElementById('report-content');
        if (!el) return;
        setIsExporting(true);
        setError('');
        try {
            const canvas = await html2canvas(el, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const imgWidth = pageWidth - margin * 2;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = margin;
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= pageHeight - margin * 2;

            while (heightLeft > 0) {
                position = margin - (imgHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
                heightLeft -= pageHeight - margin * 2;
            }

            const safeName = (businessName || 'report').replace(/[^\w\-]+/g, '-').slice(0, 40);
            pdf.save(`zappsites-local-seo-${safeName}.pdf`);
        } catch (err: any) {
            setError(err?.message || 'PDF export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const sourceLabel = reportData?.source === 'fallback' ? 'Template report' : 'Gemini report';

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">AI Insights</h1>
                    <p className="text-gray-500 mt-2">
                        Turn rankings, listings, and reviews into a prioritized 30-day action plan.
                    </p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold transition-all disabled:opacity-70 shadow-sm cursor-pointer"
                >
                    <FileText className={`w-5 h-5 ${isGenerating ? 'animate-pulse' : ''}`} />
                    {isGenerating ? 'Compiling Data...' : 'Generate New Report'}
                </button>
            </div>
            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 print:hidden">
                    {error}
                </p>
            )}

            {!reportReady && !isGenerating && (
                <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center shadow-sm flex flex-col items-center justify-center">
                    <BarChart3 className="w-16 h-16 text-gray-300 mb-4" />
                    <h2 className="text-xl font-bold text-[#0F172A] mb-2">No Recent Reports</h2>
                    <p className="text-gray-500 max-w-sm">
                        Click the generate button above to compile your latest local SEO metrics, competitive insights,
                        and 30-day roadmap.
                    </p>
                </div>
            )}

            {isGenerating && (
                <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center shadow-sm">
                    <div className="w-16 h-16 border-4 border-[#F1F5F9] border-t-[#F59E0B] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 font-bold">Aggregating LocalPulse Data...</p>
                </div>
            )}

            {reportReady && reportData && (
                <div
                    id="report-content"
                    className="bg-white p-8 md:p-12 rounded-2xl border border-[#E2E8F0] shadow-lg animate-in slide-in-from-bottom-4 duration-500"
                >
                    <div className="flex justify-between items-start mb-10 pb-6 border-b border-[#E2E8F0] gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                            <img
                                src="/localseo.png"
                                alt="ZappSites Local SEO"
                                className="h-10 w-auto object-contain shrink-0"
                            />
                            <div className="min-w-0">
                                <h2 className="text-2xl font-black text-[#0F172A] uppercase tracking-tight">
                                    Local SEO Audit Report
                                </h2>
                                <p className="text-gray-500 mt-1 font-semibold">
                                    {businessName || 'No listing'} • {reportDate}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="print:hidden flex items-center gap-2 px-4 py-2 bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#0F172A] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-70 shrink-0"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isExporting ? 'Building PDF…' : 'Export PDF'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                        <div className="col-span-1 bg-[#F1F5F9] p-6 rounded-xl flex flex-col items-center justify-center text-center">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                Overall Grade
                            </span>
                            <div className="text-6xl font-black text-[#0F172A] mb-2">{reportData.grade}</div>
                            <p className="text-xs text-[#0F172A] font-bold bg-[#F59E0B]/10 px-3 py-1 rounded-full border border-[#F59E0B]/20">
                                {sourceLabel}
                            </p>
                        </div>

                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Local Pack Rank</div>
                                <div className="text-2xl font-bold flex items-center gap-2 text-[#0F172A]">
                                    {reportData.metrics?.localPackRank ?? '—'}
                                </div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Profile Completeness</div>
                                <div className="text-2xl font-bold text-[#0F172A]">
                                    {reportData.metrics?.completeness ?? 0}%
                                </div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Review Response Rate</div>
                                <div className="text-2xl font-bold flex items-center gap-2 text-[#0F172A]">
                                    {reportData.metrics?.reviewResponseRate ?? 0}%
                                </div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Missing Media</div>
                                <div className="text-2xl font-bold flex items-center gap-2 text-[#0F172A]">
                                    {reportData.metrics?.missingMedia ?? '—'}
                                </div>
                            </div>
                            {reportData.metrics?.visibilityAuditScore != null && (
                                <div className="border border-[#E2E8F0] rounded-xl p-4 col-span-2">
                                    <div className="text-xs font-semibold text-gray-500 mb-1">Visibility Audit Score</div>
                                    <div className="text-2xl font-bold text-[#0F172A]">
                                        {reportData.metrics.visibilityAuditScore}/100
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mb-10">
                        <h3 className="text-lg font-bold text-[#0F172A] border-b-2 border-[#F59E0B] pb-2 mb-4 inline-block">
                            Competitor Positioning
                        </h3>
                        <p className="text-gray-700 leading-relaxed text-sm">{reportData.positioningText}</p>
                        {Array.isArray(reportData.competitors) && reportData.competitors.length > 0 && (
                            <ul className="mt-4 space-y-2">
                                {reportData.competitors.map((c: any, i: number) => (
                                    <li
                                        key={`${c.name}-${i}`}
                                        className="flex flex-wrap items-center justify-between gap-2 text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
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
                        <h3 className="text-lg font-bold text-[#0F172A] border-b-2 border-[#D97706] pb-2 mb-4 inline-block">
                            30-Day AI Roadmap
                        </h3>
                        <ul className="space-y-4">
                            {(reportData.roadmap || []).map((step: any) => (
                                <li key={step.id} className="flex gap-4 p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                                    <div className="text-[#D97706] font-bold text-xl">{step.id}</div>
                                    <div>
                                        <h4 className="font-bold text-[#0F172A]">{step.title}</h4>
                                        <p className="text-sm text-gray-600 mt-1">{step.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
