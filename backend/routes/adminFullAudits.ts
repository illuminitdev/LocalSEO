import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import { sendFullAuditShareEmail } from '../lib/bookingEmail';
import {
    proxyZappSitesOps,
    proxyZappSitesPdf,
    reportPdfUrl,
    reportShareUrl
} from '../lib/zappSitesAuditProxy';

const router = Router();

function enrichListItem(item: Record<string, unknown>) {
    const id = String(item.id || '');
    if (!id) return item;
    return {
        ...item,
        sharePath: `/audit-report/${id}`,
        shareUrl: reportShareUrl(id),
        pdfUrl: reportPdfUrl(id),
        reportUrl: reportShareUrl(id)
    };
}

function sendProxyJson(res: Response, result: Awaited<ReturnType<typeof proxyZappSitesOps>>) {
    if (result.json !== undefined) {
        return res.status(result.status).json(result.json);
    }
    return res.status(result.status || 502).json({ success: false, error: 'Unexpected upstream response' });
}

/** History — deep / fullcrawl audits only */
router.get('/full-audits', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const result = await proxyZappSitesOps('GET', '/api/ops/audits?kind=deep');
        if (result.status >= 200 && result.status < 300 && result.json && typeof result.json === 'object') {
            const body = result.json as { success?: boolean; data?: unknown[] };
            const data = Array.isArray(body.data)
                ? body.data.map((row) => enrichListItem((row || {}) as Record<string, unknown>))
                : body.data;
            return res.status(result.status).json({ ...body, data });
        }
        return sendProxyJson(res, result);
    } catch (err: any) {
        console.error('Admin full-audits list error:', err);
        res.status(502).json({ success: false, error: err.message || 'Failed to load full audits' });
    }
});

/** Start full crawl (queued job or inline complete) */
router.post('/full-audits/fullcrawl', requireAdmin, async (req: Request, res: Response) => {
    try {
        const result = await proxyZappSitesOps('POST', '/api/ops/audits/fullcrawl', req.body || {});
        if (result.json && typeof result.json === 'object') {
            const body = result.json as { success?: boolean; data?: Record<string, unknown> };
            if (body.data && typeof body.data === 'object') {
                const auditId = String(body.data.auditId || body.data.id || '');
                if (auditId) {
                    body.data = {
                        ...body.data,
                        sharePath: `/audit-report/${auditId}`,
                        shareUrl: reportShareUrl(auditId),
                        pdfUrl: reportPdfUrl(auditId),
                        reportUrl: reportShareUrl(auditId)
                    };
                }
            }
            return res.status(result.status).json(body);
        }
        return sendProxyJson(res, result);
    } catch (err: any) {
        console.error('Admin fullcrawl error:', err);
        res.status(502).json({ success: false, error: err.message || 'Failed to start full audit' });
    }
});

/** Poll crawl job */
router.get('/full-audits/jobs/:jobId', requireAdmin, async (req: Request, res: Response) => {
    try {
        const jobId = encodeURIComponent(String(req.params.jobId || ''));
        const result = await proxyZappSitesOps('GET', `/api/ops/audits/jobs/${jobId}`);
        if (result.json && typeof result.json === 'object') {
            const body = result.json as { success?: boolean; data?: Record<string, unknown> };
            if (body.data?.auditId) {
                const auditId = String(body.data.auditId);
                body.data = {
                    ...body.data,
                    shareUrl: reportShareUrl(auditId),
                    pdfUrl: reportPdfUrl(auditId),
                    reportUrl: reportShareUrl(auditId)
                };
            }
            return res.status(result.status).json(body);
        }
        return sendProxyJson(res, result);
    } catch (err: any) {
        console.error('Admin full-audit job poll error:', err);
        res.status(502).json({ success: false, error: err.message || 'Failed to poll job' });
    }
});

/** Download print-quality PDF (streams ZappSites public PDF for published audits) */
router.get('/full-audits/:id/pdf', requireAdmin, async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'Missing audit id' });
        const result = await proxyZappSitesPdf(id);
        if (result.buffer && result.status === 200) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                result.contentDisposition?.includes('attachment')
                    ? result.contentDisposition
                    : `attachment; filename="zappsites-audit-${id}.pdf"`
            );
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).send(result.buffer);
        }
        return sendProxyJson(res, result);
    } catch (err: any) {
        console.error('Admin full-audit PDF error:', err);
        res.status(502).json({
            success: false,
            error: err.message || 'PDF generation failed. Please try again in a moment.'
        });
    }
});

