import { apiGet, apiPatch, apiPost, apiDelete } from '../../shared/utils';

export type SalesTaskType = 'prepare_audit' | 'onboard_customer' | 'follow_up_call' | 'send_proposal' | 'custom';
export type SalesTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SalesTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface SalesLeadTask {
    id: string;
    leadId: string;
    taskType: SalesTaskType;
    title: string;
    notes: string;
    priority: SalesTaskPriority;
    status: SalesTaskStatus;
    dueDate: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    assignedToUserId?: string;
    createdByRole?: 'admin' | 'self' | string;
    createdByName?: string;
    leadBusinessName?: string;
    leadPhone?: string;
    leadEmail?: string;
    leadWebsite?: string;
    leadAddress?: string;
    leadCity?: string;
    leadScoreTotal?: number | null;
    leadReportUrl?: string | null;
    leadAuditId?: string | null;
    leadSource?: string;
    emailShareStatus?: 'none' | 'sent' | 'opened';
    emailShareSentAt?: string | null;
    emailShareOpenedAt?: string | null;
}

export interface SalesLeadActivity {
    id: string;
    leadId: string;
    activityType: 'call_log' | 'status_change' | 'task_event' | 'note';
    disposition?: 'connected' | 'voicemail' | 'callback_requested' | 'not_interested' | 'converted' | 'other' | null;
    note: string;
    authorName: string;
    createdAt: string;
    userName?: string;
    userEmail?: string;
    leadBusinessName?: string;
    leadPhone?: string;
}

export interface SalesSummaryMetrics {
    pendingTasksCount: number;
    inProgressTasksCount?: number;
    activeTasksCount?: number;
    dueTodayTasksCount: number;
    callsTodayCount: number;
    completedTasksCount: number;
    leadsCount: number;
}

export interface SalesUnifiedLead {
    id: string;
    businessName: string;
    name?: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    city?: string;
    industry?: string;
    gbpObservation?: string;
    aiVisibilityObservation?: string;
    leadOpportunity?: string;
    opportunityLevel?: 'high' | 'medium' | 'low' | string;
    isCustomer?: boolean;
    convertedAt?: string | null;
    notes?: string;
    status?: string;
    scoreTotal?: number | null;
    auditId?: string | null;
    reportUrl?: string | null;
    source?: string;
    emailShareStatus?: 'none' | 'sent' | 'opened';
    emailShareSentAt?: string | null;
    emailShareOpenedAt?: string | null;
    assignedTo?: string | null;
    nextFollowUpAt?: string | null;
}

export interface SalesLeadCrmDetail {
    lead: SalesUnifiedLead;
    tasks: SalesLeadTask[];
    activities: SalesLeadActivity[];
}

export async function fetchSalesSummary(): Promise<SalesSummaryMetrics> {
    return apiGet('/api/sales/summary');
}

export async function fetchSalesTasks(params?: {
    status?: string;
    priority?: string;
    taskType?: string;
    dueToday?: boolean;
    leadId?: string;
    createdBy?: string;
}): Promise<SalesLeadTask[]> {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.priority && params.priority !== 'all') qs.set('priority', params.priority);
    if (params?.taskType && params.taskType !== 'all') qs.set('taskType', params.taskType);
    if (params?.dueToday) qs.set('dueToday', 'true');
    if (params?.leadId) qs.set('leadId', params.leadId);
    if (params?.createdBy && params.createdBy !== 'all') qs.set('createdBy', params.createdBy);

    const res = await apiGet(`/api/sales/tasks${qs.toString() ? `?${qs.toString()}` : ''}`);
    return res.tasks || [];
}

export async function updateSalesTask(
    taskId: string,
    updates: {
        status?: SalesTaskStatus;
        priority?: SalesTaskPriority;
        notes?: string;
        dueDate?: string | null;
        title?: string;
    }
): Promise<SalesLeadTask> {
    const res = await apiPatch(`/api/sales/tasks/${taskId}`, {
        status: updates.status,
        priority: updates.priority,
        notes: updates.notes,
        due_date: updates.dueDate,
        title: updates.title
    });
    return res.task;
}

export async function createSalesTask(task: {
    lead_id?: string;
    task_type: SalesTaskType;
    title: string;
    notes?: string;
    priority?: SalesTaskPriority;
    due_date?: string | null;
}): Promise<SalesLeadTask> {
    const res = await apiPost('/api/sales/tasks', task);
    return res.task;
}

export async function fetchSalesLeadCrm(leadId: string): Promise<SalesLeadCrmDetail> {
    return apiGet(`/api/sales/leads/${encodeURIComponent(leadId)}/crm`);
}

export async function logSalesLeadActivity(
    leadId: string,
    payload: {
        disposition: string;
        note: string;
        nextFollowUpAt?: string | null;
    }
): Promise<SalesLeadActivity> {
    const res = await apiPost(`/api/sales/leads/${encodeURIComponent(leadId)}/crm/activities`, payload);
    return res.activity;
}

