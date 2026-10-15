import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import QRCode from 'qrcode';
import {
    CheckCircle2,
    Database,
    Save,
    BadgeCheck,
    Star,
    MessageSquare,
    Search,
    ChevronDown,
    X,
    Info,
    Loader2,
    SlidersHorizontal,
    MessageCircle,
    Lightbulb,
    Sparkles,
    Inbox,
    Download,
    Link2,
    QrCode,
    Mail,
    Receipt,
    Nfc,
    RefreshCw
} from 'lucide-react';
import { apiGet, apiPost, logDashboardActivity } from '../../shared/utils';
import { useCredits } from '../../shared/CreditsContext';
import { useToast } from '../../shared/Toast';
import { getPageCache, setPageCache } from '../../shared/pageCache';

function getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}


function GoogleLogo({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24">
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
        </svg>
    );
}

type InboxItem = {
    key: string;
    kind: 'google' | 'direct';
    id?: string;
    author: string;
    rating: number;
    text: string;
    when: string;
    sortTime: number;
    sourceKey: string;
    reply: string;
    unread: boolean;
    email?: string;
    ownerReplied?: boolean;
};

type Hub = {
    businessName: string;
    slug: string;
    links: Record<string, string>;
    googleReviewUrl: string;
    collected: Array<{
        id: string;
        source: string;
        rating: number;
        name: string;
        email: string;
        comment: string;
        isRead: boolean;
        replyText: string;
        repliedAt: string | null;
        createdAt: string;
    }>;
    sources: Record<string, number>;
    googleReviews: Array<{ author: string; rating: number; text: string; when: string; ownerReply: string; ownerRepliedAt: string }>;
    googleSyncedAt: string | null;
    googleTotal: number | null;
    canSync: boolean;
    googleReplies: Record<string, { text: string; at: string }>;
};

const SOURCE_META: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
    nfc: { label: 'In-Store NFC', icon: Nfc },
    qr: { label: 'In-Store QR', icon: QrCode },
    email: { label: 'Email Campaign', icon: Mail },
    receipt: { label: 'Receipt QR', icon: Receipt },
    sms: { label: 'SMS Request', icon: MessageSquare },
    link: { label: 'Direct Link', icon: Link2 }
};

function hashKey(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `g:${(h >>> 0).toString(36)}`;
}

function ago(iso: string) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Stars({ rating, className = 'w-3 h-3' }: { rating: number; className?: string }) {
    return (
        <span className="inline-flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`${className} ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            ))}
        </span>
    );
}

type ReviewsCache = {
    googleReviews: Array<{ author: string; rating: number; text: string; date: string }>;
    business: { name: string; rating: number | null; count: number; mapsUrl: string };
    hub: Hub | null;
};

