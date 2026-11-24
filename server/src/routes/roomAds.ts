import { Router } from 'express';
import { reqUser, requireAuth } from '../auth';
import { RANDOM_GIFT_PRICE, buyRandomGift, buyRoomAd, listRoomAds } from '../roomAds';
import { asyncHandler } from '../utils';

const router = Router();

/** The room-stage ad rail: today's featured gift first, then the rest. */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const ads = await listRoomAds();
    res.json({ ads, randomGift: { price: RANDOM_GIFT_PRICE } });
  })
);

/** Opens the «هدية عشوائية» box inside the daily store. */
router.post(
  '/random-gift',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const outcome = await buyRandomGift(reqUser(req).id, req.body?.requestId);
    res.status(201).json(outcome);
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
