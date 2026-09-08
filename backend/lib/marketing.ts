import { randomBytes } from 'crypto';
import { query } from './db';
import { sendMail } from './bookingEmail';

export async function ensureReferralCode(clientId: string, orgId: string) {
    const { rows } = await query(`SELECT * FROM clients WHERE id = $1 AND org_id = $2`, [clientId, orgId]);
    if (!rows.length) return null;
    if (rows[0].referral_code) return rows[0];
    const code = randomBytes(4).toString('hex');
    const { rows: updated } = await query(
        `UPDATE clients SET referral_code = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [code, clientId]
    );
    return updated[0];
}

export async function applyReferralCode(orgId: string, newClientId: string, code: string) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return null;
    const { rows: referrers } = await query(
        `SELECT * FROM clients WHERE org_id = $1 AND lower(referral_code) = $2 AND id <> $3 LIMIT 1`,
        [orgId, c, newClientId]
    );
    if (!referrers.length) return null;
    await query(
        `UPDATE clients SET referred_by_client_id = $1, updated_at = NOW() WHERE id = $2`,
        [referrers[0].id, newClientId]
    );
    await query(
        `UPDATE clients SET referral_credit_cents = referral_credit_cents + 1000, updated_at = NOW() WHERE id = $1`,
        [referrers[0].id]
    );
    return referrers[0];
}

export async function getPublicSite(orgSlug: string) {
    const { rows } = await query(
        `SELECT id, name, slug, phone, email, trade_type, service_area, host_name,
                site_headline, site_blurb, site_services, marketing_enabled
         FROM organizations WHERE slug = $1 LIMIT 1`,
        [orgSlug]
    );
    if (!rows.length || rows[0].marketing_enabled === false) return null;
    const { rows: events } = await query(
        `SELECT name, slug, duration_minutes, total_cents FROM event_types
         WHERE org_id = $1 AND active = TRUE ORDER BY sort_order, created_at LIMIT 12`,
        [rows[0].id]
    );
    return { org: rows[0], events };
}

export async function updateSiteContent(orgId: string, body: any) {
    const { rows } = await query(
        `UPDATE organizations SET
            site_headline = COALESCE($1, site_headline),
            site_blurb = COALESCE($2, site_blurb),
            site_services = COALESCE($3, site_services),
            marketing_enabled = COALESCE($4, marketing_enabled),
            updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [
            body.siteHeadline != null ? String(body.siteHeadline) : null,
            body.siteBlurb != null ? String(body.siteBlurb) : null,
            body.siteServices != null ? String(body.siteServices) : null,
            body.marketingEnabled != null ? Boolean(body.marketingEnabled) : null,
            orgId
        ]
    );
    return rows[0];
}

export async function listCampaigns(orgId: string) {
    const { rows } = await query(
        `SELECT * FROM campaigns WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [orgId]
    );
    return rows;
}

export async function createCampaign(orgId: string, body: any) {
    const { rows } = await query(
        `INSERT INTO campaigns (org_id, name, subject, body_text, body_html, status_filter)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
            orgId,
            String(body.name || 'Campaign'),
            String(body.subject || ''),
            String(body.bodyText || ''),
            String(body.bodyHtml || ''),
            String(body.statusFilter || 'active')
        ]
    );
    return rows[0];
}

export async function sendCampaign(orgId: string, campaignId: string) {
    const { rows: camps } = await query(`SELECT * FROM campaigns WHERE id = $1 AND org_id = $2`, [
        campaignId,
        orgId
    ]);
    if (!camps.length) throw Object.assign(new Error('Campaign not found'), { status: 404 });
    const campaign = camps[0];
    const status = campaign.status_filter || 'active';
    const { rows: clients } = await query(
        `SELECT * FROM clients WHERE org_id = $1 AND status = $2 AND trim(email) <> ''`,
        [orgId, status]
    );
    await query(`UPDATE campaigns SET status = 'sending' WHERE id = $1`, [campaignId]);
    let sent = 0;
    for (const client of clients) {
        try {
            await sendMail({
                to: client.email,
                subject: campaign.subject || campaign.name,
                text: campaign.body_text,
                html: campaign.body_html || undefined
            });
            await query(
                `INSERT INTO campaign_sends (campaign_id, client_id, to_email, status) VALUES ($1,$2,$3,'sent')`,
                [campaignId, client.id, client.email]
            );
            sent += 1;
        } catch (err: any) {
            await query(
                `INSERT INTO campaign_sends (campaign_id, client_id, to_email, status, error) VALUES ($1,$2,$3,'failed',$4)`,
                [campaignId, client.id, client.email, String(err?.message || err).slice(0, 400)]
            );
        }
    }
    const { rows } = await query(
        `UPDATE campaigns SET status = 'sent', sent_count = $2, sent_at = NOW() WHERE id = $1 RETURNING *`,
        [campaignId, sent]
    );
    return rows[0];
}
