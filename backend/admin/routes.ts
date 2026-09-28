import { Router } from 'express';
import adminFullAuditsRouter from './fullAudits';
import authRoutes from './authRoutes';
import usersRoutes from './usersRoutes';
import catalogRoutes from './catalogRoutes';
import growthAuditLeadsRoutes from './growthAuditLeadsRoutes';
import crmRoutes from './crmRoutes';

const router = Router();

router.use(adminFullAuditsRouter);
router.use(authRoutes);
router.use(usersRoutes);
router.use(catalogRoutes);
router.use(growthAuditLeadsRoutes);
router.use(crmRoutes);

export default router;
