import { query } from '../lib/db';

function zappSitesOrigin() {
    const fromEnv = String(process.env.ZAPP_SITES_ORIGIN || '').trim().replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    const stage = (process.env.STAGE || 'dev').toLowerCase();
    return stage === 'prod' ? 'https://www.zappsites.com' : 'https://staging.zappsites.com';
}

function growthAuditTablesMissing(err: any) {
    const msg = String(err?.message || err || '');
    return /relation ["']?(submissions|audits)["']? does not exist/i.test(msg);
}

const ADMIN_LEAD_TYPES = [
    'growth_audit_lead',
    'contact',
    'audit_intake',
    'visibility_check',
    'checkout_lead'
] as const;

function normalizeLeadStatus(raw: unknown): string | null {
    const s = String(raw || '')
        .trim()
        .toLowerCase();
    if (!s) return null;
    if (s === 'otp_pending' || s === 'unverified' || s === 'pending') return 'new';
    if (s === 'completed' || s === 'submitted' || s === 'converted') return s;
    return s;
}

function mapAdminLead(row: any, origin: string) {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const auditData = row.audit_data && typeof row.audit_data === 'object' ? row.audit_data : {};
    const business =
        auditData.business && typeof auditData.business === 'object' ? auditData.business : {};
    const customer =
        payload.customer && typeof payload.customer === 'object' ? payload.customer : {};

    const email =
        String(payload.email || row.submission_email || business.email || customer.email || '')
            .trim()
            .toLowerCase() || null;
    const phone =
        String(payload.phone || business.phone || customer.phone || '').trim() || null;
    const sharePath = String(payload.sharePath || '').trim() || null;
    const scoreRaw = payload.scoreTotal ?? auditData.scoreTotal ?? auditData.score?.total ?? null;
    const scoreTotal =
        scoreRaw == null || scoreRaw === ''
            ? null
            : Number.isFinite(Number(scoreRaw))
              ? Number(scoreRaw)
              : null;

    const name =
        String(
            payload.name ||
                payload.contactName ||
                payload.fullName ||
                customer.name ||
                ''
        ).trim() || null;

    const service =
        String(payload.service || payload.primaryService || payload.businessType || '').trim() ||
        null;
    const serviceLabel =
        String(payload.serviceLabel || payload.service || payload.primaryService || '').trim() ||
        null;

    const type = String(row.type || '').trim() || null;
    const status = normalizeLeadStatus(payload.status);
    const otpVerified =
        payload.otpVerified === true ||
        payload.otpVerified === 'true' ||
        status === 'completed' ||
        status === 'converted'
            ? true
            : payload.otpVerified === false || payload.otpVerified === 'false'
              ? false
              : null;

    return {
        id: row.id,
        createdAt: row.created_at,
        type,
        sourceCategory: 'growth_audit' as const,
        status,
        name,
        businessName:
            String(payload.businessName || business.name || business.businessName || '').trim() ||
            null,
        service,
        serviceLabel,
        address: String(payload.address || business.address || '').trim() || null,
        city: String(payload.city || business.city || '').trim() || null,
        website: String(payload.website || business.website || '').trim() || null,
        email,
        phone,
        scoreTotal,
        sharePath,
        reportUrl: sharePath ? `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}` : null,
        source: String(payload.source || type || '').trim() || null,
        auditId: String(payload.auditId || row.audit_id || '').trim() || null,
        pageUrl: String(payload.pageUrl || '').trim() || null,
        planId: String(payload.planId || '').trim() || null,
        otpVerified
    };
}

function cleanBusinessCategory(raw: any): string | null {
    if (!raw) return null;
    const clean = String(raw).trim().replace(/\s+/g, ' ');
    if (!clean || /^sheet\s*\d+$/i.test(clean)) return null;

    const lower = clean.toLowerCase();

    if (lower === 'garage' || lower === 'garages') return 'Garage';
    if (lower.includes('dog grooming') || lower.includes('pet service')) return 'Dog Grooming Pet Services';
    if (lower.includes('plumb')) return 'Plumbing';
    if (lower.includes('beauty') || lower.includes('aesthetics') || lower.includes('hair')) return 'Beauty Hair Aesthetics';
    if (lower.includes('physio') || lower.includes('sports therapy')) return 'Physiotherapy Sports Therapy';
    if (lower.includes('driving school') || lower.includes('driving instructor')) return 'Driving Schools';
    if (lower.includes('pest')) return 'Pestcontrol';
    if (lower.includes('landscap') || lower.includes('garden')) return 'Landscaping';
    if (lower.includes('dent')) return 'Dental';
    if (lower.includes('damp')) return 'Dampproofing';
    if (lower.includes('skin')) return 'Skin Care';
    if (lower.includes('care home') || lower.includes('nursing home')) return 'Care Homes';
    if (lower.includes('personal trainer') || lower.includes('fitness trainer')) return 'Personal Trainers';
    if (lower.includes('clean')) return 'Cleaning Services';
    if (lower.includes('electric')) return 'Electricians';
    if (lower.includes('tutor') || lower.includes('tuition')) return 'Private Tutors & Tuition Centre';

    return clean
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function mapSalesLeadToAdminLead(row: any) {
    const isExcel = row.source === 'excel_import' || String(row.source || '').toLowerCase().includes('excel');
    const ind = cleanBusinessCategory(row.industry);
    return {
        id: row.id,
        createdAt: row.created_at,
        type: isExcel ? 'excel_import' : 'added_lead',
        sourceCategory: 'added' as const,
        status: row.status || 'new',
        name: row.contact_name || row.name || null,
        businessName: row.company_name || row.name || null,
        service: ind,
        serviceLabel: ind,
        industry: ind,
        address: String(row.address || '').trim() || null,
        city: String(row.city || '').trim() || null,
        website: String(row.website || '').trim() || null,
        email: row.email ? String(row.email).trim().toLowerCase() : null,
        phone: String(row.phone || '').trim() || null,
        scoreTotal: null,
        sharePath: null,
        reportUrl: null,
        source: isExcel ? 'Excel Import' : (row.source || 'Added Lead'),
        auditId: null,
        pageUrl: null,
        planId: null,
        otpVerified: true,
        opportunityLevel: row.opportunity_level || null,
        leadOpportunity: row.lead_opportunity || null,
        gbpObservation: row.gbp_observation || null,
        aiVisibilityObservation: row.ai_visibility_observation || null,
        isCustomer: Boolean(row.is_customer),
        convertedAt: row.converted_at || null,
        updatedAt: row.updated_at || row.created_at,
        notes: row.notes || null,
        assignedTo: row.assigned_to || null,
        assignedAgentName: row.assignedAgentName || row.assigned_agent_name || null,
        assignedAgentEmail: row.assignedAgentEmail || row.assigned_agent_email || null,
        importBatchId: row.import_batch_id || null,
        importFileName: row.import_file_name || '',
        importUploadedAt: row.import_uploaded_at || null,
        spreadsheetStatus: row.spreadsheet_status || '',
        spreadsheetStatus1: row.spreadsheet_status_1 || '',
        spreadsheetStatus2: row.spreadsheet_status_2 || '',
        spreadsheetStatus3: row.spreadsheet_status_3 || ''
    };
}

async function fetchAdminLeadMetadataMap(leadIds: string[]) {
    if (!leadIds.length) return new Map<string, any>();
    const map = new Map<string, any>();
    const origin = zappSitesOrigin();

    
    try {
        const { rows: subRows } = await query(
            `SELECT s.id, s.created_at, s.email AS submission_email, s.payload,
                    a.id AS audit_id, a.data AS audit_data
             FROM submissions s
             LEFT JOIN audits a ON a.id::text = s.payload->>'auditId'
             WHERE s.id::text = ANY($1::text[])`,
            [leadIds]
        );

        for (const row of subRows) {
            const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
            const auditData = row.audit_data && typeof row.audit_data === 'object' ? row.audit_data : {};
            const business = auditData.business && typeof auditData.business === 'object' ? auditData.business : {};
            const sharePath = String(payload.sharePath || '').trim() || null;
            const scoreRaw = payload.scoreTotal ?? auditData.scoreTotal ?? auditData.score?.total ?? null;

            const serviceRaw =
                String(payload.service || payload.primaryService || payload.businessType || payload.serviceLabel || '').trim() ||
                null;
            map.set(String(row.id), {
                id: String(row.id),
                businessName: String(payload.businessName || business.name || 'Lead').trim(),
                phone: String(payload.phone || business.phone || '').trim(),
                email: String(payload.email || row.submission_email || business.email || '').trim().toLowerCase(),
                website: String(payload.website || business.website || '').trim(),
                address: String(payload.address || business.address || '').trim(),
                city: String(payload.city || business.city || '').trim(),
                scoreTotal: scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null,
                reportUrl: sharePath ? `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}` : null,
                source: String(payload.source || 'growth_audit').trim(),
                status: String(payload.status || 'new').trim().toLowerCase(),
                auditId: String(payload.auditId || row.audit_id || '').trim() || null,
                industry: cleanBusinessCategory(serviceRaw)
            });
        }
    } catch {}

    
    // 2. Query sales_leads for all IDs to overlay/merge CRM edits (email, phone, name, notes, etc.)
    try {
        const { rows: salesRows } = await query(
            `SELECT l.*, u.name AS assigned_agent_name, u.email AS assigned_agent_email
             FROM sales_leads l
             LEFT JOIN users u ON u.id = l.assigned_to
             WHERE l.id::text = ANY($1::text[])`,
            [leadIds]
        );
        for (const row of salesRows) {
            const auditId = String(row.audit_id || '').trim() || null;
            const idKey = String(row.id);
            const existing = map.get(idKey);
            map.set(idKey, {
                id: idKey,
                businessName: row.name || existing?.businessName || 'Lead',
                phone: row.phone || existing?.phone || '',
                email: (row.email || existing?.email || '').trim().toLowerCase(),
                website: row.website || existing?.website || '',
                address: row.address || existing?.address || '',
                city: existing?.city || '',
                scoreTotal: existing?.scoreTotal ?? null,
                reportUrl: existing?.reportUrl || (auditId ? `${zappSitesOrigin()}/audit-report/${auditId}` : null),
                source: row.source || existing?.source || 'sales_lead',
                auditId: auditId || existing?.auditId || null,
                industry: cleanBusinessCategory(row.industry) || existing?.industry || '',
                status: row.status || existing?.status || 'new',
                notes: row.notes || existing?.notes || null,
                gbpObservation: row.gbp_observation || existing?.gbpObservation || null,
                aiVisibilityObservation: row.ai_visibility_observation || existing?.aiVisibilityObservation || null,
                leadOpportunity: row.lead_opportunity || existing?.leadOpportunity || null,
                opportunityLevel: row.opportunity_level || existing?.opportunityLevel || null,
                isCustomer: Boolean(row.is_customer ?? existing?.isCustomer),
                convertedAt: row.converted_at || existing?.convertedAt || null,
                assignedTo: row.assigned_to || existing?.assignedTo || null,
                assignedAgentName: row.assigned_agent_name || existing?.assignedAgentName || null,
                spreadsheetStatus: row.spreadsheet_status || existing?.spreadsheetStatus || '',
                spreadsheetStatus1: row.spreadsheet_status_1 || existing?.spreadsheetStatus1 || '',
                spreadsheetStatus2: row.spreadsheet_status_2 || existing?.spreadsheetStatus2 || '',
                spreadsheetStatus3: row.spreadsheet_status_3 || existing?.spreadsheetStatus3 || '',
                importBatchId: row.import_batch_id || null,
                importFileName: row.import_file_name || null,
                updatedAt: row.updated_at || row.created_at || existing?.updatedAt || null
            });
        }
    } catch {}

    // 3. Query lead_tasks for assigned agents to sync with tasks
    try {
        const { rows: taskRows } = await query(
            `SELECT t.lead_id, t.assigned_to_user_id, u.name AS assigned_agent_name, u.email AS assigned_agent_email
             FROM lead_tasks t
             LEFT JOIN users u ON u.id = t.assigned_to_user_id
             WHERE t.lead_id = ANY($1::text[]) AND t.assigned_to_user_id IS NOT NULL`,
            [leadIds]
        );
        for (const row of taskRows) {
            const idKey = String(row.lead_id);
            const existing = map.get(idKey);
            if (existing) {
                if (!existing.assignedTo) {
                    existing.assignedTo = row.assigned_to_user_id;
                    existing.assignedAgentName = row.assigned_agent_name || row.assigned_agent_email || null;
                }
            }
        }
    } catch {}

    return map;
}

export {
    zappSitesOrigin,
    growthAuditTablesMissing,
    ADMIN_LEAD_TYPES,
    normalizeLeadStatus,
    mapAdminLead,
    cleanBusinessCategory,
    mapSalesLeadToAdminLead,
    fetchAdminLeadMetadataMap
};
