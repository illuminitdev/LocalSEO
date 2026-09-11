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
    leadSource?: string;
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
    dueTodayTasksCount: number;
    callsTodayCount: number;
    completedTasksCount: number;
    leadsCount: number;
}

export interface SalesUnifiedLead {
    id: string;
    businessName: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    city: string;
    scoreTotal: number | null;
    reportUrl: string | null;
    source: string;
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
    lead_id: string;
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
