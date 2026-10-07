import { useEffect, useState } from 'react';
import { Calendar, Image as ImageIcon, Send, BadgeCheck, MessageSquare, Tag } from 'lucide-react';
import { cn, apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';

export default function PostAutomation() {
    const [postType, setPostType] = useState('offer');
    const [tone, setTone] = useState('professional');
    const [generatedText, setGeneratedText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [ctaValue, setCtaValue] = useState('Book');
    const [topic, setTopic] = useState('');
    const [details, setDetails] = useState('');
    const [eventTitle, setEventTitle] = useState('');
    const [draftDate, setDraftDate] = useState('');
    const [draftTime, setDraftTime] = useState('');
    const [drafts, setDrafts] = useState<any[]>([]);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [businessName, setBusinessName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/business').then((b) => setBusinessName(b.name || '')).catch(() => {});
        apiGet('/api/ai/gbp-drafts')
            .then((data) => setDrafts(Array.isArray(data?.drafts) ? data.drafts : []))
            .catch(() => {});
    }, []);

    const copyPayload = () => ({
        postType,
        tone,
        businessName,
        topic,
        details,
        eventTitle,
        date: draftDate,
        time: draftTime
    });

    const handleGenerateCopy = async () => {
        setIsGenerating(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/post-copy', copyPayload());
            setGeneratedText(data.copy || '');
            await logDashboardActivity({
                type: 'post',
                message: `Generated GBP ${postType} copy (${tone}).`,
                icon: 'Activity',
                color: 'text-[#0F172A]'
            });
        } catch (err: any) {
            setError(err.message || 'Copy failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateImage = async () => {
        setIsGeneratingImage(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/post-image', { postType });
            setGeneratedImage(data.imageUrl || null);
            await logDashboardActivity({
                type: 'media',
                message: 'Generated a promotional post visual.',
                icon: 'CheckCircle',
                color: 'text-[var(--brand-primary-ink)]'
            });
        } catch (err: any) {
            setError(err.message || 'Image failed');
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSaveDraft = async () => {
        setIsSavingDraft(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/gbp-drafts', {
                ...copyPayload(),
                cta: ctaValue,
                copy: generatedText,
                imageUrl: generatedImage || ''
            });
            setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
            await logDashboardActivity({
                type: 'post',
                message: `Saved draft GBP ${postType} post with CTA: "${ctaValue}".`,
                icon: 'Clock',
                color: 'text-[var(--brand-primary)]'
            });
        } catch (err: any) {
            setError(err.message || 'Could not save draft');
        } finally {
            setIsSavingDraft(false);
        }
    };

    const restoreDraft = (draft: any) => {
        setPostType(draft.postType || 'update');
        setTone(draft.tone || 'professional');
        setTopic(draft.topic || '');
        setDetails(draft.details || '');
        setEventTitle(draft.eventTitle || '');
        setCtaValue(draft.cta || 'Book');
        setDraftDate(draft.date || '');
        setDraftTime(draft.time || '');
        setGeneratedText(draft.copy || '');
        setGeneratedImage(draft.imageUrl || null);
    };

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Post Automation Agent</h1>
                <p className="text-gray-500 mt-2">Offers, What's New, and Events — Gemini writes copy for the connected listing only.</p>
            </div>
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {}
                <div className="lg:col-span-7 space-y-6">
                    {}
                    <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-[var(--brand-primary)]" /> Post Parameters
                        </h2>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Post Type</label>
                                <div className="flex gap-3">
                                    {['offer', 'update', 'event'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setPostType(type)}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize cursor-pointer",
                                                postType === type
                                                    ? "bg-[#0F172A] text-white"
                                                    : "bg-[#F8FAFC] text-gray-600 hover:bg-[#E2E8F0] border border-[#E2E8F0]"
                                            )}
                                        >
                                            {type === 'offer' ? 'Special Offer' : type === 'update' ? "What's New" : 'Event'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
                                <input
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="What should this post be about?"
                                    className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A]"
                                />
                            </div>

                            {postType === 'offer' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Offer details</label>
                                    <textarea
                                        value={details}
                                        onChange={(e) => setDetails(e.target.value)}
                                        placeholder="Discount, what is included, and any terms you want mentioned"
                                        className="w-full h-24 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A] resize-none"
                                    />
                                </div>
                            )}

                            {postType === 'event' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Event title</label>
                                        <input
                                            value={eventTitle}
                                            onChange={(e) => setEventTitle(e.target.value)}
                                            placeholder="Name of the event"
                                            className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Event details</label>
                                        <textarea
                                            value={details}
                                            onChange={(e) => setDetails(e.target.value)}
                                            placeholder="Who it is for and what happens"
                                            className="w-full h-24 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A] resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Brand Tone</label>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { id: 'professional', label: 'Professional & Friendly' },
                                        { id: 'energy', label: 'High-Energy' },
                                        { id: 'urgent', label: 'Urgent' },
                                        { id: 'community', label: 'Community-Focused' }
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTone(t.id)}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-sm transition-colors border cursor-pointer",
                                                tone === t.id
                                                    ? "border-[var(--brand-primary)] bg-[#F8FAFC] text-[#0F172A] font-bold"
                                                    : "border-[#E2E8F0] bg-white text-gray-600 hover:bg-[#F1F5F9]"
                                            )}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-[#E2E8F0] flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleGenerateCopy}
                                disabled={isGenerating}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold transition-all disabled:opacity-70 cursor-pointer shadow-sm"
                            >
                                <BadgeCheck className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
                                {isGenerating ? 'Generating Magic...' : 'Generate AI Copy'}
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerateCopy}
                                disabled={isGenerating || !generatedText}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-[#E2E8F0] text-[#0F172A] rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer"
                            >
                                Regenerate
                            </button>
                        </div>
                    </div>

                    {}
                    <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-[var(--brand-primary-ink)]" /> Save draft
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Call-to-Action (CTA) Button</label>
                                <select
                                    value={ctaValue}
                                    onChange={(e) => setCtaValue(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A]"
                                >
                                    <option>Book</option>
                                    <option>Call Now</option>
                                    <option>Learn More</option>
                                    <option>Buy</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                                    <input
                                        type="date"
                                        value={draftDate}
                                        onChange={(e) => setDraftDate(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                    <input
                                        type="time"
                                        value={draftTime}
                                        onChange={(e) => setDraftTime(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#0F172A]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={handleSaveDraft}
                                disabled={isSavingDraft}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-ink)] text-white rounded-xl font-bold text-lg transition-colors cursor-pointer shadow-md disabled:opacity-50"
                            >
                                <Send className="w-5 h-5" /> {isSavingDraft ? 'Saving...' : 'Save draft'}
                            </button>
                            <p className="mt-2 text-xs text-center text-gray-500">Drafts stay in this app until Google publish is connected.</p>
                        </div>
                    </div>

                    {drafts.length > 0 && (
                        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
                            <h2 className="text-sm font-bold text-[#0F172A] mb-3">Saved drafts</h2>
                            <ul className="divide-y divide-[#E2E8F0]">
                                {drafts.map((draft) => (
                                    <li key={draft.id}>
                                        <button
                                            type="button"
                                            onClick={() => restoreDraft(draft)}
                                            className="w-full text-left py-3 hover:bg-[#F8FAFC] rounded-lg px-2"
                                        >
                                            <p className="text-sm font-bold text-[#0F172A] truncate">
                                                {draft.topic || draft.eventTitle || draft.copy?.slice(0, 80) || 'Untitled draft'}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {draft.postType === 'offer'
                                                    ? 'Special Offer'
                                                    : draft.postType === 'event'
                                                      ? 'Event'
                                                      : "What's New"}
                                                {' · '}
                                                {draft.createdAt
                                                    ? new Date(draft.createdAt).toLocaleString('en-GB', {
                                                          day: 'numeric',
                                                          month: 'short',
                                                          hour: '2-digit',
                                                          minute: '2-digit'
                                                      })
                                                    : 'Saved'}
                                            </p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {}
                <div className="lg:col-span-5 relative">
                    <div>
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" /> Live Preview
                        </h2>

                        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-md overflow-hidden flex flex-col">
                            {}
                            <div className="relative h-64 bg-[#F1F5F9] flex flex-col items-center justify-center border-b border-[#E2E8F0] p-4 text-center">
                                {generatedImage ? (
                                    <img src={generatedImage} alt="Generated" className="w-full h-full object-cover absolute inset-0" />
                                ) : (
                                    <>
                                        <ImageIcon className="w-12 h-12 text-gray-300 mb-3" />
                                        <p className="text-sm text-gray-500 mb-4 max-w-[80%]">No image selected. Generate an AI image or upload one.</p>
                                        <button
                                            onClick={handleGenerateImage}
                                            disabled={isGeneratingImage}
                                            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-full text-sm font-medium shadow-sm hover:bg-[#F8FAFC] transition-colors z-10 cursor-pointer"
                                        >
                                            <BadgeCheck className={`w-4 h-4 text-[var(--brand-primary-ink)] ${isGeneratingImage ? 'animate-spin' : ''}`} />
                                            {isGeneratingImage ? 'Creating...' : 'Generate Image'}
                                        </button>
                                    </>
                                )}
                            </div>

                            {}
                            <div className="p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold">
                                        {businessName?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-[#0F172A]">{businessName || 'No listing'}</h4>
                                        <p className="text-xs text-gray-500">Just now</p>
                                    </div>
                                </div>

                                <div className="relative">
                                    <textarea
                                        value={generatedText}
                                        onChange={(e) => setGeneratedText(e.target.value)}
                                        placeholder="Your post text will appear here..."
                                        className="w-full h-32 text-sm text-gray-700 bg-transparent border-none resize-none focus:outline-none placeholder:text-gray-400 font-sans"
                                    />
                                    {!generatedText && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <p className="text-xs text-gray-400 italic">Click "Generate AI Copy" to start</p>
                                        </div>
                                    )}
                                </div>

                                {postType === 'offer' && (
                                    <div className="mt-2 py-2 px-3 bg-red-50 text-red-700 text-xs font-semibold rounded-lg border border-red-100 flex justify-between items-center">
                                        <span>Special Offer Active</span>
                                        <span className="underline cursor-pointer">Edit Dates</span>
                                    </div>
                                )}
                            </div>

                            {}
                            <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
                                <div className="w-full py-2 bg-white border border-[#0F172A] text-[#0F172A] font-bold text-center rounded-lg text-sm">
                                    {ctaValue}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
