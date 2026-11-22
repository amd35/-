import { one, q, tx } from './db';
import { getSettings } from './settings';
import { consumeFreeAttempt, getFreeCallState } from './freecalls';
import { emitToUser } from './realtime';
import { notify } from './notify';
import { getPublicUser } from './serializers';
import { HttpError } from './utils';
import { lockWallet, moveCoins, recordLedger } from './wallet';

export type CallKind = 'voice' | 'video';

interface ActiveCall {
  callId: string;
  callerId: string;
  calleeId: string;
  rate: number;
  isFree: boolean;
  startedAt: number;
  reservedMinutes: number;
  balance: number;
}

export interface CallSummary {
  callId: string;
  status: string;
  durationSeconds: number;
  coinsCharged: number;
  coinsRefunded: number;
  isFree: boolean;
  ratePerMinute: number;
  endReason: string;
  balance: number | null;
  earnings: number;
}

const RING_TIMEOUT_MS = 45_000;
const active = new Map<string, ActiveCall>();
const ringTimers = new Map<string, NodeJS.Timeout>();

function clearRingTimer(callId: string): void {
  const timer = ringTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    ringTimers.delete(callId);
  }
}

function callSummary(
  call: {
    id: string;
    status: string;
    is_free: boolean;
    rate_per_minute: number;
    duration_seconds: number;
    coins_charged: number;
    coins_refunded: number;
    end_reason: string | null;
  },
  extra: Partial<CallSummary> = {}
): CallSummary {
  return {
    callId: call.id,
    status: call.status,
    durationSeconds: call.duration_seconds ?? 0,
    coinsCharged: call.coins_charged ?? 0,
    coinsRefunded: call.coins_refunded ?? 0,
    isFree: Boolean(call.is_free),
    ratePerMinute: call.rate_per_minute,
    endReason: call.end_reason ?? 'ended',
    balance: null,
    earnings: 0,
    ...extra,
  };
}

async function pushFreeState(userId: string): Promise<void> {
  try {
    const state = await getFreeCallState(userId);
    emitToUser(userId, 'free:update', state);
  } catch (error) {
    console.error('[calls] free state push failed', error);
  }
}

/**
 * Places a call. Nothing is charged here: coins are only reserved when the callee
 * actually accepts, and a free attempt is only consumed on a successful accept.
 */
export async function inviteCall(callerId: string, calleeId: string, kind: CallKind) {
  if (kind !== 'voice' && kind !== 'video') {
    throw new HttpError(400, 'Unsupported call type', 'invalid_kind');
  }
  if (callerId === calleeId) throw new HttpError(400, 'You cannot call yourself', 'invalid_callee');

  const settings = await getSettings();
  const callee = await one<{ id: string; is_banned: boolean }>(
    'SELECT id, is_banned FROM users WHERE id = $1',
    [calleeId]
  );
  if (!callee) throw new HttpError(404, 'User not found', 'user_not_found');
  if (callee.is_banned) throw new HttpError(403, 'This user is not available', 'user_banned');

  const blocked = await one<{ user_id: string }>(
    `SELECT user_id FROM blocked_users
     WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1) LIMIT 1`,
    [callerId, calleeId]
  );
  if (blocked) throw new HttpError(403, 'You cannot call this user', 'blocked');

  const busy = await one<{ id: string }>(
    `SELECT id FROM calls WHERE (caller_id = $1 OR callee_id = $1)
       AND status IN ('ringing', 'accepted') LIMIT 1`,
    [callerId]
  );
  if (busy) throw new HttpError(409, 'You are already on a call', 'caller_busy');

  const calleeBusy = await one<{ id: string }>(
    `SELECT id FROM calls WHERE (caller_id = $1 OR callee_id = $1)
       AND status IN ('ringing', 'accepted') LIMIT 1`,
    [calleeId]
  );
  if (calleeBusy) throw new HttpError(409, 'This user is on another call', 'callee_busy');

  const free = await getFreeCallState(callerId);
  const canBeFree = free.enabled && (free.exempt || free.remaining > 0);
  const rate = kind === 'voice' ? settings.voice_price : settings.video_price;

  if (!canBeFree) {
    if (!settings.paid_calls_enabled) {
      throw new HttpError(402, 'Free attempts are finished and paid calls are disabled', 'paid_disabled');
    }
    const wallet = await one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [
      callerId,
    ]);
    const balance = wallet?.balance ?? 0;
    if (balance < rate) {
      throw new HttpError(402, `You need ${rate} coins for this call`, 'insufficient_coins', {
        balance,
        required: rate,
      });
    }
  }

  const call = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO calls (caller_id, callee_id, kind, rate_per_minute, admin_percent)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [callerId, calleeId, kind, rate, settings.admin_percent]
    );
    const created = rows[0];
    await c.query(
      `INSERT INTO call_participants (call_id, user_id, role)
       VALUES ($1, $2, 'caller'), ($1, $3, 'callee')`,
      [created.id, callerId, calleeId]
    );
    return created;
  });

  const callerProfile = await getPublicUser(callerId);
  emitToUser(calleeId, 'call:incoming', {
    callId: call.id,
    kind,
    ratePerMinute: rate,
    freeAvailable: canBeFree,
    from: callerProfile,
  });
  emitToUser(callerId, 'call:ringing', { callId: call.id, kind, ratePerMinute: rate });

  ringTimers.set(
    call.id,
    setTimeout(() => {
      void endRinging(call.id, 'missed').catch(() => undefined);
    }, RING_TIMEOUT_MS)
  );

  return { call, freeAvailable: canBeFree, ratePerMinute: rate };
}

