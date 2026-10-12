import { Router, Request, Response } from 'express';
import { query } from './db';
import { loadOrgAppState } from './orgAppState';
import { sendMail } from './bookingEmail';

export const REVIEW_SOURCES = ['qr', 'nfc', 'receipt', 'email', 'sms', 'link'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export function normalizeSource(value: unknown): ReviewSource {
    const v = String(value || '').toLowerCase().trim();
    return (REVIEW_SOURCES as readonly string[]).includes(v) ? (v as ReviewSource) : 'link';
}

function frontendOrigin() {
    return (process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

export function reviewLink(orgSlug: string, source: ReviewSource = 'qr') {
    return `${frontendOrigin()}/r/${encodeURIComponent(orgSlug)}?s=${source}`;
}

export function googleReviewUrl(placeId?: string | null) {
    const id = String(placeId || '').trim();
    return id ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}` : '';
}

async function orgBySlug(slug: string) {
    const { rows } = await query('SELECT id, slug, name FROM organizations WHERE slug = $1', [slug]);
    return rows[0] || null;
}

export async function orgSlugFor(orgId: string) {
    const { rows } = await query('SELECT slug FROM organizations WHERE id = $1', [orgId]);
    return rows[0]?.slug ? String(rows[0].slug) : '';
}

export function mapSubmission(r: any) {
    return {
        id: String(r.id),
        source: String(r.source),
        rating: Number(r.rating),
        name: String(r.name || ''),
        email: String(r.email || ''),
        comment: String(r.comment || ''),
        isRead: Boolean(r.is_read),
        replyText: r.reply_text ? String(r.reply_text) : '',
        repliedAt: r.replied_at ? new Date(r.replied_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString()
    };
}

export async function listSubmissions(orgId: string) {
    const { rows } = await query(
        'SELECT * FROM review_submissions WHERE org_id = $1 ORDER BY created_at DESC LIMIT 300',
        [orgId]
    );
    return rows.map(mapSubmission);
}

/** Reviews collected per source over the last N days. */
export async function sourceCounts(orgId: string, days = 30) {
    const { rows } = await query(
        `SELECT source, COUNT(*)::int AS n FROM review_submissions
         WHERE org_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval GROUP BY source`,
        [orgId, String(days)]
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r.source)] = Number(r.n);
    return out;
}

export async function markRead(orgId: string, id: string) {
    await query('UPDATE review_submissions SET is_read = TRUE WHERE id = $1 AND org_id = $2', [id, orgId]);
}

export async function saveReply(orgId: string, id: string, text: string) {
    const { rows } = await query(
        `UPDATE review_submissions SET reply_text = $3, replied_at = NOW(), is_read = TRUE
         WHERE id = $1 AND org_id = $2 RETURNING *`,
        [id, orgId, text]
    );
    return rows[0] ? mapSubmission(rows[0]) : null;
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export async function emailReviewRequest(to: string, businessName: string, link: string, message?: string) {
    const intro = message?.trim() || `Thanks for choosing ${businessName}. Could you spare 30 seconds to tell us how we did?`;
    await sendMail({
        to,
        subject: `How was your experience with ${businessName}?`,
        text: `${intro}\n\nLeave a quick review: ${link}\n\n– ${businessName}`,
        html: `<p>${esc(intro)}</p><p><a href="${esc(link)}" style="display:inline-block;background:#F59E0B;color:#0F172A;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Leave a review</a></p><p style="color:#64748B">– ${esc(businessName)}</p>`
    });
}

export async function emailReviewReply(to: string, businessName: string, reply: string) {
    await sendMail({
        to,
        subject: `${businessName} replied to your review`,
        text: `${reply}\n\n– ${businessName}`,
        html: `<p>${esc(reply).replace(/\n/g, '<br/>')}</p><p style="color:#64748B">– ${esc(businessName)}</p>`
    });
}

// ── Public review page API (no login): GET org info, POST a review ─────────────
const hits = new Map<string, number[]>();
function rateLimited(key: string) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= 5) return true;
    recent.push(now);
    hits.set(key, recent);
    return false;
}

export function createPublicReviewRouter() {
    const router = Router();

    router.get('/:orgSlug', async (req: Request, res: Response) => {
        try {
            const org = await orgBySlug(String(req.params.orgSlug));
            if (!org) return res.status(404).json({ error: 'Business not found' });
            const state = await loadOrgAppState(String(org.id));
            res.json({
                businessName: state.business?.name || org.name,
                category: state.business?.category || '',
                googleReviewUrl: googleReviewUrl(state.business?.placeId)
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:orgSlug', async (req: Request, res: Response) => {
        try {
            if (String(req.body?.website || '').trim()) return res.json({ ok: true }); // honeypot
            const org = await orgBySlug(String(req.params.orgSlug));
            if (!org) return res.status(404).json({ error: 'Business not found' });
            if (rateLimited(`${req.ip}:${org.id}`)) {
                return res.status(429).json({ error: 'Too many reviews from this device. Please try again later.' });
            }
            const rating = Math.round(Number(req.body?.rating));
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Please choose a star rating.' });
            }
            const name = String(req.body?.name || '').trim().slice(0, 80);
            const email = String(req.body?.email || '').trim().slice(0, 160);
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ error: 'That email address does not look right.' });
            }
            const comment = String(req.body?.comment || '').trim().slice(0, 2000);
            await query(
                `INSERT INTO review_submissions (org_id, source, rating, name, email, comment) VALUES ($1,$2,$3,$4,$5,$6)`,
                [org.id, normalizeSource(req.body?.source), rating, name, email, comment]
            );
            const state = await loadOrgAppState(String(org.id));
            res.json({ ok: true, googleReviewUrl: rating >= 4 ? googleReviewUrl(state.business?.placeId) : '' });
        } catch (err: any) {
            console.error('[reviews] public submit failed:', err?.message || err);
            res.status(500).json({ error: 'Could not save your review. Please try again.' });
        }
    });

    return router;
}
