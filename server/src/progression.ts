import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { one, q, tx } from './db';
import { notify, notifyWith } from './notify';
import { emitToUser } from './realtime';
import { getSettings } from './settings';
import { moveCoins } from './wallet';
import { HttpError, iraqDateStr } from './utils';

/**
 * Levels (XP) and VIP.
 *
 * The two systems are deliberately independent: XP comes only from real,
 * server-confirmed operations (`xp_events`), while VIP is a paid or
 * admin-granted subscription (`user_vips`). Buying VIP never adds XP, and
 * levelling up never grants VIP.
 *
 * Every XP award goes through `xp_events`, whose unique (user, kind, ref_id)
 * index makes a retried request, a replayed webhook or the same chat message
 * count exactly once.
 */

export const XP_SETTING_KEYS = [
  'daily_activity',
  'recharge_per_100',
  'gift_per_100',
  'chat_message',
  'chat_daily_cap',
  'achievement',
] as const;

export interface LevelRow {
  level: number;
  name_ar: string;
  name_en: string;
  xp_required: string | number;
  reward_coins: number;
  badge_color: string;
  badge_image_url: string | null;
  is_active: boolean;
}

export interface VipTierRow {
  tier: number;
  name_ar: string;
  name_en: string;
  price_coins: number;
  duration_days: number;
  color: string;
  badge_image_url: string | null;
  frame_image_url: string | null;
  bubble_image_url: string | null;
  title_ar: string;
  title_en: string;
  perks: string[];
  is_active: boolean;
  sort_order: number;
}

export interface VipInfo {
  tier: number;
  nameAr: string;
  nameEn: string;
  color: string;
  titleAr: string;
  titleEn: string;
  badgeImageUrl: string | null;
  frameImageUrl: string | null;
  bubbleImageUrl: string | null;
  source: string;
  expiresAt: string | null;
}

export function serializeLevel(row: LevelRow) {
  return {
    level: Number(row.level),
    nameAr: row.name_ar,
    nameEn: row.name_en,
    xpRequired: Number(row.xp_required),
    rewardCoins: Number(row.reward_coins),
    badgeColor: row.badge_color,
    badgeImageUrl: row.badge_image_url,
    isActive: row.is_active,
  };
}

export function serializeVipTier(row: VipTierRow) {
  return {
    tier: Number(row.tier),
    nameAr: row.name_ar,
    nameEn: row.name_en,
    priceCoins: Number(row.price_coins),
    durationDays: Number(row.duration_days),
    color: row.color,
    badgeImageUrl: row.badge_image_url,
    frameImageUrl: row.frame_image_url,
    bubbleImageUrl: row.bubble_image_url,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    perks: Array.isArray(row.perks) ? row.perks : [],
    isActive: row.is_active,
    sortOrder: Number(row.sort_order),
  };
}

export function vipFromRow(row: Partial<VipInfo> | null | undefined): VipInfo | null {
  if (!row || !row.tier) return null;
  return {
    tier: Number(row.tier),
    nameAr: row.nameAr ?? `VIP ${row.tier}`,
    nameEn: row.nameEn ?? `VIP ${row.tier}`,
    color: row.color ?? '#ffd75e',
    titleAr: row.titleAr ?? '',
    titleEn: row.titleEn ?? '',
    badgeImageUrl: row.badgeImageUrl ?? null,
    frameImageUrl: row.frameImageUrl ?? null,
    bubbleImageUrl: row.bubbleImageUrl ?? null,
    source: row.source ?? 'purchase',
    expiresAt: row.expiresAt ?? null,
  };
}

async function loadLevels(c: PoolClient | null = null): Promise<LevelRow[]> {
  const rows = c
    ? (await c.query<LevelRow>('SELECT * FROM levels ORDER BY level ASC')).rows
    : await q<LevelRow>('SELECT * FROM levels ORDER BY level ASC');
  return rows;
}

export async function getLevels(): Promise<LevelRow[]> {
  return loadLevels();
}

export async function getXpSettings(): Promise<Record<string, number>> {
  const rows = await q<{ key: string; value: number }>('SELECT key, value FROM xp_settings');
  const map: Record<string, number> = {
    daily_activity: 50,
    recharge_per_100: 20,
    gift_per_100: 25,
    chat_message: 2,
    chat_daily_cap: 100,
    achievement: 100,
  };
  for (const row of rows) map[row.key] = Number(row.value);
  return map;
}

