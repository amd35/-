/**
 * «أم الحجار» — real-time two-player stone game.
 *
 * Every match is server-authoritative: the server seeds the board, simulates
 * each shot, keeps the scores and moves the gold. Entry fees, prizes and
 * refunds all go through `wallet.moveGold`, so the client never touches a
 * balance. Matches are only ever played between two signed-in real users.
 */

import type { PoolClient } from 'pg';
import { one, q, tx } from './db';
import { emitToAdmins, emitToUser, emitToUsers, onlineUserIds, onSocketEvent } from './realtime';
import { notify } from './notify';
import { moveGold } from './wallet';
import { awardXpSafe } from './progression';
import { moderateTextForUser } from './security/service';
import { HttpError } from './utils';
import {
  MAX_SHOTS,
  baselineFor,
  initialState,
  simulateShot,
  type MatchState,
  type ShotInput,
  type StoneColor,
} from './gamePhysics';

export interface GameSettings {
  enabled: boolean;
  entryFee: number;
  minEntry: number;
  maxEntry: number;
  appPercent: number;
}

interface MatchRow {
  id: string;
  mode: 'quick' | 'private';
  code: string | null;
  host_id: string | null;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  entry_fee: number;
  pot: number;
  app_cut: number;
  prize: number;
  winner_id: string | null;
  turn_user_id: string | null;
  state: MatchState | Record<string, never>;
  last_action_at: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

interface PlayerRow {
  user_id: string;
  color: StoneColor;
  score: number;
  paid: number;
  shots: number;
  display_name: string | null;
  avatar_url: string | null;
}

export async function getGameSettings(): Promise<GameSettings> {
  const row = await one<{
    enabled: boolean;
    entry_fee: number;
    min_entry: number;
    max_entry: number;
    app_percent: number;
  }>('SELECT enabled, entry_fee, min_entry, max_entry, app_percent FROM game_settings WHERE id = true');
  return {
    enabled: Boolean(row?.enabled ?? true),
    entryFee: Number(row?.entry_fee ?? 100),
    minEntry: Number(row?.min_entry ?? 50),
    maxEntry: Number(row?.max_entry ?? 5000),
    appPercent: Number(row?.app_percent ?? 10),
  };
}

export async function updateGameSettings(patch: Record<string, unknown>): Promise<GameSettings> {
  const current = await getGameSettings();
  const next: GameSettings = { ...current };
  if ('enabled' in patch) next.enabled = Boolean(patch.enabled);
  if ('entryFee' in patch) next.entryFee = Math.max(0, Math.trunc(Number(patch.entryFee) || 0));
  if ('minEntry' in patch) next.minEntry = Math.max(0, Math.trunc(Number(patch.minEntry) || 0));
  if ('maxEntry' in patch) next.maxEntry = Math.max(0, Math.trunc(Number(patch.maxEntry) || 0));
  if ('appPercent' in patch) {
    next.appPercent = Math.max(0, Math.min(50, Math.trunc(Number(patch.appPercent) || 0)));
  }
  if (next.minEntry > next.maxEntry) {
    throw new HttpError(400, 'الحد الأدنى أكبر من الحد الأعلى', 'invalid_limits');
  }
  next.entryFee = Math.max(next.minEntry, Math.min(next.maxEntry, next.entryFee));
  await q(
    `UPDATE game_settings
        SET enabled = $1, entry_fee = $2, min_entry = $3, max_entry = $4, app_percent = $5, updated_at = now()
      WHERE id = true`,
    [next.enabled, next.entryFee, next.minEntry, next.maxEntry, next.appPercent]
  );
  return next;
}

async function assertPlayable(userId: string): Promise<GameSettings> {
  const settings = await getGameSettings();
  if (!settings.enabled) throw new HttpError(403, 'اللعبة متوقفة حالياً', 'game_disabled');
  const ban = await one<{ until: string; reason: string }>(
    'SELECT until, reason FROM game_bans WHERE user_id = $1 AND until > now()',
    [userId]
  );
  if (ban) throw new HttpError(403, 'أنت محظور من اللعبة', 'game_banned', { until: ban.until, reason: ban.reason });
  return settings;
}

async function assertCanAfford(userId: string, fee: number): Promise<void> {
  const balance = await goldBalance(userId);
  if (fee > 0 && balance < fee) {
    throw new HttpError(402, 'رصيد الذهب لا يكفي لرسوم الدخول', 'insufficient_gold', {
      balance,
      required: fee,
    });
  }
}

async function activeMatchFor(userId: string): Promise<MatchRow | null> {
  return one<MatchRow>(
    `SELECT m.* FROM game_matches m
       JOIN game_players p ON p.match_id = m.id
      WHERE p.user_id = $1 AND m.status IN ('waiting', 'playing')
      ORDER BY m.created_at DESC
      LIMIT 1`,
    [userId]
  );
}

async function matchPlayers(matchId: string): Promise<PlayerRow[]> {
  const rows = await q<PlayerRow>(
    `SELECT p.user_id, p.color, p.score, p.paid, p.shots, u.display_name, u.avatar_url
       FROM game_players p JOIN users u ON u.id = p.user_id
      WHERE p.match_id = $1
      ORDER BY p.joined_at ASC`,
    [matchId]
  );
  return rows;
}

function goldBalance(userId: string): Promise<number> {
  return one<{ gold: number }>('SELECT COALESCE(gold, 0) AS gold FROM wallets WHERE user_id = $1', [userId]).then(
    (row) => Number(row?.gold ?? 0)
  );
}

/** Lobby payload: settings, my wallet/stats, open rooms and the leaderboard. */
export async function gameSnapshot(userId: string) {
  const settings = await getGameSettings();
  const active = await activeMatchFor(userId);
  const [gold, stats, history, leaderboard, openRooms] = await Promise.all([
    goldBalance(userId),
    one<{ played: string; wins: string }>(
      `SELECT count(*)::text AS played,
              count(*) FILTER (WHERE m.winner_id = $1)::text AS wins
         FROM game_players p JOIN game_matches m ON m.id = p.match_id
        WHERE p.user_id = $1 AND m.status = 'finished'`,
      [userId]
    ),
    q<{
      id: string;
      status: string;
      entry_fee: number;
      prize: number;
      winner_id: string | null;
      ended_at: string | null;
      opponent_name: string | null;
      opponent_avatar: string | null;
    }>(
      `SELECT m.id, m.status, m.entry_fee, m.prize, m.winner_id, m.ended_at,
              o.display_name AS opponent_name, o.avatar_url AS opponent_avatar
         FROM game_matches m
         JOIN game_players me ON me.match_id = m.id AND me.user_id = $1
         LEFT JOIN game_players op ON op.match_id = m.id AND op.user_id <> $1
         LEFT JOIN users o ON o.id = op.user_id
        WHERE m.status = 'finished'
        ORDER BY m.ended_at DESC NULLS LAST
        LIMIT 8`,
      [userId]
    ),
    q<{ user_id: string; display_name: string | null; avatar_url: string | null; wins: string; played: string }>(
      `SELECT m.winner_id AS user_id, u.display_name, u.avatar_url,
              count(*)::text AS wins,
              (SELECT count(*)::text FROM game_players gp WHERE gp.user_id = m.winner_id) AS played
         FROM game_matches m JOIN users u ON u.id = m.winner_id
        WHERE m.status = 'finished' AND m.winner_id IS NOT NULL
        GROUP BY m.winner_id, u.display_name, u.avatar_url
        ORDER BY count(*) DESC
        LIMIT 10`
    ),
    q<{ id: string; code: string; entry_fee: number; host_name: string | null; host_avatar: string | null }>(
      `SELECT m.id, m.code, m.entry_fee, u.display_name AS host_name, u.avatar_url AS host_avatar
         FROM game_matches m JOIN users u ON u.id = m.host_id
        WHERE m.status = 'waiting' AND m.mode = 'private' AND m.code IS NOT NULL
        ORDER BY m.created_at DESC
        LIMIT 12`
    ),
  ]);

  const played = Number(stats?.played ?? 0);
  const wins = Number(stats?.wins ?? 0);
  return {
    settings,
    gold,
    online: onlineUserIds().length,
    stats: { played, wins, losses: Math.max(0, played - wins) },
    active: active
      ? { matchId: active.id, status: active.status, mode: active.mode, code: active.code, fee: active.entry_fee }
      : null,
    history: history.map((row) => ({
      id: row.id,
      entryFee: Number(row.entry_fee),
      prize: Number(row.prize),
      won: row.winner_id === userId,
      endedAt: row.ended_at,
      opponent: { displayName: row.opponent_name || 'لاعب', avatarUrl: row.opponent_avatar },
    })),
    leaderboard: leaderboard.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      displayName: row.display_name || 'لاعب',
      avatarUrl: row.avatar_url,
      wins: Number(row.wins),
      played: Number(row.played),
    })),
    openRooms: openRooms.map((row) => ({
      id: row.id,
      code: row.code,
      entryFee: Number(row.entry_fee),
      hostName: row.host_name || 'لاعب',
      hostAvatar: row.host_avatar,
    })),
  };
}

