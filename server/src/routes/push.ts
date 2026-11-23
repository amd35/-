import { Router } from 'express';
import { q } from '../db';
import { reqUser, requireAuth } from '../auth';
import { pushConfigured } from '../push';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

/** Registers the device's FCM token so announcements reach it as push. */
router.post(
  '/register',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const token = String(req.body?.token || '').trim();
    if (!token || token.length > 4096) {
      throw new HttpError(400, 'Push token is required', 'missing_token');
    }
    const platform = String(req.body?.platform || 'android').slice(0, 20);
    await q(
      `INSERT INTO push_tokens (token, user_id, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform, updated_at = now()`,
      [token, me, platform]
    );
    res.json({ registered: true, pushConfigured: pushConfigured() });
  })
);

router.post(
  '/unregister',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const token = String(req.body?.token || '').trim();
    if (token) await q('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, me]);
    res.json({ removed: true });
  })
);

router.get(
  '/status',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    res.json({ configured: pushConfigured() });
  })
);

export default router;
