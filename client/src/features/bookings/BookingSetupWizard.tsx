import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    ChevronRight,
    Lock,
    Mail,
    MapPin,
    User,
    Wallet
} from 'lucide-react';
import { restrictEmailOrPhoneInput } from '../../shared/utils';
import { getBookingPreset, type BookingIndustryId } from './bookingIndustryPresets';

export type SetupForm = {
    tradeType: string;
    bookingIndustryId: BookingIndustryId | string;
    name: string;
    businessName: string;
    contact: string;
    serviceArea: string;
    standardDeposit: number;
    emergencyDeposit: number;
    currency: string;
    acceptingEmergencies: boolean;
    emergencyNote: string;
};

type LinkedBusiness = {
    name?: string;
    category?: string;
    address?: string;
    phone?: string;
    website?: string;
} | null;

type Props = {
    linked?: boolean;
    linkedBusiness?: LinkedBusiness;
    busy: boolean;
    error: string;
    /** Industry from ZappSites checkout / org hydrate — required to lock setup */
    initialIndustryId?: string | null;
    onRefreshIndustry?: () => void;
    onComplete: (form: SetupForm) => Promise<void>;
};

function baseForm(industryId?: string | null, overrides: Partial<SetupForm> = {}): SetupForm {
    const preset = getBookingPreset(industryId || 'plumbing');
    return {
        tradeType: preset.name,
        bookingIndustryId: preset.id,
        name: '',
        businessName: '',
        contact: '',
        serviceArea: '',
        standardDeposit: 45,
        emergencyDeposit: 60,
        currency: '£',
        acceptingEmergencies: true,
        emergencyNote: '',
        ...overrides
    };
}

function formFromLinked(
    linkedBusiness: NonNullable<LinkedBusiness>,
    industryId?: string | null
): SetupForm {
    return baseForm(industryId, {
        businessName: linkedBusiness.name || '',
        contact: linkedBusiness.phone || '',
        serviceArea: linkedBusiness.address || ''
    });
}

