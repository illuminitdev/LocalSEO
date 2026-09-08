import { useEffect, useState } from 'react';
import { Wallet, Download } from 'lucide-react';
import { apiGet, formatCents } from '../../shared/utils';
import { getToken } from '../auth/auth';

export default function MoneyDashboard() {
    const [summary, setSummary] = useState<any>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [error, setError] = useState('');

    const load = async () => {
        try {
            const q = new URLSearchParams();
            if (from) q.set('from', from);
            if (to) q.set('to', to);
            const res = await apiGet(`/api/host/money?${q.toString()}`);
            setSummary(res.summary);
        } catch (e: any) {
            setError(e.message);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const downloadCsv = () => {
        const base = import.meta.env.VITE_API_BASE || '';
        const token = getToken();
        window.open(`${base}/api/host/money/expenses.csv?token=${encodeURIComponent(token || '')}`, '_blank');
        // Prefer fetch blob if auth header needed
        fetch(`${base}/api/host/money/expenses.csv`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
            .then((r) => r.blob())
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'expenses.csv';
                a.click();
                URL.revokeObjectURL(url);
            })
            .catch(() => setError('CSV download failed'));
    };

    return (
        <div className="w-full space-y-4 max-w-4xl">
            <div className="bg-[#0F172A] rounded-2xl text-white px-4 py-4 lg:px-6 flex flex-col sm:flex-row sm:justify-between gap-3">
                <div>
                    <p className="text-xs text-white/50 uppercase tracking-widest">Booking Plots</p>
                    <h1 className="font-black text-xl flex items-center gap-2">
                        <Wallet className="w-5 h-5" /> Jobs & money
                    </h1>
                    <p className="text-sm text-white/60 mt-1">Deposits, invoices, and expenses</p>
                </div>
                <button
                    type="button"
                    onClick={downloadCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] text-[#0F172A] px-4 py-2 text-sm font-bold h-fit"
                >
                    <Download className="w-3.5 h-3.5" /> Export expenses CSV
                </button>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <div className="flex flex-wrap gap-2 items-end">
                <label className="text-xs font-bold text-[#64748B]">
                    From
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-bold text-[#64748B]">
                    To
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
                </label>
                <button type="button" onClick={load} className="rounded-xl bg-[#0F172A] text-white px-4 py-2 text-sm font-bold">
                    Apply
                </button>
            </div>
            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                        ['Deposits paid', summary.depositsPaid],
                        ['Booked total', summary.bookedTotal],
                        ['Invoices paid', summary.invoicesPaid],
                        ['Open balance', summary.openBalance],
                        ['Expenses', summary.expenses]
                    ].map(([label, cents]) => (
                        <div key={String(label)} className="bg-white border border-[#E2E8F0] rounded-2xl p-4">
                            <p className="text-xs font-bold uppercase text-[#64748B]">{label}</p>
                            <p className="text-xl font-black text-[#0F172A] mt-1">{formatCents(Number(cents) || 0)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
