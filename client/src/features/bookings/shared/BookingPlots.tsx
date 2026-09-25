import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    ExternalLink,
    FileText,
    Link2,
    LogIn,
    Mail,
    MapPin,
    MoreHorizontal,
    MoreVertical,
    Play,
    Plus,
    QrCode,
    Receipt,
    Store,
    Trash2,
    User,
    Wallet,
    X
} from 'lucide-react';
import { apiGet, apiPost, formatCents, cn, restrictPhoneInput } from '../../../shared/utils';
import { setBookingOrgSlug } from './bookingUtils';
import BookingSetupWizard, { type SetupForm } from './BookingSetupWizard';
import BookingSettingsPanel from './BookingSettings';
import FoodOrdersHostPanel from '../restaurants/FoodOrdersHostPanel';
import { normalizeBookingIndustryId } from './bookingIndustryPresets';
import {
    PaymentDocPrintables,
    downloadPaymentInvoice,
    downloadPaymentReceipt
} from '../../payments/PaymentDocPrintables';
import type { PaymentDocument } from '../../payments/types';

function intakeAnswersList(raw: unknown): { key: string; label: string; value: string }[] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const labelMap: Record<string, string> = {
        practitionerPref: 'Stylist',
        patchTest: 'Patch test',
        patientType: 'Patient Status',
        priceListItemId: 'Treatment',
        propertyType: 'Property',
        fuseboxType: 'Consumer Unit / Fusebox',
        propertySize: 'Property Size'
    };
    return Object.entries(raw as Record<string, unknown>)
        .map(([key, value]) => ({
            key,
            label:
                labelMap[key] ||
                key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
            value: String(value ?? '').trim()
        }))
        .filter((x) => x.value && x.key !== 'priceListItemId');
}

type BookingService = {
    id: string;
    slug: string;
    name: string;
    host_name?: string;
    trade_type?: string;
    service_area?: string;
    setup_complete?: boolean;
    canResume?: boolean;
    ready?: boolean;
};

function bookingStatusBadge(b: { status: string; deposit_paid?: boolean; job_status?: string; intake_type?: string }) {
    if (b.job_status === 'requested' || b.intake_type === 'request') {
        return { label: 'REQUESTED', className: 'text-violet-700 bg-violet-50 border-violet-200' };
    }
    if (b.job_status === 'in_progress') {
        return { label: 'IN PROGRESS', className: 'text-amber-700 bg-amber-50 border-amber-200' };
    }
    if (b.job_status === 'invoiced') {
        return { label: 'INVOICED', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    }
    if (b.job_status === 'completed' || b.status === 'done') {
        return { label: 'COMPLETED', className: 'text-sky-700 bg-sky-50 border-sky-200' };
    }
    if (b.status === 'confirmed' || b.job_status === 'scheduled') {
        return { label: 'SCHEDULED', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    }
    if (b.status === 'awaiting_payment') {
        return { label: 'AWAITING PAYMENT', className: 'text-amber-700 bg-amber-50 border-amber-200' };
    }
    if (b.status === 'cancelled' || b.job_status === 'cancelled') {
        return { label: 'CANCELLED', className: 'text-red-700 bg-red-50 border-red-200' };
    }
    return { label: (b.job_status || b.status || 'SCHEDULED').toUpperCase(), className: 'text-[#64748B] bg-[#F8FAFC] border-[#E2E8F0]' };
}

function formatTimeOnly(dateStr: string) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '--:--';
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
        return '--:--';
    }
}

function formatDayDate(dateStr: string) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
        return '';
    }
}

function getGroupLabel(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Today';
        const now = new Date();
        const isToday =
            d.getDate() === now.getDate() &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();
        if (isToday) return 'Today';

        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const isTomorrow =
            d.getDate() === tomorrow.getDate() &&
            d.getMonth() === tomorrow.getMonth() &&
            d.getFullYear() === tomorrow.getFullYear();
        if (isTomorrow) return 'Tomorrow';

        return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    } catch {
        return 'Today';
    }
}

