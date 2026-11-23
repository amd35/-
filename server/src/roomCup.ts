import type { PoolClient } from 'pg';
import { one, q, tx } from './db';
import { moveProfit } from './gifts';
import { notifyWith } from './notify';
import { emitToUser } from './realtime';
import { getSettings, type AppSettings } from './settings';
import { HttpError } from './utils';
import { moveCoins } from './wallet';

/**
 * Room cup: gold spent inside a voice room is split between the room owner and
 * the general administration, and the same gold drives a per-room competition.
 *
 * Every split is written once per `gift_send` (unique column), the owner payout
 * goes through the idempotent earnings ledger, and competition prizes go through
 * the idempotent coin ledger, so retries, double taps and replayed requests can
 * never pay twice. A reversed entry stays in the ledger for auditing but is
 * excluded from the ranking and refunded from the owner's earnings.
 */

export const CUP_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type CupPeriod = (typeof CUP_PERIODS)[number];

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, Math.trunc(Number(value) || 0)));
}

export function cupPeriod(settings: AppSettings): CupPeriod {
  const period = settings.cup_period;
  return CUP_PERIODS.includes(period as CupPeriod) ? (period as CupPeriod) : 'weekly';
}

/** Start/end of the current competition window, computed on Baghdad time (UTC+3). */
export function cupPeriodBounds(period: CupPeriod, now = new Date()): { startsAt: Date; endsAt: Date } {
  const shifted = new Date(now.getTime() + BAGHDAD_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const baghdad = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - BAGHDAD_OFFSET_MS);

  if (period === 'daily') return { startsAt: baghdad(year, month, day), endsAt: baghdad(year, month, day + 1) };
  if (period === 'monthly') return { startsAt: baghdad(year, month, 1), endsAt: baghdad(year, month + 1, 1) };
  // Weekly windows start on Monday at 00:00 Baghdad time.
  const back = (shifted.getUTCDay() + 6) % 7;
  return { startsAt: baghdad(year, month, day - back), endsAt: baghdad(year, month, day - back + 7) };
}

export interface CupCompetitionRow {
  id: string;
  room_id: string;
  period: CupPeriod;
  starts_at: Date;
  ends_at: Date;
  status: 'open' | 'closed';
  closed_at: Date | null;
  created_at: Date;
}

export interface CupStanding {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  gifts: number;
}

export interface CupWinner {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  prize: number;
}

interface CupLedgerRow {
  id: string;
  gift_send_id: string;
  room_id: string;
  owner_id: string | null;
  sender_id: string;
  recipient_id: string;
  coins: number;
  owner_coins: number;
  admin_coins: number;
  owner_percent: number;
  admin_percent: number;
  status: 'settled' | 'reversed';
  reversed_at: Date | null;
  created_at: Date;
}

export interface CupGiftInput {
  giftSendId: string;
  roomId: string;
  senderId: string;
  recipientId: string;
  coins: number;
  /** The host share already paid by the gift split (owner of the room). */
  hostId?: string | null;
  hostCoins?: number;
  hostPercent?: number;
}

/**
 * Records one room gift for the competition and its owner/admin split report.
 * Must run inside the gift transaction, after the sender was charged. The room
 * owner's share is paid by the gift split itself (recipient / host / admin), so
 * this function only writes the audit row — it never credits the owner twice.
 * Returns null when the cup is disabled or the send was already split.
 */
