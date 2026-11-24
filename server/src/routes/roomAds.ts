import { Router } from 'express';
import { reqUser, requireAuth } from '../auth';
import { buyRoomAd, listRoomAds } from '../roomAds';
import { asyncHandler } from '../utils';

const router = Router();

/** The room-stage ad rail: today's featured gift first, then the rest. */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const ads = await listRoomAds();
    res.json({ ads });
  })
);

/** Buys an ad's gift into the caller's gift bag. */
router.post(
  '/:id/buy',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const outcome = await buyRoomAd(reqUser(req).id, String(req.params.id || ''), req.body?.requestId);
    res.status(201).json(outcome);
  })
);

export default router;
