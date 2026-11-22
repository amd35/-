import { Router } from 'express';
import { one } from '../db';
import { requireAdmin } from '../auth';
import {
  adminLookOverview,
  applyAdminLook,
  grantLookItem,
  revokeLookItem,
  saveAdminLook,
} from '../adminLook';
import { HttpError, asyncHandler } from '../utils';

const router = Router();
router.use(requireAdmin());

async function targetUser(value: unknown): Promise<{ id: string }> {
  const target = String(value ?? '').trim();
  if (!target) throw new HttpError(400, 'Enter a user ID', 'invalid_user');
  const user = await one<{ id: string }>(
    'SELECT id FROM users WHERE is_bot = false AND (id::text = $1 OR username = $1) LIMIT 1',
    [target]
  );
  if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
  return user;
}

router.get(
  '/appearance',
  asyncHandler(async (_req, res) => {
    res.json(await adminLookOverview());
  })
);

router.put(
  '/appearance/:rankKey',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    await saveAdminLook(req.params.rankKey, {
      frameId: body.frameId ?? null,
      namecardId: body.namecardId ?? null,
      bubbleId: body.bubbleId ?? null,
      entryId: body.entryId ?? null,
      effectsEnabled: body.effectsEnabled !== false,
    });
    res.json({ saved: true });
  })
);

router.post(
  '/appearance/:rankKey/apply',
  asyncHandler(async (req, res) => {
    res.json(await applyAdminLook(req.params.rankKey));
  })
);

router.post(
  '/appearance/grant',
  asyncHandler(async (req, res) => {
    const user = await targetUser(req.body?.user);
    const itemId = String(req.body?.itemId || '');
    if (!itemId) throw new HttpError(400, 'Choose a design', 'missing_item');
    const item = await grantLookItem(user.id, itemId);
    res.status(201).json({ granted: true, item: { id: item.id, name: item.name } });
  })
);

router.post(
  '/appearance/revoke',
  asyncHandler(async (req, res) => {
    const user = await targetUser(req.body?.user);
    const itemId = String(req.body?.itemId || '');
    if (!itemId) throw new HttpError(400, 'Choose a design', 'missing_item');
    const item = await revokeLookItem(user.id, itemId);
    res.json({ revoked: true, item: { id: item.id, name: item.name } });
  })
);

export default router;