/**
 * Email the company contact on the audit with the report PDF + score pitch (SES).
 * To address comes from the audit record only (business.email / email).
 */
router.post('/full-audits/:id/share-email', requireAdmin, async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'Missing audit id' });

        const detail = await proxyZappSitesOps('GET', `/api/ops/audits/${encodeURIComponent(id)}`);
        if (detail.status >= 400 || !detail.json || typeof detail.json !== 'object') {
            return sendProxyJson(res, detail);
        }
        const body = detail.json as { success?: boolean; data?: Record<string, unknown>; error?: string };
        const audit = (body.data || {}) as Record<string, unknown>;
        if (!audit.id && !body.success) {
            return res.status(detail.status || 404).json({
                success: false,
                error: body.error || 'Audit not found'
            });
        }

        const business =
            audit.business && typeof audit.business === 'object'
                ? (audit.business as Record<string, unknown>)
                : {};
        const email = String(business.email || audit.email || '')
            .trim()
            .toLowerCase();
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'This audit has no company email to share with.'
            });
        }

        const published = Boolean(audit.published ?? business.published);
        if (!published) {
            return res.status(400).json({
                success: false,
                error: 'Publish the audit before emailing the PDF report.'
            });
        }

        const businessName = String(
            business.businessName || audit.businessName || 'there'
        ).trim();
        const website = String(business.website || audit.website || '').trim();
        const scoreObj =
            audit.score && typeof audit.score === 'object'
                ? (audit.score as { total?: number })
                : null;
        const scoreRaw =
            (audit.totalScore as number | null | undefined) ?? scoreObj?.total ?? null;
        const score =
            scoreRaw != null && Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;
        const reportUrl = reportShareUrl(id);

        const pdfResult = await proxyZappSitesPdf(id);
        if (!pdfResult.buffer || pdfResult.status !== 200) {
            const errBody =
                pdfResult.json && typeof pdfResult.json === 'object'
                    ? (pdfResult.json as { error?: string })
                    : null;
            return res.status(pdfResult.status || 502).json({
                success: false,
                error: errBody?.error || 'Could not load the audit PDF to attach.'
            });
        }

        const safeName =
            businessName
                .replace(/[^a-z0-9]+/gi, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40)
                .toLowerCase() || 'audit';

        const result = await sendFullAuditShareEmail({
            to: email,
            businessName,
            website,
            score,
            reportUrl,
            pdfBuffer: pdfResult.buffer,
            pdfFilename: `zappsites-audit-${safeName}.pdf`
        });

        if (!result.sent) {
            return res.status(502).json({
                success: false,
                error: 'Email could not be delivered via SES. Check sender identity and try again.'
            });
        }

        return res.json({
            success: true,
            to: email,
            attached: result.attached,
            reportUrl
        });
    } catch (err: any) {
        console.error('Admin full-audit share-email error:', err);
        res.status(502).json({
            success: false,
            error: err.message || 'Failed to email audit report'
        });
    }
});

/** Load one audit (ops detail) */
router.get('/full-audits/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const id = encodeURIComponent(String(req.params.id || ''));
        const result = await proxyZappSitesOps('GET', `/api/ops/audits/${id}`);
        if (result.json && typeof result.json === 'object') {
            const body = result.json as { success?: boolean; data?: Record<string, unknown> };
            if (body.data && typeof body.data === 'object') {
                const auditId = String(body.data.id || req.params.id);
                body.data = {
                    ...body.data,
                    sharePath: `/audit-report/${auditId}`,
                    shareUrl: reportShareUrl(auditId),
                    pdfUrl: reportPdfUrl(auditId),
                    reportUrl: reportShareUrl(auditId)
                };
            }
            return res.status(result.status).json(body);
        }
        return sendProxyJson(res, result);
    } catch (err: any) {
        console.error('Admin full-audit detail error:', err);
        res.status(502).json({ success: false, error: err.message || 'Failed to load audit' });
    }
});

/** Delete deep audit */
router.delete('/full-audits/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const id = encodeURIComponent(String(req.params.id || ''));
        const result = await proxyZappSitesOps('DELETE', `/api/ops/audits/${id}`);
        return sendProxyJson(res, result);
    } catch (err: any) {
        console.error('Admin full-audit delete error:', err);
        res.status(502).json({ success: false, error: err.message || 'Failed to delete audit' });
    }
});

export default router;
