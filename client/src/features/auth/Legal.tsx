import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
    children: ReactNode;
    title: string;
};

/** Simple legal / static page shell matching auth look. */
export function LegalPage({ title, children }: Props) {
    return (
        <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
            <header className="border-b border-[#E2E8F0] bg-white">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-[#EA580C] text-white flex items-center justify-center font-bold text-sm shrink-0">
                            z
                        </div>
                        <div className="leading-none">
                            <p className="text-[15px] font-semibold tracking-tight">Zappsites</p>
                            <p className="text-[10px] uppercase tracking-widest text-[#EA580C] mt-1.5">Local SEO</p>
                        </div>
                    </Link>
                    <Link to="/" className="text-sm font-medium text-[#64748B] hover:text-[#0F172A]">
                        Sign in
                    </Link>
                </div>
            </header>
            <main className="max-w-2xl mx-auto px-4 py-10">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="mt-1 text-xs text-[#94A3B8]">Last updated: 2 September 2026 · Placeholder — replace with final legal copy.</p>
                <div className="mt-8 space-y-5 text-sm text-[#334155] leading-relaxed">{children}</div>
                <p className="mt-10 text-xs text-[#94A3B8]">
                    <Link to="/privacy" className="hover:underline">Privacy</Link>
                    {' · '}
                    <Link to="/terms" className="hover:underline">Terms</Link>
                    {' · '}
                    <a href="https://www.zappsites.com/" className="hover:underline" target="_blank" rel="noreferrer">
                        zappsites.com
                    </a>
                </p>
            </main>
        </div>
    );
}


export function Privacy() {
    return (
        <LegalPage title="Privacy Policy">
            <p>
                This Privacy Policy describes how ZappSites (&quot;we&quot;, &quot;us&quot;) collects, uses, and
                shares information when you use the Local SEO portal at app.zappsites.com and related services.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Information we collect</h2>
            <p>
                Account details (name, email, phone), business profile data you enter, booking and subscription
                information linked to your plan, and technical data such as device and log information needed to
                operate the service.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">How we use information</h2>
            <p>
                To provide Local SEO and booking tools included in your plan, authenticate access, process
                payments via our billing partner, send service emails (including login credentials after purchase),
                and improve reliability and security.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Sharing</h2>
            <p>
                We may share data with infrastructure and payment providers (for example hosting and Stripe) solely
                to run the product. We do not sell your personal information.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Retention &amp; your choices</h2>
            <p>
                We retain account data while your subscription is active and as required by law. Contact us via
                zappsites.com to request access or deletion where applicable.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Contact</h2>
            <p>
                Questions about this policy: visit{' '}
                <a href="https://www.zappsites.com/" className="font-medium text-[#0F172A] underline" target="_blank" rel="noreferrer">
                    www.zappsites.com
                </a>
                . This page is temporary placeholder text and will be replaced with final counsel-approved copy.
            </p>
        </LegalPage>
    );
}


export function Terms() {
    return (
        <LegalPage title="Terms of Service">
            <p>
                These Terms govern use of the ZappSites Local SEO portal (app.zappsites.com). By signing in or
                using the service after purchasing a plan on zappsites.com, you agree to these Terms.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Accounts</h2>
            <p>
                Access is provided after payment on the ZappSites website. You receive a temporary password by
                email and must change it in Account settings. You are responsible for keeping credentials secure.
                Self-serve registration is not offered in this portal.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Plans &amp; features</h2>
            <p>
                Features shown in the portal match the active paid plan (for example bookings, local presence,
                local growth, reporting). Upgrading or changing plans is handled through ZappSites billing.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Acceptable use</h2>
            <p>
                Do not misuse the service, attempt unauthorized access, or use it for unlawful activity. We may
                suspend access for abuse or non-payment.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Disclaimer</h2>
            <p>
                The service is provided &quot;as is&quot;. Local rankings and marketing outcomes are not guaranteed.
                To the fullest extent permitted by law, liability is limited to fees paid for the service in the
                preceding three months.
            </p>
            <h2 className="text-base font-semibold text-[#0F172A] pt-2">Contact</h2>
            <p>
                For questions, visit{' '}
                <a href="https://www.zappsites.com/" className="font-medium text-[#0F172A] underline" target="_blank" rel="noreferrer">
                    www.zappsites.com
                </a>
                . This page is temporary placeholder text and will be replaced with final counsel-approved copy.
            </p>
        </LegalPage>
    );
}

export default Privacy;