export async function recordCupGift(
  c: PoolClient,
  input: CupGiftInput,
  settings: AppSettings
): Promise<{ ledgerId: string; ownerId: string | null; ownerCoins: number; adminCoins: number } | null> {
  if (!settings.cup_enabled) return null;
  const coins = Math.max(0, Math.trunc(Number(input.coins) || 0));
  if (coins <= 0) return null;

  const room = await c.query<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE id = $1', [
    input.roomId,
  ]);
  const ownerId = input.hostId !== undefined ? input.hostId : room.rows[0]?.owner_id ?? null;
  const ownerPercent =
    input.hostPercent !== undefined
      ? clampPercent(input.hostPercent)
      : clampPercent(settings.gift_host_percent);
  // Without an owner the whole owner share goes to the administration.
  const ownerCoins =
    input.hostCoins !== undefined
      ? Math.max(0, Math.trunc(Number(input.hostCoins) || 0))
      : ownerId
        ? Math.floor((coins * ownerPercent) / 100)
        : 0;
  const adminCoins = Math.max(0, coins - ownerCoins);

  const inserted = await c.query<CupLedgerRow>(
    `INSERT INTO room_cup_ledger
       (gift_send_id, room_id, owner_id, sender_id, recipient_id, coins,
        owner_coins, admin_coins, owner_percent, admin_percent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (gift_send_id) DO NOTHING
     RETURNING *`,
    [
      input.giftSendId,
      input.roomId,
      ownerId,
      input.senderId,
      input.recipientId,
      coins,
      ownerCoins,
      adminCoins,
      ownerPercent,
      100 - ownerPercent,
    ]
  );
  if (!inserted.rowCount) return null;
  const ledger = inserted.rows[0];

  // The owner's share is credited by the gift split itself (`gift_host_earning`),
  // never here — the cup only records the split for its competition report.

  return { ledgerId: ledger.id, ownerId, ownerCoins, adminCoins };
}

/** Top spenders of a room inside [from, to), by gold spent (not diamonds). */
async function cupStandings(
  c: PoolClient,
  roomId: string,
  from: Date,
  to: Date,
  limit: number
): Promise<CupStanding[]> {
  const rows = await c.query<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    coins: string;
    gifts: number;
  }>(
    `SELECT l.sender_id AS user_id, u.display_name, u.avatar_url,
            SUM(l.coins)::bigint AS coins, COUNT(*)::int AS gifts
     FROM room_cup_ledger l
     JOIN users u ON u.id = l.sender_id
     WHERE l.room_id = $1 AND l.status = 'settled'
       AND l.created_at >= $2 AND l.created_at < $3
     GROUP BY l.sender_id, u.display_name, u.avatar_url
     ORDER BY SUM(l.coins) DESC, MIN(l.created_at) ASC
     LIMIT $4`,
    [roomId, from, to, limit]
  );
  return rows.rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    displayName: row.display_name || '',
    avatarUrl: row.avatar_url,
    coins: Number(row.coins || 0),
    gifts: Number(row.gifts || 0),
  }));
}

/**
 * Closes one competition: stores the top three, pays the configured prizes
 * (idempotently) and posts the result to the room. Must run inside a transaction.
 */
async function settleCompetition(
  c: PoolClient,
  competition: CupCompetitionRow,
  settings: AppSettings
): Promise<{ roomId: string; winners: CupWinner[] }> {
  const standings = await cupStandings(c, competition.room_id, competition.starts_at, competition.ends_at, 3);
  const prizes = [settings.cup_prize_1, settings.cup_prize_2, settings.cup_prize_3].map((value) =>
    Math.max(0, Math.trunc(Number(value) || 0))
  );
  const winners: CupWinner[] = [];

  for (const standing of standings) {
    if (standing.coins <= 0) continue;
    const prize = prizes[standing.rank - 1] ?? 0;
    const inserted = await c.query<{ id: string }>(
      `INSERT INTO room_cup_winners (competition_id, room_id, rank, user_id, coins, prize)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (competition_id, rank) DO NOTHING
       RETURNING id`,
      [competition.id, competition.room_id, standing.rank, standing.userId, standing.coins, prize]
    );
    if (!inserted.rowCount) continue;
    const winnerId = inserted.rows[0].id;

    if (prize > 0) {
      await moveCoins(c, {
        userId: standing.userId,
        amount: prize,
        type: 'cup_prize',
        refType: 'room_cup_winner',
        refId: winnerId,
        meta: { roomId: competition.room_id, competitionId: competition.id, rank: standing.rank },
      });
    }
    await c.query('UPDATE room_cup_winners SET awarded = true WHERE id = $1', [winnerId]);
    await notifyWith(
      c,
      standing.userId,
      'room_cup_win',
      `فوز بكأس الغرفة — المركز ${standing.rank}`,
      `حصلت على المركز ${standing.rank} في مسابقة كأس الغرفة بإنفاق ${standing.coins} ذهب.`,
      { roomId: competition.room_id, rank: standing.rank, prize, coins: standing.coins }
    );
    winners.push({ ...standing, prize });
  }

  await c.query(
    `UPDATE room_cup_competitions SET status = 'closed', closed_at = now() WHERE id = $1`,
    [competition.id]
  );

  if (winners.length) {
    const room = await c.query<{ owner_id: string | null; name: string }>(
      'SELECT owner_id, name FROM rooms WHERE id = $1',
      [competition.room_id]
    );
    const ownerId = room.rows[0]?.owner_id;
    if (ownerId) {
      const medals = ['🏆', '🥈', '🥉'];
      const body = `انتهت مسابقة كأس الغرفة! ${winners
        .map((winner) => `${medals[winner.rank - 1] ?? ''} ${winner.displayName} — ${winner.coins} ذهب`)
        .join(' • ')}`;
      await c.query(
        `INSERT INTO room_messages (room_id, user_id, body, type, is_announcement)
         VALUES ($1, $2, $3, 'system', true)`,
        [competition.room_id, ownerId, body]
      );
    }
  }

  return { roomId: competition.room_id, winners };
}

