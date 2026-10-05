import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Check,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Circle,
    ClipboardCheck,
    Copy,
    Edit2,
    ExternalLink,
    Globe2,
    Inbox,
    Loader2,
    Mail,
    MapPinned,
    Plus,
    RefreshCw,
    Search,
    Share2,
    Trash2,
    UserCheck,
    Wand2,
    X
} from 'lucide-react';
import {
    assignFullAuditToAgent,
    deleteFullAudit,
    fetchFullAudit,
    fetchFullAuditRequests,
    fetchFullAudits,
    fetchSalesAgents,
    pollFullAuditJob,
    shareFullAuditEmail,
    startFullCrawl,
    updateFullAuditRequest,
    type FullAuditListItem,
    type FullAuditRequest,
    type SalesAgent
} from './adminApi';
import { AUDIT_SERVICE_OPTIONS, resolveAuditService } from './auditServices';
import LeadCrmDrawer, { type GrowthAuditLeadRef } from './LeadCrmDrawer';
import { resolveAuditReportUrl } from '../shared/apiConfig';
import { useToast } from '../shared/Toast';
import { cn } from '../shared/utils';

const PAGE_SIZE = 10;
const REQUESTS_SEEN_KEY = 'admin_full_audit_requests_seen_v1';

type RequestFilter = 'open' | 'assigned' | 'done' | 'all';

function loadSeenRequestIds(): Set<string> {
    try {
        const raw = localStorage.getItem(REQUESTS_SEEN_KEY);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
        return new Set();
    }
}

function saveSeenRequestIds(ids: Set<string>) {
    try {
        localStorage.setItem(REQUESTS_SEEN_KEY, JSON.stringify(Array.from(ids)));
    } catch {
        /* ignore */
    }
}

function normalizeMatch(value?: string | null) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function isReadyAudit(a: FullAuditListItem) {
    return Boolean(a.published || a.status === 'complete' || a.status === 'completed');
}

function auditsReadyForRequest(req: FullAuditRequest, audits: FullAuditListItem[]) {
    const linked = String(req.fulfilledAuditId || '').trim();
    if (linked) {
        const found = audits.find((a) => a.id === linked && isReadyAudit(a));
        if (found) return [found];
    }
    const email = normalizeMatch(req.toEmail);
    const name = normalizeMatch(req.businessName);
    if (!name && !email) return [];

    return audits.filter((a) => {
        if (!isReadyAudit(a)) return false;
        if (linked && a.id === linked) return true;
        const aEmail = normalizeMatch(a.email);
        const aName = normalizeMatch(a.businessName);
        if (name && aName && name === aName) return true;
        if (email && aEmail && email === aEmail && (!name || !aName || name === aName)) return true;
        return false;
    });
}


const CRAWL_EXPECTED_MS = 8 * 60 * 1000;

function CrawlProgressRing({ percent }: { percent: number }) {
    const size = 56;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    const dashOffset = circumference - (clamped / 100) * circumference;
    return (
        <div
            className="relative shrink-0"
            style={{ width: size, height: size }}
            role="img"
            aria-label={`${clamped} percent complete`}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="#FFFBEB"
                    stroke="#FDE68A"
                    strokeWidth={stroke}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-[stroke-dashoffset] duration-500 ease-linear"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black tabular-nums text-[#0F172A]">
                {clamped}%
            </span>
        </div>
    );
}

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
    contact: '',
    extraContact: '',
    showExtraContact: false,
    address: '',
    city: '',
    serviceId: '',
    serviceOther: '',
    contactName: ''
};

function isValidEmailOrPhone(raw: string): boolean {
    const value = String(raw || '').trim();
    if (!value) return false;
    if (value.includes('@')) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7;
}

