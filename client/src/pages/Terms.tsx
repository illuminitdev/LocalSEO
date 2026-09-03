import LegalPage from '../components/LegalPage';

export default function Terms() {
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
