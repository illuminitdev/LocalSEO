import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, MapPin, Search, Shield } from 'lucide-react';
import { apiGet, apiPatch } from '../lib/utils';
import { clearToken } from '../lib/auth';
import GroundingModal from '../components/GroundingModal';

const fieldClass =
    'mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F172A]';

type OrgForm = {
    name: string;
    hostName: string;
    phone: string;
    email: string;
    tradeType: string;
    serviceArea: string;
};

export default function Account() {
    const navigate = useNavigate();
    const [loadError, setLoadError] = useState('');
    const [locationOpen, setLocationOpen] = useState(false);
    const [business, setBusiness] = useState<any>(null);

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

    const loadBusiness = () => {
        apiGet('/api/business').then(setBusiness).catch(() => setBusiness(null));
    };

    const loadAccount = () => {
        apiGet('/api/auth/me')
            .then((me) => {
                setDisplayName(me.user?.name || '');
                setEmail(me.user?.email || '');
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
            .catch((err: Error) => setLoadError(err.message || 'Could not load account'));
        loadBusiness();
    };

    useEffect(() => {
        loadAccount();
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
        } catch (err: any) {
            setPassErr(err.message);
        } finally {
            setPassBusy(false);
        }
    };

    const logout = () => {
        clearToken();
        navigate('/login', { replace: true });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Account settings</h1>
                <p className="mt-1 text-sm text-[#64748B]">
                    Manage your profile, business details, location, and password.
                </p>
            </div>

            {loadError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
            )}

            {/* Profile */}
            <section className="rounded-xl border border-[#E2E8F0] bg-white">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                    <h2 className="text-sm font-semibold text-[#0F172A]">Profile</h2>
                    <p className="text-xs text-[#64748B] mt-0.5">How you appear in this workspace.</p>
                </div>
                <form onSubmit={saveProfile} className="p-5 space-y-4">
                    {profileErr && <p className="text-sm text-red-700">{profileErr}</p>}
                    {profileMsg && <p className="text-sm text-emerald-700">{profileMsg}</p>}
                    <label className="block text-sm font-medium text-[#334155]">
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
                    <label className="block text-sm font-medium text-[#334155]">
                        Email
                        <input type="email" value={email} disabled className={`${fieldClass} bg-[#F8FAFC] text-[#64748B]`} />
                        <span className="mt-1 block text-xs text-[#94A3B8]">Email is used to sign in and cannot be changed here.</span>
                    </label>
                    <button
                        type="submit"
                        disabled={profileBusy}
                        className="px-4 py-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                    >
                        {profileBusy ? 'Saving…' : 'Save profile'}
                    </button>
                </form>
            </section>

            {/* Business */}
            <section className="rounded-xl border border-[#E2E8F0] bg-white">
                <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start gap-3">
                    <Building2 className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" strokeWidth={1.75} />
                    <div>
                        <h2 className="text-sm font-semibold text-[#0F172A]">Business</h2>
                        <p className="text-xs text-[#64748B] mt-0.5">Trading name, contact, and service area.</p>
                    </div>
                </div>
                <form onSubmit={saveBusiness} className="p-5 space-y-4">
                    {orgErr && <p className="text-sm text-red-700">{orgErr}</p>}
                    {orgMsg && <p className="text-sm text-emerald-700">{orgMsg}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block text-sm font-medium text-[#334155] sm:col-span-2">
                            Business name
                            <input
                                type="text"
                                value={org.name}
                                onChange={(e) => setOrg((o) => ({ ...o, name: e.target.value }))}
                                className={fieldClass}
                                placeholder="e.g. Miller Plumbing"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[#334155]">
                            Contact name
                            <input
                                type="text"
                                value={org.hostName}
                                onChange={(e) => setOrg((o) => ({ ...o, hostName: e.target.value }))}
                                className={fieldClass}
                                placeholder="Who customers speak to"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[#334155]">
                            Trade / category
                            <input
                                type="text"
                                value={org.tradeType}
                                onChange={(e) => setOrg((o) => ({ ...o, tradeType: e.target.value }))}
                                className={fieldClass}
                                placeholder="e.g. Plumber"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[#334155]">
                            Phone
                            <input
                                type="tel"
                                value={org.phone}
                                onChange={(e) => setOrg((o) => ({ ...o, phone: e.target.value }))}
                                className={fieldClass}
                                placeholder="Business phone"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[#334155]">
                            Business email
                            <input
                                type="email"
                                value={org.email}
                                onChange={(e) => setOrg((o) => ({ ...o, email: e.target.value }))}
                                className={fieldClass}
                                placeholder="hello@business.com"
                            />
                        </label>
                        <label className="block text-sm font-medium text-[#334155] sm:col-span-2">
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
                    <button
                        type="submit"
                        disabled={orgBusy}
                        className="px-4 py-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                    >
                        {orgBusy ? 'Saving…' : 'Save business'}
                    </button>
                </form>
            </section>

            {/* Location */}
            <section className="rounded-xl border border-[#E2E8F0] bg-white">
                <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" strokeWidth={1.75} />
                    <div>
                        <h2 className="text-sm font-semibold text-[#0F172A]">Location</h2>
                        <p className="text-xs text-[#64748B] mt-0.5">
                            Connect your Google Business Profile listing for local SEO tools.
                        </p>
                    </div>
                </div>
                <div className="p-5 space-y-4">
                    {business?.connected ? (
                        <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <p className="text-sm font-semibold text-[#0F172A]">{business.name || 'Connected location'}</p>
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
                    ) : (
                        <p className="text-sm text-[#64748B]">
                            No location connected yet. Add one to power rankings, reviews, and listing tools.
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => setLocationOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F59E0B] text-white text-sm font-semibold hover:bg-[#D97706]"
                    >
                        <Search className="w-4 h-4" />
                        {business?.connected ? 'Change location' : 'Add location'}
                    </button>
                </div>
            </section>

            {/* Password */}
            <section className="rounded-xl border border-[#E2E8F0] bg-white">
                <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start gap-3">
                    <Shield className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" strokeWidth={1.75} />
                    <div>
                        <h2 className="text-sm font-semibold text-[#0F172A]">Password</h2>
                        <p className="text-xs text-[#64748B] mt-0.5">Update the password you use to sign in.</p>
                    </div>
                </div>
                <form onSubmit={savePassword} className="p-5 space-y-4">
                    {passErr && <p className="text-sm text-red-700">{passErr}</p>}
                    {passMsg && <p className="text-sm text-emerald-700">{passMsg}</p>}
                    <label className="block text-sm font-medium text-[#334155]">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block text-sm font-medium text-[#334155]">
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
                        <label className="block text-sm font-medium text-[#334155]">
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
                    </div>
                    <button
                        type="submit"
                        disabled={passBusy}
                        className="px-4 py-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                    >
                        {passBusy ? 'Updating…' : 'Update password'}
                    </button>
                </form>
            </section>

            {/* Sign out */}
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-sm font-semibold text-[#0F172A]">Sign out</h2>
                    <p className="text-xs text-[#64748B] mt-0.5">End your session on this device.</p>
                </div>
                <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                    <LogOut className="w-4 h-4" strokeWidth={1.75} />
                    Log out
                </button>
            </section>

            <GroundingModal
                isOpen={locationOpen}
                onClose={() => {
                    setLocationOpen(false);
                    loadBusiness();
                }}
            />
        </div>
    );
}