async function endRinging(callId: string, status: 'missed' | 'cancelled' | 'rejected') {
  clearRingTimer(callId);
  const call = await one<{
    id: string;
    caller_id: string;
    callee_id: string;
    kind: string;
    is_free: boolean;
    rate_per_minute: number;
    duration_seconds: number;
    coins_charged: number;
    coins_refunded: number;
  }>(
    `UPDATE calls SET status = $2, end_reason = $2, ended_at = now()
     WHERE id = $1 AND status = 'ringing'
     RETURNING id, caller_id, callee_id, kind, is_free, rate_per_minute, duration_seconds, coins_charged, coins_refunded`,
    [callId, status]
  );
  if (!call) return null;

  const summary = callSummary({ ...call, status, end_reason: status });
  emitToUser(call.caller_id, 'call:ended', summary);
  emitToUser(call.callee_id, 'call:ended', summary);

  if (status === 'missed') {
    await notify(call.callee_id, 'call_missed', 'مكالمة فائتة', 'لديك مكالمة فائتة', {
      callId,
      kind: call.kind,
    });
    await notify(call.caller_id, 'call_no_answer', 'لا يوجد رد', 'لم يتم الرد على مكالمتك', {
      callId,
      kind: call.kind,
    });
  }
  return summary;
}

export async function rejectCall(callId: string, calleeId: string): Promise<CallSummary | null> {
  const call = await one<{ callee_id: string }>('SELECT callee_id FROM calls WHERE id = $1', [callId]);
  if (!call) throw new HttpError(404, 'Call not found', 'call_not_found');
  if (call.callee_id !== calleeId) throw new HttpError(403, 'Not your call', 'forbidden');
  return endRinging(callId, 'rejected');
}

export async function cancelCall(callId: string, callerId: string): Promise<CallSummary | null> {
  const call = await one<{ caller_id: string; status: string }>(
    'SELECT caller_id, status FROM calls WHERE id = $1',
    [callId]
  );
  if (!call) throw new HttpError(404, 'Call not found', 'call_not_found');
  if (call.caller_id !== callerId) throw new HttpError(403, 'Not your call', 'forbidden');
  // Already connected: "cancel" must still hang up and settle, never leave a call billing.
  if (call.status === 'accepted') return endCall(callId, callerId, 'ended');
  return endRinging(callId, 'cancelled');
}

export interface AcceptResult {
  callId: string;
  isFree: boolean;
  ratePerMinute: number;
  balance: number;
  acceptedAt: string;
}

/**
 * Callee accepts: a free attempt is consumed, or exactly one minute is reserved
 * (100 coins) before the call is allowed to start. No reservation => no call.
 */
