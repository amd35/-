import { one, q, tx } from './db';
import { addToBag, bagQuantity } from './giftBag';
import { emitToUser } from './realtime';
import { HttpError, iraqDateStr, isUuid } from './utils';
import { moveCoins } from './wallet';

/**
 * «إعلانات الغرفة»: the horizontal banner ads shown on the left of the room
 * stage. The administration adds one ad per gift; a member taps a banner, pays
 * its diamond price and the gift lands in their gift bag («جنطة الهدايا»).
 *
 * The rail rotates one ad per Baghdad day, so a different gift is featured each
 * day and no gift comes back until every active ad has had its turn.
 */

export interface RoomAdRow {
  id: string;
  title: string;
  gift_id: string;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  gift_name: string;
  gift_name_en: string;
  gift_design: string | null;
  gift_cover: string | null;
  gift_video: string | null;
  gift_rarity: string;
  gift_price: number;
  gift_active: boolean;
}

const AD_FIELDS = `
  a.*, g.name AS gift_name, g.name_en AS gift_name_en, g.design AS gift_design,
  g.cover_url AS gift_cover, g.video_url AS gift_video, g.rarity AS gift_rarity,
  g.price AS gift_price, g.is_active AS gift_active`;

export function serializeRoomAd(row: RoomAdRow) {
  return {
    id: row.id,
    title: row.title || row.gift_name,
    price: Number(row.price),
    isActive: row.is_active,
    sortOrder: row.sort_order,
    gift: {
      id: row.gift_id,
      name: row.gift_name,
      nameEn: row.gift_name_en,
      design: row.gift_design,
      coverUrl: row.gift_cover,
      videoUrl: row.gift_video,
      rarity: row.gift_rarity,
      price: Number(row.gift_price),
    },
  };
}

/** Days since 2024-01-01 on the Baghdad calendar: one step per day at midnight. */
function dayIndex(now = new Date()): number {
  const [year, month, day] = iraqDateStr(now).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Live ads in rotation order: today's featured ad first, then the rest. The
 * same gift is only listed once, so the store never shows it twice.
 */
export async function listRoomAds() {
  const rows = await q<RoomAdRow>(
    `SELECT ${AD_FIELDS}
     FROM room_ads a JOIN gifts g ON g.id = a.gift_id
     WHERE a.is_active = true AND g.is_active = true
     ORDER BY a.sort_order ASC, a.created_at ASC`
  );
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (seen.has(row.gift_id)) return false;
    seen.add(row.gift_id);
    return true;
  });
  const offset = unique.length ? dayIndex() % unique.length : 0;
  return unique
    .map((_, index) => unique[(index + offset) % unique.length])
    .map((row, index) => ({ ...serializeRoomAd(row), featured: index === 0 }));
}

/** Buys one ad's gift into the caller's bag. The price is the ad's own price. */
export async function buyRoomAd(userId: string, adId: string, rawRequestId: unknown) {
  if (!isUuid(adId)) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  const requestId = String(rawRequestId ?? '').trim().slice(0, 80);
  if (requestId.length < 8) throw new HttpError(400, 'Missing request id', 'invalid_request');

  const outcome = await tx(async (c) => {
    const adResult = await c.query<RoomAdRow>(
      `SELECT ${AD_FIELDS}
       FROM room_ads a JOIN gifts g ON g.id = a.gift_id
       WHERE a.id = $1 AND a.is_active = true AND g.is_active = true`,
      [adId]
    );
    const ad = adResult.rows[0];
    if (!ad) throw new HttpError(404, 'Ad not found', 'ad_not_found');
    const price = Number(ad.price);

    // The unique request_id is the idempotency guard, so a double tap is safe.
    const created = await c.query(
      `INSERT INTO room_ad_purchases (request_id, ad_id, user_id, gift_id, price)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING *`,
      [requestId, adId, userId, ad.gift_id, price]
    );
    if (!created.rowCount) {
      const existing = await c.query(
        'SELECT * FROM room_ad_purchases WHERE request_id = $1 AND user_id = $2',
        [requestId, userId]
      );
      if (!existing.rowCount) {
        throw new HttpError(409, 'This request was already used', 'duplicate_request');
      }
      return { purchase: existing.rows[0], duplicate: true, giftName: ad.gift_name };
    }
    const purchase = created.rows[0];

    if (price > 0) {
      const charge = await moveCoins(c, {
        userId,
        amount: -price,
        type: 'room_ad_gift',
        refType: 'room_ad',
        refId: purchase.id,
        meta: { adId, giftId: ad.gift_id, giftName: ad.gift_name },
      });
      if (!charge.applied) {
        throw new HttpError(409, 'This purchase was already processed', 'duplicate_request');
      }
    }

    await addToBag(c, userId, ad.gift_id, 1);
    return { purchase, duplicate: false, giftName: ad.gift_name };
  });

  const [wallet, quantity] = await Promise.all([
    one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [userId]),
    bagQuantity(userId, outcome.purchase.gift_id as string),
  ]);
  if (!outcome.duplicate) emitToUser(userId, 'wallet:update', {});

  return {
    duplicate: outcome.duplicate,
    giftName: outcome.giftName,
    balance: Number(wallet?.balance || 0),
    bagQuantity: quantity,
  };
}

