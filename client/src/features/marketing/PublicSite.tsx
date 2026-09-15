import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '../../shared/utils';
import { orgBrandStyle, resolveOrgBrand } from '../../shared/orgBrand';

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
    const brand = resolveOrgBrand({
        logoUrl: org.logoUrl || org.logo_url,
        brandPrimary: org.brandPrimary || org.brand_primary,
        brandSecondary: org.brandSecondary || org.brand_secondary
    });
    const services = String(org.site_services || '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);

    return (
        <div
            className="min-h-screen text-white"
            style={{
                ...orgBrandStyle(brand),
                background: `linear-gradient(to bottom, var(--brand-secondary), color-mix(in srgb, var(--brand-secondary) 85%, white), var(--brand-secondary))`
            }}
        >
            <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
                {brand.logoUrl ? (
                    <img
                        src={brand.logoUrl}
                        alt=""
                        className="h-14 w-14 rounded-2xl object-contain bg-white/10 p-2"
                    />
                ) : null}
                <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
                    {org.trade_type || 'Local services'}
                </p>
                <h1 className="text-4xl font-black tracking-tight">{org.site_headline || org.name}</h1>
                <p className="text-lg text-white/70">{org.site_blurb || org.service_area}</p>
                <div className="flex flex-wrap gap-3">
                    <a
                        href={`/book/${org.slug}`}
                        className="rounded-xl px-5 py-3 font-bold text-[var(--brand-secondary)] bg-[var(--brand-primary)]"
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