export async function acceptCall(callId: string, calleeId: string): Promise<AcceptResult> {
  clearRingTimer(callId);
  const settings = await getSettings();

  const outcome = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM calls WHERE id = $1 FOR UPDATE', [callId]);
    const call = rows[0];
    if (!call) throw new HttpError(404, 'Call not found', 'call_not_found');
    if (call.callee_id !== calleeId) throw new HttpError(403, 'Not your call', 'forbidden');
    if (call.status !== 'ringing') {
      throw new HttpError(409, 'This call is no longer ringing', 'call_not_ringing');
    }

    const free = await getFreeCallState(call.caller_id);
    let isFree = false;
    if (free.enabled) {
      if (free.exempt) {
        isFree = true;
      } else if (free.remaining > 0) {
        isFree = await consumeFreeAttempt(
          c,
          call.caller_id,
          call.id,
          call.kind as CallKind,
          settings.free_calls_per_day,
          settings.free_calls_shared
        );
      }
    }

    if (isFree) {
      const updated = await c.query(
        `UPDATE calls SET status = 'accepted', is_free = true, accepted_at = now()
         WHERE id = $1 RETURNING accepted_at`,
        [call.id]
      );
      const wallet = await lockWallet(c, call.caller_id);
      return {
        acceptedAt: updated.rows[0].accepted_at as string,
        isFree: true,
        rate: call.rate_per_minute as number,
        balance: wallet.balance,
        failure: null as null | 'paid_disabled' | 'insufficient_balance',
        reserved: 0,
      };
    }

    if (!settings.paid_calls_enabled) {
      await c.query(
        `UPDATE calls SET status = 'failed', end_reason = 'paid_disabled', ended_at = now() WHERE id = $1`,
        [call.id]
      );
      return {
        acceptedAt: '',
        isFree: false,
        rate: call.rate_per_minute as number,
        balance: 0,
        failure: 'paid_disabled' as const,
        reserved: 0,
      };
    }

    const rate = call.rate_per_minute as number;
    const wallet = await lockWallet(c, call.caller_id);
    if (wallet.balance < rate) {
      await c.query(
        `UPDATE calls SET status = 'failed', end_reason = 'insufficient_balance', ended_at = now() WHERE id = $1`,
        [call.id]
      );
      return {
        acceptedAt: '',
        isFree: false,
        rate,
        balance: wallet.balance,
        failure: 'insufficient_balance' as const,
        reserved: 0,
      };
    }

    const session = await c.query(
      `INSERT INTO call_sessions (call_id, minute_index, coins_reserved)
       VALUES ($1, 1, $2) ON CONFLICT (call_id, minute_index) DO NOTHING RETURNING id`,
      [call.id, rate]
    );
    if (session.rowCount) {
      const moved = await moveCoins(c, {
        userId: call.caller_id,
        amount: -rate,
        type: 'call_reserve',
        refType: 'call_session',
        refId: session.rows[0].id,
        meta: { callId: call.id, minute: 1 },
      });
      await c.query('UPDATE wallets SET reserved = reserved + $2, updated_at = now() WHERE user_id = $1', [
        call.caller_id,
        rate,
      ]);
      await c.query(
        `UPDATE calls SET status = 'accepted', is_free = false, accepted_at = now() WHERE id = $1`,
        [call.id]
      );
      return {
        acceptedAt: new Date().toISOString(),
        isFree: false,
        rate,
        balance: moved.balanceAfter,
        failure: null as null | 'paid_disabled' | 'insufficient_balance',
        reserved: rate,
      };
    }
    return {
      acceptedAt: new Date().toISOString(),
      isFree: false,
      rate,
      balance: wallet.balance,
      failure: null as null | 'paid_disabled' | 'insufficient_balance',
      reserved: rate,
    };
  });

  const callRow = await one<{ caller_id: string }>('SELECT caller_id FROM calls WHERE id = $1', [callId]);

  if (outcome.failure) {
    const call = await one<{
      id: string;
      status: string;
      is_free: boolean;
      rate_per_minute: number;
      duration_seconds: number;
      coins_charged: number;
      coins_refunded: number;
      end_reason: string;
    }>('SELECT * FROM calls WHERE id = $1', [callId]);
    const summary = call
      ? callSummary(call, { endReason: outcome.failure, balance: outcome.balance })
      : null;
    if (summary) {
      emitToUser(calleeId, 'call:ended', summary);
      if (callRow) emitToUser(callRow.caller_id, 'call:ended', summary);
    }
    if (callRow) {
      await notify(
        callRow.caller_id,
        'call_failed',
        'تعذر بدء المكالمة',
        outcome.failure === 'insufficient_balance'
          ? 'رصيد الكونز غير كافٍ لبدء المكالمة'
          : 'المكالمات المدفوعة معطلة حالياً',
        { callId }
      );
    }
    throw new HttpError(
      402,
      outcome.failure === 'insufficient_balance'
        ? 'The caller does not have enough coins for this call'
        : 'Paid calls are currently disabled',
      outcome.failure
    );
  }

  if (callRow) {
    active.set(callId, {
      callId,
      callerId: callRow.caller_id,
      calleeId,
      rate: outcome.rate,
      isFree: outcome.isFree,
      startedAt: new Date(outcome.acceptedAt).getTime(),
      reservedMinutes: outcome.reserved > 0 ? 1 : 0,
      balance: outcome.balance,
    });

    emitToUser(callRow.caller_id, 'call:accepted', {
      callId,
      isFree: outcome.isFree,
      ratePerMinute: outcome.rate,
      balance: outcome.balance,
      acceptedAt: outcome.acceptedAt,
      peer: await getPublicUser(calleeId),
    });
    emitToUser(calleeId, 'call:accepted', {
      callId,
      isFree: outcome.isFree,
      ratePerMinute: outcome.rate,
      balance: outcome.balance,
      acceptedAt: outcome.acceptedAt,
      peer: await getPublicUser(callRow.caller_id),
    });
  }

  const finalCaller = callRow?.caller_id;
  if (finalCaller) {
    await pushFreeState(finalCaller);
    const free = await getFreeCallState(finalCaller);
    if (free.remaining === 1 && free.enabled) {
      await notify(
        finalCaller,
        'free_calls_last',
        'تنبيه: آخر محاولة مجانية',
        'هذه آخر محاولة مجانية اليوم، المكالمة التالية ستكون مقابل 100 كونز للدقيقة',
        { remaining: 1 }
      );
    } else if (free.remaining === 0 && free.enabled) {
      await notify(
        finalCaller,
        'free_calls_exhausted',
        'انتهت المحاولات المجانية',
        'يمكنك متابعة الاتصال مقابل 100 كونز للدقيقة',
        { remaining: 0 }
      );
    }
  }

  return {
    callId,
    isFree: outcome.isFree,
    ratePerMinute: outcome.rate,
    balance: outcome.balance,
    acceptedAt: outcome.acceptedAt,
  };
}

