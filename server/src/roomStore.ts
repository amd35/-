import { one, q, tx } from './db';
import { roomAccess } from './rooms';
import { roomCapacity } from './roomMembers';
import { HttpError } from './utils';
import { moveCoins } from './wallet';

/**
 * The room store: upgrades the room owner buys with diamonds.
 *
 * The administration defines the tiers (name, artwork, diamond price and the
 * member limit each one unlocks) from the admin panel; every room sees them in
 * its own store and keeps the ones it owns forever.
 */

export interface RoomUpgradeTierRow {
  id: string;
  name: string;
  name_en: string;
  description: string;
  image_url: string | null;
  price_diamonds: number;
  member_capacity: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface RoomUpgradeTier {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  imageUrl: string | null;
  priceDiamonds: number;
  memberCapacity: number;
  sortOrder: number;
  isActive: boolean;
  owned: boolean;
  ownedAt: string | null;
}

export function serializeTier(row: RoomUpgradeTierRow, ownedAt: string | null = null): RoomUpgradeTier {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en || '',
    description: row.description || '',
    imageUrl: row.image_url,
    priceDiamonds: Number(row.price_diamonds),
    memberCapacity: Number(row.member_capacity),
    sortOrder: Number(row.sort_order),
    isActive: row.is_active,
    owned: Boolean(ownedAt),
    ownedAt,
  };
}

/** Every tier the admin has published (the admin panel also lists the hidden ones). */
export async function listUpgradeTiers(includeInactive = false): Promise<RoomUpgradeTierRow[]> {
  return q<RoomUpgradeTierRow>(
    `SELECT * FROM room_upgrade_tiers
      ${includeInactive ? '' : 'WHERE is_active = true'}
      ORDER BY sort_order ASC, member_capacity ASC, created_at ASC`
  );
}

export async function roomStoreSnapshot(roomId: string, meId: string) {
  const room = await one<{ owner_id: string | null; is_active: boolean }>(
    'SELECT owner_id, is_active FROM rooms WHERE id = $1',
    [roomId]
  );
  if (!room?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

  const [tiers, owned, capacity, access, wallet] = await Promise.all([
    listUpgradeTiers(),
    q<{ tier_id: string; created_at: string }>(
      'SELECT tier_id, created_at FROM room_upgrades WHERE room_id = $1',
      [roomId]
    ),
    roomCapacity(roomId),
    roomAccess(roomId, meId, room.owner_id),
    one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [meId]),
  ]);
  const ownedAt = new Map(owned.map((row) => [row.tier_id, row.created_at]));
  return {
    tiers: tiers.map((tier) => serializeTier(tier, ownedAt.get(tier.id) ?? null)),
    capacity,
    balance: Number(wallet?.balance ?? 0),
    isOwner: Boolean(room.owner_id && room.owner_id === meId),
    canManage: access.canManage,
  };
}

/** Buys one tier for the room. Only the room owner may spend their diamonds. */
export async function purchaseRoomUpgrade(roomId: string, tierId: string, meId: string) {
  const tier = await tx(async (client) => {
    const room = await client.query<{ owner_id: string | null; is_active: boolean }>(
      'SELECT owner_id, is_active FROM rooms WHERE id = $1 FOR UPDATE',
      [roomId]
    );
    const row = room.rows[0];
    if (!row?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');
    if (row.owner_id !== meId) {
      throw new HttpError(403, 'Only the room owner can buy upgrades', 'not_owner');
    }

    const found = await client.query<RoomUpgradeTierRow>(
      'SELECT * FROM room_upgrade_tiers WHERE id = $1 AND is_active = true',
      [tierId]
    );
    const tierRow = found.rows[0];
    if (!tierRow) throw new HttpError(404, 'Upgrade not found', 'upgrade_not_found');

    const already = await client.query(
      'SELECT 1 FROM room_upgrades WHERE room_id = $1 AND tier_id = $2',
      [roomId, tierId]
    );
    if (already.rowCount) throw new HttpError(409, 'This upgrade is already owned', 'already_owned');

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO room_upgrades (room_id, tier_id, purchased_by, price_paid)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [roomId, tierId, meId, tierRow.price_diamonds]
    );

    if (Number(tierRow.price_diamonds) > 0) {
      // The upgrade row is the ledger reference: a retried purchase can never charge twice.
      const moved = await moveCoins(client, {
        userId: meId,
        amount: -Number(tierRow.price_diamonds),
        type: 'room_upgrade',
        refType: 'room_upgrade',
        refId: inserted.rows[0].id,
        meta: { roomId, tierId, tierName: tierRow.name },
      });
      if (!moved.applied) throw new HttpError(409, 'This purchase was already applied', 'duplicate_purchase');
    }
    return tierRow;
  });
  return tier;
}
