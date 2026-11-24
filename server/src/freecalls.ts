import type { PoolClient } from 'pg';
import { one } from './db';
import { getSettings } from './settings';
import { iraqDateStr, nextIraqMidnight } from './utils';

export type CallKind = 'voice' | 'video';

export interface FreeCallState {
  enabled: boolean;
  perDay: number;
  used: number;
  voiceUsed: number;
  videoUsed: number;
  remaining: number;
  voiceRemaining: number;
  videoRemaining: number;
  shared: boolean;
  exempt: boolean;
  usageDate: string;
  nextResetAt: string;
}

/**
 * Free attempts are counted on the server, per user per Baghdad calendar day.
 * The device clock is never part of the calculation.
 */
export async function getFreeCallState(userId: string): Promise<FreeCallState> {
  const settings = await getSettings();
  const usageDate = iraqDateStr();
  const row = await one<{
    attempts_used: number;
    voice_used: number;
    video_used: number;
  }>(
    'SELECT attempts_used, voice_used, video_used FROM daily_free_calls WHERE user_id = $1 AND usage_date = $2',
    [userId, usageDate]
  );

  const perDay = settings.free_calls_per_day;
  const used = row?.attempts_used ?? 0;
  const voiceUsed = row?.voice_used ?? 0;
  const videoUsed = row?.video_used ?? 0;
  const exempt = (settings.free_calls_exempt_user_ids || []).includes(userId);
  const voiceRemaining = exempt ? perDay : Math.max(0, perDay - voiceUsed);
  const videoRemaining = exempt ? perDay : Math.max(0, perDay - videoUsed);
  const sharedRemaining = exempt ? perDay : Math.max(0, perDay - used);

  return {
    enabled: settings.free_calls_enabled,
    perDay,
    used,
    voiceUsed,
    videoUsed,
    remaining: settings.free_calls_shared ? sharedRemaining : Math.min(voiceRemaining, videoRemaining),
    voiceRemaining,
    videoRemaining,
    shared: settings.free_calls_shared,
    exempt,
    usageDate,
    nextResetAt: nextIraqMidnight().toISOString(),
  };
}

/**
 * Atomically consumes one free attempt for an accepted call.
 * Returns false when the allowance is already used up — never over-consumes.
 */
export async function consumeFreeAttempt(
  c: PoolClient,
  userId: string,
  callId: string,
  kind: CallKind,
  perDay: number,
  shared: boolean
): Promise<boolean> {
  if (perDay < 1) return false;
  const usageDate = iraqDateStr();
  const voiceIncrement = kind === 'voice' ? 1 : 0;
  const videoIncrement = kind === 'video' ? 1 : 0;

  const result = await c.query(
    `INSERT INTO daily_free_calls (user_id, usage_date, attempts_used, voice_used, video_used)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (user_id, usage_date) DO UPDATE
       SET attempts_used = daily_free_calls.attempts_used + 1,
           voice_used = daily_free_calls.voice_used + $3,
           video_used = daily_free_calls.video_used + $4,
           updated_at = now()
       WHERE (
         CASE WHEN $5::boolean
              THEN daily_free_calls.attempts_used
              ELSE (CASE WHEN $3 = 1 THEN daily_free_calls.voice_used ELSE daily_free_calls.video_used END)
         END
       ) < $6
     RETURNING attempts_used`,
    [userId, usageDate, voiceIncrement, videoIncrement, shared, perDay]
  );
  if (!result.rowCount) return false;

  // One free attempt can never be linked to two calls.
  const link = await c.query(
    `INSERT INTO free_call_uses (call_id, user_id, usage_date) VALUES ($1, $2, $3)
     ON CONFLICT (call_id) DO NOTHING RETURNING call_id`,
    [callId, userId, usageDate]
  );
  if (!link.rowCount) {
    throw new Error('free attempt already consumed for this call');
  }
  return true;
}
