export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'na';

export interface ChecklistCheck {
  id: string;
  section: string;
  sectionTitle?: string;
  label: string;
  source?: string;
  status: CheckStatus | string;
  evidence?: string;
  notes?: string;
  pillar?: string;
  [key: string]: unknown;
}

export interface AuditBusiness {
  businessName: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  service: string;
  serviceId: string;
  serviceLabel: string;
  tradeId: string;
  city: string;
  contactName: string;
}

export interface AuditRecord {
  id: string;
  status: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  business: AuditBusiness;
  operatorNotes: string;
  checklist: {
    tradeId?: string;
    tradeLabel?: string;
    city?: string;
    locations?: string[];
    servicePages?: string[];
    mapQueries?: unknown[];
    aiQuestions?: unknown[];
    checks: ChecklistCheck[];
    [key: string]: unknown;
  };
  crawlMeta: Record<string, unknown> | null;
  lighthouseMeta: Record<string, unknown> | null;
  score: Record<string, unknown>;
  topFixes: Array<Record<string, unknown>>;
  presence?: { checks?: ChecklistCheck[]; pillars?: unknown };
  aiReport?: Record<string, unknown> | null;
  websiteCheck?: Record<string, unknown> | null;
  gbpLookup?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface AuditCreateInput {
  businessName?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  service?: string;
  primaryService?: string;
  serviceId?: string;
  serviceLabel?: string;
  tradeId?: string;
  city?: string;
  contactName?: string;
  operatorNotes?: string;
  locations?: string[];
  auditKind?: 'deep' | 'ops' | string;
}

export interface ApiSuccess<T> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
}

export type AuditJobStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface AuditJobRecord {
  id: string;
  auditId: string;
  status: AuditJobStatus;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}
