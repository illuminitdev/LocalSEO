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
    Pencil,
    Camera,
    Mail,
    Phone,
    Key,
    Settings,
    Image as ImageIcon
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, cn } from '../../shared/utils';
import { clearToken, setMustChangePassword } from '../auth/auth';
import GroundingModal from '../dashboard/GroundingModal';
import PlacesMap from '../../shared/PlacesMap';
import { useEntitlements } from '../../shared/EntitlementsContext';
import { FEATURE_LABELS, PLANS, type FeatureKey } from '../../shared/planCatalog';
import {
    DEFAULT_BRAND_PRIMARY,
    DEFAULT_BRAND_SECONDARY,
    isValidBrandHex,
    normalizeBrandHex,
    orgBrandStyle
} from '../../shared/orgBrand';
import { useOrgBrand } from '../../shared/OrgBrandContext';

const fieldClass =
    'mt-1.5 w-full rounded-xl border border-[#E2E8F0]/80 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)] transition-shadow';

const ACCOUNT_NAV = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'plan', label: 'Plan', icon: CreditCard },
    { id: 'password', label: 'Account security', icon: Shield },
    { id: 'branding', label: 'Branding', icon: ImageIcon },
    { id: 'business', label: 'Business', icon: Building2 },
    { id: 'location', label: 'Location', icon: MapPin },
    { id: 'signout', label: 'Sign out', icon: LogOut }
] as const;

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
            <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{
                    background: 'linear-gradient(to bottom, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 55%, white))'
                }}
            />
            <div className="pl-1">
                <div className="px-6 py-5 border-b border-[#F1F5F9] bg-gradient-to-br from-white via-white to-[#F8FAFC] flex items-start gap-3.5">
                    <div
                        className="h-10 w-10 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-[0_8px_16px_-6px_rgba(15,23,42,0.35)]"
                        style={{ background: 'var(--brand-primary)' }}
                    >
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
    const [activeSection, setActiveSection] = useState<string>(() => {
        if (forcePassword) return 'password';
        try {
            const hash = window.location.hash.replace(/^#/, '');
            if (hash && ACCOUNT_NAV.some((n) => n.id === hash)) return hash;
        } catch {
            
        }
        return 'profile';
    });

    const selectSection = (id: string) => {
        setActiveSection(id);
        try {
            window.history.replaceState(null, '', `#${id}`);
        } catch {
            
        }
    };

    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [profileMsg, setProfileMsg] = useState('');
    const [profileErr, setProfileErr] = useState('');
    const [profileBusy, setProfileBusy] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);
    const [showPasswordForm, setShowPasswordForm] = useState(forcePassword);

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

    const [logoUrl, setLogoUrl] = useState('');
    const [brandPrimary, setBrandPrimary] = useState(DEFAULT_BRAND_PRIMARY);
    const [brandSecondary, setBrandSecondary] = useState(DEFAULT_BRAND_SECONDARY);
    const [brandMsg, setBrandMsg] = useState('');
    const [brandErr, setBrandErr] = useState('');
    const [brandBusy, setBrandBusy] = useState(false);
    const [logoBusy, setLogoBusy] = useState(false);

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
        activeSubscriptions,
        simulatePlan,
        entitlementsDisabled,
        hasFeature
    } = useEntitlements();
    const { applyBrand } = useOrgBrand();
    const [simBusy, setSimBusy] = useState(false);
    const showSimulate = entitlementsDisabled;
    const hasLocalPresence = hasFeature('local_presence');

    const formatPeriod = (value: string | null | undefined) =>
        value
            ? new Date(value).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
              })
            : null;

    const periodLabel = formatPeriod(currentPeriodEnd);
    const stackedPlans =
        activeSubscriptions.length > 0
            ? activeSubscriptions
            : planId
              ? [
                    {
                        id: planId,
                        planId,
                        planName: planName || planId,
                        priceLabel,
                        currentPeriodEnd,
                        status: subscriptionStatus || 'active'
                    }
                ]
              : [];
    const showStackedList = stackedPlans.length > 1;

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
                setAvatarUrl(me.user?.avatarUrl || me.user?.avatar_url || '');
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
                setLogoUrl(o.logo_url || o.logoUrl || '');
                setBrandPrimary(
                    normalizeBrandHex(o.brand_primary || o.brandPrimary || '', DEFAULT_BRAND_PRIMARY)
                );
                setBrandSecondary(
                    normalizeBrandHex(o.brand_secondary || o.brandSecondary || '', DEFAULT_BRAND_SECONDARY)
                );
            })
            .catch((err: Error) => {
                const msg = err.message || 'Could not load account';
                
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
        if (forcePassword) selectSection('password');
    }, [forcePassword]);

    const visibleNav = ACCOUNT_NAV.filter((item) => item.id !== 'location' || hasLocalPresence);

    useEffect(() => {
        if (activeSection === 'location' && !hasLocalPresence) selectSection('profile');
    }, [activeSection, hasLocalPresence]);

    const saveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileBusy(true);
        setProfileMsg('');
        setProfileErr('');
        try {
            const data = await apiPatch('/api/auth/profile', {
                name: displayName,
                avatarUrl: avatarUrl || undefined
            });
            setDisplayName(data.user?.name || displayName);
            setAvatarUrl(data.user?.avatarUrl || avatarUrl);

            
            const updated = await apiPatch('/api/host/organization', { phone: org.phone || '' });
            setOrg((o) => ({
                ...o,
                phone: updated.phone || ''
            }));

            setProfileMsg('Profile saved.');
            setEditingProfile(false);
        } catch (err: any) {
            setProfileErr(err.message);
        } finally {
            setProfileBusy(false);
        }
    };

    const uploadAvatar = async (file: File) => {
        setAvatarBusy(true);
        setProfileErr('');
        try {
            const presign = await apiPost('/api/auth/avatar/presign', {
                contentType: file.type || 'image/jpeg'
            });
            const put = await fetch(presign.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'image/jpeg' },
                body: file
            });
            if (!put.ok) throw new Error('Upload to storage failed');
            setAvatarUrl(presign.publicUrl);
            await apiPatch('/api/auth/profile', {
                name: displayName || 'User',
                avatarUrl: presign.publicUrl
            });
            setProfileMsg('Profile picture updated.');
        } catch (err: any) {
            setProfileErr(err.message || 'Upload failed (set MEDIA_BUCKET for S3)');
        } finally {
            setAvatarBusy(false);
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

    const uploadLogo = async (file: File) => {
        setLogoBusy(true);
        setBrandErr('');
        setBrandMsg('');
        try {
            if (file.size > 5 * 1024 * 1024) throw new Error('Logo must be under 5MB');
            const presign = await apiPost('/api/host/media/presign', {
                kind: 'logo',
                contentType: file.type || 'image/jpeg'
            });
            const put = await fetch(presign.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'image/jpeg' },
                body: file
            });
            if (!put.ok) throw new Error('Upload to storage failed');
            const updated = await apiPatch('/api/host/organization', { logoUrl: presign.publicUrl });
            setLogoUrl(updated.logo_url || presign.publicUrl);
            applyBrand({
                logoUrl: updated.logo_url || presign.publicUrl,
                brandPrimary,
                brandSecondary
            });
            setBrandMsg('Logo updated.');
        } catch (err: any) {
            setBrandErr(err.message || 'Upload failed (set MEDIA_BUCKET for S3)');
        } finally {
            setLogoBusy(false);
        }
    };

    const clearLogo = async () => {
        setLogoBusy(true);
        setBrandErr('');
        setBrandMsg('');
        try {
            await apiPatch('/api/host/organization', { logoUrl: '' });
            setLogoUrl('');
            applyBrand({ logoUrl: '', brandPrimary, brandSecondary });
            setBrandMsg('Logo removed.');
        } catch (err: any) {
            setBrandErr(err.message || 'Could not remove logo');
        } finally {
            setLogoBusy(false);
        }
    };

    const saveBranding = async (e: FormEvent) => {
        e.preventDefault();
        if (!isValidBrandHex(brandPrimary) || !isValidBrandHex(brandSecondary)) {
            setBrandErr('Colors must be hex values like #F59E0B');
            return;
        }
        setBrandBusy(true);
        setBrandMsg('');
        setBrandErr('');
        try {
            const updated = await apiPatch('/api/host/organization', {
                brandPrimary: normalizeBrandHex(brandPrimary, DEFAULT_BRAND_PRIMARY),
                brandSecondary: normalizeBrandHex(brandSecondary, DEFAULT_BRAND_SECONDARY)
            });
            setBrandPrimary(
                normalizeBrandHex(updated.brand_primary || brandPrimary, DEFAULT_BRAND_PRIMARY)
            );
            setBrandSecondary(
                normalizeBrandHex(updated.brand_secondary || brandSecondary, DEFAULT_BRAND_SECONDARY)
            );
            applyBrand({
                logoUrl,
                brandPrimary: updated.brand_primary || brandPrimary,
                brandSecondary: updated.brand_secondary || brandSecondary
            });
            setBrandMsg('Brand colors saved — sidebar and workspace updated.');
        } catch (err: any) {
            setBrandErr(err.message);
        } finally {
            setBrandBusy(false);
        }
    };

    const resetBranding = async () => {
        setBrandBusy(true);
        setBrandMsg('');
        setBrandErr('');
        try {
            const updated = await apiPatch('/api/host/organization', {
                logoUrl: '',
                brandPrimary: DEFAULT_BRAND_PRIMARY,
                brandSecondary: DEFAULT_BRAND_SECONDARY
            });
            setLogoUrl(updated.logo_url || '');
            setBrandPrimary(
                normalizeBrandHex(updated.brand_primary || '', DEFAULT_BRAND_PRIMARY)
            );
            setBrandSecondary(
                normalizeBrandHex(updated.brand_secondary || '', DEFAULT_BRAND_SECONDARY)
            );
            applyBrand({
                logoUrl: updated.logo_url || '',
                brandPrimary: updated.brand_primary || DEFAULT_BRAND_PRIMARY,
                brandSecondary: updated.brand_secondary || DEFAULT_BRAND_SECONDARY
            });
            setBrandMsg('Branding reset to LocalPulse defaults.');
        } catch (err: any) {
            setBrandErr(err.message || 'Could not reset branding');
        } finally {
            setBrandBusy(false);
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
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-500">
            <div className="mb-6 flex items-start gap-4">
                <div
                    className="h-12 w-12 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-md"
                    style={{ background: 'var(--brand-secondary)' }}
                >
                    <Settings className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">Settings</h1>
                    <p className="mt-1 text-sm text-[#64748B]">Manage your account profile, branding, and security.</p>
                </div>
            </div>

            {mustChangePassword && (
                <p className="mb-5 text-sm text-amber-950 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-4 py-3 shadow-sm">
                    Please change your temporary password when you can — open Account security.
                </p>
            )}

            {loadError && (
                <p className="mb-5 text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">{loadError}</p>
            )}

            <nav
                className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-[#E2E8F0]/90 bg-[#F1F5F9]/70 p-1.5 backdrop-blur-sm"
                aria-label="Account sections"
            >
                {visibleNav.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => selectSection(item.id)}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all min-h-[40px]',
                                active
                                    ? 'text-white shadow-[0_8px_18px_-10px_rgba(15,23,42,0.55)]'
                                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/80'
                            )}
                            style={active ? { background: 'var(--brand-primary)' } : undefined}
                        >
                            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                            <span className="whitespace-nowrap">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="min-w-0">
                {activeSection === 'profile' && (
                <section
                    id="profile"
                    className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.2)] overflow-hidden"
                >
                    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
                        <div className="p-6 border-b lg:border-b-0 lg:border-r border-[#E2E8F0] bg-[#F8FAFC]/80 flex flex-col">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#94A3B8] flex items-center gap-1.5 mb-5">
                                <UserRound className="w-3.5 h-3.5" /> Profile
                            </p>
                            <div className="flex items-start gap-4 mb-5">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt=""
                                        className="h-20 w-20 rounded-full object-cover border-2 border-white shadow-md shrink-0"
                                    />
                                ) : (
                                    <div
                                        className="h-20 w-20 rounded-full text-white flex items-center justify-center text-2xl font-black shadow-md shrink-0"
                                        style={{ background: 'var(--brand-primary)' }}
                                    >
                                        {(displayName || email || 'U').charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0 pt-1">
                                    <p className="text-sm font-bold text-[#0F172A]">Profile Picture</p>
                                    <label className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold text-[#0F172A] cursor-pointer hover:bg-[#F8FAFC]">
                                        <Camera className="w-3.5 h-3.5" />
                                        {avatarBusy ? 'Uploading…' : 'Upload Picture'}
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            className="hidden"
                                            disabled={avatarBusy}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                if (file.size > 5 * 1024 * 1024) {
                                                    setProfileErr('Maximum size is 5MB.');
                                                    e.target.value = '';
                                                    return;
                                                }
                                                await uploadAvatar(file);
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>
                                    <p className="mt-2 text-[11px] text-[#94A3B8] leading-snug">
                                        JPG or PNG only. Maximum size 5MB.
                                    </p>
                                </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-4">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Host account
                            </span>
                            {profileErr && <p className="text-xs text-red-600 mb-2">{profileErr}</p>}
                            {profileMsg && <p className="text-xs text-emerald-700 mb-2">{profileMsg}</p>}
                            <button
                                type="button"
                                onClick={() => setEditingProfile((v) => !v)}
                                className="mt-auto w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-bold text-[#0F172A] hover:bg-white"
                            >
                                <Pencil className="w-4 h-4" />
                                {editingProfile ? 'Cancel edit' : 'Edit Profile'}
                            </button>
                        </div>

                        <div className="p-6 sm:p-8">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#94A3B8] mb-5">
                                Personal information
                            </p>
                            {!editingProfile ? (
                                <div className="space-y-3">
                                    <div className="rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center gap-3">
                                        <UserRound className="w-4 h-4 text-[#94A3B8] shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Name</p>
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{displayName || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center gap-3">
                                        <Mail className="w-4 h-4 text-[#94A3B8] shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Email</p>
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{email || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center gap-3">
                                        <Phone className="w-4 h-4 text-[#94A3B8] shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Phone</p>
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{org.phone || '—'}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={saveProfile} className="space-y-4 max-w-md">
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
                                    <label className="block text-sm font-semibold text-[#334155]">
                                        Phone
                                        <input
                                            type="tel"
                                            value={org.phone}
                                            onChange={(e) => setOrg((o) => ({ ...o, phone: e.target.value }))}
                                            className={fieldClass}
                                            placeholder="Mobile or business number"
                                            autoComplete="tel"
                                        />
                                    </label>
                                    <button
                                        type="submit"
                                        disabled={profileBusy}
                                        className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-[#1E293B] disabled:opacity-55"
                                    >
                                        {profileBusy ? 'Saving…' : 'Save profile'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </section>
                )}

                {activeSection === 'plan' && (
                <SectionCard
                    id="plan"
                    icon={CreditCard}
                    title={showStackedList ? 'Your plans' : 'Your plan'}
                    subtitle={
                        showStackedList
                            ? 'Active ZappSites subscriptions on this account. Features below are combined across all plans.'
                            : 'Features included with your ZappSites subscription.'
                    }
                >
                    {stackedPlans.length > 0 ? (
                        <div className="space-y-5">
                            {showStackedList ? (
                                <ul className="space-y-3">
                                    {stackedPlans.map((sub) => {
                                        const subPeriod = formatPeriod(sub.currentPeriodEnd);
                                        return (
                                            <li
                                                key={sub.id}
                                                className="rounded-2xl border border-[#FED7AA]/70 bg-gradient-to-br from-[#FFFBEB] to-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                                            >
                                                <div className="flex flex-wrap items-end justify-between gap-3">
                                                    <div>
                                                        <p className="text-xl font-black tracking-tight text-[#0F172A]">
                                                            {sub.planName}
                                                        </p>
                                                        {'priceLabel' in sub && sub.priceLabel ? (
                                                            <p className="text-sm text-[#92400E] mt-1 font-medium">
                                                                {sub.priceLabel}
                                                            </p>
                                                        ) : null}
                                                        {subPeriod && (
                                                            <p className="text-xs text-[#64748B] mt-2">
                                                                Access until {subPeriod}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {sub.status && (
                                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 capitalize shadow-sm">
                                                            <Check className="w-3 h-3" />
                                                            {sub.status}
                                                        </span>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className="rounded-2xl border border-[#FED7AA]/70 bg-gradient-to-br from-[#FFFBEB] to-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                    <div className="flex flex-wrap items-end justify-between gap-3">
                                        <div>
                                            <p className="text-2xl font-black tracking-tight text-[#0F172A]">{planName}</p>
                                            {priceLabel && (
                                                <p className="text-sm text-[#92400E] mt-1 font-medium">{priceLabel}</p>
                                            )}
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
                            )}
                            {features.length > 0 ? (
                                <ul className="grid sm:grid-cols-2 gap-2.5">
                                    {features.map((f: FeatureKey) => (
                                        <li
                                            key={f}
                                            className="text-sm text-[#334155] flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 shadow-[0_4px_12px_-8px_rgba(15,23,42,0.35)]"
                                        >
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                                style={{ background: 'var(--brand-primary)' }}
                                            />
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
                )}

                {activeSection === 'password' && (
                <SectionCard
                    icon={Shield}
                    title="Account Security"
                    subtitle="Keep your sign-in credentials up to date."
                    id="password"
                >
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 flex items-start gap-3 mb-4">
                        <Shield className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-950">
                            We recommend changing your password every 90 days to keep your account secure.
                        </p>
                    </div>
                    {!showPasswordForm ? (
                        <div className="rounded-xl border border-dashed border-[#E2E8F0] px-4 py-8 text-center">
                            <button
                                type="button"
                                onClick={() => setShowPasswordForm(true)}
                                className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                            >
                                <Key className="w-4 h-4" />
                                Update Password
                            </button>
                        </div>
                    ) : (
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
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="submit"
                                    disabled={passBusy}
                                    className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-[#1E293B] disabled:opacity-55"
                                >
                                    {passBusy ? 'Saving…' : 'Update password'}
                                </button>
                                {!forcePassword && (
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordForm(false)}
                                        className="px-5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B]"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                </SectionCard>
                )}

                {activeSection === 'branding' && (
                <div
                    id="branding"
                    className="rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]"
                    style={orgBrandStyle({ brandPrimary, brandSecondary })}
                >
                    <div className="mb-5">
                        <h2 className="text-base font-black text-[#0F172A]">Branding</h2>
                        <p className="text-xs text-[#64748B] mt-1">
                            Logo and colors for sidebar, booking page, and client hub.
                        </p>
                    </div>

                    {brandErr && <p className="mb-3 text-sm text-red-700">{brandErr}</p>}
                    {brandMsg && <p className="mb-3 text-sm text-emerald-700">{brandMsg}</p>}

                    <form onSubmit={saveBranding} className="space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden flex items-center justify-center shrink-0">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="Business logo" className="h-full w-full object-contain p-1" />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-[#CBD5E1]" />
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 min-w-0">
                                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer">
                                    <Camera className="w-3.5 h-3.5" />
                                    {logoBusy ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        className="hidden"
                                        disabled={logoBusy}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) void uploadLogo(file);
                                        }}
                                    />
                                </label>
                                {logoUrl && (
                                    <button
                                        type="button"
                                        disabled={logoBusy}
                                        onClick={() => void clearLogo()}
                                        className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                            <label className="block text-xs font-bold text-[#64748B]">
                                Primary
                                <div className="mt-1.5 flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={normalizeBrandHex(brandPrimary, DEFAULT_BRAND_PRIMARY)}
                                        onChange={(e) => setBrandPrimary(e.target.value.toUpperCase())}
                                        className="h-9 w-9 shrink-0 rounded-lg border border-[#E2E8F0] bg-white cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={brandPrimary}
                                        onChange={(e) => setBrandPrimary(e.target.value)}
                                        className="w-24 rounded-xl border border-[#E2E8F0] px-2.5 py-2 text-sm font-mono text-[#0F172A] focus:outline-none focus:border-[var(--brand-primary)]"
                                        placeholder="#F59E0B"
                                        maxLength={7}
                                    />
                                </div>
                            </label>
                            <label className="block text-xs font-bold text-[#64748B]">
                                Secondary
                                <div className="mt-1.5 flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={normalizeBrandHex(brandSecondary, DEFAULT_BRAND_SECONDARY)}
                                        onChange={(e) => setBrandSecondary(e.target.value.toUpperCase())}
                                        className="h-9 w-9 shrink-0 rounded-lg border border-[#E2E8F0] bg-white cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={brandSecondary}
                                        onChange={(e) => setBrandSecondary(e.target.value)}
                                        className="w-24 rounded-xl border border-[#E2E8F0] px-2.5 py-2 text-sm font-mono text-[#0F172A] focus:outline-none focus:border-[var(--brand-primary)]"
                                        placeholder="#0F172A"
                                        maxLength={7}
                                    />
                                </div>
                            </label>
                        </div>

                        <div
                            className="rounded-xl px-4 py-3 text-white flex items-center gap-3"
                            style={{ background: 'var(--brand-secondary)' }}
                        >
                            {logoUrl ? (
                                <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain bg-white/10 p-0.5 shrink-0" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
                                    Preview
                                </p>
                                <p className="text-sm font-black truncate">{org.name || 'Your business'}</p>
                            </div>
                            <span
                                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold"
                                style={{ background: 'var(--brand-primary)', color: 'var(--brand-secondary)' }}
                            >
                                Book now
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="submit"
                                disabled={brandBusy || logoBusy}
                                className="px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-55"
                                style={{ background: 'var(--brand-primary)' }}
                            >
                                {brandBusy ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                type="button"
                                disabled={brandBusy || logoBusy}
                                onClick={() => void resetBranding()}
                                className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-55"
                            >
                                Reset
                            </button>
                        </div>
                    </form>
                </div>
                )}

                {activeSection === 'business' && (
                <SectionCard
                    id="business"
                    icon={Building2}
                    title="Business"
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
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold"
                                style={{ background: 'var(--brand-primary)' }}
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
                                    className="px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-55"
                                    style={{ background: 'var(--brand-primary)' }}
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
                )}

                {activeSection === 'location' && hasLocalPresence && (
                <SectionCard
                    id="location"
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
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold"
                                    style={{ background: 'var(--brand-primary)' }}
                                >
                                    <Search className="w-4 h-4" />
                                    {business?.connected ? 'Change location' : 'Add location'}
                                </button>
                            </>
                        )}
                    </div>
                </SectionCard>
                )}

                {activeSection === 'signout' && (
                <section
                    id="signout"
                    className="relative overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50/40 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-[0_10px_30px_-18px_rgba(127,29,29,0.35)]"
                >
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
                )}
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
