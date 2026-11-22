import type { PoolClient } from 'pg';
import { one, q, tx } from './db';
import { HttpError, iraqDateStr, nextIraqMidnight } from './utils';
import { moveCoins } from './wallet';

/**
 * Official ranks & daily boxes.
 *
 * Everything here is server-authoritative: a rank is only ever written by an
 * administrator (the admin panel) or by an app user whose active rank carries
 * the matching permission. The client can read its rank and claim the daily box,
 * nothing else.
 */

/** Permission keys a rank (or position) can carry. `*` means "everything". */
export const RANK_PERMISSIONS = [
  'manage_ranks',
  'manage_boxes',
  'manage_users',
  'manage_rooms',
  'manage_events',
  'manage_balances',
  'system_settings',
  'support_tickets',
  'view_users',
  'view_recharge_orders',
  'agent_panel',
] as const;

export const RANK_PERMISSION_LABELS: Record<string, string> = {
  '*': 'جميع الصلاحيات',
  manage_ranks: 'إدارة الرتب (منح وسحب)',
  manage_boxes: 'إدارة البوكسات اليومية',
  manage_users: 'إدارة المستخدمين',
  manage_rooms: 'إدارة غرف الأنشطة',
  manage_events: 'إدارة الفعاليات والمسابقات',
  manage_balances: 'إدارة الأرصدة',
  system_settings: 'إعدادات النظام',
  support_tickets: 'طلبات الدعم والشكاوى',
  view_users: 'عرض المستخدمين',
  view_recharge_orders: 'عرض طلبات الشحن',
  agent_panel: 'لوحة الوكيل',
};

