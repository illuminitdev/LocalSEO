import { useEffect, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../shared/utils';

export default function Marketing() {
    const [site, setSite] = useState({ siteHeadline: '', siteBlurb: '', siteServices: '', marketingEnabled: true });
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [name, setName] = useState('Client update');
    const [subject, setSubject] = useState('');
    const [bodyText, setBodyText] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [slug, setSlug] = useState('');

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

    return (
        <div className="w-full space-y-4 max-w-3xl">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6">
                <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                <h1 className="font-black text-xl flex items-center gap-2">
                    <Megaphone className="w-5 h-5" /> Marketing
                </h1>
                <p className="text-sm text-white/60 mt-1">
                    Mini-site{slug ? ` /s/${slug}` : ''} · email campaigns · referrals on client detail
                </p>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {info && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-xl px-4 py-2">{info}</p>}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-bold uppercase text-[#64748B]">Public mini-site</h2>
                <input
                    value={site.siteHeadline}
                    onChange={(e) => setSite((s) => ({ ...s, siteHeadline: e.target.value }))}
                    placeholder="Headline"
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                />
                <textarea
                    value={site.siteBlurb}
                    onChange={(e) => setSite((s) => ({ ...s, siteBlurb: e.target.value }))}
                    placeholder="Short blurb"
                    rows={3}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                />
                <textarea
                    value={site.siteServices}
                    onChange={(e) => setSite((s) => ({ ...s, siteServices: e.target.value }))}
                    placeholder="Services (one per line)"
                    rows={3}
                    className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm"
                />
                <button
                    type="button"
                    onClick={async () => {
                        try {
                            await apiPatch('/api/host/marketing/site', site);
                            setInfo('Site saved');
                        } catch (e: any) {
                            setError(e.message);
                        }
                    }}
                    className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold"
                >
                    Save site
                </button>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-bold uppercase text-[#64748B]">New email campaign</h2>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Name" />
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Subject" />
                <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={4} className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Body" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm">
                    <option value="active">Active clients</option>
                    <option value="lead">Leads</option>
                    <option value="inactive">Inactive</option>
                </select>
                <button
                    type="button"
                    onClick={async () => {
                        try {
                            const created = await apiPost('/api/host/campaigns', { name, subject, bodyText, statusFilter });
                            const sent = await apiPost(`/api/host/campaigns/${created.campaign.id}/send`, {});
                            setInfo(`Campaign sent to ${sent.campaign.sent_count} clients`);
                            load();
                        } catch (e: any) {
                            setError(e.message);
                        }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 text-sm font-bold"
                >
                    <Send className="w-3.5 h-3.5" /> Create & send
                </button>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                <ul className="divide-y divide-[#F1F5F9]">
                    {campaigns.map((c) => (
                        <li key={c.id} className="px-4 py-3 text-sm flex justify-between">
                            <span className="font-bold">{c.name}</span>
                            <span className="text-[#64748B]">
                                {c.status} · {c.sent_count} sent
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
