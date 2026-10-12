import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Loader2, Star } from 'lucide-react';
import { apiGet, apiPost, cn } from '../../shared/utils';

const LABELS = ['', 'Poor', 'Could be better', 'Good', 'Great', 'Excellent'];

/** Public page opened from the QR code / NFC tag / email or SMS link. */
export default function PublicReview() {
    const { orgSlug = '' } = useParams();
    const [params] = useSearchParams();
    const source = params.get('s') || 'link';

    const [info, setInfo] = useState<{ businessName: string; category: string; googleReviewUrl: string } | null>(null);
    const [missing, setMissing] = useState(false);
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [comment, setComment] = useState('');
    const [website, setWebsite] = useState(''); // honeypot, real people leave it empty
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState<{ googleReviewUrl: string } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        apiGet(`/api/public/review/${encodeURIComponent(orgSlug)}`)
            .then(setInfo)
            .catch(() => setMissing(true));
    }, [orgSlug]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rating) {
            setError('Please choose a star rating.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await apiPost(`/api/public/review/${encodeURIComponent(orgSlug)}`, { rating, name, email, comment, source, website });
            setDone({ googleReviewUrl: res?.googleReviewUrl || '' });
        } catch (err: any) {
            setError(err?.message || 'Could not send your review. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const copyAndOpenGoogle = async () => {
        if (!done?.googleReviewUrl) return;
        try {
            if (comment) await navigator.clipboard.writeText(comment);
            setCopied(Boolean(comment));
        } catch {
            /* clipboard is optional */
        }
        window.open(done.googleReviewUrl, '_blank', 'noopener');
    };

    const shown = hover || rating;

    return (
        <div className="min-h-screen bg-slate-50 flex items-start sm:items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white border border-[#E2E8F0] shadow-sm p-6">
                {missing ? (
                    <p className="text-center text-sm text-slate-500 py-10">This review link is not valid.</p>
                ) : !info ? (
                    <div className="flex justify-center py-10 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : done ? (
                    <div className="text-center py-4">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                        <h1 className="text-xl font-bold text-[#0F172A] mt-3">Thank you!</h1>
                        <p className="text-sm text-slate-500 mt-1">Your feedback has been sent to {info.businessName}.</p>
                        {done.googleReviewUrl && (
                            <div className="mt-6 rounded-xl bg-amber-50 border border-amber-100 p-4">
                                <p className="text-sm font-semibold text-[#0F172A]">Enjoyed it? Share it on Google too.</p>
                                <p className="text-xs text-slate-500 mt-1">It takes a few seconds and helps other people find us.</p>
                                <button
                                    type="button"
                                    onClick={copyAndOpenGoogle}
                                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-bold text-white cursor-pointer"
                                >
                                    Review on Google <ExternalLink className="w-4 h-4" />
                                </button>
                                {copied && <p className="text-[11px] text-slate-500 mt-2">Your comment is copied. Just paste it on Google.</p>}
                            </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4">
                        <div className="text-center">
                            <h1 className="text-xl font-bold text-[#0F172A]">How was your experience?</h1>
                            <p className="text-sm text-slate-500 mt-1">{info.businessName}</p>
                        </div>
                        <div className="text-center">
                            <div className="inline-flex gap-1" onMouseLeave={() => setHover(0)}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                                        onMouseEnter={() => setHover(n)}
                                        onClick={() => setRating(n)}
                                        className="p-1 cursor-pointer"
                                    >
                                        <Star className={cn('w-9 h-9 transition', n <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
                                    </button>
                                ))}
                            </div>
                            <p className="h-5 text-sm font-semibold text-slate-600 mt-1">{LABELS[shown]}</p>
                        </div>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            maxLength={2000}
                            rows={4}
                            placeholder="Tell us a little about your visit (optional)"
                            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={80}
                                placeholder="Your name (optional)"
                                className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
                            />
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                type="email"
                                placeholder="Email (optional, for a reply)"
                                className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
                            />
                        </div>
                        <input
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            tabIndex={-1}
                            autoComplete="off"
                            aria-hidden
                            className="hidden"
                        />
                        {error && <p className="text-sm text-red-600">{error}</p>}
                        <button
                            type="submit"
                            disabled={busy}
                            className="w-full rounded-lg bg-[var(--brand-primary)] py-2.5 text-sm font-bold text-white disabled:opacity-60 cursor-pointer"
                        >
                            {busy ? 'Sending…' : 'Submit review'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
