import type { AuditCheck, CheckStatus, PillarScore, ScoreBand, VisibilityScore } from './types';
import type { WebsiteCheckResult } from './websiteCheck';
import type { NapCompareResult } from './types';
import type { LocalRankResult } from './types';

function pillarScoreFromChecks(checks: AuditCheck[]): number {
    const usable = checks.filter((c) => c.status === 'pass' || c.status === 'fail');
    if (!usable.length) return 0;
    const passes = usable.filter((c) => c.status === 'pass').length;
    return Math.round((passes / usable.length) * 10);
}

function bandFor(total: number): { band: ScoreBand; bandLabel: string } {
    if (total >= 80) return { band: 'strong', bandLabel: 'Strong local presence' };
    if (total >= 60) return { band: 'good', bandLabel: 'Good foundation' };
    if (total >= 40) return { band: 'gaps', bandLabel: 'Clear gaps to fix' };
    return { band: 'weak', bandLabel: 'Weak local visibility' };
}

function check(id: string, label: string, status: CheckStatus, pillar: string, evidence?: string): AuditCheck {
    return { id, label, status, pillar, evidence };
}

export function computeVisibilityScore(input: {
    websiteCheck: WebsiteCheckResult;
    gbpFound: boolean;
    gbpNameMatch: CheckStatus;
    nap: NapCompareResult;
    rating: number | null;
    reviewCount: number;
    reviewsLookRecent: CheckStatus;
    ownerReplies: CheckStatus;
    hasHours: boolean;
    hasCategories: boolean;
    hasPhotos: boolean;
    hasServices: boolean;
    hasDescription: boolean;
    hasPosts: boolean;
    mapsListed: boolean;
    mapsUrl: string;
    localRank: LocalRankResult;
}): VisibilityScore {
    const websitePillarChecks: AuditCheck[] = [
        check(
            'website_exists',
            'Website provided & reachable',
            input.websiteCheck.provided && input.websiteCheck.reachable ? 'pass' : 'fail',
            'website',
            input.websiteCheck.note
        ),
        check(
            'website_https',
            'Website uses HTTPS',
            !input.websiteCheck.provided
                ? 'na'
                : input.websiteCheck.reachable
                  ? input.websiteCheck.https
                      ? 'pass'
                      : 'fail'
                  : 'na',
            'website',
            input.websiteCheck.https ? 'HTTPS' : 'Not HTTPS'
        )
    ];

    const gbpNameChecks: AuditCheck[] = [
        check('gbp_listed', 'Listed on Google Maps', input.gbpFound ? 'pass' : 'fail', 'gbp_name'),
        check('gbp_name_match', 'GBP name matches claimed', input.gbpNameMatch, 'gbp_name')
    ];

    const napChecks: AuditCheck[] = [
        check('nap_name', 'Name matches Google', input.nap.name.match, 'nap', input.nap.name.google || undefined),
        check('nap_phone', 'Phone matches Google', input.nap.phone.match, 'nap', input.nap.phone.google || undefined),
        check('nap_address', 'Address matches Google', input.nap.address.match, 'nap', input.nap.address.google || undefined),
        check('nap_website', 'Website matches Google', input.nap.website.match, 'nap', input.nap.website.google || undefined)
    ];

    const reviewsChecks: AuditCheck[] = [
        check(
            'has_reviews',
            'Has reviews',
            input.reviewCount > 0 ? 'pass' : input.gbpFound ? 'fail' : 'unknown',
            'reviews',
            input.reviewCount ? `${input.reviewCount} reviews` : undefined
        ),
        check(
            'rating_ge_4',
            'Rating ≥ 4.0',
            input.rating == null ? (input.gbpFound ? 'fail' : 'unknown') : input.rating >= 4 ? 'pass' : 'fail',
            'reviews',
            input.rating != null ? `${input.rating}★` : undefined
        ),
        check('reviews_recent', 'Reviews look recent', input.reviewsLookRecent, 'reviews'),
        check(
            'owner_replies',
            'Owner replies to reviews',
            input.ownerReplies,
            'reviews',
            input.ownerReplies === 'unknown' ? 'Check Google Maps — Places API does not expose replies' : undefined
        )
    ];

    const optChecks: AuditCheck[] = [
        check('opt_hours', 'Opening hours set', input.gbpFound ? (input.hasHours ? 'pass' : 'fail') : 'unknown', 'optimisation'),
        check(
            'opt_categories',
            'Categories set',
            input.gbpFound ? (input.hasCategories ? 'pass' : 'fail') : 'unknown',
            'optimisation'
        ),
        check('opt_photos', 'Photos present', input.gbpFound ? (input.hasPhotos ? 'pass' : 'fail') : 'unknown', 'optimisation'),
        check(
            'opt_services',
            'Services listed',
            input.gbpFound ? (input.hasServices ? 'pass' : 'unknown') : 'unknown',
            'optimisation',
            'Not exposed by Places API'
        ),
        check(
            'opt_description',
            'Description present',
            input.gbpFound ? (input.hasDescription ? 'pass' : 'fail') : 'unknown',
            'optimisation'
        ),
        check(
            'opt_posts',
            'Recent GBP posts',
            input.gbpFound ? (input.hasPosts ? 'pass' : 'unknown') : 'unknown',
            'optimisation',
            'Not exposed by Places API'
        )
    ];

    const mapsChecks: AuditCheck[] = [
        check('maps_listed', 'On Google Maps', input.mapsListed ? 'pass' : 'fail', 'maps'),
        check(
            'maps_url',
            'Public Maps / profile URL',
            input.mapsListed ? (input.mapsUrl ? 'pass' : 'fail') : 'fail',
            'maps',
            input.mapsUrl || undefined
        )
    ];

    let nearMeStatus: CheckStatus = 'unknown';
    let nearMeEvidence = 'Not measured';
    if (input.localRank.measured) {
        if (input.localRank.position != null && input.localRank.position <= 3) {
            nearMeStatus = 'pass';
            nearMeEvidence = `#${input.localRank.position} for “${input.localRank.query}”`;
        } else {
            nearMeStatus = 'fail';
            nearMeEvidence =
                input.localRank.position != null
                    ? `#${input.localRank.position} for “${input.localRank.query}”`
                    : `Not in the top 10 for “${input.localRank.query}”`;
        }
    }

    const nearMeChecks: AuditCheck[] = [
        check('near_me', 'Appears for service near town', nearMeStatus, 'near_me', nearMeEvidence)
    ];

    const pillars: PillarScore[] = [
        { id: 'website', name: 'Website live', score: pillarScoreFromChecks(websitePillarChecks), max: 10, checks: websitePillarChecks },
        { id: 'gbp_name', name: 'GBP name', score: pillarScoreFromChecks(gbpNameChecks), max: 10, checks: gbpNameChecks },
        { id: 'nap', name: 'NAP consistency', score: pillarScoreFromChecks(napChecks), max: 10, checks: napChecks },
        { id: 'reviews', name: 'Reviews & replies', score: pillarScoreFromChecks(reviewsChecks), max: 10, checks: reviewsChecks },
        { id: 'optimisation', name: 'GBP optimisation', score: pillarScoreFromChecks(optChecks), max: 10, checks: optChecks },
        { id: 'maps', name: 'Google Maps listing', score: pillarScoreFromChecks(mapsChecks), max: 10, checks: mapsChecks },
        { id: 'near_me', name: '“Near me” visibility', score: pillarScoreFromChecks(nearMeChecks), max: 10, checks: nearMeChecks }
    ];

    const sum = pillars.reduce((a, p) => a + p.score, 0);
    const total = Math.round((sum / 70) * 100);
    const { band, bandLabel } = bandFor(total);
    const checks = pillars.flatMap((p) => p.checks);

    return {
        total,
        max: 100,
        band,
        bandLabel,
        pillars,
        checks,
        passCount: checks.filter((c) => c.status === 'pass').length,
        failCount: checks.filter((c) => c.status === 'fail').length,
        unknownCount: checks.filter((c) => c.status === 'unknown' || c.status === 'na').length
    };
}
