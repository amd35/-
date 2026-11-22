import { Router } from 'express';
import { requireAdmin } from '../auth';
import { broadcast, emitToUser } from '../realtime';
import { closeCupCompetition, cupAdminLedger, cupAdminOverview, reverseCupEntry } from '../roomCup';
import { getSettings, updateSettings } from '../settings';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();

router.use(requireAdmin());

/** Per-room totals, the administration's share and the current cup settings. */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json(await cupAdminOverview());
  })
);

/** Full financial log of every room-gift split, newest first. */
router.get(
  '/ledger',
  asyncHandler(async (req, res) => {
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0, 1_000_000);
    res.json(await cupAdminLedger(limit, offset));
  })
);

/** Percent split, competition period and the three prizes — admin only. */
router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if ('enabled' in body) patch.cup_enabled = Boolean(body.enabled);
    if ('ownerPercent' in body) patch.cup_owner_percent = body.ownerPercent;
    if ('period' in body) {
      const period = String(body.period);
      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        throw new HttpError(400, 'Invalid competition period', 'invalid_period');
      }
      patch.cup_period = period;
    }
    if ('prize1' in body) patch.cup_prize_1 = body.prize1;
    if ('prize2' in body) patch.cup_prize_2 = body.prize2;
    if ('prize3' in body) patch.cup_prize_3 = body.prize3;

    const settings = await updateSettings(patch);
    res.json({
      settings: {
        enabled: Boolean(settings.cup_enabled),
        ownerPercent: Number(settings.cup_owner_percent),
        adminPercent: 100 - Number(settings.cup_owner_percent),
        period: settings.cup_period,
        prizes: [settings.cup_prize_1, settings.cup_prize_2, settings.cup_prize_3],
      },
    });
  })
);

/** Reverses a cancelled/refunded split so it stops counting toward the cup. */
router.post(
  '/ledger/:id/reverse',
  asyncHandler(async (req, res) => {
    const result = await reverseCupEntry(req.params.id);
    if (result.ownerId) emitToUser(result.ownerId, 'profit:update', {});
    broadcast('room_cup', { roomId: result.roomId });
    res.json({ ok: true });
  })
);

/** Ends a room's running competition now and announces its winners. */
router.post(
  '/rooms/:id/close',
  asyncHandler(async (req, res) => {
    const result = await closeCupCompetition(req.params.id);
    for (const winner of result.winners) emitToUser(winner.userId, 'wallet:update', {});
    broadcast('room_cup', { roomId: result.roomId });
    res.json({ winners: result.winners });
  })
);

export default router;