async function reserveMinute(entry: ActiveCall, minuteIndex: number) {
  return tx(async (c) => {
    const { rows } = await c.query('SELECT status FROM calls WHERE id = $1 FOR UPDATE', [entry.callId]);
    if (!rows[0] || rows[0].status !== 'accepted') return { ok: false, balance: entry.balance };
    const wallet = await lockWallet(c, entry.callerId);
    if (wallet.balance < entry.rate) return { ok: false, balance: wallet.balance };
    const session = await c.query(
      `INSERT INTO call_sessions (call_id, minute_index, coins_reserved)
       VALUES ($1, $2, $3) ON CONFLICT (call_id, minute_index) DO NOTHING RETURNING id`,
      [entry.callId, minuteIndex, entry.rate]
    );
    if (!session.rowCount) return { ok: true, balance: wallet.balance };
    const moved = await moveCoins(c, {
      userId: entry.callerId,
      amount: -entry.rate,
      type: 'call_reserve',
      refType: 'call_session',
      refId: session.rows[0].id,
      meta: { callId: entry.callId, minute: minuteIndex },
    });
    await c.query('UPDATE wallets SET reserved = reserved + $2, updated_at = now() WHERE user_id = $1', [
      entry.callerId,
      entry.rate,
    ]);
    return { ok: true, balance: moved.balanceAfter };
  });
}

