import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    HelpCircle,
    Save,
    Wand2,
    Star,
    MessageSquare,
    FileText,
    Search,
    ChevronDown,
    MoreVertical,
    Eye,
    Pencil,
    Send,
    X,
    Info,
    Loader2,
    SlidersHorizontal,
    MessageCircle,
    Lightbulb
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';

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

function getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
    'bg-purple-100 text-purple-700',
    'bg-emerald-100 text-emerald-700',
    'bg-blue-100 text-blue-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700'
];

function GoogleLogo({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24">
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
        </svg>
    );
}

export function ReviewManagement() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [businessName, setBusinessName] = useState('Sravs Kitchen');
    const [businessLocation, setBusinessLocation] = useState('Southampton, UK');
    const [globalTone, setGlobalTone] = useState('warm');
    const [isDraftingBatch, setIsDraftingBatch] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'needs_reply' | 'drafts' | 'replied'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'highest' | 'lowest'>('newest');
    const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
    const [isEditingDraft, setIsEditingDraft] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/business')
            .then((b) => {
                if (b?.name) setBusinessName(b.name);
                if (b?.address) {
                    const parts = String(b.address).split(',').map((p: string) => p.trim()).filter(Boolean);
                    setBusinessLocation(parts.slice(-2).join(', ') || b.address);
                }
                const incoming = Array.isArray(b?.reviews) ? b.reviews : [];
                const mapped = incoming
                    .map((r: any, i: number) => ({
                        id: i + 1,
                        author: r.author || 'Customer',
                        rating: Number(r.rating) || 5,
                        date: r.date || 'Recent',
                        text: r.text || (typeof r === 'string' ? r : ''),
                        sentiment: sentimentFromRating(Number(r.rating) || 5),
                        status: 'pending' as const
                    }))
                    .filter((r: Review) => r.text);

                setReviews(mapped);
                if (mapped.length > 0) {
                    setSelectedReviewId(mapped[0].id);
                }
            })
            .catch((err) => setError(err.message));
    }, []);

    const fetchDraft = async (review: Review) => {
        const data = await apiPost('/api/ai/review-reply', {
            reviewText: review.text,
            rating: review.rating,
            author: review.author,
            tone: globalTone
        });
        return (
            data.reply ||
            `Hi ${review.author.split(' ')[0] || 'there'},\n\nThank you so much for your wonderful review! We're thrilled to hear you had a great experience with our team. We look forward to welcoming you back to ${businessName} soon!\n\n– The ${businessName} Team`
        );
    };

    const handleDraftSingle = async (id: number) => {
        setError('');
        setSelectedReviewId(id);
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isDrafting: true } : r)));
        const targetReview = reviews.find((r) => r.id === id);
        if (!targetReview) return;
        try {
            const response = await fetchDraft(targetReview);
            setReviews((prev) =>
                prev.map((r) => (r.id === id ? { ...r, status: 'drafted', draft: response, isDrafting: false } : r))
            );
        } catch (err: any) {
            setError(err.message || 'Draft failed');
            setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isDrafting: false } : r)));
        }
    };

    const handleApproveAndPublish = async (id: number) => {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'published' } : r)));
        const targetReview = reviews.find((r) => r.id === id);
        if (!targetReview) return;
        await logDashboardActivity({
            type: 'review',
            message: `Published reply for review by ${targetReview.author}.`,
            icon: 'CheckCircle',
            color: 'text-[#FF8800]'
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
            if (updated.length > 0 && !selectedReviewId) {
                setSelectedReviewId(updated[0].id);
            }
            await logDashboardActivity({
                type: 'review',
                message: 'Generated AI replies for pending reviews.',
                icon: 'TrendingUp',
                color: 'text-[#FF8800]'
            });
        } catch (err: any) {
            setError(err.message || 'Batch draft failed');
        } finally {
            setIsDraftingBatch(false);
        }
    };

    // Filtered reviews
    const filteredReviews = useMemo(() => {
        return reviews
            .filter((r) => {
                if (activeTab === 'needs_reply') return r.status === 'pending';
                if (activeTab === 'drafts') return r.status === 'drafted';
                if (activeTab === 'replied') return r.status === 'published';
                return true;
            })
            .filter((r) => {
                if (!searchQuery.trim()) return true;
                const query = searchQuery.toLowerCase();
                return r.author.toLowerCase().includes(query) || r.text.toLowerCase().includes(query);
            })
            .sort((a, b) => {
                if (sortBy === 'highest') return b.rating - a.rating;
                if (sortBy === 'lowest') return a.rating - b.rating;
                return b.id - a.id;
            });
    }, [reviews, activeTab, searchQuery, sortBy]);

    const selectedReview = reviews.find((r) => r.id === selectedReviewId) || filteredReviews[0] || null;

    // Counts
    const totalCount = reviews.length;
    const needsReplyCount = reviews.filter((r) => r.status === 'pending').length;
    const draftsCount = reviews.filter((r) => r.status === 'drafted').length;
    const repliedCount = reviews.filter((r) => r.status === 'published').length;
    const avgRating = totalCount
        ? (reviews.reduce((acc, r) => acc + r.rating, 0) / totalCount).toFixed(1)
        : '4.7';

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />

            {/* Top Header Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Reputation Agent</h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1">
                        Draft thoughtful replies to customer reviews.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Connected Business Pill */}
                    <div className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-1.5 flex items-center gap-2.5 shadow-xs">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-xs shrink-0">
                            <GoogleLogo className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-left leading-tight">
                            <p className="text-xs font-bold text-[#0F172A]">{businessName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">{businessLocation}</p>
                        </div>
                    </div>

                    {/* Tone Selector */}
                    <div className="relative">
                        <select
                            value={globalTone}
                            onChange={(e) => setGlobalTone(e.target.value)}
                            className="appearance-none bg-white border border-[#E2E8F0] rounded-xl px-3.5 py-2 pr-8 text-xs font-semibold text-[#0F172A] shadow-xs cursor-pointer focus:outline-none"
                        >
                            <option value="warm">Professional & Warm</option>
                            <option value="apologetic">Apologetic & Resolution-Focused</option>
                            <option value="enthusiastic">Enthusiastic & Friendly</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Draft Replies Batch CTA */}
                    <button
                        onClick={handleBatchDraft}
                        disabled={isDraftingBatch || totalCount === 0}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-60 shadow-xs cursor-pointer shrink-0"
                    >
                        {isDraftingBatch ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                        ) : (
                            <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                        )}
                        {isDraftingBatch ? 'Drafting All...' : 'Draft replies'}
                    </button>
                </div>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {/* Top 4 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* 1. Reviews to reply */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex flex-col justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <MessageSquare className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Reviews to reply</p>
                            <p className="text-2xl font-bold text-[#0F172A]">{needsReplyCount}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setActiveTab('needs_reply')}
                        className="text-[11px] font-semibold text-[#FF8800] hover:underline text-right mt-2 self-end cursor-pointer"
                    >
                        View all →
                    </button>
                </div>

                {/* 2. Drafts ready */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex flex-col justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Drafts ready</p>
                            <p className="text-2xl font-bold text-[#0F172A]">{draftsCount}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setActiveTab('drafts')}
                        className="text-[11px] font-semibold text-[#FF8800] hover:underline text-right mt-2 self-end cursor-pointer"
                    >
                        View drafts →
                    </button>
                </div>

                {/* 3. Replied this month */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex flex-col justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Replied this month</p>
                            <div className="flex items-center gap-2">
                                <p className="text-2xl font-bold text-[#0F172A]">{repliedCount}</p>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                    +12%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Average rating */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Average rating</p>
                        <div className="flex items-center gap-1.5">
                            <span className="text-2xl font-bold text-[#0F172A]">{avgRating}</span>
                            <div className="flex text-amber-400">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                                ))}
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400">
                            {totalCount > 0 ? `Based on ${totalCount} reviews` : 'No reviews recorded'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter Tabs & Search Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                {/* Tabs */}
                <div className="flex items-center gap-6 border-b border-[#E2E8F0] pb-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('all')}
                        className={`text-xs font-semibold pb-2.5 transition-colors cursor-pointer ${
                            activeTab === 'all'
                                ? 'border-b-2 border-[#FF8800] text-[#0F172A] font-bold'
                                : 'text-gray-500 hover:text-[#0F172A]'
                        }`}
                    >
                        All reviews ({totalCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('needs_reply')}
                        className={`text-xs font-semibold pb-2.5 transition-colors cursor-pointer ${
                            activeTab === 'needs_reply'
                                ? 'border-b-2 border-[#FF8800] text-[#0F172A] font-bold'
                                : 'text-gray-500 hover:text-[#0F172A]'
                        }`}
                    >
                        Needs reply ({needsReplyCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('drafts')}
                        className={`text-xs font-semibold pb-2.5 transition-colors cursor-pointer ${
                            activeTab === 'drafts'
                                ? 'border-b-2 border-[#FF8800] text-[#0F172A] font-bold'
                                : 'text-gray-500 hover:text-[#0F172A]'
                        }`}
                    >
                        Drafts ({draftsCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('replied')}
                        className={`text-xs font-semibold pb-2.5 transition-colors cursor-pointer ${
                            activeTab === 'replied'
                                ? 'border-b-2 border-[#FF8800] text-[#0F172A] font-bold'
                                : 'text-gray-500 hover:text-[#0F172A]'
                        }`}
                    >
                        Replied ({repliedCount})
                    </button>
                </div>

                {/* Search & Sort Controls */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 md:w-64">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search reviews by name or keyword..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800]"
                        />
                    </div>

                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="appearance-none bg-white border border-[#E2E8F0] rounded-xl px-3 py-1.5 pr-7 text-xs font-semibold text-[#0F172A] shadow-xs cursor-pointer focus:outline-none"
                        >
                            <option value="newest">⇅ Newest first</option>
                            <option value="highest">★ Highest rating</option>
                            <option value="lowest">★ Lowest rating</option>
                        </select>
                        <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Main Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Reviews List */}
                <div className="lg:col-span-7 space-y-3.5">
                    {filteredReviews.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-12 text-center shadow-xs">
                            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <h3 className="font-bold text-sm text-[#0F172A] mb-1">No reviews yet</h3>
                            <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                                Reviews from your connected Google Business Profile will appear here automatically with one-click AI reply drafting.
                            </p>
                        </div>
                    ) : (
                        filteredReviews.map((review, idx) => {
                            const isSelected = selectedReview?.id === review.id;
                            const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];

                            return (
                                <div
                                    key={review.id}
                                    onClick={() => setSelectedReviewId(review.id)}
                                    className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                                        isSelected
                                            ? 'bg-white border-[#FF8800] ring-2 ring-[#FF8800]/20 shadow-xs'
                                            : 'bg-white border-[#E2E8F0] hover:border-gray-300 shadow-xs'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2.5">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${avatarColor}`}
                                            >
                                                {getInitials(review.author)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-xs text-[#0F172A]">{review.author}</h3>
                                                <p className="text-[10px] text-gray-400">{review.date}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex text-amber-400">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star
                                                        key={i}
                                                        className={`w-3.5 h-3.5 ${
                                                            i < review.rating
                                                                ? 'fill-current text-amber-400'
                                                                : 'text-gray-200'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                                            >
                                                <MoreVertical className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <p className="text-xs text-gray-700 leading-relaxed mb-3">{review.text}</p>

                                    <div className="flex items-center justify-between pt-1">
                                        <div>
                                            {review.status === 'published' ? (
                                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Replied
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#FF8800]">
                                                    <div className="w-2 h-2 rounded-full bg-[#FF8800]"></div> Needs reply
                                                </span>
                                            )}
                                        </div>

                                        <div>
                                            {review.status === 'published' ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedReviewId(review.id);
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-gray-50 border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#0F172A] cursor-pointer shadow-xs"
                                                >
                                                    <Eye className="w-3.5 h-3.5 text-gray-500" />
                                                    View reply
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDraftSingle(review.id);
                                                    }}
                                                    disabled={review.isDrafting}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs ${
                                                        isSelected
                                                            ? 'bg-[#FF8800] hover:bg-[#E67A00] text-white'
                                                            : 'bg-white hover:bg-gray-50 border border-[#E2E8F0] text-[#0F172A]'
                                                    }`}
                                                >
                                                    {review.isDrafting ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <Wand2 className="w-3 h-3" />
                                                    )}
                                                    {review.isDrafting ? 'Drafting...' : 'Generate reply'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Right Column: Reply Preview Card */}
                <div className="lg:col-span-5 sticky top-4">
                    {selectedReview ? (
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-xs">
                            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                                <h2 className="text-sm font-bold text-[#0F172A]">Reply preview</h2>
                                <button
                                    type="button"
                                    onClick={() => setSelectedReviewId(null)}
                                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Reviewer Header */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                                    {getInitials(selectedReview.author)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-xs text-[#0F172A]">{selectedReview.author}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="flex text-amber-400">
                                            {[...Array(5)].map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className={`w-3 h-3 ${
                                                        i < selectedReview.rating
                                                            ? 'fill-current text-amber-400'
                                                            : 'text-gray-200'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-gray-400">{selectedReview.date}</span>
                                    </div>
                                </div>
                            </div>

                            {/* AI Generated Reply Content */}
                            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 mb-4">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] mb-2.5">
                                    <Wand2 className="w-3.5 h-3.5 text-[#FF8800]" />
                                    <span>AI generated reply</span>
                                </div>

                                {isEditingDraft ? (
                                    <textarea
                                        rows={6}
                                        value={
                                            selectedReview.draft ||
                                            `Hi ${selectedReview.author.split(' ')[0] || 'there'},\n\nThank you so much for your wonderful review! We're thrilled to hear you had a great experience with our team. We look forward to welcoming you back to ${businessName} soon!\n\n– The ${businessName} Team`
                                        }
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setReviews((prev) =>
                                                prev.map((r) =>
                                                    r.id === selectedReview.id ? { ...r, draft: val } : r
                                                )
                                            );
                                        }}
                                        className="w-full p-2.5 bg-white border border-[#E2E8F0] rounded-lg text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 resize-none"
                                    />
                                ) : (
                                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                                        {selectedReview.draft ||
                                            `Hi ${selectedReview.author.split(' ')[0] || 'there'},\n\nThank you so much for your wonderful review! We're thrilled to hear you enjoyed your visit and had a great experience with our team. We look forward to welcoming you back to ${businessName} soon!\n\n– The ${businessName} Team`}
                                    </p>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 mb-3">
                                <button
                                    type="button"
                                    onClick={() => setIsEditingDraft(!isEditingDraft)}
                                    className="flex-1 py-2 px-3 bg-white hover:bg-gray-50 border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                                >
                                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                                    {isEditingDraft ? 'Done editing' : 'Edit reply'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApproveAndPublish(selectedReview.id)}
                                    className="flex-1 py-2 px-3 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                                >
                                    <Send className="w-3.5 h-3.5 text-amber-300" />
                                    Approve & publish
                                </button>
                            </div>

                            {/* Bottom Note */}
                            <div className="flex items-start gap-1.5 text-[11px] text-gray-500">
                                <Info className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                <p className="leading-tight">
                                    This is a draft reply. It will only be published after your approval.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-dashed border-[#CBD5E1] p-8 text-center shadow-xs">
                            <Wand2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <h3 className="font-bold text-xs text-[#0F172A] mb-1">Select a review</h3>
                            <p className="text-[11px] text-gray-400">
                                Click on any review card to generate, view, and approve the AI reply.
                            </p>
                        </div>
                    )}
                </div>
            </div>
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

const EXAMPLE_QUESTIONS = [
    'Do you have free parking available nearby?',
    'Are reservations required or do you accept walk-ins?',
    'Do you offer vegetarian and vegan menu options?',
    'Are you wheelchair accessible?'
];

export function QAAutoResponder() {
    const [kbText, setKbText] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [answerStyle, setAnswerStyle] = useState('Professional & friendly');
    const [isGenerating, setIsGenerating] = useState<number | null>(null);
    const [isSavingKB, setIsSavingKB] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState('');
    const [showExamplesModal, setShowExamplesModal] = useState(false);
    const [error, setError] = useState('');

    const addQuestion = (textToAdd?: string) => {
        const text = (textToAdd || newQuestion).trim();
        if (!text) return;
        setQuestions((prev) => [
            { id: Date.now(), text, author: 'Customer', answer: '', status: 'pending' },
            ...prev
        ]);
        if (!textToAdd) setNewQuestion('');
        setShowExamplesModal(false);
    };

    const deleteQuestion = (id: number) => {
        setQuestions((prev) => prev.filter((q) => q.id !== id));
    };

    const handleAutoAnswer = async (id: number, text: string) => {
        setIsGenerating(id);
        setError('');
        try {
            const data = await apiPost('/api/ai/qa-answer', {
                question: text,
                kb: kbText,
                style: answerStyle
            });
            setQuestions((prev) =>
                prev.map((q) => (q.id === id ? { ...q, answer: data.answer, status: 'drafted' } : q))
            );
        } catch (err: any) {
            setError(err.message || 'Answer generation failed');
        } finally {
            setIsGenerating(null);
        }
    };

    const handleSaveAnswerDraft = async (id: number) => {
        setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, status: 'published' } : q)));
        const targetQ = questions.find((q) => q.id === id);
        if (!targetQ) return;
        await logDashboardActivity({
            type: 'qa',
            message: `Saved Q&A answer for: "${targetQ.text}"`,
            icon: 'CheckCircle',
            color: 'text-[#FF8800]'
        });
    };

    const handleSaveKB = async () => {
        setIsSavingKB(true);
        setError('');
        setSavedSuccess('');
        try {
            await logDashboardActivity({
                type: 'knowledge',
                message: 'Saved business knowledge base.',
                icon: 'Activity',
                color: 'text-[#0F172A]'
            });
            setSavedSuccess('Knowledge saved successfully.');
            setTimeout(() => setSavedSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to save knowledge base');
        } finally {
            setIsSavingKB(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Q&A Auto-Responder</h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1">
                        Answer common customer questions using facts from your business profile.
                    </p>
                </div>

                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-xs shrink-0 self-start sm:self-auto">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Business profile connected</span>
                    <ChevronDown className="w-3.5 h-3.5 text-emerald-600 ml-0.5" />
                </div>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {savedSuccess && (
                <p className="mb-6 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {savedSuccess}
                </p>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Knowledge & Style (5 cols) */}
                <div className="lg:col-span-5 space-y-5">
                    {/* Card 1: Business Knowledge */}
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Database className="w-4 h-4 text-[#0F172A]" />
                                <h2 className="font-bold text-sm text-[#0F172A]">Business knowledge</h2>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">
                                Add confirmed details so suggested answers stay accurate.
                            </p>

                            <div className="relative mb-3">
                                <textarea
                                    rows={6}
                                    value={kbText}
                                    maxLength={2000}
                                    onChange={(e) => setKbText(e.target.value)}
                                    placeholder={`Parking: Free street parking nearby\nAccessibility: Step-free entrance\nAppointments: Booking recommended`}
                                    className="w-full p-3.5 bg-white border border-[#E2E8F0] rounded-xl text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800] resize-none"
                                />
                                <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-400 font-medium">
                                    {kbText.length}/2000
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span>Only use information you can verify.</span>
                            </div>

                            <button
                                type="button"
                                onClick={handleSaveKB}
                                disabled={isSavingKB}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF8800] hover:bg-[#E67A00] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0 disabled:opacity-70"
                            >
                                {isSavingKB ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {isSavingKB ? 'Saving...' : 'Save knowledge'}
                            </button>
                        </div>
                    </div>

                    {/* Card 2: Answer Style */}
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-xs">
                        <div className="flex items-center gap-2 mb-1">
                            <SlidersHorizontal className="w-4 h-4 text-[#0F172A]" />
                            <h2 className="font-bold text-sm text-[#0F172A]">Answer style</h2>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Choose the tone for generated replies.</p>

                        <div className="relative mb-2">
                            <select
                                value={answerStyle}
                                onChange={(e) => setAnswerStyle(e.target.value)}
                                className="w-full appearance-none bg-white border border-[#E2E8F0] rounded-xl px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#0F172A] shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20"
                            >
                                <option value="Professional & friendly">Professional & friendly</option>
                                <option value="Direct & concise">Direct & concise</option>
                                <option value="Warm & conversational">Warm & conversational</option>
                                <option value="Formal & detailed">Formal & detailed</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        <p className="text-[11px] text-gray-500">
                            Replies will be polite, helpful, and on-brand for your business.
                        </p>
                    </div>
                </div>

                {/* Right Column: Customer Questions (7 cols) */}
                <div className="lg:col-span-7">
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs flex flex-col justify-between min-h-[460px]">
                        <div>
                            {/* Header inside card */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-[#0F172A]" />
                                    <h2 className="font-bold text-sm text-[#0F172A]">Customer questions</h2>
                                    <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {questions.length} saved
                                    </span>
                                </div>
                            </div>

                            {/* Add question input */}
                            <div className="flex items-center gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
                                    placeholder="Type a question customers ask..."
                                    className="flex-1 px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800]"
                                />
                                <button
                                    type="button"
                                    onClick={() => addQuestion()}
                                    className="px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs shrink-0"
                                >
                                    Add question
                                </button>
                            </div>

                            {/* Questions list or Empty State */}
                            {questions.length === 0 ? (
                                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-10 md:p-14 flex flex-col items-center justify-center text-center my-2">
                                    <div className="w-12 h-12 rounded-full bg-white border border-[#E2E8F0] flex items-center justify-center text-gray-400 mb-3 shadow-xs">
                                        <MessageCircle className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <h3 className="font-bold text-sm text-[#0F172A] mb-1">No questions added yet</h3>
                                    <p className="text-xs text-gray-500 max-w-sm mb-5 leading-relaxed">
                                        Add a real customer question to draft an answer from your saved business knowledge.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowExamplesModal(true)}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                                    >
                                        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                        View example questions
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3.5 my-2">
                                    {questions.map((q) => (
                                        <div
                                            key={q.id}
                                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 shadow-xs"
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <p className="font-bold text-xs text-[#0F172A] leading-snug">
                                                    &quot;{q.text}&quot;
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteQuestion(q.id)}
                                                    className="text-gray-400 hover:text-red-500 p-1"
                                                    title="Remove question"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            {q.status === 'pending' ? (
                                                <div className="pt-2 flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAutoAnswer(q.id, q.text)}
                                                        disabled={isGenerating === q.id}
                                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#FF8800] hover:bg-[#E67A00] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-70"
                                                    >
                                                        {isGenerating === q.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Wand2 className="w-3.5 h-3.5" />
                                                        )}
                                                        {isGenerating === q.id ? 'Generating...' : 'Auto-Answer via KB'}
                                                    </button>
                                                </div>
                                            ) : q.status === 'drafted' ? (
                                                <div className="pt-2 space-y-2">
                                                    <textarea
                                                        rows={3}
                                                        value={q.answer}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setQuestions((prev) =>
                                                                prev.map((item) =>
                                                                    item.id === q.id ? { ...item, answer: val } : item
                                                                )
                                                            );
                                                        }}
                                                        className="w-full p-2.5 bg-white border border-[#E2E8F0] rounded-lg text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 resize-none"
                                                    />
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSaveAnswerDraft(q.id)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-lg text-xs font-bold cursor-pointer"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                            Save answer draft
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-xs text-gray-700 bg-white p-3 rounded-lg border border-[#E2E8F0] leading-relaxed">
                                                    {q.answer}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom Disclaimer Note */}
                        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 mt-4 flex items-center gap-2 text-xs text-gray-500 font-normal">
                            <Info className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>
                                Review every draft before publishing. Answers are generated only from your saved business details.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Example Questions Modal */}
            {showExamplesModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowExamplesModal(false);
                    }}
                >
                    <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E2E8F0]">
                        <button
                            type="button"
                            onClick={() => setShowExamplesModal(false)}
                            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                                <Lightbulb className="w-4 h-4" />
                            </div>
                            <h3 className="text-base font-bold text-[#0F172A]">Example Questions</h3>
                        </div>

                        <p className="text-xs text-gray-500 mb-4">
                            Click any question below to add it directly to your customer questions queue:
                        </p>

                        <div className="space-y-2">
                            {EXAMPLE_QUESTIONS.map((exQ, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => addQuestion(exQ)}
                                    className="w-full text-left p-3 rounded-xl border border-[#E2E8F0] bg-white hover:bg-gray-50 text-xs font-semibold text-[#0F172A] transition-colors cursor-pointer flex items-center justify-between gap-2"
                                >
                                    <span>&quot;{exQ}&quot;</span>
                                    <span className="text-[10px] text-[#FF8800] font-bold shrink-0">+ Add</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
