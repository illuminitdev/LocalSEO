import { useEffect, useState } from 'react';
import {
    Sparkles,
    Save,
    ShieldAlert,
    CheckCircle2,
    Building2,
    Pencil,
    Plus,
    MapPin,
    Phone,
    Clock,
    X
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity, updateDashboardStats } from '../lib/utils';

const REQUIRED_FIELDS = ['name', 'category', 'address', 'phone', 'hours', 'attributes'] as const;

const FIELD_LABELS: Record<string, string> = {
    name: 'Business Name',
    category: 'Primary Category',
    address: 'Address',
    phone: 'Phone Number',
    hours: 'Business Hours',
    attributes: 'Business Attributes'
};

const EMPTY_FORM = {
    name: '',
    category: '',
    address: '',
    phone: '',
    website: '',
    hours: '',
    attributes: '',
    description: ''
};

function RequiredMark() {
    return (
        <span className="text-red-600 ml-0.5" aria-hidden="true">
            *
        </span>
    );
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-sm font-semibold text-gray-700 mb-1">
            {children}
            {required && <RequiredMark />}
        </label>
    );
}

function validateProfileForm(formData: Record<string, string>) {
    const missing = REQUIRED_FIELDS.filter((key) => !String(formData[key] || '').trim());
    if (!missing.length) return '';
    return `Please complete required fields: ${missing.map((key) => FIELD_LABELS[key]).join(', ')}.`;
}

function hasSavedProfile(b: any) {
    return Boolean(b?.connected && String(b?.name || '').trim());
}