export default function BookingSetupWizard({
    linked,
    linkedBusiness,
    busy,
    error,
    initialIndustryId,
    onRefreshIndustry,
    onComplete
}: Props) {
    const hasSavedBusiness = Boolean(linked && linkedBusiness?.name?.trim());
    const checkoutIndustryId = String(initialIndustryId || '').trim();
    const hasCheckoutIndustry = Boolean(checkoutIndustryId);

    const [path, setPath] = useState<'choose' | 'manual' | 'from-profile'>(
        hasSavedBusiness ? 'choose' : 'manual'
    );
    // 0 = locked industry + Next, 1 = details, 2 = deposit
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<SetupForm>(() => baseForm(checkoutIndustryId || null));

    const selectedPreset = getBookingPreset(checkoutIndustryId || form.bookingIndustryId);
    const placeholders = selectedPreset.setupPlaceholders;

    useEffect(() => {
        if (!checkoutIndustryId) return;
        const preset = getBookingPreset(checkoutIndustryId);
        setForm((f) => ({
            ...f,
            bookingIndustryId: preset.id,
            tradeType: preset.name
        }));
        setStep((s) => (s === 0 ? 0 : s));
    }, [checkoutIndustryId]);

    const useSavedBusiness = () => {
        if (!linkedBusiness?.name) return;
        setForm(formFromLinked(linkedBusiness, checkoutIndustryId || form.bookingIndustryId));
        setPath('from-profile');
        setStep(1);
    };

    const enterManually = () => {
        setForm(baseForm(checkoutIndustryId || null));
        setPath('manual');
        setStep(hasCheckoutIndustry ? 0 : 1);
    };

    const finish = async (e: FormEvent) => {
        e.preventDefault();
        if (!hasCheckoutIndustry) return;
        const preset = getBookingPreset(checkoutIndustryId);
        await onComplete({
            ...form,
            bookingIndustryId: preset.id,
            tradeType: preset.name
        });
    };

    const onIndustryStep = hasCheckoutIndustry && step === 0;
    const onDetailsStep = step === 1;
    const onDepositStep = step === 2;

    const stepLabels = [
        ['1', 'Your service'],
        ['2', path === 'from-profile' ? 'Confirm details' : 'Your details'],
        ['3', 'Bookings & deposit']
    ];

    return (
        <div className="w-full max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">Booking Plots</p>
                <h1 className="text-2xl lg:text-3xl font-black text-[#0F172A] mt-1">Set up your booking board</h1>
                <p className="text-sm text-[#64748B] mt-1">
                    Your industry was chosen at payment. Customer forms and services match that selection.
                </p>
            </div>

            {path === 'choose' && hasSavedBusiness && (
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={useSavedBusiness}
                        className="w-full text-left rounded-2xl border-2 border-[#F59E0B] bg-[#FFFBEB] p-5 hover:bg-[#FEF3C7] transition shadow-sm"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#D97706]">
                            <Building2 className="w-4 h-4" /> Use saved business profile
                        </div>
                        <p className="font-bold text-[#0F172A] text-lg mt-2">{linkedBusiness?.name}</p>
                        <p className="text-sm text-[#64748B] mt-1">
                            {[linkedBusiness?.category, linkedBusiness?.address, linkedBusiness?.phone]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </button>

                    <button
                        type="button"
                        onClick={enterManually}
                        className="w-full text-left rounded-2xl border border-[#E2E8F0] bg-white p-5 hover:border-[#0F172A]/30 transition"
                    >
                        <p className="font-bold text-[#0F172A]">Enter different booking details</p>
                        <p className="text-sm text-[#64748B] mt-1">
                            Name, business, contact, and area — without using SEO profile data.
                        </p>
                    </button>
                </div>
            )}

            {path !== 'choose' && (
                <>
                    {!hasCheckoutIndustry ? (
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4">
                            <div className="flex items-start gap-3">
                                <Lock className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
                                <div>
                                    <h2 className="font-bold text-lg text-[#0F172A]">Your service (from payment)</h2>
                                    <p className="text-sm text-[#64748B] mt-1">
                                        We couldn&apos;t load the industry you picked at ZappSites checkout yet. Refresh to
                                        pull it from your booking plan — you won&apos;t choose a different trade here.
                                    </p>
                                </div>
                            </div>
                            {error && (
                                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                                    {error}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => onRefreshIndustry?.()}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
                            >
                                Refresh industry
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                {stepLabels.map(([n, label], i) => (
                                    <div
                                        key={n}
                                        className={
                                            step === i
                                                ? 'flex-1 rounded-xl px-3 py-2 text-center border text-xs font-bold bg-[#0F172A] text-white border-[#0F172A]'
                                                : step > i
                                                  ? 'flex-1 rounded-xl px-3 py-2 text-center border text-xs font-bold bg-[#F59E0B]/20 text-[#0F172A] border-[#F59E0B]/50'
                                                  : 'flex-1 rounded-xl px-3 py-2 text-center border text-xs font-bold bg-white text-[#64748B] border-[#E2E8F0]'
                                        }
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>

                            {/* Single locked industry — never a multi-industry grid */}
                            <div className="rounded-2xl border-2 border-[#F59E0B] bg-[#FFFBEB] p-4">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#D97706]">
                                    <Lock className="w-3.5 h-3.5" /> Locked from payment
                                </div>
                                <p className="font-bold text-[#0F172A] text-lg mt-1">{selectedPreset.name}</p>
                                <p className="text-sm text-[#64748B] mt-1">{selectedPreset.tagline}</p>
                                <p className="text-xs text-[#64748B] mt-2">
                                    Services: {selectedPreset.services.slice(0, 2).join(' · ')}
                                    {selectedPreset.services.length > 2
                                        ? ` · +${selectedPreset.services.length - 2} more`
                                        : ''}
                                </p>
                            </div>

                            {onIndustryStep && (
                                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4">
                                    <div>
                                        <h2 className="font-bold text-lg text-[#0F172A]">Confirm your service</h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            This was set at ZappSites checkout. Next you&apos;ll enter your business
                                            details.
                                        </p>
                                    </div>
                                    {error && (
                                        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                                            {error}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
                                    >
                                        Next <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {path === 'from-profile' && onDetailsStep && (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2">
                                    <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>
                                        Using <strong>{form.businessName}</strong> from Business profile. You can still
                                        edit details before launch.
                                    </span>
                                </div>
                            )}

                            {path === 'manual' && !hasSavedBusiness && onDetailsStep && (
                                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]">
                                    No business profile saved yet — enter booking details below. You can also{' '}
                                    <Link to="/profile" className="font-semibold text-[#0F172A] underline">
                                        add business info
                                    </Link>{' '}
                                    for SEO tools (optional for Booking Plots).
                                </div>
                            )}

                            {error && !onIndustryStep && (
                                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                                    {error}
                                </p>
                            )}

                            {onDetailsStep && (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (!form.name.trim() || !form.businessName.trim()) return;
                                        setStep(2);
                                    }}
                                    className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4"
                                >
                                    <div>
                                        <h2 className="font-bold text-lg text-[#0F172A]">
                                            {path === 'from-profile' ? 'Confirm booking details' : 'Your details'}
                                        </h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            Tell us who customers book with — required to launch your board.
                                        </p>
                                    </div>
                                    <label className="block text-xs font-bold uppercase text-[#64748B]">
                                        Your full name
                                        <div className="relative mt-1">
                                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                                            <input
                                                required
                                                value={form.name}
                                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                                placeholder={placeholders.name}
                                                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                                            />
                                        </div>
                                    </label>
                                    <label className="block text-xs font-bold uppercase text-[#64748B]">
                                        Business name
                                        <div className="relative mt-1">
                                            <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                                            <input
                                                required
                                                value={form.businessName}
                                                onChange={(e) =>
                                                    setForm((f) => ({ ...f, businessName: e.target.value }))
                                                }
                                                placeholder={placeholders.businessName}
                                                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                                            />
                                        </div>
                                    </label>
                                    <label className="block text-xs font-bold uppercase text-[#64748B]">
                                        Email or phone
                                        <div className="relative mt-1">
                                            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                                            <input
                                                type="text"
                                                inputMode="email"
                                                value={form.contact}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        contact: restrictEmailOrPhoneInput(e.target.value)
                                                    }))
                                                }
                                                placeholder={placeholders.contact}
                                                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                                            />
                                        </div>
                                    </label>
                                    <label className="block text-xs font-bold uppercase text-[#64748B]">
                                        Service area
                                        <div className="relative mt-1">
                                            <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                                            <input
                                                value={form.serviceArea}
                                                onChange={(e) =>
                                                    setForm((f) => ({ ...f, serviceArea: e.target.value }))
                                                }
                                                placeholder={placeholders.serviceArea}
                                                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                                            />
                                        </div>
                                    </label>
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (hasSavedBusiness && path === 'from-profile') {
                                                    setPath('choose');
                                                    setStep(0);
                                                } else {
                                                    setStep(0);
                                                }
                                            }}
                                            className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
                                        >
                                            Continue <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </form>
                            )}

                            {onDepositStep && (
                                <form
                                    onSubmit={finish}
                                    className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4"
                                >
                                    <div>
                                        <h2 className="font-bold text-lg text-[#0F172A] flex items-center gap-2">
                                            <Wallet className="w-5 h-5 text-[#F59E0B]" /> Bookings & deposit
                                        </h2>
                                        <p className="text-sm text-[#64748B] mt-1">
                                            Default deposits for {selectedPreset.shortName} services. You can edit each
                                            service later.
                                        </p>
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <label className="block text-xs font-bold uppercase text-[#64748B]">
                                            Standard deposit (£)
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={form.standardDeposit}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        standardDeposit: Number(e.target.value) || 0
                                                    }))
                                                }
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A]"
                                            />
                                        </label>
                                        <label className="block text-xs font-bold uppercase text-[#64748B]">
                                            Emergency / call-out deposit (£)
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={form.emergencyDeposit}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        emergencyDeposit: Number(e.target.value) || 0
                                                    }))
                                                }
                                                className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A]"
                                            />
                                        </label>
                                    </div>
                                    <p className="text-sm text-[#64748B]">
                                        Launching{' '}
                                        <strong className="text-[#0F172A]">
                                            {form.businessName || 'your business'}
                                        </strong>{' '}
                                        · {selectedPreset.name}
                                    </p>
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={busy}
                                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#F59E0B] text-[#0F172A] text-sm font-black disabled:opacity-60"
                                        >
                                            {busy ? 'Launching…' : 'Launch booking board'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
