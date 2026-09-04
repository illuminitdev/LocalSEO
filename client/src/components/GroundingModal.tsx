import { useState } from 'react';
import { X, Search, MapPin, Star, Building, CheckCircle2 } from 'lucide-react';
import { apiPost } from '../lib/utils';
import PlacesMap from './PlacesMap';

interface GroundingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function GroundingModal({ isOpen, onClose }: GroundingModalProps) {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const reset = () => {
        setQuery('');
        setResults(null);
        setError('');
        setIsSearching(false);
        setIsConnecting(false);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        setIsSearching(true);
        setError('');
        setResults(null);
        try {
            const data = await apiPost('/api/places/search', { query: query.trim() });
            setResults(data);
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setIsSearching(false);
        }
    };

    const handleConnect = async () => {
        if (!results) return;
        setIsConnecting(true);
        setError('');
        try {
            await apiPost('/api/business/connect', results);
            reset();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Connect failed');
            setIsConnecting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
                    <h2 className="text-lg font-bold text-[#0F172A]">Add a location</h2>
                    <button
                        onClick={() => { reset(); onClose(); }}
                        className="p-2 hover:bg-[#E2E8F0] rounded-full text-gray-500 cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-4">
                    <form onSubmit={handleSearch}>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Business name and city</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <input
                                    className="block w-full pl-10 pr-3 py-2.5 border border-[#E2E8F0] rounded-xl bg-[#F8FAFC]"
                                    placeholder="e.g. Joe's Pizza, Brooklyn"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSearching}
                                className="px-5 py-2.5 bg-[#0F172A] text-white rounded-xl font-bold hover:bg-[#111827] disabled:opacity-70 cursor-pointer"
                            >
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </form>

                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

                    {results && (
                        <div className="border border-[#E2E8F0] rounded-xl p-5 bg-[#F8FAFC]">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-extrabold text-[#0F172A] flex items-center gap-2">
                                        <Building className="w-5 h-5 text-[#0F172A]" />
                                        {results.name}
                                    </h3>
                                    {results.address && (
                                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                            <MapPin className="w-4 h-4" /> {results.address}
                                        </p>
                                    )}
                                    {results.category && <p className="text-xs font-bold text-[#F59E0B] uppercase mt-1">{results.category}</p>}
                                </div>
                                {results.rating != null && (
                                    <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-[#E2E8F0]">
                                        <Star className="w-4 h-4 text-[#D97706] fill-current" />
                                        <span className="font-bold">{results.rating}</span>
                                        {results.reviewsCount ? <span className="text-gray-500 text-sm">({results.reviewsCount})</span> : null}
                                    </div>
                                )}
                            </div>

                            {Array.isArray(results.reviews) && results.reviews.length > 0 && (
                                <div className="space-y-2 mb-4">
                                    <p className="text-xs font-bold text-gray-500 uppercase">Public reviews</p>
                                    {results.reviews.map((r: any, idx: number) => (
                                        <div key={idx} className="bg-white p-3 rounded-lg border border-[#E2E8F0] text-sm text-gray-600">
                                            {typeof r === 'string' ? r : `"${r.text}" — ${r.author || 'Reviewer'}`}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <PlacesMap
                                lat={results.lat}
                                lng={results.lng}
                                title={results.name}
                                className="mb-4"
                            />

                            <button
                                onClick={handleConnect}
                                disabled={isConnecting}
                                className="w-full py-3 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold cursor-pointer disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {isConnecting ? 'Connecting...' : 'Use this listing'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
