import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPatch } from '../../shared/utils';
import { setMustChangePassword } from '../auth/auth';

export default function SalesAccount() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        apiGet('/api/sales/me')
            .then((data) => {
                setName(data.user?.name || '');
                setEmail(data.user?.email || '');
            })
            .catch((err: Error) => setError(err.message));
    }, []);

    const changePassword = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        setMsg('');
        try {
            await apiPatch('/api/sales/password', { currentPassword, newPassword });
            setMustChangePassword(false);
            setCurrentPassword('');
            setNewPassword('');
            setMsg('Password updated.');
        } catch (err: any) {
            setError(err.message || 'Could not update password');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-xl space-y-4">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-3">
                <h2 className="text-sm font-black text-[#0F172A]">Profile</h2>
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Name</p>
                    <p className="text-sm font-semibold text-[#0F172A] mt-0.5">{name || '—'}</p>
                </div>
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Email</p>
                    <p className="text-sm font-semibold text-[#0F172A] mt-0.5">{email || '—'}</p>
                </div>
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">Role</p>
                    <p className="text-sm font-semibold text-[#0F172A] mt-0.5">Sales Agent</p>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>
            )}
            {msg && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                    {msg}
                </p>
            )}

            <form onSubmit={changePassword} className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 space-y-3">
                <h2 className="text-sm font-black text-[#0F172A]">Change password</h2>
                <label className="block text-xs font-semibold text-[#475569]">
                    Current password
                    <input
                        required
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                    />
                </label>
                <label className="block text-xs font-semibold text-[#475569]">
                    New password
                    <input
                        required
                        type="password"
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/25 focus:border-[#F59E0B]"
                    />
                </label>
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[#0F172A] text-white px-3 py-2 text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-50"
                >
                    {busy ? 'Saving…' : 'Update password'}
                </button>
            </form>
        </div>
    );
}
