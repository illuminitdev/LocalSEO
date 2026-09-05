import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { API_BASE, apiPost } from '../lib/utils';
import { clearToken, setMustChangePassword, setToken } from '../lib/auth';
import { clearAdminToken, setAdminToken } from '../lib/adminAuth';
import { useEntitlements } from '../context/EntitlementsContext';
import AuthShell, { AuthFieldWrap, authFieldClass } from '../components/AuthShell';

async function tryAdminLogin(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password.');
    }
    return data;
}

export default function Login() {
    const navigate = useNavigate();
    const { refresh } = useEntitlements();
    const [params] = useSearchParams();
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setBusy(true);
        setError('');

        const form = e.currentTarget;
        const emailEl = form.elements.namedItem('email') as HTMLInputElement | null;
        const passwordEl = form.elements.namedItem('password') as HTMLInputElement | null;
        const trimmedEmail = String(emailEl?.value || '').trim().toLowerCase();
        const pwd = String(passwordEl?.value || '');

        if (!trimmedEmail || !pwd) {
            setError('Email and password are required.');
            setBusy(false);
            return;
        }

        const payload = { email: trimmedEmail, password: pwd };

        try {
            try {
                const data = await apiPost('/api/auth/login', payload);
                clearAdminToken();
                setToken(data.token);
                const mustChange = Boolean(data.user?.mustChangePassword);
                setMustChangePassword(mustChange);
                await refresh();
                const next = params.get('next');
                const safeNext =
                    next &&
                    next.startsWith('/') &&
                    next !== '/' &&
                    next !== '/login' &&
                    !next.startsWith('/admin')
                        ? next
                        : '/dashboard';
                navigate(safeNext, { replace: true });
                return;
            } catch (customerErr: any) {
                const msg = String(customerErr?.message || '');
                // Don't try admin if body never arrived / validation failed
                if (/required/i.test(msg)) throw customerErr;
            }

            const adminData = await tryAdminLogin(payload.email, payload.password);
            clearToken();
            setMustChangePassword(false);
            setAdminToken(adminData.token);
            const next = params.get('next');
            navigate(next && next.startsWith('/admin') ? next : '/admin', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Invalid email or password.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthShell title="Welcome back" subtitle="Sign in to your account.">
            {/* Uncontrolled inputs — browser autofill writes DOM values React controlled state often misses */}
            <form onSubmit={submit} className="space-y-4" autoComplete="on">
                {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}
                <label className="block text-sm font-medium text-[#334155]">
                    Email
                    <AuthFieldWrap>
                        <input
                            name="email"
                            type="email"
                            required
                            autoComplete="username"
                            defaultValue=""
                            className={authFieldClass}
                            placeholder="you@business.com"
                        />
                    </AuthFieldWrap>
                </label>
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium text-[#334155]">Password</label>
                        <Link
                            to="/forgot-password"
                            className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] hover:underline"
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <AuthFieldWrap>
                        <div className="relative mt-1.5">
                            <input
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                autoComplete="current-password"
                                defaultValue=""
                                className={`${authFieldClass} mt-0 pr-11`}
                                placeholder="Your password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] p-0.5"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                                ) : (
                                    <Eye className="w-4 h-4" strokeWidth={1.75} />
                                )}
                            </button>
                        </div>
                    </AuthFieldWrap>
                </div>
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-55"
                >
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
            <p className="text-sm text-[#64748B] mt-6 text-center leading-relaxed">
                Need a plan?{' '}
                <a
                    href="https://www.zappsites.com/"
                    className="font-semibold text-[#0F172A] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                >
                    Get started on zappsites.com
                </a>
            </p>
        </AuthShell>
    );
}
