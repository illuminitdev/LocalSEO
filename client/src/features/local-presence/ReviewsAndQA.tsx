import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Database,
    HelpCircle,
    Layers,
    MessageCircle,
    Save,
    Sparkles,
    Star
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="bg-white border border-dashed border-[#E2E8F0] rounded-2xl p-10 text-center">
            <h3 className="font-bold text-[#0F172A]">{title}</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{body}</p>
        </div>
    );
}

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

export function ReviewManagement() {
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
            <VisibilityFixBanner />
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

interface Question {
    id: number;
    text: string;
    author: string;
    answer: string;
    status: 'pending' | 'drafted' | 'published';
}

export function QAAutoResponder() {
    const [kbText, setKbText] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [isGenerating, setIsGenerating] = useState<number | null>(null);
    const [isSavingKB, setIsSavingKB] = useState(false);
    const [error, setError] = useState('');

    const addQuestion = () => {
        if (!newQuestion.trim()) return;
        setQuestions((prev) => [
            { id: Date.now(), text: newQuestion.trim(), author: 'Customer', answer: '', status: 'pending' },
            ...prev
        ]);
        setNewQuestion('');
    };

    const handleAutoAnswer = async (id: number, text: string) => {
        setIsGenerating(id);
        setError('');
        try {
            const data = await apiPost('/api/ai/qa-answer', { question: text, kb: kbText });
            setQuestions(prev => prev.map(q => q.id === id ? { ...q, answer: data.answer, status: 'drafted' } : q));
        } catch (err: any) {
            setError(err.message || 'Answer failed');
        } finally {
            setIsGenerating(null);
        }
    };

    const handleSaveAnswerDraft = async (id: number) => {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'published' } : q));
        const targetQ = questions.find(q => q.id === id);
        if (!targetQ) return;
        await logDashboardActivity({
            type: 'qa',
            message: `Saved Q&A draft: ${targetQ.text}`,
            icon: 'CheckCircle',
            color: 'text-[#F59E0B]'
        });
    };

    const handleSaveKB = async () => {
        setIsSavingKB(true);
        setError('');
        await logDashboardActivity({
            type: 'knowledge',
            message: 'Saved business knowledge base.',
            icon: 'Activity',
            color: 'text-[#0F172A]'
        });
        setIsSavingKB(false);
    };

    return (
        <div className="max-w-6xl mx-auto pb-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Q&A Auto-Responder</h1>
                <p className="text-gray-500 mt-2">Paste only real facts. Gemini will not invent policies.</p>
            </div>
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5">
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2">
                            <Database className="w-5 h-5 text-[#0F172A]" />
                            <h2 className="font-bold">Business Knowledge Base</h2>
                        </div>
                        <div className="p-5">
                            <textarea
                                value={kbText}
                                onChange={(e) => setKbText(e.target.value)}
                                placeholder="Parking, insurance, hours, cancellation — only facts you confirm."
                                className="w-full h-64 p-4 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl"
                            />
                            <div className="mt-4 flex justify-end">
                                <button onClick={handleSaveKB} disabled={isSavingKB} className="flex items-center gap-2 px-5 py-2.5 border border-[#E2E8F0] rounded-xl font-bold cursor-pointer">
                                    <Save className="w-4 h-4" /> {isSavingKB ? 'Saving...' : 'Save Context'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-7 space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-[#D97706]" /> Questions
                    </h2>
                    <div className="flex gap-2">
                        <input
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            placeholder="Add a real customer question"
                            className="flex-1 px-4 py-2.5 border border-[#E2E8F0] rounded-xl bg-white"
                        />
                        <button onClick={addQuestion} className="px-4 py-2.5 bg-[#0F172A] text-white rounded-xl font-bold cursor-pointer">Add</button>
                    </div>

                    {!questions.length && <EmptyState title="No questions" body="Add a customer question, then generate an answer from your knowledge base." />}

                    {questions.map(q => (
                        <div key={q.id} className="bg-white p-5 rounded-2xl border border-[#E2E8F0]">
                            <p className="font-bold">"{q.text}"</p>
                            {q.status === 'pending' ? (
                                <div className="pt-4 flex justify-end">
                                    <button onClick={() => handleAutoAnswer(q.id, q.text)} disabled={isGenerating === q.id} className="flex items-center gap-2 px-4 py-2 border border-[#F59E0B]/40 rounded-lg font-bold cursor-pointer">
                                        <Sparkles className={`w-4 h-4 ${isGenerating === q.id ? 'animate-spin' : ''}`} />
                                        {isGenerating === q.id ? 'Thinking...' : 'Auto-Answer via KB'}
                                    </button>
                                </div>
                            ) : q.status === 'drafted' ? (
                                <div className="pt-4">
                                    <textarea value={q.answer} onChange={(e) => setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, answer: e.target.value } : item))} className="w-full text-sm border border-[#E2E8F0] p-3 rounded-lg h-24" />
                                    <div className="flex justify-end mt-2">
                                        <button onClick={() => handleSaveAnswerDraft(q.id)} className="px-4 py-2 bg-[#F59E0B] text-white rounded-lg font-bold cursor-pointer flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" /> Save answer draft
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm bg-[#F1F5F9] p-3 rounded-lg">{q.answer}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
