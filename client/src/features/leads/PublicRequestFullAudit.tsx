import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../../shared/apiConfig';

type ResultState = {
    ok: boolean;
    title: string;
    message: string;
    alreadyRequested?: boolean;
    businessName?: string;
};

export default function PublicRequestFullAudit() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [result, setResult] = useState<ResultState | null>(null);

    useEffect(() => {
        const t = String(token || '').trim();
        if (!t) {
            setResult({
                ok: false,
                title: 'Link not found',
                message: 'This request link is invalid or has expired.'
            });
            setLoading(false);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const base = API_BASE.replace(/\/$/, '');
                const res = await fetch(
                    `${base}/api/public/lead-full-audit-request/${encodeURIComponent(t)}?format=json`,
                    { headers: { Accept: 'application/json' } }
                );
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok || !data?.success) {
                    setResult({
                        ok: false,
                        title: 'Link not found',
                        message:
                            String(data?.error || '').trim() ||
                            'This request link is invalid or has expired.'
                    });
                } else {
                    setResult({
                        ok: true,
                        title: String(data.title || 'Request received'),
                        message: String(data.message || 'Thanks — we received your request.'),
                        alreadyRequested: Boolean(data.alreadyRequested),
                        businessName: String(data.businessName || '')
                    });
                }
            } catch {
                if (!cancelled) {
                    setResult({
                        ok: false,
                        title: 'Something went wrong',
                        message: 'We could not process your request. Please try again from the email link.'
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const logoSrc = `${API_BASE.replace(/\/$/, '')}/api/public/brand/zappsites-logo.png`;
    const ok = result?.ok !== false;
    const title = result?.title || (loading ? 'Submitting request…' : 'Request received');
    const message =
        result?.message ||
        (loading ? 'Please wait while we record your full audit request.' : '');

    return (
        <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-[480px] bg-white border border-[#E5E7EB]">
                <div className="px-7 py-5 border-b border-[#E5E7EB]">
                    <div className="flex items-center gap-3">
                        <img
                            src={logoSrc}
                            alt="ZappSites"
                            width={36}
                            height={36}
                            className="w-9 h-9 rounded-full object-contain"
                        />
                        <div className="text-base font-bold text-[#111827]">ZappSites</div>
                    </div>
                </div>

                <div className="px-7 pt-7 pb-2">
                    <div
                        className={`inline-block text-[11px] font-bold tracking-wide uppercase rounded-full px-2.5 py-1 mb-3.5 border ${
                            loading
                                ? 'text-[#6B7280] bg-[#F9FAFB] border-[#E5E7EB]'
                                : ok
                                  ? 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]'
                                  : 'text-[#991B1B] bg-[#FEF2F2] border-[#FECACA]'
                        }`}
                    >
                        {loading ? 'Processing' : ok ? 'Request received' : 'Unable to process'}
                    </div>
                    <h1 className="text-[22px] font-bold text-[#111827] leading-snug m-0 mb-3">{title}</h1>
                    <p className="text-[15px] leading-relaxed text-[#4B5563] m-0">{message}</p>
                </div>

                {ok && !loading ? (
                    <div className="px-7 pt-4 pb-1">
                        <p className="text-[13px] font-bold text-[#111827] m-0 mb-1.5">What happens next</p>
                        <p className="text-sm text-[#6B7280] leading-relaxed m-0">
                            Our team will run the full audit and follow up when the report is ready.
                        </p>
                    </div>
                ) : null}

                <div className="px-7 pt-5 pb-7">
                    <p className="text-[13px] leading-relaxed text-[#9CA3AF] m-0">You can close this tab.</p>
                </div>
            </div>
        </div>
    );
}
