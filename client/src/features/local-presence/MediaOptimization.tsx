import { useState } from 'react';
import {
    Image as ImageIcon,
    Wand2,
    MapPin,
    Tag as TagIcon,
    CheckCircle2,
    Building,
    Home,
    Users,
    Utensils,
    Sparkles,
    Loader2,
    Info,
    Download,
    Trash2
} from 'lucide-react';
import { apiPost, logDashboardActivity } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';

interface CategoryStatus {
    id: string;
    name: string;
    icon: any;
    count: number;
    minRequired: number;
}

const CATEGORIES: CategoryStatus[] = [
    { id: 'Exterior', name: 'Exterior', icon: Building, count: 0, minRequired: 3 },
    { id: 'Interior', name: 'Interior', icon: Home, count: 0, minRequired: 3 },
    { id: 'Team', name: 'Team', icon: Users, count: 0, minRequired: 3 },
    { id: 'Product', name: 'Product', icon: Utensils, count: 0, minRequired: 3 },
    { id: 'Logo', name: 'Logo', icon: Sparkles, count: 0, minRequired: 1 }
];

export default function MediaOptimization() {
    const [activeTab, setActiveTab] = useState('Exterior');
    const [isGenerating, setIsGenerating] = useState(false);
    const [categories, setCategories] = useState<CategoryStatus[]>(CATEGORIES);
    const [photos, setPhotos] = useState<any[]>([]);
    const [error, setError] = useState('');

    const handleGenerateMedia = async () => {
        setIsGenerating(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/media-generate', { category: activeTab });
            if (data.photo) {
                setPhotos((prev) => [data.photo, ...prev]);
                setCategories((prev) =>
                    prev.map((c) => (c.name === activeTab || c.id === activeTab ? { ...c, count: c.count + 1 } : c))
                );
            }
            await logDashboardActivity({
                type: 'media',
                message: `Generated ${activeTab} photo with SEO alt-text.`,
                icon: 'CheckCircle',
                color: 'text-[#FF8800]'
            });
        } catch (err: any) {
            setError(err.message || 'Image generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeletePhoto = (id: number) => {
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        setCategories((prev) =>
            prev.map((c) => (c.name === activeTab || c.id === activeTab ? { ...c, count: Math.max(0, c.count - 1) } : c))
        );
    };

    const currentStatus = categories.find((c) => c.name === activeTab || c.id === activeTab);
    const currentPhotos = photos.filter((p) => p.category === activeTab || p.category === currentStatus?.name || p.category === currentStatus?.id);
    const isComplete = (currentStatus?.count || 0) >= (currentStatus?.minRequired || 3);
    const totalPhotos = photos.length;
    const completedCategories = categories.filter((c) => c.count >= c.minRequired).length;

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Media Optimization Agent</h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1 max-w-2xl">
                        Empty gallery until Gemini generates photos for the connected listing.
                    </p>
                </div>

                <button
                    onClick={handleGenerateMedia}
                    disabled={isGenerating}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-70 shadow-xs cursor-pointer shrink-0"
                >
                    {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                        <Wand2 className="w-4 h-4 text-amber-300" />
                    )}
                    {isGenerating ? 'Generating Photo...' : 'AI Generate Photo'}
                </button>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {/* Top 4 Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* 1. Total photos */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Total photos</p>
                        <p className="text-2xl font-bold text-[#0F172A]">{totalPhotos}</p>
                    </div>
                </div>

                {/* 2. Categories completed */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Categories filled</p>
                        <p className="text-2xl font-bold text-[#0F172A]">
                            {completedCategories} <span className="text-sm font-medium text-gray-400">/ 5</span>
                        </p>
                    </div>
                </div>

                {/* 3. Geotags & EXIF */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-[#FF8800]" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Geotagging</p>
                        <p className="text-lg font-bold text-[#0F172A]">Auto EXIF</p>
                    </div>
                </div>

                {/* 4. Alt-Text status */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3.5 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                        <TagIcon className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">SEO Alt-Text</p>
                        <p className="text-lg font-bold text-[#0F172A]">AI Optimized</p>
                    </div>
                </div>
            </div>

            {/* Category Selector Tabs Bar */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-2 mb-6 shadow-xs flex flex-wrap gap-2">
                {categories.map((cat) => {
                    const IconComponent = cat.icon;
                    const isActive = activeTab === cat.name || activeTab === cat.id;
                    const hasMinimum = cat.count >= cat.minRequired;

                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => setActiveTab(cat.name)}
                            className={`flex-1 min-w-[140px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-[#0F172A] text-white shadow-xs'
                                    : 'bg-transparent text-gray-700 hover:bg-[#F8FAFC]'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <IconComponent className={`w-4 h-4 ${isActive ? 'text-amber-300' : 'text-gray-500'}`} />
                                <span>{cat.name}</span>
                            </div>

                            <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    isActive
                                        ? 'bg-white/20 text-white'
                                        : hasMinimum
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-gray-100 text-gray-600'
                                }`}
                            >
                                {cat.count}/{cat.minRequired}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Gallery Content Area */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs min-h-[420px] flex flex-col justify-between">
                <div>
                    {/* Header inside card */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0] mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                                {activeTab} Photos
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 font-medium">
                                {isComplete ? (
                                    <span className="text-emerald-600 flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Category requirement satisfied
                                    </span>
                                ) : (
                                    <span className="text-amber-600 flex items-center gap-1">
                                        <AlertCircle className="w-3.5 h-3.5" /> Minimum {currentStatus?.minRequired} photos recommended for maximum GBP ranking
                                    </span>
                                )}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleGenerateMedia}
                            disabled={isGenerating}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#FF8800] hover:bg-[#E67A00] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-70"
                        >
                            {isGenerating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Wand2 className="w-3.5 h-3.5" />
                            )}
                            {isGenerating ? 'Generating...' : `Generate ${activeTab} Photo`}
                        </button>
                    </div>

                    {/* Photo List or Empty State */}
                    {currentPhotos.length === 0 ? (
                        <div className="bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-2xl p-12 flex flex-col items-center justify-center text-center my-6">
                            <div className="w-12 h-12 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center text-gray-400 mb-3 shadow-xs">
                                <ImageIcon className="w-6 h-6 text-gray-400" />
                            </div>
                            <h3 className="text-base font-bold text-[#0F172A] mb-1">No photos in {activeTab} yet</h3>
                            <p className="text-xs text-gray-500 max-w-sm mb-6 leading-relaxed">
                                Generate a photorealistic AI image tailored with your local address and business metadata.
                            </p>
                            <button
                                type="button"
                                onClick={handleGenerateMedia}
                                disabled={isGenerating}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                            >
                                <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                                Generate first photo
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in duration-300">
                            {currentPhotos.map((photo) => (
                                <div
                                    key={photo.id}
                                    className="group bg-[#F8FAFC] rounded-2xl overflow-hidden border border-[#E2E8F0] shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                                >
                                    <div className="aspect-video w-full overflow-hidden bg-gray-100 relative">
                                        <img
                                            src={photo.url}
                                            alt={photo.altText || 'Media preview'}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <a
                                                href={photo.url}
                                                download={`photo-${photo.id}.jpg`}
                                                className="p-1.5 bg-white/90 hover:bg-white text-gray-700 rounded-lg shadow-xs text-xs font-bold"
                                                title="Download"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => handleDeletePhoto(photo.id)}
                                                className="p-1.5 bg-white/90 hover:bg-red-50 text-red-600 rounded-lg shadow-xs cursor-pointer"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 space-y-2.5">
                                        <div className="flex items-start gap-2 text-xs text-gray-600 bg-white p-2.5 rounded-xl border border-[#E2E8F0]">
                                            <TagIcon className="w-3.5 h-3.5 text-[#FF8800] shrink-0 mt-0.5" />
                                            <p className="text-[11px] leading-relaxed text-gray-700">
                                                <strong className="text-[#0F172A] block text-[10px] uppercase tracking-wider">
                                                    SEO Alt-Text
                                                </strong>
                                                {photo.altText}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] text-gray-500 px-1 font-medium">
                                            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                                <MapPin className="w-3 h-3 text-emerald-500" /> EXIF Geotagged
                                            </span>
                                            <span>GBP Ready</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Bottom Callout */}
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 mt-6 flex items-center gap-2 text-xs text-gray-500 font-normal">
                    <Info className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>
                        All photos generated and uploaded through LocalPulse are automatically formatted, compressed, and injected with location EXIF data for local search ranking signals.
                    </span>
                </div>
            </div>
        </div>
    );
}
