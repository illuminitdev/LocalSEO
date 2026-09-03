import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    ChevronRight,
    Flame,
    KeyRound,
    Mail,
    MapPin,
    User,
    Wallet,
    Wrench,
    Zap
} from 'lucide-react';
import { cn } from '../lib/utils';

const OTHER_SERVICE_TYPE = 'General Tradesperson';

const SERVICES = [
    { type: 'Heating Engineer', label: 'Heating & Gas', subtitle: 'Boilers, radiators, no-heat', icon: Flame },
    { type: 'Emergency Plumber', label: 'Plumbing', subtitle: 'Leaks, pipes, emergencies', icon: Wrench },
    { type: 'Electrician', label: 'Electrician', subtitle: 'Fuse boards, power loss', icon: Zap },
    { type: 'Locksmith', label: 'Locksmith', subtitle: 'Lockouts, security', icon: KeyRound },
    { type: 'General Tradesperson', label: 'Other service', subtitle: 'Handyman, maintenance, etc.', icon: Wrench }
] as const;

export type SetupForm = {
    tradeType: string;
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
    onComplete: (form: SetupForm) => Promise<void>;
};

function emptyForm(): SetupForm {
    return {
        tradeType: '',
        name: '',
        businessName: '',
        contact: '',
        serviceArea: '',
        standardDeposit: 45,
        emergencyDeposit: 60,
        currency: '£',
        acceptingEmergencies: true,
        emergencyNote: ''
    };
}

function formFromLinked(linkedBusiness: NonNullable<LinkedBusiness>): SetupForm {
    return {
        ...emptyForm(),
        businessName: linkedBusiness.name || '',
        tradeType: linkedBusiness.category || '',
        contact: linkedBusiness.phone || '',
        serviceArea: linkedBusiness.address || ''
    };
}

