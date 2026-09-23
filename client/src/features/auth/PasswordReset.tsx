import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { apiPost } from '../../shared/utils';
import AuthShell, { AuthFieldWrap, authFieldClass } from './AuthShell';

type ForgotStep = 'email' | 'otp' | 'password' | 'done';

export function ForgotPassword() {
    const navigate = useNavigate();
    const [step, setStep] = useState<ForgotStep>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const sendCode = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/auth/forgot-password', { email: email.trim() });
            setStep('otp');
            setOtp('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/auth/verify-reset-otp', {
                email: email.trim(),
                otp: otp.trim()
            });
            setStep('password');
            setPassword('');
            setConfirm('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const savePassword = async (e: FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/auth/reset-password', {
                email: email.trim(),
                otp: otp.trim(),
                password
            });
            setStep('done');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const resendCode = async () => {
        setBusy(true);
        setError('');
        try {
            await apiPost('/api/auth/forgot-password', { email: email.trim() });
            setOtp('');
            setStep('otp');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const subtitle =
        step === 'email'
            ? 'Enter your account email and we will send a one-time code.'
            : step === 'otp'
              ? `Enter the 6-digit code we sent to ${email.trim() || 'your email'}.`
              : step === 'password'
                ? 'Choose a new password for your account. Minimum 8 characters.'
                : 'Your password has been updated.';

    return (
        <AuthShell title="Forgot password" subtitle={subtitle}>
            {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">
                    {error}
                </p>
            )}

            {step === 'email' && (
                <>
                    <form onSubmit={sendCode} className="space-y-4">
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
                            {busy ? 'Sending…' : 'Send code'}
                        </button>
                    </form>
                    <p className="text-sm text-[#6B7280] mt-6">
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1.5 font-semibold text-[#111827] hover:underline"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to sign in
                        </Link>
                    </p>
                </>
            )}

            {step === 'otp' && (
                <>
                    <form onSubmit={verifyCode} className="space-y-4">
                        <label className="block text-sm font-medium text-[#334155]">
                            One-time code
                            <AuthFieldWrap>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    required
                                    autoComplete="one-time-code"
                                    value={otp}
                                    onChange={(e) =>
                                        setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                                    }
                                    className={`${authFieldClass} tracking-[0.35em] font-semibold text-center text-lg`}
                                    placeholder="••••••"
                                />
                            </AuthFieldWrap>
                        </label>
                        <button
                            type="submit"
                            disabled={busy || otp.length !== 6}
                            className="w-full py-3 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                        >
                            {busy ? 'Checking…' : 'Verify code'}
                        </button>
                    </form>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                setError('');
                                setStep('email');
                            }}
                            className="inline-flex items-center gap-1.5 font-semibold text-[#111827] hover:underline disabled:opacity-55"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Change email
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={resendCode}
                            className="font-semibold text-[#2563EB] hover:underline disabled:opacity-55"
                        >
                            Resend code
                        </button>
                    </div>
                </>
            )}

            {step === 'password' && (
                <>
                    <form onSubmit={savePassword} className="space-y-4">
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
                    <p className="text-sm text-[#6B7280] mt-6">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                setError('');
                                setStep('otp');
                            }}
                            className="inline-flex items-center gap-1.5 font-semibold text-[#111827] hover:underline disabled:opacity-55"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to code
                        </button>
                    </p>
                </>
            )}

            {step === 'done' && (
                <div className="space-y-5">
                    <div className="flex gap-3 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                        <CheckCircle2
                            className="w-5 h-5 text-[#111827] shrink-0 mt-0.5"
                            strokeWidth={1.75}
                        />
                        <div>
                            <p className="text-sm font-medium text-[#111827]">Password updated</p>
                            <p className="text-sm text-[#6B7280] mt-1 leading-relaxed">
                                You can sign in with your new password now.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="w-full py-3 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B]"
                    >
                        Continue to sign in
                    </button>
                </div>
            )}
        </AuthShell>
    );
}

export function ResetPassword() {
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
            navigate('/login');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (!token) {
        return (
            <AuthShell
                title="Reset password"
                subtitle="Password resets now use a one-time code."
                showSecureFooter={false}
            >
                <div className="space-y-5">
                    <div className="flex gap-3 rounded-lg border border-red-100 bg-red-50 p-4">
                        <KeyRound className="w-5 h-5 text-red-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                        <p className="text-sm text-red-800">
                            Request a code from the forgot password page, then enter it there to
                            choose a new password.
                        </p>
                    </div>
                    <Link
                        to="/forgot-password"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] hover:underline"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Go to forgot password
                    </Link>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title="Choose a new password"
            subtitle="Enter a new password for your account. Minimum 8 characters."
        >
            <form onSubmit={submit} className="space-y-4">
                {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {error}
                    </p>
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
                <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 font-semibold text-[#2563EB] hover:underline"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                </Link>
            </p>
        </AuthShell>
    );
}
