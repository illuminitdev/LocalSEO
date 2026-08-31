function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'booking';
}

async function uniqueOrgSlug(base, queryFn) {
    let slug = slugify(base);
    let attempt = 0;
    while (attempt < 20) {
        const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
        const { rows } = await queryFn('SELECT id FROM organizations WHERE slug = $1', [candidate]);
        if (!rows.length) return candidate;
        attempt += 1;
    }
    return `${slug}-${Date.now().toString(36)}`;
}

async function uniqueEventSlug(orgId, base, queryFn) {
    let slug = slugify(base);
    let attempt = 0;
    while (attempt < 20) {
        const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
        const { rows } = await queryFn('SELECT id FROM event_types WHERE org_id = $1 AND slug = $2', [orgId, candidate]);
        if (!rows.length) return candidate;
        attempt += 1;
    }
    return `${slug}-${Date.now().toString(36)}`;
}

module.exports = { slugify, uniqueOrgSlug, uniqueEventSlug };