/** Ends a call and settles it: pro-rata charge, refund of unused reservation, earnings split. */
export async function endCall(
  callId: string,
  actorId: string | null,
  reason: string
): Promise<CallSummary> {
  clearRingTimer(callId);
  const settings = await getSettings();

  const outcome = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM calls WHERE id = $1 FOR UPDATE', [callId]);
    const call = rows[0];
    if (!call) throw new HttpError(404, 'Call not found', 'call_not_found');
    if (actorId && actorId !== call.caller_id && actorId !== call.callee_id) {
      throw new HttpError(403, 'Not your call', 'forbidden');
    }
    if (call.status !== 'ringing' && call.status !== 'accepted') {
      return { call, summary: null, earnings: 0 };
    }
    if (call.status === 'ringing') {
      const status = reason === 'rejected' ? 'rejected' : reason === 'cancelled' ? 'cancelled' : 'ended';
      const updated = await c.query(
        `UPDATE calls SET status = $2, end_reason = $3, ended_at = now() WHERE id = $1 RETURNING *`,
        [callId, status, reason]
      );
      return { call: updated.rows[0], summary: callSummary(updated.rows[0]), earnings: 0 };
    }

    const acceptedAt = new Date(call.accepted_at).getTime();
    const durationSeconds = Math.max(0, Math.floor((Date.now() - acceptedAt) / 1000));
    const reservedRow = await c.query(
      'SELECT COALESCE(SUM(coins_reserved), 0)::int AS reserved FROM call_sessions WHERE call_id = $1',
      [callId]
    );
    const reserved = Number(reservedRow.rows[0].reserved || 0);

    let charged = 0;
    let refunded = 0;
    let balance = 0;
    let earnings = 0;

    if (!call.is_free && reserved > 0) {
      charged =
        durationSeconds <= 0
          ? 0
          : Math.min(reserved, Math.ceil((durationSeconds * call.rate_per_minute) / 60));
      refunded = reserved - charged;

      if (refunded > 0) {
        const moved = await moveCoins(c, {
          userId: call.caller_id,
          amount: refunded,
          type: 'call_refund',
          refType: 'call',
          refId: callId,
          meta: { durationSeconds, reserved, charged },
        });
        balance = moved.balanceAfter;
      }
      const walletRow = await c.query('SELECT balance FROM wallets WHERE user_id = $1', [
        call.caller_id,
      ]);
      balance = walletRow.rows[0]?.balance ?? balance;

      if (charged > 0) {
        await recordLedger(c, {
          userId: call.caller_id,
          amount: -charged,
          type: 'call_charge',
          refType: 'call',
          refId: callId,
          balanceAfter: balance,
          meta: { durationSeconds, ratePerMinute: call.rate_per_minute },
        });
      }
      await c.query(
        `UPDATE wallets SET reserved = GREATEST(reserved - $2, 0), spent = spent + $3, updated_at = now()
         WHERE user_id = $1`,
        [call.caller_id, reserved, charged]
      );
      await c.query(
        'UPDATE call_sessions SET settled_at = now(), coins_charged = coins_reserved WHERE call_id = $1 AND settled_at IS NULL',
        [callId]
      );

      if (charged > 0) {
        const hostCoins = Math.floor((charged * settings.host_percent) / 100);
        const adminCoins = charged - hostCoins;
        const earningRow = await c.query(
          `INSERT INTO earnings (user_id, call_id, coins, percent)
           VALUES ($1, $2, $3, $4) ON CONFLICT (call_id) DO NOTHING RETURNING id`,
          [call.callee_id, callId, hostCoins, settings.host_percent]
        );
        if (earningRow.rowCount && hostCoins > 0) {
          await moveCoins(c, {
            userId: call.callee_id,
            amount: hostCoins,
            type: 'earning',
            refType: 'call',
            refId: callId,
            meta: { percent: settings.host_percent, charged },
          });
          await c.query('UPDATE wallets SET earned = earned + $2, updated_at = now() WHERE user_id = $1', [
            call.callee_id,
            hostCoins,
          ]);
          earnings = hostCoins;
        }
        await c.query(
          `INSERT INTO admin_earnings (call_id, coins, percent) VALUES ($1, $2, $3)
           ON CONFLICT (call_id) DO NOTHING`,
          [callId, adminCoins, settings.admin_percent]
        );
      }
    } else if (reserved > 0) {
      // Free call that still had a reservation (rate changed mid-call) — release it.
      await moveCoins(c, {
        userId: call.caller_id,
        amount: reserved,
        type: 'call_refund',
        refType: 'call',
        refId: callId,
        meta: { reason: 'free_call' },
      });
      await c.query(
        'UPDATE wallets SET reserved = GREATEST(reserved - $2, 0), updated_at = now() WHERE user_id = $1',
        [call.caller_id, reserved]
      );
      await c.query('UPDATE call_sessions SET settled_at = now() WHERE call_id = $1 AND settled_at IS NULL', [
        callId,
      ]);
    }

    const updated = await c.query(
      `UPDATE calls SET status = 'ended', ended_at = now(), duration_seconds = $2,
         coins_charged = $3, coins_refunded = $4, end_reason = $5
       WHERE id = $1 RETURNING *`,
      [callId, durationSeconds, charged, refunded, reason]
    );
    // Always report the caller's real remaining balance (free calls included).
    const walletAfter = await c.query('SELECT balance FROM wallets WHERE user_id = $1', [
      call.caller_id,
    ]);
    const callerBalance = walletAfter.rows[0]?.balance ?? balance;
    return {
      call: updated.rows[0],
      summary: callSummary(updated.rows[0], { balance: callerBalance, earnings }),
      earnings,
    };
  });

  active.delete(callId);
  const summary = outcome.summary;
  if (!summary) {
    return callSummary(outcome.call);
  }

  emitToUser(outcome.call.caller_id, 'call:ended', summary);
  emitToUser(outcome.call.callee_id, 'call:ended', summary);

  await notify(
    outcome.call.caller_id,
    'call_ended',
    'انتهت المكالمة',
    summary.isFree
      ? 'كانت هذه المكالمة مجانية'
      : `تم خصم ${summary.coinsCharged} كونز مقابل ${summary.durationSeconds} ثانية`,
    { ...summary }
  );
  if (summary.earnings > 0) {
    await notify(
      outcome.call.callee_id,
      'earning_received',
      'أرباح مكالمة',
      `أضيف ${summary.earnings} كونز إلى محفظتك`,
      { callId, coins: summary.earnings }
    );
  }

  await pushFreeState(outcome.call.caller_id);
  return summary;
}