export default function ProfileAudit() {
    const [mode, setMode] = useState<'loading' | 'empty' | 'view' | 'edit'>('loading');
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savedOk, setSavedOk] = useState('');

    const [formData, setFormData] = useState({ ...EMPTY_FORM });
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

    const applyBusiness = (b: any) => {
        setFormData({
            name: b?.name || '',
            category: b?.category || '',
            address: b?.address || '',
            phone: b?.phone || '',
            website: b?.website || '',
            hours: b?.hours || '',
            attributes: b?.attributes || '',
            description: b?.description || ''
        });
    };

    const loadBusiness = async () => {
        try {
            const b = await apiGet('/api/business');
            applyBusiness(b);
            setMode(hasSavedProfile(b) ? 'view' : 'empty');
        } catch {
            setMode('empty');
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

    const markFieldErrors = () => {
        const next: Record<string, boolean> = {};
        for (const key of REQUIRED_FIELDS) {
            next[key] = !String(formData[key] || '').trim();
        }
        setFieldErrors(next);
    };

    const saveBusinessProfile = async () => {
        await apiPost('/api/business/connect', { ...formData, connected: true });
    };

    const startAdd = () => {
        setError('');
        setSavedOk('');
        setAuditResult(null);
        setFieldErrors({});
        setFormData({ ...EMPTY_FORM });
        setMode('edit');
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
        loadBusiness();
    };

    const handleAudit = async () => {
        if (mode !== 'edit' && mode !== 'view') {
            setError('Add your business info first.');
            return;
        }
        const validationError = validateProfileForm(formData);
        if (validationError) {
            markFieldErrors();
            setError(validationError);
            if (mode === 'view') setMode('edit');
            return;
        }

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
            setFormData((prev) => ({ ...prev, description: auditResult.optimizedDescription }));
            setMode('edit');
        }
    };

    const handleSaveChanges = async () => {
        const validationError = validateProfileForm(formData);
        if (validationError) {
            markFieldErrors();
            setError(validationError);
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
                color: 'text-[#F59E0B]'
            });
            setSavedOk('Business info saved. Connected to AI Insights, rankings, citations, and other listing tools.');
            setMode('view');
        } catch (err: any) {
            setError(err.message || 'Could not save profile');
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass = (name: string) =>
        `w-full px-4 py-2.5 bg-[#F8FAFC] border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/50 ${
            fieldErrors[name] ? 'border-red-400 ring-1 ring-red-200' : 'border-[#E2E8F0]'
        }`;

    if (mode === 'loading') {
        return (
            <div className="max-w-4xl mx-auto py-16 text-center text-[#64748B] text-sm">
                Loading business profile…
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-8">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D97706]">Manage listings</p>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0F172A] mt-1">Business profile</h1>
                    <p className="text-gray-500 mt-2">
                        Add NAP, hours, and attributes once — then every listing tool uses the same business.
                    </p>
                </div>
                {mode !== 'empty' && (
                    <button
                        onClick={handleAudit}
                        disabled={isAuditing}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                    >
                        <Sparkles className={`w-5 h-5 ${isAuditing ? 'animate-spin' : ''}`} />
                        {isAuditing ? 'Analyzing Profile...' : 'Run AI Audit'}
                    </button>
                )}
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}
            {savedOk && (
                <p className="mb-6 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    {savedOk}
                </p>
            )}

            {auditResult && mode === 'view' && (
                <div className="bg-[#F8FAFC] border border-[#F59E0B]/30 rounded-2xl p-6 mb-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                            <Sparkles className="w-5 h-5" /> Audit Results
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 font-semibold">Optimization Score:</span>
                            <span className="px-3 py-1 bg-white border border-[#E2E8F0] rounded-full font-bold text-[#D97706] shadow-sm">
                                {auditResult.score}/100
                            </span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-[#0F172A] mb-2 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-[#F59E0B]" /> AI Suggested Description
                            </h3>
                            <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] text-sm text-gray-700 leading-relaxed relative group">
                                <p className="pr-20">{auditResult.optimizedDescription}</p>
                                <button
                                    onClick={handleApplyDescription}
                                    className="absolute top-2.5 right-2.5 text-xs bg-[#F8FAFC] hover:bg-[#E2E8F0] px-2.5 py-1 rounded-lg text-[#0F172A] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-[#E2E8F0]"
                                >
                                    Apply & edit
                                </button>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-[#0F172A] mb-2 flex items-center gap-1">
                                <ShieldAlert className="w-4 h-4 text-[#D97706]" /> Actionable Recommendations
                            </h3>
                            <ul className="space-y-2">
                                {(auditResult.recommendations || []).map((rec: string, i: number) => (
                                    <li
                                        key={i}
                                        className="flex gap-2 text-sm text-gray-600 bg-white p-3 rounded-lg border border-[#E2E8F0]"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] mt-1.5 shrink-0" />
                                        <span className="font-medium">{rec}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'empty' && (
                <div className="bg-white rounded-2xl border border-dashed border-[#E2E8F0] shadow-sm px-6 py-14 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center mx-auto mb-4">
                        <Building2 className="w-7 h-7 text-[#D97706]" />
                    </div>
                    <h2 className="text-xl font-bold text-[#0F172A]">Add your business info</h2>
                    <p className="text-sm text-[#64748B] mt-2 max-w-md mx-auto">
                        Enter NAP, hours, and attributes once. AI Insights, citations, posts, reviews, and rankings all use
                        this same profile.
                    </p>
                    <button
                        type="button"
                        onClick={startAdd}
                        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add business info
                    </button>
                </div>
            )}

            {mode === 'view' && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-[#FFFBEB]/70 to-white">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-[#D97706]">Saved listing</p>
                            <h2 className="text-xl font-bold text-[#0F172A] mt-1">{formData.name}</h2>
                            <p className="text-sm text-[#64748B] mt-0.5">{formData.category}</p>
                        </div>
                        <button
                            type="button"
                            onClick={startEdit}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                        >
                            <Pencil className="w-4 h-4" />
                            Edit your business info
                        </button>
                    </div>
                    <div className="p-6 grid sm:grid-cols-2 gap-4 text-sm">
                        <div className="flex gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <MapPin className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Address</p>
                                <p className="text-[#0F172A] font-medium mt-0.5">{formData.address || '—'}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <Phone className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Phone</p>
                                <p className="text-[#0F172A] font-medium mt-0.5">{formData.phone || '—'}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <Clock className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Hours</p>
                                <p className="text-[#0F172A] font-medium mt-0.5">{formData.hours || '—'}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <Building2 className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Website</p>
                                <p className="text-[#0F172A] font-medium mt-0.5 break-all">{formData.website || '—'}</p>
                            </div>
                        </div>
                        {formData.attributes && (
                            <div className="sm:col-span-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Attributes</p>
                                <p className="text-[#0F172A] font-medium mt-1">{formData.attributes}</p>
                            </div>
                        )}
                        {formData.description && (
                            <div className="sm:col-span-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide">Description</p>
                                <p className="text-[#334155] mt-1 leading-relaxed">{formData.description}</p>
                            </div>
                        )}
                    </div>
                    <div className="px-6 pb-6">
                        <p className="text-xs text-[#94A3B8]">
                            This profile powers AI Insights, Local Search Grid, citations, posts, media, reviews, and Q&A.
                        </p>
                    </div>
                </div>
            )}

            {mode === 'edit' && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-[#0F172A]">
                                {formData.name ? 'Edit business information' : 'Add business information'}
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                <span className="text-red-600">*</span> Required fields (website and description are optional)
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={cancelEdit}
                            className="p-2 rounded-lg text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                            aria-label="Cancel"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <FieldLabel required>Business Name</FieldLabel>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className={inputClass('name')}
                                />
                            </div>
                            <div>
                                <FieldLabel required>Primary Category</FieldLabel>
                                <input
                                    type="text"
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    required
                                    className={inputClass('category')}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FieldLabel required>Address</FieldLabel>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    required
                                    className={inputClass('address')}
                                />
                            </div>
                            <div>
                                <FieldLabel required>Phone Number</FieldLabel>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    className={inputClass('phone')}
                                />
                            </div>
                            <div>
                                <FieldLabel>Website</FieldLabel>
                                <input
                                    type="url"
                                    name="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    className={inputClass('website')}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FieldLabel required>Business Hours</FieldLabel>
                                <input
                                    type="text"
                                    name="hours"
                                    value={formData.hours}
                                    onChange={handleChange}
                                    required
                                    placeholder="e.g. Mon-Fri: 9:00 AM - 5:00 PM"
                                    className={inputClass('hours')}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <FieldLabel required>Business Attributes (Comma Separated)</FieldLabel>
                                <input
                                    type="text"
                                    name="attributes"
                                    value={formData.attributes}
                                    onChange={handleChange}
                                    required
                                    placeholder="e.g. Wheelchair accessible entrance, Women-owned"
                                    className={inputClass('attributes')}
                                />
                            </div>
                        </div>

                        <div>
                            <FieldLabel>Business Description</FieldLabel>
                            <textarea
                                rows={4}
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/50 resize-none font-sans"
                            />
                        </div>

                        <div className="pt-2 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveChanges}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save business info'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
