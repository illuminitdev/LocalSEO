import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Building2,
    LogOut,
    MapPin,
    Search,
    Shield,
    CreditCard,
    UserRound,
    Check,
    Pencil
} from 'lucide-react';
import { apiGet, apiPatch } from '../lib/utils';
import { clearToken, setMustChangePassword } from '../lib/auth';
import GroundingModal from '../components/GroundingModal';
import PlacesMap from '../components/PlacesMap';
import { useEntitlements } from '../context/EntitlementsContext';
import { FEATURE_LABELS, PLANS, type FeatureKey } from '../lib/planCatalog';

const fieldClass =
    'mt-1.5 w-full rounded-xl border border-[#E2E8F0]/80 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25 transition-shadow';

type OrgForm = {
    name: string;
    hostName: string;
    phone: string;
    email: string;
    tradeType: string;
    serviceArea: string;
};

function SectionCard({
    icon: Icon,
    title,
    subtitle,
    children,
    id
}: {
    icon: any;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    id?: string;
}) {
    return (
        <section
            id={id}
            className="relative rounded-2xl overflow-hidden border border-[#E2E8F0]/90 bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.28)]"
        >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F59E0B] via-[#FBBF24] to-[#FED7AA]" />
            <div className="pl-1">
                <div className="px-6 py-5 border-b border-[#F1F5F9] bg-gradient-to-br from-[#FFFBEB] via-white to-[#F8FAFC] flex items-start gap-3.5">
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white flex items-center justify-center shrink-0 shadow-[0_8px_16px_-6px_rgba(217,119,6,0.55)]">
                        <Icon className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 pt-0.5">
                        <h2 className="text-base font-black tracking-tight text-[#0F172A]">{title}</h2>
                        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{subtitle}</p>
                    </div>
                </div>
                <div className="p-6 bg-gradient-to-b from-white to-[#F8FAFC]/60">{children}</div>
            </div>
        </section>
    );
}

