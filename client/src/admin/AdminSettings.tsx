import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
    Camera,
    Eye,
    EyeOff,
    KeyRound,
    Mail,
    Shield,
    Trash2,
    Upload
} from 'lucide-react';
import { adminGet, adminPatch, adminPost } from './adminApi';
import { cn } from '../shared/utils';

function PasswordField({
    id,
    label,
    value,
    onChange,
    required,
    minLength,
    autoComplete
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
    minLength?: number;
    autoComplete?: string;
}) {
    const [show, setShow] = useState(false);
    return (
        <label className="block" htmlFor={id}>
            <span className="text-xs font-bold text-[#64748B]">{label}</span>
            <div className="relative mt-1.5">
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    minLength={minLength}
                    autoComplete={autoComplete}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 pr-11 text-sm text-[#0F172A] outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20 transition"
                />
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#E2E8F0]/60 transition-colors"
                    aria-label={show ? 'Hide password' : 'Show password'}
                >
                    {show ? (
                        <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    ) : (
                        <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    )}
                </button>
            </div>
        </label>
    );
}

export default function AdminSettings() {
    const fileRef = useRef<HTMLInputElement>(null);
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [profileMsg, setProfileMsg] = useState('');
    const [profileErr, setProfileErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState('');

    const notifyAvatar = (url: string) => {
        window.dispatchEvent(new CustomEvent('admin-avatar-updated', { detail: { avatarUrl: url } }));
    };

    useEffect(() => {
        adminGet('/api/admin/me')
            .then((data) => {
                setEmail(data.email || data.admin?.email || '');
                setAvatarUrl(data.avatarUrl || '');
            })
            .catch((err: Error) => setLoadError(err.message));
    }, []);

    const uploadAvatar = async (file: File) => {
        setAvatarBusy(true);
        setProfileErr('');
        setProfileMsg('');
        try {
            if (file.size > 5 * 1024 * 1024) {
                throw new Error('Maximum size is 5MB.');
            }
            const presign = await adminPost('/api/admin/settings/avatar/presign', {
                contentType: file.type || 'image/jpeg'
            });
            const put = await fetch(presign.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'image/jpeg' },
                body: file
            });
            if (!put.ok) throw new Error('Upload to storage failed');
            await adminPatch('/api/admin/settings/avatar', { avatarUrl: presign.publicUrl });
            setAvatarUrl(presign.publicUrl);
            notifyAvatar(presign.publicUrl);
            setProfileMsg('Profile photo updated.');
        } catch (err: any) {
            setProfileErr(err.message || 'Upload failed (set MEDIA_BUCKET for S3)');
        } finally {
            setAvatarBusy(false);
        }
    };

    const clearAvatar = async () => {
        setAvatarBusy(true);
        setProfileErr('');
        setProfileMsg('');
        try {
            await adminPatch('/api/admin/settings/avatar', { avatarUrl: '' });
            setAvatarUrl('');
            notifyAvatar('');
            setProfileMsg('Profile photo removed.');
        } catch (err: any) {
            setProfileErr(err.message || 'Could not remove photo');
        } finally {
            setAvatarBusy(false);
        }
    };

    const savePassword = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setMsg('');
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            const data = await adminPatch('/api/admin/settings/password', {
                currentPassword,
                newPassword
            });
            setMsg(data.message || 'Password updated.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const initial = (email || 'A').charAt(0).toUpperCase();

    return (
        <div className="max-w-3xl space-y-5">
            {loadError && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    {loadError}
                </p>
            )}

            {/* Profile card */}
            <section className="relative rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
                <div className="h-28 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155] relative px-5 sm:px-6">
                    <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-[#F59E0B]/25 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-8 w-28 h-28 rounded-full bg-white/5 blur-2xl pointer-events-none" />
                    <div className="relative z-10 h-full flex items-start pt-5 sm:pl-[7.5rem]">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-bold text-white">Admin account</h2>
                                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[#FFF7ED] text-[#D97706] border border-[#FDE68A]">
                                    <Shield className="w-3 h-3" />
                                    Desk access
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-white/75 flex items-center gap-1.5 min-w-0">
                                <Mail className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                <span className="truncate">{email || '—'}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative px-5 sm:px-6 pb-5 -mt-12">
                    <div className="relative shrink-0 self-start w-fit">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt="Admin profile"
                                className="h-24 w-24 rounded-2xl object-cover border-[3px] border-white shadow-lg bg-white"
                            />
                        ) : (
                            <div className="h-24 w-24 rounded-2xl bg-[#F59E0B] text-[#0F172A] flex items-center justify-center text-3xl font-black border-[3px] border-white shadow-lg">
                                {initial}
                            </div>
                        )}
                        <label
                            className={cn(
                                'absolute -bottom-1.5 -right-1.5 h-9 w-9 rounded-xl bg-[#0F172A] text-white',
                                'flex items-center justify-center cursor-pointer shadow-md border-2 border-white',
                                'hover:bg-[#1E293B] transition-colors',
                                avatarBusy && 'opacity-60 pointer-events-none'
                            )}
                            title="Upload photo"
                        >
                            <Camera className="w-4 h-4" strokeWidth={2.25} />
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                disabled={avatarBusy}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    await uploadAvatar(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>

                    <p className="mt-3 text-xs text-[#94A3B8]">
                        JPG, PNG, WebP or GIF · max 5MB · stored in S3
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={avatarBusy}
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {avatarBusy ? 'Uploading…' : 'Upload photo'}
                        </button>
                        {avatarUrl && (
                            <button
                                type="button"
                                disabled={avatarBusy}
                                onClick={clearAvatar}
                                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                            </button>
                        )}
                    </div>

                    {profileErr && (
                        <p className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            {profileErr}
                        </p>
                    )}
                    {profileMsg && (
                        <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            {profileMsg}
                        </p>
                    )}
                </div>

                <div className="px-5 sm:px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] text-sm">
                    <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Sign-in email</p>
                        <p className="mt-1 font-semibold text-[#0F172A] break-all">{email || '—'}</p>
                    </div>
                </div>
            </section>

            {/* Password card */}
            <section className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FFF7ED] text-[#D97706] flex items-center justify-center border border-[#FDE68A]">
                        <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="font-bold text-[#0F172A]">Change password</h2>
                        <p className="text-xs text-[#64748B]">At least 8 characters · use the eye to show/hide</p>
                    </div>
                </div>
                <form onSubmit={savePassword} className="p-5 sm:p-6 space-y-4">
                    {error && (
                        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
                    )}
                    {msg && (
                        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            {msg}
                        </p>
                    )}
                    <PasswordField
                        id="admin-current-password"
                        label="Current password"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        required
                        autoComplete="current-password"
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                        <PasswordField
                            id="admin-new-password"
                            label="New password"
                            value={newPassword}
                            onChange={setNewPassword}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                        <PasswordField
                            id="admin-confirm-password"
                            label="Confirm new password"
                            value={confirmPassword}
                            onChange={setConfirmPassword}
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full sm:w-auto rounded-xl bg-[#0F172A] text-white px-6 py-2.5 text-sm font-bold hover:bg-[#1E293B] transition-colors disabled:opacity-50"
                    >
                        {busy ? 'Saving…' : 'Save new password'}
                    </button>
                </form>
            </section>
        </div>
    );
}
