import { API_BASE } from '../../shared/apiConfig';

export { API_BASE };

const ADMIN_TOKEN_KEY = 'localpulse_admin_token';

export function getAdminToken(): string | null {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function adminAuthHeaders(): Record<string, string> {
    const token = getAdminToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readAdminError(res: Response, path: string): Promise<Error> {
    try {
        const data = await res.json();
        return new Error(data.error || `Request failed: ${path}`);
    } catch {
        return new Error(`Request failed: ${path}`);
    }
}

export async function adminGet(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { headers: { ...adminAuthHeaders() } });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}

export async function adminPost(path: string, body: unknown = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}

export async function adminPatch(path: string, body: unknown = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}

export async function adminDelete(path: string) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: { ...adminAuthHeaders() }
    });
    if (!res.ok) throw await readAdminError(res, path);
    return res.json();
}

/* CRM Types & Helpers */

export type SalesAgent = {
    id: string;
    name: string;
    email: string;
    platform_role: string;
    created_at?: string;
};

export type TaskType = 'prepare_audit' | 'onboard_customer' | 'follow_up_call' | 'send_proposal' | 'custom';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type LeadTask = {
    id: string;
    leadId: string;
    taskType: TaskType;
    title: string;
    notes: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    assignedToUserId: string | null;
    assignedToName?: string | null;
    assignedToEmail?: string | null;
};

export type LeadActivity = {
    id: string;
    leadId: string;
    activityType: 'call_log' | 'status_change' | 'task_event' | 'note';
    disposition: 'connected' | 'voicemail' | 'callback_requested' | 'not_interested' | 'converted' | 'other' | null;
    note: string;
    authorName: string;
    createdAt: string;
    userName?: string | null;
    userEmail?: string | null;
};

export async function fetchSalesAgents(): Promise<SalesAgent[]> {
    const res = await adminGet('/api/admin/crm/sales-agents');
    return res.agents || [];
}

export async function fetchCrmTasks(params: {
    leadId?: string;
    assignedTo?: string;
    status?: string;
    priority?: string;
    taskType?: string;
} = {}): Promise<LeadTask[]> {
    const sp = new URLSearchParams();
    if (params.leadId) sp.set('leadId', params.leadId);
    if (params.assignedTo) sp.set('assignedTo', params.assignedTo);
    if (params.status) sp.set('status', params.status);
    if (params.priority) sp.set('priority', params.priority);
    if (params.taskType) sp.set('taskType', params.taskType);
    const qs = sp.toString();
    const res = await adminGet(`/api/admin/crm/tasks${qs ? `?${qs}` : ''}`);
    return res.tasks || [];
}

export async function createCrmTask(data: {
    lead_id: string;
    task_type: TaskType;
    title: string;
    notes?: string;
    priority?: TaskPriority;
    assigned_to_user_id?: string | null;
    due_date?: string | null;
}): Promise<LeadTask> {
    const res = await adminPost('/api/admin/crm/tasks', data);
    return res.task;
}

export async function updateCrmTask(taskId: string, updates: Partial<{
    title: string;
    task_type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    notes: string;
    assigned_to_user_id: string | null;
    due_date: string | null;
}>): Promise<LeadTask> {
    const res = await adminPatch(`/api/admin/crm/tasks/${taskId}`, updates);
    return res.task;
}

export async function deleteCrmTask(taskId: string): Promise<void> {
    await adminDelete(`/api/admin/crm/tasks/${taskId}`);
}

export async function fetchLeadActivities(leadId: string): Promise<LeadActivity[]> {
    const res = await adminGet(`/api/admin/crm/leads/${leadId}/activities`);
    return res.activities || [];
}

export async function createLeadActivity(leadId: string, data: {
    activity_type?: string;
    disposition?: string;
    note?: string;
    author_name?: string;
}): Promise<LeadActivity> {
    const res = await adminPost(`/api/admin/crm/leads/${leadId}/activities`, data);
    return res.activity;
}

