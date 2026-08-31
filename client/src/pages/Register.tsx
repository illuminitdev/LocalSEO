import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost } from '../lib/utils';
import { setToken } from '../lib/auth';
import AuthShell, { authFieldClass } from '../components/AuthShell';

export default function Register() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const data = await apiPost('/api/auth/register', form);
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
        <AuthShell title="Create account" subtitle="Name, email, and password. You can add business details after you sign in.">
            <form onSubmit={submit} className="space-y-4">
                {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
                )}
                <label className="block text-sm font-medium text-[#374151]">
                    Your name
                    <input
                        type="text"
                        required
                        autoComplete="name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className={authFieldClass}
                        placeholder="e.g. Dave Miller"
                    />
                </label>
                <label className="block text-sm font-medium text-[#374151]">
                    Email
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        className={authFieldClass}
                        placeholder="you@business.com"
                    />
                </label>
                <label className="block text-sm font-medium text-[#374151]">
                    Password
                    <input
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        className={authFieldClass}
                        placeholder="At least 8 characters"
                    />
                </label>
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 rounded bg-[#111827] text-white text-sm font-semibold hover:bg-[#1F2937] disabled:opacity-55"
                >
                    {busy ? 'Creating…' : 'Create account'}
                </button>
            </form>
            <p className="text-sm text-[#6B7280] mt-6">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-[#111827] hover:underline">
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
