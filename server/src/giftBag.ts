import type { PoolClient } from 'pg';
import { q } from './db';
import { serializeGift, type GiftRow } from './gifts';
import { HttpError } from './utils';

/** One owned gift in the user's bag («جنطة الهدايا»). */
export interface BagItem extends ReturnType<typeof serializeGift> {
  quantity: number;
}

/** Adds copies of a gift to a user's bag inside the caller's transaction. */
export async function addToBag(
  c: PoolClient,
  userId: string,
  giftId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;
  await c.query(
    `INSERT INTO gift_bag (user_id, gift_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, gift_id)
     DO UPDATE SET quantity = gift_bag.quantity + EXCLUDED.quantity, updated_at = now()`,
    [userId, giftId, quantity]
  );
}

/**
 * Consumes copies from the bag. The `quantity >= $3` guard makes the decrement
 * atomic, so two concurrent sends can never take the same gift twice.
 */
export async function takeFromBag(
  c: PoolClient,
  userId: string,
  giftId: string,
  quantity: number
): Promise<number> {
  if (quantity <= 0) return 0;
  const result = await c.query<{ quantity: number }>(
    `UPDATE gift_bag SET quantity = quantity - $3, updated_at = now()
     WHERE user_id = $1 AND gift_id = $2 AND quantity >= $3
     RETURNING quantity`,
    [userId, giftId, quantity]
  );
  if (!result.rowCount) {
    throw new HttpError(400, 'This gift is not in your bag', 'bag_empty');
  }
  const left = Number(result.rows[0].quantity);
  if (left <= 0) {
    await c.query('DELETE FROM gift_bag WHERE user_id = $1 AND gift_id = $2', [userId, giftId]);
  }
  return left;
}

export async function listBag(userId: string): Promise<BagItem[]> {
  const rows = await q<GiftRow & { quantity: number }>(
    `SELECT g.*, b.quantity
     FROM gift_bag b
     JOIN gifts g ON g.id = b.gift_id
     WHERE b.user_id = $1 AND b.quantity > 0
     ORDER BY g.sort_order, g.price`,
    [userId]
  );
  return rows.map((row) => ({ ...serializeGift(row), quantity: Number(row.quantity) }));
}

export async function bagQuantity(userId: string, giftId: string): Promise<number> {
  const rows = await q<{ quantity: number }>(
    'SELECT quantity FROM gift_bag WHERE user_id = $1 AND gift_id = $2',
    [userId, giftId]
  );
  return Number(rows[0]?.quantity || 0);
}

export interface GiftPackageItem {
  giftId: string;
  name: string;
  nameEn: string;
  design: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  rarity: string;
  price: number;
  quantity: number;
}

export interface GiftPackageInfo {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  coverUrl: string | null;
  price: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  items: GiftPackageItem[];
}

interface PackageRow {
  id: string;
  name: string;
  name_en: string;
  description: string;
  cover_url: string | null;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

function serializePackage(row: PackageRow, items: GiftPackageItem[]): GiftPackageInfo {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    description: row.description,
    coverUrl: row.cover_url,
    price: Number(row.price),
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    items,
  };
}

/** Packages with their gift lines, grouped in one pass. */
export async function listGiftPackages(includeInactive = false): Promise<GiftPackageInfo[]> {
  const packages = await q<PackageRow>(
    `SELECT * FROM gift_packages
     ${includeInactive ? '' : 'WHERE is_active = true'}
     ORDER BY sort_order, price`
  );
  if (packages.length === 0) return [];
  const items = await q<{
    package_id: string;
    gift_id: string;
    quantity: number;
    name: string;
    name_en: string;
    design: string | null;
    cover_url: string | null;
    video_url: string | null;
    rarity: string;
    price: number;
  }>(
    `SELECT i.package_id, i.quantity, g.id AS gift_id, g.name, g.name_en, g.design,
            g.cover_url, g.video_url, g.rarity, g.price
     FROM gift_package_items i
     JOIN gifts g ON g.id = i.gift_id
     WHERE i.package_id = ANY($1::uuid[])
     ORDER BY g.sort_order, g.price`,
    [packages.map((row) => row.id)]
  );
  const byPackage = new Map<string, GiftPackageItem[]>();
  for (const item of items) {
    const list = byPackage.get(item.package_id) ?? [];
    list.push({
      giftId: item.gift_id,
      name: item.name,
      nameEn: item.name_en,
      design: item.design,
      coverUrl: item.cover_url,
      videoUrl: item.video_url,
      rarity: item.rarity,
      price: Number(item.price),
      quantity: Number(item.quantity),
    });
    byPackage.set(item.package_id, list);
  }
  return packages.map((row) => serializePackage(row, byPackage.get(row.id) ?? []));
}