export async function deleteSalesTask(taskId: string): Promise<{ ok: boolean }> {
    return apiDelete(`/api/sales/tasks/${encodeURIComponent(taskId)}`);
}

export async function fetchSalesActivities(params: {
    disposition?: string;
    leadId?: string;
} = {}): Promise<SalesLeadActivity[]> {
    const sp = new URLSearchParams();
    if (params.disposition && params.disposition !== 'all') sp.set('disposition', params.disposition);
    if (params.leadId) sp.set('leadId', params.leadId);
    const qs = sp.toString();
    const res = await apiGet(`/api/sales/activities${qs ? `?${qs}` : ''}`);
    return res.activities || [];
}

export async function fetchSalesLeads(params: {
    status?: string;
    industry?: string;
    opportunityLevel?: string;
    q?: string;
    isCustomer?: boolean;
} = {}): Promise<SalesUnifiedLead[]> {
    const sp = new URLSearchParams();
    if (params.status && params.status !== 'all') sp.set('status', params.status);
    if (params.industry && params.industry !== 'all') sp.set('industry', params.industry);
    if (params.opportunityLevel && params.opportunityLevel !== 'all') sp.set('opportunityLevel', params.opportunityLevel);
    if (params.q) sp.set('q', params.q);
    if (params.isCustomer !== undefined) sp.set('isCustomer', String(params.isCustomer));
    const qs = sp.toString();
    const res = await apiGet(`/api/sales/leads${qs ? `?${qs}` : ''}`);
    return res.leads || [];
}

export async function createSalesLead(lead: Partial<SalesUnifiedLead>): Promise<SalesUnifiedLead> {
    const res = await apiPost('/api/sales/leads', lead);
    return res.lead;
}

export async function bulkImportSalesLeads(leads: any[]): Promise<{ count: number; created: number; skipped: number; leads: SalesUnifiedLead[] }> {
    return apiPost('/api/sales/leads/bulk-import', { leads });
}

export async function convertLeadToCustomer(leadId: string, note?: string): Promise<{ success: boolean; lead: SalesUnifiedLead }> {
    return apiPatch(`/api/sales/leads/${encodeURIComponent(leadId)}/convert`, { note });
}

export async function fetchSalesCustomers(params: {
    industry?: string;
    q?: string;
} = {}): Promise<SalesUnifiedLead[]> {
    const sp = new URLSearchParams();
    if (params.industry && params.industry !== 'all') sp.set('industry', params.industry);
    if (params.q) sp.set('q', params.q);
    const qs = sp.toString();
    const res = await apiGet(`/api/sales/customers${qs ? `?${qs}` : ''}`);
    return res.customers || [];
}

export async function fetchSalesIndustries(): Promise<Array<{ name: string; count: number }>> {
    const res = await apiGet('/api/sales/industries');
    return res.industries || [];
}

export async function shareFullAuditEmail(
    auditId: string,
    opts?: { email?: string }
): Promise<{ success: boolean; to: string; attached?: boolean; reportUrl?: string }> {
    const body: { email?: string } = {};
    if (opts?.email) body.email = opts.email;
    return apiPost(`/api/sales/full-audits/${encodeURIComponent(auditId)}/share-email`, body);
}

/** Prompt + confirm, then email the full-audit PDF. Returns null if the user cancels. */
export async function confirmAndShareFullAuditEmail(opts: {
    auditId: string;
    businessName?: string | null;
    email?: string | null;
}): Promise<{ to: string; attached?: boolean } | null> {
    let email = String(opts.email || '').trim();
    if (!email || !email.includes('@')) {
        const entered = window.prompt(
            'This audit has no company email. Enter the email address to send the PDF report to:'
        );
        email = String(entered || '').trim();
        if (!email || !email.includes('@')) {
            throw new Error('A valid company email is required to share the report.');
        }
    }
    const biz = opts.businessName || 'this business';
    if (!window.confirm(`Email the audit report PDF to ${email} for “${biz}”?`)) {
        return null;
    }
    const res = await shareFullAuditEmail(opts.auditId, { email });
    return { to: res.to, attached: res.attached };
}

export function emailShareStatusLabel(
    status?: 'none' | 'sent' | 'opened' | null
): 'Sent' | 'Opened' | null {
    if (status === 'opened') return 'Opened';
    if (status === 'sent') return 'Sent';
    return null;
}

export function emailShareStatusHint(
    status?: 'none' | 'sent' | 'opened' | null
): string {
    if (status === 'opened') {
        return 'They opened the email (images loaded) or clicked the report link';
    }
    if (status === 'sent') {
        return 'Waiting — turns Opened when they display images or click “View full audit report”. Opening the PDF attachment alone is not tracked.';
    }
    return '';
}

