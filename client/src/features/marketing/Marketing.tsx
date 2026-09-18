import { useEffect, useState } from 'react';
import { Megaphone, Send, Link2, Copy, Check, X, FileText, Mail, BarChart2 } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../shared/utils';

export default function Marketing() {
    const [site, setSite] = useState({ siteHeadline: '', siteBlurb: '', siteServices: '', marketingEnabled: true });
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [bodyText, setBodyText] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [slug, setSlug] = useState('');
    const [copied, setCopied] = useState(false);
    const [showBanner, setShowBanner] = useState(true);
    const [savingSite, setSavingSite] = useState(false);
    const [sendingCampaign, setSendingCampaign] = useState(false);

    const load = async () => {
        try {
            const me = await apiGet('/api/auth/me');
            setSlug(me.organization?.slug || '');
            setSite({
                siteHeadline: me.organization?.site_headline || '',
                siteBlurb: me.organization?.site_blurb || '',
                siteServices: me.organization?.site_services || '',
                marketingEnabled: me.organization?.marketing_enabled !== false
            });
            const res = await apiGet('/api/host/campaigns');
            setCampaigns(res.campaigns || []);
        } catch (e: any) {
            setError(e.message);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const miniSiteUrl = `zappsites.co/${slug || 'karun'}`;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(`https://${miniSiteUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveSite = async () => {
        setSavingSite(true);
        setError('');
        try {
            await apiPatch('/api/host/marketing/site', site);
            setInfo('Mini-site saved successfully!');
            setTimeout(() => setInfo(''), 3000);
        } catch (e: any) {
            setError(e.message || 'Failed to save mini-site');
        } finally {
            setSavingSite(false);
        }
    };

    const handleSendCampaign = async (isDraft = false) => {
        if (!name.trim()) {
            setError('Please enter a campaign name');
            return;
        }
        setSendingCampaign(true);
        setError('');
        try {
            const created = await apiPost('/api/host/campaigns', { name, subject, bodyText, statusFilter });
            if (!isDraft) {
                const sent = await apiPost(`/api/host/campaigns/${created.campaign.id}/send`, {});
                setInfo(`Campaign sent successfully to ${sent.campaign.sent_count || 0} clients!`);
            } else {
                setInfo('Campaign saved as draft');
            }
            setName('');
            setSubject('');
            setBodyText('');
            setTimeout(() => setInfo(''), 3500);
            load();
        } catch (e: any) {
            setError(e.message || 'Failed to process campaign');
        } finally {
            setSendingCampaign(false);
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
            {/* Header with Promo Callout */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Marketing</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Create and manage your mini-site, email campaigns and client referrals.
                    </p>
                </div>

                {/* Top-Right Callout */}
                <div className="flex items-center gap-3 bg-amber-50/70 border border-amber-100 rounded-2xl px-4 py-3 max-w-sm">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                        <Megaphone className="w-5 h-5 text-[#FF7A00]" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-900">Reach more local clients</h4>
                        <p className="text-xs text-slate-500">Keep your services visible and get more bookings.</p>
                    </div>
                </div>
            </div>

            {/* Notification Alerts */}
            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            {info && (
                <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span>{info}</span>
                    <button onClick={() => setInfo('')} className="text-emerald-400 hover:text-emerald-600">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* 2-Column Split Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                {/* Left Card: Public mini-site */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
                    <div className="space-y-4">
                        {/* Card Header */}
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#FF7A00] flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Public mini-site</h2>
                                <p className="text-xs text-slate-500">Create a simple page to showcase your services.</p>
                            </div>
                        </div>

                        {/* Headline */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Headline</label>
                            <input
                                value={site.siteHeadline}
                                onChange={(e) => setSite((s) => ({ ...s, siteHeadline: e.target.value }))}
                                placeholder="Professional Local SEO Services"
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF7A00] transition"
                            />
                        </div>

                        {/* Short blurb */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Short blurb</label>
                            <textarea
                                value={site.siteBlurb}
                                onChange={(e) => setSite((s) => ({ ...s, siteBlurb: e.target.value }))}
                                placeholder="Helping local businesses get found online with effective SEO strategies."
                                rows={3}
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF7A00] transition resize-y"
                            />
                        </div>

                        {/* Services (one per line) */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Services (one per line)</label>
                            <textarea
                                value={site.siteServices}
                                onChange={(e) => setSite((s) => ({ ...s, siteServices: e.target.value }))}
                                placeholder={`Local SEO Audit\nGoogle Business Profile Optimization\nOn-page SEO\nContent Strategy\nMonthly Reporting`}
                                rows={5}
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-[#FF7A00] transition resize-y"
                            />
                        </div>

                        {/* Link Preview Box */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/60 flex items-center justify-center shrink-0 text-slate-500">
                                    <Link2 className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                    <p className="text-[11px] font-medium text-slate-500">Your mini-site will be available at</p>
                                    <a
                                        href={`https://${miniSiteUrl}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-[#FF7A00] hover:underline truncate block"
                                    >
                                        {miniSiteUrl}
                                    </a>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyLink}
                                className="shrink-0 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-xs"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                                <span>{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={handleSaveSite}
                            disabled={savingSite}
                            className="rounded-xl bg-[#FF7A00] hover:bg-[#E66E00] text-white px-6 py-2.5 text-sm font-bold transition shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                        >
                            {savingSite ? 'Saving...' : 'Save site'}
                        </button>
                    </div>
                </div>

                {/* Right Card: New email campaign */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
                    <div className="space-y-4">
                        {/* Card Header */}
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Mail className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">New email campaign</h2>
                                <p className="text-xs text-slate-500">Send updates, offers or announcements to your clients.</p>
                            </div>
                        </div>

                        {/* Campaign Name */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Campaign name</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Client update"
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                            />
                        </div>

                        {/* Subject */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Subject</label>
                            <input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Exciting updates for your business"
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                            />
                        </div>

                        {/* Message */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Message</label>
                            <textarea
                                value={bodyText}
                                onChange={(e) => setBodyText(e.target.value)}
                                placeholder={`Hi {{name}},\n\nWe've added new services and features to help your business grow. Let us know if you'd like to schedule a quick call.\n\nBest regards,\nKarun\nZappSites`}
                                rows={6}
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition resize-y font-sans"
                            />
                        </div>

                        {/* Send to */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">Send to</label>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer"
                                >
                                    <option value="active">Active clients</option>
                                    <option value="all">All clients</option>
                                    <option value="lead">Leads</option>
                                    <option value="inactive">Inactive clients</option>
                                </select>
                                <span className="text-xs text-slate-500">This will be sent to all active clients in your list.</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handleSendCampaign(false)}
                            disabled={sendingCampaign}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#FF7A00] hover:bg-[#E66E00] text-white px-5 py-2.5 text-sm font-bold transition shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                        >
                            <Send className="w-4 h-4" /> {sendingCampaign ? 'Sending...' : 'Create & send'}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSendCampaign(true)}
                            disabled={sendingCampaign}
                            className="rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 text-sm font-bold transition shadow-xs active:scale-[0.98] cursor-pointer"
                        >
                            Save as draft
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Dismissible Tip Banner */}
            {showBanner && (
                <div className="bg-[#F0F6FE] border border-[#D5E6FB] rounded-2xl p-4 flex items-center justify-between gap-4 transition animate-in fade-in">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#E1EEFF] text-blue-600 flex items-center justify-center shrink-0">
                            <BarChart2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-800">
                                Marketing helps you stay connected with your clients and grow your business.
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Try sharing your mini-site link or sending a quick update this week.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowBanner(false)}
                        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white/60 transition"
                        title="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Previous Campaigns (if any) */}
            {campaigns.length > 0 && (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Campaign History</h3>
                    <div className="divide-y divide-slate-100">
                        {campaigns.map((c) => (
                            <div key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                                <div>
                                    <p className="font-bold text-slate-800">{c.name}</p>
                                    <p className="text-xs text-slate-500">{c.subject || 'No subject'}</p>
                                </div>
                                <div className="text-right">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                                        {c.status}
                                    </span>
                                    <p className="text-xs text-slate-400 mt-0.5">{c.sent_count || 0} sent</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
