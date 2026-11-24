import { Router } from 'express';
import { currentAdmin, requireAdmin } from '../auth';
import {
  adminBanPlayer,
  adminGameLedger,
  adminGameOverview,
  adminResolveReport,
  adminUnbanPlayer,
  updateGameSettings,
} from '../game';
import { asyncHandler, intParam } from '../utils';

const router = Router();

router.use(requireAdmin());

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(await adminGameOverview());
  })
);

router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json({ settings: await updateGameSettings(req.body ?? {}) });
  })
);

router.get(
  '/ledger',
  asyncHandler(async (req, res) => {
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0, 1_000_000);
    res.json(await adminGameLedger(limit, offset));
  })
);

router.post(
  '/ban',
  asyncHandler(async (req, res) => {
    const admin = await currentAdmin(req);
    res.json(
      await adminBanPlayer(
        admin.id,
        String(req.body?.userId || ''),
        Math.trunc(Number(req.body?.hours) || 24),
        String(req.body?.reason || '')
      )
    );
  })
);

router.delete(
  '/ban/:userId',
  asyncHandler(async (req, res) => {
    res.json(await adminUnbanPlayer(req.params.userId));
  })
);

router.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
    res.json(await adminResolveReport(req.params.id, status));
  })
);

export default router;
