import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, Globe2, Loader2, MapPinned, Search, Sparkles } from 'lucide-react';
import { pollFullAuditJob, startFullCrawl, fetchFullAudit } from './adminApi';
import { AUDIT_SERVICE_OPTIONS, resolveAuditService } from './auditServices';
import { cn } from '../../shared/utils';

const CRAWL_STEPS = [
    {
        id: 'gbp',
        label: 'Looking up Google Maps / GBP',
        detail: 'Finding the listing, photos, rating and NAP'
    },
    {
        id: 'crawl',
        label: 'Crawling the website',
        detail: 'Checking pages, phone, schema and technical signals'
    },
    {
        id: 'score',
        label: 'Scoring Local SEO · AEO · GEO',
        detail: 'Building the /100 score from measured checks'
    },
    {
        id: 'report',
        label: 'Writing the shareable report',
        detail: 'Summary, fixes and package suggestions'
    }
];

export default function AdminFullAuditNew() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        businessName: '',
        website: '',
        phone: '',
        email: '',
        address: '',
        city: 'Manchester',
        serviceId: '',
        serviceOther: '',
        contactName: '',
        operatorNotes: ''
    });
    const [busy, setBusy] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!busy) return undefined;
        const timer = setInterval(() => {
            setStepIndex((i) => {
                if (i < 1) return i;
                return i < CRAWL_STEPS.length - 1 ? i + 1 : i;
            });
        }, 20000);
        return () => clearInterval(timer);
    }, [busy]);

    const showOther = form.serviceId === 'other';
    const progressPct = Math.round(((stepIndex + 1) / CRAWL_STEPS.length) * 100);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        if (!form.serviceId) {
            setError('Select a service');
            return;
        }
        if (form.serviceId === 'other' && !form.serviceOther.trim()) {
            setError('Describe the service');
            return;
        }
        if (!form.businessName.trim() || !form.address.trim()) {
            setError('Business name and address are required');
            return;
        }

        const resolved = resolveAuditService({
            serviceId: form.serviceId,
            serviceOther: form.serviceOther,
            service: form.serviceOther
        });
        if (!resolved) {
            setError('Select a service');
            return;
        }

        setBusy(true);
        setStepIndex(0);
        setError('');
        setMessage('Looking up Maps / GBP, then crawling the website…');

        try {
            const res = await startFullCrawl({
                businessName: form.businessName.trim(),
                website: form.website.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                address: form.address.trim(),
                city: form.city.trim() || form.address.trim(),
                contactName: form.contactName.trim(),
                tradeId: resolved.tradeId,
                serviceId: resolved.serviceId,
                serviceLabel: resolved.serviceLabel,
                service: resolved.service,
                primaryService: resolved.serviceLabel,
                operatorNotes: form.operatorNotes.trim(),
                skipLighthouse: false
            });

            const auditIdOut = res.data?.auditId || res.data?.id;
            const jobId = res.data?.jobId;

            if (res.data?.status === 'complete' && auditIdOut) {
                navigate(`/admin/full-audits/${auditIdOut}`, { replace: true });
                return;
            }
            if (!jobId || !auditIdOut) {
                throw new Error('Full crawl did not return a job id');
            }

            setStepIndex(0);
            setMessage('Waiting for crawl worker…');
            const started = Date.now();
            let sawRunning = false;

            while (Date.now() - started < 15 * 60 * 1000) {
                await new Promise((r) => setTimeout(r, 4000));
                const job = await pollFullAuditJob(jobId);
                const st = job.data?.status;

                if (st === 'queued') {
                    setStepIndex(0);
                    const waitedSec = Math.round((Date.now() - started) / 1000);
                    setMessage(
                        waitedSec > 90
                            ? `Still queued after ${waitedSec}s — worker may be restarting. Keep this tab open…`
                            : 'Waiting for crawl worker (queued)…'
                    );
                }
                if (st === 'running') {
                    sawRunning = true;
                    setStepIndex((i) => Math.max(i, 1));
                    setMessage('Crawl status: running… (website + AI report can take several minutes)');
                }
                if (st === 'complete') {
                    setStepIndex(CRAWL_STEPS.length - 1);
                    navigate(`/admin/full-audits/${auditIdOut}`, { replace: true });
                    return;
                }
                if (st === 'failed') {
                    throw new Error(job.data?.error || 'Crawl job failed');
                }

                if (sawRunning || Date.now() - started > 60_000) {
                    try {
                        const auditRes = await fetchFullAudit(auditIdOut);
                        if (auditRes.data?.published) {
                            setStepIndex(CRAWL_STEPS.length - 1);
                            navigate(`/admin/full-audits/${auditIdOut}`, { replace: true });
                            return;
                        }
                    } catch {
                        // keep polling
                    }
                }
            }
            throw new Error('Crawl timed out after 15 minutes — open Full Audit list and check again');
        } catch (err: any) {
            setError(err.message || 'Full audit failed');
            setMessage('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4 max-w-3xl">
            <Link
                to="/admin/full-audits"
                className="inline-flex text-sm font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
                ← Back to Full Audit
            </Link>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-[#0F172A]">New full audit</h2>
                    <p className="text-sm text-[#64748B] mt-1">
                        Enter business details — we look up Google Maps / GBP, crawl the website, score Local SEO +
                        AEO + GEO, then open share + PDF actions.
                    </p>
                </div>

                {error ? (
                    <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                        {error}
                    </p>
                ) : null}

                {busy ? (
                    <div className="space-y-5" aria-live="polite">
                        <div className="flex gap-4 items-start">
                            <div className="w-12 h-12 rounded-xl bg-[#FFFBEB] text-[#F59E0B] flex items-center justify-center shrink-0">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-[#F59E0B] flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> Building full crawl report
                                </p>
                                <h3 className="text-base font-bold text-[#0F172A] mt-1">
                                    Please wait — this usually takes 3–8 minutes
                                </h3>
                                <p className="text-sm text-[#64748B] mt-1">{CRAWL_STEPS[stepIndex].detail}</p>
                                {message ? <p className="text-sm text-[#64748B] mt-1">{message}</p> : null}
                            </div>
                        </div>
                        <div
                            className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progressPct}
                        >
                            <div
                                className="h-full bg-[#F59E0B] transition-all duration-500"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                        <p className="text-xs font-semibold text-[#94A3B8]">
                            Step {stepIndex + 1} of {CRAWL_STEPS.length}
                        </p>
                        <ol className="space-y-2">
                            {CRAWL_STEPS.map((step, i) => {
                                const done = i < stepIndex;
                                const active = i === stepIndex;
                                const Icon = i === 0 ? MapPinned : i === 1 ? Globe2 : i === 2 ? Search : Sparkles;
                                return (
                                    <li
                                        key={step.id}
                                        className={cn(
                                            'flex gap-3 items-start rounded-xl px-3 py-2.5 border',
                                            done && 'border-emerald-200 bg-emerald-50/50',
                                            active && 'border-[#F59E0B]/40 bg-[#FFFBEB]',
                                            !done && !active && 'border-transparent bg-[#F8FAFC]'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                                                done && 'bg-emerald-500 text-white',
                                                active && 'bg-[#F59E0B] text-[#0F172A]',
                                                !done && !active && 'bg-white border border-[#E2E8F0] text-[#94A3B8]'
                                            )}
                                        >
                                            {done ? (
                                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                            ) : active ? (
                                                <Icon className="w-3.5 h-3.5" />
                                            ) : (
                                                <Circle className="w-3.5 h-3.5" strokeWidth={2} />
                                            )}
                                        </span>
                                        <span className="min-w-0">
                                            <strong className="block text-sm text-[#0F172A]">{step.label}</strong>
                                            <span className="text-xs text-[#64748B]">{step.detail}</span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                ) : (
                    <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={handleCreate}>
                        <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                            Business name *
                            <input
                                required
                                value={form.businessName}
                                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                            Address *
                            <input
                                required
                                placeholder="Street, town / area (used for Maps + NAP)"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A]">
                            City
                            <input
                                value={form.city}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A]">
                            Phone
                            <input
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A]">
                            Website
                            <input
                                placeholder="https:// (optional)"
                                value={form.website}
                                onChange={(e) => setForm({ ...form, website: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A]">
                            Email
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                            Service *
                            <select
                                required
                                value={form.serviceId}
                                onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal bg-white focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            >
                                <option value="">Select a service…</option>
                                {AUDIT_SERVICE_OPTIONS.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {showOther ? (
                            <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                                Describe the service *
                                <input
                                    required
                                    value={form.serviceOther}
                                    onChange={(e) => setForm({ ...form, serviceOther: e.target.value })}
                                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                />
                            </label>
                        ) : null}
                        <label className="block text-sm font-semibold text-[#0F172A]">
                            Contact name
                            <input
                                value={form.contactName}
                                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                            Operator notes
                            <textarea
                                rows={3}
                                value={form.operatorNotes}
                                onChange={(e) => setForm({ ...form, operatorNotes: e.target.value })}
                                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                            />
                        </label>
                        <div className="sm:col-span-2 pt-1">
                            <button
                                type="submit"
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#F59E0B] text-sm font-bold text-[#0F172A] hover:bg-[#FBBF24]"
                            >
                                Start full audit
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