export default function BookingSetupWizard({ linked, linkedBusiness, busy, error, onComplete }: Props) {
    const hasSavedBusiness = Boolean(linked && linkedBusiness?.name?.trim());

    // Booking is separate from SEO tools: only use saved business profile when it exists.
    // Without it, start by asking booking details (not demos / not other services).
    const [path, setPath] = useState<'choose' | 'manual' | 'from-profile'>(
        hasSavedBusiness ? 'choose' : 'manual'
    );
    const [step, setStep] = useState(1);
    const [customServiceName, setCustomServiceName] = useState('');
    const [form, setForm] = useState<SetupForm>(() => emptyForm());

    const useSavedBusiness = () => {
        if (!linkedBusiness?.name) return;
        const next = formFromLinked(linkedBusiness);
        setForm(next);
        setCustomServiceName(
            next.tradeType && !SERVICES.some((s) => s.type === next.tradeType) ? next.tradeType : ''
        );
        setPath('from-profile');
        setStep(next.tradeType ? 2 : 1);
    };

    const enterManually = () => {
        setForm(emptyForm());
        setCustomServiceName('');
        setPath('manual');
        setStep(1);
    };

    const isOtherSelected =
        form.tradeType === OTHER_SERVICE_TYPE ||
        (Boolean(form.tradeType) && !SERVICES.some((s) => s.type === form.tradeType));

    const selectService = (type: string) => {
        if (type === OTHER_SERVICE_TYPE) {
            setForm((f) => ({ ...f, tradeType: OTHER_SERVICE_TYPE }));
            return;
        }
        setCustomServiceName('');
        setForm((f) => ({ ...f, tradeType: type }));
    };

    const canContinueFromService =
        Boolean(form.tradeType) && (!isOtherSelected || customServiceName.trim().length > 0);

    const finish = async (e: FormEvent) => {
        e.preventDefault();
        await onComplete(form);
    };

    const stepLabels = [
        ['1', path === 'manual' ? 'Your details' : 'Your service'],
        ['2', path === 'manual' ? 'Your service' : 'Confirm details'],
        ['3', 'Bookings & deposit']
    ];

    // Manual path: details → service → deposit
    // From-profile path: service (if needed) → confirm details → deposit
    const showDetailsFirst = path === 'manual';
    const onDetailsStep = showDetailsFirst ? step === 1 : step === 2;
    const onServiceStep = showDetailsFirst ? step === 2 : step === 1;
    const onDepositStep = step === 3;

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
                            Adds this business to your booking board, then you confirm service & deposits.
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

                    {path === 'from-profile' && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2">
                            <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                                Using <strong>{form.businessName}</strong> from Business profile. You can still edit details
                                before launch.
                            </span>
                        </div>
                    )}

                    {path === 'manual' && !hasSavedBusiness && (
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

                    {onDetailsStep && (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!form.name.trim() || !form.businessName.trim()) return;
                                if (showDetailsFirst) setStep(2);
                                else setStep(3);
                            }}
                            className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4"
                        >
                            <div>
                                <h2 className="font-bold text-lg text-[#0F172A]">
                                    {showDetailsFirst ? 'Your details' : 'Confirm booking details'}
                                </h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    {showDetailsFirst
                                        ? 'Tell us who customers book with — required to launch your board.'
                                        : 'This is what customers see on your booking page.'}
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
                                        placeholder="e.g. Dave Miller"
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
                                        placeholder="e.g. Miller Heating Ltd"
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
                                        onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                                        placeholder="e.g. 07700900123 or hello@yourbusiness.com"
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
                                        placeholder="e.g. Greater Manchester, within 15 miles"
                                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#0F172A] focus:bg-white"
                                    />
                                </div>
                            </label>
                            <div className="flex gap-2 pt-2">
                                {!showDetailsFirst && (
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                    >
                                        Back
                                    </button>
                                )}
                                {showDetailsFirst && hasSavedBusiness && (
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
                                    type="submit"
                                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
                                >
                                    Continue <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </form>
                    )}

                    {onServiceStep && (
                        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm">
                            <h2 className="font-bold text-lg text-[#0F172A]">What service do you offer?</h2>
                            <p className="text-sm text-[#64748B] mt-1 mb-4">
                                Choose the trade for this booking board (separate from other SEO modules).
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {SERVICES.map((s) => {
                                    const Icon = s.icon;
                                    const on =
                                        s.type === OTHER_SERVICE_TYPE
                                            ? isOtherSelected
                                            : form.tradeType === s.type;
                                    return (
                                        <button
                                            key={s.type}
                                            type="button"
                                            onClick={() => selectService(s.type)}
                                            className={cn(
                                                'text-left rounded-xl border p-4 transition',
                                                on
                                                    ? 'border-[#F59E0B] bg-[#F59E0B]/15 ring-2 ring-[#F59E0B]/40'
                                                    : 'border-[#E2E8F0] hover:border-[#0F172A]/30'
                                            )}
                                        >
                                            <Icon className={cn('w-6 h-6 mb-2', on ? 'text-[#0F172A]' : 'text-[#64748B]')} />
                                            <div className="font-bold text-sm text-[#0F172A]">{s.label}</div>
                                            <div className="text-xs text-[#64748B] mt-0.5">{s.subtitle}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            {isOtherSelected && (
                                <label className="block mt-4 text-xs font-bold uppercase text-[#64748B]">
                                    Your service name
                                    <input
                                        autoFocus
                                        value={customServiceName}
                                        onChange={(e) => setCustomServiceName(e.target.value)}
                                        placeholder="e.g. Handyman, CCTV installer, painter…"
                                        className="mt-1 w-full rounded-xl border border-[#F59E0B] bg-[#F59E0B]/5 px-3 py-2.5 text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                                    />
                                </label>
                            )}
                            <div className="flex gap-2 mt-5">
                                {showDetailsFirst ? (
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                    >
                                        Back
                                    </button>
                                ) : (
                                    hasSavedBusiness && (
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
                                    )
                                )}
                                <button
                                    type="button"
                                    disabled={!canContinueFromService}
                                    onClick={() => {
                                        if (!form.tradeType) return;
                                        if (isOtherSelected) {
                                            const name = customServiceName.trim();
                                            if (!name) return;
                                            setForm((f) => ({ ...f, tradeType: name }));
                                        }
                                        setStep(showDetailsFirst ? 3 : 2);
                                    }}
                                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold disabled:opacity-40"
                                >
                                    Continue <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {onDepositStep && (
                        <form onSubmit={finish} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4">
                            <div>
                                <h2 className="font-bold text-lg text-[#0F172A]">Bookings, emergencies & deposit</h2>
                                <p className="text-sm text-[#64748B] mt-1">
                                    Default weekly slots are added — you can edit them in Settings after launch.
                                </p>
                            </div>

                            <div className="rounded-xl border border-[#E2E8F0] p-4 space-y-3">
                                <p className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                                    <Flame className="w-4 h-4 text-red-500" /> Emergency bookings
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, acceptingEmergencies: true }))}
                                        className={cn(
                                            'rounded-xl py-2.5 text-xs font-bold border',
                                            form.acceptingEmergencies
                                                ? 'bg-red-600 text-white border-red-600'
                                                : 'bg-red-50 text-red-700 border-red-100'
                                        )}
                                    >
                                        Yes — accept emergencies
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, acceptingEmergencies: false }))}
                                        className={cn(
                                            'rounded-xl py-2.5 text-xs font-bold border',
                                            !form.acceptingEmergencies
                                                ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                                : 'bg-[#F8FAFC] border-[#E2E8F0]'
                                        )}
                                    >
                                        Standard only
                                    </button>
                                </div>
                                {form.acceptingEmergencies && (
                                    <input
                                        value={form.emergencyNote}
                                        onChange={(e) => setForm((f) => ({ ...f, emergencyNote: e.target.value }))}
                                        placeholder="Emergency note for customers (optional)"
                                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm"
                                    />
                                )}
                            </div>

                            <div className="rounded-xl bg-[#0F172A] text-white p-4 space-y-4">
                                <p className="text-xs font-bold uppercase text-white/60 flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-[#F59E0B]" /> Customer deposits (paid via Stripe)
                                </p>
                                <label className="block">
                                    {form.acceptingEmergencies ? (
                                        <span className="text-[10px] font-bold uppercase text-red-300 flex items-center gap-1">
                                            <Flame className="w-3 h-3" /> Emergency deposit
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold uppercase text-white/50">
                                            Standard visit deposit
                                        </span>
                                    )}
                                    <div className="flex gap-2 mt-1">
                                        <select
                                            value={form.currency}
                                            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                                            className="rounded-lg border-0 bg-white/10 text-white px-2 py-2 text-sm font-bold shrink-0"
                                        >
                                            <option value="£">£</option>
                                            <option value="$">$</option>
                                            <option value="€">€</option>
                                        </select>
                                        <input
                                            type="number"
                                            min={0}
                                            value={form.acceptingEmergencies ? form.emergencyDeposit : form.standardDeposit}
                                            onChange={(e) =>
                                                setForm((f) =>
                                                    f.acceptingEmergencies
                                                        ? { ...f, emergencyDeposit: Number(e.target.value) }
                                                        : { ...f, standardDeposit: Number(e.target.value) }
                                                )
                                            }
                                            className="flex-1 min-w-0 rounded-lg border-0 bg-white/10 text-white px-3 py-2 text-xl font-black"
                                        />
                                    </div>
                                </label>
                            </div>

                            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-sm text-[#64748B]">
                                <strong className="text-[#0F172A]">{form.businessName}</strong> · {form.tradeType}
                                <br />
                                {form.name} · {form.contact || 'No contact yet'}
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(2)}
                                    className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                >
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    disabled={busy}
                                    className="flex-1 py-3 rounded-xl bg-[#F59E0B] text-white text-sm font-bold disabled:opacity-60"
                                >
                                    {busy ? 'Launching...' : 'Launch my booking board'}
                                </button>
                            </div>
                        </form>
                    )}
                </>
            )}
        </div>
    );
}