/** «هدية عشوائية»: the mystery box sold inside the daily store. */
export const RANDOM_GIFT_PRICE = 500;

/**
 * Opens the random-gift box: charges the box price once and drops a random
 * active gift (at most four times the box price, so the box stays a bargain and
 * never pays out a jackpot) into the caller's bag.
 */
export async function buyRandomGift(userId: string, rawRequestId: unknown) {
  const requestId = String(rawRequestId ?? '').trim().slice(0, 80);
  if (requestId.length < 8) throw new HttpError(400, 'Missing request id', 'invalid_request');
  const price = RANDOM_GIFT_PRICE;

  const outcome = await tx(async (c) => {
    const pool = await c.query<{ id: string; name: string }>(
      'SELECT id, name FROM gifts WHERE is_active = true AND price <= $1 ORDER BY random() LIMIT 1',
      [price * 4]
    );
    const gift =
      pool.rows[0] ??
      (
        await c.query<{ id: string; name: string }>(
          'SELECT id, name FROM gifts WHERE is_active = true ORDER BY random() LIMIT 1'
        )
      ).rows[0];
    if (!gift) throw new HttpError(409, 'No gifts available', 'no_gifts');

    // ad_id stays NULL: this purchase belongs to the box, not to a banner ad.
    const created = await c.query(
      `INSERT INTO room_ad_purchases (request_id, ad_id, user_id, gift_id, price)
       VALUES ($1, NULL, $2, $3, $4)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING *`,
      [requestId, userId, gift.id, price]
    );
    if (!created.rowCount) {
      const existing = await c.query(
        'SELECT * FROM room_ad_purchases WHERE request_id = $1 AND user_id = $2',
        [requestId, userId]
      );
      if (!existing.rowCount) {
        throw new HttpError(409, 'This request was already used', 'duplicate_request');
      }
      const name = await c.query<{ name: string }>('SELECT name FROM gifts WHERE id = $1', [
        existing.rows[0].gift_id,
      ]);
      return { purchase: existing.rows[0], duplicate: true, giftName: name.rows[0]?.name ?? '' };
    }
    const purchase = created.rows[0];

    const charge = await moveCoins(c, {
      userId,
      amount: -price,
      type: 'room_ad_gift',
      refType: 'random_gift',
      refId: purchase.id,
      meta: { giftId: gift.id, giftName: gift.name },
    });
    if (!charge.applied) {
      throw new HttpError(409, 'This purchase was already processed', 'duplicate_request');
    }

    await addToBag(c, userId, gift.id, 1);
    return { purchase, duplicate: false, giftName: gift.name };
  });

  const [wallet, quantity] = await Promise.all([
    one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [userId]),
    bagQuantity(userId, outcome.purchase.gift_id as string),
  ]);
  if (!outcome.duplicate) emitToUser(userId, 'wallet:update', {});

  return {
    duplicate: outcome.duplicate,
    giftName: outcome.giftName,
    balance: Number(wallet?.balance || 0),
    bagQuantity: quantity,
  };
}

