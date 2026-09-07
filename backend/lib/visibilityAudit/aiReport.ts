import type { AiReport, VisibilityAuditResult } from './types';

function parseJsonFromText(text: string) {
    if (!text) return null;
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
        return null;
    }
}

function fallbackReport(ctx: VisibilityAuditResult): AiReport {
    const pos = ctx.gbpLookup.localRank;
    const nearLine = pos.measured
        ? pos.position != null
            ? `#${pos.position} for “${pos.query}”`
            : `not in the top 10 for “${pos.query}”`
        : 'near-me ranking was not measured';

    const fails = ctx.score.checks.filter((c) => c.status === 'fail').slice(0, 6);
    const findings: AiReport['findings'] = fails.map((f) => ({
        title: f.label,
        detail: f.evidence || f.label,
        impact: 'High' as const,
        area: (f.pillar === 'website'
            ? 'Website'
            : f.pillar === 'nap'
              ? 'NAP'
              : f.pillar === 'reviews'
                ? 'Reviews'
                : f.pillar === 'maps' || f.pillar === 'near_me'
                  ? 'Maps'
                  : f.pillar === 'optimisation'
                    ? 'Optimisation'
                    : 'GBP') as AiReport['findings'][0]['area']
    }));

    while (findings.length < 4) {
        findings.push({
            title: 'Keep improving local signals',
            detail: 'Strengthen GBP completeness, reviews, and local keyword visibility.',
            impact: 'Medium',
            area: 'GBP'
        });
    }

    const priorityFixes: AiReport['priorityFixes'] = fails.slice(0, 3).map((f) => ({
        title: f.label,
        why: f.evidence || 'This check failed in the visibility audit.',
        action: 'Open the matching Local SEO tool and update the listing.',
        suggestedPackage: 'Local Presence'
    }));
    while (priorityFixes.length < 3) {
        priorityFixes.push({
            title: 'Improve near-me visibility',
            why: `Currently ${nearLine}.`,
            action: 'Publish posts, gather reviews, and refine primary category/service.',
            suggestedPackage: 'Local Growth'
        });
    }

    return {
        headline: `${ctx.input.businessName}: Local Visibility Score ${ctx.score.total}/100`,
        executiveSummary: `${ctx.input.businessName} in ${ctx.input.city || 'your area'} scored ${ctx.score.total} out of 100 (${ctx.score.bandLabel}). Measured near-me result: ${nearLine}.`,
        overallVerdict: ctx.score.bandLabel,
        scoreComment: `Score is out of 100 across website reachability, GBP/Maps listing, NAP, reviews/replies, profile optimisation, and local “service near town” visibility. Deep website crawling is not required.`,
        strengths: ctx.score.checks.filter((c) => c.status === 'pass').slice(0, 4).map((c) => c.label),
        findings: findings.slice(0, 6),
        priorityFixes: priorityFixes.slice(0, 3),
        gbpNote: ctx.gbpLookup.found
            ? `Found on Google Maps${ctx.gbpLookup.rating != null ? ` at ${ctx.gbpLookup.rating}★` : ''}${ctx.gbpLookup.reviewCount ? ` with ${ctx.gbpLookup.reviewCount} reviews` : ''}.`
            : 'No clear Google Maps listing was found for the claimed details.',
        offerLine: 'We can help close these gaps with Local Presence or Local Growth.',
        closingLine: 'Start with the three priority fixes — then re-run the audit to track progress.'
    };
}

export async function generateAiReport(
    ctx: VisibilityAuditResult,
    generateText: (prompt: string) => Promise<string>
): Promise<AiReport> {
    const measured = {
        businessName: ctx.input.businessName,
        city: ctx.input.city,
        service: ctx.input.service,
        score: ctx.score.total,
        band: ctx.score.bandLabel,
        websiteCheck: ctx.websiteCheck,
        gbp: {
            found: ctx.gbpLookup.found,
            name: ctx.gbpLookup.name,
            rating: ctx.gbpLookup.rating,
            reviewCount: ctx.gbpLookup.reviewCount,
            mapsUrl: ctx.gbpLookup.mapsUrl,
            ownerRepliesStatus: ctx.gbpLookup.ownerRepliesStatus
        },
        nap: ctx.napCompare,
        localRank: {
            query: ctx.gbpLookup.localRank.query,
            position: ctx.gbpLookup.localRank.position,
            inTop10: ctx.gbpLookup.localRank.inTop10,
            label: ctx.gbpLookup.localRank.label
        },
        failedChecks: ctx.score.checks.filter((c) => c.status === 'fail').map((c) => ({ id: c.id, label: c.label, evidence: c.evidence })),
        passedChecks: ctx.score.checks.filter((c) => c.status === 'pass').map((c) => c.label)
    };

    try {
        const text = await generateText(
            `You are writing a Free Local Visibility Audit report for a UK local business.
Use UK English. Commercial but honest. Do NOT invent ratings, review counts, replies, or rankings — only use the measured JSON below.
If near-me position exists, say it plainly (e.g. “#2 for plumbers near Manchester” or “not in the top 10”).
Include 4–6 findings and exactly 3 priorityFixes.
Return JSON only:
{"headline":"","executiveSummary":"","overallVerdict":"","scoreComment":"","strengths":[],"findings":[{"title":"","detail":"","impact":"High|Medium|Low","area":"Website|GBP|NAP|Reviews|Maps|Optimisation"}],"priorityFixes":[{"title":"","why":"","action":"","suggestedPackage":""}],"gbpNote":"","offerLine":"","closingLine":""}

Measured data:
${JSON.stringify(measured)}`
        );
        const data = parseJsonFromText(text);
        if (!data?.headline || !Array.isArray(data.priorityFixes) || data.priorityFixes.length < 3) {
            return fallbackReport(ctx);
        }
        return {
            headline: String(data.headline || ''),
            executiveSummary: String(data.executiveSummary || ''),
            overallVerdict: String(data.overallVerdict || ctx.score.bandLabel),
            scoreComment: String(
                data.scoreComment ||
                    'Score is out of 100 across website reachability, GBP/Maps listing, NAP, reviews/replies, profile optimisation, and local “service near town” visibility. Deep website crawling is not required.'
            ),
            strengths: Array.isArray(data.strengths) ? data.strengths.map(String).slice(0, 8) : [],
            findings: (Array.isArray(data.findings) ? data.findings : []).slice(0, 6).map((f: any) => ({
                title: String(f.title || ''),
                detail: String(f.detail || ''),
                impact: ['High', 'Medium', 'Low'].includes(f.impact) ? f.impact : 'Medium',
                area: ['Website', 'GBP', 'NAP', 'Reviews', 'Maps', 'Optimisation'].includes(f.area) ? f.area : 'GBP'
            })),
            priorityFixes: data.priorityFixes.slice(0, 3).map((f: any) => ({
                title: String(f.title || ''),
                why: String(f.why || ''),
                action: String(f.action || ''),
                suggestedPackage: String(f.suggestedPackage || 'Local Presence')
            })),
            gbpNote: String(data.gbpNote || ''),
            offerLine: String(data.offerLine || ''),
            closingLine: String(data.closingLine || '')
        };
    } catch (err: any) {
        console.warn('[visibilityAudit] AI report failed, using fallback:', err.message);
        return fallbackReport(ctx);
    }
}