/** Charges both players and starts the match. Must run inside a transaction. */
async function startMatchTx(c: PoolClient, match: MatchRow) {
  const players = await c.query<{ user_id: string; color: StoneColor }>(
    'SELECT user_id, color FROM game_players WHERE match_id = $1 ORDER BY joined_at ASC',
    [match.id]
  );
  if ((players.rowCount ?? 0) < 2) return null;

  const settings = await getGameSettings();
  for (const player of players.rows) {
    await moveGold(c, {
      userId: player.user_id,
      amount: -match.entry_fee,
      type: 'game_entry',
      refType: 'game_match',
      refId: match.id,
      meta: { mode: match.mode, fee: match.entry_fee },
    });
    await c.query('UPDATE game_players SET paid = $2 WHERE match_id = $1 AND user_id = $3', [
      match.id,
      match.entry_fee,
      player.user_id,
    ]);
  }

  const pot = match.entry_fee * 2;
  const appCut = Math.floor((pot * settings.appPercent) / 100);
  const prize = pot - appCut;
  const state = initialState();
  const white = players.rows.find((player) => player.color === 'white')!;
  await c.query(
    `UPDATE game_matches
        SET status = 'playing', pot = $2, app_cut = $3, prize = $4, state = $5::jsonb,
            turn_user_id = $6, started_at = now(), last_action_at = now()
      WHERE id = $1`,
    [match.id, pot, appCut, prize, JSON.stringify(state), white.user_id]
  );
  return { pot, prize, players: players.rows.map((player) => player.user_id) };
}