/**
 * Returns the room's open competition, closing the previous one first when its
 * window ended or the admin changed the competition period. Must run inside a
 * transaction (it locks the open row and may pay prizes).
 */
export async function ensureCompetition(
  c: PoolClient,
  roomId: string,
  settings: AppSettings,
  now = new Date()
): Promise<CupCompetitionRow | null> {
  const period = cupPeriod(settings);
  const open = await c.query<CupCompetitionRow>(
    `SELECT * FROM room_cup_competitions WHERE room_id = $1 AND status = 'open' FOR UPDATE`,
    [roomId]
  );
  let current: CupCompetitionRow | null = open.rows[0] ?? null;
  if (current && (new Date(current.ends_at).getTime() <= now.getTime() || current.period !== period)) {
    await settleCompetition(c, current, settings);
    current = null;
  }
  if (current) return current;

  const { startsAt, endsAt } = cupPeriodBounds(period, now);
  // A window the admin already closed stays closed until the next window starts.
  const closed = await c.query(
    'SELECT 1 FROM room_cup_competitions WHERE room_id = $1 AND starts_at = $2 LIMIT 1',
    [roomId, startsAt]
  );
  if (closed.rowCount) return null;

  await c.query(
    `INSERT INTO room_cup_competitions (room_id, period, starts_at, ends_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (room_id) WHERE status = 'open' DO NOTHING`,
    [roomId, period, startsAt, endsAt]
  );
  const created = await c.query<CupCompetitionRow>(
    `SELECT * FROM room_cup_competitions WHERE room_id = $1 AND status = 'open'`,
    [roomId]
  );
  return created.rows[0] ?? null;
}

