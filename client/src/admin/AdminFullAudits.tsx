import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Check,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Circle,
    ClipboardCheck,
    Copy,
    ExternalLink,
    Globe2,
    Loader2,
    MapPinned,
    Plus,
    RefreshCw,
    Search,
    Share2,
    Trash2,
    Wand2,
    X
} from 'lucide-react';
import {
    deleteFullAudit,
    fetchFullAudit,
    fetchFullAudits,
    fetchSalesAgents,
    pollFullAuditJob,
    shareFullAuditEmail,
    startFullCrawl,
    type FullAuditListItem,
    type SalesAgent
} from './adminApi';
import { AUDIT_SERVICE_OPTIONS, resolveAuditService } from './auditServices';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { resolveAuditReportUrl } from '../shared/apiConfig';
import { cn } from '../shared/utils';

const PAGE_SIZE = 10;

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

const EMPTY_FORM = {
    businessName: '',
    website: '',
    emailOrPhone: '',
    address: '',
    city: 'Manchester',
    serviceId: '',
    serviceOther: '',
    contactName: '',
    operatorNotes: ''
};

/** Split a combined contact value into email and/or phone for the API. */
function splitEmailOrPhone(raw: string): { email: string; phone: string } {
    const value = String(raw || '').trim();
    if (!value) return { email: '', phone: '' };
    if (value.includes('@')) {
        return { email: value, phone: '' };
    }
    return { email: '', phone: value };
}

