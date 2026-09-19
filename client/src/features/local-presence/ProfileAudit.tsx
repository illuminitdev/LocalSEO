import { useEffect, useState } from 'react';
import {
    Wand2,
    Save,
    ShieldAlert,
    CheckCircle2,
    Pencil,
    MapPin,
    Phone,
    Clock,
    Globe,
    Tag,
    ExternalLink,
    Info,
    X,
    Loader2
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity, updateDashboardStats } from '../../shared/utils';
import VisibilityFixBanner from '../../shared/VisibilityFixBanner';

const REQUIRED_FIELDS = ['name', 'category', 'address', 'phone'] as const;

const DEFAULT_SCHEDULE = [
    { day: 'Monday', time: '5:00 – 10:30 PM' },
    { day: 'Tuesday', time: '5:00 – 10:30 PM' },
    { day: 'Wednesday', time: '5:00 – 10:30 PM' },
    { day: 'Thursday', time: '5:00 – 10:30 PM' },
    { day: 'Friday', time: '5:00 – 10:30 PM' },
    { day: 'Saturday', time: '12:00 – 2:00 PM, 5:00 – 10:30 PM' },
    { day: 'Sunday', time: '12:00 – 2:00 PM, 5:00 – 10:30 PM' }
];
const DEFAULT_ATTRIBUTES = [
    'south_indian_restaurant',
    'indian_restaurant',
    'restaurant',
    'food',
    'point_of_interest',
    'establishment'
];

const INITIAL_PROFILE = {
    name: 'Sravs Kitchen',
    category: 'South Indian Restaurant',
    address: '162 Portswood Rd, Portswood, Southampton SO17 2NJ, UK',
    phone: '023 8039 9221',
    website: 'https://sravskitchen.co.uk/',
    hours: 'Mon-Fri: 5:00 – 10:30 PM; Sat-Sun: 12:00 – 2:00 PM, 5:00 – 10:30 PM',
    attributes: 'south_indian_restaurant, indian_restaurant, restaurant, food, point_of_interest, establishment',
    description: 'Authentic South Indian culinary experience serving traditional dosas, curries, and regional delicacies in Southampton.'
};

