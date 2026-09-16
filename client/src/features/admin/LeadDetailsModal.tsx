import {
    X,
    Phone,
    Mail,
    Globe,
    ExternalLink,
    MessageSquare,
    MapPin,
    Store,
    Bot,
    Sparkles,
    CheckSquare,
    ShieldCheck
} from 'lucide-react';
import { cn } from '../../shared/utils';
import type { GrowthAuditLeadRef } from './LeadCrmDrawer';

interface LeadDetailsModalProps {
    isOpen: boolean;
    lead: GrowthAuditLeadRef | null;
    onClose: () => void;
    onOpenManageTasks?: (lead: GrowthAuditLeadRef) => void;
}

export default function LeadDetailsModal({
    isOpen,
    lead,
    onClose,
    onOpenManageTasks
}: LeadDetailsModalProps) {
    if (!isOpen || !lead) return null;

    const bizName = lead.businessName || lead.name || 'Lead Details';
    const cleanPhone = (lead.phone || '').replace(/[^0-9+]/g, '');
    const displayScore = lead.scoreTotal ?? lead.leadScoreTotal;
    const oppLevel = String(lead.opportunityLevel || '').toLowerCase();
    const conclusion = lead.notes || (lead as any).conclusion || (lead as any).auditConclusion || '';

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-black text-slate-900 truncate tracking-tight">
                                {bizName}
                            </h2>
                            {(lead.industry || lead.serviceLabel || lead.service) && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                                    {lead.industry || lead.serviceLabel || lead.service}
                                </span>
                            )}
                            {lead.status && (
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                                    lead.status === 'converted' ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                    lead.status === 'interested' ? "bg-blue-100 text-blue-800 border border-blue-200" :
                                    "bg-slate-100 text-slate-700 border border-slate-200"
                                )}>
                                    {lead.status}
                                </span>
                            )}
                            {lead.isCustomer && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-2xs">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Customer
                                </span>
                            )}
                            {displayScore != null && (
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-bold",
                                    displayScore >= 70 ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                    displayScore >= 40 ? "bg-amber-100 text-amber-800 border border-amber-200" :
                                    "bg-rose-100 text-rose-800 border border-rose-200"
                                )}>
                                    Score: {displayScore}/100
                                </span>
                            )}
                        </div>

                        {/* Quick Contact Bar */}
                        <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
                            {lead.phone && (
                                <a
                                    href={`tel:${cleanPhone}`}
                                    className="inline-flex items-center gap-1.5 font-bold text-amber-800 hover:text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs transition-colors"
                                >
                                    <Phone className="w-3.5 h-3.5 text-amber-600" />
                                    {lead.phone}
                                </a>
                            )}
                            {lead.phone && (
                                <a
                                    href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-bold text-emerald-800 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs transition-colors"
                                >
                                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                    WhatsApp
                                </a>
                            )}
                            {lead.email && (
                                <a
                                    href={`mailto:${lead.email}`}
                                    className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-indigo-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs transition-colors"
                                >
                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                    {lead.email}
                                </a>
                            )}
                            {lead.website && (
                                <a
                                    href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:underline bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs transition-colors"
                                >
                                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                                    {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                </a>
                            )}
                            {lead.reportUrl && (
                                <a
                                    href={lead.reportUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Full Audit Report
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {onOpenManageTasks && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenManageTasks(lead);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-colors shadow-2xs"
                            >
                                <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                                <span>Manage Tasks</span>
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
                    {/* Address Bar if present */}
                    {lead.address && (
                        <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs flex items-center gap-2 text-slate-700 shadow-2xs">
                            <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-medium">{lead.address}</span>
                        </div>
                    )}

                    {/* Opportunity & Value Pitch */}
                    {(lead.leadOpportunity || lead.opportunityLevel) && (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border border-emerald-200 text-xs text-emerald-950 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                                        <Sparkles className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="font-bold text-emerald-900 uppercase tracking-wider text-[11px]">
                                        Lead Opportunity & Sales Pitch
                                    </span>
                                </div>
                                {lead.opportunityLevel && (
                                    <span className={cn(
                                        "font-black uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full border",
                                        oppLevel === 'high' ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs" :
                                        oppLevel === 'low' ? "bg-slate-200 text-slate-700 border-slate-300" :
                                        "bg-amber-500 text-white border-amber-600 shadow-2xs"
                                    )}>
                                        {lead.opportunityLevel} Opportunity
                                    </span>
                                )}
                            </div>
                            {lead.leadOpportunity && (
                                <p className="text-emerald-900 font-semibold leading-relaxed text-sm pt-1">
                                    {lead.leadOpportunity}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Google Business Profile (GBP) Observations */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                            <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Store className="w-3.5 h-3.5" />
                            </div>
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                Google Business Profile (GBP) Observations
                            </h3>
                        </div>
                        {lead.gbpObservation ? (
                            <div className="text-slate-700 text-xs whitespace-pre-line leading-relaxed pl-1 pt-1 font-normal">
                                {lead.gbpObservation}
                            </div>
                        ) : (
                            <p className="text-slate-400 text-xs italic pl-1">No GBP observations recorded.</p>
                        )}
                    </div>

                    {/* AI Visibility Observations */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <Bot className="w-3.5 h-3.5" />
                            </div>
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                AI Visibility Observations (Search / Perplexity / Gemini)
                            </h3>
                        </div>
                        {lead.aiVisibilityObservation ? (
                            <div className="text-slate-700 text-xs whitespace-pre-line leading-relaxed pl-1 pt-1 font-normal">
                                {lead.aiVisibilityObservation}
                            </div>
                        ) : (
                            <p className="text-slate-400 text-xs italic pl-1">No AI visibility observations recorded.</p>
                        )}
                    </div>

                    {/* Conclusion & Audit Notes */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                            <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                                <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                Conclusion & Audit Notes
                            </h3>
                        </div>
                        {conclusion ? (
                            <div className="text-slate-700 text-xs whitespace-pre-line leading-relaxed pl-1 pt-1 font-normal">
                                {conclusion}
                            </div>
                        ) : (
                            <p className="text-slate-400 text-xs italic pl-1">No conclusion notes recorded.</p>
                        )}
                    </div>

                    {/* Additional Metadata */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-white border border-slate-200 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lead Source</span>
                            <span className="text-xs font-semibold text-slate-700">{lead.source || 'Manual / Excel'}</span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Created Date</span>
                            <span className="text-xs font-semibold text-slate-700">
                                {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                            </span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer Status</span>
                            <span className={cn("text-xs font-semibold", lead.isCustomer ? "text-emerald-700" : "text-slate-700")}>
                                {lead.isCustomer ? 'Converted Customer' : 'Lead'}
                            </span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lead ID</span>
                            <span className="text-xs font-mono text-slate-500 truncate block" title={lead.id}>
                                {lead.id.slice(0, 8)}...
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        Close
                    </button>
                    {onOpenManageTasks && (
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onOpenManageTasks(lead);
                            }}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors shadow-md shadow-amber-500/20"
                        >
                            <CheckSquare className="w-4 h-4" />
                            <span>Manage & Assign Tasks</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
