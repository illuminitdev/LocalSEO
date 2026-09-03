import LegalPage from '../components/LegalPage';

export default function Privacy() {
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
