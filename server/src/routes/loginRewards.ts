import { Router } from 'express';
import { reqUser, requireAuth } from '../auth';
import { claimLoginReward, getLoginRewardState } from '../loginRewards';
import { asyncHandler } from '../utils';

const router = Router();

/** The 7-day calendar with the caller's claimed days. */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await getLoginRewardState(reqUser(req).id));
  })
);

/** Claims today's reward (once per Baghdad day). */
router.post(
  '/claim',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.status(201).json(await claimLoginReward(reqUser(req).id));
  })
);

export default router;
