import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost } from '../lib/utils';
import { setToken } from '../lib/auth';
import AuthShell, { authFieldClass } from '../components/AuthShell';

export default function Login() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const data = await apiPost('/api/auth/login', { email, password });
            setToken(data.token);
            const next = params.get('next');
            navigate(next && next.startsWith('/') ? next : '/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthShell title="Sign in" subtitle="Use the email and password for your Local SEO workspace.">
            <form onSubmit={submit} className="space-y-4">
                {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
                )}
                <label className="block text-sm font-medium text-[#374151]">
                    Email
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={authFieldClass}
                        placeholder="you@business.com"
                    />
                </label>
                <div>
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium text-[#374151]">Password</label>
                        <Link to="/forgot-password" className="text-xs font-medium text-[#6B7280] hover:text-[#111827]">
                            Forgot password?
                        </Link>
                    </div>
                    <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={authFieldClass}
                        placeholder="Your password"
                    />
                </div>
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 rounded bg-[#111827] text-white text-sm font-semibold hover:bg-[#1F2937] disabled:opacity-55"
                >
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
            <p className="text-sm text-[#6B7280] mt-6">
                New here?{' '}
                <Link to="/register" className="font-semibold text-[#111827] hover:underline">
                    Create an account
                </Link>
            </p>
        </AuthShell>
    );
}
