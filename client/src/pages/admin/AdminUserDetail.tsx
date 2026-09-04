import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CreditCard, ShieldCheck } from 'lucide-react';
import { adminGet, adminPatch } from '../../lib/adminApi';
import { FEATURE_LABELS, PLANS, type FeatureKey } from '../../lib/planCatalog';
import { cn } from '../../lib/utils';

type ServiceModule = { id: string; name: string; enrolled: boolean };

type AdminUser = {
    kind: 'user' | 'invite';
    userId: string | null;
    email: string;
    name: string;
    mustChangePassword?: boolean;
    organization: {
        id: string;
        name: string;
        slug: string;
        tradeType: string;
    } | null;
    subscription: {
        planId: string;
        planName: string;
        status: string;
        priceLabel: string | null;
        periodEnd?: string | null;
        daysLeft?: number | null;
        paidAt?: string | null;
        autopayEnabled?: boolean;
    } | null;
    invite: {
        id: string;
        claimedAt: string | null;
        credentialsEmailedAt: string | null;
    } | null;
    invoices: { count: number; totalLabel: string };
    features: FeatureKey[];
    services?: ServiceModule[];
};

function fmtDate(value?: string | null) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return '—';
    }
}

export default function AdminUserDetail() {
    const { kind, id } = useParams<{ kind: string; id: string }>();
    const [user, setUser] = useState<AdminUser | null>(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const load = () => {
        if (!kind || !id) return;
        const path =
            kind === 'invite' ? `/api/admin/users/invite/${id}` : `/api/admin/users/user/${id}`;
        setError('');
        adminGet(path)
            .then((data) => setUser(data.user))
            .catch((err: Error) => setError(err.message));
    };

    useEffect(() => {
        load();
    }, [kind, id]);

    const assignPlan = async (planId: string) => {
        if (!user?.organization?.id) return;
        setBusy(true);
        setMsg('');
        setError('');
        try {
            await adminPatch(`/api/admin/organizations/${user.organization.id}/subscription`, {
                planId: planId || null
            });
            setMsg('Plan updated.');
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const toggleAutopay = async (enabled: boolean) => {
        if (!user?.organization?.id) return;
        setBusy(true);
        setMsg('');
        setError('');
        try {
            await adminPatch(`/api/admin/organizations/${user.organization.id}/subscription`, {
                autopayEnabled: enabled
            });
            setMsg(enabled ? 'Autopay turned on.' : 'Autopay turned off.');
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (error && !user) {
        return (
            <div className="max-w-3xl space-y-4">
                <Link to="/admin/users" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                    <ArrowLeft className="w-4 h-4" /> Back to customers
                </Link>
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
            </div>
        );
    }

    if (!user) {
        return <p className="text-sm text-[#64748B]">Loading customer…</p>;
    }

    const autopayOn = user.subscription ? user.subscription.autopayEnabled !== false : null;
    const onServices = (user.services || []).filter((s) => s.enrolled);
    const offServices = (user.services || []).filter((s) => !s.enrolled);

    return (
        <div className="max-w-4xl space-y-5 pb-8">
            <Link
                to="/admin/users"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
                <ArrowLeft className="w-4 h-4" /> Back to customers
            </Link>

            {error && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
            )}
            {msg && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    {msg}
                </p>
            )}

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#F59E0B]">Customer</p>
                    <h2 className="text-2xl font-bold mt-1">{user.name || 'Customer'}</h2>
                    <p className="text-sm text-white/70 mt-1">{user.email}</p>
                    {user.organization && (
                        <p className="text-xs text-white/50 mt-2">
                            {user.organization.name}
                            {user.organization.tradeType ? ` · ${user.organization.tradeType}` : ''}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-4">
                        {user.kind === 'invite' && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-amber-400/20 text-amber-100 border border-amber-300/30">
                                Not logged in yet
                            </span>
                        )}
                        {user.subscription?.status === 'active' && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                                Plan active
                            </span>
                        )}
                        {autopayOn === true && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-sky-400/20 text-sky-100">
                                Autopay on
                            </span>
                        )}
                        {autopayOn === false && (
                            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-white/10 text-white/80">
                                Autopay off
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <div className="flex items-center gap-2 text-[#64748B]">
                                <CreditCard className="w-4 h-4 text-[#F59E0B]" />
                                <span className="text-[11px] font-bold uppercase">Plan</span>
                            </div>
                            <p className="text-lg font-bold mt-2">{user.subscription?.planName || 'None'}</p>
                            <p className="text-sm text-[#64748B] mt-1">{user.subscription?.priceLabel || '—'}</p>
                        </div>
                        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <div className="flex items-center gap-2 text-[#64748B]">
                                <CalendarClock className="w-4 h-4 text-[#F59E0B]" />
                                <span className="text-[11px] font-bold uppercase">When it ends</span>
                            </div>
                            <p className="text-lg font-bold mt-2">{fmtDate(user.subscription?.periodEnd)}</p>
                            <p className="text-sm text-[#64748B] mt-1">
                                Paid {fmtDate(user.subscription?.paidAt)}
                                {user.subscription?.daysLeft != null && user.subscription.daysLeft >= 0
                                    ? ` · ${user.subscription.daysLeft}d left`
                                    : ''}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <div className="flex items-center gap-2 text-[#64748B]">
                                <ShieldCheck className="w-4 h-4 text-[#F59E0B]" />
                                <span className="text-[11px] font-bold uppercase">Autopay</span>
                            </div>
                            <p className="text-lg font-bold mt-2">
                                {user.subscription ? (autopayOn ? 'On' : 'Off') : '—'}
                            </p>
                            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                                {user.subscription
                                    ? autopayOn
                                        ? 'Charges each month and keeps tools on.'
                                        : 'No more charges. Tools stop on the end date.'
                                    : 'Assign a plan first.'}
                            </p>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-[#0F172A]">Portal tools</h3>
                            <span className="text-xs text-[#64748B]">
                                {onServices.length} on · {offServices.length} off
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(user.services || []).map((s) => (
                                <div
                                    key={s.id}
                                    className={cn(
                                        'rounded-xl border px-3 py-2.5 text-sm flex justify-between',
                                        s.enrolled
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                                            : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]'
                                    )}
                                >
                                    <span className="font-medium">{s.name}</span>
                                    <span className="text-[10px] font-bold uppercase">{s.enrolled ? 'On' : 'Off'}</span>
                                </div>
                            ))}
                            {!user.services?.length &&
                                user.features.map((f) => (
                                    <div
                                        key={f}
                                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm"
                                    >
                                        {FEATURE_LABELS[f]}
                                    </div>
                                ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-[#E2E8F0] p-4">
                            <h3 className="text-xs font-bold uppercase text-[#94A3B8]">Login</h3>
                            <p className="mt-2 font-semibold">
                                {user.kind === 'invite'
                                    ? 'Waiting for first login'
                                    : user.invite?.claimedAt
                                      ? 'Has logged in'
                                      : 'Registered'}
                            </p>
                            {user.mustChangePassword && (
                                <p className="text-xs text-amber-800 mt-1">Must change temp password</p>
                            )}
                        </div>
                        <div className="rounded-2xl border border-[#E2E8F0] p-4">
                            <h3 className="text-xs font-bold uppercase text-[#94A3B8]">Booking invoices</h3>
                            <p className="mt-2 text-lg font-bold">{user.invoices.totalLabel}</p>
                            <p className="text-xs text-[#64748B] mt-1">{user.invoices.count} invoices</p>
                        </div>
                    </div>

                    {user.organization ? (
                        <form
                            className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3"
                            onSubmit={(e: FormEvent) => e.preventDefault()}
                        >
                            <h3 className="font-bold text-[#0F172A]">Manage this customer</h3>
                            <label className="block">
                                <span className="text-[11px] font-bold uppercase text-[#64748B]">Change plan</span>
                                <select
                                    disabled={busy}
                                    value={user.subscription?.planId || ''}
                                    onChange={(e) => assignPlan(e.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm"
                                >
                                    <option value="">Remove plan</option>
                                    {PLANS.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {user.subscription && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => toggleAutopay(!autopayOn)}
                                    className={cn(
                                        'w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50',
                                        autopayOn
                                            ? 'bg-white border border-[#E2E8F0] text-[#0F172A]'
                                            : 'bg-[#0F172A] text-white'
                                    )}
                                >
                                    {busy ? 'Saving…' : autopayOn ? 'Turn autopay off' : 'Turn autopay on'}
                                </button>
                            )}
                        </form>
                    ) : (
                        <p className="text-sm text-[#64748B] rounded-xl border border-dashed border-[#E2E8F0] px-4 py-3">
                            Customer must log in once before you can change plan or autopay here.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
