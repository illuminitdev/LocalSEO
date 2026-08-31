import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/utils';
import { setToken } from '../lib/auth';

export default function Register() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        email: '',
        password: '',
        name: '',
        businessName: '',
        tradeType: '',
        phone: '',
        serviceArea: ''
    });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const data = await apiPost('/api/auth/register', form);
            setToken(data.token);
            navigate('/booking');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
            <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-2xl border border-[#E2E8F0] p-8 space-y-3 shadow-sm">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">LocalPulse</p>
                    <h1 className="text-2xl font-black text-[#0F172A] mt-1">Create host account</h1>
                    <p className="text-sm text-[#64748B] mt-1">Set up your Calendly-style booking page.</p>
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                {[
                    ['email', 'Email', 'email'],
                    ['password', 'Password (8+ chars)', 'password'],
                    ['name', 'Your name', 'text'],
                    ['businessName', 'Business name', 'text'],
                    ['tradeType', 'Trade / service type', 'text'],
                    ['phone', 'Phone', 'tel'],
                    ['serviceArea', 'Service area', 'text']
                ].map(([key, label, type]) => (
                    <label key={key} className="block text-xs font-bold text-[#64748B]">
                        {label}
                        <input
                            type={type}
                            required={key !== 'phone' && key !== 'serviceArea'}
                            value={(form as any)[key]}
                            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
                        />
                    </label>
                ))}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-[#F59E0B] text-white font-bold text-sm disabled:opacity-60">
                    {busy ? 'Creating…' : 'Create account'}
                </button>
                <p className="text-sm text-center text-[#64748B]">
                    Already have an account? <Link to="/login" className="font-bold text-[#0F172A]">Sign in</Link>
                </p>
            </form>
        </div>
    );
}
