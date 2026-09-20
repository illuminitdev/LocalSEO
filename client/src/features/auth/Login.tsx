import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { API_BASE, apiPost } from '../../shared/utils';
import { resolveMarketingUrl } from '../../shared/apiConfig';
import { clearToken, setMustChangePassword, setPlatformRole, setToken } from './auth';
import { clearAdminToken, setAdminToken } from '../../admin/adminApi';
import { useEntitlements } from '../../shared/EntitlementsContext';
import AuthShell from './AuthShell';



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



const fieldWrap =
    'mt-1.5 flex items-center gap-3 rounded-[11px] border border-[#E2E8F0] bg-white px-3.5 transition-colors focus-within:border-[#FF6A00] focus-within:ring-1 focus-within:ring-[#FF6A00]/25';
const fieldInput =
    'flex-1 min-w-0 bg-transparent text-[13.5px] text-[#101828] placeholder:text-[#94A3B8] focus:outline-none py-[13px]';



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
                setPlatformRole(data.user?.platformRole || 'customer');
                const isSales = data.user?.platformRole === 'sales_agent';
                if (!isSales) {
                    await refresh();
                }
                const next = params.get('next');
                if (isSales) {
                    const salesNext =
                        next && next.startsWith('/sales') ? next : '/sales';
                    navigate(salesNext, { replace: true });
                    return;
                }
                const safeNext =
                    next &&
                        next.startsWith('/') &&
                        next !== '/' &&
                        next !== '/login' &&
                        !next.startsWith('/admin') &&
                        !next.startsWith('/sales')
                        ? next
                        : '/dashboard';
                navigate(safeNext, { replace: true });
                return;
            } catch (customerErr: any) {
                const msg = String(customerErr?.message || '');
                if (/required/i.test(msg)) throw customerErr;
            }

            try {
                const adminData = await tryAdminLogin(payload.email, payload.password);
                clearToken();
                setMustChangePassword(false);
                setAdminToken(adminData.token);
                const next = params.get('next');
                navigate(next && next.startsWith('/admin') ? next : '/admin', { replace: true });
                return;
            } catch {
                throw new Error('Invalid email or password.');
            }
        } catch (err: any) {
            setError(err.message || 'Invalid email or password.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthShell title="Welcome back" subtitle="Sign in to your ZappSites account.">
            <form onSubmit={submit} className="space-y-5" autoComplete="on">
                {error && (
                    <p className="text-[13px] rounded-[10px] px-3.5 py-2.5" style={{ color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA' }}>
                        {error}
                    </p>
                )}

                {}
                <div>
                    <label className="block text-[13px] font-medium" style={{ color: '#344054' }}>
                        Email
                    </label>
                    <div className={fieldWrap}>
                        <Mail className="w-[18px] h-[18px] shrink-0" style={{ color: '#94A3B8' }} strokeWidth={1.75} />
                        <input
                            name="email"
                            type="email"
                            required
                            autoComplete="username"
                            defaultValue=""
                            className={fieldInput}
                            placeholder="you@business.com"
                        />
                    </div>
                </div>

                {}
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-[13px] font-medium" style={{ color: '#344054' }}>Password</label>
                        <Link
                            to="/forgot-password"
                            className="text-[12px] font-semibold hover:underline"
                            style={{ color: '#FF6A00' }}
                        >
                            Forgot password?
                        </Link>
                    </div>
                    <div className={fieldWrap}>
                        <Lock className="w-[18px] h-[18px] shrink-0" style={{ color: '#94A3B8' }} strokeWidth={1.75} />
                        <input
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            defaultValue=""
                            className={fieldInput}
                            placeholder="Your password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="shrink-0 p-0.5 transition-colors"
                            style={{ color: '#94A3B8' }}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword ? (
                                <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} />
                            ) : (
                                <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />
                            )}
                        </button>
                    </div>
                </div>

                {}
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold text-white disabled:opacity-50 transition-colors mt-2"
                    style={{
                        background: busy ? '#FF6A00' : '#FF6A00',
                        height: 48,
                    }}
                    onMouseEnter={(e) => { if (!busy) (e.currentTarget.style.background = '#E55D00'); }}
                    onMouseLeave={(e) => { (e.currentTarget.style.background = '#FF6A00'); }}
                >
                    {busy ? 'Signing in...' : 'Sign in'}
                    {!busy && <ArrowRight className="w-4 h-4" strokeWidth={2.25} />}
                </button>
            </form>

            {}
            <div className="flex items-center gap-4 mt-6">
                <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
                <p className="text-[13px] text-center" style={{ color: '#64748B' }}>
                    Need a plan?{' '}
                    <a
                        href={resolveMarketingUrl()}
                        className="font-semibold hover:underline"
                        style={{ color: '#FF6A00' }}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Get started
                    </a>
                </p>
                <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
            </div>
        </AuthShell>
    );
}
