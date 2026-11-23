import type { PoolClient } from 'pg';
import { one, q } from './db';
import { HttpError } from './utils';

export interface GiftRow {
  id: string;
  slug: string;
  name: string;
  name_en: string;
  description: string;
  design: string | null;
  video_url: string | null;
  cover_url: string | null;
  price: number;
  recipient_percent: number | null;
  host_percent: number | null;
  rarity: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export const GIFT_RARITIES = ['common', 'rare', 'epic', 'legendary', 'vip'] as const;

export function serializeGift(row: GiftRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.name_en,
    description: row.description,
    design: row.design,
    videoUrl: row.video_url,
    coverUrl: row.cover_url,
    price: Number(row.price),
    recipientPercent: row.recipient_percent === null ? null : Number(row.recipient_percent),
    hostPercent: row.host_percent === null ? null : Number(row.host_percent),
    rarity: row.rarity,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listActiveGifts(): Promise<GiftRow[]> {
  return q<GiftRow>('SELECT * FROM gifts WHERE is_active = true ORDER BY sort_order, price');
}

/** SQL joins a message row (`m`) to its gift, when it is a gift message. */
export const GIFT_MESSAGE_JOINS = `
  LEFT JOIN gift_sends gs ON gs.id = m.gift_send_id
  LEFT JOIN gifts g ON g.id = gs.gift_id`;

/** Selected alongside `GIFT_MESSAGE_JOINS`. */
export const GIFT_MESSAGE_FIELDS = `
  gs.id AS gift_send_id, gs.coins AS gift_coins, gs.recipient_coins AS gift_recipient_coins,
  gs.recipient_percent AS gift_recipient_percent, gs.gift_name AS gift_send_name,
  gs.currency AS gift_currency,
  g.slug AS gift_slug, g.name AS gift_name, g.name_en AS gift_name_en,
  g.design AS gift_design, g.video_url AS gift_video_url, g.cover_url AS gift_cover_url,
  g.rarity AS gift_rarity`;

export interface GiftMessageInfo {
  id: string;
  name: string;
  nameEn: string;
  slug: string | null;
  design: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  rarity: string;
  price: number;
  recipientCoins: number;
  /** Currency the sender paid in: `diamond` or `gold`. */
  currency: string;
}

export function giftFromMessageRow(row: Record<string, unknown>): GiftMessageInfo | null {
  if (!row.gift_send_id) return null;
  return {
    id: String(row.gift_send_id),
    name: String(row.gift_send_name || row.gift_name || 'Gift'),
    nameEn: String(row.gift_name_en || row.gift_send_name || 'Gift'),
    slug: (row.gift_slug as string | null) ?? null,
    design: (row.gift_design as string | null) ?? null,
    videoUrl: (row.gift_video_url as string | null) ?? null,
    coverUrl: (row.gift_cover_url as string | null) ?? null,
    rarity: String(row.gift_rarity || 'common'),
    price: Number(row.gift_coins || 0),
    recipientCoins: Number(row.gift_recipient_coins || 0),
    currency: String(row.gift_currency || 'diamond'),
  };
}

export interface ProfitWalletRow {
  user_id: string;
  total_earned: number;
  available: number;
  pending: number;
  withdrawn: number;
}

export async function ensureProfitWallet(c: PoolClient, userId: string): Promise<void> {
  await c.query(
    'INSERT INTO profit_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

/** Row-locks the earnings wallet so a gift credit and a withdrawal cannot race. */
export async function lockProfitWallet(
  c: PoolClient,
  userId: string
): Promise<ProfitWalletRow> {
  await ensureProfitWallet(c, userId);
  const { rows } = await c.query<ProfitWalletRow>(
    `SELECT user_id, total_earned, available, pending, withdrawn
     FROM profit_wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  return rows[0];
}

export async function getProfitWallet(userId: string): Promise<ProfitWalletRow> {
  const row = await one<ProfitWalletRow>(
    'SELECT user_id, total_earned, available, pending, withdrawn FROM profit_wallets WHERE user_id = $1',
    [userId]
  );
  return row ?? { user_id: userId, total_earned: 0, available: 0, pending: 0, withdrawn: 0 };
}

interface ProfitEntry {
  userId: string;
  type: string;
  /** Signed amount applied to `available`. */
  amount: number;
  refType?: string | null;
  refId?: string | null;
  meta?: Record<string, unknown>;
  /** Adds to lifetime earnings (gift credits only). */
  earned?: number;
  /** Moves coins into `pending` when a withdrawal is requested (negative releases it). */
  hold?: number;
  /** Adds to `withdrawn` when a payout is confirmed; release pending with `hold`. */
  settle?: number;
}

/**
 * Applies one movement to the earnings wallet and writes its ledger row in the same
 * transaction. The unique (user, type, ref) index makes a retried request a no-op,
 * so a gift can never credit the recipient twice.
 */
export async function moveProfit(
  c: PoolClient,
  entry: ProfitEntry
): Promise<{ available: number; applied: boolean }> {
  const wallet = await lockProfitWallet(c, entry.userId);
  const available = wallet.available + entry.amount;
  const pending = wallet.pending + (entry.hold ?? 0);
  if (available < 0 || pending < 0) {
    throw new HttpError(402, 'Insufficient earnings', 'insufficient_earnings', {
      available: wallet.available,
    });
  }

  const insert = await c.query(
    `INSERT INTO profit_transactions
       (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (user_id, type, ref_id) DO NOTHING
     RETURNING id`,
    [
      entry.userId,
      entry.type,
      entry.amount,
      wallet.available,
      available,
      entry.refType ?? null,
      entry.refId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ]
  );
  if (!insert.rowCount) return { available: wallet.available, applied: false };

  await c.query(
    `UPDATE profit_wallets SET
       available = $2,
       pending = $3,
       total_earned = total_earned + $4,
       withdrawn = withdrawn + $5,
       updated_at = now()
     WHERE user_id = $1`,
    [
      entry.userId,
      available,
      pending,
      Math.max(0, Math.trunc(entry.earned ?? 0)),
      Math.max(0, Math.trunc(entry.settle ?? 0)),
    ]
  );
  return { available, applied: true };
}