export default function ProfileAudit() {
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savedOk, setSavedOk] = useState('');
    const [formData, setFormData] = useState({ ...INITIAL_PROFILE });
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

    const applyBusiness = (b: any) => {
        if (!b) return;
        setFormData({
            name: b?.name || INITIAL_PROFILE.name,
            category: b?.category || INITIAL_PROFILE.category,
            address: b?.address || INITIAL_PROFILE.address,
            phone: b?.phone || INITIAL_PROFILE.phone,
            website: b?.website || INITIAL_PROFILE.website,
            hours: b?.hours || INITIAL_PROFILE.hours,
            attributes: b?.attributes || INITIAL_PROFILE.attributes,
            description: b?.description || INITIAL_PROFILE.description
        });
    };

    const loadBusiness = async () => {
        try {
            const b = await apiGet('/api/business');
            if (b && b.name) {
                applyBusiness(b);
            }
        } catch {
            // Keep default realistic profile data
        }
    };

    useEffect(() => {
        loadBusiness();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (fieldErrors[name]) {
            setFieldErrors((prev) => ({ ...prev, [name]: false }));
        }
    };

    const saveBusinessProfile = async () => {
        await apiPost('/api/business/connect', { ...formData, connected: true });
    };

    const startEdit = () => {
        setError('');
        setSavedOk('');
        setFieldErrors({});
        setMode('edit');
    };

    const cancelEdit = () => {
        setError('');
        setFieldErrors({});
        setMode('view');
    };

    const handleAudit = async () => {
        setIsAuditing(true);
        setError('');
        try {
            await saveBusinessProfile();
            const data = await apiPost('/api/ai/audit', formData);
            setAuditResult(data);
            setMode('view');
            await logDashboardActivity({
                type: 'audit',
                message: `AI Profile Audit executed. Optimization Score: ${data.score}/100.`,
                icon: 'Activity',
                color: 'text-[#FF8800]'
            });
        } catch (err: any) {
            setError(err.message || 'Audit failed');
        } finally {
            setIsAuditing(false);
        }
    };

    const handleApplyDescription = () => {
        if (auditResult?.optimizedDescription) {
            setFormData((prev) => ({ ...prev, description: auditResult.optimizedDescription }));
            setMode('edit');
        }
    };

    const handleSaveChanges = async () => {
        const missing = REQUIRED_FIELDS.filter((k) => !String(formData[k] || '').trim());
        if (missing.length) {
            const nextErrors: Record<string, boolean> = {};
            missing.forEach((k) => {
                nextErrors[k] = true;
            });
            setFieldErrors(nextErrors);
            setError('Please complete all required fields.');
            return;
        }

        setIsSaving(true);
        setError('');
        setSavedOk('');
        try {
            await saveBusinessProfile();
            if (auditResult?.score) {
                await updateDashboardStats({ completenessScore: auditResult.score });
            }
            await logDashboardActivity({
                type: 'audit',
                message: 'Business profile saved and ready for AI Insights and other listing tools.',
                icon: 'CheckCircle',
                color: 'text-[#FF8800]'
            });
            setSavedOk('Business info saved. Connected to AI Insights, rankings, citations, and other listing tools.');
            setMode('view');
        } catch (err: any) {
            setError(err.message || 'Could not save profile');
        } finally {
            setIsSaving(false);
        }
    };

    // Attribute badges list
    const attributeList = formData.attributes
        ? formData.attributes
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : DEFAULT_ATTRIBUTES;

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <VisibilityFixBanner />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Business profile</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Add NAP, hours, and attributes once — then every listing tool uses the same business.
                    </p>
                </div>

                <button
                    onClick={handleAudit}
                    disabled={isAuditing}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-70 shadow-xs cursor-pointer shrink-0"
                >
                    {isAuditing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                        <Wand2 className="w-4 h-4 text-amber-300" />
                    )}
                    {isAuditing ? 'Analyzing Profile...' : 'Run AI audit'}
                </button>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {savedOk && (
                <p className="mb-6 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    {savedOk}
                </p>
            )}

            {/* Audit Results View (If Available) */}
            {auditResult && mode === 'view' && (
                <div className="bg-[#F8FAFC] border border-[#FF8800]/30 rounded-2xl p-6 mb-6 shadow-xs animate-in zoom-in duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-[#FF8800]" /> Audit Results
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-semibold">Optimization Score:</span>
                            <span className="px-3 py-1 bg-white border border-[#E2E8F0] rounded-full font-bold text-xs text-[#FF8800] shadow-xs">
                                {auditResult.score}/100
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {auditResult.optimizedDescription && (
                            <div>
                                <h3 className="text-xs font-bold text-[#0F172A] mb-1 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> AI Suggested Description
                                </h3>
                                <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] text-xs text-gray-700 leading-relaxed relative group">
                                    <p className="pr-20">{auditResult.optimizedDescription}</p>
                                    <button
                                        onClick={handleApplyDescription}
                                        className="absolute top-2.5 right-2.5 text-xs bg-[#F8FAFC] hover:bg-[#E2E8F0] px-2.5 py-1 rounded-lg text-[#0F172A] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-[#E2E8F0]"
                                    >
                                        Apply & edit
                                    </button>
                                </div>
                            </div>
                        )}

                        {Array.isArray(auditResult.recommendations) && auditResult.recommendations.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-[#0F172A] mb-2 flex items-center gap-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5 text-[#FF8800]" /> Actionable Recommendations
                                </h3>
                                <ul className="space-y-1.5">
                                    {auditResult.recommendations.map((rec: string, i: number) => (
                                        <li
                                            key={i}
                                            className="flex gap-2 text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-[#E2E8F0]"
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#FF8800] mt-1.5 shrink-0" />
                                            <span className="font-medium">{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Main Business Profile Card */}
            {mode === 'view' ? (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 md:p-8 shadow-xs">
                    {/* Header inside card */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                        <div>
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#FFF7ED] text-[#FF8800] mb-1.5">
                                SAVED LISTING
                            </span>
                            <h2 className="text-2xl font-bold text-[#0F172A] leading-tight">{formData.name}</h2>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">{formData.category}</p>
                        </div>

                        <button
                            type="button"
                            onClick={startEdit}
                            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-white hover:bg-gray-50 text-xs font-bold text-[#0F172A] cursor-pointer shadow-xs transition-colors self-start"
                        >
                            <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            Edit your business info
                        </button>
                    </div>

                    {/* 2x2 Grid of Info Boxes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* ADDRESS Box */}
                        <div className="rounded-xl border border-[#E2E8F0] p-4 flex items-start gap-3.5 bg-white shadow-xs">
                            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                                <MapPin className="w-4 h-4 text-[#FF8800]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">ADDRESS</p>
                                <p className="text-xs font-semibold text-[#0F172A] leading-relaxed break-words">
                                    {formData.address}
                                </p>
                            </div>
                        </div>

                        {/* PHONE Box */}
                        <div className="rounded-xl border border-[#E2E8F0] p-4 flex items-start gap-3.5 bg-white shadow-xs">
                            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                                <Phone className="w-4 h-4 text-[#FF8800]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">PHONE</p>
                                <p className="text-xs font-semibold text-[#0F172A]">{formData.phone}</p>
                            </div>
                        </div>

                        {/* HOURS Box */}
                        <div className="rounded-xl border border-[#E2E8F0] p-4 flex items-start gap-3.5 bg-white shadow-xs">
                            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                                <Clock className="w-4 h-4 text-[#FF8800]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">HOURS</p>
                                <div className="space-y-1 text-xs text-[#0F172A]">
                                    {DEFAULT_SCHEDULE.map((item) => (
                                        <div key={item.day} className="grid grid-cols-[85px_1fr] gap-2">
                                            <span className="text-gray-500 font-medium">{item.day}</span>
                                            <span className="font-semibold">{item.time}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* WEBSITE Box */}
                        <div className="rounded-xl border border-[#E2E8F0] p-4 flex items-start gap-3.5 bg-white shadow-xs">
                            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                                <Globe className="w-4 h-4 text-[#FF8800]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">WEBSITE</p>
                                {formData.website ? (
                                    <a
                                        href={formData.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-semibold text-[#FF8800] hover:underline inline-flex items-center gap-1.5 break-all"
                                    >
                                        {formData.website}
                                        <ExternalLink className="w-3.5 h-3.5 text-[#FF8800] shrink-0" />
                                    </a>
                                ) : (
                                    <p className="text-xs text-gray-400 font-medium">Not provided</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ATTRIBUTES Full-Width Box */}
                    <div className="rounded-xl border border-[#E2E8F0] p-4 flex items-start gap-3.5 bg-white shadow-xs mt-4">
                        <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                            <Tag className="w-4 h-4 text-[#FF8800]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2">ATTRIBUTES</p>
                            <div className="flex flex-wrap gap-2">
                                {attributeList.map((attr, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-block px-3 py-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-full text-xs font-medium text-gray-700"
                                    >
                                        {attr}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Info Note */}
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 mt-5 flex items-center gap-2 text-xs text-gray-500 font-normal">
                        <Info className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>This profile powers AI Insights, Local Search Grid, citations, posts, media, reviews, and Q&A.</span>
                    </div>
                </div>
            ) : (
                /* Edit Mode Card */
                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 md:p-8">
                    <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-[#0F172A]">Edit business information</h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Keep your business NAP, hours, and attributes up to date.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={cancelEdit}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Business Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className={`w-full px-3.5 py-2 bg-white border rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800] ${
                                    fieldErrors.name ? 'border-red-400' : 'border-[#E2E8F0]'
                                }`}
                                placeholder="Sravs Kitchen"
                            />
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Primary Category <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className={`w-full px-3.5 py-2 bg-white border rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800] ${
                                    fieldErrors.category ? 'border-red-400' : 'border-[#E2E8F0]'
                                }`}
                                placeholder="South Indian Restaurant"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-bold text-gray-700 mb-1">
                                Address <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                className={`w-full px-3.5 py-2 bg-white border rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800] ${
                                    fieldErrors.address ? 'border-red-400' : 'border-[#E2E8F0]'
                                }`}
                                placeholder="162 Portswood Rd, Portswood, Southampton SO17 2NJ, UK"
                            />
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Phone Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className={`w-full px-3.5 py-2 bg-white border rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800] ${
                                    fieldErrors.phone ? 'border-red-400' : 'border-[#E2E8F0]'
                                }`}
                                placeholder="023 8039 9221"
                            />
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-1">Website</label>
                            <input
                                type="url"
                                name="website"
                                value={formData.website}
                                onChange={handleChange}
                                className="w-full px-3.5 py-2 bg-white border border-[#E2E8F0] rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800]"
                                placeholder="https://sravskitchen.co.uk/"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-bold text-gray-700 mb-1">Hours / Schedule</label>
                            <input
                                type="text"
                                name="hours"
                                value={formData.hours}
                                onChange={handleChange}
                                className="w-full px-3.5 py-2 bg-white border border-[#E2E8F0] rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800]"
                                placeholder="Mon-Fri: 5:00 – 10:30 PM; Sat-Sun: 12:00 – 2:00 PM, 5:00 – 10:30 PM"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-bold text-gray-700 mb-1">
                                Attributes (comma separated)
                            </label>
                            <input
                                type="text"
                                name="attributes"
                                value={formData.attributes}
                                onChange={handleChange}
                                className="w-full px-3.5 py-2 bg-white border border-[#E2E8F0] rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800]"
                                placeholder="south_indian_restaurant, indian_restaurant, restaurant, food, point_of_interest, establishment"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block font-bold text-gray-700 mb-1">Description</label>
                            <textarea
                                rows={3}
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="w-full px-3.5 py-2 bg-white border border-[#E2E8F0] rounded-xl font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FF8800]/20 focus:border-[#FF8800] resize-none"
                                placeholder="Write a brief overview of your business..."
                            />
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#E2E8F0] text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveChanges}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[#FF8800] hover:bg-[#E67A00] text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-colors disabled:opacity-70"
                        >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {isSaving ? 'Saving...' : 'Save business info'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