export interface RankRow {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  kind: string;
  tier: number;
  power: number;
  description: string;
  daily_coins: number;
  commission_percent: number;
  color: string;
  badge_image_url: string | null;
  permissions: string[];
  duration_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RankBoxRow {
  id: string;
  rank_key: string;
  name: string;
  coins: number;
  extras: RankBoxExtra[];
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RankBoxExtra =
  | { type: 'coins'; amount: number }
  | { type: 'cosmetic'; itemId: string };

export interface RankInfo {
  key: string;
  nameAr: string;
  nameEn: string;
  kind: string;
  tier: number;
  color: string;
  badgeImageUrl: string | null;
  /** Job title shown on the profile — the position name for senior management. */
  jobTitle: string | null;
}

export function serializeRankInfo(row: RankRow): RankInfo {
  return {
    key: row.key,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    kind: row.kind,
    tier: Number(row.tier),
    color: row.color,
    badgeImageUrl: row.badge_image_url,
    jobTitle: row.kind === 'position' ? row.name_ar : null,
  };
}

export function serializeRank(row: RankRow & { holders?: number }) {
  return {
    id: row.id,
    key: row.key,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    kind: row.kind,
    tier: Number(row.tier),
    power: Number(row.power),
    description: row.description,
    jobTitle: row.kind === 'position' ? row.name_ar : null,
    dailyCoins: Number(row.daily_coins),
    commissionPercent: Number(row.commission_percent),
    color: row.color,
    badgeImageUrl: row.badge_image_url,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    durationDays: Number(row.duration_days),
    isActive: row.is_active,
    sortOrder: Number(row.sort_order),
    holders: row.holders === undefined ? undefined : Number(row.holders),
  };
}

export function serializeBox(row: RankBoxRow) {
  return {
    id: row.id,
    rankKey: row.rank_key,
    name: row.name,
    coins: Number(row.coins),
    extras: Array.isArray(row.extras) ? row.extras : [],
    imageUrl: row.image_url,
    isActive: row.is_active,
  };
}

export function hasPermission(rank: RankRow | null | undefined, permission: string): boolean {
  if (!rank) return false;
  const list = Array.isArray(rank.permissions) ? rank.permissions : [];
  return list.includes('*') || list.includes(permission);
}

export interface RankActor {
  kind: 'admin' | 'user' | 'system';
  id: string | null;
  name: string;
  power: number;
  isSuper: boolean;
}

export const ADMIN_ACTOR = (id: string, name: string): RankActor => ({
  kind: 'admin',
  id,
  name,
  power: 1000,
  isSuper: true,
});

/** Deactivates ranks whose grant expired (a lapsed agent loses the rank at once). */
export async function expireRanks(): Promise<void> {
  await q(
    `UPDATE user_ranks SET is_active = false, revoked_at = now()
     WHERE is_active AND expires_at IS NOT NULL AND expires_at <= now()`
  );
}

export async function activeRankFor(userId: string): Promise<RankRow | null> {
  return one<RankRow>(
    `SELECT r.* FROM user_ranks ur
     JOIN ranks r ON r.key = ur.rank_key
     WHERE ur.user_id = $1 AND ur.is_active AND r.is_active = true
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
     LIMIT 1`,
    [userId]
  );
}

export async function audit(
  c: PoolClient,
  entry: {
    actor: RankActor;
    action: string;
    targetUserId?: string | null;
    rankKey?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await c.query(
    `INSERT INTO rank_audit (actor_kind, actor_id, actor_name, action, target_user_id, rank_key, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entry.actor.kind,
      entry.actor.id,
      entry.actor.name,
      entry.action,
      entry.targetUserId ?? null,
      entry.rankKey ?? null,
      JSON.stringify(entry.details ?? {}),
    ]
  );
}

export async function grantRank(input: {
  actor: RankActor;
  userId: string;
  rankKey: string;
  durationDays?: number;
  note?: string | null;
}): Promise<{ rank: RankRow; expiresAt: string | null }> {
  const rank = await one<RankRow>('SELECT * FROM ranks WHERE key = $1', [input.rankKey]);
  if (!rank) throw new HttpError(404, 'Rank not found', 'rank_not_found');
  if (!rank.is_active) throw new HttpError(409, 'This rank is paused', 'rank_inactive');
  if (input.actor.kind === 'user' && input.actor.id === input.userId) {
    throw new HttpError(403, 'You cannot grant a rank to yourself', 'self_grant');
  }
  if (!input.actor.isSuper && Number(rank.power) >= input.actor.power) {
    throw new HttpError(
      403,
      'You cannot grant a rank at or above your own authority',
      'insufficient_authority'
    );
  }
  const target = await one<{ id: string; is_bot: boolean }>(
    'SELECT id, is_bot FROM users WHERE id = $1',
    [input.userId]
  );
  if (!target || target.is_bot) throw new HttpError(404, 'User not found', 'user_not_found');

  const days =
    input.durationDays === undefined ? Number(rank.duration_days) : Math.max(0, Number(input.durationDays));
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  return tx(async (c) => {
    await c.query(
      'UPDATE user_ranks SET is_active = false, revoked_at = now() WHERE user_id = $1 AND is_active',
      [input.userId]
    );
    await c.query(
      `INSERT INTO user_ranks (user_id, rank_key, granted_by_admin, granted_by_user, note, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.userId,
        rank.key,
        input.actor.kind === 'admin' ? input.actor.id : null,
        input.actor.kind === 'user' ? input.actor.id : null,
        input.note ?? null,
        expiresAt,
      ]
    );
    await audit(c, {
      actor: input.actor,
      action: 'grant',
      targetUserId: input.userId,
      rankKey: rank.key,
      details: { rankName: rank.name_ar, durationDays: days, expiresAt },
    });
    return { rank, expiresAt: expiresAt ? expiresAt.toISOString() : null };
  });
}

export async function revokeRank(input: {
  actor: RankActor;
  userId: string;
  reason?: string | null;
}): Promise<RankRow> {
  const current = await activeRankFor(input.userId);
  if (!current) throw new HttpError(404, 'This user has no active rank', 'no_rank');
  if (input.actor.kind === 'user' && !input.actor.isSuper && Number(current.power) >= input.actor.power) {
    throw new HttpError(403, 'You cannot revoke a rank at or above your own authority', 'insufficient_authority');
  }
  return tx(async (c) => {
    await c.query(
      'UPDATE user_ranks SET is_active = false, revoked_at = now() WHERE user_id = $1 AND is_active',
      [input.userId]
    );
    await audit(c, {
      actor: input.actor,
      action: 'revoke',
      targetUserId: input.userId,
      rankKey: current.key,
      details: { rankName: current.name_ar, reason: input.reason ?? null },
    });
    return current;
  });
}

export interface ClaimResult {
  claimId: string;
  rankKey: string;
  coins: number;
  granted: { label: string }[];
  balance: number | null;
}

/** Claims today's box for the caller's active rank. Idempotent per Baghdad day. */
export async function claimDailyBox(userId: string): Promise<ClaimResult> {
  await expireRanks();
  return tx(async (c) => {
    const rankRes = await c.query<RankRow>(
      `SELECT r.* FROM user_ranks ur
       JOIN ranks r ON r.key = ur.rank_key
       WHERE ur.user_id = $1 AND ur.is_active AND r.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
       FOR UPDATE OF ur
       LIMIT 1`,
      [userId]
    );
    const rank = rankRes.rows[0];
    if (!rank) throw new HttpError(403, 'You do not hold a rank yet', 'no_rank');

    const boxRes = await c.query<RankBoxRow>(
      'SELECT * FROM rank_boxes WHERE rank_key = $1 AND is_active = true',
      [rank.key]
    );
    const box = boxRes.rows[0];
    if (!box) throw new HttpError(404, 'This rank has no daily box yet', 'no_box');

    const today = iraqDateStr();
    const claimRes = await c.query<{ id: string }>(
      `INSERT INTO rank_box_claims (user_id, box_id, rank_key, claim_date, coins, details)
       VALUES ($1, $2, $3, $4::date, $5, $6::jsonb)
       ON CONFLICT (user_id, claim_date) DO NOTHING
       RETURNING id`,
      [userId, box.id, rank.key, today, Number(box.coins), JSON.stringify({ boxName: box.name })]
    );
    if (!claimRes.rowCount) {
      throw new HttpError(409, 'You already claimed today\'s box', 'already_claimed');
    }
    const claimId = claimRes.rows[0].id;

    let balance: number | null = null;
    if (Number(box.coins) > 0) {
      const moved = await moveCoins(c, {
        userId,
        amount: Number(box.coins),
        type: 'rank_box',
        refType: 'rank_box_claim',
        refId: claimId,
        meta: { rankKey: rank.key, boxId: box.id },
      });
      balance = moved.balanceAfter;
    }

    const granted: { label: string }[] = [];
    for (const extra of Array.isArray(box.extras) ? box.extras : []) {
      if (extra.type === 'coins' && Number(extra.amount) > 0) {
        const moved = await moveCoins(c, {
          userId,
          amount: Number(extra.amount),
          type: 'rank_box_bonus',
          refType: 'rank_box_claim',
          refId: claimId,
          meta: { rankKey: rank.key, boxId: box.id },
        });
        if (moved.applied) {
          granted.push({ label: `+${Number(extra.amount)} كونز إضافية` });
          balance = moved.balanceAfter;
        }
      } else if (extra.type === 'cosmetic' && extra.itemId) {
        // Grant ownership of a store item (it stays in the user's collection).
        const owned = await c.query<{ name: string; category: string }>(
          `INSERT INTO user_avatar_frames (user_id, frame_id)
           SELECT $1, f.id FROM avatar_frames f WHERE f.id = $2 AND f.is_active = true
           ON CONFLICT (user_id, frame_id) DO NOTHING
           RETURNING (SELECT name FROM avatar_frames WHERE id = $2) AS name,
                     (SELECT category FROM avatar_frames WHERE id = $2) AS category`,
          [userId, extra.itemId]
        );
        if (owned.rowCount) granted.push({ label: owned.rows[0].name });
      }
    }

    if (granted.length) {
      await c.query('UPDATE rank_box_claims SET details = details || $2::jsonb WHERE id = $1', [
        claimId,
        JSON.stringify({ granted }),
      ]);
    }
    await audit(c, {
      actor: { kind: 'system', id: userId, name: 'daily_box', power: 0, isSuper: false },
      action: 'claim',
      targetUserId: userId,
      rankKey: rank.key,
      details: { boxId: box.id, coins: Number(box.coins), granted },
    });

    return { claimId, rankKey: rank.key, coins: Number(box.coins), granted, balance };
  });
}

/** Everything the ranks screen needs, in one read. */
export async function rankOverview(userId: string) {
  await expireRanks();
  const ranks = await q<RankRow & { holders: number }>(
    `SELECT r.*,
       (SELECT count(*)::int FROM user_ranks ur
         WHERE ur.rank_key = r.key AND ur.is_active
           AND (ur.expires_at IS NULL OR ur.expires_at > now())) AS holders
     FROM ranks r ORDER BY r.sort_order ASC, r.created_at ASC`
  );
  const boxes = await q<RankBoxRow>('SELECT * FROM rank_boxes ORDER BY created_at ASC');
  const mine = await activeRankFor(userId);
  const myBox = mine
    ? boxes.find((box) => box.rank_key === mine.key && box.is_active) ?? null
    : null;
  const lastClaim = await one<{ claim_date: string; coins: number; created_at: string; rank_key: string }>(
    `SELECT claim_date::text AS claim_date, coins, created_at, rank_key
     FROM rank_box_claims WHERE user_id = $1 AND claim_date = $2::date`,
    [userId, iraqDateStr()]
  );
  const history = await q<{
    id: string;
    rank_key: string;
    claim_date: string;
    coins: number;
    details: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id, rank_key, claim_date::text AS claim_date, coins, details, created_at
     FROM rank_box_claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return {
    ranks: ranks.map(serializeRank),
    boxes: boxes.map(serializeBox),
    mine: mine ? serializeRank(mine) : null,
    myBox: myBox ? serializeBox(myBox) : null,
    claimedToday: Boolean(lastClaim),
    history: history.map((row) => ({
      id: row.id,
      rankKey: row.rank_key,
      date: row.claim_date,
      coins: Number(row.coins),
      details: row.details,
      createdAt: row.created_at,
    })),
    nextClaimAt: nextIraqMidnight().toISOString(),
  };
}

/**
 * Agent panel. Read-only reporting over the real recharge orders and earnings —
 * no coins are minted here; commission payouts stay an administrative action.
 */
export async function agentPanel(userId: string) {
  const rank = await activeRankFor(userId);
  if (!hasPermission(rank, 'agent_panel')) {
    throw new HttpError(403, 'Agent access required', 'forbidden');
  }
  const totals = await one<{
    recharge_coins: number;
    paid_orders: number;
    earnings_coins: number;
    spent_coins: number;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(coins), 0)::int FROM payment_orders
         WHERE user_id = $1 AND status = 'paid') AS recharge_coins,
       (SELECT count(*)::int FROM payment_orders
         WHERE user_id = $1 AND status = 'paid') AS paid_orders,
       (SELECT COALESCE(SUM(coins), 0)::int FROM earnings WHERE user_id = $1) AS earnings_coins,
       (SELECT COALESCE(SUM(amount), 0)::int FROM transactions
         WHERE user_id = $1 AND type = 'recharge' AND amount > 0) AS spent_coins`,
    [userId]
  );
  const orders = await q<{
    id: string;
    coins: number;
    amount: number;
    currency: string;
    provider: string;
    status: string;
    created_at: string;
    paid_at: string | null;
  }>(
    `SELECT id, coins, amount, currency, provider, status, created_at, paid_at
     FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return {
    rank: rank ? serializeRank(rank) : null,
    commissionPercent: Number(rank?.commission_percent ?? 0),
    totals: {
      rechargeCoins: Number(totals?.recharge_coins ?? 0),
      paidOrders: Number(totals?.paid_orders ?? 0),
      earningsCoins: Number(totals?.earnings_coins ?? 0),
      spentCoins: Number(totals?.spent_coins ?? 0),
    },
    orders: orders.map((row) => ({
      id: row.id,
      coins: Number(row.coins),
      amount: Number(row.amount),
      currency: row.currency,
      provider: row.provider,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    })),
  };
}

/** Admin/manager overview: catalog, boxes, holders and the two logs. */
export async function manageOverview() {
  await expireRanks();
  const ranks = await q<RankRow & { holders: number }>(
    `SELECT r.*,
       (SELECT count(*)::int FROM user_ranks ur
         WHERE ur.rank_key = r.key AND ur.is_active
           AND (ur.expires_at IS NULL OR ur.expires_at > now())) AS holders
     FROM ranks r ORDER BY r.sort_order ASC, r.created_at ASC`
  );
  const boxes = await q<RankBoxRow>('SELECT * FROM rank_boxes ORDER BY created_at ASC');
  const claimsToday = await one<{ count: string; coins: string }>(
    `SELECT count(*)::text AS count, COALESCE(SUM(coins), 0)::text AS coins
     FROM rank_box_claims WHERE claim_date = $1::date`,
    [iraqDateStr()]
  );
  const auditRows = await q(
    `SELECT a.id, a.actor_kind, a.actor_name, a.action, a.rank_key, a.details, a.created_at,
            u.display_name AS target_name, u.username AS target_username
     FROM rank_audit a LEFT JOIN users u ON u.id = a.target_user_id
     ORDER BY a.created_at DESC LIMIT 60`
  );
  const claimRows = await q(
    `SELECT c.id, c.rank_key, c.claim_date::text AS claim_date, c.coins, c.created_at,
            u.display_name, u.username
     FROM rank_box_claims c JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC LIMIT 60`
  );
  return {
    ranks: ranks.map(serializeRank),
    boxes: boxes.map(serializeBox),
    claimsToday: Number(claimsToday?.count ?? 0),
    coinsToday: Number(claimsToday?.coins ?? 0),
    audit: auditRows.map((row) => ({
      id: row.id,
      actorKind: row.actor_kind,
      actorName: row.actor_name,
      action: row.action,
      rankKey: row.rank_key,
      details: row.details,
      createdAt: row.created_at,
      targetName: row.target_name,
      targetUsername: row.target_username,
    })),
    claims: claimRows.map((row) => ({
      id: row.id,
      rankKey: row.rank_key,
      date: row.claim_date,
      coins: Number(row.coins),
      createdAt: row.created_at,
      displayName: row.display_name,
      username: row.username,
    })),
  };
}
