import { Router } from 'express';
import { one, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { FrameRow, getFrameForUser, listFrames, ownsFrame } from '../frames';
import { moveCoins } from '../wallet';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const frames = await listFrames(me);
    const wallet = await one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [me]);
    res.json({
      frames,
      balance: wallet?.balance ?? 0,
      equippedFrameId: frames.find((frame) => frame.equipped)?.id ?? null,
    });
  })
);

router.post(
  '/:id/buy',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const frameId = req.params.id;
    const outcome = await tx(async (c) => {
      const found = await c.query<FrameRow>(
        'SELECT * FROM avatar_frames WHERE id = $1 AND is_active = true FOR UPDATE',
        [frameId]
      );
      const frame = found.rows[0];
      if (!frame) throw new HttpError(404, 'Frame not found', 'frame_not_found');

      const existing = await c.query<{ expires_at: string | null }>(
        'SELECT expires_at FROM user_avatar_frames WHERE user_id = $1 AND frame_id = $2 FOR UPDATE',
        [me, frameId]
      );
      const current = existing.rows[0];
      if (current && (!current.expires_at || new Date(current.expires_at).getTime() > Date.now())) {
        throw new HttpError(409, 'You already own this frame', 'already_owned');
      }

      let balanceAfter: number | null = null;
      const price = Number(frame.price);
      if (price > 0) {
        // The ledger's unique (user, type, ref) index makes a double charge impossible.
        const moved = await moveCoins(c, {
          userId: me,
          amount: -price,
          type: 'frame_purchase',
          refType: 'avatar_frame',
          refId: frameId,
          meta: { slug: frame.slug, name: frame.name },
        });
        if (!moved.applied) throw new HttpError(409, 'You already own this frame', 'already_owned');
        balanceAfter = moved.balanceAfter;
      }

      const expiresAt =
        Number(frame.duration_days) > 0
          ? new Date(Date.now() + Number(frame.duration_days) * 86_400_000)
          : null;
      await c.query(
        `INSERT INTO user_avatar_frames (user_id, frame_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, frame_id)
         DO UPDATE SET expires_at = EXCLUDED.expires_at, acquired_at = now()`,
        [me, frameId, expiresAt]
      );
      return { balanceAfter };
    });

    const frame = await getFrameForUser(me, frameId);
    res.status(201).json({ frame, balance: outcome.balanceAfter });
  })
);

router.post(
  '/:id/equip',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const frameId = req.params.id;
    const frame = await one<FrameRow>('SELECT * FROM avatar_frames WHERE id = $1 AND is_active = true', [
      frameId,
    ]);
    if (!frame) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    if (!(await ownsFrame(me, frameId))) {
      throw new HttpError(403, 'You do not own this frame', 'frame_not_owned');
    }
    await one('UPDATE users SET avatar_frame_id = $2 WHERE id = $1 RETURNING id', [me, frameId]);
    res.json({ frame: await getFrameForUser(me, frameId) });
  })
);

router.post(
  '/unequip',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await one('UPDATE users SET avatar_frame_id = NULL WHERE id = $1 RETURNING id', [me]);
    res.json({ frame: null });
  })
);

export default router;
