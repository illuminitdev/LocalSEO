

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

/** Match a lead industry or service to the audit dropdown. Unknown names use Other. */
export function matchAuditServiceOption(raw: string): { serviceId: string; serviceOther: string } {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return { serviceId: '', serviceOther: '' };
    const norm = text.toLowerCase();
    const options = AUDIT_SERVICE_OPTIONS.filter((o) => o.id !== 'other');
    let best: { id: string; score: number } | null = null;
    for (const option of options) {
        const label = option.label.toLowerCase();
        const search = option.search.toLowerCase();
        let score = 0;
        if (option.id === norm || label === norm || search === norm) score = 100;
        else if (search.length >= 4 && norm.includes(search)) score = 80 + search.length;
        else if (norm.length >= 4 && label.includes(norm)) score = 70 + norm.length;
        else if (label.length >= 4 && norm.includes(label)) score = 60 + label.length;
        else {
            const token = search.split(/\s+/).find((word) => word.length >= 4);
            const stem = token ? token.slice(0, Math.min(5, token.length)) : '';
            if (stem.length >= 4 && norm.includes(stem)) score = 40 + stem.length;
        }
        if (score > 0 && (!best || score > best.score)) best = { id: option.id, score };
    }
    if (best) return { serviceId: best.id, serviceOther: '' };
    return { serviceId: 'other', serviceOther: text };
}

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