export default function Account() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const forcePassword = params.get('forcePassword') === '1';
    const [loadError, setLoadError] = useState('');
    const [locationOpen, setLocationOpen] = useState(false);
    const [business, setBusiness] = useState<any>(null);
    const [mustChangePassword, setMustChange] = useState(forcePassword);
    const [editingOrg, setEditingOrg] = useState(false);

    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [profileMsg, setProfileMsg] = useState('');
    const [profileErr, setProfileErr] = useState('');
    const [profileBusy, setProfileBusy] = useState(false);

    const [org, setOrg] = useState<OrgForm>({
        name: '',
        hostName: '',
        phone: '',
        email: '',
        tradeType: '',
        serviceArea: ''
    });
    const [orgMsg, setOrgMsg] = useState('');
    const [orgErr, setOrgErr] = useState('');
    const [orgBusy, setOrgBusy] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passMsg, setPassMsg] = useState('');
    const [passErr, setPassErr] = useState('');
    const [passBusy, setPassBusy] = useState(false);

    const {
        planId,
        planName,
        priceLabel,
        features,
        subscriptionStatus,
        currentPeriodEnd,
        simulatePlan,
        entitlementsDisabled,
        hasFeature
    } = useEntitlements();
    const [simBusy, setSimBusy] = useState(false);
    const showSimulate = entitlementsDisabled;
    const hasLocalPresence = hasFeature('local_presence');

    const periodLabel = currentPeriodEnd
        ? new Date(currentPeriodEnd).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
          })
        : null;

    const hasOrgDetails = Boolean(
        org.name?.trim() || org.hostName?.trim() || org.phone?.trim() || org.tradeType?.trim()
    );

    const loadBusiness = () => {
        if (!hasLocalPresence) {
            setBusiness(null);
            return;
        }
        apiGet('/api/business').then(setBusiness).catch(() => setBusiness(null));
    };

    const loadAccount = () => {
        apiGet('/api/auth/me')
            .then((me) => {
                setDisplayName(me.user?.name || '');
                setEmail(me.user?.email || '');
                if (me.user?.mustChangePassword) {
                    setMustChange(true);
                    setMustChangePassword(true);
                }
                const o = me.organization || {};
                setOrg({
                    name: o.name || '',
                    hostName: o.host_name || '',
                    phone: o.phone || '',
                    email: o.email || '',
                    tradeType: o.trade_type || '',
                    serviceArea: o.service_area || ''
                });
            })
            .catch((err: Error) => {
                const msg = err.message || 'Could not load account';
                // Stale session or unreachable API — send back to login instead of a broken Account page
                if (
                    msg === 'Failed to fetch' ||
                    /unauthorized|invalid token|jwt|401/i.test(msg)
                ) {
                    clearToken();
                    navigate('/', { replace: true });
                    return;
                }
                setLoadError(msg);
            });
        loadBusiness();
    };

    useEffect(() => {
        loadAccount();
    }, [hasLocalPresence]);

    useEffect(() => {
        if (window.location.hash !== '#password') return;
        const t = window.setTimeout(() => {
            document.getElementById('password')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        return () => window.clearTimeout(t);
    }, []);

    const saveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileBusy(true);
        setProfileMsg('');
        setProfileErr('');
        try {
            const data = await apiPatch('/api/auth/profile', { name: displayName });
            setDisplayName(data.user?.name || displayName);
            setProfileMsg('Profile saved.');
        } catch (err: any) {
            setProfileErr(err.message);
        } finally {
            setProfileBusy(false);
        }
    };

    const saveBusiness = async (e: FormEvent) => {
        e.preventDefault();
        setOrgBusy(true);
        setOrgMsg('');
        setOrgErr('');
        try {
            const updated = await apiPatch('/api/host/organization', org);
            setOrg({
                name: updated.name || '',
                hostName: updated.host_name || '',
                phone: updated.phone || '',
                email: updated.email || '',
                tradeType: updated.trade_type || '',
                serviceArea: updated.service_area || ''
            });
            setOrgMsg('Business details saved.');
            setEditingOrg(false);
        } catch (err: any) {
            setOrgErr(err.message);
        } finally {
            setOrgBusy(false);
        }
    };

    const savePassword = async (e: FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setPassErr('New passwords do not match.');
            return;
        }
        setPassBusy(true);
        setPassMsg('');
        setPassErr('');
        try {
            await apiPatch('/api/auth/password', { currentPassword, newPassword });
            setPassMsg('Password updated.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setMustChange(false);
            setMustChangePassword(false);
            if (forcePassword) {
                navigate('/account', { replace: true });
            }
        } catch (err: any) {
            setPassErr(err.message);
        } finally {
            setPassBusy(false);
        }
    };

    const logout = () => {
        clearToken();
        navigate('/', { replace: true });
    };

    const handleSimulatePlan = async (nextPlanId: string) => {
        setSimBusy(true);
        try {
            await simulatePlan(nextPlanId);
        } finally {
            setSimBusy(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto pb-12 animate-in fade-in duration-500">
            <div className="relative overflow-hidden rounded-3xl mb-8 border border-[#FED7AA]/50 shadow-[0_20px_50px_-24px_rgba(217,119,6,0.45)]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A]" />
                <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#F59E0B]/25 blur-3xl" />
                <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[#FBBF24]/15 blur-2xl" />
                <div className="relative px-6 py-8 sm:px-8">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FBBF24]">Zappsites · Local SEO</p>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mt-2">Account settings</h1>
                    <p className="mt-2 text-sm text-white/70 max-w-xl">
                        Profile, plan, workspace details, listing location, and password.
                    </p>
                    {(displayName || email) && (
                        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3 shadow-lg">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white flex items-center justify-center text-sm font-black shadow-md">
                                {(displayName || email).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{displayName || 'Your account'}</p>
                                <p className="text-xs text-white/65 truncate">{email}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {mustChangePassword && (
                <p className="mb-6 text-sm text-amber-950 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-4 py-3 shadow-sm">
                    Please change your temporary password when you can — use the Password section below.
                </p>
            )}

            {loadError && (
                <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">{loadError}</p>
            )}

            <div className="space-y-7">
                <SectionCard
                    icon={CreditCard}
                    title="Your plan"
                    subtitle="Features included with your ZappSites subscription."
                >
                    {planId ? (
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-[#FED7AA]/70 bg-gradient-to-br from-[#FFFBEB] to-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <p className="text-2xl font-black tracking-tight text-[#0F172A]">{planName}</p>
                                        {priceLabel && <p className="text-sm text-[#92400E] mt-1 font-medium">{priceLabel}</p>}
                                        {periodLabel && (
                                            <p className="text-xs text-[#64748B] mt-2">Access until {periodLabel}</p>
                                        )}
                                    </div>
                                    {subscriptionStatus && (
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 capitalize shadow-sm">
                                            <Check className="w-3 h-3" />
                                            {subscriptionStatus}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {features.length > 0 ? (
                                <ul className="grid sm:grid-cols-2 gap-2.5">
                                    {features.map((f: FeatureKey) => (
                                        <li
                                            key={f}
                                            className="text-sm text-[#334155] flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-[0_4px_12px_-8px_rgba(15,23,42,0.35)]"
                                        >
                                            <span className="w-2 h-2 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#D97706] shrink-0 shadow-sm" />
                                            {FEATURE_LABELS[f]}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-[#64748B]">
                                    Website plan — local SEO and booking tools are not included.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-[#64748B]">
                            No active plan on this account. Contact ZappSites or upgrade to unlock local SEO and booking tools.
                        </p>
                    )}
                    {showSimulate && (
                        <div className="pt-4 mt-4 border-t border-[#E2E8F0]">
                            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                                Simulate plan (ENTITLEMENTS_DISABLED only)
                            </label>
                            <select
                                value={planId || ''}
                                disabled={simBusy}
                                onChange={(e) => e.target.value && handleSimulatePlan(e.target.value)}
                                className={fieldClass}
                            >
                                <option value="">— Select plan —</option>
                                {PLANS.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </SectionCard>

                <SectionCard
                    icon={Shield}
                    title="Password"
                    subtitle={
                        mustChangePassword
                            ? 'Enter your temporary password, then choose a new one.'
                            : 'Update the password you use to sign in.'
                    }
                    id="password"
                >
                    <form onSubmit={savePassword} className="space-y-4 max-w-md">
                        {passErr && <p className="text-sm text-red-700">{passErr}</p>}
                        {passMsg && <p className="text-sm text-emerald-700">{passMsg}</p>}
                        <label className="block text-sm font-semibold text-[#334155]">
                            Current password
                            <input
                                type="password"
                                required
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className={fieldClass}
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#334155]">
                            New password
                            <input
                                type="password"
                                required
                                minLength={8}
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className={fieldClass}
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#334155]">
                            Confirm new password
                            <input
                                type="password"
                                required
                                minLength={8}
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={fieldClass}
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={passBusy}
                            className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-[#1E293B] disabled:opacity-55"
                        >
                            {passBusy ? 'Saving…' : 'Update password'}
                        </button>
                    </form>
                </SectionCard>

                <SectionCard
                    icon={UserRound}
                    title="Profile"
                    subtitle="How you appear in this workspace."
                >
                    <form onSubmit={saveProfile} className="space-y-4 max-w-md">
                        {profileErr && <p className="text-sm text-red-700">{profileErr}</p>}
                        {profileMsg && <p className="text-sm text-emerald-700">{profileMsg}</p>}
                        <label className="block text-sm font-semibold text-[#334155]">
                            Full name
                            <input
                                type="text"
                                required
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className={fieldClass}
                                placeholder="Your name"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#334155]">
                            Email
                            <input
                                type="email"
                                value={email}
                                disabled
                                className={`${fieldClass} bg-[#F1F5F9] text-[#64748B] cursor-not-allowed`}
                            />
                            <span className="mt-1.5 block text-xs text-[#94A3B8]">
                                Email is used to sign in and cannot be changed here.
                            </span>
                        </label>
                        <button
                            type="submit"
                            disabled={profileBusy}
                            className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-[#1E293B] disabled:opacity-55"
                        >
                            {profileBusy ? 'Saving…' : 'Save profile'}
                        </button>
                    </form>
                </SectionCard>

                <SectionCard
                    icon={Building2}
                    title="Workspace business"
                    subtitle="Trading name and contact used for bookings and your workspace."
                >
                    {orgErr && <p className="mb-3 text-sm text-red-700">{orgErr}</p>}
                    {orgMsg && <p className="mb-3 text-sm text-emerald-700">{orgMsg}</p>}

                    {!editingOrg && hasOrgDetails ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 space-y-2 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.35)]">
                                <p className="text-base font-black text-[#0F172A]">{org.name || 'Untitled business'}</p>
                                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-[#64748B]">
                                    {org.hostName && <p>Contact: {org.hostName}</p>}
                                    {org.tradeType && <p>Trade: {org.tradeType}</p>}
                                    {org.phone && <p>Phone: {org.phone}</p>}
                                    {org.email && <p>Email: {org.email}</p>}
                                    {org.serviceArea && <p className="sm:col-span-2">Area: {org.serviceArea}</p>}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingOrg(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit business details
                            </button>
                        </div>
                    ) : !editingOrg ? (
                        <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-8 text-center">
                            <Building2 className="w-8 h-8 text-[#CBD5E1] mx-auto mb-3" />
                            <p className="text-sm font-semibold text-[#0F172A]">No workspace business yet</p>
                            <p className="text-xs text-[#64748B] mt-1 mb-4">Add trading details used across bookings.</p>
                            <button
                                type="button"
                                onClick={() => setEditingOrg(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F59E0B] text-white text-sm font-bold hover:bg-[#D97706]"
                            >
                                Add business details
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={saveBusiness} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="block text-sm font-semibold text-[#334155] sm:col-span-2">
                                    Business name
                                    <input
                                        type="text"
                                        value={org.name}
                                        onChange={(e) => setOrg((o) => ({ ...o, name: e.target.value }))}
                                        className={fieldClass}
                                        placeholder="e.g. Miller Plumbing"
                                    />
                                </label>
                                <label className="block text-sm font-semibold text-[#334155]">
                                    Contact name
                                    <input
                                        type="text"
                                        value={org.hostName}
                                        onChange={(e) => setOrg((o) => ({ ...o, hostName: e.target.value }))}
                                        className={fieldClass}
                                        placeholder="Who customers speak to"
                                    />
                                </label>
                                <label className="block text-sm font-semibold text-[#334155]">
                                    Trade / category
                                    <input
                                        type="text"
                                        value={org.tradeType}
                                        onChange={(e) => setOrg((o) => ({ ...o, tradeType: e.target.value }))}
                                        className={fieldClass}
                                        placeholder="e.g. Plumber"
                                    />
                                </label>
                                <label className="block text-sm font-semibold text-[#334155]">
                                    Phone
                                    <input
                                        type="tel"
                                        value={org.phone}
                                        onChange={(e) => setOrg((o) => ({ ...o, phone: e.target.value }))}
                                        className={fieldClass}
                                        placeholder="Business phone"
                                    />
                                </label>
                                <label className="block text-sm font-semibold text-[#334155]">
                                    Business email
                                    <input
                                        type="email"
                                        value={org.email}
                                        onChange={(e) => setOrg((o) => ({ ...o, email: e.target.value }))}
                                        className={fieldClass}
                                        placeholder="hello@business.com"
                                    />
                                </label>
                                <label className="block text-sm font-semibold text-[#334155] sm:col-span-2">
                                    Service area
                                    <input
                                        type="text"
                                        value={org.serviceArea}
                                        onChange={(e) => setOrg((o) => ({ ...o, serviceArea: e.target.value }))}
                                        className={fieldClass}
                                        placeholder="e.g. Manchester & surrounding areas"
                                    />
                                </label>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                    type="submit"
                                    disabled={orgBusy}
                                    className="px-5 py-2.5 rounded-xl bg-[#F59E0B] text-white text-sm font-bold hover:bg-[#D97706] disabled:opacity-55"
                                >
                                    {orgBusy ? 'Saving…' : 'Save business'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingOrg(false);
                                        setOrgErr('');
                                        setOrgMsg('');
                                    }}
                                    className="px-5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </SectionCard>

                <SectionCard
                    icon={MapPin}
                    title="Listing location"
                    subtitle="Connect your Google Business Profile for rankings, reviews, and listing tools."
                >
                    <div className="space-y-4">
                        {!hasLocalPresence ? (
                            <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-center">
                                <MapPin className="w-7 h-7 text-[#CBD5E1] mx-auto mb-2" />
                                <p className="text-sm text-[#64748B]">
                                    Connecting a Google listing needs the Local Presence plan (or higher).
                                    See your current plan above.
                                </p>
                            </div>
                        ) : (
                            <>
                                {business?.connected ? (
                                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
                                        <div>
                                            <p className="text-sm font-bold text-[#0F172A]">{business.name || 'Connected location'}</p>
                                            {business.address && (
                                                <p className="mt-1 text-sm text-[#64748B]">{business.address}</p>
                                            )}
                                            {(business.rating || business.category) && (
                                                <p className="mt-2 text-xs text-[#94A3B8]">
                                                    {[business.category, business.rating ? `${business.rating}★` : null]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        <PlacesMap
                                            lat={business.lat}
                                            lng={business.lng}
                                            title={business.name}
                                        />
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-center">
                                        <MapPin className="w-7 h-7 text-[#CBD5E1] mx-auto mb-2" />
                                        <p className="text-sm text-[#64748B]">
                                            No location connected yet. Add one to power local SEO tools.
                                        </p>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setLocationOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F59E0B] text-white text-sm font-bold hover:bg-[#D97706]"
                                >
                                    <Search className="w-4 h-4" />
                                    {business?.connected ? 'Change location' : 'Add location'}
                                </button>
                            </>
                        )}
                    </div>
                </SectionCard>

                <section className="relative overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50/40 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-[0_10px_30px_-18px_rgba(127,29,29,0.35)]">
                    <div>
                        <h2 className="text-base font-black text-[#0F172A]">Sign out</h2>
                        <p className="text-xs text-[#64748B] mt-0.5">End your session on this device.</p>
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-700 hover:bg-red-50 transition-colors shadow-sm"
                    >
                        <LogOut className="w-4 h-4" strokeWidth={1.75} />
                        Log out
                    </button>
                </section>
            </div>

            {hasLocalPresence && (
                <GroundingModal
                    isOpen={locationOpen}
                    onClose={() => {
                        setLocationOpen(false);
                        loadBusiness();
                    }}
                />
            )}
        </div>
    );
}
