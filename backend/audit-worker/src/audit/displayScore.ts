const PILLAR_KEYS = ['local_seo', 'aeo', 'geo'] as const;
const DEFAULT_WEIGHT: Record<string, number> = { local_seo: 40, aeo: 30, geo: 30 };

/** Each pillar box in the report is shown under 60. */
export const REPORT_SCORE_CAP = 59;

type PillarLike = { id?: string; score?: unknown; weight?: unknown };

export function displayedOverallScore(
    score: { triad?: Record<string, PillarLike>; pillars?: PillarLike[]; total?: unknown } | null | undefined,
    fallback: number | null = null
): number | null {
    const pillars = Array.isArray(score?.pillars) ? score!.pillars! : [];
    const rows = PILLAR_KEYS.map((key) => {
        const base = score?.triad?.[key] || pillars.find((p) => p?.id === key) || null;
        const raw = Number(base?.score);
        if (!base || !Number.isFinite(raw)) return null;
        const weight = Number(base.weight) || DEFAULT_WEIGHT[key];
        return { score: Math.min(REPORT_SCORE_CAP, Math.max(0, Math.round(raw))), weight };
    }).filter((r): r is { score: number; weight: number } => r !== null);
    if (!rows.length) return fallback;
    const weightSum = rows.reduce((a, r) => a + r.weight, 0);
    return Math.round(
        weightSum > 0
            ? rows.reduce((a, r) => a + r.score * r.weight, 0) / weightSum
            : rows.reduce((a, r) => a + r.score, 0) / rows.length
    );
}