function emitMatched(userIds: string[], matchId: string, mode: string) {
  emitToUsers(userIds, 'game:matched', { matchId, mode });
}

/** Quick match: pair with the oldest waiting opponent or open a new room. */
export async function joinQueue(userId: string, feeInput?: unknown) {
  const settings = await assertPlayable(userId);
  const active = await activeMatchFor(userId);
  if (active) return { matchId: active.id, status: active.status, mode: active.mode, code: active.code };
  const fee = Math.max(settings.minEntry, Math.min(settings.maxEntry, Math.trunc(Number(feeInput) || settings.entryFee)));
  await assertCanAfford(userId, fee);

  const outcome = await tx(async (c) => {
    const waiting = await c.query<MatchRow>(
      `SELECT m.* FROM game_matches m
        WHERE m.status = 'waiting' AND m.mode = 'quick' AND m.entry_fee = $1 AND m.host_id <> $2
          AND NOT EXISTS (SELECT 1 FROM game_players p WHERE p.match_id = m.id AND p.user_id = $2)
        ORDER BY m.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [fee, userId]
    );
    if (waiting.rowCount) {
      const match = waiting.rows[0];
      await c.query(
        `INSERT INTO game_players (match_id, user_id, color) VALUES ($1, $2, 'black')
         ON CONFLICT DO NOTHING`,
        [match.id, userId]
      );
      const started = await startMatchTx(c, match);
      return { matchId: match.id, status: 'playing' as const, players: started?.players ?? [] };
    }
    const created = await c.query<MatchRow>(
      `INSERT INTO game_matches (mode, host_id, entry_fee) VALUES ('quick', $1, $2) RETURNING *`,
      [userId, fee]
    );
    const match = created.rows[0];
    await c.query(`INSERT INTO game_players (match_id, user_id, color) VALUES ($1, $2, 'white')`, [
      match.id,
      userId,
    ]);
    return { matchId: match.id, status: 'waiting' as const, players: [userId] };
  });

  if (outcome.status === 'playing') emitMatched(outcome.players, outcome.matchId, 'quick');
  return { matchId: outcome.matchId, status: outcome.status, mode: 'quick', code: null };
}

export async function cancelQueue(userId: string) {
  const match = await activeMatchFor(userId);
  if (!match || match.status !== 'waiting') return { cancelled: false };
  await tx(async (c) => {
    const locked = await c.query<MatchRow>('SELECT * FROM game_matches WHERE id = $1 FOR UPDATE', [match.id]);
    if (locked.rows[0]?.status !== 'waiting') return;
    await c.query(`UPDATE game_matches SET status = 'cancelled', ended_at = now() WHERE id = $1`, [match.id]);
  });
  return { cancelled: true };
}

/** Private room: the host picks the fee, the code is shared with a friend. */
export async function createPrivateMatch(userId: string, feeInput: unknown) {
  const settings = await assertPlayable(userId);
  const fee = Math.max(settings.minEntry, Math.min(settings.maxEntry, Math.trunc(Number(feeInput) || settings.entryFee)));
  await assertCanAfford(userId, fee);
  const active = await activeMatchFor(userId);
  if (active) return { matchId: active.id, status: active.status, mode: active.mode, code: active.code };

  const code = await newCode();
  const created = await tx(async (c) => {
    const match = await c.query<MatchRow>(
      `INSERT INTO game_matches (mode, host_id, entry_fee, code) VALUES ('private', $1, $2, $3) RETURNING *`,
      [userId, fee, code]
    );
    await c.query(`INSERT INTO game_players (match_id, user_id, color) VALUES ($1, $2, 'white')`, [
      match.rows[0].id,
      userId,
    ]);
    return match.rows[0];
  });
  return { matchId: created.id, status: 'waiting', mode: 'private', code };
}

async function newCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const taken = await one('SELECT 1 FROM game_matches WHERE code = $1 AND status = $2', [code, 'waiting']);
    if (!taken) return code;
  }
  throw new HttpError(503, 'تعذر إنشاء كود الغرفة', 'code_failed');
}

export async function joinByCode(userId: string, rawCode: string) {
  await assertPlayable(userId);
  const code = String(rawCode || '').trim();
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'كود الغرفة غير صحيح', 'invalid_code');
  const active = await activeMatchFor(userId);
  if (active) return { matchId: active.id, status: active.status, mode: active.mode, code: active.code };

  const outcome = await tx(async (c) => {
    const found = await c.query<MatchRow>(
      `SELECT * FROM game_matches WHERE code = $1 AND status = 'waiting' AND mode = 'private' FOR UPDATE`,
      [code]
    );
    if (!found.rowCount) throw new HttpError(404, 'الغرفة غير موجودة أو انتهت', 'room_not_found');
    const match = found.rows[0];
    if (match.host_id === userId) throw new HttpError(400, 'لا يمكنك الانضمام لغرفتك', 'own_room');
    const balance = await c.query<{ gold: number }>('SELECT COALESCE(gold, 0) AS gold FROM wallets WHERE user_id = $1', [
      userId,
    ]);
    if (Number(balance.rows[0]?.gold ?? 0) < Number(match.entry_fee)) {
      throw new HttpError(402, 'رصيد الذهب لا يكفي لرسوم الدخول', 'insufficient_gold');
    }
    await c.query(
      `INSERT INTO game_players (match_id, user_id, color) VALUES ($1, $2, 'black') ON CONFLICT DO NOTHING`,
      [match.id, userId]
    );
    const started = await startMatchTx(c, match);
    return { matchId: match.id, status: 'playing' as const, players: started?.players ?? [] };
  });

  emitMatched(outcome.players, outcome.matchId, 'private');
  return { matchId: outcome.matchId, status: 'playing', mode: 'private', code };
}

/** Full match payload for the board screen (also used after a reconnect). */
export async function matchDetail(matchId: string, userId: string) {
  const match = await one<MatchRow>('SELECT * FROM game_matches WHERE id = $1', [matchId]);
  if (!match) throw new HttpError(404, 'المباراة غير موجودة', 'match_not_found');
  const players = await matchPlayers(matchId);
  const me = players.find((player) => player.user_id === userId);
  if (!me) throw new HttpError(403, 'أنت لست لاعباً في هذه المباراة', 'not_a_player');
  const messages = await q<{
    id: string;
    user_id: string;
    kind: 'text' | 'emoji' | 'system';
    body: string;
    created_at: string;
  }>(
    `SELECT id, user_id, kind, body, created_at FROM game_messages
      WHERE match_id = $1 ORDER BY created_at ASC LIMIT 60`,
    [matchId]
  );
  return {
    match: {
      id: match.id,
      mode: match.mode,
      code: match.code,
      status: match.status,
      entryFee: Number(match.entry_fee),
      pot: Number(match.pot),
      appCut: Number(match.app_cut),
      prize: Number(match.prize),
      winnerId: match.winner_id,
      turnUserId: match.turn_user_id,
      state: match.state,
      startedAt: match.started_at,
      endedAt: match.ended_at,
    },
    players: players.map((player) => ({
      userId: player.user_id,
      displayName: player.display_name || 'لاعب',
      avatarUrl: player.avatar_url,
      color: player.color,
      score: Number(player.score),
      shots: Number(player.shots),
    })),
    myColor: me?.color ?? null,
    messages: messages.map((row) => ({
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      body: row.body,
      createdAt: row.created_at,
    })),
    gold: await goldBalance(userId),
  };
}

function otherColor(color: StoneColor): StoneColor {
  return color === 'white' ? 'black' : 'white';
}

async function settleMatch(
  c: PoolClient,
  match: MatchRow,
  winnerId: string | null,
  reason: string
): Promise<{ prize: number; refunded: boolean }> {
  const players = await c.query<{ user_id: string }>('SELECT user_id FROM game_players WHERE match_id = $1', [
    match.id,
  ]);
  if (winnerId && match.prize > 0) {
    await moveGold(c, {
      userId: winnerId,
      amount: match.prize,
      type: 'game_prize',
      refType: 'game_match',
      refId: match.id,
      meta: { reason, pot: match.pot, appCut: match.app_cut },
    });
  } else if (match.entry_fee > 0) {
    for (const player of players.rows) {
      await moveGold(c, {
        userId: player.user_id,
        amount: match.entry_fee,
        type: 'game_refund',
        refType: 'game_match',
        refId: match.id,
        meta: { reason },
      });
    }
  }
  await c.query(
    `UPDATE game_matches SET status = 'finished', winner_id = $2, ended_at = now() WHERE id = $1`,
    [match.id, winnerId]
  );
  return { prize: winnerId ? match.prize : 0, refunded: !winnerId };
}

/** One shot: the server simulates it, scores it and passes the turn. */
export async function shoot(userId: string, matchId: string, input: ShotInput) {
  const outcome = await tx(async (c) => {
    const found = await c.query<MatchRow>('SELECT * FROM game_matches WHERE id = $1 FOR UPDATE', [matchId]);
    const match = found.rows[0];
    if (!match) throw new HttpError(404, 'المباراة غير موجودة', 'match_not_found');
    if (match.status !== 'playing') throw new HttpError(409, 'المباراة غير جارية', 'match_not_playing');
    if (match.turn_user_id !== userId) throw new HttpError(409, 'ليس دورك', 'not_your_turn');

    const players = await c.query<{ user_id: string; color: StoneColor; score: number; shots: number }>(
      'SELECT user_id, color, score, shots FROM game_players WHERE match_id = $1',
      [matchId]
    );
    const me = players.rows.find((player) => player.user_id === userId);
    if (!me) throw new HttpError(403, 'أنت لست لاعباً في هذه المباراة', 'not_a_player');
    const rival = players.rows.find((player) => player.user_id !== userId);
    if (!rival) throw new HttpError(409, 'لا يوجد منافس', 'no_opponent');

    const state = match.state as MatchState;
    const shot = simulateShot(state, me.color, input);
    const shooter = me.color;
    const opponent = otherColor(shooter);

    let keepTurn = false;
    for (const pocketed of shot.pocketed) {
      if (pocketed.color === shooter) {
        state.scores[shooter] += 10;
        state.pocketed[shooter] += 1;
        keepTurn = true;
      } else {
        state.scores[opponent] += 10;
        state.pocketed[opponent] += 1;
      }
    }
    if (shot.foul) {
      state.scores[shooter] = Math.max(0, state.scores[shooter] - 5);
      keepTurn = false;
    }
    state.shots[shooter] += 1;
    state.stones = state.stones.filter(
      (stone) => !shot.pocketed.some((pocketed) => pocketed.id === stone.id)
    );

    const nextTurn: StoneColor = keepTurn && state.stones.length > 0 ? shooter : opponent;
    const nextUser = nextTurn === shooter ? me.user_id : rival.user_id;
    state.turn = nextTurn;
    state.striker = { x: 500, y: baselineFor(nextTurn) };

    await c.query('UPDATE game_players SET score = $2, shots = $3 WHERE match_id = $1 AND user_id = $4', [
      matchId,
      state.scores[shooter],
      state.shots[shooter],
      me.user_id,
    ]);
    await c.query('UPDATE game_players SET score = $2 WHERE match_id = $1 AND user_id = $3', [
      matchId,
      state.scores[opponent],
      rival.user_id,
    ]);

    const exhausted = state.shots.white >= MAX_SHOTS && state.shots.black >= MAX_SHOTS;
    const boardCleared = state.stones.length === 0;
    let finished = false;
    let winnerId: string | null = null;
    let refunded = false;

    await c.query('UPDATE game_matches SET state = $2::jsonb WHERE id = $1', [matchId, JSON.stringify(state)]);

    if (boardCleared || exhausted) {
      finished = true;
      const white = players.rows.find((player) => player.color === 'white');
      const black = players.rows.find((player) => player.color === 'black');
      if (state.scores.white !== state.scores.black) {
        winnerId =
          state.scores.white > state.scores.black ? white?.user_id ?? null : black?.user_id ?? null;
      }
      const settled = await settleMatch(c, match, winnerId, boardCleared ? 'board_cleared' : 'shots_exhausted');
      refunded = settled.refunded;
    } else {
      await c.query(
        `UPDATE game_matches SET state = $2::jsonb, turn_user_id = $3, last_action_at = now() WHERE id = $1`,
        [matchId, JSON.stringify(state), nextUser]
      );
    }

    return {
      players: players.rows.map((player) => player.user_id),
      shooter: me.user_id,
      frames: shot.frames,
      state,
      foul: shot.foul,
      finished,
      winnerId,
      refunded,
    };
  });

  const payload = {
    matchId,
    shooterId: outcome.shooter,
    frames: outcome.frames,
    state: outcome.state,
    foul: outcome.foul,
  };
  emitToUsers(outcome.players, 'game:shot', payload);
  if (outcome.finished) {
    emitToUsers(outcome.players, 'game:ended', {
      matchId,
      winnerId: outcome.winnerId,
      refunded: outcome.refunded,
      scores: outcome.state.scores,
    });
    await afterMatch(outcome.players, matchId, outcome.winnerId, outcome.refunded);
  }
  return {
    frames: outcome.frames,
    state: outcome.state,
    foul: outcome.foul,
    finished: outcome.finished,
    winnerId: outcome.winnerId,
    refunded: outcome.refunded,
  };
}

/** Prize notification + XP once the money has been committed. */
async function afterMatch(playerIds: string[], matchId: string, winnerId: string | null, refunded: boolean) {
  const match = await one<MatchRow>('SELECT * FROM game_matches WHERE id = $1', [matchId]);
  if (!match) return;
  for (const userId of playerIds) {
    const won = winnerId === userId;
    await notify(
      userId,
      won ? 'game_win' : 'game_play',
      won ? 'فوز في أم الحجار 🏆' : 'انتهت مباراة أم الحجار',
      won
        ? `فزت في المباراة وحصلت على ${match.prize} ذهب.`
        : refunded
          ? 'انتهت المباراة بالتعادل — أُعيدت رسوم الدخول إلى رصيدك.'
          : 'حظاً أوفر في المباراة القادمة!',
      { matchId, won }
    );
    await awardXpSafe({ userId, kind: won ? 'game_win' : 'game_play', refId: matchId, xp: won ? 60 : 20 });
  }
  emitToAdmins('game:finished', { matchId, winnerId });
}

export async function leaveMatch(userId: string, matchId: string) {
  const outcome = await tx(
    async (
      c
    ): Promise<{ status: 'waiting' | 'playing' | 'finished' | 'cancelled'; winnerId: string | null; players: string[] }> => {
      const found = await c.query<MatchRow>('SELECT * FROM game_matches WHERE id = $1 FOR UPDATE', [matchId]);
      const match = found.rows[0];
      if (!match) throw new HttpError(404, 'المباراة غير موجودة', 'match_not_found');
      const players = await c.query<{ user_id: string; color: StoneColor }>(
        'SELECT user_id, color FROM game_players WHERE match_id = $1',
        [matchId]
      );
      const ids = players.rows.map((player) => player.user_id);
      if (!ids.includes(userId)) throw new HttpError(403, 'أنت لست لاعباً في هذه المباراة', 'not_a_player');

      if (match.status === 'waiting') {
        await c.query(`UPDATE game_matches SET status = 'cancelled', ended_at = now() WHERE id = $1`, [matchId]);
        return { status: 'cancelled', winnerId: null, players: ids };
      }
      if (match.status !== 'playing') return { status: match.status, winnerId: match.winner_id, players: [] };

      const rival = players.rows.find((player) => player.user_id !== userId);
      const winnerId = rival?.user_id ?? null;
      await settleMatch(c, match, winnerId, 'forfeit');
      return { status: 'finished', winnerId, players: ids };
    }
  );

  if (outcome.status === 'cancelled') {
    emitToUsers(outcome.players, 'game:ended', { matchId, winnerId: null, cancelled: true });
  } else if (outcome.status === 'finished') {
    emitToUsers(outcome.players, 'game:ended', { matchId, winnerId: outcome.winnerId, forfeit: true });
    await afterMatch(outcome.players, matchId, outcome.winnerId, false);
  }
  return outcome;
}

export async function postMessage(
  userId: string,
  matchId: string,
  kind: 'text' | 'emoji',
  rawBody: string
) {
  const match = await one<MatchRow>('SELECT * FROM game_matches WHERE id = $1', [matchId]);
  if (!match) throw new HttpError(404, 'المباراة غير موجودة', 'match_not_found');
  if (match.status !== 'playing' && match.status !== 'waiting') {
    throw new HttpError(409, 'المباراة انتهت', 'match_not_playing');
  }
  const players = await matchPlayers(matchId);
  if (!players.some((player) => player.user_id === userId)) {
    throw new HttpError(403, 'أنت لست لاعباً في هذه المباراة', 'not_a_player');
  }
  const body = String(rawBody || '').slice(0, 200).trim();
  if (!body) throw new HttpError(400, 'الرسالة فارغة', 'empty_message');
  if (kind === 'text') {
    const verdict = await moderateTextForUser({ userId, text: body, surface: 'game_chat' });
    if (!verdict.allowed) {
      throw new HttpError(403, verdict.reason || 'الرسالة مخالفة لسياسة المحتوى', 'message_blocked');
    }
  }
  const inserted = await one<{ id: string; created_at: string }>(
    `INSERT INTO game_messages (match_id, user_id, kind, body) VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [matchId, userId, kind, body]
  );
  const message = {
    id: inserted!.id,
    userId,
    kind,
    body,
    createdAt: inserted!.created_at,
  };
  emitToUsers(
    players.map((player) => player.user_id),
    'game:message',
    { matchId, message }
  );
  return message;
}

export async function reportPlayer(userId: string, matchId: string, targetId: string, reason: string) {
  const players = await matchPlayers(matchId);
  if (!players.some((player) => player.user_id === userId) || !players.some((player) => player.user_id === targetId)) {
    throw new HttpError(403, 'لا يمكنك الإبلاغ عن هذا اللاعب', 'not_a_player');
  }
  await q(
    `INSERT INTO game_reports (match_id, reporter_id, target_id, reason) VALUES ($1, $2, $3, $4)`,
    [matchId, userId, targetId, String(reason || '').slice(0, 300)]
  );
  emitToAdmins('game:report', { matchId, targetId });
  return { reported: true };
}

/* ------------------------------------------------------------------ admin */

export async function adminGameOverview() {
  const settings = await getGameSettings();
  const [totals, live, recent, bans, reports, ledger] = await Promise.all([
    one<{
      matches: string;
      entries: string;
      prizes: string;
      refunds: string;
      app_cut: string;
    }>(
      `SELECT count(*)::text AS matches,
              COALESCE(SUM(entry_fee * 2), 0)::text AS entries,
              COALESCE(SUM(prize), 0)::text AS prizes,
              COALESCE(SUM(app_cut), 0)::text AS app_cut
         FROM game_matches WHERE status = 'finished'`
    ),
    q(
      `SELECT m.id, m.mode, m.entry_fee, m.pot, m.prize, m.started_at,
              w.display_name AS white_name, b.display_name AS black_name,
              ws.score AS white_score, bs.score AS black_score
         FROM game_matches m
         LEFT JOIN game_players wp ON wp.match_id = m.id AND wp.color = 'white'
         LEFT JOIN users w ON w.id = wp.user_id
         LEFT JOIN game_players bp ON bp.match_id = m.id AND bp.color = 'black'
         LEFT JOIN users b ON b.id = bp.user_id
         LEFT JOIN game_players ws ON ws.match_id = m.id AND ws.color = 'white'
         LEFT JOIN game_players bs ON bs.match_id = m.id AND bs.color = 'black'
        WHERE m.status = 'playing'
        ORDER BY m.started_at DESC NULLS LAST
        LIMIT 30`
    ),
    q(
      `SELECT m.id, m.mode, m.entry_fee, m.pot, m.prize, m.app_cut, m.status, m.ended_at,
              w.display_name AS winner_name
         FROM game_matches m LEFT JOIN users w ON w.id = m.winner_id
        WHERE m.status IN ('finished', 'cancelled')
        ORDER BY m.created_at DESC LIMIT 30`
    ),
    q(
      `SELECT b.user_id, u.display_name, u.username, b.reason, b.until, b.created_at
         FROM game_bans b JOIN users u ON u.id = b.user_id
        WHERE b.until > now() ORDER BY b.created_at DESC`
    ),
    q(
      `SELECT r.id, r.reason, r.status, r.created_at,
              reporter.display_name AS reporter_name, target.display_name AS target_name,
              target.username AS target_username
         FROM game_reports r
         JOIN users reporter ON reporter.id = r.reporter_id
         JOIN users target ON target.id = r.target_id
        ORDER BY r.created_at DESC LIMIT 50`
    ),
    q(
      `SELECT t.id, t.user_id, u.display_name, t.type, t.amount, t.balance_after, t.ref_id, t.created_at
         FROM gold_transactions t JOIN users u ON u.id = t.user_id
        WHERE t.type IN ('game_entry', 'game_prize', 'game_refund')
        ORDER BY t.created_at DESC LIMIT 50`
    ),
  ]);
  return {
    settings,
    totals: {
      matches: Number(totals?.matches ?? 0),
      entries: Number(totals?.entries ?? 0),
      prizes: Number(totals?.prizes ?? 0),
      appCut: Number(totals?.app_cut ?? 0),
    },
    live,
    recent,
    bans,
    reports,
    ledger,
  };
}

export async function adminGameLedger(limit: number, offset: number) {
  const rows = await q(
    `SELECT t.id, t.user_id, u.display_name, t.type, t.amount, t.balance_before, t.balance_after,
            t.ref_id, t.meta, t.created_at
       FROM gold_transactions t JOIN users u ON u.id = t.user_id
      WHERE t.type IN ('game_entry', 'game_prize', 'game_refund')
      ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { entries: rows };
}

export async function adminBanPlayer(adminId: string, userId: string, hours: number, reason: string) {
  const until = new Date(Date.now() + Math.max(1, Math.min(24 * 30, hours)) * 3600_000);
  await q(
    `INSERT INTO game_bans (user_id, reason, until, banned_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, until = EXCLUDED.until, banned_by = EXCLUDED.banned_by`,
    [userId, String(reason || '').slice(0, 300), until, adminId]
  );
  return { banned: true, until };
}

export async function adminUnbanPlayer(userId: string) {
  await q('DELETE FROM game_bans WHERE user_id = $1', [userId]);
  return { unbanned: true };
}

export async function adminResolveReport(reportId: string, status: 'resolved' | 'dismissed') {
  await q('UPDATE game_reports SET status = $2 WHERE id = $1', [reportId, status]);
  return { updated: true };
}

/* ------------------------------------------------------------------- loops */

/** Cancels abandoned lobbies and forfeits games whose player vanished. */
export function startGameLoop(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void (async () => {
      try {
        await q(
          `UPDATE game_matches SET status = 'cancelled', ended_at = now()
            WHERE status = 'waiting' AND created_at < now() - interval '10 minutes'`
        );
        await q(
          `UPDATE game_matches SET status = 'cancelled', ended_at = now()
            WHERE status = 'waiting'
              AND NOT EXISTS (SELECT 1 FROM game_players p WHERE p.match_id = game_matches.id)`
        );
        const stale = await q<MatchRow>(
          `SELECT * FROM game_matches
            WHERE status = 'playing' AND last_action_at < now() - interval '3 minutes'`
        );
        for (const match of stale) {
          const players = await matchPlayers(match.id);
          const turnPlayer = players.find((player) => player.user_id === match.turn_user_id);
          const winner = players.find((player) => player.user_id !== turnPlayer?.user_id) ?? null;
          await tx(async (c) => {
            const locked = await c.query<MatchRow>('SELECT * FROM game_matches WHERE id = $1 FOR UPDATE', [
              match.id,
            ]);
            if (locked.rows[0]?.status !== 'playing') return;
            await settleMatch(c, locked.rows[0], winner?.user_id ?? null, 'timeout');
          });
          emitToUsers(
            players.map((player) => player.user_id),
            'game:ended',
            { matchId: match.id, winnerId: winner?.user_id ?? null, forfeit: true }
          );
        }
      } catch (error) {
        console.error('[game] loop failed', (error as Error).message);
      }
    })();
  }, 30_000);
}

/** Voice relay: both players of the same live match can exchange WebRTC signals. */
export function registerGameSocket(): void {
  onSocketEvent('game:signal', async ({ userId, data }) => {
    const matchId = String(data.matchId || '');
    const to = String(data.to || '');
    if (!matchId || !to || to === userId) return;
    const players = await q<{ user_id: string }>('SELECT user_id FROM game_players WHERE match_id = $1', [
      matchId,
    ]);
    const ids = players.map((row) => row.user_id);
    if (!ids.includes(userId) || !ids.includes(to)) return;
    emitToUser(to, 'game:signal', { matchId, from: userId, payload: data.payload ?? null });
  });
}
