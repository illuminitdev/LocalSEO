import { useEffect, useState } from 'react';
import { Sparkles, Save, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { apiGet, apiPost } from '../lib/utils';

export default function ProfileAudit() {
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        category: '',
        address: '',
        phone: '',
        website: '',
        hours: '',
        attributes: '',
        description: ''
    });
    const [error, setError] = useState('');

    useEffect(() => {
        apiGet('/api/business').then((b) => {
            setFormData((prev) => ({
                ...prev,
                name: b.name || prev.name,
                category: b.category || prev.category,
                address: b.address || prev.address,
                phone: b.phone || prev.phone,
                website: b.website || prev.website,
                hours: b.hours || prev.hours,
                attributes: b.attributes || prev.attributes,
                description: b.description || prev.description
            }));
        }).catch(() => {});
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAudit = async () => {
        setIsAuditing(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/audit', formData);
            setAuditResult(data);
            await apiPost('/api/dashboard/activity', {
                type: 'audit',
                message: `AI Profile Audit executed. Optimization Score: ${data.score}/100.`,
                icon: 'Activity',
                color: 'text-[#D97706]'
            });
        } catch (err: any) {
            setError(err.message || 'Audit failed');
        } finally {
            setIsAuditing(false);
        }
    };

    const handleApplyDescription = () => {
        if (auditResult?.optimizedDescription) {
            setFormData(prev => ({ ...prev, description: auditResult.optimizedDescription }));
        }
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            // Update completeness stats and save
            await apiPost('/api/business/connect', { ...formData, connected: true });
            await apiPost('/api/dashboard/update-stats', { completenessScore: auditResult?.score || 0 });
            await apiPost('/api/dashboard/activity', {
                type: 'audit',
                message: 'Optimized business information attributes applied to the grounded profile.',
                icon: 'CheckCircle',
                color: 'text-[#708238]'
            });
        } catch (err) {
            console.error(err);
        } finally {
            setTimeout(() => {
                setIsSaving(false);
            }, 500);
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#2D2F27]">Profile Completeness & Audit</h1>
                    <p className="text-gray-500 mt-2">Edit NAP, hours, and attributes. Gemini scores the listing and writes a rank-ready description.</p>
                </div>
                <button
                    onClick={handleAudit}
                    disabled={isAuditing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#3D4F38] hover:bg-[#4A5E44] text-white rounded-xl font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                >
                    <Sparkles className={`w-5 h-5 ${isAuditing ? 'animate-spin' : ''}`} />
                    {isAuditing ? 'Analyzing Profile...' : 'Run AI Audit'}
                </button>
            </div>

            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            {auditResult && (
                <div className="bg-[#FAF9F5] border border-[#708238]/30 rounded-2xl p-6 mb-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-[#3D4F38] flex items-center gap-2">
                            <Sparkles className="w-5 h-5" /> Audit Results
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 font-semibold">Optimization Score:</span>
                            <span className="px-3 py-1 bg-white border border-[#E7E5E4] rounded-full font-bold text-[#D97706] shadow-sm">
                                {auditResult.score}/100
                            </span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-[#2D2F27] mb-2 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-[#708238]" /> AI Suggested Description
                            </h3>
                            <div className="bg-white p-4 rounded-xl border border-[#E7E5E4] text-sm text-gray-700 leading-relaxed relative group">
                                <p className="pr-20">{auditResult.optimizedDescription}</p>
                                <button
                                    onClick={handleApplyDescription}
                                    className="absolute top-2.5 right-2.5 text-xs bg-[#FAF9F5] hover:bg-[#E7E5E4] px-2.5 py-1 rounded-lg text-[#3D4F38] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-[#E7E5E4]"
                                >
                                    Apply to Form
                                </button>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-[#2D2F27] mb-2 flex items-center gap-1">
                                <ShieldAlert className="w-4 h-4 text-[#D97706]" /> Actionable Recommendations
                            </h3>
                            <ul className="space-y-2">
                                {auditResult.recommendations.map((rec: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-sm text-gray-600 bg-white p-3 rounded-lg border border-[#E7E5E4]">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] mt-1.5 shrink-0" />
                                        <span className="font-medium">{rec}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-[#E7E5E4] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#E7E5E4]">
                    <h2 className="text-lg font-bold text-[#2D2F27]">Business Information (NAP + Profile Metadata)</h2>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Business Name</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Primary Category</label>
                            <input
                                type="text"
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
                            <input
                                type="text"
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Website</label>
                            <input
                                type="url"
                                name="website"
                                value={formData.website}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Business Hours</label>
                            <input
                                type="text"
                                name="hours"
                                value={formData.hours}
                                onChange={handleChange}
                                placeholder="e.g. Mon-Fri: 9:00 AM - 5:00 PM"
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Business Attributes (Comma Separated)</label>
                            <input
                                type="text"
                                name="attributes"
                                value={formData.attributes}
                                onChange={handleChange}
                                placeholder="e.g. Wheelchair accessible entrance, Women-owned"
                                className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Business Description</label>
                        <textarea
                            rows={4}
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            className="w-full px-4 py-2 bg-[#FAF9F5] border border-[#E7E5E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#708238]/50 resize-none font-sans"
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            onClick={handleSaveChanges}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#708238] hover:bg-[#5e6d2f] text-white font-bold rounded-xl border border-transparent shadow shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
