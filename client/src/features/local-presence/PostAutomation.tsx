import { useEffect, useRef, useState } from 'react';
import {
    Calendar,
    Image as ImageIcon,
    Sparkles,
    PenLine,
    Pencil,
    Trash2,
    FileText,
    TrendingUp,
    MousePointerClick,
    Upload,
    MoreVertical,
    Loader2
} from 'lucide-react';
import { cn, apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import { useCredits } from '../../shared/CreditsContext';
import { getPageCache, setPageCache } from '../../shared/pageCache';

export default function PostAutomation() {
    const { refresh: refreshCredits } = useCredits();
    const cached = getPageCache<{ drafts: any[]; businessName: string }>('gbp-posts');
    const [loaded, setLoaded] = useState(Boolean(cached));
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
    const [drafts, setDrafts] = useState<any[]>(cached?.drafts ?? []);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [businessName, setBusinessName] = useState(cached?.businessName ?? '');
    const [error, setError] = useState('');
    const [targetLink, setTargetLink] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadImage = async (file?: File | null) => {
        if (!file) return;
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
            setError('Only JPEG, PNG, WebP, or GIF images are allowed.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be 5 MB or smaller.');
            return;
        }
        setIsUploading(true);
        setError('');
        try {
            const presign = await apiPost('/api/ai/post-image/presign', { contentType: file.type });
            const put = await fetch(presign.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });
            if (!put.ok) throw new Error('Upload failed');
            setGeneratedImage(String(presign.publicUrl));
        } catch (err: any) {
            setError(err.message || 'Upload failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    useEffect(() => {
        Promise.all([
            apiGet('/api/business').then((b) => setBusinessName(b.name || '')).catch(() => {}),
            apiGet('/api/ai/gbp-drafts')
                .then((data) => setDrafts(Array.isArray(data?.drafts) ? data.drafts : []))
                .catch(() => {})
        ]).finally(() => setLoaded(true));
    }, []);

    useEffect(() => {
        if (loaded) setPageCache('gbp-posts', { drafts, businessName });
    }, [loaded, drafts, businessName]);

    // The last generated post (text, image and the form values) is kept on the org until the next generation.
    const restoredRef = useRef(false);
    const savedKeyRef = useRef('');
    useEffect(() => {
        apiGet('/api/ai/saved/post-generator')
            .then((d) => {
                const v = d?.saved?.value;
                if (v) {
                    if (v.postType) setPostType(v.postType);
                    if (v.tone) setTone(v.tone);
                    if (v.ctaValue) setCtaValue(v.ctaValue);
                    setTopic(v.topic || '');
                    setDetails(v.details || '');
                    setEventTitle(v.eventTitle || '');
                    setDraftDate(v.draftDate || '');
                    setDraftTime(v.draftTime || '');
                    setTargetLink(v.targetLink || '');
                    setGeneratedText(v.generatedText || '');
                    setGeneratedImage(v.generatedImage || null);
                    savedKeyRef.current = (v.generatedText || '') + '|' + (v.generatedImage || '');
                }
            })
            .catch(() => {})
            .finally(() => {
                restoredRef.current = true;
            });
    }, []);

    useEffect(() => {
        if (!restoredRef.current || (!generatedText && !generatedImage)) return;
        const key = generatedText + '|' + (generatedImage && !generatedImage.startsWith('data:') ? generatedImage : '');
        if (key === savedKeyRef.current) return;
        const t = setTimeout(() => {
            savedKeyRef.current = key;
            apiPost('/api/ai/saved/post-generator', {
                value: {
                    postType,
                    tone,
                    ctaValue,
                    topic,
                    details,
                    eventTitle,
                    draftDate,
                    draftTime,
                    targetLink,
                    generatedText,
                    // Inline image data would bloat the saved state; only a stored image URL is kept.
                    generatedImage: generatedImage && !generatedImage.startsWith('data:') ? generatedImage : null
                }
            }).catch(() => {});
        }, 800);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [generatedText, generatedImage]);

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
            refreshCredits();
        }
    };

    const handleGenerateImage = async () => {
        setIsGeneratingImage(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/post-image', copyPayload());
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
            refreshCredits();
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

    const typeLabel = (t: string) => (t === 'offer' ? 'Promotional' : t === 'event' ? 'Event' : 'Update');
    const fieldCls =
        'w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[var(--brand-primary)]';
    const labelCls = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5';
    const stats = [
        { label: 'Total Posts (30d)', value: '0', trend: '0% vs last month', icon: FileText },
        { label: 'Engagement Rate', value: '0%', trend: '0% vs last month', icon: TrendingUp },
        { label: 'Clicks from Posts', value: '0', trend: '0% vs last month', icon: MousePointerClick }
    ];

    if (!loaded) {
        return (
            <div className="max-w-6xl mx-auto pb-12">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Post Automation Agent</h1>
                    <p className="text-sm text-gray-500 mt-1">AI-powered local updates and promotions.</p>
                </div>
                <div className="flex justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Post Automation Agent</h1>
                <p className="text-sm text-gray-500 mt-1">AI-powered local updates and promotions.</p>
            </div>
            {error && (
                <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-8 space-y-6">
                    {/* Create new post */}
                    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                                <PenLine className="w-4 h-4 text-[var(--brand-primary)]" /> Create New Post
                            </h2>
                            <div className="inline-flex p-0.5 bg-[#F1F5F9] rounded-md">
                                {['offer', 'update', 'event'].map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setPostType(type)}
                                        className={cn(
                                            'px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                                            postType === type
                                                ? 'bg-white text-[#0F172A] shadow-sm'
                                                : 'text-gray-500 hover:text-[#0F172A]'
                                        )}
                                    >
                                        {typeLabel(type)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {postType === 'event' && (
                                <div>
                                    <label className={labelCls}>Event title</label>
                                    <input
                                        value={eventTitle}
                                        onChange={(e) => setEventTitle(e.target.value)}
                                        placeholder="Name of the event"
                                        className={fieldCls}
                                    />
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Post Intent / Prompt</label>
                                <div className="relative">
                                    <textarea
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder="E.g., Write a promotional post about our new summer HVAC tune-up special for $99. Valid until August 31st."
                                        className={cn(fieldCls, 'h-24 pb-10 resize-none bg-[#F8FAFC]')}
                                    />
                                    <button
                                        onClick={handleGenerateCopy}
                                        disabled={isGenerating}
                                        className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-ink)] text-[var(--brand-primary-foreground)] rounded-md text-xs font-semibold transition-colors disabled:opacity-70 cursor-pointer"
                                    >
                                        <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                                        {isGenerating ? 'Generating...' : 'Generate with AI'}
                                    </button>
                                </div>
                            </div>

                            {postType !== 'update' && (
                                <div>
                                    <label className={labelCls}>
                                        {postType === 'event' ? 'Event details' : 'Offer details'}
                                    </label>
                                    <textarea
                                        value={details}
                                        onChange={(e) => setDetails(e.target.value)}
                                        placeholder={
                                            postType === 'event'
                                                ? 'Who it is for and what happens'
                                                : 'Discount, what is included, and any terms'
                                        }
                                        className={cn(fieldCls, 'h-16 resize-none')}
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Post Image</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        className="hidden"
                                        onChange={(e) => uploadImage(e.target.files?.[0])}
                                    />
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => fileInputRef.current?.click()}
                                        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            setIsDragging(true);
                                        }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDragging(false);
                                            uploadImage(e.dataTransfer.files?.[0]);
                                        }}
                                        className={cn(
                                            'relative h-28 border border-dashed rounded-lg flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors',
                                            isDragging
                                                ? 'border-[var(--brand-primary)] bg-[#FFF4E8]'
                                                : 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9]'
                                        )}
                                    >
                                        {generatedImage ? (
                                            <img
                                                src={generatedImage}
                                                alt="Post"
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                        ) : (
                                            <>
                                                <Upload className="w-5 h-5 text-gray-400 mb-1" />
                                                <p className="text-xs text-gray-500">
                                                    {isUploading ? 'Uploading...' : 'Upload or Suggest'}
                                                </p>
                                            </>
                                        )}
                                        {generatedImage && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setGeneratedImage(null);
                                                }}
                                                className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#E2E8F0] rounded text-[10px] font-medium text-gray-600 cursor-pointer"
                                            >
                                                <Trash2 className="w-3 h-3" /> Remove
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleGenerateImage();
                                            }}
                                            disabled={isGeneratingImage}
                                            className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#E2E8F0] rounded text-[10px] font-medium text-[var(--brand-primary-ink)] cursor-pointer disabled:opacity-60"
                                        >
                                            <Sparkles className={`w-3 h-3 ${isGeneratingImage ? 'animate-spin' : ''}`} />
                                            {isGeneratingImage ? 'Creating...' : 'AI Suggest'}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className={labelCls}>Call to Action Button</label>
                                        <select
                                            value={ctaValue}
                                            onChange={(e) => setCtaValue(e.target.value)}
                                            className={fieldCls}
                                        >
                                            <option>Book</option>
                                            <option>Call Now</option>
                                            <option>Learn More</option>
                                            <option>Buy</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Target Link</label>
                                        <input
                                            value={targetLink}
                                            onChange={(e) => setTargetLink(e.target.value)}
                                            placeholder="https://yourwebsite.com/offer"
                                            className={fieldCls}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Brand Tone</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { id: 'professional', label: 'Professional & Friendly' },
                                        { id: 'energy', label: 'High-Energy' },
                                        { id: 'urgent', label: 'Urgent' },
                                        { id: 'community', label: 'Community-Focused' }
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTone(t.id)}
                                            className={cn(
                                                'px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer',
                                                tone === t.id
                                                    ? 'border-[#0F172A] bg-[#0F172A] text-white font-medium'
                                                    : 'border-[#E2E8F0] bg-white text-gray-600 hover:border-gray-400'
                                            )}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats (placeholder zeros until analytics is built) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {stats.map((st) => (
                            <div
                                key={st.label}
                                className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex items-start gap-3"
                            >
                                <div className="w-8 h-8 rounded-lg bg-[#FFF4E8] text-[var(--brand-primary)] flex items-center justify-center shrink-0">
                                    <st.icon className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-[11px] text-gray-500">{st.label}</p>
                                    <p className="text-2xl font-bold text-[#0F172A] leading-tight">{st.value}</p>
                                    <p className="text-[10px] text-emerald-600 mt-0.5">{st.trend}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Upcoming posts */}
                    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
                            <h2 className="text-sm font-bold text-[#0F172A]">Upcoming Posts</h2>
                            <span className="text-xs font-semibold text-[var(--brand-primary)] cursor-pointer">View All</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-gray-500 bg-[#F8FAFC]">
                                        <th className="px-5 py-2 font-semibold">Status</th>
                                        <th className="px-5 py-2 font-semibold text-[var(--brand-primary)]">Scheduled For</th>
                                        <th className="px-5 py-2 font-semibold">Type / Excerpt</th>
                                        <th className="px-5 py-2 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E2E8F0]">
                                    {drafts.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-5 py-6 text-center text-xs text-gray-400">
                                                No upcoming posts yet.
                                            </td>
                                        </tr>
                                    )}
                                    {drafts.map((draft) => (
                                        <tr
                                            key={draft.id}
                                            className="hover:bg-[#F8FAFC] cursor-pointer"
                                            onClick={() => restoreDraft(draft)}
                                        >
                                            <td className="px-5 py-3">
                                                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-[var(--brand-primary)] text-[10px] font-semibold">
                                                    Draft
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-xs text-[#0F172A]">
                                                {draft.date || '—'}
                                                {draft.time && (
                                                    <span className="block text-[10px] text-gray-400">{draft.time}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <p className="text-[10px] font-bold text-[#0F172A] uppercase">
                                                    {typeLabel(draft.postType)}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate max-w-[260px]">
                                                    {draft.topic ||
                                                        draft.eventTitle ||
                                                        draft.copy?.slice(0, 80) ||
                                                        'Untitled draft'}
                                                </p>
                                            </td>
                                            <td className="px-5 py-3 text-right text-gray-400">
                                                <Pencil className="inline w-3.5 h-3.5 mr-3" />
                                                <Trash2 className="inline w-3.5 h-3.5" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    {/* Schedule */}
                    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                        <h2 className="text-sm font-bold text-[#0F172A] mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-[var(--brand-primary)]" /> Schedule
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Publish Date</label>
                                <input
                                    type="date"
                                    value={draftDate}
                                    onChange={(e) => setDraftDate(e.target.value)}
                                    className={fieldCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Publish Time</label>
                                <input
                                    type="time"
                                    value={draftTime}
                                    onChange={(e) => setDraftTime(e.target.value)}
                                    className={fieldCls}
                                />
                            </div>
                            <button
                                onClick={handleSaveDraft}
                                disabled={isSavingDraft}
                                className="w-full py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {isSavingDraft ? 'Saving...' : 'Schedule Post'}
                            </button>
                        </div>
                    </div>

                    {/* Live preview */}
                    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Live Preview</h2>
                            <span className="px-2 py-0.5 bg-[#F1F5F9] rounded text-[10px] text-gray-500">Google</span>
                        </div>
                        <div className="mx-auto max-w-[320px] border-[3px] border-[#CBD5E1] rounded-[2rem] p-4 bg-white">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-sm font-bold">
                                    {businessName?.charAt(0) || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-[#0F172A] truncate">{businessName || 'No listing'}</p>
                                    <p className="text-[10px] text-gray-400">Just now</p>
                                </div>
                                <MoreVertical className="w-4 h-4 text-gray-400" />
                            </div>
                            <textarea
                                value={generatedText}
                                onChange={(e) => setGeneratedText(e.target.value)}
                                placeholder="Content preview will appear here once generated..."
                                className="w-full h-24 text-xs leading-relaxed text-gray-600 bg-transparent resize-none focus:outline-none placeholder:text-gray-400"
                            />
                            <div className="relative h-44 bg-[#F1F5F9] rounded-xl flex items-center justify-center overflow-hidden mb-4">
                                {generatedImage ? (
                                    <img
                                        src={generatedImage}
                                        alt="Generated"
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                ) : (
                                    <ImageIcon className="w-6 h-6 text-gray-300" />
                                )}
                            </div>
                            <div className="w-full py-2 bg-[#FFF4E8] text-[var(--brand-primary)] text-xs font-semibold text-center rounded-lg">
                                {ctaValue}
                            </div>
                        </div>
                        <p className="mt-4 text-[10px] text-center text-gray-400">
                            Preview demonstrates how your post will appear on mobile search results.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
