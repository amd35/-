import crypto from 'node:crypto';
import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqAdmin, requireAdmin } from '../auth';
import { notify } from '../notify';
import {
  XP_SETTING_KEYS,
  activeVip,
  awardXp,
  getXpSettingRows,
  grantVip,
  levelsOverview,
  renewVip,
  revokeVip,
  serializeVipTier,
  vipHistory,
} from '../progression';
import { getSettings } from '../settings';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();
router.use(requireAdmin());

function text(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/** Levels, VIP tiers, XP rates and the live statistics, in one read. */
router.get(
  '/levels',
  asyncHandler(async (_req, res) => {
    const [overview, xpSettings, levelUps, vipLog, vips] = await Promise.all([
      levelsOverview(),
      getXpSettingRows(),
      q(
        `SELECT lh.id, lh.level, lh.xp, lh.reward_coins, lh.created_at,
                u.display_name, u.username
         FROM level_history lh JOIN users u ON u.id = lh.user_id
         ORDER BY lh.created_at DESC LIMIT 50`
      ),
      q(
        `SELECT vh.id, vh.tier, vh.action, vh.actor_kind, vh.actor_name, vh.coins,
                vh.expires_at, vh.note, vh.created_at,
                u.display_name, u.username
         FROM vip_history vh JOIN users u ON u.id = vh.user_id
         ORDER BY vh.created_at DESC LIMIT 50`
      ),
      q(
        `SELECT uv.tier, uv.source, uv.expires_at, u.id AS user_id,
                u.display_name, u.username, u.avatar_url, vt.color
         FROM user_vips uv
         JOIN users u ON u.id = uv.user_id
         JOIN vip_tiers vt ON vt.tier = uv.tier
         WHERE uv.is_active AND (uv.expires_at IS NULL OR uv.expires_at > now())
         ORDER BY uv.tier DESC, uv.expires_at ASC NULLS LAST LIMIT 100`
      ),
    ]);
    const settings = await getSettings();
    res.json({
      ...overview,
      levelUpEffects: settings.level_up_effects,
      xpSettings,
      levelUps,
      vipHistory: vipLog,
      activeVips: vips,
    });
  })
);

/** XP rates: how much XP each real operation awards. */
router.put(
  '/levels/xp-settings',
  asyncHandler(async (req, res) => {
    const incoming = (req.body?.settings ?? {}) as Record<string, unknown>;
    for (const key of XP_SETTING_KEYS) {
      if (incoming[key] === undefined) continue;
      const value = num(incoming[key], 0, 0, 1_000_000);
      await q(
        `INSERT INTO xp_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }
    res.json({ settings: await getXpSettingRows() });
  })
);

/** Creates or updates one level of the ladder. */
router.put(
  '/levels/:level',
  asyncHandler(async (req, res) => {
    const level = intParam(req.params.level, 0, 1, 100);
    const body = req.body ?? {};
    const row = await one(
      `UPDATE levels SET
         name_ar = COALESCE($2, name_ar),
         name_en = COALESCE($3, name_en),
         xp_required = COALESCE($4, xp_required),
         reward_coins = COALESCE($5, reward_coins),
         badge_color = COALESCE($6, badge_color),
         badge_image_url = COALESCE($7, badge_image_url),
         is_active = COALESCE($8, is_active),
         updated_at = now()
       WHERE level = $1 RETURNING *`,
      [
        level,
        body.nameAr === undefined ? null : text(body.nameAr, 60),
        body.nameEn === undefined ? null : text(body.nameEn, 60),
        body.xpRequired === undefined ? null : num(body.xpRequired, 0, 0, 100_000_000),
        body.rewardCoins === undefined ? null : num(body.rewardCoins, 0, 0, 100_000_000),
        body.badgeColor === undefined ? null : text(body.badgeColor, 20),
        body.badgeImageUrl === undefined ? null : text(body.badgeImageUrl, 500) || null,
        body.isActive === undefined ? null : Boolean(body.isActive),
      ]
    );
    if (!row) throw new HttpError(404, 'المستوى غير موجود', 'level_missing');
    res.json({ level: row });
  })
);

router.post(
  '/levels',
  asyncHandler(async (req, res) => {
    const level = intParam(req.body?.level, 0, 1, 100);
    const row = await one(
      `INSERT INTO levels (level, name_ar, name_en, xp_required, reward_coins, badge_color, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (level) DO NOTHING RETURNING *`,
      [
        level,
        text(req.body?.nameAr, 60) || `المستوى ${level}`,
        text(req.body?.nameEn, 60) || `Level ${level}`,
        num(req.body?.xpRequired, 0, 0, 100_000_000),
        num(req.body?.rewardCoins, 0, 0, 100_000_000),
        text(req.body?.badgeColor, 20) || '#ffd75e',
        req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
      ]
    );
    if (!row) throw new HttpError(409, 'هذا المستوى موجود مسبقاً', 'level_exists');
    res.status(201).json({ level: row });
  })
);

router.delete(
  '/levels/:level',
  asyncHandler(async (req, res) => {
    const level = intParam(req.params.level, 0, 1, 100);
    if (level <= 1) throw new HttpError(400, 'لا يمكن حذف المستوى الأول', 'level_locked');
    const row = await one('DELETE FROM levels WHERE level = $1 RETURNING level', [level]);
    if (!row) throw new HttpError(404, 'المستوى غير موجود', 'level_missing');
    res.json({ ok: true });
  })
);

/** Manual XP award (achievement, mission, compensation). */
router.post(
  '/levels/grant-xp',
  asyncHandler(async (req, res) => {
    const userId = String(req.body?.userId || '');
    const xp = num(req.body?.xp, 0, 1, 1_000_000);
    const reason = text(req.body?.reason, 120);
    const user = await one<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user) throw new HttpError(404, 'المستخدم غير موجود', 'user_missing');
    const result = await tx((c) =>
      awardXp(c, {
        userId,
        kind: 'admin',
        refId: crypto.randomUUID(),
        xp,
      })
    );
    await notify(userId, 'xp_granted', 'نقاط خبرة إضافية', `حصلت على ${result.awarded} XP${reason ? ` — ${reason}` : ''}`, {
      xp: result.awarded,
      level: result.level,
    });
    res.json(result);
  })
);

/* ------------------------------------------------------------------ VIP */

router.put(
  '/vip/tiers/:tier',
  asyncHandler(async (req, res) => {
    const tier = intParam(req.params.tier, 0, 1, 5);
    const body = req.body ?? {};
    const row = await one(
      `UPDATE vip_tiers SET
         name_ar = COALESCE($2, name_ar),
         name_en = COALESCE($3, name_en),
         price_coins = COALESCE($4, price_coins),
         duration_days = COALESCE($5, duration_days),
         color = COALESCE($6, color),
         badge_image_url = COALESCE($7, badge_image_url),
         frame_image_url = COALESCE($8, frame_image_url),
         bubble_image_url = COALESCE($9, bubble_image_url),
         title_ar = COALESCE($10, title_ar),
         title_en = COALESCE($11, title_en),
         perks = COALESCE($12::jsonb, perks),
         is_active = COALESCE($13, is_active),
         updated_at = now()
       WHERE tier = $1 RETURNING *`,
      [
        tier,
        body.nameAr === undefined ? null : text(body.nameAr, 60),
        body.nameEn === undefined ? null : text(body.nameEn, 60),
        body.priceCoins === undefined ? null : num(body.priceCoins, 0, 0, 1_000_000_000),
        body.durationDays === undefined ? null : num(body.durationDays, 30, 1, 3650),
        body.color === undefined ? null : text(body.color, 20),
        body.badgeImageUrl === undefined ? null : text(body.badgeImageUrl, 500) || null,
        body.frameImageUrl === undefined ? null : text(body.frameImageUrl, 500) || null,
        body.bubbleImageUrl === undefined ? null : text(body.bubbleImageUrl, 500) || null,
        body.titleAr === undefined ? null : text(body.titleAr, 60),
        body.titleEn === undefined ? null : text(body.titleEn, 60),
        Array.isArray(body.perks) ? JSON.stringify(body.perks.map((p: unknown) => text(p, 120))) : null,
        body.isActive === undefined ? null : Boolean(body.isActive),
      ]
    );
    if (!row) throw new HttpError(404, 'رتبة VIP غير موجودة', 'vip_tier_missing');
    res.json({ tier: serializeVipTier(row as never) });
  })
);

router.post(
  '/vip/tiers',
  asyncHandler(async (req, res) => {
    const tier = intParam(req.body?.tier, 0, 1, 5);
    const row = await one(
      `INSERT INTO vip_tiers (tier, name_ar, name_en, price_coins, duration_days, color, title_ar, title_en, perks, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT (tier) DO NOTHING RETURNING *`,
      [
        tier,
        text(req.body?.nameAr, 60) || `VIP ${tier}`,
        text(req.body?.nameEn, 60) || `VIP ${tier}`,
        num(req.body?.priceCoins, 0, 0, 1_000_000_000),
        num(req.body?.durationDays, 30, 1, 3650),
        text(req.body?.color, 20) || '#ffd75e',
        text(req.body?.titleAr, 60),
        text(req.body?.titleEn, 60),
        JSON.stringify(Array.isArray(req.body?.perks) ? req.body.perks.map((p: unknown) => text(p, 120)) : []),
        num(req.body?.sortOrder, tier * 10, 0, 1000),
      ]
    );
    if (!row) throw new HttpError(409, 'هذه الرتبة موجودة مسبقاً', 'vip_tier_exists');
    res.status(201).json({ tier: serializeVipTier(row as never) });
  })
);

router.delete(
  '/vip/tiers/:tier',
  asyncHandler(async (req, res) => {
    const tier = intParam(req.params.tier, 0, 1, 5);
    const row = await one('DELETE FROM vip_tiers WHERE tier = $1 RETURNING tier', [tier]);
    if (!row) throw new HttpError(404, 'رتبة VIP غير موجودة', 'vip_tier_missing');
    res.json({ ok: true });
  })
);

/** User search for granting VIP. */
router.get(
  '/vip/search',
  asyncHandler(async (req, res) => {
    const term = text(req.query.q, 60);
    if (!term) return res.json({ users: [] });
    const like = `%${term}%`;
    const users = await q(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.level,
              vt.tier AS vip_tier, vt.name_ar AS vip_name, vt.color AS vip_color, uv.expires_at
       FROM users u
       LEFT JOIN user_vips uv ON uv.user_id = u.id AND uv.is_active
         AND (uv.expires_at IS NULL OR uv.expires_at > now())
       LEFT JOIN vip_tiers vt ON vt.tier = uv.tier
       WHERE u.is_bot = false AND (u.username ILIKE $1 OR u.display_name ILIKE $1 OR u.email ILIKE $1)
       ORDER BY u.created_at DESC LIMIT 20`,
      [like]
    );
    res.json({ users });
  })
);

router.post(
  '/vip/grant',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const userId = String(req.body?.userId || '');
    const tier = intParam(req.body?.tier, 0, 1, 5);
    const days = num(req.body?.days, 0, 0, 3650);
    const user = await one<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user) throw new HttpError(404, 'المستخدم غير موجود', 'user_missing');
    const result = await grantVip({
      userId,
      tier,
      days,
      adminId: admin.id,
      adminName: admin.username,
      note: text(req.body?.note, 200) || null,
    });
    await notify(userId, 'vip_granted', 'تم منحك VIP', `تم تفعيل رتبة VIP ${tier}`, {
      tier,
      expiresAt: result.expiresAt,
    });
    res.json({ ...result, vip: await activeVip(userId) });
  })
);

router.post(
  '/vip/renew',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const userId = String(req.body?.userId || '');
    const days = num(req.body?.days, 30, 1, 3650);
    const result = await renewVip({ userId, days, adminId: admin.id, adminName: admin.username });
    res.json(result);
  })
);

router.post(
  '/vip/revoke',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const userId = String(req.body?.userId || '');
    const result = await revokeVip({
      userId,
      adminId: admin.id,
      adminName: admin.username,
      note: text(req.body?.note, 200) || null,
    });
    await notify(userId, 'vip_revoked', 'تم سحب VIP', 'تم إيقاف اشتراك VIP الخاص بك', { tier: result.tier });
    res.json(result);
  })
);

export default router;
