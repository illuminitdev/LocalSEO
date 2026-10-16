import { useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { apiGet, apiPost, cn } from '../../shared/utils';
import { useEntitlements, type ActiveSubscription } from '../../shared/EntitlementsContext';
import { useCredits } from '../../shared/CreditsContext';
import {
    CREDIT_FEATURE_LABELS,
    FEATURE_LABELS,
    PLAN_DESCRIPTIONS,
    PLAN_FEATURES,
    PLANS,
    formatPlanPrice,
    type CreditFeature
} from '../../shared/planCatalog';

type Invoice = {
    id: string;
    created: string;
    description: string;
    status: string;
    amount: number;
    currency: string;
    url: string | null;
    pdf: string | null;
};

const cardClass = 'rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)]';
const buttonClass =
    'shrink-0 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] shadow-sm hover:bg-[#F8FAFC] disabled:opacity-60';

function formatDate(value: string | null | undefined, month: 'short' | 'long' = 'short') {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month, year: 'numeric' });
}

function formatMoney(cents: number, currency: string) {
    try {
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(cents / 100);
    } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
    }
}

function StatusBadge({ status, cancelsOn }: { status: string; cancelsOn: string }) {
    const s = status.toLowerCase();
    const [label, tone] = cancelsOn
        ? [`Cancels ${cancelsOn}`, 'border-amber-200 bg-amber-50 text-amber-800']
        : s === 'past_due' || s === 'unpaid'
          ? ['Past due', 'border-red-200 bg-red-50 text-red-700']
          : s === 'trialing'
            ? ['Trial', 'border-sky-200 bg-sky-50 text-sky-700']
            : s === 'canceled' || s === 'expired'
              ? ['Ended', 'border-slate-200 bg-slate-50 text-slate-600']
              : ['Active', 'border-emerald-200 bg-emerald-50 text-emerald-700'];
    return (
        <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold', tone)}>
            {label}
        </span>
    );
}

