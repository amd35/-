import { Router } from 'express';
import { publicBackgrounds } from '../backgrounds';
import { asyncHandler } from '../utils';

const router = Router();

/**
 * Live backgrounds for every client, including the signed-out welcome and login
 * screens, so it stays public. The admin panel publishes rows through
 * /api/admin/backgrounds; regular users can only read.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ backgrounds: await publicBackgrounds() });
  })
);

export default router;
