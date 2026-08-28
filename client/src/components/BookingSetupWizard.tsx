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
    deposit: number;
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
        deposit: 45,
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
                <p className="text-xs font-bold uppercase tracking-widest text-[#5B6770]">Booking Plots</p>
                <h1 className="text-2xl lg:text-3xl font-black text-[#12333C] mt-1">Set up your booking board</h1>
                <p className="text-sm text-[#5B6770] mt-1">Tell us about your service — your real details, no fake profiles.</p>
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
                                ? 'bg-[#12333C] text-white border-[#12333C]'
                                : step > i + 1
                                  ? 'bg-[#C8D400]/20 text-[#12333C] border-[#C8D400]/50'
                                  : 'bg-white text-[#5B6770] border-[#E3E8EA]'
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
                    className="w-full text-left rounded-xl border-2 border-[#C8D400] bg-[#C8D400]/10 p-4 hover:bg-[#C8D400]/15 transition"
                >
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#5B6770]">
                        <Building2 className="w-4 h-4" /> Use your LocalPulse business
                    </div>
                    <p className="font-bold text-[#12333C] mt-2">{linkedBusiness.name}</p>
                    <p className="text-sm text-[#5B6770]">Pre-fill from your connected location, then confirm your name.</p>
                </button>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

            {step === 1 && (
                <div className="bg-white rounded-2xl border border-[#E3E8EA] p-5 lg:p-6 shadow-sm">
                    <h2 className="font-bold text-lg text-[#12333C]">What service do you offer?</h2>
                    <p className="text-sm text-[#5B6770] mt-1 mb-4">Choose the trade that best matches your work.</p>
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
                                        on ? 'border-[#C8D400] bg-[#C8D400]/15 ring-2 ring-[#C8D400]/40' : 'border-[#E3E8EA] hover:border-[#12333C]/30'
                                    )}
                                >
                                    <Icon className={cn('w-6 h-6 mb-2', on ? 'text-[#12333C]' : 'text-[#5B6770]')} />
                                    <div className="font-bold text-sm text-[#12333C]">{s.label}</div>
                                    <div className="text-xs text-[#5B6770] mt-0.5">{s.subtitle}</div>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        disabled={!form.tradeType}
                        onClick={nextFromService}
                        className="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#12333C] text-white text-sm font-bold disabled:opacity-40"
                    >
                        Continue <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {step === 2 && (
                <form onSubmit={nextFromDetails} className="bg-white rounded-2xl border border-[#E3E8EA] p-5 lg:p-6 shadow-sm space-y-4">
                    <div>
                        <h2 className="font-bold text-lg text-[#12333C]">Your details</h2>
                        <p className="text-sm text-[#5B6770] mt-1">This is what customers see on your booking page.</p>
                    </div>
                    <label className="block text-xs font-bold uppercase text-[#5B6770]">
                        Your full name
                        <div className="relative mt-1">
                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6770] pointer-events-none" />
                            <input
                                required
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Dave Miller"
                                className="w-full rounded-xl border border-[#E3E8EA] bg-[#F5F7F8] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#12333C] focus:bg-white"
                            />
                        </div>
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#5B6770]">
                        Business name
                        <div className="relative mt-1">
                            <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6770] pointer-events-none" />
                            <input
                                required
                                value={form.businessName}
                                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                                placeholder="e.g. Miller Heating Ltd"
                                className="w-full rounded-xl border border-[#E3E8EA] bg-[#F5F7F8] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#12333C] focus:bg-white"
                            />
                        </div>
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#5B6770]">
                        Direct phone
                        <div className="relative mt-1">
                            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6770] pointer-events-none" />
                            <input
                                inputMode="numeric"
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: restrictPhoneInput(e.target.value) }))}
                                placeholder="e.g. 07700900123"
                                maxLength={11}
                                className="w-full rounded-xl border border-[#E3E8EA] bg-[#F5F7F8] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#12333C] focus:bg-white"
                            />
                        </div>
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#5B6770]">
                        Service area
                        <div className="relative mt-1">
                            <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6770] pointer-events-none" />
                            <input
                                value={form.serviceArea}
                                onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))}
                                placeholder="e.g. Greater Manchester, within 15 miles"
                                className="w-full rounded-xl border border-[#E3E8EA] bg-[#F5F7F8] pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-[#12333C] focus:bg-white"
                            />
                        </div>
                    </label>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border border-[#E3E8EA] text-sm font-bold text-[#5B6770]">
                            Back
                        </button>
                        <button type="submit" className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#12333C] text-white text-sm font-bold">
                            Continue <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            )}

            {step === 3 && (
                <form onSubmit={finish} className="bg-white rounded-2xl border border-[#E3E8EA] p-5 lg:p-6 shadow-sm space-y-4">
                    <div>
                        <h2 className="font-bold text-lg text-[#12333C]">Bookings, emergencies & deposit</h2>
                        <p className="text-sm text-[#5B6770] mt-1">Default weekly slots are added — you can edit them in Settings after launch.</p>
                    </div>

                    <div className="rounded-xl border border-[#E3E8EA] p-4 space-y-3">
                        <p className="text-sm font-bold text-[#12333C] flex items-center gap-2">
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
                                    !form.acceptingEmergencies ? 'bg-[#12333C] text-white border-[#12333C]' : 'bg-[#F5F7F8] border-[#E3E8EA]'
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
                                className="w-full rounded-xl border border-[#E3E8EA] bg-[#F5F7F8] px-3 py-2.5 text-sm"
                            />
                        )}
                    </div>

                    <div className="rounded-xl bg-[#12333C] text-white p-4">
                        <p className="text-xs font-bold uppercase text-white/60 flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-[#C8D400]" /> Customer deposit to pay when booking
                        </p>
                        <div className="flex gap-2 mt-3">
                            <select
                                value={form.currency}
                                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                                className="rounded-lg border-0 bg-white/10 text-white px-2 py-2 text-sm font-bold"
                            >
                                <option value="£">£</option>
                                <option value="$">$</option>
                                <option value="€">€</option>
                            </select>
                            <input
                                type="number"
                                min={0}
                                value={form.deposit}
                                onChange={(e) => setForm((f) => ({ ...f, deposit: Number(e.target.value) }))}
                                className="flex-1 rounded-lg border-0 bg-white/10 text-white px-3 py-2 text-2xl font-black"
                            />
                        </div>
                        <p className="text-xs text-white/50 mt-2">Customers pay this flat deposit to confirm a slot (simulated until Stripe is connected).</p>
                    </div>

                    <div className="rounded-xl bg-[#F5F7F8] border border-[#E3E8EA] p-3 text-sm text-[#5B6770]">
                        <strong className="text-[#12333C]">{form.businessName}</strong> · {form.tradeType}
                        <br />
                        {form.name} · {form.phone || 'No phone yet'}
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl border border-[#E3E8EA] text-sm font-bold text-[#5B6770]">
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="flex-1 py-3 rounded-xl bg-[#C8D400] text-[#12333C] text-sm font-bold disabled:opacity-60"
                        >
                            {busy ? 'Launching...' : 'Launch my booking board'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
