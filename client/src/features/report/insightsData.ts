// AI Insights figures computed from saved checks (no paid calls).

/** Your share of all top-3 spots checked (older reports stored share vs the top 2 only). */
export function sharePct(h: any) {
    const total = Number(h?.totalSlots) || 0;
    if (h?.share?.others == null && total) return Math.round(((Number(h?.youSlots) || 0) / total) * 100);
    return Number(h?.share?.you) || 0;
}

/** Competitors in one check, by top-3 spots held, with their best review count and rating. */
export function packCompetitors(h: any) {
    const map = new Map<string, { name: string; slots: number; reviews: number; rating: number }>();
    for (const p of h?.packs || []) {
        for (const r of p?.top3 || []) {
            if (r?.isYou || !r?.name) continue;
            const key = String(r.name).toLowerCase();
            const cur = map.get(key) || { name: String(r.name), slots: 0, reviews: 0, rating: 0 };
            cur.slots += 1;
            cur.reviews = Math.max(cur.reviews, Number(r.reviews) || 0);
            cur.rating = Number(r.rating) || cur.rating;
            map.set(key, cur);
        }
    }
    return [...map.values()].sort((a, b) => b.slots - a.slots || b.reviews - a.reviews);
}