export function isInActiveCall(callId: string): boolean {
  return active.has(callId);
}

export function activeCallFor(userId: string): string | null {
  for (const entry of active.values()) {
    if (entry.callerId === userId || entry.calleeId === userId) return entry.callId;
  }
  return null;
}

export function startBillingLoop(): void {
  setInterval(() => {
    void tick();
  }, 1000);
}

async function tick(): Promise<void> {
  const now = Date.now();
  for (const entry of [...active.values()]) {
    try {
      const elapsed = Math.max(0, Math.floor((now - entry.startedAt) / 1000));
      if (!entry.isFree) {
        const needed = Math.floor(elapsed / 60) + 1;
        while (entry.reservedMinutes < needed) {
          const nextIndex = entry.reservedMinutes + 1;
          const result = await reserveMinute(entry, nextIndex);
          if (!result.ok) {
            await endCall(entry.callId, null, 'insufficient_balance');
            break;
          }
          entry.reservedMinutes = nextIndex;
          entry.balance = result.balance;
        }
        if (!active.has(entry.callId)) continue;
      }
      const cost = entry.isFree
        ? 0
        : Math.min(
            entry.reservedMinutes * entry.rate,
            Math.ceil((elapsed * entry.rate) / 60)
          );
      const payload = {
        callId: entry.callId,
        elapsedSeconds: elapsed,
        cost,
        isFree: entry.isFree,
        balance: entry.balance,
        reservedMinutes: entry.reservedMinutes,
      };
      emitToUser(entry.callerId, 'call:tick', payload);
      emitToUser(entry.calleeId, 'call:tick', payload);
    } catch (error) {
      console.error('[calls] billing tick failed', (error as Error).message);
    }
  }
}

/** After a restart, in-flight calls are closed and every unspent reservation refunded. */
export async function recoverStaleCalls(): Promise<void> {
  const rows = await q<{ id: string; caller_id: string; is_free: boolean }>(
    "SELECT id, caller_id, is_free FROM calls WHERE status IN ('ringing', 'accepted')"
  );
  for (const row of rows) {
    try {
      await tx(async (c) => {
        const reservedRow = await c.query(
          `SELECT COALESCE(SUM(coins_reserved), 0)::int AS reserved FROM call_sessions
           WHERE call_id = $1 AND settled_at IS NULL`,
          [row.id]
        );
        const reserved = Number(reservedRow.rows[0].reserved || 0);
        if (!row.is_free && reserved > 0) {
          await moveCoins(c, {
            userId: row.caller_id,
            amount: reserved,
            type: 'call_refund',
            refType: 'call',
            refId: row.id,
            meta: { reason: 'server_restart' },
          });
          await c.query(
            'UPDATE wallets SET reserved = GREATEST(reserved - $2, 0), updated_at = now() WHERE user_id = $1',
            [row.caller_id, reserved]
          );
          await c.query(
            'UPDATE call_sessions SET settled_at = now() WHERE call_id = $1 AND settled_at IS NULL',
            [row.id]
          );
        }
        await c.query(
          `UPDATE calls SET status = 'ended', end_reason = 'server_restart', ended_at = now() WHERE id = $1`,
          [row.id]
        );
      });
    } catch (error) {
      console.error('[calls] recovery failed', row.id, (error as Error).message);
    }
  }
  if (rows.length) console.log(`[calls] closed ${rows.length} stale call(s)`);
}