/* ------------------------------------------------------------------ admin */

export async function adminRoomAdsOverview() {
  const [ads, gifts] = await Promise.all([
    q<RoomAdRow>(
      `SELECT ${AD_FIELDS}
       FROM room_ads a JOIN gifts g ON g.id = a.gift_id
       ORDER BY a.sort_order ASC, a.created_at ASC`
    ),
    q<{ id: string; name: string; price: number; rarity: string; is_active: boolean }>(
      'SELECT id, name, price, rarity, is_active FROM gifts ORDER BY sort_order, price'
    ),
  ]);
  return {
    ads: ads.map((row) => ({ ...serializeRoomAd(row), giftActive: row.gift_active })),
    gifts: gifts.map((gift) => ({
      id: gift.id,
      name: gift.name,
      price: Number(gift.price),
      rarity: gift.rarity,
      isActive: gift.is_active,
    })),
  };
}

async function readGift(giftId: unknown) {
  if (!isUuid(giftId)) throw new HttpError(400, 'Choose a gift', 'invalid_gift');
  const gift = await one<{ id: string; name: string; price: number }>(
    'SELECT id, name, price FROM gifts WHERE id = $1',
    [giftId]
  );
  if (!gift) throw new HttpError(404, 'Gift not found', 'gift_not_found');
  return gift;
}

export async function createRoomAd(body: Record<string, unknown>) {
  const gift = await readGift(body.giftId);
  const title = String(body.title ?? '').trim().slice(0, 120);
  const price = Number(body.price ?? gift.price);
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Invalid price', 'invalid_price');
  const sortOrder = Number(body.sortOrder ?? 0);
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

  const row = await one<RoomAdRow>(
    `WITH created AS (
       INSERT INTO room_ads (title, gift_id, price, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *
     )
     SELECT ${AD_FIELDS} FROM created a JOIN gifts g ON g.id = a.gift_id`,
    [title, gift.id, Math.round(price), isActive, Number.isFinite(sortOrder) ? Math.round(sortOrder) : 0]
  );
  return row as RoomAdRow;
}

export async function updateRoomAd(id: string, body: Record<string, unknown>) {
  if (!isUuid(id)) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  const current = await one<RoomAdRow>(
    `SELECT ${AD_FIELDS} FROM room_ads a JOIN gifts g ON g.id = a.gift_id WHERE a.id = $1`,
    [id]
  );
  if (!current) throw new HttpError(404, 'Ad not found', 'ad_not_found');

  const gift = body.giftId === undefined ? null : await readGift(body.giftId);
  const title = body.title === undefined ? current.title : String(body.title).trim().slice(0, 120);
  const price = body.price === undefined ? Number(current.price) : Number(body.price);
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Invalid price', 'invalid_price');
  const sortOrder = body.sortOrder === undefined ? Number(current.sort_order) : Number(body.sortOrder);
  const isActive = body.isActive === undefined ? current.is_active : Boolean(body.isActive);

  const row = await one<RoomAdRow>(
    `WITH updated AS (
       UPDATE room_ads
       SET title = $2, gift_id = $3, price = $4, is_active = $5, sort_order = $6, updated_at = now()
       WHERE id = $1
       RETURNING *
     )
     SELECT ${AD_FIELDS} FROM updated a JOIN gifts g ON g.id = a.gift_id`,
    [
      id,
      title,
      gift?.id ?? current.gift_id,
      Math.round(price),
      isActive,
      Number.isFinite(sortOrder) ? Math.round(sortOrder) : Number(current.sort_order),
    ]
  );
  return row as RoomAdRow;
}

export async function deleteRoomAd(id: string) {
  if (!isUuid(id)) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  const rows = await q('DELETE FROM room_ads WHERE id = $1 RETURNING id', [id]);
  if (!rows.length) throw new HttpError(404, 'Ad not found', 'ad_not_found');
}
