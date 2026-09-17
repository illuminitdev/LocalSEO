import React, { useState } from 'react';
import {
    X,
    Building2,
    Phone,
    Mail,
    Globe,
    MapPin,
    Lightbulb,
    Loader2,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';

interface AddLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newLead?: any) => void;
    createLeadHandler: (leadData: any) => Promise<any>;
    industryOptions?: string[];
}

const DEFAULT_INDUSTRIES = [
    'Landscaping',
    'Pestcontrol',
    'Dampproofing',
    'Skin Care',
    'Care Homes',
    'Plumbing',
    'Roofing',
    'Electrician',
    'General'
];

export default function AddLeadModal({
    isOpen,
    onClose,
    onSuccess,
    createLeadHandler,
    industryOptions = DEFAULT_INDUSTRIES
}: AddLeadModalProps) {
    const [businessName, setBusinessName] = useState('');
    const [contactName, setContactName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [industry, setIndustry] = useState(industryOptions[0] || 'Landscaping');
    const [address, setAddress] = useState('');
    const [website, setWebsite] = useState('');
    const [gbpObservation, setGbpObservation] = useState('');
    const [aiVisibilityObservation, setAiVisibilityObservation] = useState('');
    const [leadOpportunity, setLeadOpportunity] = useState('');
    const [opportunityLevel, setOpportunityLevel] = useState<'high' | 'medium' | 'low'>('medium');
    const [status, setStatus] = useState('new');
    const [notes, setNotes] = useState('');
    const [nextFollowUpAt, setNextFollowUpAt] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!businessName.trim()) {
            setError('Business name is required.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const lead = await createLeadHandler({
                businessName: businessName.trim(),
                name: contactName.trim() || businessName.trim(),
                phone: phone.trim(),
                email: email.trim(),
                industry: industry.trim(),
                address: address.trim(),
                website: website.trim(),
                gbpObservation: gbpObservation.trim(),
                aiVisibilityObservation: aiVisibilityObservation.trim(),
                leadOpportunity: leadOpportunity.trim(),
                opportunityLevel,
                status,
                notes: notes.trim(),
                nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null
            });

            onSuccess(lead);
            onClose();
        } catch (err: any) {
            console.error('Failed to create lead:', err);
            setError(err.message || 'Failed to create lead. Please check details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Add New Lead</h2>
                            <p className="text-xs text-slate-500">
                                Enter company details, audit observations, and outreach notes
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
                    {error && (
                        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Section: Business Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Business Name <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. JDM Gardens"
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Business Category (Optional)
                            </label>
                            <input
                                list="industry-suggestions"
                                type="text"
                                placeholder="e.g. Dentist, Plumber, Landscaping"
                                value={industry}
                                onChange={(e) => setIndustry(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                            <datalist id="industry-suggestions">
                                {industryOptions.map((opt) => (
                                    <option key={opt} value={opt} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Contact Person (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. John Doe (Owner)"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Business Phone (Optional)
                            </label>
                            <div className="relative">
                                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    placeholder="e.g. 07810 310170"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Email Address (Optional)
                            </label>
                            <div className="relative">
                                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="email"
                                    placeholder="contact@business.co.uk"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Town / Postcode / Location (Optional)
                            </label>
                            <div className="relative">
                                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    placeholder="e.g. 26 Whitehaven Rd, Stockport"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Website URL (Optional)
                            </label>
                            <div className="relative">
                                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    placeholder="https://example.com"
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section: Observations & Pitch Opportunities */}
                    <div className="pt-2 border-t border-slate-100 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                    Opportunity Priority Level (Optional)
                                </label>
                                <select
                                    value={opportunityLevel}
                                    onChange={(e) => setOpportunityLevel(e.target.value as any)}
                                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
                                >
                                    <option value="high">🔥 High Opportunity (Hot)</option>
                                    <option value="medium">⚡ Medium Opportunity</option>
                                    <option value="low">🌱 Low Opportunity</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                    Initial Status (Optional)
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                >
                                    <option value="new">New Lead</option>
                                    <option value="contacted">Contacted</option>
                                    <option value="callback">Callback Scheduled</option>
                                    <option value="interested">Interested</option>
                                    <option value="not_interested">Not Interested</option>
                                    <option value="converted">Converted Customer</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                Lead Opportunity & Pitch Angle (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. High and also we can pitch for Booking System"
                                value={leadOpportunity}
                                onChange={(e) => setLeadOpportunity(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                My Observation: Google Business Profile (GBP) (Optional)
                            </label>
                            <textarea
                                rows={2}
                                placeholder="e.g. 1. Categories: correct, 2. Services: missing, 3. Reviews: No replies..."
                                value={gbpObservation}
                                onChange={(e) => setGbpObservation(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                My Observation: AI Visibility (Search / Perplexity / Gemini) (Optional)
                            </label>
                            <textarea
                                rows={2}
                                placeholder="e.g. 1. What are the best landscaping companies in Bolton? Ans: Not listed"
                                value={aiVisibilityObservation}
                                onChange={(e) => setAiVisibilityObservation(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                My Conclusion & Summary Notes (Optional)
                            </label>
                            <textarea
                                rows={2}
                                placeholder="e.g. Needs immediate review response strategy & citation cleanup"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                                Next Follow-up Date (Optional)
                            </label>
                            <input
                                type="datetime-local"
                                value={nextFollowUpAt}
                                onChange={(e) => setNextFollowUpAt(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
                            />
                        </div>
                    </div>

                    {/* Footer buttons */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !businessName.trim()}
                            className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Saving Lead...</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Save Lead</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