export function ReviewManagement() {
    const { show } = useToast();
    const cached = getPageCache<ReviewsCache>('reviews');
    const [googleReviews, setGoogleReviews] = useState<ReviewsCache['googleReviews']>(cached?.googleReviews ?? []);
    const [business, setBusiness] = useState<ReviewsCache['business']>(cached?.business ?? { name: '', rating: null, count: 0, mapsUrl: '' });
    const [hub, setHub] = useState<Hub | null>(cached?.hub ?? null);
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<'all' | 'needs' | 'replied'>('all');
    const [search, setSearch] = useState('');
    const [selectedKey, setSelectedKey] = useState('');
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [tone, setTone] = useState('warm');
    const [drafting, setDrafting] = useState(false);
    const [posting, setPosting] = useState(false);
    const [linkSource, setLinkSource] = useState('qr');
    const [qrSvg, setQrSvg] = useState('');
    const [campaignOpen, setCampaignOpen] = useState(false);
    const [campaign, setCampaign] = useState({ emails: '', phones: '', message: '' });
    const [sending, setSending] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const { refresh: refreshCredits } = useCredits();

    // Reply drafts (AI or typed) are kept on the org so a refresh does not lose them; posting a reply removes its draft.
    const [draftsRestored, setDraftsRestored] = useState(false);
    const draftsSavedKey = useRef('');
    useEffect(() => {
        apiGet('/api/ai/saved/review-drafts')
            .then((d) => {
                const v = d?.saved?.value;
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    setDrafts((cur) => ({ ...v, ...cur }));
                    draftsSavedKey.current = JSON.stringify(v);
                }
            })
            .catch(() => {})
            .finally(() => setDraftsRestored(true));
    }, []);
    useEffect(() => {
        if (!draftsRestored) return;
        // Keep the 50 most recent non-empty drafts so the saved value stays small.
        const value = Object.fromEntries(Object.entries(drafts).filter(([, t]) => String(t || '').trim()).slice(-50));
        const key = JSON.stringify(value);
        if (key === draftsSavedKey.current) return;
        const t = setTimeout(() => {
            draftsSavedKey.current = key;
            apiPost('/api/ai/saved/review-drafts', { value }).catch(() => {});
        }, 1000);
        return () => clearTimeout(t);
    }, [draftsRestored, drafts]);

    useEffect(() => {
        Promise.all([
            apiGet('/api/business').catch(() => null),
            apiGet('/api/reviews/hub').catch((err: any) => {
                setError(err?.message || 'Could not load collected reviews.');
                return null;
            })
        ])
            .then(([b, h]) => {
                if (b) {
                    setBusiness({
                        name: b.name || '',
                        rating: b.rating != null ? Number(b.rating) : null,
                        count: Number(b.reviewsCount || b.review_count || 0),
                        mapsUrl: b.mapsUrl || ''
                    });
                    setGoogleReviews(
                        (Array.isArray(b.reviews) ? b.reviews : [])
                            .map((r: any) => ({
                                author: r.author || 'Customer',
                                rating: Number(r.rating) || 5,
                                text: r.text || (typeof r === 'string' ? r : ''),
                                date: r.date || 'Recent'
                            }))
                            .filter((r: any) => r.text)
                    );
                }
                if (h) setHub(h);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!loading) setPageCache('reviews', { googleReviews, business, hub } satisfies ReviewsCache);
    }, [loading, googleReviews, business, hub]);

    const syncGoogle = async (auto = false) => {
        setSyncing(true);
        setError('');
        try {
            await apiPost('/api/reviews/sync');
            for (let i = 0; i < 40; i++) {
                await new Promise((r) => setTimeout(r, 4000));
                const res = await apiGet('/api/reviews/sync');
                if (res.status === 'done') {
                    setHub(await apiGet('/api/reviews/hub'));
                    show(`Synced ${res.count} Google review${res.count === 1 ? '' : 's'}.`);
                    return;
                }
                if (res.status === 'idle') break;
            }
            setError('Google is still collecting your reviews. Try Sync again in a minute.');
        } catch (err: any) {
            // The automatic first-visit sync stays quiet when there are no credits left.
            if (!(auto && err?.code === 'insufficient_credits')) setError(err?.message || 'Could not sync Google reviews.');
        } finally {
            setSyncing(false);
            refreshCredits();
        }
    };

    // Google reviews are pulled only when the Sync button is clicked (it costs DataForSEO money and a credit).

    const items: InboxItem[] = useMemo(() => {
        const direct: InboxItem[] = (hub?.collected || []).map((c) => ({
            key: `d:${c.id}`,
            kind: 'direct',
            id: c.id,
            author: c.name || 'Anonymous customer',
            rating: c.rating,
            text: c.comment || '(No comment left, rating only)',
            when: ago(c.createdAt),
            sortTime: new Date(c.createdAt).getTime(),
            sourceKey: c.source,
            reply: c.replyText,
            unread: !c.isRead && !c.replyText,
            email: c.email
        }));
        const syncedList = hub?.googleReviews || [];
        const source = syncedList.length
            ? syncedList
            : googleReviews.map((r) => ({ ...r, when: '', ownerReply: '', ownerRepliedAt: '' }));
        const google: InboxItem[] = source.map((r: any) => {
            const key = hashKey(`${r.author}|${r.text}`);
            const saved = hub?.googleReplies?.[key]?.text || '';
            const whenIso = r.when && /^\d{4}-/.test(r.when) ? r.when : '';
            return {
                key,
                kind: 'google',
                author: r.author,
                rating: r.rating,
                text: r.text || '(Rating only, no written review)',
                when: whenIso ? ago(whenIso) : r.when || 'Recent',
                sortTime: whenIso ? new Date(whenIso).getTime() : 0,
                sourceKey: 'google',
                reply: saved || r.ownerReply || '',
                ownerReplied: !saved && Boolean(r.ownerReply),
                unread: false
            };
        });
        return [...direct, ...google].sort((a, b) => b.sortTime - a.sortTime);
    }, [hub, googleReviews]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((i) => {
            if (tab === 'needs' && i.reply) return false;
            if (tab === 'replied' && !i.reply) return false;
            return !q || i.author.toLowerCase().includes(q) || i.text.toLowerCase().includes(q);
        });
    }, [items, tab, search]);

    const selected = items.find((i) => i.key === selectedKey) || filtered[0] || null;
    const unreadCount = items.filter((i) => i.unread).length;
    const needsReplyCount = items.filter((i) => !i.reply).length;

    // Show the saved reply (if any) when a review is opened.
    const draftFor = (i: InboxItem | null) => (i ? (drafts[i.key] ?? i.reply) : '');

    const openItem = (i: InboxItem) => {
        setSelectedKey(i.key);
        if (i.kind === 'direct' && i.unread && i.id) {
            apiPost(`/api/reviews/hub/${i.id}/read`).catch(() => {});
            setHub((h) => (h ? { ...h, collected: h.collected.map((c) => (c.id === i.id ? { ...c, isRead: true } : c)) } : h));
        }
    };

    const aiDraft = async () => {
        if (!selected) return;
        setDrafting(true);
        setError('');
        try {
            const data = await apiPost('/api/ai/review-reply', {
                reviewText: selected.text,
                rating: selected.rating,
                author: selected.author,
                tone
            });
            setDrafts((d) => ({ ...d, [selected.key]: data.reply || '' }));
        } catch (err: any) {
            setError(err?.message || 'Could not draft a reply.');
        } finally {
            setDrafting(false);
            refreshCredits();
        }
    };

    const postReply = async () => {
        if (!selected) return;
        const text = draftFor(selected).trim();
        if (!text) {
            setError('Write a reply first, or click AI Draft Reply.');
            return;
        }
        setPosting(true);
        setError('');
        try {
            if (selected.kind === 'direct' && selected.id) {
                const res = await apiPost(`/api/reviews/hub/${selected.id}/reply`, { text });
                setHub((h) =>
                    h
                        ? {
                              ...h,
                              collected: h.collected.map((c) =>
                                  c.id === selected.id ? { ...c, replyText: res.review.replyText, repliedAt: res.review.repliedAt, isRead: true } : c
                              )
                          }
                        : h
                );
                show(res.emailed ? 'Reply saved and emailed to the customer.' : 'Reply saved (no email address on file to send it to).');
            } else {
                const res = await apiPost('/api/reviews/google-reply', { key: selected.key, text });
                setHub((h) => (h ? { ...h, googleReplies: res.googleReplies } : h));
                try {
                    await navigator.clipboard.writeText(text);
                } catch {
                    /* clipboard is optional */
                }
                show('Reply saved and copied. Paste it under the review in your Google Business Profile.');
            }
            setDrafts((d) => {
                const next = { ...d };
                delete next[selected.key];
                return next;
            });
            await logDashboardActivity({
                type: 'review',
                message: `Replied to review by ${selected.author}.`,
                icon: 'CheckCircle',
                color: 'text-[var(--brand-primary)]'
            });
        } catch (err: any) {
            setError(err?.message || 'Could not save the reply.');
        } finally {
            setPosting(false);
        }
    };

    // QR code for the review page (always the "qr" source so scans are attributed correctly).
    const qrLink = hub?.links?.qr || '';
    useEffect(() => {
        if (!qrLink) {
            setQrSvg('');
            return;
        }
        QRCode.toString(qrLink, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0F172A', light: '#FFFFFF' } })
            .then(setQrSvg)
            .catch(() => setQrSvg(''));
    }, [qrLink]);

    const downloadQr = () => {
        if (!qrSvg) return;
        const url = URL.createObjectURL(new Blob([qrSvg], { type: 'image/svg+xml' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `review-qr-${(business.name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyLink = async () => {
        const link = hub?.links?.[linkSource];
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            show(`${SOURCE_META[linkSource]?.label || 'Review'} link copied.`);
        } catch {
            setError('Could not copy automatically. Select the link below and copy it.');
        }
    };

    const sendCampaign = async () => {
        setSending(true);
        setError('');
        try {
            const res = await apiPost('/api/reviews/campaign', campaign);
            const sent = (res.emailed || 0) + (res.texted || 0);
            show(`Review request sent to ${sent} customer${sent === 1 ? '' : 's'}${res.failed ? `, ${res.failed} failed` : ''}.`);
            if (sent > 0) {
                setCampaignOpen(false);
                setCampaign({ emails: '', phones: '', message: '' });
            }
        } catch (err: any) {
            setError(err?.message || 'Could not send the campaign.');
        } finally {
            setSending(false);
        }
    };

    const generateReport = () => {
        const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
        const total = items.length;
        const avg = total ? (items.reduce((a, i) => a + i.rating, 0) / total).toFixed(2) : '';
        const replied = items.filter((i) => i.reply).length;
        const lines = [
            [`${business.name || 'Business'} review report`, new Date().toLocaleDateString('en-GB')].map(esc).join(','),
            ['Reviews in inbox', total, 'Average rating', avg, 'Replied', `${replied} of ${total}`].map(esc).join(','),
            ['Google rating', business.rating ?? '', 'Google review count', business.count || ''].map(esc).join(','),
            '',
            ['Source', 'Author', 'Rating', 'When', 'Review', 'Reply'].map(esc).join(','),
            ...items.map((i) => [SOURCE_META[i.sourceKey]?.label || 'Google', i.author, i.rating, i.when, i.text, i.reply].map(esc).join(','))
        ];
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `review-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const sourceRows = useMemo(() => {
        const counts = hub?.sources || {};
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return {
            total,
            rows: Object.keys(SOURCE_META)
                .map((k) => ({ key: k, n: counts[k] || 0, pct: total ? Math.round(((counts[k] || 0) / total) * 100) : 0 }))
                .filter((r) => r.n > 0)
                .sort((a, b) => b.n - a.n)
        };
    }, [hub]);

    const shownLink = hub?.links?.[linkSource] || '';

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto pb-12">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Review Growth Engine</h1>
                <div className="flex justify-center py-24 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Review Growth Engine</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage reputation, respond to reviews, and collect new ones with a scannable review card.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={generateReport}
                        disabled={!items.length}
                        className="px-4 py-2 rounded-xl border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                        Generate Report
                    </button>
                    <button
                        type="button"
                        onClick={() => setCampaignOpen(true)}
                        className="px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                    >
                        Launch Campaign
                    </button>
                </div>
            </div>

            {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                {/* Unified Inbox */}
                <div className="lg:col-span-2 rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-lg bg-[#0F172A] text-white flex items-center justify-center">
                                <Inbox className="w-4 h-4" />
                            </span>
                            <div>
                                <h2 className="text-base font-bold text-[#0F172A]">Unified Inbox</h2>
                                <p className="text-[11px] text-gray-500">
                                    {business.rating != null ? `${business.rating}★ on Google · ` : ''}
                                    {items.length} review{items.length === 1 ? '' : 's'} shown{hub?.googleTotal ? ` (${hub.googleTotal.toLocaleString()} on Google)` : ''} · {needsReplyCount} need a reply{hub?.googleSyncedAt ? ` · synced ${ago(hub.googleSyncedAt)}` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                        {hub?.canSync && (
                            <button
                                type="button"
                                onClick={() => syncGoogle()}
                                disabled={syncing}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[11px] font-bold text-[#0F172A] hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                            >
                                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {syncing ? 'Syncing…' : 'Sync Google reviews'}
                            </button>
                        )}
                        <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                unreadCount ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            }`}
                        >
                            {unreadCount ? `${unreadCount} Unread` : 'All caught up'}
                        </span>
                        </div>
                    </div>

                    <div className="px-5 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center gap-2">
                        {(
                            [
                                ['all', 'All'],
                                ['needs', 'Needs reply'],
                                ['replied', 'Replied']
                            ] as const
                        ).map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => setTab(k)}
                                className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer ${
                                    tab === k ? 'bg-[#0F172A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                        <div className="relative ml-auto">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search reviews"
                                className="pl-8 pr-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs outline-none focus:border-[var(--brand-primary)] w-40"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-16 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    ) : !items.length ? (
                        <div className="py-14 px-6 text-center">
                            <p className="text-sm font-semibold text-[#0F172A]">No reviews yet</p>
                            <p className="text-xs text-gray-500 mt-1">{syncing ? 'Fetching your Google reviews…' : hub?.canSync ? 'Click Sync Google reviews to load your existing reviews. New reviews from your review card appear here right away.' : 'Share your review card or launch a campaign. New reviews appear here right away.'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-5 min-h-[420px]">
                            <ul className="md:col-span-2 border-b md:border-b-0 md:border-r border-[#E2E8F0] max-h-[520px] overflow-y-auto divide-y divide-[#E2E8F0]">
                                {filtered.map((i) => {
                                    const isSel = selected?.key === i.key;
                                    const meta = SOURCE_META[i.sourceKey];
                                    return (
                                        <li key={i.key}>
                                            <button
                                                type="button"
                                                onClick={() => openItem(i)}
                                                className={`w-full text-left px-4 py-3 cursor-pointer border-l-2 ${
                                                    isSel ? 'bg-slate-50 border-[var(--brand-primary)]' : 'border-transparent hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-xs truncate ${i.unread ? 'font-black' : 'font-bold'} text-[#0F172A]`}>
                                                        {i.unread && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle" />}
                                                        {i.author}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 shrink-0">{i.when}</span>
                                                </div>
                                                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-500">
                                                    {i.kind === 'google' ? <GoogleLogo className="w-3 h-3" /> : meta ? <meta.icon className="w-3 h-3" /> : null}
                                                    <span className="font-semibold">{i.kind === 'google' ? 'Google Maps' : meta?.label || 'Direct'}</span>
                                                    {i.reply && <span className="ml-auto text-emerald-600 font-bold">{i.ownerReplied ? 'Replied on Google' : 'Replied'}</span>}
                                                </div>
                                                <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{i.text}</p>
                                                <div className="mt-1">
                                                    <Stars rating={i.rating} />
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                                {!filtered.length && <li className="px-4 py-8 text-center text-xs text-gray-400">Nothing matches.</li>}
                            </ul>

                            <div className="md:col-span-3 flex flex-col">
                                {selected ? (
                                    <>
                                        <div className="p-5 flex-1">
                                            <div className="rounded-xl border border-[#E2E8F0] bg-slate-50/60 p-4">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <span className="w-9 h-9 rounded-lg bg-[#0F172A] text-white text-xs font-bold flex items-center justify-center">
                                                        {getInitials(selected.author)}
                                                    </span>
                                                    <div>
                                                        <p className="text-sm font-bold text-[#0F172A]">{selected.author}</p>
                                                        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                                                            {selected.kind === 'google' ? 'Left a review on Google' : `Left a review via ${SOURCE_META[selected.sourceKey]?.label || 'your review page'}`}
                                                            <Stars rating={selected.rating} className="w-2.5 h-2.5" />
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-700 leading-relaxed">&ldquo;{selected.text}&rdquo;</p>
                                            </div>
                                            {selected.reply && (
                                                <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">{selected.ownerReplied ? 'Your reply on Google' : 'Your reply'}</p>
                                                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{selected.reply}</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="border-t border-[#E2E8F0] p-4">
                                            <textarea
                                                value={draftFor(selected)}
                                                onChange={(e) => setDrafts((d) => ({ ...d, [selected.key]: e.target.value }))}
                                                rows={4}
                                                placeholder={selected.reply ? 'Edit your reply…' : 'Draft your response… AI assist is available.'}
                                                className="w-full rounded-lg border border-[#E2E8F0] p-3 text-xs outline-none focus:border-[var(--brand-primary)] resize-none"
                                            />
                                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={aiDraft}
                                                        disabled={drafting}
                                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--brand-primary)] hover:underline disabled:opacity-60 cursor-pointer"
                                                    >
                                                        {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                        AI Draft Reply
                                                    </button>
                                                    <select
                                                        value={tone}
                                                        onChange={(e) => setTone(e.target.value)}
                                                        className="text-[11px] rounded border border-[#E2E8F0] bg-white px-1.5 py-0.5 text-gray-600"
                                                        aria-label="Reply tone"
                                                    >
                                                        <option value="warm">Warm</option>
                                                        <option value="apologetic">Apologetic</option>
                                                        <option value="enthusiastic">Enthusiastic</option>
                                                    </select>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={postReply}
                                                    disabled={posting}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
                                                >
                                                    {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                    {selected.reply ? 'Update Reply' : 'Post Reply'}
                                                </button>
                                            </div>
                                            {selected.kind === 'google' && (
                                                <p className="text-[10px] text-gray-400 mt-2">
                                                    Replies to Google reviews are saved here and copied for you to paste in your Google Business Profile.
                                                    {business.mapsUrl && (
                                                        <>
                                                            {' '}
                                                            <a href={business.mapsUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--brand-primary)] hover:underline">
                                                                Open Google
                                                            </a>
                                                        </>
                                                    )}
                                                </p>
                                            )}
                                            {selected.kind === 'direct' && (
                                                <p className="text-[10px] text-gray-400 mt-2">
                                                    {selected.email ? `Your reply will also be emailed to ${selected.email}.` : 'This customer did not leave an email, so the reply is saved here only.'}
                                                </p>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <p className="m-auto text-xs text-gray-400">Select a review to read and reply.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right column */}
                <div className="space-y-5">
                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                        <h3 className="text-base font-bold text-[#0F172A]">In-Store Collection</h3>
                        <p className="text-[11px] text-gray-500 mt-1">Customers scan the card, rate you and leave a review in seconds. Happy customers are invited to post on Google too.</p>

                        <div className="mt-4 rounded-xl bg-[#0F172A] p-4 text-white">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-lg font-black leading-tight truncate">{business.name || 'Your business'}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mt-4">Scan to Review</p>
                                    <p className="text-xs text-slate-300">Takes 30 seconds</p>
                                    <div className="mt-2">
                                        <Stars rating={5} className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="w-24 h-24 shrink-0 rounded-lg bg-white p-1.5 flex items-center justify-center">
                                    {qrSvg ? (
                                        <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                                    ) : (
                                        <QrCode className="w-8 h-8 text-slate-300" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={downloadQr}
                                disabled={!qrSvg}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] py-2 text-[11px] font-bold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                                <Download className="w-3.5 h-3.5" /> QR Vector
                            </button>
                            <button
                                type="button"
                                onClick={copyLink}
                                disabled={!shownLink}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] py-2 text-[11px] font-bold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                            >
                                <Link2 className="w-3.5 h-3.5" /> Copy Link
                            </button>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400" htmlFor="link-source">
                                Link for
                            </label>
                            <select
                                id="link-source"
                                value={linkSource}
                                onChange={(e) => setLinkSource(e.target.value)}
                                className="flex-1 text-[11px] rounded border border-[#E2E8F0] bg-white px-2 py-1 text-gray-600"
                            >
                                {Object.entries(SOURCE_META).map(([k, m]) => (
                                    <option key={k} value={k}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {shownLink && (
                            <a href={shownLink} target="_blank" rel="noreferrer" className="mt-2 block truncate text-[10px] text-gray-400 hover:text-[var(--brand-primary)]">
                                {shownLink}
                            </a>
                        )}
                    </div>

                    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base font-bold text-[#0F172A]">Source Attribution</h3>
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Last 30 Days</span>
                        </div>
                        {sourceRows.total === 0 ? (
                            <p className="mt-3 text-xs text-gray-500">No collected reviews yet. Share the QR card or launch a campaign to see where reviews come from.</p>
                        ) : (
                            <ul className="mt-4 space-y-3">
                                {sourceRows.rows.map((r) => {
                                    const Icon = SOURCE_META[r.key].icon;
                                    return (
                                        <li key={r.key}>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F172A]">
                                                    <Icon className="w-3.5 h-3.5 text-gray-500" />
                                                    {SOURCE_META[r.key].label}
                                                </span>
                                                <span className="font-bold text-[#0F172A]">
                                                    {r.pct}% <span className="font-normal text-gray-400">({r.n})</span>
                                                </span>
                                            </div>
                                            <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                                                <div className="h-1.5 rounded-full bg-[#0F172A]" style={{ width: `${r.pct}%` }} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {campaignOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setCampaignOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-[#0F172A]">Launch review campaign</h3>
                            <button type="button" onClick={() => setCampaignOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Send customers a link to your review page. Separate several with commas or new lines.</p>
                        <label className="block mt-4 text-[11px] font-bold text-gray-500">Email addresses</label>
                        <textarea
                            value={campaign.emails}
                            onChange={(e) => setCampaign((c) => ({ ...c, emails: e.target.value }))}
                            rows={3}
                            placeholder="jane@example.com, sam@example.com"
                            className="mt-1 w-full rounded-lg border border-[#E2E8F0] p-2.5 text-xs outline-none focus:border-[var(--brand-primary)]"
                        />
                        <label className="block mt-3 text-[11px] font-bold text-gray-500">Phone numbers for SMS (optional)</label>
                        <textarea
                            value={campaign.phones}
                            onChange={(e) => setCampaign((c) => ({ ...c, phones: e.target.value }))}
                            rows={2}
                            placeholder="07123 456789"
                            className="mt-1 w-full rounded-lg border border-[#E2E8F0] p-2.5 text-xs outline-none focus:border-[var(--brand-primary)]"
                        />
                        <label className="block mt-3 text-[11px] font-bold text-gray-500">Message (optional)</label>
                        <textarea
                            value={campaign.message}
                            onChange={(e) => setCampaign((c) => ({ ...c, message: e.target.value }))}
                            rows={2}
                            maxLength={500}
                            placeholder="Thanks for visiting! Could you leave us a quick review?"
                            className="mt-1 w-full rounded-lg border border-[#E2E8F0] p-2.5 text-xs outline-none focus:border-[var(--brand-primary)]"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => setCampaignOpen(false)} className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-xs font-bold cursor-pointer">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={sendCampaign}
                                disabled={sending || (!campaign.emails.trim() && !campaign.phones.trim())}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                            >
                                {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send requests
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

interface Question {
    id: number;
    text: string;
    author: string;
    answer: string;
    status: 'pending' | 'drafted' | 'published';
}

const EXAMPLE_QUESTIONS = [
    'Do you have free parking available nearby?',
    'Are reservations required or do you accept walk-ins?',
    'Do you offer vegetarian and vegan menu options?',
    'Are you wheelchair accessible?'
];

export function QAAutoResponder() {
    const { show } = useToast();
    const { refresh: refreshCredits } = useCredits();
    const [kbText, setKbText] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [answerStyle, setAnswerStyle] = useState('Professional & friendly');
    const [isGenerating, setIsGenerating] = useState<number | null>(null);
    const [isSavingKB, setIsSavingKB] = useState(false);
    const [showExamplesModal, setShowExamplesModal] = useState(false);
    const [error, setError] = useState('');

    // The questions, drafted answers and knowledge base are kept on the org so a refresh does not lose them.
    const [qaRestored, setQaRestored] = useState(false);
    const qaSavedKey = useRef('');
    useEffect(() => {
        apiGet('/api/ai/saved/qa-board')
            .then((d) => {
                const v = d?.saved?.value;
                if (v) {
                    if (Array.isArray(v.questions)) setQuestions(v.questions);
                    if (typeof v.kbText === 'string') setKbText(v.kbText);
                    if (v.answerStyle) setAnswerStyle(v.answerStyle);
                    qaSavedKey.current = JSON.stringify({ questions: v.questions || [], kbText: v.kbText || '', answerStyle: v.answerStyle || '' });
                }
            })
            .catch(() => {})
            .finally(() => setQaRestored(true));
    }, []);
    useEffect(() => {
        if (!qaRestored) return;
        const value = { questions, kbText, answerStyle };
        const key = JSON.stringify(value);
        if (key === qaSavedKey.current || (!questions.length && !kbText)) return;
        const t = setTimeout(() => {
            qaSavedKey.current = key;
            apiPost('/api/ai/saved/qa-board', { value }).catch(() => {});
        }, 1000);
        return () => clearTimeout(t);
    }, [qaRestored, questions, kbText, answerStyle]);

    const addQuestion = (textToAdd?: string) => {
        const text = (textToAdd || newQuestion).trim();
        if (!text) return;
        setQuestions((prev) => [
            { id: Date.now(), text, author: 'Customer', answer: '', status: 'pending' },
            ...prev
        ]);
        if (!textToAdd) setNewQuestion('');
        setShowExamplesModal(false);
    };

    const deleteQuestion = (id: number) => {
        setQuestions((prev) => prev.filter((q) => q.id !== id));
    };

    const handleAutoAnswer = async (id: number, text: string) => {
        setIsGenerating(id);
        setError('');
        try {
            const data = await apiPost('/api/ai/qa-answer', {
                question: text,
                kb: kbText,
                style: answerStyle
            });
            setQuestions((prev) =>
                prev.map((q) => (q.id === id ? { ...q, answer: data.answer, status: 'drafted' } : q))
            );
        } catch (err: any) {
            setError(err.message || 'Answer generation failed');
        } finally {
            setIsGenerating(null);
            refreshCredits();
        }
    };

    const handleSaveAnswerDraft = async (id: number) => {
        setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, status: 'published' } : q)));
        const targetQ = questions.find((q) => q.id === id);
        if (!targetQ) return;
        await logDashboardActivity({
            type: 'qa',
            message: `Saved Q&A answer for: "${targetQ.text}"`,
            icon: 'CheckCircle',
            color: 'text-[var(--brand-primary)]'
        });
    };

    const handleSaveKB = async () => {
        setIsSavingKB(true);
        setError('');
        try {
            await logDashboardActivity({
                type: 'knowledge',
                message: 'Saved business knowledge base.',
                icon: 'Activity',
                color: 'text-[#0F172A]'
            });
            show('Knowledge saved successfully.');
        } catch (err: any) {
            setError(err.message || 'Failed to save knowledge base');
        } finally {
            setIsSavingKB(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0F172A]">Q&A Auto-Responder</h1>
                    <p className="text-gray-500 text-xs md:text-sm mt-1">
                        Answer common customer questions using facts from your business profile.
                    </p>
                </div>

                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-xs shrink-0 self-start sm:self-auto">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Business profile connected</span>
                    <ChevronDown className="w-3.5 h-3.5 text-emerald-600 ml-0.5" />
                </div>
            </div>

            {error && (
                <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Knowledge & Style (5 cols) */}
                <div className="lg:col-span-5 space-y-5">
                    {/* Card 1: Business Knowledge */}
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Database className="w-4 h-4 text-[#0F172A]" />
                                <h2 className="font-bold text-sm text-[#0F172A]">Business knowledge</h2>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">
                                Add confirmed details so suggested answers stay accurate.
                            </p>

                            <div className="relative mb-3">
                                <textarea
                                    rows={6}
                                    value={kbText}
                                    maxLength={2000}
                                    onChange={(e) => setKbText(e.target.value)}
                                    placeholder={`Parking: Free street parking nearby\nAccessibility: Step-free entrance\nAppointments: Booking recommended`}
                                    className="w-full p-3.5 bg-white border border-[#E2E8F0] rounded-xl text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] resize-none"
                                />
                                <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-400 font-medium">
                                    {kbText.length}/2000
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span>Only use information you can verify.</span>
                            </div>

                            <button
                                type="button"
                                onClick={handleSaveKB}
                                disabled={isSavingKB}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0 disabled:opacity-70"
                            >
                                {isSavingKB ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {isSavingKB ? 'Saving...' : 'Save knowledge'}
                            </button>
                        </div>
                    </div>

                    {/* Card 2: Answer Style */}
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-xs">
                        <div className="flex items-center gap-2 mb-1">
                            <SlidersHorizontal className="w-4 h-4 text-[#0F172A]" />
                            <h2 className="font-bold text-sm text-[#0F172A]">Answer style</h2>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Choose the tone for generated replies.</p>

                        <div className="relative mb-2">
                            <select
                                value={answerStyle}
                                onChange={(e) => setAnswerStyle(e.target.value)}
                                className="w-full appearance-none bg-white border border-[#E2E8F0] rounded-xl px-3.5 py-2.5 pr-8 text-xs font-semibold text-[#0F172A] shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20"
                            >
                                <option value="Professional & friendly">Professional & friendly</option>
                                <option value="Direct & concise">Direct & concise</option>
                                <option value="Warm & conversational">Warm & conversational</option>
                                <option value="Formal & detailed">Formal & detailed</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        <p className="text-[11px] text-gray-500">
                            Replies will be polite, helpful, and on-brand for your business.
                        </p>
                    </div>
                </div>

                {/* Right Column: Customer Questions (7 cols) */}
                <div className="lg:col-span-7">
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-xs flex flex-col justify-between min-h-[460px]">
                        <div>
                            {/* Header inside card */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-[#0F172A]" />
                                    <h2 className="font-bold text-sm text-[#0F172A]">Customer questions</h2>
                                    <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {questions.length} saved
                                    </span>
                                </div>
                            </div>

                            {/* Add question input */}
                            <div className="flex items-center gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
                                    placeholder="Type a question customers ask..."
                                    className="flex-1 px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)]"
                                />
                                <button
                                    type="button"
                                    onClick={() => addQuestion()}
                                    className="px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs shrink-0"
                                >
                                    Add question
                                </button>
                            </div>

                            {/* Questions list or Empty State */}
                            {questions.length === 0 ? (
                                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-10 md:p-14 flex flex-col items-center justify-center text-center my-2">
                                    <div className="w-12 h-12 rounded-full bg-white border border-[#E2E8F0] flex items-center justify-center text-gray-400 mb-3 shadow-xs">
                                        <MessageCircle className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <h3 className="font-bold text-sm text-[#0F172A] mb-1">No questions added yet</h3>
                                    <p className="text-xs text-gray-500 max-w-sm mb-5 leading-relaxed">
                                        Add a real customer question to draft an answer from your saved business knowledge.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowExamplesModal(true)}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                                    >
                                        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                        View example questions
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3.5 my-2">
                                    {questions.map((q) => (
                                        <div
                                            key={q.id}
                                            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 shadow-xs"
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <p className="font-bold text-xs text-[#0F172A] leading-snug">
                                                    &quot;{q.text}&quot;
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteQuestion(q.id)}
                                                    className="text-gray-400 hover:text-red-500 p-1"
                                                    title="Remove question"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            {q.status === 'pending' ? (
                                                <div className="pt-2 flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAutoAnswer(q.id, q.text)}
                                                        disabled={isGenerating === q.id}
                                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-70"
                                                    >
                                                        {isGenerating === q.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <BadgeCheck className="w-3.5 h-3.5" />
                                                        )}
                                                        {isGenerating === q.id ? 'Generating...' : 'Auto-Answer via KB'}
                                                    </button>
                                                </div>
                                            ) : q.status === 'drafted' ? (
                                                <div className="pt-2 space-y-2">
                                                    <textarea
                                                        rows={3}
                                                        value={q.answer}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setQuestions((prev) =>
                                                                prev.map((item) =>
                                                                    item.id === q.id ? { ...item, answer: val } : item
                                                                )
                                                            );
                                                        }}
                                                        className="w-full p-2.5 bg-white border border-[#E2E8F0] rounded-lg text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 resize-none"
                                                    />
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSaveAnswerDraft(q.id)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-lg text-xs font-bold cursor-pointer"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                            Save answer draft
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-xs text-gray-700 bg-white p-3 rounded-lg border border-[#E2E8F0] leading-relaxed">
                                                    {q.answer}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom Disclaimer Note */}
                        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 mt-4 flex items-center gap-2 text-xs text-gray-500 font-normal">
                            <Info className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>
                                Review every draft before publishing. Answers are generated only from your saved business details.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Example Questions Modal */}
            {showExamplesModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowExamplesModal(false);
                    }}
                >
                    <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E2E8F0]">
                        <button
                            type="button"
                            onClick={() => setShowExamplesModal(false)}
                            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                                <Lightbulb className="w-4 h-4" />
                            </div>
                            <h3 className="text-base font-bold text-[#0F172A]">Example Questions</h3>
                        </div>

                        <p className="text-xs text-gray-500 mb-4">
                            Click any question below to add it directly to your customer questions queue:
                        </p>

                        <div className="space-y-2">
                            {EXAMPLE_QUESTIONS.map((exQ, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => addQuestion(exQ)}
                                    className="w-full text-left p-3 rounded-xl border border-[#E2E8F0] bg-white hover:bg-gray-50 text-xs font-semibold text-[#0F172A] transition-colors cursor-pointer flex items-center justify-between gap-2"
                                >
                                    <span>&quot;{exQ}&quot;</span>
                                    <span className="text-[10px] text-[var(--brand-primary)] font-bold shrink-0">+ Add</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
