/** Shared, exact-match predicates for the admin CRM Leads and Tasks filters. */

export type LeadStatusKey =
    | 'new'
    | 'in_progress'
    | 'contacted'
    | 'follow_up'
    | 'interested'
    | 'not_interested'
    | 'converted'
    | 'completed'
    | 'voicemail'
    | 'cancelled';

export type EmailState = 'not_sent' | 'sent' | 'opened';

type StatusInput = {
    status?: string | null;
    spreadsheetStatus?: string | null;
    spreadsheetStatus1?: string | null;
};

type EmailInput = {
    emailShareStatus?: string | null;
    observationEmailShareStatus?: string | null;
};

function norm(raw: unknown): string {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, '_');
}

/** Map one status string (CRM value or spreadsheet text) to a canonical key, or null if unrecognised. */
function classifyStatus(raw: unknown): LeadStatusKey | null {
    const s = norm(raw);
    if (!s) return null;
    if (s === 'new' || s === 'pending' || s === 'otp_pending' || s === 'unverified' || s === 'submitted') return 'new';
    if (s.includes('not_interested') || s === 'rejected' || s === 'declined') return 'not_interested';
    if (s === 'interested') return 'interested';
    if (s === 'follow_up' || s === 'followup' || s === 'callback' || s === 'call_back') return 'follow_up';
    if (s === 'in_progress') return 'in_progress';
    if (s === 'contacted' || s === 'called' || s === 'connected') return 'contacted';
    if (s === 'converted' || s === 'won') return 'converted';
    if (s === 'completed' || s === 'complete' || s === 'done') return 'completed';
    if (s === 'voicemail') return 'voicemail';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return null;
}

/**
 * One canonical status per lead, matching what the status badge shows:
 * the CRM status wins unless it is still "new", in which case the spreadsheet status is used.
 */
export function resolveLeadStatus(lead: StatusInput): LeadStatusKey {
    const crm = classifyStatus(lead.status);
    if (crm && crm !== 'new') return crm;
    const sheet = classifyStatus(lead.spreadsheetStatus1 || lead.spreadsheetStatus);
    if (sheet) return sheet;
    return 'new';
}

export function matchesLeadStatusFilter(lead: StatusInput, filter: string): boolean {
    if (!filter || filter === 'all') return true;
    return resolveLeadStatus(lead) === (norm(filter) === 'callback' ? 'follow_up' : norm(filter));
}

/** Email state across the audit email and the observation email. */
export function resolveEmailState(lead: EmailInput): EmailState {
    if (lead.observationEmailShareStatus === 'opened' || lead.emailShareStatus === 'opened') return 'opened';
    if (lead.observationEmailShareStatus === 'sent' || lead.emailShareStatus === 'sent') return 'sent';
    return 'not_sent';
}

/**
 * sent / not_opened = sent but not yet opened; opened = opened; not_sent = nothing sent.
 */
export function matchesEmailFilter(lead: EmailInput, filter: string): boolean {
    if (!filter || filter === 'all') return true;
    const state = resolveEmailState(lead);
    if (filter === 'sent' || filter === 'not_opened') return state === 'sent';
    if (filter === 'opened') return state === 'opened';
    if (filter === 'not_sent') return state === 'not_sent';
    return true;
}
