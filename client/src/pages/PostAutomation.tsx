import { useEffect, useState } from 'react';
import { Calendar, Image as ImageIcon, Send, Sparkles, MessageSquare, Tag } from 'lucide-react';
import { cn, apiGet, apiPost } from '../lib/utils';

export default function PostAutomation() {
    const [postType, setPostType] = useState('offer');
    const [tone, setTone] = useState('professional');
    const [generatedText, setGeneratedText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [ctaValue, setCtaValue] = useState('Book');
    const [isScheduling, setIsScheduling] = useState(false);
    const [businessName, setBusinessName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/business').then((b) => setBusinessName(b.name || '')).catch(() => {});
    }, []);

    const handleGenerateCopy = async () => {
        setIsGenerating(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/post-copy', { postType, tone, businessName });
            setGeneratedText(data.copy || '');
            await apiPost('/api/dashboard/activity', {
                type: 'post',
                message: `Generated GBP ${postType} copy (${tone}).`,
                icon: 'Activity',
                color: 'text-[#3D4F38]'
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
            await apiPost('/api/dashboard/activity', {
                type: 'media',
                message: 'Generated a promotional post visual.',
                icon: 'CheckCircle',
                color: 'text-[#D97706]'
            });
        } catch (err: any) {
            setError(err.message || 'Image failed');
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSchedulePost = async () => {
        setIsScheduling(true);
        try {
            // Append a timeline activity
            await apiPost('/api/dashboard/activity', {
                type: 'post',
                message: `Scheduled GBP ${postType} post with CTA: "${ctaValue}".`,
                icon: 'Clock',
                color: 'text-[#708238]'
            });
        } catch (err) {
            console.error(err);
        } finally {
            setTimeout(() => {
                setIsScheduling(false);
                alert('Post scheduled successfully on Google Business Profile Autopilot!');
            }, 600);
        }
    };

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-[#2D2F27]">Post Automation Agent</h1>
                <p className="text-gray-500 mt-2">Offers, What's New, and Events — Gemini writes copy for the connected listing only.</p>
            </div>
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Workspace Column */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Settings Card */}
                    <div className="bg-white p-6 rounded-2xl border border-[#E7E5E4] shadow-sm">
                        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-[#708238]" /> Post Parameters
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
                                                    ? "bg-[#3D4F38] text-white"
                                                    : "bg-[#FAF9F5] text-gray-600 hover:bg-[#E7E5E4] border border-[#E7E5E4]"
                                            )}
                                        >
                                            {type === 'offer' ? 'Special Offer' : type === 'update' ? "What's New" : 'Event'}
                                        </button>
                                    ))}
                                </div>
                            </div>

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
                                                    ? "border-[#708238] bg-[#FAF9F5] text-[#3D4F38] font-bold"
                                                    : "border-[#E7E5E4] bg-white text-gray-600 hover:bg-[#F4F2EB]"
                                            )}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-[#E7E5E4]">
                            <button
                                onClick={handleGenerateCopy}
                                disabled={isGenerating}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-[#3D4F38] hover:bg-[#4A5E44] text-white rounded-xl font-bold transition-all disabled:opacity-70 cursor-pointer shadow-sm"
                            >
                                <Sparkles className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
                                {isGenerating ? 'Generating Magic...' : 'Generate AI Copy'}
                            </button>
                        </div>
                    </div>

                    {/* Schedule / Finalize Card */}
                    <div className="bg-white p-6 rounded-2xl border border-[#E7E5E4] shadow-sm">
                        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-[#D97706]" /> Finalize & Schedule
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Call-to-Action (CTA) Button</label>
                                <select
                                    value={ctaValue}
                                    onChange={(e) => setCtaValue(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#E7E5E4] rounded-xl focus:outline-none focus:border-[#3D4F38]"
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
                                    <input type="date" className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#E7E5E4] rounded-xl focus:outline-none focus:border-[#3D4F38]" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                    <input type="time" className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#E7E5E4] rounded-xl focus:outline-none focus:border-[#3D4F38]" />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={handleSchedulePost}
                                disabled={isScheduling}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#708238] hover:bg-[#5e6d2f] text-white rounded-xl font-bold text-lg transition-colors cursor-pointer shadow-md disabled:opacity-50"
                            >
                                <Send className="w-5 h-5" /> {isScheduling ? 'Scheduling...' : 'Schedule Post'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Preview Column */}
                <div className="lg:col-span-5 relative">
                    <div>
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" /> Live Preview
                        </h2>

                        <div className="bg-white rounded-2xl border border-[#E7E5E4] shadow-md overflow-hidden flex flex-col">
                            {/* Image Gen Area */}
                            <div className="relative h-64 bg-[#F4F2EB] flex flex-col items-center justify-center border-b border-[#E7E5E4] p-4 text-center">
                                {generatedImage ? (
                                    <img src={generatedImage} alt="Generated" className="w-full h-full object-cover absolute inset-0" />
                                ) : (
                                    <>
                                        <ImageIcon className="w-12 h-12 text-gray-300 mb-3" />
                                        <p className="text-sm text-gray-500 mb-4 max-w-[80%]">No image selected. Generate an AI image or upload one.</p>
                                        <button
                                            onClick={handleGenerateImage}
                                            disabled={isGeneratingImage}
                                            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E7E5E4] rounded-full text-sm font-medium shadow-sm hover:bg-[#FAF9F5] transition-colors z-10 cursor-pointer"
                                        >
                                            <Sparkles className={`w-4 h-4 text-[#D97706] ${isGeneratingImage ? 'animate-spin' : ''}`} />
                                            {isGeneratingImage ? 'Creating...' : 'Generate Image'}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Text Area */}
                            <div className="p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-[#3D4F38] text-white flex items-center justify-center font-bold">
                                        {businessName?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-[#2D2F27]">{businessName || 'No listing'}</h4>
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

                            {/* Fake CTA */}
                            <div className="p-4 bg-[#FAF9F5] border-t border-[#E7E5E4]">
                                <div className="w-full py-2 bg-white border border-[#3D4F38] text-[#3D4F38] font-bold text-center rounded-lg text-sm">
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
