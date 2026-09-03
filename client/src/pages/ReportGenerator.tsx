import { useState } from 'react';
import { FileText, Download, BarChart3 } from 'lucide-react';
import { apiGet, apiPost } from '../lib/utils';

export default function ReportGenerator() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [reportReady, setReportReady] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const [error, setError] = useState('');
    const [businessName, setBusinessName] = useState('');

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError('');
        try {
            const business = await apiGet('/api/business');
            if (!business?.name?.trim()) {
                throw new Error('Save your business profile first (required fields on Business profile page).');
            }

            const stats = await apiGet('/api/dashboard/stats');
            setBusinessName(stats.businessName || business.name || '');
            const data = await apiPost('/api/ai/strategy-report', stats);
            setReportData(data);
            setReportReady(true);
            await apiPost('/api/dashboard/activity', {
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

    const handleExport = () => {
        window.print();
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">AI Insights</h1>
                    <p className="text-gray-500 mt-2">Turn rankings, listings, and reviews into a prioritized 30-day action plan.</p>
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
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            {!reportReady && !isGenerating && (
                <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center shadow-sm flex flex-col items-center justify-center">
                    <BarChart3 className="w-16 h-16 text-gray-300 mb-4" />
                    <h2 className="text-xl font-bold text-[#0F172A] mb-2">No Recent Reports</h2>
                    <p className="text-gray-500 max-w-sm">Click the generate button above to compile your latest local SEO metrics, competitive insights, and 30-day roadmap.</p>
                </div>
            )}

            {isGenerating && (
                <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center shadow-sm">
                    <div className="w-16 h-16 border-4 border-[#F1F5F9] border-t-[#F59E0B] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 font-bold">Aggregating LocalPulse Data...</p>
                </div>
            )}

            {reportReady && reportData && (
                <div id="report-content" className="bg-white p-8 md:p-12 rounded-2xl border border-[#E2E8F0] shadow-lg animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-start mb-10 pb-6 border-b border-[#E2E8F0]">
                        <div>
                            <h2 className="text-2xl font-black text-[#0F172A] uppercase tracking-tight">Local SEO Audit Report</h2>
                            <p className="text-gray-500 mt-1 font-semibold">{businessName || 'No listing'} • {new Date().toLocaleDateString()}</p>
                        </div>
                        <button
                            onClick={handleExport}
                            className="print:hidden flex items-center gap-2 px-4 py-2 bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#0F172A] font-bold rounded-lg transition-colors cursor-pointer"
                        >
                            <Download className="w-4 h-4" /> Export PDF
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                        <div className="col-span-1 bg-[#F1F5F9] p-6 rounded-xl flex flex-col items-center justify-center text-center">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Overall Grade</span>
                            <div className="text-6xl font-black text-[#0F172A] mb-2">{reportData.grade}</div>
                            <p className="text-xs text-[#0F172A] font-bold bg-[#F59E0B]/10 px-3 py-1 rounded-full border border-[#F59E0B]/20">Gemini report</p>
                        </div>

                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Local Pack Rank</div>
                                <div className="text-2xl font-bold flex items-center gap-2 text-[#0F172A]">{reportData.metrics?.localPackRank ?? '—'}</div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Profile Completeness</div>
                                <div className="text-2xl font-bold text-[#0F172A]">{reportData.metrics?.completeness ?? 0}%</div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Review Response Rate</div>
                                <div className="text-2xl font-bold flex items-center gap-2 text-[#0F172A]">{reportData.metrics?.reviewResponseRate ?? 0}%</div>
                            </div>
                            <div className="border border-[#E2E8F0] rounded-xl p-4">
                                <div className="text-xs font-semibold text-gray-500 mb-1">Missing Media</div>
                                <div className="text-2xl font-bold flex items-center gap-2 text-[#0F172A]">{reportData.metrics?.missingMedia ?? '—'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mb-10">
                        <h3 className="text-lg font-bold text-[#0F172A] border-b-2 border-[#F59E0B] pb-2 mb-4 inline-block">Competitor Positioning</h3>
                        <p className="text-gray-700 leading-relaxed text-sm">
                            {reportData.positioningText}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-[#0F172A] border-b-2 border-[#D97706] pb-2 mb-4 inline-block">30-Day AI Roadmap</h3>
                        <ul className="space-y-4">
                            {reportData.roadmap.map((step: any) => (
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
