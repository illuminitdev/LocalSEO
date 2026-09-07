export const VISIBILITY_AUDIT_STORAGE_KEY = 'localpulse_visibility_audit_report';

export const PRIMARY_SERVICES = [
    'Plumbers',
    'Electricians',
    'Roofers',
    'Builders',
    'Locksmiths',
    'Cleaners',
    'Gardeners',
    'Painters and decorators',
    'Heating engineers',
    'Carpenters',
    'Dentists',
    'Solicitors',
    'Accountants',
    'Estate agents',
    'Hairdressers',
    'Restaurants',
    'Cafes',
    'Other'
] as const;

export type VisibilityAuditReport = {
    id: string;
    createdAt: string;
    input: {
        businessName: string;
        address: string;
        city: string;
        service: string;
        website: string;
        phone: string;
    };
    websiteCheck: any;
    gbpLookup: any;
    napCompare: any;
    score: any;
    aiReport: any;
    scoreNote: string;
};

export function saveVisibilityAuditReport(report: VisibilityAuditReport) {
    sessionStorage.setItem(VISIBILITY_AUDIT_STORAGE_KEY, JSON.stringify(report));
}

export function loadVisibilityAuditReport(): VisibilityAuditReport | null {
    try {
        const raw = sessionStorage.getItem(VISIBILITY_AUDIT_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function fixPathForCheck(checkId: string): { path: string; label: string } {
    if (checkId.startsWith('website')) return { path: '/profile?from=visibility-audit&check=website', label: 'Fix website on profile' };
    if (checkId.startsWith('nap') || checkId === 'gbp_name_match' || checkId === 'gbp_listed') {
        return { path: '/profile?from=visibility-audit&check=nap', label: 'Fix NAP / listing' };
    }
    if (checkId.startsWith('opt_photos')) return { path: '/media?from=visibility-audit&check=photos', label: 'Add photos' };
    if (checkId.startsWith('opt_posts')) return { path: '/posts?from=visibility-audit&check=posts', label: 'Create a post' };
    if (checkId.startsWith('opt_')) return { path: '/profile?from=visibility-audit&check=optimisation', label: 'Improve profile' };
    if (checkId.startsWith('has_reviews') || checkId.startsWith('rating') || checkId.includes('replies') || checkId === 'reviews_recent') {
        return { path: '/reviews?from=visibility-audit&check=reviews', label: 'Manage reviews' };
    }
    if (checkId === 'near_me' || checkId.startsWith('maps')) {
        return { path: '/rank-tracker?from=visibility-audit&check=near_me', label: 'Improve near-me visibility' };
    }
    return { path: '/profile?from=visibility-audit&check=general', label: 'Fix this' };
}