function PlanCard({ sub, onAdjust }: { sub: ActiveSubscription; onAdjust: () => void }) {
    const periodEnd = formatDate(sub.currentPeriodEnd, 'long');
    const price = sub.priceLabel || formatPlanPrice(PLANS.find((p) => p.id === sub.planId) || null);
    return (
        <div className={cn(cardClass, 'flex flex-wrap items-center justify-between gap-4')}>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-lg font-black tracking-tight text-[#0F172A]">{sub.planName}</p>
                    <StatusBadge
                        status={sub.status || 'active'}
                        cancelsOn={sub.cancelAtPeriodEnd ? formatDate(sub.currentPeriodEnd) : ''}
                    />
                    {price && <span className="text-sm text-[#64748B]">{price}</span>}
                </div>
                {PLAN_DESCRIPTIONS[sub.planId] && (
                    <p className="mt-2 text-sm text-[#475569]">{PLAN_DESCRIPTIONS[sub.planId]}</p>
                )}
                {periodEnd && (
                    <p className="mt-1.5 text-sm text-[#475569]">
                        {sub.cancelAtPeriodEnd
                            ? `Your subscription will cancel on ${periodEnd}.`
                            : `Your plan renews on ${periodEnd}.`}
                    </p>
                )}
            </div>
            <button type="button" onClick={onAdjust} className={buttonClass}>
                Adjust plan
            </button>
        </div>
    );
}

function PlansModal({
    currentPlanIds,
    busyPlanId,
    error,
    onChoose,
    onClose
}: {
    currentPlanIds: string[];
    busyPlanId: string | null;
    error?: string;
    onChoose: (planId: string) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const anyBusy = Boolean(busyPlanId);

    return (
        <div
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#F8FAFC] p-5 sm:p-7 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-[#0F172A]">Choose your plan</h2>
                        <p className="text-sm text-[#64748B] mt-1">
                            Plan changes are handled securely by Stripe.
                        </p>
                        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        disabled={anyBusy}
                        className="rounded-lg p-1.5 text-[#64748B] hover:bg-white hover:text-[#0F172A] disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {PLANS.map((p) => {
                        const current = currentPlanIds.includes(p.id);
                        const features = PLAN_FEATURES[p.id] || [];
                        const opening = busyPlanId === p.id;
                        return (
                            <div
                                key={p.id}
                                className={cn(
                                    'flex flex-col rounded-2xl border bg-white p-5',
                                    current ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]' : 'border-[#E2E8F0]'
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-base font-bold text-[#0F172A]">{p.name}</p>
                                    {current && (
                                        <span className="shrink-0 rounded-md bg-[var(--brand-primary-soft,#FEF3C7)] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                                            Current plan
                                        </span>
                                    )}
                                </div>
                                <p className="mt-3">
                                    <span className="text-3xl font-black text-[#0F172A]">
                                        £{(p.priceCents / 100).toFixed(0)}
                                    </span>
                                    <span className="text-sm text-[#64748B]"> /mo.</span>
                                </p>
                                <p className="mt-3 text-sm text-[#475569] leading-relaxed">{PLAN_DESCRIPTIONS[p.id]}</p>
                                <ul className="mt-4 space-y-2 text-sm text-[#334155] flex-1">
                                    {features.length ? (
                                        features.map((f) => (
                                            <li key={f} className="flex items-start gap-2">
                                                <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--brand-primary)]" />
                                                {FEATURE_LABELS[f]}
                                            </li>
                                        ))
                                    ) : (
                                        <li className="flex items-start gap-2">
                                            <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--brand-primary)]" />
                                            Website hosting & maintenance
                                        </li>
                                    )}
                                </ul>
                                <button
                                    type="button"
                                    disabled={current || anyBusy}
                                    onClick={() => onChoose(p.id)}
                                    className={cn(
                                        'mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
                                        current
                                            ? 'border border-[#E2E8F0] bg-white text-[#94A3B8] cursor-default'
                                            : 'text-white shadow-sm hover:opacity-90',
                                        // Only the clicked plan fades; other plans stay solid while disabled.
                                        opening && 'opacity-60'
                                    )}
                                    style={current ? undefined : { background: 'var(--brand-primary, #F59E0B)' }}
                                >
                                    {current ? 'Your current plan' : opening ? 'Opening…' : 'Choose plan'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Account → Plan: current plan, payment, included credit usage and invoice history. */
export default function PlanPanel() {
    const {
        planId,
        planName,
        priceLabel,
        subscriptionStatus,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        activeSubscriptions,
        entitlementsDisabled
    } = useEntitlements();
    const { summary, hasPool } = useCredits();
    const [portalBusy, setPortalBusy] = useState(false);
    const [checkoutBusyPlanId, setCheckoutBusyPlanId] = useState<string | null>(null);
    const [portalErr, setPortalErr] = useState('');
    const [plansOpen, setPlansOpen] = useState(false);
    const [invoices, setInvoices] = useState<Invoice[] | null>(null);

    const subs: ActiveSubscription[] =
        activeSubscriptions.length > 0
            ? activeSubscriptions
            : planId
              ? [
                    {
                        id: planId,
                        planId,
                        planName: planName || planId,
                        priceCents: null,
                        currency: null,
                        priceLabel,
                        currentPeriodStart: null,
                        currentPeriodEnd,
                        cancelAtPeriodEnd,
                        status: subscriptionStatus || 'active'
                    }
                ]
              : [];

    useEffect(() => {
        if (entitlementsDisabled) return;
        apiGet('/api/auth/subscription/invoices')
            .then((data) => setInvoices(Array.isArray(data?.invoices) ? data.invoices : []))
            .catch(() => setInvoices([]));
    }, [entitlementsDisabled]);

    const openBillingPortal = async () => {
        setPortalBusy(true);
        setPortalErr('');
        try {
            const { url } = await apiPost('/api/auth/subscription/portal', {
                returnUrl: window.location.href
            });
            window.location.href = url;
        } catch (err: any) {
            setPortalErr(err?.message || 'Could not open billing portal');
            setPortalBusy(false);
        }
    };

    /** Same hosted Checkout as ZappSites pricing (plan left, card form right). */
    const openPlanCheckout = async (planId: string) => {
        setCheckoutBusyPlanId(planId);
        setPortalErr('');
        try {
            const { url } = await apiPost('/api/auth/subscription/checkout', {
                planId,
                returnUrl: window.location.href
            });
            window.location.href = url;
        } catch (err: any) {
            setPortalErr(err?.message || 'Could not open Stripe checkout');
            setCheckoutBusyPlanId(null);
        }
    };

    const usageRows = hasPool && summary ? summary.breakdown.filter((r) => r.credits > 0) : [];
    const pct = (n: number) => `${((n / Math.max(1, summary?.allowance || 1)) * 100).toFixed(1)}%`;

    return (
        <div className="space-y-5">
            {subs.length ? (
                subs.map((sub) => <PlanCard key={sub.id} sub={sub} onAdjust={() => setPlansOpen(true)} />)
            ) : (
                <div className={cn(cardClass, 'flex flex-wrap items-center justify-between gap-4')}>
                    <p className="text-sm text-[#64748B]">
                        No active plan on this account. Choose a plan to unlock local SEO and booking tools.
                    </p>
                    <button type="button" onClick={() => setPlansOpen(true)} className={buttonClass}>
                        View plans
                    </button>
                </div>
            )}

            {!entitlementsDisabled && (
                <div className={cn(cardClass, 'flex flex-wrap items-center justify-between gap-4')}>
                    <div className="min-w-0">
                        <p className="text-lg font-bold text-[#0F172A]">Payment</p>
                        <p className="text-sm text-[#475569] mt-1">Update your payment details</p>
                        {portalErr && <p className="text-xs text-red-600 mt-1.5">{portalErr}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={() => openBillingPortal()}
                        disabled={portalBusy || Boolean(checkoutBusyPlanId)}
                        className={buttonClass}
                    >
                        {portalBusy ? 'Opening…' : 'Manage in Stripe'}
                    </button>
                </div>
            )}

            {hasPool && summary && (
                <div className={cardClass}>
                    <p className="text-lg font-bold text-[#0F172A]">Included Usage</p>
                    {summary.periodStart && summary.periodEnd && (
                        <p className="text-sm text-[#64748B] mt-1">
                            {formatDate(summary.periodStart)} - {formatDate(summary.periodEnd)}
                        </p>
                    )}
                    <table className="mt-5 w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#E2E8F0] text-left text-[#475569]">
                                <th className="py-2.5 pr-3 font-semibold">Item</th>
                                <th className="py-2.5 pr-3 font-semibold">Credits</th>
                                <th className="py-2.5 font-semibold text-right">Usage</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1F5F9]">
                            <tr className="font-bold text-[#0F172A]">
                                <td className="py-3 pr-3">All credits</td>
                                <td className="py-3 pr-3 tabular-nums">
                                    {summary.used.toLocaleString()} of {summary.allowance.toLocaleString()}
                                </td>
                                <td className="py-3 text-right tabular-nums">{pct(summary.used)}</td>
                            </tr>
                            {usageRows.map((row) => (
                                <tr key={row.feature} className="text-[#334155]">
                                    <td className="py-3 pr-3 pl-4">
                                        {CREDIT_FEATURE_LABELS[row.feature as CreditFeature] || row.feature}
                                    </td>
                                    <td className="py-3 pr-3 tabular-nums">{row.credits.toLocaleString()}</td>
                                    <td className="py-3 text-right tabular-nums">{pct(row.credits)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!usageRows.length && (
                        <p className="mt-3 text-sm text-[#64748B]">No credits used yet this period.</p>
                    )}
                </div>
            )}

            {!entitlementsDisabled && (
                <div className={cardClass}>
                    <p className="text-lg font-bold text-[#0F172A]">Invoices</p>
                    {invoices === null ? (
                        <p className="mt-4 text-sm text-[#64748B]">Loading invoices…</p>
                    ) : invoices.length === 0 ? (
                        <p className="mt-4 text-sm text-[#64748B]">No invoices yet.</p>
                    ) : (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[560px] text-sm">
                                <thead>
                                    <tr className="border-b border-[#E2E8F0] text-left text-[#475569]">
                                        <th className="py-2.5 pr-3 font-semibold">Date</th>
                                        <th className="py-2.5 pr-3 font-semibold">Description</th>
                                        <th className="py-2.5 pr-3 font-semibold">Status</th>
                                        <th className="py-2.5 pr-3 font-semibold text-right">Amount</th>
                                        <th className="py-2.5 font-semibold text-right">Invoice</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F1F5F9]">
                                    {invoices.map((inv) => {
                                        const unpaid = inv.status === 'open' || inv.status === 'uncollectible';
                                        return (
                                            <tr key={inv.id} className="text-[#334155]">
                                                <td className="py-3 pr-3 whitespace-nowrap">{formatDate(inv.created)}</td>
                                                <td className="py-3 pr-3">{inv.description}</td>
                                                <td
                                                    className={cn(
                                                        'py-3 pr-3 capitalize',
                                                        unpaid ? 'text-red-600 font-medium' : 'text-[#334155]'
                                                    )}
                                                >
                                                    {unpaid ? 'Unpaid' : inv.status}
                                                </td>
                                                <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                                                    {formatMoney(inv.amount, inv.currency)}
                                                </td>
                                                <td className="py-3 text-right">
                                                    {inv.url || inv.pdf ? (
                                                        <a
                                                            href={(inv.url || inv.pdf) as string}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className={cn(
                                                                'inline-flex items-center gap-1.5 font-medium hover:underline',
                                                                unpaid ? 'text-red-600' : 'text-[#0F172A]'
                                                            )}
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                            {unpaid ? 'Pay' : 'View'}
                                                        </a>
                                                    ) : (
                                                        <span className="text-[#94A3B8]">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {plansOpen && (
                <PlansModal
                    currentPlanIds={subs.map((s) => s.planId)}
                    busyPlanId={checkoutBusyPlanId}
                    error={portalErr}
                    onChoose={openPlanCheckout}
                    onClose={() => {
                        if (checkoutBusyPlanId) return;
                        setPlansOpen(false);
                        setPortalErr('');
                    }}
                />
            )}
        </div>
    );
}