function competitionPayload(row: CupCompetitionRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    period: row.period,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

export interface CupHistoryEntry {
  id: string;
  period: CupPeriod;
  startsAt: Date;
  endsAt: Date;
  winners: CupWinner[];
}

export async function cupHistory(roomId: string, limit = 5): Promise<CupHistoryEntry[]> {
  const competitions = await q<CupCompetitionRow>(
    `SELECT * FROM room_cup_competitions
     WHERE room_id = $1 AND status = 'closed'
     ORDER BY ends_at DESC
     LIMIT $2`,
    [roomId, limit]
  );
  if (!competitions.length) return [];
  const winners = await q<{
    competition_id: string;
    rank: number;
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    coins: string;
    prize: number;
  }>(
    `SELECT w.competition_id, w.rank, w.user_id, w.coins, w.prize,
            u.display_name, u.avatar_url
     FROM room_cup_winners w
     JOIN users u ON u.id = w.user_id
     WHERE w.competition_id = ANY($1::uuid[])
     ORDER BY w.rank ASC`,
    [competitions.map((row) => row.id)]
  );
  return competitions.map((competition) => ({
    id: competition.id,
    period: competition.period,
    startsAt: competition.starts_at,
    endsAt: competition.ends_at,
    winners: winners
      .filter((row) => row.competition_id === competition.id)
      .map((row) => ({
        rank: Number(row.rank),
        userId: row.user_id,
        displayName: row.display_name || '',
        avatarUrl: row.avatar_url,
        coins: Number(row.coins || 0),
        prize: Number(row.prize || 0),
      })),
  }));
}

/** Everything the in-room cup panel shows. */
export async function cupSnapshot(roomId: string, meId: string) {
  const settings = await getSettings();
  const room = await one<{
    id: string;
    name: string;
    owner_id: string | null;
    owner_name: string | null;
    owner_avatar: string | null;
  }>(
    `SELECT r.id, r.name, r.owner_id, u.display_name AS owner_name, u.avatar_url AS owner_avatar
     FROM rooms r LEFT JOIN users u ON u.id = r.owner_id
     WHERE r.id = $1 AND r.is_active = true`,
    [roomId]
  );
  if (!room) throw new HttpError(404, 'Room not found', 'room_not_found');

  const enabled = Boolean(settings.cup_enabled);
  const ownerPercent = clampPercent(settings.gift_host_percent);
  let competition: ReturnType<typeof competitionPayload> = null;
  let standings: CupStanding[] = [];
  let totalCoins = 0;
  let totalGifts = 0;

  if (enabled) {
    const snapshot = await tx(async (c) => {
      const current = await ensureCompetition(c, roomId, settings);
      if (!current) return null;
      const rows = await cupStandings(c, roomId, current.starts_at, current.ends_at, 50);
      const totals = await c.query<{ coins: string; gifts: number }>(
        `SELECT COALESCE(SUM(coins), 0)::bigint AS coins, COUNT(*)::int AS gifts
         FROM room_cup_ledger
         WHERE room_id = $1 AND status = 'settled'
           AND created_at >= $2 AND created_at < $3`,
        [roomId, current.starts_at, current.ends_at]
      );
      return { current, rows, coins: Number(totals.rows[0]?.coins ?? 0), gifts: Number(totals.rows[0]?.gifts ?? 0) };
    });
    if (snapshot) {
      competition = competitionPayload(snapshot.current);
      standings = snapshot.rows;
      totalCoins = snapshot.coins;
      totalGifts = snapshot.gifts;
    }
  }

  const myRank = standings.find((row) => row.userId === meId)?.rank ?? null;

  // Diamonds spent inside the room, all time (gift sends paid in diamonds).
  // Chat clearing never touches the cup ledger, so this total stays accurate.
  const diamonds = await one<{ total: string }>(
    `SELECT COALESCE(SUM(l.coins), 0)::text AS total
     FROM room_cup_ledger l
     JOIN gift_sends g ON g.id = l.gift_send_id
     WHERE l.room_id = $1 AND l.status = 'settled' AND g.currency = 'diamond'`,
    [roomId]
  );

  return {
    enabled,
    period: cupPeriod(settings),
    ownerPercent,
    adminPercent: 100 - ownerPercent,
    prizes: [
      Math.max(0, Math.trunc(Number(settings.cup_prize_1) || 0)),
      Math.max(0, Math.trunc(Number(settings.cup_prize_2) || 0)),
      Math.max(0, Math.trunc(Number(settings.cup_prize_3) || 0)),
    ],
    owner: room.owner_id
      ? { id: room.owner_id, displayName: room.owner_name || '', avatarUrl: room.owner_avatar }
      : null,
    competition,
    standings,
    myRank,
    totalCoins,
    totalGifts,
    diamondsSpent: Number(diamonds?.total ?? 0),
    history: await cupHistory(roomId, 5),
  };
}

/** Closes every competition whose window ended (called by the server loop). */
export async function settleDueCompetitions(): Promise<
  { roomId: string; winners: CupWinner[] }[]
> {
  const settings = await getSettings();
  const due = await q<{ id: string }>(
    `SELECT id FROM room_cup_competitions WHERE status = 'open' AND ends_at <= now() LIMIT 100`
  );
  const settled: { roomId: string; winners: CupWinner[] }[] = [];
  for (const row of due) {
    const result = await tx(async (c) => {
      const locked = await c.query<CupCompetitionRow>(
        `SELECT * FROM room_cup_competitions WHERE id = $1 AND status = 'open' FOR UPDATE`,
        [row.id]
      );
      const competition = locked.rows[0];
      if (!competition) return null;
      return settleCompetition(c, competition, settings);
    });
    if (result) settled.push(result);
  }
  for (const entry of settled) {
    for (const winner of entry.winners) emitToUser(winner.userId, 'wallet:update', {});
  }
  return settled;
}

let cupLoop: ReturnType<typeof setInterval> | null = null;

export function startCupLoop(): void {
  if (cupLoop) return;
  const run = () =>
    settleDueCompetitions().catch((error) =>
      console.error('[cup] settle failed', (error as Error).message)
    );
  setTimeout(run, 5000).unref();
  cupLoop = setInterval(run, 60_000);
  cupLoop.unref();
}

/** Admin overview: settings, per-room totals and the administration's share. */
export async function cupAdminOverview() {
  const settings = await getSettings();
  const rooms = await q<{
    id: string;
    name: string;
    owner_id: string | null;
    owner_name: string | null;
    gift_count: number;
    total_coins: string;
    owner_coins: string;
    admin_coins: string;
  }>(
    `SELECT r.id, r.name, r.owner_id, u.display_name AS owner_name,
            COUNT(l.id)::int AS gift_count,
            COALESCE(SUM(l.coins), 0)::bigint AS total_coins,
            COALESCE(SUM(l.owner_coins), 0)::bigint AS owner_coins,
            COALESCE(SUM(l.admin_coins), 0)::bigint AS admin_coins
     FROM rooms r
     LEFT JOIN users u ON u.id = r.owner_id
     LEFT JOIN room_cup_ledger l ON l.room_id = r.id AND l.status = 'settled'
     GROUP BY r.id, r.name, r.owner_id, u.display_name
     ORDER BY total_coins DESC, r.created_at ASC`
  );
  const totals = await one<{
    gifts: number;
    total_coins: string;
    owner_coins: string;
    admin_coins: string;
  }>(
    `SELECT COUNT(*)::int AS gifts,
            COALESCE(SUM(coins), 0)::bigint AS total_coins,
            COALESCE(SUM(owner_coins), 0)::bigint AS owner_coins,
            COALESCE(SUM(admin_coins), 0)::bigint AS admin_coins
     FROM room_cup_ledger WHERE status = 'settled'`
  );
  const open = await q<{ room_id: string; period: CupPeriod; ends_at: Date }>(
    `SELECT room_id, period, ends_at FROM room_cup_competitions WHERE status = 'open'`
  );
  const openByRoom = new Map(open.map((row) => [row.room_id, row]));

  return {
    settings: {
      enabled: Boolean(settings.cup_enabled),
      ownerPercent: clampPercent(settings.gift_host_percent),
      adminPercent: 100 - clampPercent(settings.gift_host_percent),
      period: cupPeriod(settings),
      prizes: [
        Math.max(0, Math.trunc(Number(settings.cup_prize_1) || 0)),
        Math.max(0, Math.trunc(Number(settings.cup_prize_2) || 0)),
        Math.max(0, Math.trunc(Number(settings.cup_prize_3) || 0)),
      ],
    },
    totals: {
      gifts: Number(totals?.gifts ?? 0),
      coins: Number(totals?.total_coins ?? 0),
      ownerCoins: Number(totals?.owner_coins ?? 0),
      adminCoins: Number(totals?.admin_coins ?? 0),
    },
    rooms: rooms.map((room) => {
      const active = openByRoom.get(room.id);
      return {
        id: room.id,
        name: room.name,
        ownerId: room.owner_id,
        ownerName: room.owner_name || 'بدون مالك',
        giftCount: Number(room.gift_count || 0),
        coins: Number(room.total_coins || 0),
        ownerCoins: Number(room.owner_coins || 0),
        adminCoins: Number(room.admin_coins || 0),
        competitionEndsAt: active?.ends_at ?? null,
        competitionPeriod: active?.period ?? null,
      };
    }),
  };
}

/** Full auditable ledger, newest first. */
export async function cupAdminLedger(limit: number, offset: number) {
  const rows = await q<CupLedgerRow & {
    room_name: string;
    owner_name: string | null;
    sender_name: string | null;
    recipient_name: string | null;
  }>(
    `SELECT l.*, r.name AS room_name, ow.display_name AS owner_name,
            s.display_name AS sender_name, rc.display_name AS recipient_name
     FROM room_cup_ledger l
     JOIN rooms r ON r.id = l.room_id
     LEFT JOIN users ow ON ow.id = l.owner_id
     JOIN users s ON s.id = l.sender_id
     JOIN users rc ON rc.id = l.recipient_id
     ORDER BY l.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const total = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM room_cup_ledger');
  return {
    total: Number(total?.count ?? 0),
    entries: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      senderId: row.sender_id,
      senderName: row.sender_name,
      recipientId: row.recipient_id,
      recipientName: row.recipient_name,
      coins: Number(row.coins),
      ownerCoins: Number(row.owner_coins),
      adminCoins: Number(row.admin_coins),
      ownerPercent: Number(row.owner_percent),
      adminPercent: Number(row.admin_percent),
      status: row.status,
      createdAt: row.created_at,
      reversedAt: row.reversed_at,
    })),
  };
}

/**
 * Reverses one split (cancelled/refunded gift): takes the owner's share back out
 * of the earnings wallet and marks the row reversed so it stops counting.
 */
export async function reverseCupEntry(entryId: string) {
  return tx(async (c) => {
    const found = await c.query<CupLedgerRow>(
      'SELECT * FROM room_cup_ledger WHERE id = $1 FOR UPDATE',
      [entryId]
    );
    const entry = found.rows[0];
    if (!entry) throw new HttpError(404, 'Ledger entry not found', 'cup_entry_not_found');
    if (entry.status !== 'settled') {
      throw new HttpError(409, 'This entry was already reversed', 'cup_entry_reversed');
    }
    if (entry.owner_id && Number(entry.owner_coins) > 0) {
      try {
        await moveProfit(c, {
          userId: entry.owner_id,
          type: 'cup_owner_reversal',
          amount: -Number(entry.owner_coins),
          refType: 'room_cup_ledger',
          refId: entry.id,
          meta: { roomId: entry.room_id, giftSendId: entry.gift_send_id },
        });
      } catch (error) {
        if (error instanceof HttpError && error.code === 'insufficient_earnings') {
          throw new HttpError(
            409,
            'Owner earnings were already withdrawn — adjust them manually first',
            'cup_owner_insufficient'
          );
        }
        throw error;
      }
    }
    await c.query(
      `UPDATE room_cup_ledger SET status = 'reversed', reversed_at = now() WHERE id = $1`,
      [entry.id]
    );
    return { id: entry.id, roomId: entry.room_id, ownerId: entry.owner_id, ownerCoins: Number(entry.owner_coins) };
  });
}

/** Admin action: close a room's competition now and announce its winners. */
export async function closeCupCompetition(roomId: string) {
  const settings = await getSettings();
  return tx(async (c) => {
    const found = await c.query<CupCompetitionRow>(
      `SELECT * FROM room_cup_competitions WHERE room_id = $1 AND status = 'open' FOR UPDATE`,
      [roomId]
    );
    const competition = found.rows[0];
    if (!competition) throw new HttpError(404, 'No open competition for this room', 'cup_not_open');
    return settleCompetition(c, competition, settings);
  });
}
