import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Shield } from 'lucide-react';
import { adminGet, adminPatch } from '../../lib/adminApi';

export default function AdminSettings() {
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        adminGet('/api/admin/me')
            .then((data) => {
                setEmail(data.email || data.admin?.email || '');
            })
            .catch((err: Error) => setLoadError(err.message));
    }, []);

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

    return (
        <div className="max-w-xl space-y-5">
            {loadError && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{loadError}</p>
            )}

            <section className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0F172A] text-[#F59E0B] flex items-center justify-center">
                        <Shield className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="font-bold text-[#0F172A]">Admin account</h2>
                        <p className="text-xs text-[#64748B]">Sign-in details for this desk</p>
                    </div>
                </div>
                <div className="p-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-3 py-2">
                        <span className="text-[#64748B]">Email</span>
                        <span className="font-semibold text-[#0F172A] text-right break-all">{email || '—'}</span>
                    </div>
                    <p className="text-xs text-[#94A3B8] pt-1">
                        Email is locked for this admin account. You can change the password below.
                    </p>
                </div>
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FFF7ED] text-[#D97706] flex items-center justify-center">
                        <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="font-bold text-[#0F172A]">Change password</h2>
                        <p className="text-xs text-[#64748B]">At least 8 characters</p>
                    </div>
                </div>
                <form onSubmit={savePassword} className="p-5 space-y-4">
                    {error && (
                        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
                    )}
                    {msg && (
                        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            {msg}
                        </p>
                    )}
                    <label className="block">
                        <span className="text-xs font-bold text-[#64748B]">Current password</span>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-[#64748B]">New password</span>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={8}
                            className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-[#64748B]">Confirm new password</span>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full rounded-xl bg-[#0F172A] text-white py-2.5 text-sm font-bold disabled:opacity-50"
                    >
                        {busy ? 'Saving…' : 'Save new password'}
                    </button>
                </form>
            </section>
        </div>
    );
}
