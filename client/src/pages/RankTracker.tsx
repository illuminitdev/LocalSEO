import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Crosshair, Users, Activity, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { apiPost, logDashboardActivity } from '../lib/utils';

export default function RankTracker() {
    const navigate = useNavigate();
    const [isGeneratingGap, setIsGeneratingGap] = useState(false);
    const [gapAnalysis, setGapAnalysis] = useState<string | null>(null);
    const [gridData, setGridData] = useState<number[][]>([]);
    const [keyword, setKeyword] = useState('');
    const [competitors, setCompetitors] = useState<any[]>([]);
    const [error, setError] = useState('');

    const getColor = (rank: number) => {
        if (rank <= 3) return 'bg-[#F59E0B] text-white'; // Green
        if (rank <= 5) return 'bg-[#D97706] text-white'; // Amber
        return 'bg-red-500 text-white'; // Red
    };

    const handleGenerateGap = async () => {
        setIsGeneratingGap(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/gap-analysis', { keyword });
            setGapAnalysis(data.gapAnalysis || '');
            if (Array.isArray(data.grid)) setGridData(data.grid);
            if (Array.isArray(data.competitors)) setCompetitors(data.competitors);
            await logDashboardActivity({
                type: 'rank',
                message: `GeoGrid analysis for "${keyword}".`,
                icon: 'TrendingUp',
                color: 'text-[#D97706]'
            });
        } catch (err: any) {
            setError(err.message || 'Gap analysis failed');
        } finally {
            setIsGeneratingGap(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Local Search Grid</h1>
                    <p className="text-gray-500 mt-2">Neighborhood-level Local Pack ranks for a keyword — BrightLocal-style geo grid.</p>
                </div>
                <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold w-full md:w-72"
                    placeholder="e.g. plumber near me"
                />
            </div>
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* GeoGrid Heatmap */}
                <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Map className="w-5 h-5 text-[#0F172A]" /> Keyword: {keyword || 'not set'}
                        </h2>
                        <div className="flex gap-2 text-xs font-semibold">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-[#F59E0B] rounded-sm"></div> 1-3</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-[#D97706] rounded-sm"></div> 4-5</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> 11+</span>
                        </div>
                    </div>

                    <div className="relative aspect-square w-full max-w-sm mx-auto bg-[#F1F5F9] rounded-xl overflow-hidden border border-[#E2E8F0] p-4">
                        {gridData.length ? (
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-2 p-8">
                            {gridData.map((row, rIdx) => (
                                row.map((rank, cIdx) => (
                                    <div key={`${rIdx}-${cIdx}`} className="relative flex items-center justify-center">
                                        <div className={`w-12 h-12 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-bold text-lg z-10 ${getColor(rank)}`}>
                                            {rank}
                                        </div>
                                    </div>
                                ))
                            ))}
                        </div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 px-6 text-center">Run gap analysis to fill the 3×3 grid.</div>
                        )}
                    </div>
                    <p className="text-center text-sm text-gray-500 mt-4 font-semibold"><Crosshair className="w-4 h-4 inline mr-1 text-[#F59E0B]" /> Radius: 2 miles</p>
                </div>

                {/* Competitor Gap Analysis */}
                <div className="bg-[#F8FAFC] p-6 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
                        <Activity className="w-5 h-5 text-[#D97706]" /> AI Gap Analysis
                    </h2>
                    <p className="text-sm text-gray-500 mb-6 font-semibold animate-in">Let Agent analyze your ranking gaps and prescribe a strategy.</p>

                    {!gapAnalysis ? (
                        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-[#E2E8F0] rounded-xl bg-white p-8">
                            <button
                                onClick={handleGenerateGap}
                                disabled={isGeneratingGap}
                                className="flex items-center gap-2 px-6 py-3 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                            >
                                <Sparkles className={`w-5 h-5 ${isGeneratingGap ? 'animate-spin' : ''}`} />
                                {isGeneratingGap ? 'Analyzing Ecosystem...' : 'Generate Gap Analysis'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 bg-white p-6 rounded-xl border border-[#F59E0B]/30 shadow-sm animate-in zoom-in duration-300">
                            <h3 className="text-[#0F172A] font-bold mb-3 flex items-center gap-2">
                                <Sparkles className="w-5 h-5" /> Executive Insight
                            </h3>
                            <p className="text-gray-700 leading-relaxed text-sm mb-4">
                                {gapAnalysis}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => navigate('/posts')}
                                    className="px-4 py-2 bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-bold rounded-lg cursor-pointer"
                                >
                                    Draft Required Post
                                </button>
                                <button onClick={() => setGapAnalysis(null)} className="px-4 py-2 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-sm font-bold rounded-lg cursor-pointer">Reset</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Competitor Intel Table */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                <div className="p-5 border-b border-[#E2E8F0] flex items-center gap-2 bg-[#F8FAFC]">
                    <Users className="w-5 h-5 text-[#0F172A]" />
                    <h2 className="font-semibold text-[#0F172A]">Competitor Intelligence</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#F8FAFC] text-gray-500 border-b border-[#E2E8F0]">
                            <tr>
                                <th className="px-6 py-4 font-bold">Business Name</th>
                                <th className="px-6 py-4 font-bold">Rating</th>
                                <th className="px-6 py-4 font-bold">Review Vol</th>
                                <th className="px-6 py-4 font-bold">Posts / Wk</th>
                                <th className="px-6 py-4 font-bold">Total Photos</th>
                                <th className="px-6 py-4 font-bold">Momentum</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                            {competitors.length ? competitors.map((comp, idx) => (
                                <tr key={idx} className={idx === 0 ? "bg-[#F1F5F9]/50 font-bold" : ""}>
                                    <td className="px-6 py-4 whitespace-nowrap text-[#0F172A]">
                                        {comp.name} {idx === 0 && <span className="ml-2 text-xs bg-[#F59E0B] text-white px-2 py-0.5 rounded font-bold">You</span>}
                                    </td>
                                    <td className="px-6 py-4 font-black text-[#D97706]">{comp.rating}</td>
                                    <td className="px-6 py-4 text-gray-600 font-semibold">{comp.reviews}</td>
                                    <td className="px-6 py-4 text-gray-600 font-semibold">{comp.posts}</td>
                                    <td className="px-6 py-4 text-gray-600 font-semibold">{comp.photos}</td>
                                    <td className="px-6 py-4">
                                        {comp.trend === 'up' ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-gray-400 text-center">No competitor data until you run analysis.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
