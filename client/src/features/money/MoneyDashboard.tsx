import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Calendar,
    Coins,
    CreditCard,
    Download,
    FileText,
    TrendingUp
} from 'lucide-react';
import { apiGet, cn, formatCents } from '../../shared/utils';
import { getToken } from '../auth/auth';

type PresetRange = '7D' | '30D' | '3M' | '1Y' | 'All';

type TransactionRow = {
    id: string;
    date: string;
    type: 'deposit' | 'invoice' | 'expense';
    clientJob: string;
    amountCents: number;
    status: 'paid' | 'open' | 'none';
};

function formatDateLabel(dateStr: string) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = d.getDate();
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    } catch {
        return dateStr;
    }
}

export default function MoneyDashboard() {
    const [summary, setSummary] = useState<any>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [activePreset, setActivePreset] = useState<PresetRange>('30D');
    const [error, setError] = useState('');
    const [transactions, setTransactions] = useState<TransactionRow[]>([]);

    const applyPreset = (preset: PresetRange) => {
        setActivePreset(preset);
        const now = new Date();
        const endStr = now.toISOString().slice(0, 10);

        if (preset === '7D') {
            const start = new Date(now);
            start.setDate(start.getDate() - 7);
            setFrom(start.toISOString().slice(0, 10));
            setTo(endStr);
        } else if (preset === '30D') {
            const start = new Date(now);
            start.setDate(start.getDate() - 30);
            setFrom(start.toISOString().slice(0, 10));
            setTo(endStr);
        } else if (preset === '3M') {
            const start = new Date(now);
            start.setMonth(start.getMonth() - 3);
            setFrom(start.toISOString().slice(0, 10));
            setTo(endStr);
        } else if (preset === '1Y') {
            const start = new Date(now);
            start.setFullYear(start.getFullYear() - 1);
            setFrom(start.toISOString().slice(0, 10));
            setTo(endStr);
        } else {
            setFrom('');
            setTo('');
        }
    };

    const load = async (fromDate = from, toDate = to) => {
        setError('');
        try {
            const q = new URLSearchParams();
            if (fromDate) q.set('from', fromDate);
            if (toDate) q.set('to', toDate);

            const [moneyRes, dashRes] = await Promise.all([
                apiGet(`/api/host/money?${q.toString()}`).catch(() => ({ summary: null })),
                apiGet('/api/host/dashboard').catch(() => ({ bookings: [] }))
            ]);

            setSummary(moneyRes.summary);

            const bookings = dashRes.bookings || [];
            const txList: TransactionRow[] = [];
            bookings.forEach((b: any, idx: number) => {
                const date = b.start_at ? b.start_at.slice(0, 10) : '';
                const name = b.customer_name || 'Booking';

                if (b.deposit_cents) {
                    txList.push({
                        id: `tx-dep-${b.id || idx}`,
                        date,
                        type: 'deposit',
                        clientJob: name,
                        amountCents: Number(b.deposit_cents),
                        status: b.deposit_paid ? 'paid' : 'open'
                    });
                }

                if (b.invoice_amount_cents || b.total_cents) {
                    txList.push({
                        id: `tx-inv-${b.id || idx}`,
                        date,
                        type: 'invoice',
                        clientJob: name,
                        amountCents: Number(b.invoice_amount_cents || b.total_cents),
                        status: b.invoice_status === 'paid' ? 'paid' : 'open'
                    });
                }
            });
            setTransactions(txList);
        } catch (e: any) {
            setError(e.message || 'Could not load money metrics');
            setTransactions([]);
        }
    };

    useEffect(() => {
        applyPreset('30D');
        load();
    }, []);

    const downloadCsv = () => {
        const base = import.meta.env.VITE_API_BASE || '';
        const token = getToken();
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

    // Card totals (dynamic from summary or computed from transactions)
    const cardMetrics = useMemo(() => {
        const depositsPaid = summary?.depositsPaid ?? 0;
        const bookedTotal = summary?.bookedTotal ?? 0;
        const invoicesPaid = summary?.invoicesPaid ?? 0;
        const openBalance = summary?.openBalance ?? 0;
        const expenses = summary?.expenses ?? 0;

        return {
            depositsPaidFormatted: formatCents(depositsPaid),
            bookedTotalFormatted: formatCents(bookedTotal),
            invoicesPaidFormatted: formatCents(invoicesPaid),
            openBalanceFormatted: formatCents(openBalance),
            expensesFormatted: formatCents(expenses)
        };
    }, [summary]);

    // Chart intervals from real transactions only
    const chartBars = useMemo(() => {
        if (!transactions.length) {
            return [
                { label: '—', deposits: 0, invoices: 0, expenses: 0 }
            ];
        }
        const byWeek = new Map<string, { deposits: number; invoices: number; expenses: number }>();
        for (const tx of transactions) {
            if (!tx.date) continue;
            const d = new Date(`${tx.date}T12:00:00`);
            if (Number.isNaN(d.getTime())) continue;
            const label = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
            const row = byWeek.get(label) || { deposits: 0, invoices: 0, expenses: 0 };
            const pounds = (Number(tx.amountCents) || 0) / 100;
            if (tx.type === 'deposit') row.deposits += pounds;
            else if (tx.type === 'invoice') row.invoices += pounds;
            else if (tx.type === 'expense') row.expenses += pounds;
            byWeek.set(label, row);
        }
        return Array.from(byWeek.entries()).map(([label, v]) => ({ label, ...v }));
    }, [transactions]);

    return (
        <div className="w-full space-y-5">
            {/* 1. Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900">
                        Jobs & money
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Deposits, invoices, and expenses
                    </p>
                </div>

                <button
                    type="button"
                    onClick={downloadCsv}
                    className="inline-flex items-center gap-1.5 bg-[#FF8800] hover:bg-[#E67A00] active:bg-[#CC6D00] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition shrink-0"
                >
                    <Download className="w-4 h-4" /> Export expenses CSV
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
                    {error}
                </div>
            )}

            {/* 2. Date Range Filter Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/60 p-1">
                {/* Left: From / To Inputs + Apply */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* From Date */}
                    <div className="relative">
                        <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-semibold text-slate-400 z-10">
                            From
                        </span>
                        <div className="relative flex items-center">
                            <input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                            />
                        </div>
                    </div>

                    {/* To Date */}
                    <div className="relative">
                        <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-semibold text-slate-400 z-10">
                            To
                        </span>
                        <div className="relative flex items-center">
                            <input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                            />
                        </div>
                    </div>

                    {/* Apply Button */}
                    <button
                        type="button"
                        onClick={() => load(from, to)}
                        className="bg-[#FF8800] hover:bg-[#E67A00] active:bg-[#CC6D00] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition"
                    >
                        Apply
                    </button>
                </div>

                {/* Right: Preset Range Buttons (7D, 30D, 3M, 1Y, All) */}
                <div className="inline-flex items-center bg-white border border-slate-200/90 rounded-2xl p-1 shadow-2xs">
                    {(['7D', '30D', '3M', '1Y', 'All'] as PresetRange[]).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => {
                                applyPreset(preset);
                                load();
                            }}
                            className={cn(
                                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition select-none',
                                activePreset === preset
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            )}
                        >
                            {preset}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. 5 KPI Metric Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Card 1: Deposits paid */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                        <CreditCard className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-500 truncate">Deposits paid</p>
                        <p className="text-[17px] sm:text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">
                            {cardMetrics.depositsPaidFormatted}
                        </p>
                    </div>
                </div>

                {/* Card 2: Booked total */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                        <Calendar className="w-4.5 h-4.5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-500 truncate">Booked total</p>
                        <p className="text-[17px] sm:text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">
                            {cardMetrics.bookedTotalFormatted}
                        </p>
                    </div>
                </div>

                {/* Card 3: Invoices paid */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                        <FileText className="w-4.5 h-4.5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-500 truncate">Invoices paid</p>
                        <p className="text-[17px] sm:text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">
                            {cardMetrics.invoicesPaidFormatted}
                        </p>
                    </div>
                </div>

                {/* Card 4: Open balance */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <Coins className="w-4.5 h-4.5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-500 truncate">Open balance</p>
                        <p className="text-[17px] sm:text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">
                            {cardMetrics.openBalanceFormatted}
                        </p>
                    </div>
                </div>

                {/* Card 5: Expenses */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0 col-span-2 sm:col-span-1">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                        <TrendingUp className="w-4.5 h-4.5 text-rose-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-500 truncate">Expenses</p>
                        <p className="text-[17px] sm:text-lg font-bold text-slate-900 leading-tight tracking-tight truncate">
                            {cardMetrics.expensesFormatted}
                        </p>
                    </div>
                </div>
            </div>

            {/* 4. Bottom Two-Column Split: Recent Transactions & Monthly Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Card: Recent transactions */}
                <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-base text-slate-900">Recent transactions</h2>
                        <Link
                            to="/booking"
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition"
                        >
                            View all →
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                <tr>
                                    <th className="py-2.5 px-3">Date</th>
                                    <th className="py-2.5 px-3">Type</th>
                                    <th className="py-2.5 px-3">Client / Job</th>
                                    <th className="py-2.5 px-3">Amount</th>
                                    <th className="py-2.5 px-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {transactions.map((tx) => {
                                    const formattedDate = formatDateLabel(tx.date);
                                    const amountFormatted = formatCents(tx.amountCents);

                                    return (
                                        <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                                            {/* Date */}
                                            <td className="py-3 px-3 text-slate-800 font-medium whitespace-nowrap">
                                                {formattedDate}
                                            </td>

                                            {/* Type */}
                                            <td className="py-3 px-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={cn(
                                                            'w-2 h-2 rounded-full',
                                                            tx.type === 'deposit'
                                                                ? 'bg-emerald-500'
                                                                : tx.type === 'invoice'
                                                                  ? 'bg-blue-500'
                                                                  : 'bg-orange-500'
                                                        )}
                                                    />
                                                    <span className="font-bold text-slate-900 capitalize">
                                                        {tx.type}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Client / Job */}
                                            <td className="py-3 px-3 text-slate-700 font-medium truncate max-w-[140px]">
                                                {tx.clientJob}
                                            </td>

                                            {/* Amount */}
                                            <td className="py-3 px-3 font-bold text-slate-900">
                                                {amountFormatted}
                                            </td>

                                            {/* Status */}
                                            <td className="py-3 px-3">
                                                {tx.status === 'paid' ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Paid
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 font-bold">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Card: Monthly Overview Chart */}
                <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h2 className="font-bold text-base text-slate-900">Monthly overview</h2>

                        {/* Legend */}
                        <div className="flex items-center gap-3 text-xs font-semibold">
                            <span className="inline-flex items-center gap-1 text-slate-700">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Deposits
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-700">
                                <span className="w-2 h-2 rounded-full bg-blue-500" /> Invoices
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-700">
                                <span className="w-2 h-2 rounded-full bg-orange-500" /> Expenses
                            </span>
                        </div>
                    </div>

                    {/* Bar Chart Area */}
                    <div className="pt-2">
                        <div className="relative h-60 w-full flex">
                            {/* Y-Axis Labels */}
                            <div className="flex flex-col justify-between text-[11px] font-semibold text-slate-400 pr-3 select-none pb-6 text-right w-12">
                                <span>£200</span>
                                <span>£150</span>
                                <span>£100</span>
                                <span>£50</span>
                                <span>£0</span>
                            </div>

                            {/* Chart Grid Lines and Bars */}
                            <div className="relative flex-1 h-full flex flex-col justify-between">
                                {/* Horizontal Grid Lines */}
                                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                                    <div className="border-b border-slate-100 w-full" />
                                    <div className="border-b border-slate-100 w-full" />
                                    <div className="border-b border-slate-100 w-full" />
                                    <div className="border-b border-slate-100 w-full" />
                                    <div className="border-b border-slate-200 w-full" />
                                </div>

                                {/* Bars Container */}
                                <div className="relative h-full flex items-end justify-between px-4 sm:px-8 pb-6 z-10">
                                    {chartBars.map((bar, i) => {
                                        const maxVal = 200;
                                        const depHeight = `${Math.min(100, (bar.deposits / maxVal) * 100)}%`;
                                        const invHeight = `${Math.min(100, (bar.invoices / maxVal) * 100)}%`;
                                        const expHeight = `${Math.min(100, (bar.expenses / maxVal) * 100)}%`;

                                        return (
                                            <div
                                                key={i}
                                                className="flex flex-col items-center h-full justify-end group relative"
                                            >
                                                {/* Tooltip on Hover */}
                                                {(bar.deposits > 0 || bar.invoices > 0 || bar.expenses > 0) && (
                                                    <div className="absolute -top-8 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded-lg opacity-0 group-hover:opacity-100 transition shadow-lg pointer-events-none z-20 whitespace-nowrap">
                                                        {bar.deposits > 0 && `Deposits: £${bar.deposits} `}
                                                        {bar.invoices > 0 && `Invoices: £${bar.invoices}`}
                                                    </div>
                                                )}

                                                {/* Bar Group */}
                                                <div className="flex items-end gap-1 h-full pb-0.5">
                                                    {bar.deposits > 0 && (
                                                        <div
                                                            style={{ height: depHeight }}
                                                            className="w-3 sm:w-3.5 bg-emerald-500 rounded-t-sm transition-all duration-300"
                                                        />
                                                    )}
                                                    {bar.invoices > 0 && (
                                                        <div
                                                            style={{ height: invHeight }}
                                                            className="w-3 sm:w-3.5 bg-blue-500 rounded-t-sm transition-all duration-300"
                                                        />
                                                    )}
                                                    {bar.expenses > 0 && (
                                                        <div
                                                            style={{ height: expHeight }}
                                                            className="w-3 sm:w-3.5 bg-orange-500 rounded-t-sm transition-all duration-300"
                                                        />
                                                    )}
                                                </div>

                                                {/* X Axis Label */}
                                                <span className="absolute -bottom-5 text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                                                    {bar.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
