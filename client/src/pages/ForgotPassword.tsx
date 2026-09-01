import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { apiPost } from '../lib/utils';
import AuthShell, { AuthFieldWrap, authFieldClass } from '../components/AuthShell';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/auth/forgot-password', { email });
            setDone(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthShell
            title="Forgot password"
            subtitle="Enter your account email and we will send a reset link if it exists."
        >
            {done ? (
                <div className="space-y-5">
                    <div className="flex gap-3 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                        <Mail className="w-5 h-5 text-[#111827] shrink-0 mt-0.5" strokeWidth={1.75} />
                        <div>
                            <p className="text-sm font-medium text-[#111827]">Check your email</p>
                            <p className="text-sm text-[#6B7280] mt-1 leading-relaxed">
                                If an account exists for that address, we sent password reset instructions.
                                The link expires in one hour.
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#111827] hover:underline"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to sign in
                    </Link>
                </div>
            ) : (
                <>
                    <form onSubmit={submit} className="space-y-4">
                        {error && (
                            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
                        )}
                        <label className="block text-sm font-medium text-[#334155]">
                            Email
                            <AuthFieldWrap>
                                <input
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={authFieldClass}
                                    placeholder="you@business.com"
                                />
                            </AuthFieldWrap>
                        </label>
                        <button
                            type="submit"
                            disabled={busy}
                            className="w-full py-3 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                        >
                            {busy ? 'Sending…' : 'Send reset link'}
                        </button>
                    </form>
                    <p className="text-sm text-[#6B7280] mt-6">
                        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-[#111827] hover:underline">
                            <ArrowLeft className="w-4 h-4" />
                            Back to sign in
                        </Link>
                    </p>
                </>
            )}
        </AuthShell>
    );
}
