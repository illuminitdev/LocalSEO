export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'na';

export type AuditCheck = {
    id: string;
    label: string;
    status: CheckStatus;
    evidence?: string;
    pillar: string;
};

export type PillarScore = {
    id: string;
    name: string;
    score: number;
    max: 10;
    checks: AuditCheck[];
};

export type ScoreBand = 'strong' | 'good' | 'gaps' | 'weak';

export type VisibilityScore = {
    total: number;
    max: 100;
    band: ScoreBand;
    bandLabel: string;
    pillars: PillarScore[];
    checks: AuditCheck[];
    passCount: number;
    failCount: number;
    unknownCount: number;
};

export type NapCompareResult = {
    name: { claimed: string; google: string; match: CheckStatus };
    phone: { claimed: string; google: string; match: CheckStatus };
    address: { claimed: string; google: string; match: CheckStatus };
    website: { claimed: string; google: string; match: CheckStatus };
    overall: CheckStatus;
};

export type LocalRankResult = {
    query: string;
    measured: boolean;
    position: number | null;
    inTop10: boolean;
    label: string;
    results: Array<{
        position: number;
        placeId: string;
        name: string;
        address: string;
        rating: number | null;
        reviewsCount: number;
        lat: number | null;
        lng: number | null;
        mapsUrl: string;
        isThisBusiness: boolean;
    }>;
    top5: Array<{
        position: number;
        placeId: string;
        name: string;
        address: string;
        rating: number | null;
        reviewsCount: number;
        lat: number | null;
        lng: number | null;
        mapsUrl: string;
        isThisBusiness: boolean;
    }>;
};

export type AiReport = {
    headline: string;
    executiveSummary: string;
    overallVerdict: string;
    scoreComment: string;
    strengths: string[];
    findings: Array<{
        title: string;
        detail: string;
        impact: 'High' | 'Medium' | 'Low';
        area: 'Website' | 'GBP' | 'NAP' | 'Reviews' | 'Maps' | 'Optimisation';
    }>;
    priorityFixes: Array<{
        title: string;
        why: string;
        action: string;
        suggestedPackage: string;
    }>;
    gbpNote: string;
    offerLine: string;
    closingLine: string;
};

export type VisibilityAuditResult = {
    id: string;
    createdAt: string;
    input: {
        businessName: string;
        address: string;
        city: string;
        service: string;
        website: string;
        phone: string;
        contactName?: string;
        email?: string;
        notes?: string;
    };
    websiteCheck: import('./websiteCheck').WebsiteCheckResult;
    gbpLookup: {
        found: boolean;
        placeId: string;
        name: string;
        address: string;
        phone: string;
        website: string;
        mapsUrl: string;
        categories: string[];
        hours: string;
        hasHours: boolean;
        photoCount: number;
        hasPhotos: boolean;
        description: string;
        hasDescription: boolean;
        hasServices: boolean;
        hasPosts: boolean;
        rating: number | null;
        reviewCount: number;
        reviewsSample: Array<{
            author: string;
            rating: number;
            date: string;
            text: string;
            ownerReplied: 'unknown';
        }>;
        ownerRepliesStatus: 'unknown';
        lat: number | null;
        lng: number | null;
        localRank: LocalRankResult;
    };
    napCompare: NapCompareResult;
    score: VisibilityScore;
    aiReport: AiReport | null;
    scoreNote: string;
};