export async function getXpSettingRows() {
  return q<{ key: string; value: number; description: string }>(
    'SELECT key, value, description FROM xp_settings ORDER BY key'
  );
}

export interface LevelState {
  level: number;
  xp: number;
  nameAr: string;
  nameEn: string;
  badgeColor: string;
  badgeImageUrl: string | null;
  currentLevelXp: number;
  nextLevelXp: number | null;
  nextLevel: number | null;
  progress: number;
  rewardCoins: number;
}

/** Pure: maps total XP onto the active level ladder. */
export function computeLevelState(xp: number, levels: LevelRow[]): LevelState {
  const active = levels
    .filter((row) => row.is_active)
    .sort((a, b) => Number(a.level) - Number(b.level));
  const fallback: LevelState = {
    level: 1,
    xp,
    nameAr: 'المستوى 1',
    nameEn: 'Level 1',
    badgeColor: '#ffd75e',
    badgeImageUrl: null,
    currentLevelXp: 0,
    nextLevelXp: null,
    nextLevel: null,
    progress: 1,
    rewardCoins: 0,
  };
  if (!active.length) return fallback;

  let current = active[0];
  let next: LevelRow | null = null;
  for (const row of active) {
    if (Number(row.xp_required) <= xp) current = row;
    else {
      next = row;
      break;
    }
  }
  const currentXp = Number(current.xp_required);
  const nextXp = next ? Number(next.xp_required) : null;
  const progress =
    nextXp === null ? 1 : Math.min(1, Math.max(0, (xp - currentXp) / Math.max(1, nextXp - currentXp)));
  return {
    level: Number(current.level),
    xp,
    nameAr: current.name_ar,
    nameEn: current.name_en,
    badgeColor: current.badge_color,
    badgeImageUrl: current.badge_image_url,
    currentLevelXp: currentXp,
    nextLevelXp: nextXp,
    nextLevel: next ? Number(next.level) : null,
    progress: Number(progress.toFixed(4)),
    rewardCoins: Number(current.reward_coins),
  };
}

/**
 * Pure: the state of an admin-granted level. The account shows the granted
 * level (name, badge, next level) while its XP keeps accumulating underneath,
 * so revoking the grant can drop it back onto the XP ladder.
 */
export function grantedLevelState(
  xp: number,
  grantLevel: number,
  levels: LevelRow[]
): LevelState | null {
  const active = levels
    .filter((row) => row.is_active)
    .sort((a, b) => Number(a.level) - Number(b.level));
  const index = active.findIndex((row) => Number(row.level) === grantLevel);
  if (index < 0) return null;
  const row = active[index];
  const next = active[index + 1] ?? null;
  const currentXp = Number(row.xp_required);
  const nextXp = next ? Number(next.xp_required) : null;
  const progress =
    nextXp === null
      ? 1
      : Math.min(1, Math.max(0, (xp - currentXp) / Math.max(1, nextXp - currentXp)));
  return {
    level: Number(row.level),
    xp,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    badgeColor: row.badge_color,
    badgeImageUrl: row.badge_image_url,
    currentLevelXp: currentXp,
    nextLevelXp: nextXp,
    nextLevel: next ? Number(next.level) : null,
    progress: Number(progress.toFixed(4)),
    rewardCoins: Number(row.reward_coins),
  };
}

