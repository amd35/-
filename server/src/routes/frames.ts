import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { FrameRow, getFrameForUser, listFrames, ownsFrame } from '../frames';
import { activeVip } from '../progression';
import { moveCoins } from '../wallet';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

/** VIP-locked items need an active subscription of at least `min_vip`. */
async function requireFrameVip(userId: string, frame: FrameRow) {
  const minVip = Number(frame.min_vip ?? 0);
  if (minVip <= 0) return;
  const vip = await activeVip(userId);
  if (!vip || vip.tier < minVip) {
    throw new HttpError(403, `VIP ${minVip} required`, 'vip_required');
  }
}

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
    const gate = await one<FrameRow>('SELECT * FROM avatar_frames WHERE id = $1 AND is_active = true', [frameId]);
    if (!gate) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    if (gate.admin_only) throw new HttpError(403, 'This design is granted by the administration', 'admin_only');
    await requireFrameVip(me, gate);
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
    await requireFrameVip(me, frame);
    if (frame.category === 'frame') {
      await one('UPDATE users SET avatar_frame_id = $2 WHERE id = $1 RETURNING id', [me, frameId]);
    } else {
      await one(
        `INSERT INTO user_cosmetics (user_id, category, item_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, category)
         DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = now()
         RETURNING user_id`,
        [me, frame.category, frameId]
      );
    }
    res.json({ frame: await getFrameForUser(me, frameId) });
  })
);

router.post(
  '/unequip',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const category = String(req.body?.category || 'frame');
    if (category === 'frame') {
      await one('UPDATE users SET avatar_frame_id = NULL WHERE id = $1 RETURNING id', [me]);
    } else {
      await one('DELETE FROM user_cosmetics WHERE user_id = $1 AND category = $2 RETURNING user_id', [
        me,
        category,
      ]);
    }
    res.json({ frame: null });
  })
);

interface PremiumIdRow {
  id: string;
  code: string;
  price: number;
  is_sold: boolean;
  sold_to: string | null;
}

// Special numeric account IDs for sale. A sold one only stays visible to its owner.
router.get(
  '/premium-ids',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q<PremiumIdRow>(
      `SELECT id, code, price, is_sold, sold_to FROM premium_ids
       WHERE is_sold = false OR sold_to = $1
       ORDER BY is_sold, price, code`,
      [me]
    );
    res.json({
      ids: rows.map((row) => ({
        id: row.id,
        code: row.code,
        price: Number(row.price),
        mine: row.sold_to === me,
      })),
    });
  })
);

router.post(
  '/premium-ids/:id/buy',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const outcome = await tx(async (c) => {
      const found = await c.query<PremiumIdRow>('SELECT * FROM premium_ids WHERE id = $1 FOR UPDATE', [
        req.params.id,
      ]);
      const row = found.rows[0];
      if (!row) throw new HttpError(404, 'Premium ID not found', 'premium_id_not_found');
      if (row.is_sold) throw new HttpError(409, 'This ID is already sold', 'premium_id_sold');
      const taken = await c.query('SELECT 1 FROM users WHERE username = $1 AND id <> $2', [row.code, me]);
      if (taken.rowCount) throw new HttpError(409, 'This ID is already in use', 'code_taken');

      let balanceAfter: number | null = null;
      if (Number(row.price) > 0) {
        const moved = await moveCoins(c, {
          userId: me,
          amount: -Number(row.price),
          type: 'premium_id_purchase',
          refType: 'premium_id',
          refId: row.id,
          meta: { code: row.code },
        });
        if (!moved.applied) throw new HttpError(409, 'This ID is already sold', 'premium_id_sold');
        balanceAfter = moved.balanceAfter;
      }

      await c.query('UPDATE premium_ids SET is_sold = true, sold_to = $2, sold_at = now() WHERE id = $1', [
        row.id,
        me,
      ]);
      await c.query('UPDATE users SET username = $2 WHERE id = $1', [me, row.code]);
      return { balanceAfter, code: row.code };
    });
    res.status(201).json({ code: outcome.code, balance: outcome.balanceAfter });
  })
);

export default router;
