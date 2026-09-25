import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Download, Mail, ShieldCheck } from 'lucide-react';
import { API_BASE, apiGet, apiPost, cn, restrictPhoneInput } from '../../../shared/utils';
import { getBookingPreset, normalizeBookingIndustryId, resolveSalonServiceCategory } from './bookingIndustryPresets';
import CustomerViewPortal from './CustomerViewPortal';
import FoodOrderFlow from '../restaurants/FoodOrderFlow';
import { orgBrandStyle, resolveOrgBrand } from '../../../shared/orgBrand';
import { PaymentPaidCard } from '../../payments/PaymentPaidCard';

type EventType = {
    slug: string;
    name: string;
    description?: string;
    durationMinutes: number;
    depositCents: number;
    totalCents?: number;
    category?: string;
};

type PortalProps = {
    hostSlug: string;
    host: any;
    eventTypes: EventType[];
    menuItems?: any[];
    industry?: any;
    mediaUploadsEnabled?: boolean;
    eventSlug?: string;
};

function PublicCustomerPortal(props: PortalProps) {
    return <CustomerViewPortal {...props} />;
}

export function PublicBookHost() {
    const { hostSlug } = useParams();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [path, setPath] = useState<'choose' | 'table' | 'food' | null>(null);

    useEffect(() => {
        if (!hostSlug) return;
        apiGet(`/api/public/${hostSlug}`)
            .then((d) => {
                setData(d);
                const isRestaurant = normalizeBookingIndustryId(d.bookingIndustryId) === 'restaurants';
                if (!isRestaurant) {
                    setPath('table');
                } else if (searchParams.get('food') === '1') {
                    setPath('food');
                } else if (searchParams.get('table') === '1') {
                    setPath('table');
                } else {
                    setPath('choose');
                }
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [hostSlug, searchParams]);

    if (loading || path === null) {
        return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading…</div>;
    }
    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Not found'}</div>
        );
    }

    const isRestaurantHost =
        normalizeBookingIndustryId(data.bookingIndustryId) === 'restaurants';

    const eventTypes = (data.eventTypes || []).map((et: any) => ({
        slug: et.slug,
        name: et.name,
        description: et.description,
        durationMinutes: et.duration_minutes,
        depositCents: et.deposit_cents,
        totalCents: et.total_cents,
        category: resolveSalonServiceCategory(et.name, et.category || '')
    }));
    const menuItems = (data.menuItems || []).map((m: any) => ({
        id: m.id,
        category: m.category || '',
        name: m.name,
        description: m.description || '',
        priceCents: Number(m.priceCents ?? m.price_cents) || 0,
        available: m.active !== false && m.available !== false
    }));
    const hasMenu = menuItems.length > 0;
    const brand = resolveOrgBrand({
        logoUrl: data.logoUrl || data.logo_url || '',
        brandPrimary: data.brandPrimary || data.brand_primary,
        brandSecondary: data.brandSecondary || data.brand_secondary
    });

    const brandNav = (
        <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm">
            <div className="mx-auto flex h-20 max-w-6xl items-center gap-5 px-4 sm:h-24 sm:gap-6 sm:px-6 lg:px-8">
                {brand.logoUrl ? (
                    <div className="flex h-12 max-w-[140px] shrink-0 items-center overflow-hidden sm:h-14 sm:max-w-[160px]">
                        <img
                            src={brand.logoUrl}
                            alt=""
                            className="max-h-12 w-auto max-w-[140px] object-contain object-left sm:max-h-14 sm:max-w-[160px]"
                        />
                    </div>
                ) : null}
                <div className="min-w-0 leading-snug">
                    <p className="truncate text-base font-extrabold tracking-tight text-[#0F172A] sm:text-lg">
                        {data.name}
                    </p>
                    {data.tradeType ? (
                        <p className="truncate text-xs font-medium text-[#64748B] sm:text-sm">
                            {data.tradeType}
                        </p>
                    ) : null}
                </div>
            </div>
        </header>
    );

    if (isRestaurantHost && path === 'choose') {
        return (
            <div
                className="min-h-screen"
                style={{
                    ...orgBrandStyle({
                        logoUrl: data.logoUrl,
                        brandPrimary: data.brandPrimary,
                        brandSecondary: data.brandSecondary
                    }),
                    background: '#F8FAFC',
                    fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif"
                }}
            >
                {brandNav}
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-5">
                    <div>
                        <p
                            className="text-[10px] font-black uppercase tracking-widest"
                            style={{ color: 'var(--brand-primary)' }}
                        >
                            How would you like to continue?
                        </p>
                        <h2 className="text-2xl font-black text-[#0F172A] mt-1">Book a table or order food</h2>
                        <p className="text-sm text-[#64748B] mt-1 max-w-xl">
                            Reserve a date and time, or browse the menu for delivery / pickup.
                        </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
                        <button
                            type="button"
                            onClick={() => setPath('table')}
                            className="w-full text-left bg-white rounded-2xl border border-[#E2E8F0] p-5 hover:border-[var(--brand-primary)] shadow-sm transition"
                        >
                            <p className="font-black text-[#0F172A] text-lg">Book a table</p>
                            <p className="text-sm text-[#64748B] mt-1">
                                Reserve a date and time. Order with your waiter when you arrive.
                            </p>
                        </button>
                        <button
                            type="button"
                            disabled={!hasMenu}
                            onClick={() => hasMenu && setPath('food')}
                            className={cn(
                                'w-full text-left rounded-2xl border p-5 shadow-sm transition',
                                hasMenu
                                    ? 'bg-white border-[#E2E8F0] hover:border-[var(--brand-primary)]'
                                    : 'bg-[#F8FAFC] border-[#E2E8F0] opacity-60 cursor-not-allowed'
                            )}
                        >
                            <p className="font-black text-[#0F172A] text-lg">Order food</p>
                            <p className="text-sm text-[#64748B] mt-1">
                                {hasMenu
                                    ? 'Browse the menu, pay online, delivery to your home or collection.'
                                    : 'Menu not published yet — check back soon.'}
                            </p>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isRestaurantHost && path === 'food') {
        return (
            <div
                className="min-h-screen"
                style={{
                    ...orgBrandStyle({
                        logoUrl: data.logoUrl,
                        brandPrimary: data.brandPrimary,
                        brandSecondary: data.brandSecondary
                    }),
                    background: '#F8FAFC',
                    fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif"
                }}
            >
                {brandNav}
                <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                    <FoodOrderFlow
                        hostSlug={hostSlug!}
                        hostName={data.name}
                        menuItems={menuItems}
                        foodOrdering={
                            data.foodOrdering || {
                                deliveryEnabled: true,
                                pickupEnabled: true,
                                deliveryFeeCents: 0,
                                deliveryMinOrderCents: 0,
                                deliveryNotes: ''
                            }
                        }
                        eventSlugForPickup={eventTypes[0]?.slug}
                        onBack={() => setPath('choose')}
                    />
                </div>
            </div>
        );
    }

    const tableEventSlug = (() => {
        if (!isRestaurantHost || eventTypes.length === 0) return undefined;
        if (eventTypes.length === 1) return eventTypes[0].slug;
        return (
            eventTypes.find((et: EventType) => /book\s+a\s+table/i.test(et.name))?.slug ||
            eventTypes[0].slug
        );
    })();

    return (
        <>
            {isRestaurantHost && (
                <div
                    className="bg-[#F8FAFC] px-4 pt-3"
                    style={orgBrandStyle({
                        logoUrl: data.logoUrl,
                        brandPrimary: data.brandPrimary,
                        brandSecondary: data.brandSecondary
                    })}
                >
                    <button
                        type="button"
                        onClick={() => setPath('choose')}
                        className="text-xs font-bold text-[var(--brand-primary)] underline"
                    >
                        ← Back to options
                    </button>
                </div>
            )}
            <PublicCustomerPortal
                hostSlug={hostSlug!}
                host={{
                    name: data.name,
                    tradeType: data.tradeType,
                    phone: data.phone,
                    email: data.email,
                    serviceArea: data.serviceArea,
                    logoUrl: data.logoUrl || data.logo_url || '',
                    brandPrimary: data.brandPrimary || data.brand_primary,
                    brandSecondary: data.brandSecondary || data.brand_secondary
                }}
                industry={data.industry || getBookingPreset(data.bookingIndustryId || data.tradeType)}
                mediaUploadsEnabled={Boolean(data.mediaUploadsEnabled)}
                eventTypes={eventTypes}
                menuItems={isRestaurantHost ? [] : menuItems}
                eventSlug={
                    isRestaurantHost
                        ? tableEventSlug
                        : eventTypes.length === 1 && !menuItems.length
                          ? eventTypes[0].slug
                          : undefined
                }
            />
        </>
    );
}

export function PublicBookEvent() {
    const { hostSlug, eventSlug } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        if (!hostSlug || !eventSlug) return;
        apiGet(`/api/public/${hostSlug}/${eventSlug}`)
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [hostSlug, eventSlug]);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loading schedule…</div>;
    if (error || !data) return <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Not found'}</div>;

    return (
        <PublicCustomerPortal
            hostSlug={hostSlug!}
            host={data.host}
            industry={data.industry || getBookingPreset(data.host?.bookingIndustryId || data.host?.tradeType)}
            mediaUploadsEnabled={Boolean(data.mediaUploadsEnabled)}
            eventTypes={[
                {
                    slug: data.eventType.slug,
                    name: data.eventType.name,
                    description: data.eventType.description,
                    durationMinutes: data.eventType.durationMinutes,
                    depositCents: data.eventType.depositCents,
                    totalCents: data.eventType.totalCents,
                    category: resolveSalonServiceCategory(data.eventType.name, data.eventType.category)
                }
            ]}
            eventSlug={eventSlug!}
        />
    );
}
export function BookSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id') || '';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);
    const [paymentDocument, setPaymentDocument] = useState<any>(null);
    const [contactEditable, setContactEditable] = useState(false);
    const [contactEditExpiresAt, setContactEditExpiresAt] = useState('');
    const [showContactFix, setShowContactFix] = useState(false);
    const [contactInput, setContactInput] = useState('');
    const [contactBusy, setContactBusy] = useState(false);
    const [contactMsg, setContactMsg] = useState('');
    const [contactErr, setContactErr] = useState('');

    useEffect(() => {
        if (!sessionId) {
            setError('Missing payment session â€” return to booking and try again.');
            setLoading(false);
            return;
        }
        apiGet(`/api/public/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
            .then((data) => {
                setBooking(data.booking);
                setPaymentDocument(data.paymentDocument || data.booking?.paymentDocument || null);
                setContactEditable(Boolean(data.contactEditable));
                setContactEditExpiresAt(data.contactEditExpiresAt || '');
            })
            .catch((e) => setError(e.message || 'Could not confirm booking'))
            .finally(() => setLoading(false));
    }, [sessionId]);

    useEffect(() => {
        if (!contactEditExpiresAt || !contactEditable) return;
        const ms = new Date(contactEditExpiresAt).getTime() - Date.now();
        if (ms <= 0) {
            setContactEditable(false);
            return;
        }
        const t = window.setTimeout(() => setContactEditable(false), ms);
        return () => window.clearTimeout(t);
    }, [contactEditExpiresAt, contactEditable]);

    const submitContactFix = async () => {
        if (!booking?.manage_token) return;
        const raw = contactInput.trim();
        if (!raw) {
            setContactErr('Enter your correct email or phone.');
            return;
        }
        setContactBusy(true);
        setContactErr('');
        setContactMsg('');
        try {
            const isEmail = raw.includes('@');
            const body = isEmail
                ? { email: raw }
                : { phone: restrictPhoneInput(raw) };
            const data = await apiPost(
                `/api/public/manage/${booking.manage_token}/update-contact`,
                body
            );
            setBooking((b: any) => ({
                ...b,
                customer_email: data.booking?.customer_email ?? b.customer_email,
                customer_phone: data.booking?.customer_phone ?? b.customer_phone
            }));
            setContactEditable(Boolean(data.contactEditable));
            if (data.contactEditExpiresAt) setContactEditExpiresAt(data.contactEditExpiresAt);
            setContactMsg(data.message || 'Contact updated.');
            setShowContactFix(false);
            setContactInput('');
        } catch (e: any) {
            setContactErr(e.message || 'Could not update contact');
            if (/locked|10 minutes/i.test(String(e.message || ''))) {
                setContactEditable(false);
            }
        } finally {
            setContactBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-[#64748B] font-medium">
                Confirming your payment...
            </div>
        );
    }

    if (error || !booking) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC]">
                <div className="max-w-md text-center space-y-4">
                    <p className="text-red-600 font-medium">{error || 'Booking could not be confirmed'}</p>
                    <p className="text-sm text-[#64748B]">If you completed payment, refresh this page â€” your booking will be confirmed automatically.</p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 text-sm font-bold text-white bg-[#0F172A] px-4 py-2 rounded-xl"
                    >
                        Refresh & confirm
                    </button>
                </div>
            </div>
        );
    }

    const when = new Date(booking.start_at).toLocaleString('en-GB');
    const icsUrl = `${API_BASE}/api/public/bookings/${booking.id}/calendar.ics`;
    const minsLeft = contactEditExpiresAt
        ? Math.max(0, Math.ceil((new Date(contactEditExpiresAt).getTime() - Date.now()) / 60000))
        : 0;

    const contactFixBlock = (
        <div className="mt-4 pt-4 border-t border-[#F1F5F9] text-center space-y-2">
            {contactMsg && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    {contactMsg}
                </p>
            )}
            {contactEditable ? (
                <>
                    {!showContactFix ? (
                        <button
                            type="button"
                            onClick={() => {
                                setShowContactFix(true);
                                setContactErr('');
                            }}
                            className="text-sm font-bold text-[#F59E0B] hover:underline"
                        >
                            Email or number wrong? Change it here
                        </button>
                    ) : (
                        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-left space-y-2">
                            <p className="text-xs text-[#64748B]">
                                Update your email or phone within {minsLeft || 1} min â€” then we resend
                                confirmation (no extra payment).
                            </p>
                            <input
                                value={contactInput}
                                onChange={(e) => setContactInput(e.target.value)}
                                placeholder="Correct email or phone"
                                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
                            />
                            {contactErr && <p className="text-xs text-red-600">{contactErr}</p>}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={contactBusy}
                                    onClick={() => void submitContactFix()}
                                    className="flex-1 rounded-xl bg-[#0F172A] text-white text-xs font-bold py-2.5 disabled:opacity-50"
                                >
                                    {contactBusy ? 'Savingâ€¦' : 'Save & resend'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowContactFix(false);
                                        setContactErr('');
                                    }}
                                    className="rounded-xl border border-[#E2E8F0] px-3 text-xs font-bold text-[#64748B]"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    <p className="text-[10px] text-[#94A3B8]">
                        Editable for 10 minutes after booking, then locked.
                    </p>
                </>
            ) : (
                <p className="text-xs text-[#94A3B8]">
                    Contact change window has locked (available for 10 minutes after booking only).
                </p>
            )}
        </div>
    );

    const footer = (
        <div className="flex flex-col gap-2 text-center">
            {booking.manage_token && (
                <Link to={`/book/manage/${booking.manage_token}`} className="text-sm font-bold text-[#F59E0B]">
                    Reschedule or cancel
                </Link>
            )}
            <a href={icsUrl} className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[#0F172A]">
                <Download className="w-4 h-4" /> Add to calendar (.ics)
            </a>
            <p className="flex items-center justify-center gap-2 text-xs text-[#64748B]">
                <Mail className="w-3.5 h-3.5" /> Confirmation sent to{' '}
                {booking.customer_email || booking.customer_phone || 'your contact'}
            </p>
            <p className="text-xs text-[#64748B] mt-1">
                {booking.customer_name} Â· {when}
            </p>
            {contactFixBlock}
        </div>
    );

    if (paymentDocument) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
                <PaymentPaidCard doc={paymentDocument} footer={footer} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-black text-[#0F172A]">Booking confirmed</h1>
                <p className="text-sm text-[#64748B] mt-2">Deposit paid. Your appointment is confirmed.</p>

                <div className="mt-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 text-left text-sm space-y-2">
                    <p><span className="text-[#64748B]">Name:</span> <strong>{booking.customer_name}</strong></p>
                    {(booking.event_name || booking.service_names) && (
                        <p>
                            <span className="text-[#64748B]">Services:</span>{' '}
                            <strong>{booking.service_names || booking.event_name}</strong>
                        </p>
                    )}
                    <p><span className="text-[#64748B]">When:</span> <strong>{when}</strong></p>
                    {booking.customer_address &&
                        !/^(clinic visit|salon visit|restaurant table booking|booking)$/i.test(
                            String(booking.customer_address).trim()
                        ) && (
                            <p>
                                <span className="text-[#64748B]">Address:</span>{' '}
                                <strong>{booking.customer_address}</strong>
                            </p>
                        )}
                </div>

                <div className="mt-4 flex flex-col gap-2">{footer}</div>
            </div>
        </div>
    );
}

export function BookManage() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [booking, setBooking] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) return;
        apiGet(`/api/public/manage/${token}`)
            .then((d) => setBooking(d.booking))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [token]);

    const cancel = async () => {
        if (!token || !confirm('Cancel this booking? If you paid a deposit, it will be refunded to your card.')) return;
        setBusy(true);
        setError('');
        try {
            const result = await apiPost(`/api/public/manage/${token}/cancel`, {});
            if (result.booking) {
                setBooking(result.booking);
            } else {
                setBooking((b: any) => ({ ...b, status: 'cancelled' }));
            }
            if (result.refundError) {
                setMessage('Booking cancelled, but the card refund failed. Contact the business.');
            } else if (result.refund && !result.refund.skipped) {
                const toCustomer = ((result.refund.refundToCustomerCents || result.refund.amountCents || 0) / 100).toFixed(2);
                setMessage(`Booking cancelled. Refund of Â£${toCustomer} is on the way to your card.`);
            } else {
                setMessage('Booking cancelled.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-[#64748B]">Loadingâ€¦</div>;
    if (error || !booking) return <div className="min-h-screen flex items-center justify-center text-red-600 p-6">{error || 'Booking not found'}</div>;

    const when = new Date(booking.start_at).toLocaleString('en-GB');

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-2xl border border-[#E2E8F0] p-8 space-y-4">
                <h1 className="text-xl font-black text-[#0F172A]">Manage booking</h1>
                <div className="text-sm space-y-1">
                    <p>
                        <span className="text-[#64748B]">
                            {Array.isArray(booking.line_items) && booking.line_items.length > 1
                                ? 'Services:'
                                : 'Service:'}
                        </span>{' '}
                        <strong>{booking.service_names || booking.event_name}</strong>
                    </p>
                    {Array.isArray(booking.line_items) && booking.line_items.length > 1 && (
                        <ul className="text-xs text-[#64748B] list-disc pl-5 space-y-0.5">
                            {booking.line_items.map((item: any, i: number) => (
                                <li key={`${item.name}-${i}`}>
                                    {item.name}
                                    {item.duration_minutes ? ` (${item.duration_minutes} min)` : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p><span className="text-[#64748B]">When:</span> <strong>{when}</strong></p>
                    <p><span className="text-[#64748B]">Status:</span> <strong>{booking.status}</strong></p>
                </div>
                {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{message}</p>}
                {booking.status !== 'cancelled' && booking.status !== 'done' && (
                    <button type="button" disabled={busy} onClick={cancel} className="w-full py-2.5 rounded-xl border border-red-200 text-red-700 font-bold text-sm">
                        Cancel booking
                    </button>
                )}
                <p className="text-xs text-[#64748B]">To reschedule, contact {booking.org_name} or use the booking link again after cancelling.</p>
                <Link to={`/book/${booking.org_slug}/${booking.event_slug}`} className="block text-center text-sm font-bold text-[#0F172A]">
                    Book again
                </Link>
            </div>
        </div>
    );
}

export default PublicBookHost;

