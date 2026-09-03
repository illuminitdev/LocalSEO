import { useEffect, useState } from 'react';
import { Star, MessageCircle, Sparkles, Check, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity } from '../lib/utils';
import EmptyState from '../components/EmptyState';

interface Review {
    id: number;
    author: string;
    rating: number;
    date: string;
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    draft?: string;
    status: 'pending' | 'drafted' | 'published';
    isDrafting?: boolean;
}

function sentimentFromRating(rating: number): Review['sentiment'] {
    if (rating >= 4) return 'positive';
    if (rating <= 2) return 'negative';
    return 'neutral';
}

export default function ReviewManagement() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [globalTone, setGlobalTone] = useState('warm');
    const [isDraftingBatch, setIsDraftingBatch] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/business').then((b) => {
            const incoming = Array.isArray(b.reviews) ? b.reviews : [];
            setReviews(incoming.map((r: any, i: number) => ({
                id: i + 1,
                author: r.author || 'Customer',
                rating: Number(r.rating) || 0,
                date: r.date || '',
                text: r.text || (typeof r === 'string' ? r : ''),
                sentiment: sentimentFromRating(Number(r.rating) || 0),
                status: 'pending' as const
            })).filter((r: Review) => r.text));
        }).catch((err) => setError(err.message));
    }, []);

    const fetchDraft = async (review: Review) => {
        const data = await apiPost('/api/ai/review-reply', {
            reviewText: review.text,
            rating: review.rating,
            author: review.author,
            tone: globalTone
        });
        return data.reply;
    };

    const handleDraftSingle = async (id: number) => {
        setError('');
        setReviews(prev => prev.map(r => r.id === id ? { ...r, isDrafting: true } : r));
        const targetReview = reviews.find(r => r.id === id);
        if (!targetReview) return;
        try {
            const response = await fetchDraft(targetReview);
            setReviews(prev => prev.map(r => r.id === id ? { ...r, status: 'drafted', draft: response, isDrafting: false } : r));
        } catch (err: any) {
            setError(err.message || 'Draft failed');
            setReviews(prev => prev.map(r => r.id === id ? { ...r, isDrafting: false } : r));
        }
    };

    const handleSaveReplyDraft = async (id: number) => {
        setReviews(prev => prev.map(r => r.id === id ? { ...r, status: 'published' } : r));
        const targetReview = reviews.find(r => r.id === id);
        if (!targetReview) return;
        await logDashboardActivity({
            type: 'review',
            message: `Saved reply draft for ${targetReview.author}.`,
            icon: 'CheckCircle',
            color: 'text-[#F59E0B]'
        });
    };

    const handleBatchDraft = async () => {
        setIsDraftingBatch(true);
        setError('');
        try {
            const updated = [...reviews];
            for (const r of updated) {
                if (r.status === 'pending') {
                    r.isDrafting = true;
                    setReviews([...updated]);
                    r.draft = await fetchDraft(r);
                    r.status = 'drafted';
                    r.isDrafting = false;
                    setReviews([...updated]);
                }
            }
            await logDashboardActivity({
                type: 'review',
                message: 'Generated replies for pending reviews.',
                icon: 'TrendingUp',
                color: 'text-[#D97706]'
            });
        } catch (err: any) {
            setError(err.message || 'Batch draft failed');
        } finally {
            setIsDraftingBatch(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Reputation Agent</h1>
                    <p className="text-gray-500 mt-2">Replies only to reviews loaded from the connected listing.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <select value={globalTone} onChange={(e) => setGlobalTone(e.target.value)} className="px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-semibold">
                        <option value="warm">Professional & Warm</option>
                        <option value="apologetic">Apologetic & Resolution-Focused</option>
                        <option value="enthusiastic">Enthusiastic</option>
                    </select>
                    <button
                        onClick={handleBatchDraft}
                        disabled={isDraftingBatch || reviews.every(r => r.status !== 'pending')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold disabled:opacity-70 cursor-pointer"
                    >
                        <Layers className="w-4 h-4" />
                        {isDraftingBatch ? 'Drafting All...' : 'Batch Auto-Draft All'}
                    </button>
                </div>
            </div>

            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            {!reviews.length ? (
                <EmptyState title="No reviews yet" body="Ground a live listing first. Only public reviews returned by Gemini will appear here." />
            ) : (
                <div className="space-y-6">
                    {reviews.map(review => (
                        <div key={review.id} className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden flex flex-col md:flex-row">
                            <div className="p-6 md:w-1/2 border-b md:border-b-0 md:border-r border-[#E2E8F0] bg-[#F8FAFC]">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-extrabold text-sm">{review.author}</h3>
                                        <p className="text-xs text-gray-500">{review.date}</p>
                                    </div>
                                    <div className="flex">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-sm italic">"{review.text}"</p>
                                <div className="mt-4">
                                    {review.sentiment === 'positive' && <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Positive</span>}
                                    {review.sentiment === 'negative' && <span className="text-xs font-bold text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Negative</span>}
                                    {review.sentiment === 'neutral' && <span className="text-xs font-bold text-gray-600">Neutral</span>}
                                </div>
                            </div>
                            <div className="p-6 md:w-1/2 flex flex-col min-h-[180px]">
                                {review.status === 'pending' ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                                        <MessageCircle className="w-6 h-6 text-[#F59E0B] mb-3" />
                                        <button onClick={() => handleDraftSingle(review.id)} disabled={review.isDrafting} className="flex items-center gap-2 px-4 py-2 border border-[#F59E0B]/40 rounded-lg font-bold cursor-pointer">
                                            <Sparkles className={`w-4 h-4 ${review.isDrafting ? 'animate-spin' : ''}`} />
                                            {review.isDrafting ? 'Drafting...' : 'Draft AI Reply'}
                                        </button>
                                    </div>
                                ) : review.status === 'drafted' ? (
                                    <>
                                        <textarea value={review.draft} onChange={(e) => setReviews(prev => prev.map(r => r.id === review.id ? { ...r, draft: e.target.value } : r))} className="flex-1 w-full p-3 text-sm border border-[#E2E8F0] rounded-lg min-h-[100px]" />
                                        <div className="mt-4 flex gap-3">
                                            <button onClick={() => handleSaveReplyDraft(review.id)} className="flex-1 py-2 bg-[#F59E0B] text-white rounded-lg font-bold cursor-pointer flex justify-center items-center gap-2">
                                                <Check className="w-4 h-4" /> Save reply draft
                                            </button>
                                            <button onClick={() => handleDraftSingle(review.id)} className="px-4 py-2 border border-[#E2E8F0] rounded-lg font-bold cursor-pointer">Regenerate</button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm bg-[#F1F5F9] p-4 rounded-xl">{review.draft}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
