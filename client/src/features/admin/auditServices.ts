/** Service choices for Full Audit (mirrors ZappSites auditServices). */

export type AuditServiceOption = {
    id: string;
    label: string;
    search: string;
    tradeId: string;
};

export const AUDIT_SERVICE_OPTIONS: AuditServiceOption[] = [
    { id: 'plumbers', label: 'Plumbers', search: 'plumber', tradeId: 'plumbing' },
    { id: 'electricians', label: 'Electricians', search: 'electrician', tradeId: 'electrician' },
    { id: 'cleaning', label: 'Cleaning', search: 'cleaners', tradeId: 'cleaning' },
    {
        id: 'valeters',
        label: 'Mobile car valeters & Detailers',
        search: 'car valet',
        tradeId: 'general'
    },
    {
        id: 'pressure-washing',
        label: 'Pressure washing',
        search: 'pressure washing',
        tradeId: 'general'
    },
    { id: 'pest-control', label: 'Pest Control', search: 'pest control', tradeId: 'pest-control' },
    {
        id: 'gardeners',
        label: 'Gardeners & Landscapers',
        search: 'gardener',
        tradeId: 'general'
    },
    { id: 'salons', label: 'Salons & Beauty', search: 'beauty salon', tradeId: 'general' },
    {
        id: 'personal-trainers',
        label: 'Personal Trainers',
        search: 'personal trainer',
        tradeId: 'general'
    },
    { id: 'restaurants', label: 'Restaurants', search: 'restaurant', tradeId: 'general' },
    {
        id: 'professional',
        label: 'Professional Services',
        search: 'professional services',
        tradeId: 'general'
    },
    {
        id: 'small-business',
        label: 'Small Businesses',
        search: 'local business',
        tradeId: 'general'
    },
    { id: 'other', label: 'Other', search: '', tradeId: 'general' }
];

export function resolveAuditService(input: {
    serviceId?: string;
    serviceOther?: string;
    service?: string;
}) {
    const id = String(input.serviceId || '').trim();
    const other = String(input.serviceOther || '').trim();
    const raw = String(input.service || '').trim();

    if (id === 'other') {
        const phrase = other || raw;
        return {
            serviceId: 'other',
            serviceLabel: phrase || 'Other',
            service: phrase,
            tradeId: 'general'
        };
    }

    const opt = AUDIT_SERVICE_OPTIONS.find((o) => o.id === id);
    if (opt) {
        return {
            serviceId: opt.id,
            serviceLabel: opt.label,
            service: opt.search,
            tradeId: opt.tradeId
        };
    }

    if (raw) {
        return {
            serviceId: id || 'other',
            serviceLabel: raw,
            service: raw,
            tradeId: 'general'
        };
    }

    return null;
}
