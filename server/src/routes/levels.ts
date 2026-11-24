import { Router } from 'express';
import { reqUser, requireAuth } from '../auth';
import { notify } from '../notify';
import {
  activeVip,
  dailyPointsState,
  expireVips,
  getLevelState,
  getLevels,
  getVipTiers,
  getXpSettings,
  levelHistory,
  purchaseVip,
  serializeLevel,
  serializeVipTier,
  vipHistory,
} from '../progression';
import { emitToUser } from '../realtime';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();

/** Everything the levels & VIP screen needs, in one read. */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await expireVips();
    const [level, levels, xpSettings, vip, tiers, history, vipLog, daily] = await Promise.all([
      getLevelState(me),
      getLevels(),
      getXpSettings(),
      activeVip(me),
      getVipTiers(),
      levelHistory(me),
      vipHistory(me),
      dailyPointsState(me),
    ]);
    res.json({
      level,
      daily,
      levels: levels.filter((row) => row.is_active).map(serializeLevel),
      xpSettings,
      vip,
      tiers: tiers.filter((row) => row.is_active).map(serializeVipTier),
      history,
      vipHistory: vipLog,
    });
  })
);

/** Buys (or renews) a VIP tier with coins. Server-authoritative and idempotent. */
router.post(
  '/vip/purchase',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const tier = intParam(req.body?.tier, 0, 1, 5);
    const requestId = String(req.body?.requestId || '').trim().slice(0, 64);
    if (!requestId) throw new HttpError(400, 'requestId مطلوب', 'missing_request');

    const result = await purchaseVip(me, tier, requestId);
    emitToUser(me, 'wallet:update', { balance: result.balanceAfter });
    const vip = await activeVip(me);
    await notify(
      me,
      'vip_purchased',
      result.action === 'renew' ? 'تم تجديد VIP' : 'تم تفعيل VIP',
      `رتبة VIP ${tier} فعّالة حتى ${new Date(result.expiresAt).toLocaleDateString('ar-IQ')}`,
      { tier, expiresAt: result.expiresAt }
    );
    res.json({ vip, ...result });
  })
);

export default router;
