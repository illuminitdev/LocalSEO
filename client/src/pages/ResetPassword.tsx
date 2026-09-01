import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { apiPost } from '../lib/utils';
import AuthShell, { AuthFieldWrap, authFieldClass } from '../components/AuthShell';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/auth/reset-password', { token, password });
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (!token) {
        return (
            <AuthShell title="Reset password" subtitle="This link is missing a reset token." showSecureFooter={false}>
                <div className="space-y-5">
                    <div className="flex gap-3 rounded-lg border border-red-100 bg-red-50 p-4">
                        <KeyRound className="w-5 h-5 text-red-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                        <p className="text-sm text-red-800">
                            Open the link from your email, or request a new reset from the forgot password page.
                        </p>
                    </div>
                    <Link to="/forgot-password" className="inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] hover:underline">
                        <ArrowLeft className="w-4 h-4" />
                        Request a new link
                    </Link>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell title="Choose a new password" subtitle="Enter a new password for your account. Minimum 8 characters.">
            <form onSubmit={submit} className="space-y-4">
                {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
                <label className="block text-sm font-medium text-[#334155]">
                    New password
                    <AuthFieldWrap>
                        <input
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={authFieldClass}
                            placeholder="At least 8 characters"
                        />
                    </AuthFieldWrap>
                </label>
                <label className="block text-sm font-medium text-[#334155]">
                    Confirm password
                    <AuthFieldWrap>
                        <input
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={authFieldClass}
                            placeholder="Repeat password"
                        />
                    </AuthFieldWrap>
                </label>
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                >
                    {busy ? 'Saving…' : 'Update password'}
                </button>
            </form>
            <p className="text-sm text-[#64748B] mt-6 text-center">
                <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-[#2563EB] hover:underline">
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                </Link>
            </p>
        </AuthShell>
    );
}