export async function getLevelState(userId: string): Promise<LevelState> {
  const user = await one<{ xp: string | number; level: number; level_granted: number | null }>(
    'SELECT xp, level, level_granted FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw new HttpError(404, 'Account not found', 'account_missing');
  const levels = await loadLevels();
  const xp = Number(user.xp);
  const state =
    (user.level_granted !== null && grantedLevelState(xp, Number(user.level_granted), levels)) ||
    computeLevelState(xp, levels);
  if (state.level !== Number(user.level)) {
    await q('UPDATE users SET level = $2 WHERE id = $1', [userId, state.level]);
  }
  return state;
}

interface AwardOptions {
  userId: string;
  kind: string;
  refId: string;
  xp: number;
}

/**
 * Writes one XP award inside the caller's transaction and levels the user up.
 * Returns the XP actually awarded (0 when the reference was already used) and
 * the new level when the user levelled up.
 */
export async function awardXp(
  c: PoolClient,
  { userId, kind, refId, xp }: AwardOptions
): Promise<{ awarded: number; levelUp: number | null; level: number }> {
  let amount = Math.max(0, Math.trunc(xp));
  const current = await c.query<{ xp: string | number; level: number; level_granted: number | null }>(
    'SELECT xp, level, level_granted FROM users WHERE id = $1 FOR UPDATE',
    [userId]
  );
  if (!current.rowCount) return { awarded: 0, levelUp: null, level: 1 };

  if (kind === 'chat' && amount > 0) {
    const settings = await getXpSettings();
    const cap = settings.chat_daily_cap ?? 0;
    const today = await c.query<{ total: number }>(
      `SELECT COALESCE(SUM(xp), 0)::int AS total FROM xp_events
       WHERE user_id = $1 AND kind = 'chat'
         AND (created_at AT TIME ZONE 'Asia/Baghdad')::date = $2::date`,
      [userId, iraqDateStr()]
    );
    amount = Math.max(0, Math.min(amount, cap - Number(today.rows[0]?.total ?? 0)));
  }
  if (amount <= 0) {
    return { awarded: 0, levelUp: null, level: Number(current.rows[0].level) };
  }

  const inserted = await c.query(
    `INSERT INTO xp_events (user_id, kind, ref_id, xp) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, kind, ref_id) DO NOTHING RETURNING id`,
    [userId, kind, refId, amount]
  );
  if (!inserted.rowCount) {
    return { awarded: 0, levelUp: null, level: Number(current.rows[0].level) };
  }

  const updated = await c.query<{ xp: string | number; level: number }>(
    'UPDATE users SET xp = xp + $2 WHERE id = $1 RETURNING xp, level',
    [userId, amount]
  );
  const totalXp = Number(updated.rows[0].xp);
  const previousLevel = Number(updated.rows[0].level);
  const levels = await loadLevels(c);
  // A granted level wins over the XP ladder until an admin revokes it.
  if (current.rows[0].level_granted !== null) {
    return { awarded: amount, levelUp: null, level: previousLevel };
  }
  const state = computeLevelState(totalXp, levels);
  if (state.level <= previousLevel) {
    return { awarded: amount, levelUp: null, level: previousLevel };
  }

  await c.query('UPDATE users SET level = $2 WHERE id = $1', [userId, state.level]);
  const active = levels
    .filter((row) => row.is_active)
    .sort((a, b) => Number(a.level) - Number(b.level));
  for (const row of active) {
    const level = Number(row.level);
    if (level <= previousLevel || level > state.level) continue;
    const reward = Number(row.reward_coins);
    if (reward > 0) {
      await moveCoins(c, {
        userId,
        amount: reward,
        type: 'level_reward',
        refType: 'level',
        refId: requestRef(`level:${userId}:${level}`),
        meta: { level },
      });
    }
    await c.query(
      `INSERT INTO level_history (user_id, level, xp, reward_coins, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, level, totalXp, reward, kind]
    );
    await notifyWith(
      c,
      userId,
      'level_up',
      'ترقية مستوى 🎉',
      `وصلت إلى ${row.name_ar || `المستوى ${level}`}${reward > 0 ? ` وحصلت على ${reward} كونز` : ''}`,
      { level, xp: totalXp, rewardCoins: reward }
    );
  }
  // Royal celebration on the user's open screens; the admin switch silences it.
  const settings = await getSettings();
  if (settings.level_up_effects) {
    const reached = active.find((row) => Number(row.level) === state.level);
    emitToUser(userId, 'level:up', {
      level: state.level,
      nameAr: reached?.name_ar || `المستوى ${state.level}`,
      nameEn: reached?.name_en || `Level ${state.level}`,
      badgeImageUrl: reached?.badge_image_url ?? null,
    });
  }
  return { awarded: amount, levelUp: state.level, level: state.level };
}

/** Fire-and-forget award used by read paths; never breaks the request. */
export async function awardXpSafe(options: AwardOptions): Promise<void> {
  if (!options.xp || options.xp <= 0) return;
  try {
    await tx((c) => awardXp(c, options));
  } catch (error) {
    console.error('[xp] award failed', options.kind, (error as Error).message);
  }
}

/** One XP award per Baghdad day for being active in the app. */
export async function awardDailyActivity(userId: string): Promise<void> {
  const settings = await getXpSettings();
  const xp = settings.daily_activity ?? 0;
  if (xp <= 0) return;
  await awardXpSafe({ userId, kind: 'daily', refId: iraqDateStr(), xp });
}

export function xpForCoins(kind: 'recharge' | 'gift', coins: number, settings: Record<string, number>): number {
  const rate = kind === 'recharge' ? settings.recharge_per_100 ?? 0 : settings.gift_per_100 ?? 0;
  return Math.floor(Math.max(0, coins) / 100) * rate;
}

/* ------------------------------------------------------------------ VIP */

export async function getVipTiers(): Promise<VipTierRow[]> {
  return q<VipTierRow>('SELECT * FROM vip_tiers ORDER BY sort_order ASC, tier ASC');
}

function vipInfoFromTier(row: VipTierRow, expiresAt: string | null, source: string): VipInfo {
  return {
    tier: Number(row.tier),
    nameAr: row.name_ar,
    nameEn: row.name_en,
    color: row.color,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    badgeImageUrl: row.badge_image_url,
    frameImageUrl: row.frame_image_url,
    bubbleImageUrl: row.bubble_image_url,
    source,
    expiresAt,
  };
}

export async function activeVip(userId: string): Promise<VipInfo | null> {
  const row = await one<VipTierRow & { expires_at: string | null; source: string }>(
    `SELECT vt.*, uv.expires_at, uv.source
     FROM user_vips uv
     JOIN vip_tiers vt ON vt.tier = uv.tier AND vt.is_active
     WHERE uv.user_id = $1 AND uv.is_active
       AND (uv.expires_at IS NULL OR uv.expires_at > now())
     LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  return vipInfoFromTier(row, row.expires_at ? new Date(row.expires_at).toISOString() : null, row.source);
}

/** Deactivates lapsed subscriptions and records them in the history. */
export async function expireVips(): Promise<number> {
  const rows = await q<{ user_id: string; tier: number; expires_at: string }>(
    `UPDATE user_vips SET is_active = false, revoked_at = now()
     WHERE is_active AND expires_at IS NOT NULL AND expires_at <= now()
     RETURNING user_id, tier, expires_at`
  );
  for (const row of rows) {
    await q(
      `INSERT INTO vip_history (user_id, tier, action, actor_kind, coins, expires_at, note)
       VALUES ($1, $2, 'expire', 'system', 0, $3, 'انتهت مدة الاشتراك')`,
      [row.user_id, row.tier, row.expires_at]
    );
    await notify(row.user_id, 'vip_expired', 'انتهى اشتراك VIP', 'انتهت مدة اشتراكك، يمكنك التجديد في أي وقت', {
      tier: row.tier,
    });
  }
  return rows.length;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ledger stores references as uuid, so any client request id is folded into
 * a stable uuid: a real uuid is used as-is, anything else is hashed, which keeps
 * the idempotency guarantee for the same request id.
 */
export function requestRef(value: string): string {
  if (UUID_RE.test(value)) return value.toLowerCase();
  const hex = crypto.createHash('sha1').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function purchaseVip(userId: string, tier: number, requestId: string) {
  return tx(async (c) => {
    const tierRow = await c.query<VipTierRow>(
      'SELECT * FROM vip_tiers WHERE tier = $1 AND is_active = true',
      [tier]
    );
    if (!tierRow.rowCount) throw new HttpError(404, 'رتبة VIP غير متوفرة', 'vip_tier_missing');
    const row = tierRow.rows[0];
    const price = Number(row.price_coins);
    const days = Number(row.duration_days);

    const moved = await moveCoins(c, {
      userId,
      amount: -price,
      type: 'vip_purchase',
      refType: 'vip_request',
      refId: requestRef(requestId),
      meta: { tier, days },
    });
    if (!moved.applied) {
      throw new HttpError(409, 'تمت معالجة هذا الطلب مسبقاً', 'duplicate_request');
    }

    const active = await c.query<{ id: string; tier: number; expires_at: string | null }>(
      'SELECT id, tier, expires_at FROM user_vips WHERE user_id = $1 AND is_active FOR UPDATE',
      [userId]
    );
    let expiresAt: string;
    let action = 'purchase';
    if (active.rowCount && Number(active.rows[0].tier) === tier) {
      const base =
        active.rows[0].expires_at && new Date(active.rows[0].expires_at).getTime() > Date.now()
          ? new Date(active.rows[0].expires_at)
          : new Date();
      expiresAt = new Date(base.getTime() + days * 86_400_000).toISOString();
      await c.query('UPDATE user_vips SET expires_at = $2 WHERE id = $1', [active.rows[0].id, expiresAt]);
      action = 'renew';
    } else {
      if (active.rowCount) {
        await c.query('UPDATE user_vips SET is_active = false, revoked_at = now() WHERE id = $1', [
          active.rows[0].id,
        ]);
      }
      const inserted = await c.query<{ expires_at: string }>(
        `INSERT INTO user_vips (user_id, tier, source, expires_at)
         VALUES ($1, $2, 'purchase', now() + ($3 || ' days')::interval)
         RETURNING expires_at`,
        [userId, tier, days]
      );
      expiresAt = inserted.rows[0].expires_at;
    }

    await c.query(
      `INSERT INTO vip_history (user_id, tier, action, actor_kind, actor_id, actor_name, coins, expires_at)
       VALUES ($1, $2, $3, 'user', $1, '', $4, $5)`,
      [userId, tier, action, price, expiresAt]
    );

    return { tier, expiresAt, price, balanceAfter: moved.balanceAfter, action };
  });
}

interface AdminVipAction {
  userId: string;
  tier: number;
  days: number;
  adminId: string | null;
  adminName: string;
  note?: string | null;
}

export async function grantVip({ userId, tier, days, adminId, adminName, note }: AdminVipAction) {
  const tierRow = await one<VipTierRow>('SELECT * FROM vip_tiers WHERE tier = $1', [tier]);
  if (!tierRow) throw new HttpError(404, 'رتبة VIP غير موجودة', 'vip_tier_missing');
  const duration = days > 0 ? days : Number(tierRow.duration_days);
  return tx(async (c) => {
    await c.query('UPDATE user_vips SET is_active = false, revoked_at = now() WHERE user_id = $1 AND is_active', [
      userId,
    ]);
    const inserted = await c.query<{ expires_at: string | null }>(
      `INSERT INTO user_vips (user_id, tier, source, granted_by_admin, expires_at)
       VALUES ($1, $2, 'admin', $3, now() + ($4 || ' days')::interval)
       RETURNING expires_at`,
      [userId, tier, adminId, duration]
    );
    const expiresAt = inserted.rows[0].expires_at;
    await c.query(
      `INSERT INTO vip_history (user_id, tier, action, actor_kind, actor_id, actor_name, coins, expires_at, note)
       VALUES ($1, $2, 'grant', 'admin', $3, $4, 0, $5, $6)`,
      [userId, tier, adminId, adminName, expiresAt, note ?? null]
    );
    return { tier, expiresAt };
  });
}

export async function renewVip({ userId, days, adminId, adminName }: Omit<AdminVipAction, 'tier'>) {
  const active = await one<{ id: string; tier: number; expires_at: string | null }>(
    'SELECT id, tier, expires_at FROM user_vips WHERE user_id = $1 AND is_active LIMIT 1',
    [userId]
  );
  if (!active) throw new HttpError(404, 'لا يوجد اشتراك VIP فعّال', 'no_active_vip');
  const base =
    active.expires_at && new Date(active.expires_at).getTime() > Date.now()
      ? new Date(active.expires_at)
      : new Date();
  const expiresAt = new Date(base.getTime() + Math.max(1, days) * 86_400_000).toISOString();
  await q('UPDATE user_vips SET expires_at = $2 WHERE id = $1', [active.id, expiresAt]);
  await q(
    `INSERT INTO vip_history (user_id, tier, action, actor_kind, actor_id, actor_name, coins, expires_at)
     VALUES ($1, $2, 'renew', 'admin', $3, $4, 0, $5)`,
    [userId, active.tier, adminId, adminName, expiresAt]
  );
  return { tier: active.tier, expiresAt };
}

export async function revokeVip({
  userId,
  adminId,
  adminName,
  note,
}: {
  userId: string;
  adminId: string | null;
  adminName: string;
  note?: string | null;
}) {
  const active = await one<{ id: string; tier: number }>(
    'SELECT id, tier FROM user_vips WHERE user_id = $1 AND is_active LIMIT 1',
    [userId]
  );
  if (!active) throw new HttpError(404, 'لا يوجد اشتراك VIP فعّال', 'no_active_vip');
  await q('UPDATE user_vips SET is_active = false, revoked_at = now() WHERE id = $1', [active.id]);
  await q(
    `INSERT INTO vip_history (user_id, tier, action, actor_kind, actor_id, actor_name, coins, note)
     VALUES ($1, $2, 'revoke', 'admin', $3, $4, 0, $5)`,
    [userId, active.tier, adminId, adminName, note ?? null]
  );
  return { tier: active.tier };
}

export async function vipHistory(userId: string, limit = 30) {
  return q(
    `SELECT id, tier, action, actor_kind, actor_name, coins, expires_at, note, created_at
     FROM vip_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function levelHistory(userId: string, limit = 50) {
  return q(
    `SELECT id, level, xp, reward_coins, source, created_at
     FROM level_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

/* ------------------------------------------------- admin level management */

export interface LevelGrantResult {
  userId: string;
  displayName: string;
  previousLevel: number;
  level: number;
  changed: boolean;
  nameAr: string;
  nameEn: string;
  badgeImageUrl: string | null;
}

interface AdminLevelAction {
  userId: string;
  adminId: string;
  adminName: string;
  reason?: string | null;
}

interface LevelGrantInput extends AdminLevelAction {
  level: number;
}

/**
 * Grants a level (1..100) to one account, overriding the XP ladder until it is
 * revoked. Everything happens on the server inside one transaction: the level
 * override, the audit row, the user's own history and their notification.
 */
export async function grantUserLevel({
  userId,
  level,
  adminId,
  adminName,
  reason,
}: LevelGrantInput): Promise<LevelGrantResult> {
  const note = reason?.trim().slice(0, 200) || null;
  const result = await tx(async (c) => {
    const found = await c.query<{
      id: string;
      xp: string | number;
      level: number;
      level_granted: number | null;
      display_name: string;
    }>('SELECT id, xp, level, level_granted, display_name FROM users WHERE id = $1 AND is_bot = false FOR UPDATE', [
      userId,
    ]);
    if (!found.rowCount) throw new HttpError(404, 'المستخدم غير موجود', 'user_missing');
    const user = found.rows[0];
    const levels = await loadLevels(c);
    const row = levels.find((item) => Number(item.level) === level && item.is_active);
    if (!row) throw new HttpError(404, 'المستوى غير موجود', 'level_missing');

    const previousLevel = Number(user.level);
    if (user.level_granted !== null && previousLevel === level) {
      return {
        userId,
        displayName: user.display_name,
        previousLevel,
        level,
        changed: false,
        nameAr: row.name_ar,
        nameEn: row.name_en,
        badgeImageUrl: row.badge_image_url,
      };
    }

    // Remember where the XP ladder had the account so the grant is reversible.
    const xpLevel = computeLevelState(Number(user.xp), levels).level;
    await c.query(
      `UPDATE users SET level = $2, level_granted = $2, level_before_grant = COALESCE(level_before_grant, $3)
       WHERE id = $1`,
      [userId, level, xpLevel]
    );
    await c.query(
      `INSERT INTO level_grant_log (user_id, admin_id, admin_name, action, previous_level, new_level, reason)
       VALUES ($1, $2, $3, 'grant', $4, $5, $6)`,
      [userId, adminId, adminName, previousLevel, level, note]
    );
    await c.query(
      `INSERT INTO level_history (user_id, level, xp, reward_coins, source)
       VALUES ($1, $2, $3, 0, 'admin')`,
      [userId, level, Number(user.xp)]
    );
    await notifyWith(
      c,
      userId,
      'level_granted',
      'تم تحديث مستواك',
      `تم تعيين مستواك إلى ${row.name_ar || `المستوى ${level}`}${note ? ` — ${note}` : ''}`,
      { level, previousLevel, reason: note }
    );
    return {
      userId,
      displayName: user.display_name,
      previousLevel,
      level,
      changed: true,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      badgeImageUrl: row.badge_image_url,
    };
  });

  if (result.changed) {
    if (result.level > result.previousLevel) {
      emitToUser(userId, 'level:up', {
        level: result.level,
        nameAr: result.nameAr,
        nameEn: result.nameEn,
        badgeImageUrl: result.badgeImageUrl,
      });
    } else {
      emitToUser(userId, 'level:changed', { level: result.level });
    }
  }
  return result;
}

export async function revokeUserLevel({
  userId,
  adminId,
  adminName,
  reason,
}: {
  userId: string;
  adminId: string;
  adminName: string;
  reason?: string | null;
}) {
  const result = await tx(async (c) => {
    const found = await c.query<{
      id: string;
      xp: string | number;
      level: number;
      level_granted: number | null;
      display_name: string;
    }>(
      'SELECT id, xp, level, level_granted, display_name FROM users WHERE id = $1 AND is_bot = false FOR UPDATE',
      [userId]
    );
    if (!found.rowCount) throw new HttpError(404, 'المستخدم غير موجود', 'user_missing');
    const user = found.rows[0];
    if (user.level_granted === null) {
      throw new HttpError(400, 'لا يوجد مستوى ممنوح لهذا المستخدم', 'no_level_grant');
    }
    const levels = await loadLevels(c);
    const note = reason?.trim().slice(0, 200) || null;
    const previousLevel = Number(user.level);
    const xpLevel = computeLevelState(Number(user.xp), levels).level;
    await c.query(
      'UPDATE users SET level = $2, level_granted = NULL, level_before_grant = NULL WHERE id = $1',
      [userId, xpLevel]
    );
    await c.query(
      `INSERT INTO level_grant_log (user_id, admin_id, admin_name, action, previous_level, new_level, reason)
       VALUES ($1, $2, $3, 'revoke', $4, $5, $6)`,
      [userId, adminId, adminName, previousLevel, xpLevel, note]
    );
    await notifyWith(
      c,
      userId,
      'level_revoked',
      'تمت إعادة مستوى حسابك',
      `عاد مستواك إلى المستوى ${xpLevel}`,
      { level: xpLevel, previousLevel }
    );
    return { userId, displayName: user.display_name, previousLevel, level: xpLevel, changed: true };
  });
  emitToUser(userId, 'level:changed', { level: result.level });
  return result;
}

/** User lookup for the level-management screen (name, 6-digit ID or email). */
export async function searchUsersForLevel(term: string) {
  const like = `%${term}%`;
  return q(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.level, u.level_granted, u.xp,
            l.name_ar, l.name_en, l.badge_image_url
     FROM users u
     LEFT JOIN levels l ON l.level = u.level
     WHERE u.is_bot = false AND (u.username ILIKE $1 OR u.display_name ILIKE $1 OR u.email ILIKE $1)
     ORDER BY u.created_at DESC LIMIT 20`,
    [like]
  );
}

export async function levelGrantLog(limit = 100) {
  return q(
    `SELECT g.id, g.action, g.previous_level, g.new_level, g.reason, g.created_at, g.admin_name,
            u.id AS user_id, u.display_name, u.username, u.avatar_url
     FROM level_grant_log g
     JOIN users u ON u.id = g.user_id
     ORDER BY g.created_at DESC LIMIT $1`,
    [limit]
  );
}

export async function levelsOverview() {
  const levels = await loadLevels();
  const counts = await q<{ level: number; users: string }>(
    'SELECT level, count(*)::text AS users FROM users WHERE is_bot = false GROUP BY level'
  );
  const byLevel = new Map(counts.map((row) => [Number(row.level), Number(row.users)]));
  const tiers = await getVipTiers();
  const vipCounts = await q<{ tier: number; users: string }>(
    `SELECT tier, count(*)::text AS users FROM user_vips
     WHERE is_active AND (expires_at IS NULL OR expires_at > now()) GROUP BY tier`
  );
  const byTier = new Map(vipCounts.map((row) => [Number(row.tier), Number(row.users)]));
  return {
    levels: levels.map((row) => ({ ...serializeLevel(row), users: byLevel.get(Number(row.level)) ?? 0 })),
    tiers: tiers.map((row) => ({ ...serializeVipTier(row), users: byTier.get(Number(row.tier)) ?? 0 })),
    totalVip: [...byTier.values()].reduce((sum, value) => sum + value, 0),
  };
}
