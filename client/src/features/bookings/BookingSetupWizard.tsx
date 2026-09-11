import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    ChevronRight,
    Mail,
    MapPin,
    User,
    Wallet
} from 'lucide-react';
import { cn, restrictEmailOrPhoneInput } from '../../shared/utils';
import {
    bookingIndustryPresets,
    getBookingPreset,
    type BookingIndustryId
} from './bookingIndustryPresets';

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
    /** Pre-select from Stripe checkout / org hydrate */
    initialIndustryId?: string | null;
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
    onComplete
}: Props) {
    const hasSavedBusiness = Boolean(linked && linkedBusiness?.name?.trim());
    const lockedFromCheckout = Boolean(String(initialIndustryId || '').trim());

    const [path, setPath] = useState<'choose' | 'manual' | 'from-profile'>(
        hasSavedBusiness ? 'choose' : 'manual'
    );
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<SetupForm>(() => baseForm(initialIndustryId));

    const selectedPreset = getBookingPreset(form.bookingIndustryId);
    const placeholders = selectedPreset.setupPlaceholders;

    useEffect(() => {
        if (!initialIndustryId) return;
        const preset = getBookingPreset(initialIndustryId);
        setForm((f) => ({
            ...f,
            bookingIndustryId: preset.id,
            tradeType: preset.name
        }));
    }, [initialIndustryId]);

    const useSavedBusiness = () => {
        if (!linkedBusiness?.name) return;
        setForm(formFromLinked(linkedBusiness, initialIndustryId || form.bookingIndustryId));
        setPath('from-profile');
        setStep(1);
    };

    const enterManually = () => {
        setForm(baseForm(initialIndustryId));
        setPath('manual');
        setStep(1);
    };

    const selectIndustry = (id: string) => {
        const preset = getBookingPreset(id);
        setForm((f) => ({
            ...f,
            bookingIndustryId: preset.id,
            tradeType: preset.name
        }));
    };

    const finish = async (e: FormEvent) => {
        e.preventDefault();
        const preset = getBookingPreset(form.bookingIndustryId);
        await onComplete({
            ...form,
            bookingIndustryId: preset.id,
            tradeType: preset.name
        });
    };

    const detailsStepNum = lockedFromCheckout ? 1 : 2;
    const depositStepNum = lockedFromCheckout ? 2 : 3;

    const stepLabels = lockedFromCheckout
        ? [
              ['1', path === 'from-profile' ? 'Confirm details' : 'Your details'],
              ['2', 'Bookings & deposit']
          ]
        : [
              ['1', 'Your service'],
              ['2', path === 'from-profile' ? 'Confirm details' : 'Your details'],
              ['3', 'Bookings & deposit']
          ];

    const onServiceStep = !lockedFromCheckout && step === 1;
    const onDetailsStep = step === detailsStepNum;
    const onDepositStep = step === depositStepNum;

    const goBackFromDetails = () => {
        if (lockedFromCheckout) {
            if (hasSavedBusiness) {
                setPath('choose');
                setStep(1);
            }
            return;
        }
        setStep(1);
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">Booking Plots</p>
                <h1 className="text-2xl lg:text-3xl font-black text-[#0F172A] mt-1">Set up your booking board</h1>
                <p className="text-sm text-[#64748B] mt-1">
                    Booking Plots is separate from SEO tools. Use your saved business profile when you have one, or enter
                    booking details here.
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
                        <p className="text-xs text-[#64748B] mt-3">
                            Adds this business to your booking board, then you confirm details & deposits.
                        </p>
                    </button>

                    <button
                        type="button"
                        onClick={enterManually}
                        className="w-full text-left rounded-2xl border border-[#E2E8F0] bg-white p-5 hover:border-[#0F172A]/30 transition"
                    >
                        <p className="font-bold text-[#0F172A]">Enter different booking details</p>
                        <p className="text-sm text-[#64748B] mt-1">
                            Ask for name, business, contact, and area on the booking setup — without using SEO profile data.
                        </p>
                    </button>
                </div>
            )}

            {path !== 'choose' && (
                <>
                    <div className="flex gap-2">
                        {stepLabels.map(([n, label], i) => (
                            <div
                                key={n}
                                className={cn(
                                    'flex-1 rounded-xl px-3 py-2 text-center border text-xs font-bold',
                                    step === i + 1
                                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                        : step > i + 1
                                          ? 'bg-[#F59E0B]/20 text-[#0F172A] border-[#F59E0B]/50'
                                          : 'bg-white text-[#64748B] border-[#E2E8F0]'
                                )}
                            >
                                {label}
                            </div>
                        ))}
                    </div>

                    {lockedFromCheckout && (
                        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#FFFBEB] px-4 py-3 text-sm text-[#0F172A]">
                            Booking forms for <strong>{selectedPreset.name}</strong>
                            <span className="text-[#64748B]">
                                {' '}
                                — set at checkout. Customers will see this industry’s services and intake fields.
                            </span>
                        </div>
                    )}

                    {path === 'from-profile' && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2">
                            <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                                Using <strong>{form.businessName}</strong> from Business profile. You can still edit details
                                before launch.
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

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
                    )}

                    {onServiceStep && (
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm">
                            <h2 className="font-bold text-lg text-[#0F172A]">Your service</h2>
                            <p className="text-sm text-[#64748B] mt-1 mb-4">
                                Choose your industry. Customer booking forms and services will match this preset.
                            </p>
                            <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                                {bookingIndustryPresets.map((p) => {
                                    const selected = form.bookingIndustryId === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => selectIndustry(p.id)}
                                            className={cn(
                                                'text-left rounded-xl border p-3 transition',
                                                selected
                                                    ? 'border-[#F59E0B] bg-[#F59E0B]/15 ring-2 ring-[#F59E0B]/40'
                                                    : 'border-[#E2E8F0] bg-white hover:border-[#0F172A]/30'
                                            )}
                                        >
                                            <div className="font-bold text-sm text-[#0F172A]">{p.shortName}</div>
                                            <div className="text-xs text-[#64748B] mt-0.5 line-clamp-2">{p.tagline}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-[#64748B] mt-3">
                                Services seeded: {selectedPreset.services.slice(0, 2).join(' · ')}
                                {selectedPreset.services.length > 2
                                    ? ` · +${selectedPreset.services.length - 2} more`
                                    : ''}
                            </p>
                            <div className="flex gap-2 mt-5">
                                {hasSavedBusiness && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPath('choose');
                                            setStep(1);
                                        }}
                                        className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                    >
                                        Back
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setStep(2)}
                                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
                                >
                                    Continue <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {onDetailsStep && (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!form.name.trim() || !form.businessName.trim()) return;
                                setStep(depositStepNum);
                            }}
                            className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4"
                        >
                            <div>
                                <h2 className="font-bold text-lg text-[#0F172A]">
                                    {path === 'from-profile' ? 'Confirm booking details' : 'Your details'}
                                </h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    {path === 'from-profile'
                                        ? 'This is what customers see on your booking page.'
                                        : 'Tell us who customers book with — required to launch your board.'}
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
                                        onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
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
                                        onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))}
                                        placeholder={placeholders.serviceArea}
                                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                                    />
                                </div>
                            </label>
                            <div className="flex gap-2 pt-2">
                                {(!lockedFromCheckout || hasSavedBusiness) && (
                                    <button
                                        type="button"
                                        onClick={goBackFromDetails}
                                        className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                    >
                                        Back
                                    </button>
                                )}
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
                                    Default deposits for {selectedPreset.shortName} services. You can edit each service
                                    later.
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
                                Launching <strong className="text-[#0F172A]">{form.businessName || 'your business'}</strong>{' '}
                                · {form.tradeType}
                            </p>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(detailsStepNum)}
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
        </div>
    );
}
