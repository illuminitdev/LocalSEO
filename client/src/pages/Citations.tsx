import { useState } from 'react';
import { BookMarked, Sparkles, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { apiPost } from '../lib/utils';

export default function Citations() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<any>(null);

    const runAudit = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/citations', {});
            setResult(data);
            await apiPost('/api/dashboard/activity', {
                type: 'citations',
                message: `Citation audit complete. ${data.found || 0} found, ${data.missing || 0} missing.`,
                icon: 'Activity',
                color: 'text-[#12333C]'
            });
        } catch (err: any) {
            setError(err.message || 'Citation audit failed');
        } finally {
            setLoading(false);
        }
    };

    const statusIcon = (status: string) => {
        if (status === 'found') return <CheckCircle2 className="w-4 h-4 text-green-600" />;
        if (status === 'mismatch') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
        return <MinusCircle className="w-4 h-4 text-red-500" />;
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#5B6770]">Manage listings</p>
                    <h1 className="text-3xl font-black tracking-tight mt-1">Citation tracker</h1>
                    <p className="text-[#5B6770] mt-2 text-sm max-w-xl">
                        BrightLocal-style citation check: Gemini searches public directories for your connected NAP. It will not invent listings.
                    </p>
                </div>
                <button
                    onClick={runAudit}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#12333C] hover:bg-[#0C242B] text-white rounded-lg font-bold cursor-pointer disabled:opacity-70"
                >
                    <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Scanning directories...' : 'Run citation audit'}
                </button>
            </div>

            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            {!result && !loading && (
                <div className="bg-white border border-[#E3E8EA] rounded-2xl p-12 text-center">
                    <BookMarked className="w-12 h-12 text-[#C8D400] mx-auto mb-3" />
                    <p className="font-semibold">No citation scan yet</p>
                    <p className="text-sm text-[#5B6770] mt-1">Add a location, then scan Google, Yelp, Apple Maps, Bing, and more.</p>
                </div>
            )}

            {result && (
                <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white border border-[#E3E8EA] rounded-2xl p-4">
                            <p className="text-xs text-[#5B6770] font-semibold">Citation score</p>
                            <p className="text-3xl font-black text-[#12333C]">{result.score ?? 0}</p>
                        </div>
                        <div className="bg-white border border-[#E3E8EA] rounded-2xl p-4">
                            <p className="text-xs text-[#5B6770] font-semibold">Found</p>
                            <p className="text-3xl font-black text-green-700">{result.found ?? 0}</p>
                        </div>
                        <div className="bg-white border border-[#E3E8EA] rounded-2xl p-4">
                            <p className="text-xs text-[#5B6770] font-semibold">Missing</p>
                            <p className="text-3xl font-black text-red-600">{result.missing ?? 0}</p>
                        </div>
                    </div>

                    <div className="bg-white border border-[#E3E8EA] rounded-2xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-[#F5F7F8] text-[#5B6770]">
                                <tr>
                                    <th className="text-left px-5 py-3 font-bold">Directory</th>
                                    <th className="text-left px-5 py-3 font-bold">Status</th>
                                    <th className="text-left px-5 py-3 font-bold">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E3E8EA]">
                                {result.citations.map((row: any, i: number) => (
                                    <tr key={i}>
                                        <td className="px-5 py-3 font-semibold">
                                            {row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="text-[#12333C] underline">{row.directory}</a> : row.directory}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="inline-flex items-center gap-1.5 capitalize">{statusIcon(row.status)} {row.status}</span>
                                        </td>
                                        <td className="px-5 py-3 text-[#5B6770]">{row.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