export default function BookingPlots() {
    const [searchParams, setSearchParams] = useSearchParams();
    const panel = searchParams.get('panel') === 'settings' ? 'settings' : 'board';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [data, setData] = useState<any>(null);
    const [services, setServices] = useState<BookingService[]>([]);
    const [addingService, setAddingService] = useState(false);
    const [linked, setLinked] = useState(false);
    const [linkedBusiness, setLinkedBusiness] = useState<any>(null);
    const [filter, setFilter] = useState<'upcoming' | 'requests' | 'active' | 'past' | 'cancelled' | 'food'>(
        () => (searchParams.get('filter') === 'food' ? 'food' : 'upcoming')
    );
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState('');
    const [payDialog, setPayDialog] = useState<{ id: string; amountPounds: string } | null>(null);
    const [showManual, setShowManual] = useState(false);
    const [manualBusy, setManualBusy] = useState(false);
    const [showServiceDropdown, setShowServiceDropdown] = useState(false);
    const [activeMenuJobId, setActiveMenuJobId] = useState<string | null>(null);
    const [showQrModal, setShowQrModal] = useState(false);
    const [downloadingDoc, setDownloadingDoc] = useState<PaymentDocument | null>(null);

    const [manualForm, setManualForm] = useState({
        eventTypeId: '',
        customerName: '',
        email: '',
        phone: '',
        address: '',
        description: '',
        startAt: '',
        endAt: '',
        intakeType: 'instant' as 'instant' | 'request'
    });

    const loadServices = async () => {
        try {
            const res = await apiGet('/api/host/organizations');
            setServices(res.organizations || []);
            return res.organizations || [];
        } catch {
            setServices([]);
            return [];
        }
    };

    const load = async () => {
        const [d, business] = await Promise.all([
            apiGet('/api/host/dashboard'),
            apiGet('/api/business').catch(() => null)
        ]);
        setData(d);
        setLinked(Boolean(business?.connected && business?.name));
        setLinkedBusiness(business?.connected && business?.name ? business : null);
        if (!d?.ready) {
            await loadServices();
        }
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
    const isRestaurant = normalizeBookingIndustryId(org?.booking_industry_id) === 'restaurants';
    const isSalons = normalizeBookingIndustryId(org?.booking_industry_id) === 'salons';
    const eventTypes = data?.eventTypes || [];
    const bookings = data?.bookings || [];

    const displayServices: BookingService[] =
        services.filter((s) => s.canResume).length > 0
            ? services.filter((s) => s.canResume)
            : data?.canResume && data?.organization
              ? [
                    {
                        id: data.organization.id,
                        slug: data.organization.slug,
                        name: data.organization.name,
                        host_name: data.organization.host_name,
                        trade_type: data.organization.trade_type,
                        service_area: data.organization.service_area,
                        canResume: true
                    }
                ]
              : [];
    const hasSavedServices = displayServices.length > 0;

    // Calculate dynamic KPI metric counts
    const kpiMetrics = useMemo(() => {
        const now = Date.now();
        let upcomingCount = 0;
        let requestsCount = 0;
        let inProgressCount = 0;
        let revenueDepositsCents = 0;

        bookings.forEach((b: any) => {
            const isCancelled = b.status === 'cancelled' || b.job_status === 'cancelled';
            const t = new Date(b.start_at).getTime();

            if (isCancelled) return;

            if (b.job_status === 'requested' || b.intake_type === 'request') {
                requestsCount++;
            } else if (b.job_status === 'in_progress') {
                inProgressCount++;
                if (b.deposit_cents) revenueDepositsCents += Number(b.deposit_cents);
                else if (b.total_cents) revenueDepositsCents += Number(b.total_cents);
            } else if (
                b.status === 'confirmed' ||
                b.job_status === 'scheduled' ||
                b.status === 'awaiting_payment'
            ) {
                if (t >= now || !b.start_at) {
                    upcomingCount++;
                }
                if (b.deposit_cents) revenueDepositsCents += Number(b.deposit_cents);
                else if (b.total_cents) revenueDepositsCents += Number(b.total_cents);
            } else if (b.status === 'done' || b.job_status === 'completed' || b.job_status === 'invoiced') {
                if (b.deposit_cents) revenueDepositsCents += Number(b.deposit_cents);
                else if (b.total_cents) revenueDepositsCents += Number(b.total_cents);
            }
        });

        if (revenueDepositsCents === 0 && bookings.length > 0) {
            bookings.forEach((b: any) => {
                if (b.deposit_cents) revenueDepositsCents += Number(b.deposit_cents);
            });
        }

        return {
            upcomingCount,
            requestsCount,
            inProgressCount,
            revenueDepositsCents
        };
    }, [bookings]);

    const filtered = useMemo(() => {
        const now = Date.now();
        return bookings.filter((b: any) => {
            const t = new Date(b.start_at).getTime();
            const cancelled = b.status === 'cancelled' || b.job_status === 'cancelled';
            if (filter === 'cancelled') return cancelled;
            if (filter === 'requests') return !cancelled && (b.job_status === 'requested' || b.intake_type === 'request');
            if (filter === 'active') return !cancelled && b.job_status === 'in_progress';
            if (filter === 'past') {
                return (
                    !cancelled &&
                    (b.status === 'done' ||
                        b.job_status === 'completed' ||
                        b.job_status === 'invoiced' ||
                        (t < now && b.job_status !== 'requested' && b.job_status !== 'in_progress'))
                );
            }

            return (
                !cancelled &&
                t >= now &&
                b.status !== 'done' &&
                b.job_status !== 'completed' &&
                b.job_status !== 'invoiced' &&
                b.job_status !== 'in_progress' &&
                (b.status === 'confirmed' || b.job_status === 'scheduled' || b.status === 'awaiting_payment')
            );
        });
    }, [bookings, filter]);

    // Group filtered bookings by section date
    const groupedBookings = useMemo(() => {
        const groups: { [key: string]: any[] } = {};
        filtered.forEach((b: any) => {
            const label = getGroupLabel(b.start_at);
            if (!groups[label]) groups[label] = [];
            groups[label].push(b);
        });
        return groups;
    }, [filtered]);

    const hostUrl = org?.slug ? `${window.location.origin}/book/${org.slug}` : '';
    const qrUrl = hostUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(hostUrl)}` : '';
    const displayName = org?.name || 'Your business';
    const subtitleParts = [org?.host_name, org?.trade_type || data?.bookingIndustry?.name].filter(Boolean);
    const locationPart = org?.service_area || 'Add your service area';

    const copyLink = async () => {
        if (!hostUrl) return;
        await navigator.clipboard.writeText(hostUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const completeSetup = async (form: SetupForm) => {
        setBusy('setup');
        setError('');
        try {
            const endpoint = addingService || hasSavedServices ? '/api/host/organizations' : '/api/host/setup';
            const result = await apiPost(endpoint, { ...form, createNew: addingService || hasSavedServices });
            if (result.orgSlug) setBookingOrgSlug(result.orgSlug);
            setAddingService(false);
            setData(result);
            setSearchParams({});
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy('');
        }
    };

    const resumeBooking = async (service: BookingService) => {
        setBusy(service.id);
        setError('');
        try {
            if (service.slug) setBookingOrgSlug(service.slug);
            const result = await apiPost('/api/host/resume', { orgId: service.id, slug: service.slug });
            if (result?.organization?.slug || result?.orgSlug) {
                setBookingOrgSlug(result.organization?.slug || result.orgSlug);
            }
            setData(result);
            setAddingService(false);
            setShowServiceDropdown(false);
            setSearchParams({});
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy('');
        }
    };

    const handleBookingLoggedOut = async () => {
        setSearchParams({});
        setAddingService(false);
        try {
            await load();
        } catch (e: any) {
            setData({ ready: false });
            await loadServices();
            setError(e.message);
        }
    };

    const openCustomerView = () => {
        if (hostUrl) window.open(hostUrl, '_blank', 'noopener,noreferrer');
    };

    const markJobDone = async (id: string) => {
        setBusy(id);
        setError('');
        try {
            const result = await apiPost(`/api/host/bookings/${id}/complete`, {});
            if (result.booking) {
                setData((prev: any) => {
                    if (!prev?.bookings) return prev;
                    return {
                        ...prev,
                        bookings: prev.bookings.map((b: any) =>
                            b.id === id ? { ...b, ...result.booking, status: 'done', job_status: 'completed' } : b
                        )
                    };
                });
            }
            await load().catch(() => {});
        } catch (e: any) {
            setError(e.message === 'Failed to fetch' ? 'Could not reach server — make sure the backend is running on port 5000.' : e.message);
            await load().catch(() => {});
        } finally {
            setBusy('');
        }
    };

    const remainingBalanceCents = (b: any) => {
        const total = Math.max(Number(b.total_cents) || 0, Number(b.invoice_amount_cents) || 0);
        const deposit = Number(b.deposit_cents) || 0;
        if (b.invoice_amount_cents != null && b.invoice_status && b.invoice_status !== 'paid') {
            return Math.max(0, Number(b.invoice_amount_cents) || 0);
        }
        return Math.max(0, total - deposit);
    };

    const openPaymentRequest = (b: any) => {
        const cents = remainingBalanceCents(b);
        const pounds = (cents / 100).toFixed(2).replace(/\.00$/, '');
        setPayDialog({ id: b.id, amountPounds: pounds || '0' });
        setError('');
    };

    const handleDownloadDoc = async (b: any, kind: 'invoice' | 'receipt') => {
        if (b.invoice_url && kind === 'invoice') {
            window.open(b.invoice_url, '_blank');
            return;
        }
        if (b.payment_document_id) {
            setBusy(b.id);
            try {
                const res = await apiGet(`/api/host/payment-documents/${encodeURIComponent(b.payment_document_id)}`);
                if (res.paymentDocument) {
                    setDownloadingDoc(res.paymentDocument);
                    setTimeout(async () => {
                        try {
                            if (kind === 'invoice') await downloadPaymentInvoice(res.paymentDocument);
                            else await downloadPaymentReceipt(res.paymentDocument);
                        } catch (err) {
                            console.error(err);
                        } finally {
                            setBusy('');
                        }
                    }, 200);
                    return;
                }
            } catch {
                // fallback
            } finally {
                setBusy('');
            }
        }
        openPaymentRequest(b);
    };

    const sendPaymentRequest = async () => {
        if (!payDialog) return;
        const pounds = parseFloat(payDialog.amountPounds);
        if (!Number.isFinite(pounds) || pounds < 0) {
            setError('Enter a valid amount in pounds.');
            return;
        }
        const amountCents = Math.round(pounds * 100);
        setBusy(payDialog.id);
        setError('');
        setInfo('');
        try {
            const result = await apiPost(`/api/host/bookings/${payDialog.id}/invoice`, { amountCents });
            if (result.skipped) {
                setError(result.reason || 'Nothing to charge for this booking.');
            } else {
                setInfo(`Payment request sent${result.invoiceUrl ? ' — invoice link ready' : ''}.`);
                setPayDialog(null);
            }
            await load();
        } catch (e: any) {
            setError(e.message || 'Could not send payment request');
        } finally {
            setBusy('');
        }
    };

    const startJob = async (id: string) => {
        setBusy(id);
        setError('');
        try {
            const result = await apiPost(`/api/host/bookings/${id}/start`, {});
            if (result.booking) {
                setData((prev: any) => {
                    if (!prev?.bookings) return prev;
                    return {
                        ...prev,
                        bookings: prev.bookings.map((b: any) => (b.id === id ? { ...b, ...result.booking } : b))
                    };
                });
            }
            await load().catch(() => {});
        } catch (e: any) {
            setError(e.message || 'Could not start job');
        } finally {
            setBusy('');
        }
    };

    const createManualBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualForm.eventTypeId || !manualForm.customerName.trim() || !manualForm.email.trim()) {
            setError('Service, name, and email are required');
            return;
        }
        setManualBusy(true);
        setError('');
        try {
            let startAt = manualForm.startAt;
            let endAt = manualForm.endAt;
            if (startAt && !endAt) {
                const et = (data?.eventTypes || []).find((x: any) => x.id === manualForm.eventTypeId);
                const mins = et?.duration_minutes || 60;
                endAt = new Date(new Date(startAt).getTime() + mins * 60000).toISOString().slice(0, 16);
            }
            await apiPost('/api/host/bookings', {
                eventTypeId: manualForm.eventTypeId,
                customerName: manualForm.customerName.trim(),
                email: manualForm.email.trim(),
                phone: manualForm.phone.trim(),
                address: manualForm.address.trim(),
                description: manualForm.description.trim(),
                startAt: startAt ? new Date(startAt).toISOString() : undefined,
                endAt: endAt ? new Date(endAt).toISOString() : undefined,
                intakeType: manualForm.intakeType,
                preferredSlots:
                    manualForm.intakeType === 'request' && startAt && endAt
                        ? [{ startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() }]
                        : []
            });
            setShowManual(false);
            setManualForm({
                eventTypeId: '',
                customerName: '',
                email: '',
                phone: '',
                address: '',
                description: '',
                startAt: '',
                endAt: '',
                intakeType: 'instant'
            });
            await load();
        } catch (err: any) {
            setError(err.message || 'Could not create booking');
        } finally {
            setManualBusy(false);
        }
    };

    const cancelBooking = async (id: string) => {
        if (!window.confirm('Cancel this booking? If the customer paid a deposit, it will be refunded to their card.')) return;
        setBusy(id);
        setError('');
        setInfo('');
        try {
            const result = await apiPost(`/api/host/bookings/${id}/cancel`, {});
            if (result.refundError) {
                setError(`Booking cancelled, but refund failed: ${result.refundError}. Refund manually in Stripe.`);
            } else if (result.refund && !result.refund.skipped) {
                const toCustomer = ((result.refund.refundToCustomerCents || result.refund.amountCents || 0) / 100).toFixed(2);
                setInfo(`Refund sent to customer (£${toCustomer}).`);
            }
            await load();
        } catch (e: any) {
            setError(e.message === 'Failed to fetch' ? 'Could not reach server.' : e.message);
        } finally {
            setBusy('');
        }
    };

    const openSettings = (tab = 'events') => {
        setSearchParams({ panel: 'settings', tab });
    };

    const backToBoard = () => setSearchParams({});

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-3">
                <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="font-bold text-slate-700 text-sm">Loading Booking Board…</p>
            </div>
        );
    }

    if (!ready) {
        if (addingService || (!hasSavedServices && !data?.canResume)) {
            return (
                <div className="space-y-4 max-w-4xl mx-auto py-6">
                    {addingService && (
                        <div className="px-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setAddingService(false);
                                    setError('');
                                }}
                                className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back to your services
                            </button>
                        </div>
                    )}
                    <BookingSetupWizard
                        key={`setup-${data?.organization?.booking_industry_id || data?.bookingIndustry?.id || 'pending'}`}
                        linked={linked && !addingService}
                        linkedBusiness={addingService ? null : linkedBusiness}
                        busy={busy === 'setup'}
                        error={error}
                        initialIndustryId={
                            data?.organization?.booking_industry_id ||
                            data?.bookingIndustry?.id ||
                            null
                        }
                        onRefreshIndustry={() => {
                            setLoading(true);
                            load().catch((e: any) => {
                                setError(e.message);
                                setLoading(false);
                            });
                        }}
                        onComplete={completeSetup}
                    />
                </div>
            );
        }

        return (
            <div className="max-w-xl mx-auto py-12 px-4">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
                    <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            <Calendar className="w-3.5 h-3.5 text-amber-600" /> Booking Board
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">Your Booking Services</h1>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                            Select an active service to manage appointments, customers, and live schedule.
                        </p>
                    </div>

                    <div className="space-y-2.5">
                        {displayServices.map((service) => {
                            const sub = [service.host_name, service.trade_type].filter(Boolean).join(' · ');
                            return (
                                <div
                                    key={service.id}
                                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-slate-300 transition"
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900 truncate text-base">{service.name || 'Booking service'}</p>
                                        {sub && <p className="text-xs text-slate-500 mt-0.5 truncate">{sub}</p>}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={busy === service.id}
                                        onClick={() => resumeBooking(service)}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 text-sm font-bold shadow-xs transition disabled:opacity-50 shrink-0"
                                    >
                                        <LogIn className="w-4 h-4" />
                                        {busy === service.id ? 'Opening…' : 'Open Dashboard'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">{error}</p>}

                    <button
                        type="button"
                        onClick={() => {
                            setError('');
                            setAddingService(true);
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-100/80 text-slate-800 py-3.5 text-sm font-bold transition"
                    >
                        <Plus className="w-4 h-4 text-slate-500" />
                        Add a new service
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-5">
            {downloadingDoc && <PaymentDocPrintables doc={downloadingDoc} />}

            {/* 1. HERO HEADER BAR */}
            <div className="relative overflow-hidden rounded-2xl bg-[#0B1528] text-white p-6 sm:p-7 shadow-sm border border-slate-800/80">
                <div className="flex items-start justify-between gap-4">
                    {/* Left Column: 4 vertical items */}
                    <div className="space-y-2 min-w-0 max-w-3xl">
                        {/* Row 1: Back Navigation */}
                        <div className="flex items-center">
                            <span
                                onClick={() => {
                                    if (displayServices.length > 1) {
                                        setShowServiceDropdown(!showServiceDropdown);
                                    } else {
                                        openSettings('profile');
                                    }
                                }}
                                className="inline-flex items-center gap-2 text-xs font-semibold text-white/80 hover:text-white cursor-pointer transition tracking-wide"
                            >
                                <ArrowLeft className="w-3.5 h-3.5 text-white/80" /> Booking page
                            </span>
                        </div>

                        {/* Row 2: Business Title */}
                        <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-white leading-tight">
                            {displayName}
                        </h1>

                        {/* Row 3: Subtitle with Location Pin */}
                        <p className="text-xs sm:text-[13px] text-white/60 flex flex-wrap items-center gap-1.5 leading-normal">
                            {subtitleParts.length > 0 && <span>{subtitleParts.join(' · ')}</span>}
                            {subtitleParts.length > 0 && <span>·</span>}
                            <span className="inline-flex items-center gap-1 text-white/75">
                                <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                {locationPart}
                            </span>
                        </p>

                        {/* Row 4: Action Buttons Row */}
                        <div className="flex flex-wrap items-center gap-2.5 pt-2">
                            {/* Copy Link Button: Solid Vibrant Orange */}
                            <button
                                type="button"
                                onClick={copyLink}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] active:bg-[#CC6D00] text-white text-xs font-bold shadow-sm transition"
                            >
                                <Link2 className="w-3.5 h-3.5 text-white" />
                                {copied ? 'Copied!' : 'Copy link'}
                            </button>

                            {/* Customer View Button: Dark Translucent Navy */}
                            <button
                                type="button"
                                onClick={openCustomerView}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#131D33] hover:bg-[#1A2744] active:bg-[#111A2E] text-white text-xs font-medium border border-slate-700/80 shadow-xs transition"
                            >
                                <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                                Customer view
                            </button>

                            {/* QR Code Button: Dark Translucent Navy */}
                            <button
                                type="button"
                                onClick={() => setShowQrModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#131D33] hover:bg-[#1A2744] active:bg-[#111A2E] text-white text-xs font-medium border border-slate-700/80 shadow-xs transition"
                                title="View QR Code"
                            >
                                <QrCode className="w-3.5 h-3.5 text-white/80" />
                                QR Code
                            </button>
                        </div>
                    </div>

                    {/* Top Right Action Icons: Store Switcher & Settings */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                                className="p-2.5 rounded-xl bg-[#131D33] hover:bg-[#1A2744] border border-slate-700/80 text-white/80 hover:text-white transition shadow-xs"
                                title="Switch services"
                            >
                                <Store className="w-4 h-4" />
                            </button>

                            {showServiceDropdown && (
                                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 z-50 text-slate-900 space-y-1">
                                    <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                        Your Services
                                    </p>
                                    {displayServices.map((svc) => (
                                        <button
                                            key={svc.id}
                                            type="button"
                                            onClick={() => resumeBooking(svc)}
                                            className={cn(
                                                'w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between',
                                                svc.id === org?.id ? 'bg-orange-50 text-orange-950' : 'hover:bg-slate-100 text-slate-800'
                                            )}
                                        >
                                            <span className="truncate">{svc.name}</span>
                                            {svc.id === org?.id && <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                                        </button>
                                    ))}
                                    <div className="border-t border-slate-100 pt-1 mt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowServiceDropdown(false);
                                                setAddingService(true);
                                                setData({ ready: false });
                                            }}
                                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-orange-600 hover:bg-orange-50 transition flex items-center gap-1.5"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Add new service
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => openSettings('profile')}
                            className="p-2.5 rounded-xl bg-[#131D33] hover:bg-[#1A2744] border border-slate-700/80 text-white/80 hover:text-white transition shadow-xs"
                            title="Booking settings"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Error / Success Notifications */}
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>}
            {info && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">{info}</p>}

            {/* QR Code Modal Dialog */}
            {showQrModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-sm space-y-4 shadow-2xl text-center">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2 text-left">
                                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                                    <QrCode className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-slate-900 leading-tight">Booking QR Code</h3>
                                    <p className="text-xs text-slate-500">Scan or share with customers</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowQrModal(false)}
                                className="text-xs font-bold text-slate-400 hover:text-slate-700 p-1"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex flex-col items-center justify-center py-2 space-y-3">
                            {qrUrl ? (
                                <img
                                    src={qrUrl}
                                    alt="QR Code"
                                    width={180}
                                    height={180}
                                    className="w-44 h-44 rounded-2xl border border-slate-200 bg-white p-2 object-contain shadow-xs"
                                />
                            ) : (
                                <div className="w-44 h-44 rounded-2xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                                    <QrCode className="w-12 h-12 text-slate-300" />
                                </div>
                            )}
                            <p className="text-xs text-slate-500 max-w-xs">
                                Customers can scan this code with their camera to book appointments directly.
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <input
                                readOnly
                                value={hostUrl}
                                className="min-w-0 flex-1 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 truncate"
                            />
                            <button
                                type="button"
                                onClick={copyLink}
                                className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition shrink-0"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShowQrModal(false)}
                                className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {panel === 'settings' ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                    <BookingSettingsPanel
                        embedded
                        onBack={backToBoard}
                        onLoggedOut={handleBookingLoggedOut}
                        initialDashboard={data}
                        onRefresh={load}
                    />
                </div>
            ) : (
                <>
                    {/* 2. STAT KPI CARDS ROW */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {/* KPI 1: Upcoming */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex items-center gap-3.5 shadow-xs hover:shadow-sm transition">
                            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/80">
                                <Calendar className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
                                    {kpiMetrics.upcomingCount}
                                </p>
                                <p className="text-xs text-slate-500 font-semibold mt-1 truncate">Upcoming</p>
                            </div>
                        </div>

                        {/* KPI 2: Requests */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex items-center gap-3.5 shadow-xs hover:shadow-sm transition">
                            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100/80">
                                <Mail className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
                                    {kpiMetrics.requestsCount}
                                </p>
                                <p className="text-xs text-slate-500 font-semibold mt-1 truncate">Requests</p>
                            </div>
                        </div>

                        {/* KPI 3: In progress */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex items-center gap-3.5 shadow-xs hover:shadow-sm transition">
                            <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100/80">
                                <Clock className="w-5 h-5 text-sky-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
                                    {kpiMetrics.inProgressCount}
                                </p>
                                <p className="text-xs text-slate-500 font-semibold mt-1 truncate">In progress</p>
                            </div>
                        </div>

                        {/* KPI 4: Revenue (deposits) */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex items-center gap-3.5 shadow-xs hover:shadow-sm transition">
                            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/80">
                                <Wallet className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
                                    {formatCents(kpiMetrics.revenueDepositsCents)}
                                </p>
                                <p className="text-xs text-slate-500 font-semibold mt-1 truncate">Revenue (deposits)</p>
                            </div>
                        </div>
                    </div>

                    {/* 3. TABS BAR & ADD JOB BUTTON */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
                            {/* Upcoming Tab */}
                            <button
                                type="button"
                                onClick={() => setFilter('upcoming')}
                                className={cn(
                                    'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                    filter === 'upcoming'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                )}
                            >
                                Upcoming
                                <span
                                    className={cn(
                                        'px-1.5 py-0.5 rounded-full text-[10px] font-black',
                                        filter === 'upcoming'
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'bg-slate-200/70 text-slate-600'
                                    )}
                                >
                                    {kpiMetrics.upcomingCount}
                                </span>
                            </button>

                            {/* Requests Tab */}
                            <button
                                type="button"
                                onClick={() => setFilter('requests')}
                                className={cn(
                                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                    filter === 'requests'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                )}
                            >
                                Requests <span className="text-slate-400 font-normal">{kpiMetrics.requestsCount}</span>
                            </button>

                            {/* In Progress Tab */}
                            <button
                                type="button"
                                onClick={() => setFilter('active')}
                                className={cn(
                                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                    filter === 'active'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                )}
                            >
                                In Progress <span className="text-slate-400 font-normal">{kpiMetrics.inProgressCount}</span>
                            </button>

                            {/* Past Tab */}
                            <button
                                type="button"
                                onClick={() => setFilter('past')}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                    filter === 'past'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                )}
                            >
                                Past
                            </button>

                            {/* Cancelled Tab */}
                            <button
                                type="button"
                                onClick={() => setFilter('cancelled')}
                                className={cn(
                                    'px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                    filter === 'cancelled'
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                )}
                            >
                                Cancelled
                            </button>

                            {/* Food Orders (Restaurant only) */}
                            {isRestaurant && (
                                <button
                                    type="button"
                                    onClick={() => setFilter('food')}
                                    className={cn(
                                        'px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
                                        filter === 'food'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    )}
                                >
                                    Food orders
                                </button>
                            )}
                        </div>

                        {/* Add job button */}
                        <button
                            type="button"
                            onClick={() => {
                                setShowManual(true);
                                setManualForm((f) => ({
                                    ...f,
                                    eventTypeId: f.eventTypeId || eventTypes[0]?.id || ''
                                }));
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1528] hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition"
                        >
                            <Plus className="w-4 h-4 text-white" />
                            {isSalons ? 'Add booking' : 'Add job'}
                        </button>
                    </div>

                    {/* Manual Booking / Job Modal Form */}
                    {showManual && (
                        <form
                            onSubmit={createManualBooking}
                            className="p-5 border border-slate-200 bg-white rounded-2xl shadow-sm space-y-4"
                        >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                <div>
                                    <h3 className="font-bold text-base text-slate-900">
                                        {isSalons ? 'Manual appointment' : 'Manual booking / job'}
                                    </h3>
                                    <p className="text-xs text-slate-500">Add a client appointment directly to the board.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowManual(false)}
                                    className="text-xs font-bold text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg transition"
                                >
                                    ✕ Close
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <select
                                    required
                                    value={manualForm.eventTypeId}
                                    onChange={(e) => setManualForm((f) => ({ ...f, eventTypeId: e.target.value }))}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-50/50"
                                >
                                    <option value="">Select service / plan</option>
                                    {eventTypes.map((et: any) => (
                                        <option key={et.id} value={et.id}>
                                            {et.category ? `${et.category} · ${et.name}` : et.name}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={manualForm.intakeType}
                                    onChange={(e) =>
                                        setManualForm((f) => ({ ...f, intakeType: e.target.value as 'instant' | 'request' }))
                                    }
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-50/50"
                                >
                                    <option value="instant">Scheduled appointment</option>
                                    <option value="request">Request (to schedule)</option>
                                </select>

                                <input
                                    required
                                    placeholder="Customer name"
                                    value={manualForm.customerName}
                                    onChange={(e) => setManualForm((f) => ({ ...f, customerName: e.target.value }))}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
                                />

                                <input
                                    required
                                    type="email"
                                    placeholder="Email address"
                                    value={manualForm.email}
                                    onChange={(e) => setManualForm((f) => ({ ...f, email: e.target.value }))}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
                                />

                                <input
                                    placeholder="Phone number"
                                    value={manualForm.phone}
                                    onChange={(e) =>
                                        setManualForm((f) => ({ ...f, phone: restrictPhoneInput(e.target.value) }))
                                    }
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
                                />

                                <input
                                    placeholder={isSalons ? 'Location / notes' : 'Customer address'}
                                    value={manualForm.address}
                                    onChange={(e) => setManualForm((f) => ({ ...f, address: e.target.value }))}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
                                />

                                <input
                                    type="datetime-local"
                                    required={manualForm.intakeType === 'instant'}
                                    value={manualForm.startAt}
                                    onChange={(e) => setManualForm((f) => ({ ...f, startAt: e.target.value }))}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800 sm:col-span-2"
                                />

                                <input
                                    placeholder={isSalons ? 'Appointment notes' : 'Job description / notes'}
                                    value={manualForm.description}
                                    onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
                                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800 sm:col-span-2"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowManual(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={manualBusy}
                                    className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-50 transition"
                                >
                                    {manualBusy ? 'Saving…' : 'Create Appointment'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Food Orders View for Restaurants */}
                    {filter === 'food' && isRestaurant ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                            <FoodOrdersHostPanel />
                        </div>
                    ) : (
                        /* 4. BOOKINGS LIST SECTION */
                        <div className="space-y-4">
                            {!filtered.length && (
                                <div className="border border-dashed border-slate-300 rounded-2xl p-10 text-center flex flex-col items-center justify-center min-h-[280px] bg-white">
                                    <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-3.5 border border-orange-100">
                                        <Calendar className="w-7 h-7 text-orange-600" />
                                    </div>
                                    <h3 className="font-black text-lg text-slate-900">
                                        {filter === 'upcoming'
                                            ? 'No upcoming bookings'
                                            : filter === 'requests'
                                              ? 'No pending requests'
                                              : filter === 'active'
                                                ? 'No jobs in progress'
                                                : filter === 'past'
                                                  ? 'No past appointments'
                                                  : 'No cancelled bookings'}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md">
                                        Share your booking page with clients to accept appointments online.
                                    </p>
                                    <div className="flex items-center gap-2.5 mt-5">
                                        <button
                                            type="button"
                                            onClick={openCustomerView}
                                            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition"
                                        >
                                            <ExternalLink className="w-4 h-4" /> Open customer view
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowManual(true);
                                                setManualForm((f) => ({
                                                    ...f,
                                                    eventTypeId: f.eventTypeId || eventTypes[0]?.id || ''
                                                }));
                                            }}
                                            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold inline-flex items-center gap-2 transition"
                                        >
                                            <Plus className="w-4 h-4" /> Add manual booking
                                        </button>
                                    </div>
                                </div>
                            )}

                            {Object.entries(groupedBookings).map(([groupDate, groupList]) => (
                                <div key={groupDate} className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                                            <span>{groupDate}</span>
                                            <span className="text-[11px] font-semibold text-slate-400">
                                                ({groupList.length} {groupList.length === 1 ? 'job' : 'jobs'})
                                            </span>
                                        </h2>

                                        {groupList.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowManual(true);
                                                    setManualForm((f) => ({
                                                        ...f,
                                                        eventTypeId: f.eventTypeId || eventTypes[0]?.id || ''
                                                    }));
                                                }}
                                                className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 transition"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Add more jobs
                                            </button>
                                        )}
                                    </div>

                                    {groupList.map((b: any) => {
                                        const badge = bookingStatusBadge(b);
                                        const customerInitial = (b.customer_name || 'M').charAt(0).toUpperCase();
                                        const timeStr = formatTimeOnly(b.start_at);
                                        const dayStr = formatDayDate(b.start_at);
                                        const intakeAnswers = intakeAnswersList(b.intake_answers);
                                        const depositAmount =
                                            Number(b.deposit_cents) > 0
                                                ? formatCents(b.deposit_cents)
                                                : b.total_cents
                                                  ? formatCents(b.total_cents)
                                                  : formatCents(0);
                                        const totalAmount =
                                            Number(b.total_cents) > 0
                                                ? formatCents(b.total_cents)
                                                : depositAmount;

                                        return (
                                            <div
                                                key={b.id}
                                                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-shadow p-4 sm:p-5 space-y-4 relative"
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                                                    {/* Left Time Block */}
                                                    <div className="sm:w-28 shrink-0 flex sm:flex-col items-center sm:items-start gap-1 sm:gap-0.5 sm:border-r sm:border-slate-100 sm:pr-4">
                                                        <div className="flex items-center gap-1.5 text-slate-900 font-black text-lg sm:text-xl leading-tight">
                                                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                                                            <span>{timeStr}</span>
                                                        </div>
                                                        <p className="text-[11px] sm:text-xs font-medium text-slate-400 pl-5 sm:pl-0">
                                                            {dayStr}
                                                        </p>
                                                    </div>

                                                    {/* Middle Information Block */}
                                                    <div className="flex-1 min-w-0 space-y-2">
                                                        {/* Avatar, Customer Name, Status Badge, 3-dots */}
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-900 border border-orange-200 font-black text-xs flex items-center justify-center shrink-0">
                                                                    {customerInitial}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-bold text-slate-900 text-sm sm:text-base truncate leading-tight">
                                                                        {b.customer_name}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span
                                                                    className={cn(
                                                                        'text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border',
                                                                        badge.className
                                                                    )}
                                                                >
                                                                    {badge.label}
                                                                </span>

                                                                {/* 3-dots Menu with Dropdown */}
                                                                <div className="relative">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setActiveMenuJobId(
                                                                                activeMenuJobId === b.id ? null : b.id
                                                                            )
                                                                        }
                                                                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                                                                    >
                                                                        <MoreHorizontal className="w-4 h-4" />
                                                                    </button>

                                                                    {activeMenuJobId === b.id && (
                                                                        <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 text-slate-900 space-y-1 text-xs">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setActiveMenuJobId(null);
                                                                                    openPaymentRequest(b);
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                                            >
                                                                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                                                                <span>Payment request</span>
                                                                            </button>

                                                                            {b.client_id && (
                                                                                <Link
                                                                                    to={`/clients/${b.client_id}`}
                                                                                    onClick={() => setActiveMenuJobId(null)}
                                                                                    className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                                                >
                                                                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                                                                    <span>Client Profile</span>
                                                                                </Link>
                                                                            )}

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setActiveMenuJobId(null);
                                                                                    handleDownloadDoc(b, 'invoice');
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                                                            >
                                                                                <Receipt className="w-3.5 h-3.5 text-slate-400" />
                                                                                <span>Download receipt/PDF</span>
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setActiveMenuJobId(null);
                                                                                    cancelBooking(b.id);
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 rounded-xl font-semibold hover:bg-red-50 flex items-center gap-2 text-red-600 border-t border-slate-100 mt-1"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                                <span>Cancel & refund</span>
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Plan / Service Name */}
                                                        <div>
                                                            <p className="font-bold text-slate-800 text-sm">
                                                                {b.event_category
                                                                    ? `${b.event_category} · ${b.event_name}`
                                                                    : b.event_name}
                                                            </p>
                                                        </div>

                                                        {/* Intake Tags / Category Badges */}
                                                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                            {intakeAnswers.length > 0 ? (
                                                                intakeAnswers.map((a) => (
                                                                    <span
                                                                        key={a.key}
                                                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100"
                                                                    >
                                                                        {a.value}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100">
                                                                    New Patient
                                                                </span>
                                                            )}
                                                            {b.client_id && (
                                                                <Link
                                                                    to={`/clients/${b.client_id}`}
                                                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-800 border border-orange-200 hover:underline"
                                                                >
                                                                    Client profile →
                                                                </Link>
                                                            )}
                                                        </div>

                                                        {/* Location / Address */}
                                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                            <span className="truncate">
                                                                {b.customer_address || locationPart}
                                                            </span>
                                                        </p>

                                                        {/* Financials Breakdown */}
                                                        <div className="flex items-center gap-8 pt-2 text-xs">
                                                            <div>
                                                                <span className="text-slate-400 font-medium block text-[11px]">
                                                                    Deposit
                                                                </span>
                                                                <span className="font-bold text-slate-900 text-sm">
                                                                    {depositAmount}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-400 font-medium block text-[11px]">
                                                                    Total
                                                                </span>
                                                                <span className="font-bold text-slate-900 text-sm">
                                                                    {totalAmount}
                                                                </span>
                                                            </div>
                                                            {b.invoice_status && (
                                                                <div>
                                                                    <span className="text-slate-400 font-medium block text-[11px]">
                                                                        Invoice
                                                                    </span>
                                                                    <span className="font-bold text-sky-700 text-xs uppercase">
                                                                        {b.invoice_status}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Bottom Action Buttons Bar */}
                                                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                                                    {/* Primary: Start job */}
                                                    {(b.status === 'confirmed' ||
                                                        b.job_status === 'scheduled' ||
                                                        b.job_status === 'requested') &&
                                                        b.job_status !== 'in_progress' &&
                                                        b.status !== 'done' &&
                                                        b.job_status !== 'completed' &&
                                                        b.job_status !== 'invoiced' && (
                                                            <button
                                                                type="button"
                                                                disabled={busy === b.id}
                                                                onClick={() => startJob(b.id)}
                                                                className="px-4 py-2 rounded-xl bg-[#FF8800] hover:bg-[#E67A00] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                                                            >
                                                                <Play className="w-3.5 h-3.5 fill-current" />
                                                                {busy === b.id ? 'Starting…' : 'Start job'}
                                                            </button>
                                                        )}

                                                    {/* Mark as done */}
                                                    {(b.status === 'confirmed' ||
                                                        b.job_status === 'in_progress' ||
                                                        b.job_status === 'scheduled' ||
                                                        b.job_status === 'requested') &&
                                                        b.status !== 'done' &&
                                                        b.job_status !== 'completed' &&
                                                        b.job_status !== 'invoiced' && (
                                                            <button
                                                                type="button"
                                                                disabled={busy === b.id}
                                                                onClick={() => markJobDone(b.id)}
                                                                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                                                            >
                                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                                {busy === b.id ? 'Saving…' : 'Mark as done'}
                                                            </button>
                                                        )}

                                                    {/* Single Clean Invoice Button with Icon */}
                                                    {b.invoice_url ? (
                                                        <a
                                                            href={b.invoice_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
                                                        >
                                                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                                                            Invoice
                                                        </a>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={busy === b.id}
                                                            onClick={() => openPaymentRequest(b)}
                                                            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
                                                        >
                                                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                                                            Invoice
                                                        </button>
                                                    )}

                                                    {/* Single Clean Receipt Button with Icon */}
                                                    <button
                                                        type="button"
                                                        disabled={busy === b.id}
                                                        onClick={() => handleDownloadDoc(b, 'receipt')}
                                                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
                                                    >
                                                        <Receipt className="w-3.5 h-3.5 text-slate-500" />
                                                        Receipt
                                                    </button>

                                                    {/* Cancel & refund */}
                                                    {(b.status === 'confirmed' ||
                                                        b.job_status === 'requested' ||
                                                        b.job_status === 'scheduled' ||
                                                        b.job_status === 'in_progress') &&
                                                        b.status !== 'cancelled' &&
                                                        b.job_status !== 'cancelled' && (
                                                            <button
                                                                type="button"
                                                                disabled={busy === b.id}
                                                                onClick={() => cancelBooking(b.id)}
                                                                className="ml-auto text-xs font-semibold text-red-500 hover:text-red-700 inline-flex items-center gap-1.5 transition disabled:opacity-50"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                {busy === b.id ? 'Cancelling…' : 'Cancel & refund'}
                                                            </button>
                                                        )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}

                            {/* View More Options Footer Banner */}
                            {filtered.length > 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="text-left">
                                        <p className="text-xs font-bold text-slate-800">
                                            Viewing {filtered.length} appointment{filtered.length === 1 ? '' : 's'} on schedule
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            Use filters above or click + Add job to schedule more client bookings.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowManual(true);
                                            setManualForm((f) => ({
                                                ...f,
                                                eventTypeId: f.eventTypeId || eventTypes[0]?.id || ''
                                            }));
                                        }}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold shadow-xs transition"
                                    >
                                        <Plus className="w-3.5 h-3.5 text-orange-500" />
                                        Schedule next job
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 5. BOTTOM GRID: 4 MANAGEMENT CARDS (2x2 GRID) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        {/* CARD 1: Booking page */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                                    <Link2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                                        Booking page
                                    </h3>
                                    <p className="text-xs text-slate-500">Share your booking page with customers</p>
                                </div>
                            </div>

                            <div className="flex gap-3.5 items-center">
                                {qrUrl ? (
                                    <img
                                        src={qrUrl}
                                        alt="QR Code"
                                        width={84}
                                        height={84}
                                        className="w-20 h-20 shrink-0 rounded-xl border border-slate-200 bg-white p-1 object-contain shadow-xs"
                                    />
                                ) : (
                                    <div className="w-20 h-20 shrink-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                                        <QrCode className="w-8 h-8 text-slate-300" />
                                    </div>
                                )}

                                <div className="min-w-0 flex-1 space-y-2.5">
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            readOnly
                                            value={hostUrl || `http://localhost:5173/book/${org?.slug || 'carmen'}`}
                                            className="min-w-0 flex-1 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-slate-700 truncate select-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={copyLink}
                                            className="shrink-0 px-3 py-2 rounded-xl bg-[#0B1528] hover:bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1 transition"
                                        >
                                            <Copy className="w-3 h-3" />
                                            {copied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={openCustomerView}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 transition"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" /> Open customer view →
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: Services Table */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                                            Services
                                        </h3>
                                        <p className="text-xs text-slate-500">Services available for online booking</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openSettings('events')}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 transition shrink-0"
                                >
                                    View all services →
                                </button>
                            </div>

                            <div className="border border-slate-100 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                        <tr>
                                            <th className="py-2 px-3 font-bold">Services</th>
                                            <th className="py-2 px-3 font-bold">Price</th>
                                            <th className="py-2 px-3 font-bold text-right">Duration</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(eventTypes.length > 0 ? eventTypes : [])
                                            .slice(0, 6)
                                            .map((et: any) => (
                                                <tr key={et.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-2 px-3 font-semibold text-slate-800 truncate max-w-[180px]">
                                                        {et.name}
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-600 font-medium">
                                                        {formatCents(et.deposit_cents || 0)}
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-500 text-right">
                                                        {et.duration_minutes || 60} min
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* CARD 3: Event types */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                                        <Calendar className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                                            Event types
                                        </h3>
                                        <p className="text-xs text-slate-500">Manage your booking event types</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openSettings('events')}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 transition shrink-0"
                                >
                                    Manage event types →
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {eventTypes.slice(0, 4).map((et: any) => (
                                    <span
                                        key={et.id}
                                        className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700 truncate"
                                    >
                                        {et.name}
                                    </span>
                                ))}
                                {eventTypes.length > 4 && (
                                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">
                                        +{eventTypes.length - 4} more
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* CARD 4: Google Calendar */}
                        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                    <Calendar className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                                        Google Calendar
                                    </h3>
                                    <p className="text-xs text-slate-500 truncate">
                                        Your bookings will be automatically synced.
                                    </p>
                                </div>
                            </div>

                            <div className="shrink-0">
                                {data?.googleCalendarConnected ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => openSettings('integrations')}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* QR Code Modal */}
                    {showQrModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 w-full max-w-sm space-y-5 shadow-2xl relative text-center">
                                <button
                                    type="button"
                                    onClick={() => setShowQrModal(false)}
                                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                <div className="space-y-1">
                                    <h3 className="font-black text-lg text-slate-900 tracking-tight">{displayName}</h3>
                                    <p className="text-xs text-slate-500 font-medium">Scan to open customer booking page</p>
                                </div>

                                <div className="flex justify-center py-2">
                                    <div className="p-4 bg-white rounded-2xl border-2 border-slate-100 shadow-sm inline-block">
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(hostUrl || window.location.href)}`}
                                            alt="Booking QR Code"
                                            className="w-48 h-48 rounded-lg object-contain mx-auto"
                                        />
                                    </div>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-left space-y-1.5">
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Booking Link</p>
                                    <p className="text-xs font-mono text-slate-700 truncate">{hostUrl || 'https://localpulse.app/book'}</p>
                                </div>

                                <div className="flex gap-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={copyLink}
                                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-bold shadow-sm transition"
                                    >
                                        <Link2 className="w-4 h-4" />
                                        {copied ? 'Copied!' : 'Copy Link'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowQrModal(false)}
                                        className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Payment Invoice Modal */}
                    {payDialog && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-sm space-y-4 shadow-2xl">
                                <div>
                                    <h3 className="font-bold text-base text-slate-900">Send Payment Request</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Email the customer an invoice link for the remaining balance.
                                    </p>
                                </div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                                    Amount (£)
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={payDialog.amountPounds}
                                        onChange={(e) =>
                                            setPayDialog((prev) =>
                                                prev ? { ...prev, amountPounds: e.target.value } : prev
                                            )
                                        }
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                                    />
                                </label>
                                <div className="flex gap-2 justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setPayDialog(null)}
                                        className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy === payDialog.id}
                                        onClick={sendPaymentRequest}
                                        className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition disabled:opacity-50"
                                    >
                                        {busy === payDialog.id ? 'Sending…' : 'Send Invoice'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