function isValidEmailOrPhone(raw: string): boolean {
    const value = String(raw || '').trim();
    if (!value) return false;
    if (value.includes('@')) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    // At least 7 digits after stripping formatting
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7;
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function auditToLeadRef(a: FullAuditListItem): GrowthAuditLeadRef {
    const report = resolveAuditReportUrl(a.shareUrl || a.reportUrl || a.id) || null;
    return {
        id: a.id,
        createdAt: a.createdAt,
        businessName: a.businessName || null,
        city: a.city || null,
        website: a.website || null,
        email: a.email || null,
        phone: a.phone || null,
        scoreTotal: a.totalScore ?? null,
        sharePath: report ? `/audit-report/${a.id}` : null,
        reportUrl: report
    };
}

export default function AdminFullAudits() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [audits, setAudits] = useState<FullAuditListItem[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busyId, setBusyId] = useState('');
    const [busyAction, setBusyAction] = useState<'share' | 'delete' | ''>('');
    const [page, setPage] = useState(1);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [createMessage, setCreateMessage] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        Promise.all([fetchFullAudits(), fetchSalesAgents().catch(() => [] as SalesAgent[])])
            .then(([list, agents]) => {
                setAudits(list);
                setSalesAgents(agents);
                setPage(1);
            })
            .catch((err: Error) => {
                setAudits([]);
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Support old /admin/full-audits/new → redirect with ?new=1
    useEffect(() => {
        if (searchParams.get('new') === '1') {
            setShowForm(true);
            const next = new URLSearchParams(searchParams);
            next.delete('new');
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!creating) return undefined;
        const timer = setInterval(() => {
            setStepIndex((i) => {
                if (i < 1) return i;
                return i < CRAWL_STEPS.length - 1 ? i + 1 : i;
            });
        }, 20000);
        return () => clearInterval(timer);
    }, [creating]);

    const totalPages = Math.max(1, Math.ceil(audits.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageAudits = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return audits.slice(start, start + PAGE_SIZE);
    }, [audits, safePage]);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

    const rangeStart = audits.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(safePage * PAGE_SIZE, audits.length);
    const showOther = form.serviceId === 'other';
    const progressPct = Math.round(((stepIndex + 1) / CRAWL_STEPS.length) * 100);

    const openNewForm = () => {
        setShowForm(true);
        setError('');
        setMessage('');
        setCreateMessage('');
    };

    const closeForm = () => {
        if (creating) return;
        setShowForm(false);
        setForm(EMPTY_FORM);
        setCreateMessage('');
        setStepIndex(0);
    };

    const finishAndOpenReport = async (auditId: string) => {
        let reportUrl = '';
        try {
            const auditRes = await fetchFullAudit(auditId);
            const data = auditRes.data || {};
            reportUrl = resolveAuditReportUrl(
                String(data.shareUrl || data.reportUrl || auditId).trim()
            );
        } catch {
            /* fall through */
        }
        if (reportUrl) {
            window.open(reportUrl, '_blank', 'noopener,noreferrer');
        }
        setForm(EMPTY_FORM);
        setShowForm(false);
        setCreateMessage('');
        setStepIndex(0);
        setMessage('Full audit ready — report opened in a new tab.');
        load();
    };

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
        if (!isValidEmailOrPhone(form.emailOrPhone)) {
            setError('Email or phone is required (enter a valid email or phone number)');
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

        const { email, phone } = splitEmailOrPhone(form.emailOrPhone);

        setCreating(true);
        setStepIndex(0);
        setError('');
        setMessage('');
        setCreateMessage('Looking up Maps / GBP, then crawling the website…');

        try {
            const res = await startFullCrawl({
                businessName: form.businessName.trim(),
                website: form.website.trim(),
                phone,
                email,
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
                await finishAndOpenReport(auditIdOut);
                return;
            }
            if (!jobId || !auditIdOut) {
                throw new Error('Full crawl did not return a job id');
            }

            setStepIndex(0);
            setCreateMessage('Waiting for crawl worker…');
            const started = Date.now();
            let sawRunning = false;

            while (Date.now() - started < 15 * 60 * 1000) {
                await new Promise((r) => setTimeout(r, 4000));
                const job = await pollFullAuditJob(jobId);
                const st = job.data?.status;

                if (st === 'queued') {
                    setStepIndex(0);
                    const waitedSec = Math.round((Date.now() - started) / 1000);
                    setCreateMessage(
                        waitedSec > 90
                            ? `Still queued after ${waitedSec}s — worker may be restarting. Keep this tab open…`
                            : 'Waiting for crawl worker (queued)…'
                    );
                }
                if (st === 'running') {
                    sawRunning = true;
                    setStepIndex((i) => Math.max(i, 1));
                    setCreateMessage(
                        'Crawl status: running… (website + AI report can take several minutes)'
                    );
                }
                if (st === 'complete') {
                    setStepIndex(CRAWL_STEPS.length - 1);
                    await finishAndOpenReport(auditIdOut);
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
                            await finishAndOpenReport(auditIdOut);
                            return;
                        }
                    } catch {
                        /* keep polling */
                    }
                }
            }
            throw new Error('Crawl timed out after 15 minutes — refresh the list and check again');
        } catch (err: any) {
            setError(err.message || 'Full audit failed');
            setCreateMessage('');
        } finally {
            setCreating(false);
        }
    };

    const onCopy = async (url: string) => {
        const ok = await copyText(url);
        setMessage(ok ? 'Shareable link copied.' : url);
    };

    const onShare = async (a: FullAuditListItem) => {
        if (!a.published) {
            setError('Publish the audit before emailing the PDF report.');
            return;
        }
        let email = String(a.email || '').trim();
        if (!email || !email.includes('@')) {
            const entered = window.prompt(
                'This audit has no company email. Enter the email address to send the PDF report to:'
            );
            email = String(entered || '').trim();
            if (!email || !email.includes('@')) {
                setError('A valid company email is required to share the report.');
                return;
            }
        }
        const biz = a.businessName || 'this business';
        if (!window.confirm(`Email the audit report PDF to ${email} for “${biz}”?`)) {
            return;
        }
        setBusyId(a.id);
        setBusyAction('share');
        setError('');
        setMessage('');
        try {
            const res = await shareFullAuditEmail(a.id, { email });
            setMessage(
                res.attached === false
                    ? `Report emailed to ${res.to} (link only — PDF was too large to attach).`
                    : `Report emailed to ${res.to}.`
            );
        } catch (err: any) {
            setError(err.message || 'Could not email audit report');
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    const onDelete = async (a: FullAuditListItem) => {
        const name = a.businessName || 'this report';
        if (!window.confirm(`Delete “${name}”? This permanently removes the full crawl report.`)) {
            return;
        }
        setBusyId(a.id);
        setBusyAction('delete');
        setError('');
        try {
            await deleteFullAudit(a.id);
            setAudits((prev) => prev.filter((x) => x.id !== a.id));
            setMessage('Audit deleted.');
        } catch (err: any) {
            setError(err.message || 'Could not delete audit');
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    return (
        <div className="space-y-5 max-w-7xl">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={load}
                    disabled={loading || creating}
                    className="inline-flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                    <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                    Refresh
                </button>
                {!showForm ? (
                    <button
                        type="button"
                        onClick={openNewForm}
                        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F59E0B] text-sm font-bold text-[#0F172A] hover:bg-[#FBBF24]"
                    >
                        <Plus className="w-4 h-4" />
                        New full audit
                    </button>
                ) : null}
            </div>

            {error ? (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            ) : null}
            {message ? (
                <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    {message}
                </p>
            ) : null}

            {showForm ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-[#0F172A]">New full audit</h2>
                            <p className="text-sm text-[#64748B] mt-1">
                                Enter business details — we look up Google Maps / GBP, crawl the website, score
                                Local SEO + AEO + GEO, then open the shareable report when it&apos;s ready.
                            </p>
                        </div>
                        {!creating ? (
                            <button
                                type="button"
                                onClick={closeForm}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"
                                aria-label="Close form"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : null}
                    </div>

                    {creating ? (
                        <div className="space-y-5" aria-live="polite">
                            <div className="flex gap-4 items-start">
                                <div className="w-12 h-12 rounded-xl bg-[#FFFBEB] text-[#F59E0B] flex items-center justify-center shrink-0">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-[#F59E0B] flex items-center gap-1.5">
                                        <Wand2 className="w-3.5 h-3.5" /> Building full crawl report
                                    </p>
                                    <h3 className="text-base font-bold text-[#0F172A] mt-1">
                                        Please wait — this usually takes 3–8 minutes
                                    </h3>
                                    <p className="text-sm text-[#64748B] mt-1">
                                        {CRAWL_STEPS[stepIndex].detail}
                                    </p>
                                    {createMessage ? (
                                        <p className="text-sm text-[#64748B] mt-1">{createMessage}</p>
                                    ) : null}
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
                                    const Icon =
                                        i === 0 ? MapPinned : i === 1 ? Globe2 : i === 2 ? Search : Wand2;
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
                                                    !done &&
                                                    !active &&
                                                    'bg-white border border-[#E2E8F0] text-[#94A3B8]'
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
                                                <strong className="block text-sm text-[#0F172A]">
                                                    {step.label}
                                                </strong>
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
                                Email or phone *
                                <input
                                    required
                                    value={form.emailOrPhone}
                                    onChange={(e) => setForm({ ...form, emailOrPhone: e.target.value })}
                                    placeholder="company@example.com or +44…"
                                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                />
                            </label>
                            <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                                Website
                                <input
                                    placeholder="https:// (optional)"
                                    value={form.website}
                                    onChange={(e) => setForm({ ...form, website: e.target.value })}
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
                            <div className="sm:col-span-2 pt-1 flex flex-wrap gap-2">
                                <button
                                    type="submit"
                                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#F59E0B] text-sm font-bold text-[#0F172A] hover:bg-[#FBBF24]"
                                >
                                    Start full audit
                                </button>
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E2E8F0] text-sm font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            ) : null}

            {!showForm ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#FFFBEB] to-white flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF3C7] border border-[#FDE68A]">
                            <ClipboardCheck className="w-4 h-4 text-[#D97706]" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-[#0F172A]">Full audit history</h2>
                            <p className="text-[11px] text-[#94A3B8]">
                                Deep crawl reports ready to share and assign
                            </p>
                        </div>
                        <span className="text-xs font-semibold text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2.5 py-1 ml-auto">
                            {audits.length} reports
                        </span>
                    </div>

                    {loading ? <p className="p-6 text-sm text-[#64748B]">Loading…</p> : null}

                    {!loading && audits.length === 0 ? (
                        <p className="p-6 text-sm text-[#64748B]">
                            No full crawl audits yet.{' '}
                            <button
                                type="button"
                                onClick={openNewForm}
                                className="font-semibold text-[#D97706] hover:underline"
                            >
                                Start a new full audit
                            </button>
                            .
                        </p>
                    ) : null}

                    <ul className="divide-y divide-[#F1F5F9]">
                        {pageAudits.map((a) => {
                            const share = resolveAuditReportUrl(a.shareUrl || a.reportUrl || a.id);
                            const busy = busyId === a.id;
                            const canShare = Boolean(a.published);
                            return (
                                <li
                                    key={a.id}
                                    className="group p-4 sm:p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between transition-colors"
                                >
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-base font-semibold text-[#0F172A] truncate group-hover:font-bold">
                                                {a.businessName || 'Untitled business'}
                                            </p>
                                            {a.totalScore != null ? (
                                                <span className="inline-flex items-center rounded-full bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 text-[11px] font-bold text-[#92400E]">
                                                    {a.totalScore}/100
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-semibold text-[#475569]">
                                                Full crawl
                                            </span>
                                            <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-medium text-[#64748B]">
                                                {a.city || '—'}
                                            </span>
                                            <span className="inline-flex items-center rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-medium text-[#64748B]">
                                                {a.tradeId || '—'}
                                            </span>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                                                    a.published
                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                        : 'bg-slate-50 border-slate-200 text-slate-600'
                                                )}
                                            >
                                                {a.published ? 'Published' : 'Draft'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[#94A3B8] truncate">
                                            {[a.email, a.phone].filter(Boolean).join(' · ') || 'No contact'}
                                            {a.website ? ` · ${a.website}` : ''}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        {share ? (
                                            <>
                                                <a
                                                    href={share}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    Open report
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => onCopy(share)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                    Copy link
                                                </button>
                                            </>
                                        ) : null}
                                        <button
                                            type="button"
                                            disabled={busy || !canShare}
                                            onClick={() => onShare(a)}
                                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#D97706] hover:border-[#FDE68A] hover:bg-[#FFFBEB] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#64748B]"
                                            aria-label={
                                                a.email
                                                    ? `Email report to ${a.email}`
                                                    : 'Email report (enter address)'
                                            }
                                            title={
                                                !a.published
                                                    ? 'Publish before sharing'
                                                    : a.email
                                                        ? `Email report to ${a.email}`
                                                        : 'Email report — you’ll be asked for an address'
                                            }
                                        >
                                            <Share2
                                                className={cn(
                                                    'w-4 h-4',
                                                    busy && busyAction === 'share' && 'animate-pulse'
                                                )}
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onDelete(a)}
                                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#94A3B8] hover:text-red-600 hover:border-red-200 disabled:opacity-60"
                                            aria-label={`Delete ${a.businessName || 'audit'}`}
                                            title="Delete report"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveLead(auditToLeadRef(a))}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold shadow-xs transition-colors"
                                        >
                                            <CheckSquare className="w-3.5 h-3.5 text-[#D97706]" />
                                            Manage Task
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {!loading && audits.length > 0 ? (
                        <div className="px-4 sm:px-5 py-3 border-t border-[#E2E8F0] bg-[#FCFDFE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[#64748B]">
                                Showing {rangeStart}–{rangeEnd} of {audits.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Previous
                                </button>
                                <span className="text-xs font-bold text-[#475569] tabular-nums px-1">
                                    {safePage} / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
            {activeLead ? (
                <LeadCrmDrawer
                    lead={activeLead}
                    salesAgents={salesAgents}
                    onClose={() => setActiveLead(null)}
                />
            ) : null}
        </div>
    );
}
