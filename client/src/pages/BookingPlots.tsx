import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, CheckCircle2, Copy, ExternalLink, QrCode, Settings, User, Wrench } from 'lucide-react';
import { apiGet, apiPost, formatCents, cn } from '../lib/utils';
import { setBookingOrgSlug } from '../lib/bookingHost';
import BookingSetupWizard, { type SetupForm } from '../components/BookingSetupWizard';
import BookingSettingsPanel from '../components/BookingSettingsPanel';

function bookingStatusBadge(b: { status: string; deposit_paid?: boolean }) {
    if (b.status === 'confirmed' && b.deposit_paid) {
        return { label: 'Booked', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    }
    if (b.status === 'awaiting_payment') {
        return { label: 'Awaiting payment', className: 'text-amber-700 bg-amber-50 border-amber-200' };
    }
    if (b.status === 'cancelled') {
        return { label: 'Cancelled', className: 'text-red-700 bg-red-50 border-red-200' };
    }
    if (b.status === 'done') {
        return { label: 'Completed', className: 'text-sky-700 bg-sky-50 border-sky-200' };
    }
    return { label: b.status, className: 'text-[#64748B] bg-[#F8FAFC] border-[#E2E8F0]' };
}

export default function BookingPlots() {
    const [searchParams, setSearchParams] = useSearchParams();
    const panel = searchParams.get('panel') === 'settings' ? 'settings' : 'board';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [linked, setLinked] = useState(false);
    const [linkedBusiness, setLinkedBusiness] = useState<any>(null);
    const [filter, setFilter] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState('');

    const load = async () => {
        const [d, business] = await Promise.all([
            apiGet('/api/host/dashboard'),
            apiGet('/api/business').catch(() => null)
        ]);
        setData(d);
        setLinked(Boolean(business?.connected && business?.name));
        setLinkedBusiness(business?.connected && business?.name ? business : null);
        setError('');
        setLoading(false);
        return d;
    };

    useEffect(() => {
        load().catch((e: any) => {
            setError(e.message);
            setLoading(false);
        });
    }, []);

    const ready = Boolean(data?.ready);
    const org = data?.organization;
    const eventTypes = data?.eventTypes || [];
    const bookings = data?.bookings || [];

    const filtered = useMemo(() => {
        const now = Date.now();
        return bookings.filter((b: any) => {
            const t = new Date(b.start_at).getTime();
            if (filter === 'cancelled') return b.status === 'cancelled';
            if (filter === 'past') return (t < now || b.status === 'done') && b.status !== 'cancelled';
            return t >= now && b.status === 'confirmed' && b.deposit_paid;
        });
    }, [bookings, filter]);

    const hostUrl = org?.slug ? `${window.location.origin}/book/${org.slug}` : '';
    const qrUrl = hostUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(hostUrl)}` : '';

    const copyLink = async () => {
        await navigator.clipboard.writeText(hostUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const completeSetup = async (form: SetupForm) => {
        setBusy('setup');
        setError('');
        try {
            const result = await apiPost('/api/host/setup', form);
            if (result.orgSlug) setBookingOrgSlug(result.orgSlug);
            setData(result);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy('');
        }
    };

    const openCustomerView = () => {
        window.open(hostUrl, '_blank', 'noopener,noreferrer');
    };

    const markJobDone = async (id: string) => {
        setBusy(id);
        setError('');
        try {
            const result = await apiPost(`/api/host/bookings/${id}/complete`, {});
            // Update UI immediately from the complete response so a later refresh failure cannot undo success
            if (result.booking) {
                setData((prev: any) => {
                    if (!prev?.bookings) return prev;
                    return {
                        ...prev,
                        bookings: prev.bookings.map((b: any) => (b.id === id ? { ...b, ...result.booking, status: 'done' } : b))
                    };
                });
            }
            try {
                await load();
            } catch {
                // Job is already done — ignore dashboard refresh blips
            }
        } catch (e: any) {
            setError(e.message === 'Failed to fetch' ? 'Could not reach server — make sure the backend is running on port 5000.' : e.message);
            try {
                await load();
            } catch {
                /* ignore */
            }
        } finally {
            setBusy('');
        }
    };

    const cancelBooking = async (id: string) => {
        if (!window.confirm('Cancel this booking? If the customer paid a deposit, it will be refunded to their card.')) return;
        setBusy(id);
        setError('');
        try {
            const result = await apiPost(`/api/host/bookings/${id}/cancel`, {});
            if (result.refundError) {
                setError(`Booking cancelled, but refund failed: ${result.refundError}. Refund manually in Stripe.`);
            } else if (result.refund && !result.refund.skipped) {
                setError('');
            }
            await load();
        } catch (e: any) {
            setError(e.message === 'Failed to fetch' ? 'Could not reach server — make sure the backend is running on port 5000.' : e.message);
        } finally {
            setBusy('');
        }
    };

    if (loading) return <div className="flex items-center justify-center py-24 font-bold text-[#0F172A]">Loading Booking Plots…</div>;

    if (!ready) {
        return (
            <BookingSetupWizard
                linked={linked}
                linkedBusiness={linkedBusiness}
                busy={busy === 'setup'}
                error={error}
                onComplete={completeSetup}
            />
        );
    }

    const displayName = org?.name || 'Your business';
    const subtitle = [org?.host_name, org?.trade_type].filter(Boolean).join(' · ');

    const openSettings = (tab = 'events') => {
        setSearchParams({ panel: 'settings', tab });
    };

    const backToBoard = () => setSearchParams({});

    return (
        <div className="w-full space-y-4">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6 lg:py-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <p className="text-xs text-white/50 uppercase tracking-widest">Booking page</p>
                        <h1 className="font-black text-xl">{displayName}</h1>
                        <p className="text-sm text-white/60">{subtitle}{org?.service_area ? ` · ${org.service_area}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111827] text-[#F59E0B] text-xs font-bold">
                            <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy link'}
                        </button>
                        <button type="button" onClick={openCustomerView} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F59E0B] text-white text-xs font-bold">
                            <ExternalLink className="w-3.5 h-3.5" /> Customer view
                        </button>
                        <Link to={hostUrl} target="_blank" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-bold" title="Open public page">
                            Open link
                        </Link>
                        <button type="button" onClick={() => openSettings()} className="p-2 rounded-xl bg-white/10" title="Settings"><Settings className="w-4 h-4" /></button>
                        <button type="button" onClick={() => openSettings('profile')} className="p-2 rounded-xl bg-white/10" title="Profile"><User className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
                <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    {panel === 'settings' ? (
                        <div className="p-4">
                            <BookingSettingsPanel
                                embedded
                                onBack={backToBoard}
                                initialDashboard={data}
                                onRefresh={load}
                            />
                        </div>
                    ) : (
                        <>
                    <div className="flex gap-1 p-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                        {(['upcoming', 'past', 'cancelled'] as const).map((f) => (
                            <button key={f} type="button" onClick={() => setFilter(f)} className={cn('px-3 py-2 rounded-lg text-xs font-bold capitalize', filter === f ? 'bg-white shadow-sm text-[#0F172A]' : 'text-[#64748B]')}>
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className="p-4 min-h-[400px]">
                        {!filtered.length && (
                            <div className="border border-dashed border-[#E2E8F0] rounded-2xl p-10 text-center flex flex-col items-center justify-center min-h-[340px] bg-[#FAFBFC]">
                                <div className="w-16 h-16 rounded-2xl bg-[#F59E0B]/25 flex items-center justify-center mb-4">
                                    <Wrench className="w-8 h-8 text-[#0F172A]" />
                                </div>
                                <h3 className="font-black text-lg text-[#0F172A]">No bookings yet</h3>
                                <p className="text-sm text-[#64748B] mt-2 max-w-md">Share your link or open customer view to test a booking.</p>
                                <button type="button" onClick={openCustomerView} className="mt-5 px-5 py-3 rounded-xl bg-[#F59E0B] text-white text-sm font-bold inline-flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4" /> Open customer view
                                </button>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filtered.map((b: any) => {
                            const badge = bookingStatusBadge(b);
                            return (
                                    <div key={b.id} className="rounded-xl border border-[#E2E8F0] p-4 flex flex-col gap-2 bg-white shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between gap-2 items-start">
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#0F172A] truncate">{b.customer_name}</p>
                                                <p className="text-xs text-[#64748B]">{b.event_name}</p>
                                            </div>
                                            <span className={cn('text-[10px] font-bold uppercase px-2 py-1 rounded-full border shrink-0', badge.className)}>
                                                {badge.label}
                                            </span>
                                        </div>
                                        <p className="text-sm flex items-center gap-1.5 text-[#0F172A] font-medium">
                                            <Calendar className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                                            {new Date(b.start_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        <p className="text-xs text-[#64748B] line-clamp-2">{b.customer_address}</p>
                                        {b.description && (
                                            <p className="text-xs text-[#64748B] bg-[#F8FAFC] rounded-lg px-2 py-1.5 line-clamp-2">{b.description}</p>
                                        )}
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {b.deposit_paid && (
                                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                                                    Deposit {formatCents(b.deposit_cents)}
                                                </span>
                                            )}
                                            {b.invoice_status && (
                                                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-1 rounded-full">
                                                    Invoice: {b.invoice_status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-2 mt-auto border-t border-[#F1F5F9]">
                                            {b.status === 'confirmed' && (
                                                <button type="button" disabled={busy === b.id} onClick={() => markJobDone(b.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#0F172A] text-white flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> {busy === b.id ? 'Saving…' : 'Mark as done'}
                                                </button>
                                            )}
                                            {b.invoice_url && (
                                                <a href={b.invoice_url} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0]">View invoice</a>
                                            )}
                                            {b.status === 'confirmed' && (
                                                <button type="button" disabled={busy === b.id} onClick={() => cancelBooking(b.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-red-600 ml-auto disabled:opacity-50">
                                                    {busy === b.id ? 'Cancelling…' : 'Cancel & refund'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                            );
                        })}
                        </div>
                    </div>
                        </>
                    )}
                </div>

                {panel === 'board' && (
                <aside className="space-y-4">
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                            <div className="flex items-center gap-2 mb-2"><QrCode className="w-4 h-4 text-[#F59E0B]" /><h3 className="text-xs font-bold uppercase text-[#64748B]">Share</h3></div>
                            {qrUrl && <img src={qrUrl} alt="QR" className="w-full max-w-[180px] mx-auto rounded-lg border border-[#E2E8F0]" />}
                            <input readOnly value={hostUrl} className="mt-3 w-full text-xs rounded-lg border border-[#E2E8F0] px-2 py-2 truncate" />
                            <p className="text-[10px] text-[#64748B] mt-2">Customers pick a service, date, time & details — deposit via Stripe.</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                            <h3 className="text-xs font-bold uppercase text-[#64748B] mb-2">Event types</h3>
                            <ul className="space-y-2">
                                {eventTypes.map((et: any) => (
                                    <li key={et.id} className="text-sm flex justify-between gap-2">
                                        <span className="font-medium">{et.name}</span>
                                        <span className="text-[#64748B] shrink-0">{formatCents(et.deposit_cents)} · {et.duration_minutes}m</span>
                                    </li>
                                ))}
                            </ul>
                            <button type="button" onClick={() => openSettings('events')} className="mt-3 block w-full text-center text-xs font-bold text-[#0F172A] underline">Manage event types</button>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <p className="text-xs text-emerald-900">Connect Google Calendar in Settings to block busy times automatically.</p>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}
