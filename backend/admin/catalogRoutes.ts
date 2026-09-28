import { Router, Request, Response } from 'express';
import { requireAdmin, resolveAdminCredentials } from './adminAuth';
import {
    PLANS,
    FEATURE_LABELS,
    FEATURE_KEYS,
    getFeaturesForPlan,
    formatPrice
} from '../lib/planCatalog';
import {
    createBookingIndustry,
    listBookingIndustries,
    updateBookingIndustry
} from '../lib/bookingIndustriesDb';

const router = Router();

router.get('/plans', requireAdmin, (_req: Request, res: Response) => {
    res.json({
        stage: resolveAdminCredentials().stage,
        plans: PLANS.map((p: any) => ({
            id: p.id,
            name: p.name,
            priceLabel: formatPrice(p),
            priceCents: p.priceCents,
            features: getFeaturesForPlan(p.id)
        })),
        featureKeys: FEATURE_KEYS,
        featureLabels: FEATURE_LABELS
    });
});

router.get('/services', requireAdmin, (_req: Request, res: Response) => {
    const services = FEATURE_KEYS.map((key) => ({
        key,
        label: FEATURE_LABELS[key],
        plans: PLANS.filter((p: any) => getFeaturesForPlan(p.id).includes(key)).map((p: any) => ({
            id: p.id,
            name: p.name,
            priceLabel: formatPrice(p)
        }))
    }));

    res.json({
        stage: resolveAdminCredentials().stage,
        services,
        plans: PLANS.map((p: any) => ({
            id: p.id,
            name: p.name,
            priceLabel: formatPrice(p),
            features: getFeaturesForPlan(p.id).map((k) => ({
                key: k,
                label: FEATURE_LABELS[k as keyof typeof FEATURE_LABELS]
            }))
        })),
        featureLabels: FEATURE_LABELS
    });
});

router.get('/industries', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const industries = await listBookingIndustries({ activeOnly: false });
        res.json({
            stage: resolveAdminCredentials().stage,
            industries
        });
    } catch (err: any) {
        console.error('Admin list industries error:', err);
        res.status(500).json({ error: err.message || 'Failed to list industries' });
    }
});

router.post('/industries', requireAdmin, async (req: Request, res: Response) => {
    try {
        const industry = await createBookingIndustry({
            id: req.body?.id,
            name: req.body?.name,
            shortName: req.body?.shortName ?? req.body?.short_name,
            icon: req.body?.icon,
            sortOrder: req.body?.sortOrder ?? req.body?.sort_order,
            active: req.body?.active,
            navSlug: req.body?.navSlug ?? req.body?.nav_slug,
            demoReady: req.body?.demoReady ?? req.body?.demo_ready
        });
        res.status(201).json({ industry });
    } catch (err: any) {
        const status = err.status || 500;
        if (status >= 500) console.error('Admin create industry error:', err);
        res.status(status).json({ error: err.message || 'Failed to create industry' });
    }
});

router.patch('/industries/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const industry = await updateBookingIndustry(String(req.params.id), {
            name: req.body?.name,
            shortName: req.body?.shortName ?? req.body?.short_name,
            icon: req.body?.icon,
            sortOrder: req.body?.sortOrder ?? req.body?.sort_order,
            active: req.body?.active,
            navSlug: req.body?.navSlug ?? req.body?.nav_slug,
            demoReady: req.body?.demoReady ?? req.body?.demo_ready
        });
        res.json({ industry });
    } catch (err: any) {
        const status = err.status || 500;
        if (status >= 500) console.error('Admin update industry error:', err);
        res.status(status).json({ error: err.message || 'Failed to update industry' });
    }
});

export default router;
