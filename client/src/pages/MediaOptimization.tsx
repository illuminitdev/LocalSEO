import { useState } from 'react';
import { Image as ImageIcon, Sparkles, MapPin, Tag as TagIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiPost } from '../lib/utils';

interface CategoryStatus {
    name: string;
    count: number;
    minRequired: number;
}

const CATEGORIES: CategoryStatus[] = [
    { name: 'Exterior', count: 0, minRequired: 3 },
    { name: 'Interior', count: 0, minRequired: 3 },
    { name: 'Team', count: 0, minRequired: 3 },
    { name: 'Product', count: 0, minRequired: 3 },
    { name: 'Logo', count: 0, minRequired: 1 }
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
                setPhotos([data.photo, ...photos]);
                setCategories((prev) => prev.map((c) => c.name === activeTab ? { ...c, count: c.count + 1 } : c));
            }
            await apiPost('/api/dashboard/activity', {
                type: 'media',
                message: `Generated ${activeTab} photo with alt-text.`,
                icon: 'CheckCircle',
                color: 'text-[#708238]'
            });
        } catch (err: any) {
            setError(err.message || 'Image generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const currentStatus = categories.find(c => c.name === activeTab);
    const currentPhotos = photos.filter(p => p.category === activeTab);
    const isComplete = (currentStatus?.count || 0) >= (currentStatus?.minRequired || 3);

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-[#2D2F27]">Media Optimization Agent</h1>
                <p className="text-gray-500 mt-2">Empty gallery until Gemini generates photos for the connected listing.</p>
            </div>
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar Nav */}
                <div className="lg:col-span-1 space-y-2">
                    <h3 className="font-semibold text-gray-400 uppercase tracking-wider text-xs mb-4 ml-2">Categories</h3>
                    {categories.map(cat => {
                        const hasPhotos = cat.count >= cat.minRequired;
                        const completenessColor = hasPhotos ? 'text-green-500' : 'text-red-500';

                        return (
                            <button
                                key={cat.name}
                                onClick={() => setActiveTab(cat.name)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${activeTab === cat.name
                                    ? 'bg-[#3D4F38] text-white shadow-md'
                                    : 'bg-white hover:bg-[#FAF9F5] text-gray-700 border border-transparent hover:border-[#E7E5E4]'
                                    }`}
                            >
                                <span>{cat.name}</span>
                                {hasPhotos ? (
                                    <CheckCircle2 className={`w-4 h-4 ${activeTab === cat.name ? 'text-green-300' : completenessColor}`} />
                                ) : (
                                    <AlertCircle className={`w-4 h-4 ${activeTab === cat.name ? 'text-red-300' : completenessColor}`} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Media Gallery */}
                <div className="lg:col-span-3">
                    <div className="bg-white p-6 rounded-2xl border border-[#E7E5E4] shadow-sm min-h-[500px]">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#E7E5E4]">
                            <div>
                                <h2 className="text-xl font-bold text-[#2D2F27] flex items-center gap-2">
                                    {activeTab} Photos
                                </h2>
                                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1 font-semibold">
                                    {isComplete ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                                    {isComplete ? 'Category complete' : `Minimum ${currentStatus?.minRequired} photos recommended`}
                                </p>
                            </div>
                            <button
                                onClick={handleGenerateMedia}
                                disabled={isGenerating}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white rounded-xl font-bold transition-all disabled:opacity-70 shadow-sm cursor-pointer"
                            >
                                <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                                {isGenerating ? 'Generating...' : 'AI Generate Photo'}
                            </button>
                        </div>

                        {currentPhotos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center bg-[#FAF9F5] border-2 border-dashed border-[#E7E5E4] rounded-xl h-64 animate-in">
                                <ImageIcon className="w-12 h-12 text-gray-300 mb-4" />
                                <h3 className="font-semibold text-gray-700 mb-1">No photos in {activeTab}</h3>
                                <p className="text-sm text-gray-500">Generate a Gemini photo for this category.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                                {currentPhotos.map((photo) => (
                                    <div key={photo.id} className="group relative bg-[#FAF9F5] rounded-xl overflow-hidden border border-[#E7E5E4] hover:shadow-md transition-shadow">
                                        <div className="aspect-video w-full overflow-hidden bg-gray-150 relative">
                                            <img src={photo.url} alt="Media" className="w-[100%] h-[100%] object-cover" />
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div className="flex items-start gap-2 text-xs text-gray-600 bg-white p-2 rounded border border-[#E7E5E4]">
                                                <TagIcon className="w-4 h-4 text-[#708238] shrink-0 mt-0.5" />
                                                <span><span className="font-bold text-[#2D2F27]">Auto Alt-Text:</span> {photo.altText}</span>
                                            </div>
                                            <div className="flex items-start gap-2 text-xs text-gray-600 bg-white p-2 rounded border border-[#E7E5E4]">
                                                <MapPin className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                                                <span><span className="font-bold text-[#2D2F27]">EXIF Geotag:</span> {photo.lat}, {photo.lng}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
