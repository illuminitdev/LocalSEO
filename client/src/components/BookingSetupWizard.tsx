import { useState, type FormEvent } from 'react';
import {
    Building2,
    ChevronRight,
    Flame,
    KeyRound,
    MapPin,
    Phone,
    User,
    Wallet,
    Wrench,
    Zap
} from 'lucide-react';
import { cn, restrictPhoneInput } from '../lib/utils';

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
    phone: string;
    serviceArea: string;
    standardDeposit: number;
    emergencyDeposit: number;
    currency: string;
    acceptingEmergencies: boolean;
    emergencyNote: string;
};

type Props = {
    linked?: boolean;
    linkedBusiness?: { name?: string; category?: string; address?: string; phone?: string } | null;
    busy: boolean;
    error: string;
    onComplete: (form: SetupForm) => Promise<void>;
};

export default function BookingSetupWizard({ linked, linkedBusiness, busy, error, onComplete }: Props) {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<SetupForm>({
        tradeType: '',
        name: '',
        businessName: linkedBusiness?.name || '',
        phone: linkedBusiness?.phone || '',
        serviceArea: linkedBusiness?.address || '',
        standardDeposit: 45,
        emergencyDeposit: 60,
        currency: '£',
        acceptingEmergencies: true,
        emergencyNote: ''
    });

    const applyLinkedPrefill = () => {
        if (!linkedBusiness?.name) return;
        setForm((f) => ({
            ...f,
            businessName: linkedBusiness.name || f.businessName,
            tradeType: linkedBusiness.category || f.tradeType,
            phone: linkedBusiness.phone || f.phone,
            serviceArea: linkedBusiness.address || f.serviceArea
        }));
        setStep(2);
    };

    const nextFromService = () => {
        if (!form.tradeType) return;
        setStep(2);
    };

    const nextFromDetails = (e: FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.businessName.trim()) return;
        setStep(3);
    };

    const finish = async (e: FormEvent) => {
        e.preventDefault();
        await onComplete(form);
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-5">
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">Booking Plots</p>
                <h1 className="text-2xl lg:text-3xl font-black text-[#0F172A] mt-1">Set up your booking board</h1>
                <p className="text-sm text-[#64748B] mt-1">Tell us about your service — your real details, no fake profiles.</p>
            </div>

            <div className="flex gap-2">
                {[
                    ['1', 'Your service'],
                    ['2', 'Your details'],
                    ['3', 'Bookings & deposit']
                ].map(([n, label], i) => (
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

            {linked && linkedBusiness?.name && step === 1 && (
                <button
                    type="button"
                    onClick={applyLinkedPrefill}
                    className="w-full text-left rounded-xl border-2 border-[#F59E0B] bg-[#F59E0B]/10 p-4 hover:bg-[#F59E0B]/15 transition"
                >
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#64748B]">
                        <Building2 className="w-4 h-4" /> Use your LocalPulse business
                    </div>
                    <p className="font-bold text-[#0F172A] mt-2">{linkedBusiness.name}</p>
                    <p className="text-sm text-[#64748B]">Pre-fill from your connected location, then confirm your name.</p>
                </button>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

            {step === 1 && (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm">
                    <h2 className="font-bold text-lg text-[#0F172A]">What service do you offer?</h2>
                    <p className="text-sm text-[#64748B] mt-1 mb-4">Choose the trade that best matches your work.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SERVICES.map((s) => {
                            const Icon = s.icon;
                            const on = form.tradeType === s.type;
                            return (
                                <button
                                    key={s.type}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, tradeType: s.type }))}
                                    className={cn(
                                        'text-left rounded-xl border p-4 transition',
                                        on ? 'border-[#F59E0B] bg-[#F59E0B]/15 ring-2 ring-[#F59E0B]/40' : 'border-[#E2E8F0] hover:border-[#0F172A]/30'
                                    )}
                                >
                                    <Icon className={cn('w-6 h-6 mb-2', on ? 'text-[#0F172A]' : 'text-[#64748B]')} />
                                    <div className="font-bold text-sm text-[#0F172A]">{s.label}</div>
                                    <div className="text-xs text-[#64748B] mt-0.5">{s.subtitle}</div>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        disabled={!form.tradeType}
                        onClick={nextFromService}
                        className="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold disabled:opacity-40"
                    >
                        Continue <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {step === 2 && (
                <form onSubmit={nextFromDetails} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4">
                    <div>
                        <h2 className="font-bold text-lg text-[#0F172A]">Your details</h2>
                        <p className="text-sm text-[#64748B] mt-1">This is what customers see on your booking page.</p>
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
                        Direct phone
                        <div className="relative mt-1">
                            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                            <input
                                inputMode="numeric"
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: restrictPhoneInput(e.target.value) }))}
                                placeholder="e.g. 07700900123"
                                maxLength={11}
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
                        <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
                            Back
                        </button>
                        <button type="submit" className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold">
                            Continue <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            )}

            {step === 3 && (
                <form onSubmit={finish} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 lg:p-6 shadow-sm space-y-4">
                    <div>
                        <h2 className="font-bold text-lg text-[#0F172A]">Bookings, emergencies & deposit</h2>
                        <p className="text-sm text-[#64748B] mt-1">Default weekly slots are added — you can edit them in Settings after launch.</p>
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
                                    form.acceptingEmergencies ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-100'
                                )}
                            >
                                Yes — accept emergencies
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, acceptingEmergencies: false }))}
                                className={cn(
                                    'rounded-xl py-2.5 text-xs font-bold border',
                                    !form.acceptingEmergencies ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-[#F8FAFC] border-[#E2E8F0]'
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
                                <span className="text-[10px] font-bold uppercase text-white/50">Standard visit deposit</span>
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
                        <p className="text-xs text-white/50">
                            {form.acceptingEmergencies
                                ? 'Emergency customers pay this deposit when they book a callout.'
                                : 'Customers pay this deposit when they book a standard visit.'}
                        </p>
                    </div>

                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-sm text-[#64748B]">
                        <strong className="text-[#0F172A]">{form.businessName}</strong> · {form.tradeType}
                        <br />
                        {form.name} · {form.phone || 'No phone yet'}
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]">
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
        </div>
    );
}
