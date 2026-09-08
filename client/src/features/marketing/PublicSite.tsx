import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../../shared/utils';

export default function PublicSite() {
    const { orgSlug } = useParams();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!orgSlug) return;
        apiGet(`/api/public/site/${orgSlug}`)
            .then(setData)
            .catch((e: any) => setError(e.message));
    }, [orgSlug]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <p className="text-red-600">{error}</p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-[#64748B] font-bold">Loading…</div>
        );
    }

    const org = data.org;
    const services = String(org.site_services || '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white">
            <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
                <p className="text-sm text-white/50 uppercase tracking-widest">{org.trade_type || 'Local services'}</p>
                <h1 className="text-4xl font-black tracking-tight">{org.site_headline || org.name}</h1>
                <p className="text-lg text-white/70">{org.site_blurb || org.service_area}</p>
                <div className="flex flex-wrap gap-3">
                    <a
                        href={`/book/${org.slug}`}
                        className="rounded-xl bg-[#F59E0B] text-[#0F172A] px-5 py-3 font-bold"
                    >
                        Book now
                    </a>
                    {org.phone && (
                        <a href={`tel:${org.phone}`} className="rounded-xl border border-white/20 px-5 py-3 font-bold">
                            Call {org.phone}
                        </a>
                    )}
                </div>
                {!!services.length && (
                    <ul className="space-y-2 pt-4">
                        {services.map((s: string) => (
                            <li key={s} className="border-t border-white/10 pt-2 text-white/80">
                                {s}
                            </li>
                        ))}
                    </ul>
                )}
                {!!data.events?.length && (
                    <div className="pt-6 space-y-2">
                        <p className="text-xs uppercase tracking-widest text-white/50">Services</p>
                        {data.events.map((e: any) => (
                            <a key={e.slug} href={`/book/${org.slug}/${e.slug}`} className="block rounded-xl bg-white/5 px-4 py-3 hover:bg-white/10">
                                <span className="font-bold">{e.name}</span>
                                <span className="text-white/50 text-sm ml-2">{e.duration_minutes} min</span>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
