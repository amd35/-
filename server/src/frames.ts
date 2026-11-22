import { one, q } from './db';
import type { FrameInfo } from './serializers';

export const FRAME_RARITIES = ['common', 'rare', 'epic', 'legendary', 'vip'] as const;
export type FrameRarity = (typeof FRAME_RARITIES)[number];

export interface FrameRow {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  kind: string;
  design: string | null;
  image_url: string | null;
  price: number;
  rarity: string;
  duration_days: number;
  is_rare: boolean;
  is_active: boolean;
  sort_order: number;
  category: string;
  /** 0 = anyone, 1..5 = an active VIP of that tier is required. */
  min_vip: number;
}

export interface FrameCatalogItem {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  kind: string;
  design: string | null;
  imageUrl: string | null;
  price: number;
  rarity: string;
  durationDays: number;
  isRare: boolean;
  isActive: boolean;
  sortOrder: number;
  category: string;
  minVip: number;
  owned: boolean;
  expiresAt: string | null;
  equipped: boolean;
}

export function serializeFrame(row: FrameRow): Omit<FrameCatalogItem, 'owned' | 'expiresAt' | 'equipped'> {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.name_en,
    kind: row.kind,
    design: row.design,
    imageUrl: row.image_url,
    price: Number(row.price),
    rarity: row.rarity,
    durationDays: Number(row.duration_days),
    isRare: Boolean(row.is_rare),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
    category: row.category,
    minVip: Number(row.min_vip ?? 0),
  };
}

export function frameInfo(row: FrameRow): FrameInfo {
  return {
    id: row.id,
    design: row.design,
    kind: row.kind,
    imageUrl: row.image_url,
    rarity: row.rarity,
  };
}

/** True when the user owns the frame right now (permanent or not yet expired). */
export async function ownsFrame(userId: string, frameId: string): Promise<boolean> {
  const row = await one(
    `SELECT 1 FROM user_avatar_frames
     WHERE user_id = $1 AND frame_id = $2 AND (expires_at IS NULL OR expires_at > now())`,
    [userId, frameId]
  );
  return Boolean(row);
}

const CATALOG_SELECT = `
  SELECT f.id, f.slug, f.name, f.name_en, f.kind, f.design, f.image_url, f.price, f.rarity,
         f.duration_days, f.is_rare, f.is_active, f.sort_order, f.category, f.min_vip,
         (uaf.user_id IS NOT NULL) AS owned,
         uaf.expires_at AS owned_expires_at,
         CASE WHEN f.category = 'frame'
           THEN (u.avatar_frame_id = f.id AND uaf.user_id IS NOT NULL)
           ELSE EXISTS (SELECT 1 FROM user_cosmetics uc
                        WHERE uc.user_id = $1 AND uc.category = f.category AND uc.item_id = f.id)
         END AS equipped
  FROM avatar_frames f
  JOIN users u ON u.id = $1
  LEFT JOIN user_avatar_frames uaf ON uaf.user_id = $1 AND uaf.frame_id = f.id
    AND (uaf.expires_at IS NULL OR uaf.expires_at > now())`;

/** The frame a user wears right now, or null when none is equipped / it expired. */
export async function equippedFrameInfo(userId: string): Promise<FrameInfo | null> {
  const row = await one<FrameRow>(
    `SELECT f.id, f.design, f.kind, f.image_url, f.rarity
     FROM users u
     JOIN avatar_frames f ON f.id = u.avatar_frame_id AND f.is_active = true
     JOIN user_avatar_frames uaf ON uaf.user_id = u.id AND uaf.frame_id = f.id
       AND (uaf.expires_at IS NULL OR uaf.expires_at > now())
     WHERE u.id = $1`,
    [userId]
  );
  return row ? frameInfo(row) : null;
}

/** Active catalog with the caller's ownership state, ordered for the store. */
export async function listFrames(userId: string): Promise<FrameCatalogItem[]> {
  const rows = await q<FrameRow & { owned: boolean; owned_expires_at: string | null; equipped: boolean }>(
    `${CATALOG_SELECT} WHERE f.is_active = true ORDER BY f.sort_order, f.price, f.created_at`,
    [userId]
  );
  return rows.map((row) => ({
    ...serializeFrame(row),
    owned: row.owned,
    expiresAt: row.owned_expires_at ? new Date(row.owned_expires_at).toISOString() : null,
    equipped: row.equipped,
  }));
}

/** The non-frame cosmetic the user wears in each category, keyed by category. */
export async function equippedCosmetics(userId: string): Promise<Record<string, FrameInfo>> {
  const rows = await q<FrameRow>(
    `SELECT f.id, f.category, f.design, f.kind, f.image_url, f.rarity
     FROM user_cosmetics uc
     JOIN avatar_frames f ON f.id = uc.item_id AND f.is_active = true
     JOIN user_avatar_frames uaf ON uaf.user_id = uc.user_id AND uaf.frame_id = uc.item_id
       AND (uaf.expires_at IS NULL OR uaf.expires_at > now())
     WHERE uc.user_id = $1`,
    [userId]
  );
  const map: Record<string, FrameInfo> = {};
  for (const row of rows) map[row.category] = frameInfo(row);
  return map;
}

/** One catalog entry with the caller's ownership state (used after buy/equip). */
export async function getFrameForUser(userId: string, frameId: string): Promise<FrameCatalogItem | null> {
  const row = await one<FrameRow & { owned: boolean; owned_expires_at: string | null; equipped: boolean }>(
    `${CATALOG_SELECT} WHERE f.id = $2`,
    [userId, frameId]
  );
  if (!row) return null;
  return {
    ...serializeFrame(row),
    owned: row.owned,
    expiresAt: row.owned_expires_at ? new Date(row.owned_expires_at).toISOString() : null,
    equipped: row.equipped,
  };
}