/** Keep whichever values are a valid email and a valid phone. */
function contactsFromForm(contact: string, extraContact: string, showExtraContact: boolean) {
    const values = [contact, showExtraContact ? extraContact : ''].map((v) => String(v || '').trim()).filter(Boolean);
    let email = '';
    let phone = '';
    for (const value of values) {
        if (value.includes('@')) {
            if (!email) email = value;
        } else if (!phone) {
            phone = value;
        }
    }
    return { email, phone };
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
    const { show } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') === 'requests' ? 'requests' : 'audits';
    const [audits, setAudits] = useState<FullAuditListItem[]>([]);
    const [requests, setRequests] = useState<FullAuditRequest[]>([]);
    const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
    const [activeLead, setActiveLead] = useState<GrowthAuditLeadRef | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');
    const [busyAction, setBusyAction] = useState<'share' | 'delete' | ''>('');
    const [page, setPage] = useState(1);
    const [requestPage, setRequestPage] = useState(1);
    const [fulfillAuditId, setFulfillAuditId] = useState('');
    const [fulfillAgentId, setFulfillAgentId] = useState('');
    const [assignModalReq, setAssignModalReq] = useState<FullAuditRequest | null>(null);
    const [assignSaving, setAssignSaving] = useState(false);
    const [requestFilter, setRequestFilter] = useState<RequestFilter>('open');
    const [seenRequestIds, setSeenRequestIds] = useState<Set<string>>(() => loadSeenRequestIds());
    const [prefillRequestId, setPrefillRequestId] = useState<string | null>(null);
    const pendingAssignRef = useRef<{ reqId: string; auditId: string } | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [ringPct, setRingPct] = useState(0);
    const crawlCompleteRef = useRef(false);
    const [createMessage, setCreateMessage] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        Promise.all([
            fetchFullAudits(),
            fetchSalesAgents().catch(() => [] as SalesAgent[]),
            fetchFullAuditRequests().catch(() => [] as FullAuditRequest[])
        ])
            .then(([list, agents, reqs]) => {
                setAudits(list);
                setSalesAgents(agents);
                setRequests(reqs);
                setPage(1);
                setRequestPage(1);
                const pending = pendingAssignRef.current;
                if (pending) {
                    pendingAssignRef.current = null;
                    const req = reqs.find((r) => r.id === pending.reqId);
                    if (req) {
                        setAssignModalReq({ ...req, fulfilledAuditId: pending.auditId });
                        setFulfillAuditId(pending.auditId);
                        setFulfillAgentId(req.assignedToUserId || '');
                        setAssignSaving(false);
                    }
                }
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

    const setTab = (tab: 'audits' | 'requests') => {
        const next = new URLSearchParams(searchParams);
        if (tab === 'requests') next.set('tab', 'requests');
        else next.delete('tab');
        setSearchParams(next, { replace: true });
    };

    const openRequests = useMemo(
        () => requests.filter((r) => r.status === 'pending' || r.status === 'in_progress'),
        [requests]
    );

    const unseenRequestCount = useMemo(
        () => openRequests.filter((r) => !seenRequestIds.has(r.id)).length,
        [openRequests, seenRequestIds]
    );

    // Opening the Requests tab clears the badge for currently open requests
    useEffect(() => {
        if (activeTab !== 'requests' || !openRequests.length) return;
        setSeenRequestIds((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const r of openRequests) {
                if (!next.has(r.id)) {
                    next.add(r.id);
                    changed = true;
                }
            }
            if (!changed) return prev;
            saveSeenRequestIds(next);
            return next;
        });
    }, [activeTab, openRequests]);

    const filteredRequests = useMemo(() => {
        return requests.filter((r) => {
            if (requestFilter === 'all') return true;
            if (requestFilter === 'open') return r.status === 'pending' || r.status === 'in_progress';
            if (requestFilter === 'assigned') {
                return r.status === 'completed' && Boolean(r.assignedToUserId || r.assignedAgentName);
            }
            if (requestFilter === 'done') {
                return r.status === 'completed' || r.status === 'dismissed';
            }
            return true;
        });
    }, [requests, requestFilter]);

    const openNewFormFromRequest = (req: FullAuditRequest) => {
        setPrefillRequestId(req.id);
        setForm({
            ...EMPTY_FORM,
            businessName: req.businessName || '',
            contact: req.toEmail || ''
        });
        setShowForm(true);
        setTab('audits');
        setError('');
        updateFullAuditRequest(req.id, { status: 'in_progress' }).catch(() => {});
    };

    const openAssignModal = (req: FullAuditRequest) => {
        const ready = auditsReadyForRequest(req, audits);
        if (!ready.length && !req.fulfilledAuditId) {
            setError('Run and publish a full audit for this business first, then assign.');
            return;
        }
        setAssignModalReq(req);
        setFulfillAuditId(req.fulfilledAuditId || ready[0]?.id || '');
        setFulfillAgentId(req.assignedToUserId || '');
        setAssignSaving(false);
        setError('');
    };

    const openAssignModalForAudit = (audit: FullAuditListItem) => {
        const existingReq = requests.find(
            (r) => r.fulfilledAuditId === audit.id || (r.businessName && r.businessName.toLowerCase() === (audit.businessName || '').toLowerCase())
        );
        if (existingReq) {
            openAssignModal(existingReq);
        } else {
            const virtualReq: FullAuditRequest = {
                id: `audit-${audit.id}`,
                leadId: audit.id,
                businessName: audit.businessName || 'Business',
                toEmail: audit.email || '',
                status: 'completed',
                source: 'admin_audit',
                requestedAt: audit.createdAt || new Date().toISOString(),
                fulfilledAuditId: audit.id,
                assignedToUserId: null,
                assignedAgentName: null,
                assignedAgentEmail: null,
                completedAt: new Date().toISOString(),
                notes: '',
                reportUrl: audit.reportUrl || audit.shareUrl || null
            };
            setAssignModalReq(virtualReq);
            setFulfillAuditId(audit.id);
            setFulfillAgentId('');
            setAssignSaving(false);
            setError('');
        }
    };

    const closeAssignModal = () => {
        if (assignSaving) return;
        setAssignModalReq(null);
        setFulfillAuditId('');
        setFulfillAgentId('');
        setAssignSaving(false);
    };

    const handleFulfillRequest = async (req: FullAuditRequest) => {
        const auditId = String(fulfillAuditId || '').trim();
        const ready = auditsReadyForRequest(req, audits);
        const selected = audits.find((a) => a.id === auditId);
        const allowed =
            Boolean(auditId) &&
            (ready.some((a) => a.id === auditId) || Boolean(selected && isReadyAudit(selected)) || Boolean(req.fulfilledAuditId === auditId));
        if (!allowed) {
            setError('Select a published full audit for this business before assigning.');
            return;
        }
        if (!fulfillAgentId) {
            setError('Select a sales agent to assign.');
            return;
        }
        setAssignSaving(true);
        setError('');
        try {
            await assignFullAuditToAgent({
                requestId: req.id.startsWith('audit-') ? undefined : req.id,
                auditId,
                agentId: fulfillAgentId,
                businessName: req.businessName || selected?.businessName,
                leadId: req.leadId
            });
            show('Assigned — sales agent will see this in CRM to deliver the PDF.');
            setAssignModalReq(null);
            setFulfillAuditId('');
            setFulfillAgentId('');
            setRequestFilter('assigned');
            load();
        } catch (err: any) {
            setError(err.message || 'Failed to fulfill request');
        } finally {
            setAssignSaving(false);
        }
    };

    useEffect(() => {
        if (!creating) {
            crawlCompleteRef.current = false;
            setRingPct(0);
            return undefined;
        }
        const started = Date.now();
        setRingPct(0);
        const timer = setInterval(() => {
            if (crawlCompleteRef.current) {
                setRingPct(100);
                return;
            }
            const elapsed = Date.now() - started;
            setRingPct(Math.min(95, Math.round((elapsed / CRAWL_EXPECTED_MS) * 95)));
        }, 500);
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

    const totalRequestPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
    const safeRequestPage = Math.min(requestPage, totalRequestPages);
    const pageRequests = useMemo(() => {
        const start = (safeRequestPage - 1) * PAGE_SIZE;
        return filteredRequests.slice(start, start + PAGE_SIZE);
    }, [filteredRequests, safeRequestPage]);

    useEffect(() => {
        if (requestPage !== safeRequestPage) setRequestPage(safeRequestPage);
    }, [requestPage, safeRequestPage]);

    const requestRangeStart = filteredRequests.length === 0 ? 0 : (safeRequestPage - 1) * PAGE_SIZE + 1;
    const requestRangeEnd = Math.min(safeRequestPage * PAGE_SIZE, filteredRequests.length);
    const showOther = form.serviceId === 'other';
    const progressPct = ringPct;
    const activeStepIndex =
        progressPct >= 100
            ? CRAWL_STEPS.length
            : Math.min(CRAWL_STEPS.length - 1, Math.floor((progressPct / 100) * CRAWL_STEPS.length));
    const detailStep = CRAWL_STEPS[Math.min(CRAWL_STEPS.length - 1, activeStepIndex)];

    const showCrawlComplete = async () => {
        crawlCompleteRef.current = true;
        setRingPct(100);
        await new Promise((r) => setTimeout(r, 500));
    };

    const openNewForm = () => {
        setShowForm(true);
        setError('');
        setCreateMessage('');
    };

    const closeForm = () => {
        if (creating) return;
        setShowForm(false);
        setForm(EMPTY_FORM);
        setCreateMessage('');
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
        show(
            prefillRequestId
                ? 'Full audit ready — pick a sales agent to assign.'
                : 'Full audit ready — report opened in a new tab.'
        );
        if (prefillRequestId) {
            const req = requests.find((r) => r.id === prefillRequestId);
            const agentId = req?.assignedToUserId;
            if (agentId) {
                try {
                    await updateFullAuditRequest(prefillRequestId, {
                        status: 'completed',
                        fulfilledAuditId: auditId,
                        assignedToUserId: agentId
                    });
                    show(
                        `🎉 Full Growth Audit ready and automatically assigned back to ${req.assignedAgentName || 'the requesting sales agent'}!`
                    );
                } catch {
                    pendingAssignRef.current = { reqId: prefillRequestId, auditId };
                    setFulfillAuditId(auditId);
                    show('Full audit ready — please confirm assignment.');
                }
            } else {
                pendingAssignRef.current = { reqId: prefillRequestId, auditId };
                setFulfillAuditId(auditId);
                show('Full audit ready — pick a sales agent to assign.');
            }
            setPrefillRequestId(null);
            setTab('requests');
        } else {
            show('Full audit ready — report opened in a new tab.');
        }
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
        if (!form.city.trim()) {
            setError('City is required');
            return;
        }
        if (!form.website.trim()) {
            setError('Website URL is required');
            return;
        }
        if (!isValidEmailOrPhone(form.contact)) {
            setError('Enter a valid email or phone number');
            return;
        }
        if (form.showExtraContact && form.extraContact.trim() && !isValidEmailOrPhone(form.extraContact)) {
            setError('The extra contact must be a valid email or phone number');
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

        const { email, phone } = contactsFromForm(form.contact, form.extraContact, form.showExtraContact);

        setCreating(true);
        setError('');
        setCreateMessage('Looking up Maps / GBP, then crawling the website…');

        try {
            const res = await startFullCrawl({
                businessName: form.businessName.trim(),
                website: form.website.trim(),
                phone,
                email,
                address: form.address.trim(),
                city: form.city.trim(),
                contactName: form.contactName.trim(),
                tradeId: resolved.tradeId,
                serviceId: resolved.serviceId,
                serviceLabel: resolved.serviceLabel,
                service: resolved.service,
                primaryService: resolved.serviceLabel,
                operatorNotes: '',
                skipLighthouse: false
            });

            const auditIdOut = res.data?.auditId || res.data?.id;
            const jobId = res.data?.jobId;

            if (res.data?.status === 'complete' && auditIdOut) {
                await showCrawlComplete();
                await finishAndOpenReport(auditIdOut);
                return;
            }
            if (!jobId || !auditIdOut) {
                throw new Error('Full crawl did not return a job id');
            }

            setCreateMessage('Waiting for crawl worker…');
            const started = Date.now();
            let sawRunning = false;

            while (Date.now() - started < 15 * 60 * 1000) {
                await new Promise((r) => setTimeout(r, 4000));
                const job = await pollFullAuditJob(jobId);
                const st = job.data?.status;

                if (st === 'queued') {
                    const waitedSec = Math.round((Date.now() - started) / 1000);
                    setCreateMessage(
                        waitedSec > 90
                            ? `Still queued after ${waitedSec}s — worker may be restarting. Keep this tab open…`
                            : 'Waiting for crawl worker (queued)…'
                    );
                }
                if (st === 'running') {
                    sawRunning = true;
                    setCreateMessage(
                        'Crawl status: running… (website + AI report can take several minutes)'
                    );
                }
                if (st === 'complete') {
                    await showCrawlComplete();
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
                            await showCrawlComplete();
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
        if (ok) show('Shareable link copied.');
        else setError('Could not copy the link.');
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
        try {
            const res = await shareFullAuditEmail(a.id, { email });
            show(
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
            show('Audit deleted.');
        } catch (err: any) {
            setError(err.message || 'Could not delete audit');
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    return (
        <div className="space-y-5 max-w-7xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-xl border border-[#E2E8F0] bg-white p-1">
                    <button
                        type="button"
                        onClick={() => setTab('audits')}
                        className={cn(
                            'px-3.5 py-2 text-xs font-bold rounded-lg transition-colors',
                            activeTab === 'audits'
                                ? 'bg-[#F59E0B] text-[#0F172A]'
                                : 'text-[#64748B] hover:text-[#0F172A]'
                        )}
                    >
                        Audits
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('requests')}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-colors',
                            activeTab === 'requests'
                                ? 'bg-[#F59E0B] text-[#0F172A]'
                                : 'text-[#64748B] hover:text-[#0F172A]'
                        )}
                    >
                        <Inbox className="w-3.5 h-3.5" />
                        Requests
                        {unseenRequestCount > 0 ? (
                            <span className="ml-0.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[#0F172A] text-white text-[10px] px-1">
                                {unseenRequestCount}
                            </span>
                        ) : null}
                    </button>
                </div>
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
                {!showForm && activeTab === 'audits' ? (
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
            </div>

            {error ? (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    {error}
                </p>
            ) : null}

            {activeTab === 'requests' ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                        <div>
                            <h2 className="text-sm font-black text-[#0F172A]">Full audit requests</h2>
                            <p className="text-xs text-[#64748B] mt-0.5">
                                Run a full audit and publish the PDF first, then assign to sales to email it.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(
                                [
                                    { id: 'open', label: 'Open' },
                                    { id: 'assigned', label: 'Assigned' },
                                    { id: 'done', label: 'Done' },
                                    { id: 'all', label: 'All' }
                                ] as const
                            ).map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => {
                                        setRequestFilter(f.id);
                                        setRequestPage(1);
                                    }}
                                    className={cn(
                                        'px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors',
                                        requestFilter === f.id
                                            ? 'bg-[#0F172A] text-white border-[#0F172A]'
                                            : 'bg-white text-[#64748B] border-[#E2E8F0] hover:text-[#0F172A]'
                                    )}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {loading ? (
                        <div className="p-8 text-center text-sm text-[#64748B]">Loading requests…</div>
                    ) : !filteredRequests.length ? (
                        <div className="p-8 text-center text-sm text-[#64748B]">
                            No requests in this filter.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#64748B]">
                                    <tr>
                                        <th className="px-5 py-3 font-bold">Business</th>
                                        <th className="px-4 py-3 font-bold whitespace-nowrap">Source</th>
                                        <th className="px-4 py-3 font-bold">Sales Agent</th>
                                        <th className="px-4 py-3 font-bold">Contact</th>
                                        <th className="px-4 py-3 font-bold">Requested</th>
                                        <th className="px-4 py-3 font-bold whitespace-nowrap">Status</th>
                                        <th className="px-4 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E2E8F0]">
                                    {pageRequests.map((req) => {
                                        const readyAudits = auditsReadyForRequest(req, audits);
                                        const hasReadyAudit = readyAudits.length > 0;
                                        const isAssigned =
                                            req.status === 'completed' &&
                                            Boolean(req.assignedToUserId || req.assignedAgentName);
                                        const isOpen =
                                            req.status === 'pending' || req.status === 'in_progress';
                                        const isCustomerEmail =
                                            String(req.source || '').toLowerCase().includes('email') ||
                                            Boolean(req.observationEmailToken);
                                        const isSalesRequest =
                                            String(req.source || '').toLowerCase().includes('sales');

                                        return (
                                        <tr key={req.id} className="align-middle hover:bg-[#F8FAFC]/70 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[#0F172A] leading-snug">{req.businessName || '—'}</div>
                                                {req.fulfilledAuditId ? (
                                                    <div className="text-[10px] text-emerald-700 mt-0.5 font-mono">
                                                        Audit: {req.fulfilledAuditId.slice(0, 8)}…
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                {isCustomerEmail ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
                                                        <Mail className="w-2.5 h-2.5 text-sky-600" />
                                                        <span>Customer Email</span>
                                                    </span>
                                                ) : isSalesRequest ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200/80">
                                                        <UserCheck className="w-2.5 h-2.5 text-violet-600" />
                                                        <span>Sales Request</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                                                        <span>Direct</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {req.assignedAgentName || req.assignedAgentEmail ? (
                                                    <div>
                                                        <div className="text-xs font-bold text-[#0F172A]">
                                                            {req.assignedAgentName || 'Assigned Agent'}
                                                        </div>
                                                        {req.assignedAgentEmail ? (
                                                            <div className="text-[10px] text-[#64748B]">
                                                                {req.assignedAgentEmail}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-[#94A3B8] italic">Unassigned</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-[#334155] whitespace-nowrap">{req.toEmail || '—'}</td>
                                            <td className="px-4 py-3 text-xs text-[#64748B] whitespace-nowrap">
                                                {req.requestedAt
                                                    ? new Date(req.requestedAt).toLocaleString(undefined, {
                                                          month: 'short',
                                                          day: 'numeric',
                                                          hour: '2-digit',
                                                          minute: '2-digit'
                                                      })
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                {isAssigned ? (
                                                    <div>
                                                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-50 text-emerald-800 border-emerald-200 whitespace-nowrap">
                                                            Assigned
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span
                                                        className={cn(
                                                            'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap',
                                                            req.status === 'pending'
                                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                                : req.status === 'in_progress'
                                                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                                                  : req.status === 'completed'
                                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                                        )}
                                                    >
                                                        {req.status.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center justify-end gap-2.5 whitespace-nowrap">
                                                    {isOpen ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => openNewFormFromRequest(req)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-[#F59E0B] text-[#0F172A] hover:bg-[#FBBF24] transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                                                                title="Run and generate a full audit PDF for this request"
                                                            >
                                                                <Plus className="w-3 h-3" />
                                                                <span>Run audit</span>
                                                            </button>
                                                            {hasReadyAudit ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openAssignModal(req)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-[#0F172A] text-white hover:bg-[#1E293B] transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                                                                    title="Assign existing ready audit to sales agent"
                                                                >
                                                                    <Check className="w-3 h-3" />
                                                                    <span>Assign</span>
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateFullAuditRequest(req.id, {
                                                                        status: 'dismissed'
                                                                    }).then(load)
                                                                }
                                                                className="text-xs font-medium text-[#94A3B8] hover:text-rose-600 transition-colors cursor-pointer whitespace-nowrap"
                                                            >
                                                                Dismiss
                                                            </button>
                                                            {req.leadId ? (
                                                                <a
                                                                    href={`/admin/leads/${encodeURIComponent(req.leadId)}`}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors whitespace-nowrap"
                                                                >
                                                                    <span>Open lead</span>
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openAssignModal(req)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-[#F8FAFC] hover:text-[#0F172A] hover:border-[#94A3B8] transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                                                                title="Edit assigned sales agent or audit report"
                                                            >
                                                                <Edit2 className="w-3 h-3 text-[#F59E0B]" />
                                                                <span>Edit Assignment</span>
                                                            </button>
                                                            {req.leadId ? (
                                                                <a
                                                                    href={`/admin/leads/${encodeURIComponent(req.leadId)}`}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors whitespace-nowrap"
                                                                >
                                                                    <span>Open lead</span>
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && filteredRequests.length > 0 ? (
                        <div className="px-4 sm:px-5 py-3 border-t border-[#E2E8F0] bg-[#FCFDFE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-[#64748B]">
                                Showing {requestRangeStart}–{requestRangeEnd} of {filteredRequests.length}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={safeRequestPage <= 1}
                                    onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E2E8F0] bg-white text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Previous
                                </button>
                                <span className="text-xs font-bold text-[#475569] tabular-nums px-1">
                                    {safeRequestPage} / {totalRequestPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={safeRequestPage >= totalRequestPages}
                                    onClick={() => setRequestPage((p) => Math.min(totalRequestPages, p + 1))}
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

            {activeTab === 'audits' && showForm ? (
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
                                <CrawlProgressRing percent={progressPct} />
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-[#F59E0B] flex items-center gap-1.5">
                                        <Wand2 className="w-3.5 h-3.5" /> Building full crawl report
                                    </p>
                                    <h3 className="text-base font-bold text-[#0F172A] mt-1">
                                        Please wait — this usually takes 3–8 minutes
                                    </h3>
                                    <p className="text-sm text-[#64748B] mt-1">
                                        {detailStep.detail}
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
                                Step {Math.min(CRAWL_STEPS.length, activeStepIndex + 1)} of {CRAWL_STEPS.length}
                            </p>
                            <ol className="space-y-2">
                                {CRAWL_STEPS.map((step, i) => {
                                    const done = i < activeStepIndex;
                                    const active = i === activeStepIndex;
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
                                Business name <span className="text-red-500">*</span>
                                <input
                                    required
                                    value={form.businessName}
                                    onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                />
                            </label>
                            <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                                Address <span className="text-red-500">*</span>
                                <input
                                    required
                                    placeholder="Street, town / area (used for Maps + NAP)"
                                    value={form.address}
                                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                />
                            </label>
                            <label className="block text-sm font-semibold text-[#0F172A]">
                                City <span className="text-red-500">*</span>
                                <input
                                    required
                                    value={form.city}
                                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                                    placeholder="e.g. Manchester"
                                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                />
                            </label>
                            <div className="block text-sm font-semibold text-[#0F172A]">
                                Email or phone <span className="text-red-500">*</span>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <input
                                        required
                                        value={form.contact}
                                        onChange={(e) => setForm({ ...form, contact: e.target.value })}
                                        placeholder="company@example.com or +44…"
                                        className="min-w-0 flex-1 px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                    />
                                    {!form.showExtraContact ? (
                                        <button
                                            type="button"
                                            aria-label="Add email and phone"
                                            title="Add email and phone"
                                            onClick={() => setForm({ ...form, showExtraContact: true })}
                                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#F59E0B] bg-[#FFFBEB] text-[#F59E0B] hover:bg-[#FEF3C7]"
                                        >
                                            <Plus className="h-5 w-5" strokeWidth={3} />
                                        </button>
                                    ) : null}
                                </div>
                                {form.showExtraContact ? (
                                    <div className="mt-2 flex items-center gap-2">
                                        <input
                                            value={form.extraContact}
                                            onChange={(e) => setForm({ ...form, extraContact: e.target.value })}
                                            placeholder="Add the other — email or mobile"
                                            className="min-w-0 flex-1 px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                        />
                                        <button
                                            type="button"
                                            aria-label="Remove extra contact"
                                            title="Remove extra contact"
                                            onClick={() =>
                                                setForm({ ...form, showExtraContact: false, extraContact: '' })
                                            }
                                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                                Website <span className="text-red-500">*</span>
                                <input
                                    required
                                    placeholder="https://"
                                    value={form.website}
                                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm font-normal focus:outline-none focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/25"
                                />
                            </label>
                            <label className="block text-sm font-semibold text-[#0F172A] sm:col-span-2">
                                Service <span className="text-red-500">*</span>
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
                                    Describe the service <span className="text-red-500">*</span>
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

            {activeTab === 'audits' && !showForm ? (
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
                                            onClick={() => openAssignModalForAudit(a)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                            title="Assign or edit sales agent assignment for this audit"
                                        >
                                            <UserCheck className="w-3.5 h-3.5 text-[#F59E0B]" />
                                            <span>Assign / Edit</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveLead(auditToLeadRef(a))}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-bold shadow-xs transition-colors cursor-pointer"
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

            {assignModalReq ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label="Close assign dialog"
                        className="absolute inset-0 bg-slate-900/40"
                        onClick={closeAssignModal}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="assign-full-audit-title"
                        className="relative w-full max-w-sm rounded-2xl border border-[#E2E8F0] bg-white shadow-xl p-5 space-y-4"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                                    Full audit request
                                </p>
                                <h3
                                    id="assign-full-audit-title"
                                    className="text-base font-black text-[#0F172A] mt-0.5"
                                >
                                    Assign &amp; complete
                                </h3>
                                <p className="text-xs text-[#64748B] mt-1 truncate max-w-[240px]">
                                    {assignModalReq.businessName || 'Lead'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeAssignModal}
                                className="p-1.5 rounded-lg text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-2.5">
                            {error ? (
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                    {error}
                                </p>
                            ) : null}
                            <label className="block space-y-1">
                                <span className="text-[11px] font-bold text-[#475569]">Ready audit (PDF)</span>
                                <select
                                    value={fulfillAuditId}
                                    onChange={(e) => setFulfillAuditId(e.target.value)}
                                    autoFocus
                                    className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-xl bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                                >
                                    <option value="">Select published audit…</option>
                                    {(() => {
                                        const ready = auditsReadyForRequest(assignModalReq, audits);
                                        const extra =
                                            fulfillAuditId && !ready.some((a) => a.id === fulfillAuditId)
                                                ? audits.find((a) => a.id === fulfillAuditId)
                                                : null;
                                        const options = extra ? [extra, ...ready] : ready;
                                        return options.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {(a.businessName || 'Audit') +
                                                    (a.totalScore != null ? ` · ${a.totalScore}/100` : '') +
                                                    ` · ${a.id.slice(0, 8)}…`}
                                            </option>
                                        ));
                                    })()}
                                </select>
                            </label>
                            <label className="block space-y-1">
                                <span className="text-[11px] font-bold text-[#475569]">Sales agent</span>
                                <select
                                    value={fulfillAgentId}
                                    onChange={(e) => setFulfillAgentId(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-[#E2E8F0] rounded-xl bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                                >
                                    <option value="">Select sales agent…</option>
                                    {salesAgents.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name || a.email}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <p className="text-[11px] text-[#64748B] leading-relaxed">
                            This creates a CRM task for the agent to email the full audit PDF.
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={closeAssignModal}
                                className="flex-1 px-3 py-2.5 text-xs font-bold rounded-xl border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFulfillRequest(assignModalReq)}
                                disabled={!fulfillAuditId.trim() || !fulfillAgentId || assignSaving}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl bg-[#0F172A] text-white hover:bg-[#1E293B] disabled:opacity-40"
                            >
                                {assignSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Check className="w-3.5 h-3.5" />
                                )}
                                Assign &amp; complete
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
