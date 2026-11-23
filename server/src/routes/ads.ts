import { Router } from 'express';
import { listLiveAds, recordAdEvent, serializeAd } from '../ads';
import { reqUser, requireAuth } from '../auth';
import { asyncHandler } from '../utils';

const router = Router();
router.use(requireAuth());

/** Every live ad, in admin order. Feeds the home carousel, the popup and the ads page. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rows = await listLiveAds();
    res.json({ ads: rows.map((row) => serializeAd(row)) });
  })
);

router.post(
  '/:id/view',
  asyncHandler(async (req, res) => {
    const counted = await recordAdEvent(req.params.id, reqUser(req).id, 'view');
    res.json({ counted });
  })
);

router.post(
  '/:id/click',
  asyncHandler(async (req, res) => {
    await recordAdEvent(req.params.id, reqUser(req).id, 'click');
    res.json({ counted: true });
  })
);

export default router;
