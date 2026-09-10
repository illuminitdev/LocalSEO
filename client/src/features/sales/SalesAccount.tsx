import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2,
    Camera,
    CreditCard,
    Key,
    LogOut,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Settings,
    Shield,
    UserRound
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../../shared/utils';
import { clearToken, setMustChangePassword } from '../auth/auth';

const fieldClass =
    'mt-1.5 w-full rounded-xl border border-[#E2E8F0]/80 bg-white/90 px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25 transition-shadow';

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

export default function SalesAccount() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [mustChange, setMustChange] = useState(false);

    const [editingProfile, setEditingProfile] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileBusy, setProfileBusy] = useState(false);

    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passBusy, setPassBusy] = useState(false);

    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        apiGet('/api/sales/me')
            .then((data) => {
                const uName = data.user?.name || '';
                const uEmail = data.user?.email || '';
                const uAvatar = data.user?.avatarUrl || data.user?.avatar_url || '';
                const uMustChange = Boolean(data.user?.mustChangePassword);

                setName(uName);
                setProfileName(uName);
                setEmail(uEmail);
                setAvatarUrl(uAvatar);
                setMustChange(uMustChange);
                if (uMustChange) {
                    setShowPasswordForm(true);
                }
            })
            .catch((err: Error) => {
                const errMsg = err.message || 'Could not load account details';
                if (errMsg === 'Failed to fetch' || /unauthorized|invalid token|jwt|401/i.test(errMsg)) {
                    clearToken();
                    navigate('/', { replace: true });
                    return;
                }
                setError(errMsg);
            });
    }, [navigate]);

    const uploadAvatar = async (file: File) => {
        setAvatarBusy(true);
        setError('');
        setMsg('');
        try {
            const presign = await apiPost('/api/auth/avatar/presign', {
                contentType: file.type || 'image/jpeg'
            });
            const put = await fetch(presign.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'image/jpeg' },
                body: file
            });
            if (!put.ok) throw new Error('Upload to S3 storage failed');
            setAvatarUrl(presign.publicUrl);
            await apiPatch('/api/auth/profile', {
                name: name || 'Sales Agent',
                avatarUrl: presign.publicUrl
            });
            setMsg('Profile picture updated.');
        } catch (err: any) {
            setError(err.message || 'Upload failed');
        } finally {
            setAvatarBusy(false);
        }
    };

    const saveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileBusy(true);
        setError('');
        setMsg('');
        try {
            const data = await apiPatch('/api/auth/profile', {
                name: profileName,
                avatarUrl: avatarUrl || undefined
            });
            setName(data.user?.name || profileName);
            setAvatarUrl(data.user?.avatarUrl || avatarUrl);
            setMsg('Profile updated.');
            setEditingProfile(false);
        } catch (err: any) {
            setError(err.message || 'Could not update profile');
        } finally {
            setProfileBusy(false);
        }
    };

    const changePassword = async (e: FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        setPassBusy(true);
        setError('');
        setMsg('');
        try {
            await apiPatch('/api/sales/password', { currentPassword, newPassword });
            setMustChangePassword(false);
            setMustChange(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setShowPasswordForm(false);
            setMsg('Password updated successfully.');
        } catch (err: any) {
            setError(err.message || 'Could not update password');
        } finally {
            setPassBusy(false);
        }
    };

    const logout = () => {
        clearToken();
        navigate('/', { replace: true });
    };

    const initial = (name || email || 'U').charAt(0).toUpperCase();

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-500">
            {/* Temporary Password Mandatory Banner */}
            {mustChange && (
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 mb-6 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2.5">
                        <span className="bg-[#F59E0B] text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">
                            MANDATORY
                        </span>
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-950">
                            <Key className="w-4 h-4 text-amber-700 shrink-0" />
                            <span>
                                <strong>Change your temporary password.</strong> You signed in with a ZappSites invite password — please set a new one when you can.
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setShowPasswordForm(true);
                            document.getElementById('password-section')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors shrink-0 shadow-xs"
                    >
                        Change password
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="mb-8 flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center shrink-0 shadow-md">
                    <Settings className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">Settings</h1>
                    <p className="mt-1 text-sm text-[#64748B]">Manage your account profile and security.</p>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <p className="mb-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 shadow-xs">
                    {error}
                </p>
            )}
            {msg && (
                <p className="mb-6 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 shadow-xs">
                    {msg}
                </p>
            )}

            <div className="space-y-7">
                {/* Profile Card */}
                <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.2)] overflow-hidden">
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
                                    <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white flex items-center justify-center text-2xl font-black shadow-md shrink-0">
                                        {initial}
                                    </div>
                                )}
                                <div className="min-w-0 pt-1">
                                    <p className="text-sm font-bold text-[#0F172A]">Profile Picture</p>
                                    <label className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-bold text-[#0F172A] cursor-pointer hover:bg-[#F8FAFC] shadow-2xs">
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
                                                    setError('Maximum size is 5MB.');
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
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingProfile((v) => !v);
                                    setProfileName(name);
                                }}
                                className="mt-auto w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
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
                                    <div className="rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center gap-3 bg-white">
                                        <UserRound className="w-4 h-4 text-[#94A3B8] shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Name</p>
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{name || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center gap-3 bg-white">
                                        <Mail className="w-4 h-4 text-[#94A3B8] shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Email</p>
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{email || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[#E2E8F0] px-4 py-3 flex items-center gap-3 bg-white">
                                        <Phone className="w-4 h-4 text-[#94A3B8] shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Phone</p>
                                            <p className="text-sm font-bold text-[#0F172A] truncate">{phone || '—'}</p>
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
                                            value={profileName}
                                            onChange={(e) => setProfileName(e.target.value)}
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
                                    <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            disabled={profileBusy}
                                            className="px-5 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-[#1E293B] disabled:opacity-55"
                                        >
                                            {profileBusy ? 'Saving…' : 'Save profile'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingProfile(false)}
                                            className="px-5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </section>

                {/* Plan Card */}
                <SectionCard
                    icon={CreditCard}
                    title="Your plan"
                    subtitle="Features included with your ZappSites subscription."
                >
                    <p className="text-sm text-[#64748B]">
                        No active plan on this account. Contact ZappSites or upgrade to unlock local SEO and booking tools.
                    </p>
                </SectionCard>

                {/* Account Security Card */}
                <SectionCard
                    icon={Shield}
                    title="Account Security"
                    subtitle="Keep your sign-in credentials up to date."
                    id="password-section"
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
                                className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] shadow-2xs transition-colors"
                            >
                                <Key className="w-4 h-4" />
                                Update Password
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={changePassword} className="space-y-4 max-w-md">
                            <label className="block text-sm font-semibold text-[#334155]">
                                Current password
                                <input
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className={fieldClass}
                                    placeholder="Enter current password"
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
                                    placeholder="At least 8 characters"
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
                                    placeholder="Re-enter new password"
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
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPasswordForm(false);
                                        setCurrentPassword('');
                                        setNewPassword('');
                                        setConfirmPassword('');
                                    }}
                                    className="px-5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </SectionCard>

                {/* Workspace Business Card */}
                <SectionCard
                    icon={Building2}
                    title="Workspace business"
                    subtitle="Trading name and contact used for bookings and your workspace."
                >
                    <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-8 text-center">
                        <Building2 className="w-8 h-8 text-[#CBD5E1] mx-auto mb-3" />
                        <p className="text-sm font-semibold text-[#0F172A]">No workspace business yet</p>
                        <p className="text-xs text-[#64748B] mt-1 mb-4">Add trading details used across bookings.</p>
                        <button
                            type="button"
                            onClick={() => {}}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F59E0B] text-white text-sm font-bold hover:bg-[#D97706] transition-colors"
                        >
                            Add business details
                        </button>
                    </div>
                </SectionCard>

                {/* Listing Location Card */}
                <SectionCard
                    icon={MapPin}
                    title="Listing location"
                    subtitle="Connect your Google Business Profile for rankings, reviews, and listing tools."
                >
                    <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-center">
                        <MapPin className="w-7 h-7 text-[#CBD5E1] mx-auto mb-2" />
                        <p className="text-sm text-[#64748B]">
                            Connecting a Google listing needs the Local Presence plan (or higher). See your current plan above.
                        </p>
                    </div>
                </SectionCard>

                {/* Sign Out Card */}
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
        </div>
    );
}
